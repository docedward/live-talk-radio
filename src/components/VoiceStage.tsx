"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useConnectionState,
  useRoomContext,
} from "@livekit/components-react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  DefaultReconnectPolicy,
} from "livekit-client";
import { fetchVoiceToken } from "@/lib/api";
import { isHostSfxId, playHostSfx, unlockHostSfx } from "@/lib/host-sfx";
import { SpeakingStrip } from "./SpeakingStrip";

type Props = {
  roomId: string;
  /** Host or on panel — LiveKit publish-capable token. */
  canPublish: boolean;
  enabled: boolean;
  /** One-way host mute (mic off; still hear room). */
  hostMuted?: boolean;
};

function isProbablyMobile() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

const roomOptions = {
  // Critical: don't kill voice when phone backgrounds the tab
  disconnectOnPageLeave: false,
  adaptiveStream: true,
  dynacast: true,
  stopLocalTrackOnUnpublish: false,
  // Mix into WebAudio — more reliable after interruptions on mobile
  webAudioMix: true,
  reconnectPolicy: new DefaultReconnectPolicy(),
};

const connectOptions = {
  autoSubscribe: true,
  maxRetries: 8,
  peerConnectionTimeout: 30_000,
  websocketTimeout: 30_000,
};

/**
 * Live voice with keep-alive: survive tunnel blips, tab sleep, and brief
 * network drops without blacking out the whole page.
 */
export function VoiceStage({
  roomId,
  canPublish,
  enabled,
  hostMuted = false,
}: Props) {
  const [started, setStarted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [tokenCanPublish, setTokenCanPublish] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connectNonce, setConnectNonce] = useState(0);
  const hadToken = useRef(false);

  const secure = useMemo(() => {
    if (typeof window === "undefined") return true;
    return window.isSecureContext;
  }, []);

  const mobile = useMemo(() => isProbablyMobile(), []);

  const refreshToken = useCallback(
    async (opts?: { force?: boolean }) => {
      setLoading(true);
      if (opts?.force) setLoadError(null);
      try {
        const result = await fetchVoiceToken(roomId);
        setToken(result.token);
        setUrl(result.url);
        setTokenCanPublish(result.canPublish);
        setLoadError(null);
        hadToken.current = true;
      } catch (err) {
        // Keep last good token so a blip does not tear down LiveKit
        if (!hadToken.current) {
          setToken(null);
          setUrl(null);
        }
        setLoadError(
          err instanceof Error ? err.message : "Could not start voice"
        );
      } finally {
        setLoading(false);
      }
    },
    [roomId]
  );

  useEffect(() => {
    if (!enabled || !started) return;
    void refreshToken();
  }, [enabled, started, canPublish, refreshToken]);

  // Soft token refresh while live (session stays warm)
  useEffect(() => {
    if (!enabled || !started || !hadToken.current) return;
    const id = setInterval(() => {
      void refreshToken();
    }, 4 * 60 * 1000);
    return () => clearInterval(id);
  }, [enabled, started, refreshToken]);

  // Wake lock: try to stop the phone from sleeping mid-show
  useEffect(() => {
    if (!started || typeof navigator === "undefined") return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock?.request) return;
    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    async function lock() {
      try {
        sentinel = await nav.wakeLock!.request("screen");
      } catch {
        /* unsupported / denied */
      }
    }

    void lock();
    const onVis = () => {
      if (document.visibilityState === "visible" && !cancelled) void lock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void sentinel?.release();
    };
  }, [started]);

  if (!enabled) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Voice is off on this server (no LiveKit keys). Text chat and On Air
        status still work.
      </div>
    );
  }

  if (!secure) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="font-semibold">Voice needs a secure link (HTTPS)</p>
        <p className="mt-1">
          Open the public <strong>https://</strong> link (not localhost or
          192.168…).
        </p>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-900 dark:bg-emerald-950/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
          Live voice
        </p>
        <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Tap once to stay connected to the show
          {canPublish ? " with your mic" : ""}.
        </p>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Keep this tab open. If the screen sleeps, open the tab again — voice
          will try to reconnect automatically.
        </p>
        <button
          type="button"
          onClick={() => {
            void unlockHostSfx();
            setStarted(true);
          }}
          className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 sm:w-auto"
        >
          {canPublish ? "Start live voice (mic)" : "Enable live sound"}
        </button>
      </div>
    );
  }

  // First connect only — never unmount the room for soft errors
  if (!token || !url) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        {loading ? "Connecting voice…" : loadError || "Connecting voice…"}
        {loadError && (
          <button
            type="button"
            onClick={() => void refreshToken({ force: true })}
            className="mt-2 block min-h-11 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {loadError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Control blip: {loadError}. Voice stays up if possible.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              void refreshToken({ force: true });
              setConnectNonce((n) => n + 1);
            }}
          >
            Reconnect
          </button>
        </div>
      )}
      <LiveKitRoom
        // Stable key — only force remount on manual reconnect nonce
        key={`${roomId}-${tokenCanPublish ? "pub" : "sub"}-${connectNonce}`}
        token={token}
        serverUrl={url}
        connect
        audio={false}
        video={false}
        options={roomOptions}
        connectOptions={connectOptions}
        onError={(err) => {
          // Soft error banner — do not unmount room / black screen
          setLoadError(err.message);
        }}
        onDisconnected={() => {
          setLoadError("Voice disconnected — reconnecting…");
          // Pull fresh token and remount connection
          void refreshToken({ force: true }).then(() => {
            setConnectNonce((n) => n + 1);
          });
        }}
        className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40"
      >
        <RoomAudioRenderer />
        <LiveKitSfxListener />
        <VoiceKeepAlive
          roomId={roomId}
          canPublish={tokenCanPublish}
          hostMuted={hostMuted}
          onNeedReconnect={() => {
            void refreshToken({ force: true }).then(() => {
              setConnectNonce((n) => n + 1);
            });
          }}
        />
        <VoiceChrome
          canPublish={tokenCanPublish}
          hostMuted={hostMuted}
          mobile={mobile}
        />
        <SpeakingStrip />
      </LiveKitRoom>
    </div>
  );
}

/** Keep control session + audio alive across sleep / background / blips. */
function VoiceKeepAlive({
  roomId,
  canPublish,
  hostMuted,
  onNeedReconnect,
}: {
  roomId: string;
  canPublish: boolean;
  hostMuted: boolean;
  onNeedReconnect: () => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  // Heartbeat TRL API so we are not pruned as "gone"
  useEffect(() => {
    let cancelled = false;
    async function beat() {
      try {
        await fetchVoiceToken(roomId);
      } catch {
        /* soft */
      }
    }
    const id = setInterval(() => {
      if (!cancelled) void beat();
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomId]);

  // On tab visible again: resume audio + re-enable mic if needed
  useEffect(() => {
    if (!room) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void unlockHostSfx();
      // Resume remote audio elements
      document.querySelectorAll("audio").forEach((el) => {
        void (el as HTMLAudioElement).play().catch(() => undefined);
      });
      if (
        room.state !== ConnectionState.Connected &&
        room.state !== ConnectionState.Connecting &&
        room.state !== ConnectionState.Reconnecting
      ) {
        onNeedReconnect();
        return;
      }
      if (canPublish && !hostMuted && localParticipant) {
        void localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    window.addEventListener("online", onVisible);

    const onDisc = () => {
      // LiveKit exhausted reconnect — force our remount path
      setTimeout(() => onNeedReconnect(), 500);
    };
    room.on(RoomEvent.Disconnected, onDisc);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("online", onVisible);
      room.off(RoomEvent.Disconnected, onDisc);
    };
  }, [room, canPublish, hostMuted, localParticipant, onNeedReconnect]);

  return null;
}

function LiveKitSfxListener() {
  const room = useRoomContext();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!room) return;

    const onData = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string
    ) => {
      if (topic && topic !== "trl-sfx") return;
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload)) as {
          type?: string;
          sound?: string;
          id?: string;
        };
        if (msg.type !== "sfx" || !msg.sound || !isHostSfxId(msg.sound)) return;
        const sound = msg.sound;
        if (msg.id && seen.current.has(msg.id)) return;
        if (msg.id) {
          seen.current.add(msg.id);
          if (seen.current.size > 40) {
            seen.current = new Set([...seen.current].slice(-20));
          }
        }
        void unlockHostSfx().then(() => playHostSfx(sound));
      } catch {
        /* ignore */
      }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);

  return null;
}

function VoiceChrome({
  canPublish,
  hostMuted,
  mobile,
}: {
  canPublish: boolean;
  hostMuted: boolean;
  mobile: boolean;
}) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [micError, setMicError] = useState<string | null>(null);
  const [audioHint, setAudioHint] = useState(mobile);
  const [remoteAudioCount, setRemoteAudioCount] = useState(0);

  const connected = connectionState === ConnectionState.Connected;
  const connecting =
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting;

  // Count remote audio tracks (are we actually receiving anyone?)
  useEffect(() => {
    if (!room) return;
    const recount = () => {
      let n = 0;
      room.remoteParticipants.forEach((p) => {
        p.audioTrackPublications.forEach((pub) => {
          if (pub.track && !pub.isMuted) n += 1;
        });
      });
      setRemoteAudioCount(n);
    };
    recount();
    room.on(RoomEvent.TrackSubscribed, recount);
    room.on(RoomEvent.TrackUnsubscribed, recount);
    room.on(RoomEvent.TrackMuted, recount);
    room.on(RoomEvent.TrackUnmuted, recount);
    room.on(RoomEvent.ParticipantConnected, recount);
    room.on(RoomEvent.ParticipantDisconnected, recount);
    return () => {
      room.off(RoomEvent.TrackSubscribed, recount);
      room.off(RoomEvent.TrackUnsubscribed, recount);
      room.off(RoomEvent.TrackMuted, recount);
      room.off(RoomEvent.TrackUnmuted, recount);
      room.off(RoomEvent.ParticipantConnected, recount);
      room.off(RoomEvent.ParticipantDisconnected, recount);
    };
  }, [room]);

  // When a remote track arrives, try to play all <audio> elements (autoplay policy)
  useEffect(() => {
    if (!room) return;
    const kick = () => {
      document.querySelectorAll("audio").forEach((el) => {
        const a = el as HTMLAudioElement;
        a.muted = false;
        a.volume = 1;
        void a.play().catch(() => undefined);
      });
    };
    room.on(RoomEvent.TrackSubscribed, kick);
    return () => {
      room.off(RoomEvent.TrackSubscribed, kick);
    };
  }, [room]);

  useEffect(() => {
    if (!connected || !canPublish || !localParticipant) return;
    if (hostMuted) return;
    if (isMicrophoneEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        await localParticipant.setMicrophoneEnabled(true);
      } catch {
        if (!cancelled) {
          setMicError(
            mobile
              ? "Tap Unmute and allow the microphone."
              : "Allow the microphone, then tap Unmute."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    connected,
    canPublish,
    hostMuted,
    localParticipant,
    isMicrophoneEnabled,
    mobile,
  ]);

  useEffect(() => {
    if (!localParticipant) return;
    if ((!canPublish || hostMuted) && isMicrophoneEnabled) {
      void localParticipant.setMicrophoneEnabled(false);
    }
  }, [canPublish, hostMuted, isMicrophoneEnabled, localParticipant]);

  async function toggleMute() {
    if (!localParticipant || !canPublish || hostMuted) return;
    setMicError(null);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      setMicError("Could not access the microphone.");
    }
  }

  async function pokeAudio() {
    setAudioHint(false);
    await unlockHostSfx();
    try {
      const els = document.querySelectorAll("audio");
      for (const el of els) {
        const a = el as HTMLAudioElement;
        a.muted = false;
        a.volume = 1;
        try {
          await a.play();
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  let statusLabel = "Voice off";
  if (connecting) statusLabel = "Connecting / reconnecting…";
  else if (connected && canPublish && hostMuted)
    statusLabel = "Host muted your mic — you can still hear the room";
  else if (connected && canPublish && isMicrophoneEnabled)
    statusLabel = "YOUR MIC IS ON — others should hear you when you talk";
  else if (connected && canPublish && !isMicrophoneEnabled)
    statusLabel = "YOUR MIC IS OFF — tap Unmute or others hear silence";
  else if (connected && !canPublish)
    statusLabel =
      remoteAudioCount > 0
        ? `Listening — ${remoteAudioCount} live mic(s) in room (tap Replay if silent)`
        : "Listening — no one else has mic on yet";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Live voice
          </p>
          <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {statusLabel}
          </p>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            One-way audio is usually: host mic off, or listener needs{" "}
            <strong>Replay room audio</strong>.
          </p>
        </div>
        {canPublish && !hostMuted && (
          <button
            type="button"
            onClick={() => void toggleMute()}
            disabled={!connected}
            className={`min-h-11 min-w-[5.5rem] rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 ${
              isMicrophoneEnabled
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-amber-500 text-white"
            }`}
          >
            {isMicrophoneEnabled ? "Mute" : "Unmute"}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => void pokeAudio()}
        className="min-h-11 w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-100 sm:w-auto"
      >
        {audioHint ? "Tap if you hear nothing" : "Replay room audio"}
      </button>

      {micError && (
        <p className="text-xs text-red-700 dark:text-red-300">{micError}</p>
      )}
      {connected && canPublish && !isMicrophoneEnabled && !hostMuted && (
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          You can hear others, but they cannot hear you until your mic is on.
          Tap <strong>Unmute</strong> and allow the microphone.
        </p>
      )}
      {connected && canPublish && hostMuted && (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          The host muted your microphone. You should still hear the show.
        </p>
      )}
    </div>
  );
}
