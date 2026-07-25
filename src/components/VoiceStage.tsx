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
  Track,
  DefaultReconnectPolicy,
  type LocalParticipant,
  type LocalTrackPublication,
} from "livekit-client";
import { fetchVoiceToken } from "@/lib/api";
import { isHostSfxId, playHostSfx } from "@/lib/host-sfx";
import { claimSfxEventId, isHostLocalSfxQuietPeriod } from "@/lib/sfx-dedupe";
import {
  applyOutputMuteToDom,
  isRoomOutputMuted,
  resumeRoomPlayback,
  subscribeRoomAudio,
  toggleRoomOutputMuted,
  unlockRoomAudio,
} from "@/lib/room-audio";
import {
  registerActiveClipStop,
  setClipPublisher,
} from "@/lib/clip-publish-bus";
import { receiveEmote, setEmoteSender } from "@/lib/emote-bus";
import {
  loadMicFilter,
  MIC_FILTER_OPTIONS,
  saveMicFilter,
  startMicFilterSession,
  type MicFilterId,
  type MicFilterSession,
} from "@/lib/mic-filter";
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

/** Mute remote LiveKit audio (works with webAudioMix too). */
function applySpeakerVolume(room: Room, muted: boolean) {
  const vol = muted ? 0 : 1;
  room.remoteParticipants.forEach((p) => {
    p.audioTrackPublications.forEach((pub) => {
      const t = pub.track as { setVolume?: (v: number) => void } | undefined;
      t?.setVolume?.(vol);
    });
  });
}

/**
 * Live voice — starts automatically after join (no “Enable live sound”).
 * Listeners hear host + board; one Mute turns off speakers.
 * Publishers also get mic Mute / Restart.
 */
export function VoiceStage({
  roomId,
  canPublish,
  enabled,
  hostMuted = false,
}: Props) {
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

  // Auto-connect as soon as voice is available (join already unlocked audio)
  useEffect(() => {
    if (!enabled) return;
    void unlockRoomAudio();
    void refreshToken();
  }, [enabled, canPublish, refreshToken]);

  // Soft token refresh while live (session stays warm)
  useEffect(() => {
    if (!enabled || !hadToken.current) return;
    const id = setInterval(() => {
      void refreshToken();
    }, 4 * 60 * 1000);
    return () => clearInterval(id);
  }, [enabled, refreshToken]);

  // Wake lock: try to stop the phone from sleeping mid-show
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return;
    const nav = navigator as Navigator & {
      wakeLock?: {
        request: (t: "screen") => Promise<{ release: () => Promise<void> }>;
      };
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
  }, [enabled]);

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
      <div className="rounded-xl border border-[#d4a574] bg-[#f3e0c8] px-4 py-3 text-sm text-[#1c1410]">
        <p className="font-semibold">Voice needs HTTPS</p>
        <p className="mt-1">
          Open the app with an <strong>https://</strong> link (not localhost).
        </p>
      </div>
    );
  }

  // First connect only — never unmount the room for soft errors
  if (!token || !url) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        {loading ? "Connecting live sound…" : loadError || "Connecting live sound…"}
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
        <div className="rounded-xl border border-[#d4a574] bg-[#f3e0c8] px-3 py-2 text-xs text-[#1c1410]">
          Control blip: {loadError}. Voice should stay up.{" "}
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
        // Always false — we control the mic only via Mute/Unmute/Restart.
        // audio={true} was re-enabling the mic after every Mute (stuck black button).
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
        <ClipPublisherBridge canPublish={tokenCanPublish} />
        <EmoteDataBridge />
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

/**
 * Registers a LiveKit publisher so Host Clip Board can inject prerecorded
 * audio into the room (outside the LiveKitRoom React tree).
 * Mic stays live so host can talk over the clip (VO / intro over ad).
 */
function ClipPublisherBridge({ canPublish }: { canPublish: boolean }) {
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();
  const connected = connectionState === ConnectionState.Connected;

  useEffect(() => {
    if (!canPublish || !connected || !localParticipant) {
      setClipPublisher(null);
      registerActiveClipStop(null);
      return;
    }

    setClipPublisher(async (buffer: AudioBuffer) => {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) throw new Error("Web Audio not supported");
      const ac = new AC();
      await ac.resume().catch(() => undefined);

      const dest = ac.createMediaStreamDestination();
      const src = ac.createBufferSource();
      let playBuf = buffer;
      if (buffer.sampleRate !== ac.sampleRate) {
        const frames = Math.ceil(buffer.duration * ac.sampleRate);
        const offline = new OfflineAudioContext(1, frames, ac.sampleRate);
        const ob = offline.createBuffer(1, buffer.length, buffer.sampleRate);
        const ch = ob.getChannelData(0);
        const srcCh = buffer.getChannelData(0);
        const n = Math.min(ch.length, srcCh.length);
        for (let i = 0; i < n; i++) ch[i] = srcCh[i]!;
        const os = offline.createBufferSource();
        os.buffer = ob;
        os.connect(offline.destination);
        os.start();
        playBuf = await offline.startRendering();
      }

      src.buffer = playBuf;
      const g = ac.createGain();
      // Slightly under unity so host voice can sit on top without clipping
      g.gain.value = 0.85;
      src.connect(g);
      g.connect(dest);
      g.connect(ac.destination);

      const mediaTrack = dest.stream.getAudioTracks()[0];
      if (!mediaTrack) {
        void ac.close().catch(() => undefined);
        throw new Error("Could not create clip track");
      }

      let publication: LocalTrackPublication | undefined;
      try {
        publication = await localParticipant.publishTrack(mediaTrack, {
          name: "trl-clip",
          source: Track.Source.Unknown,
        });
      } catch (err) {
        void ac.close().catch(() => undefined);
        throw err instanceof Error
          ? err
          : new Error("Could not publish clip to room");
      }

      let settled = false;
      const finish = async () => {
        if (settled) return;
        settled = true;
        registerActiveClipStop(null);
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
        try {
          if (publication?.track) {
            await localParticipant.unpublishTrack(publication.track);
          } else {
            await localParticipant.unpublishTrack(mediaTrack);
          }
        } catch {
          /* ignore */
        }
        try {
          mediaTrack.stop();
        } catch {
          /* ignore */
        }
        void ac.close().catch(() => undefined);
      };

      registerActiveClipStop(() => {
        void finish();
      });

      await new Promise<void>((resolve, reject) => {
        src.onended = () => resolve();
        try {
          src.start();
        } catch (err) {
          reject(err);
        }
      });

      await finish();
    });

    return () => {
      setClipPublisher(null);
      registerActiveClipStop(null);
    };
  }, [canPublish, connected, localParticipant]);

  return null;
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
      void resumeRoomPlayback();
      if (
        room.state !== ConnectionState.Connected &&
        room.state !== ConnectionState.Connecting &&
        room.state !== ConnectionState.Reconnecting
      ) {
        onNeedReconnect();
        return;
      }
      // Do not force-unmute mic here — that fought the Mute button.
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

  useEffect(() => {
    if (!room) return;

    const onData = (
      payload: Uint8Array,
      participant?: { isLocal?: boolean } | null,
      _kind?: unknown,
      topic?: string
    ) => {
      if (topic && topic !== "trl-sfx" && topic !== "trl-emote") return;
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload)) as {
          type?: string;
          sound?: string;
          id?: string;
          emoji?: string;
          from?: string;
        };
        if (msg.type === "emote" && msg.emoji) {
          // Local sender already spawned float via sendEmote
          if (participant?.isLocal) return;
          receiveEmote(msg.emoji, msg.from || "guest");
          return;
        }
        if (topic === "trl-emote") return;
        if (msg.type !== "sfx" || !msg.sound) return;
        const soundId = msg.sound;
        if (!isHostSfxId(soundId)) return;
        // Host already played on button press (server sendData is not "local")
        if (participant?.isLocal || isHostLocalSfxQuietPeriod()) return;
        // Global dedupe (REST poll + data packet + races)
        if (msg.id) {
          if (!claimSfxEventId(msg.id)) return;
        } else if (
          !claimSfxEventId(`lk-${soundId}-${Math.floor(Date.now() / 500)}`)
        ) {
          return;
        }
        if (isRoomOutputMuted()) return;
        void unlockRoomAudio().then(() => {
          void playHostSfx(soundId);
        });
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

/** Publishes room emotes on LiveKit data channel. */
function EmoteDataBridge() {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const connected = connectionState === ConnectionState.Connected;

  useEffect(() => {
    if (!room || !connected) {
      setEmoteSender(null);
      return;
    }
    setEmoteSender(async (emoji: string) => {
      const payload = new TextEncoder().encode(
        JSON.stringify({
          type: "emote",
          emoji,
          from: room.localParticipant.name || "guest",
          id: crypto.randomUUID?.() || String(Date.now()),
        })
      );
      await room.localParticipant.publishData(payload, {
        reliable: true,
        topic: "trl-emote",
      });
    });
    return () => setEmoteSender(null);
  }, [room, connected]);

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
  const [remoteAudioCount, setRemoteAudioCount] = useState(0);
  /** Mic button UI — not LiveKit alone (avoids stuck black Mute). */
  const [micOn, setMicOn] = useState(false);
  /** Speaker output mute (voice + soundboard). */
  const [soundMuted, setSoundMuted] = useState(isRoomOutputMuted());
  /** Only auto-enable mic once per connection. */
  const didAutoEnableMic = useRef(false);
  const [micFilter, setMicFilter] = useState<MicFilterId>("off");
  const filterSession = useRef<MicFilterSession | null>(null);
  const filteredPub = useRef<LocalTrackPublication | null>(null);

  const connected = connectionState === ConnectionState.Connected;
  const connecting =
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting;

  useEffect(() => {
    setMicFilter(loadMicFilter());
  }, []);

  useEffect(() => {
    return subscribeRoomAudio(() => {
      setSoundMuted(isRoomOutputMuted());
    });
  }, []);

  async function tearDownFilteredMic() {
    const session = filterSession.current;
    const pub = filteredPub.current;
    filterSession.current = null;
    filteredPub.current = null;
    if (pub?.track && localParticipant) {
      try {
        await localParticipant.unpublishTrack(pub.track);
      } catch {
        /* ignore */
      }
    }
    session?.stop();
  }

  /** Publish mic: clean LiveKit path OR WebAudio filter track. */
  async function enableMic(filter: MicFilterId) {
    if (!localParticipant) return;
    await tearDownFilteredMic();
    // Drop any default LK mic first
    try {
      await localParticipant.setMicrophoneEnabled(false);
    } catch {
      /* ignore */
    }

    if (filter === "off") {
      await localParticipant.setMicrophoneEnabled(true);
      return;
    }

    const session = await startMicFilterSession(filter);
    filterSession.current = session;
    const publication = await localParticipant.publishTrack(
      session.outputTrack,
      {
        name: "microphone",
        source: Track.Source.Microphone,
      }
    );
    filteredPub.current = publication ?? null;
  }

  async function disableMic() {
    if (!localParticipant) return;
    if (filterSession.current) {
      await tearDownFilteredMic();
      return;
    }
    await localParticipant.setMicrophoneEnabled(false);
  }

  // Reset one-shot flags when we leave the room connection
  useEffect(() => {
    if (!connected) {
      didAutoEnableMic.current = false;
      setMicOn(false);
      void tearDownFilteredMic();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

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

  // Auto-start room speakers (join gesture already unlocked browsers)
  useEffect(() => {
    if (!room) return;
    const kick = () => {
      void room.startAudio().catch(() => undefined);
      void resumeRoomPlayback();
      applySpeakerVolume(room, isRoomOutputMuted());
    };
    kick();
    room.on(RoomEvent.TrackSubscribed, kick);
    room.on(RoomEvent.Connected, kick);
    return () => {
      room.off(RoomEvent.TrackSubscribed, kick);
      room.off(RoomEvent.Connected, kick);
    };
  }, [room]);

  // Keep LiveKit + DOM matched to speaker Mute
  useEffect(() => {
    if (room) applySpeakerVolume(room, soundMuted);
    applyOutputMuteToDom(soundMuted);
  }, [room, soundMuted, remoteAudioCount, connected]);

  // Auto-enable mic ONCE when we first connect as publisher
  useEffect(() => {
    if (!connected || !canPublish || !localParticipant) return;
    if (hostMuted) return;
    if (didAutoEnableMic.current) return;
    let cancelled = false;
    (async () => {
      try {
        await enableMic(loadMicFilter());
        if (!cancelled) {
          didAutoEnableMic.current = true;
          setMicOn(true);
        }
      } catch {
        if (!cancelled) {
          setMicOn(false);
          setMicError(
            mobile
              ? "Allow the microphone when prompted, then tap Unmute mic."
              : "Allow the microphone, then tap Unmute mic."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, canPublish, hostMuted, localParticipant, mobile]);

  useEffect(() => {
    if (!localParticipant) return;
    if ((!canPublish || hostMuted) && (isMicrophoneEnabled || micOn)) {
      void disableMic();
      setMicOn(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPublish, hostMuted, isMicrophoneEnabled, localParticipant]);

  async function forceMicOn() {
    if (!localParticipant || !canPublish || hostMuted) return;
    setMicError(null);
    try {
      await disableMic();
      setMicOn(false);
      await new Promise((r) => setTimeout(r, 200));
      await enableMic(micFilter);
      setMicOn(true);
      didAutoEnableMic.current = true;
    } catch {
      setMicOn(false);
      setMicError(
        "Could not start microphone. Check browser site settings → Microphone → Allow, then try Restart mic."
      );
    }
  }

  async function toggleMicMute() {
    if (!localParticipant || !canPublish || hostMuted) return;
    setMicError(null);
    const turnOn = !micOn;
    setMicOn(turnOn);
    try {
      if (turnOn) await enableMic(micFilter);
      else await disableMic();
      didAutoEnableMic.current = true;
    } catch {
      setMicOn(!turnOn);
      setMicError("Could not access the microphone.");
    }
  }

  async function onFilterChange(next: MicFilterId) {
    setMicFilter(next);
    saveMicFilter(next);
    if (!localParticipant || !canPublish || hostMuted || !micOn) return;
    setMicError(null);
    try {
      await enableMic(next);
    } catch {
      setMicError("Could not apply mic filter — try Restart mic.");
    }
  }

  function toggleSoundMute() {
    void unlockRoomAudio();
    const next = toggleRoomOutputMuted();
    setSoundMuted(next);
  }

  let statusLabel = "Voice off";
  if (connecting) statusLabel = "Connecting…";
  else if (connected && soundMuted) statusLabel = "Sound muted — tap Unmute";
  else if (connected && canPublish && hostMuted)
    statusLabel = "Host muted your mic — you can still hear the room";
  else if (connected && canPublish && micOn)
    statusLabel = "Live — your mic is on";
  else if (connected && canPublish && !micOn)
    statusLabel = "Mic off — tap Unmute mic to talk";
  else if (connected && !canPublish)
    statusLabel =
      remoteAudioCount > 0
        ? `Listening — ${remoteAudioCount} live mic(s)`
        : "Listening — waiting for host";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Live sound
          </p>
          <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {statusLabel}
          </p>
          {!canPublish && (
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Host voice and soundboard play automatically.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* One speaker Mute for everyone */}
          <button
            type="button"
            onClick={toggleSoundMute}
            className={`min-h-11 min-w-[5.5rem] rounded-xl px-4 py-3 text-sm font-semibold ${
              soundMuted
                ? "bg-amber-500 text-white"
                : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            }`}
          >
            {soundMuted ? "Unmute" : "Mute"}
          </button>
          {canPublish && !hostMuted && (
            <>
              <button
                type="button"
                onClick={() => void toggleMicMute()}
                disabled={!connected}
                className={`min-h-11 min-w-[5.5rem] rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 ${
                  micOn
                    ? "border border-zinc-400 bg-white text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    : "bg-amber-600 text-white"
                }`}
              >
                {micOn ? "Mute mic" : "Unmute mic"}
              </button>
              <button
                type="button"
                onClick={() => void forceMicOn()}
                disabled={!connected}
                className="min-h-11 rounded-xl bg-violet-600 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Restart mic
              </button>
            </>
          )}
        </div>
      </div>

      {canPublish && !hostMuted && connected && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="radio-helper text-[11px] font-semibold uppercase tracking-wide">
            Mic color
          </span>
          {MIC_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              title={opt.hint}
              onClick={() => void onFilterChange(opt.id)}
              className={`min-h-9 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                micFilter === opt.id
                  ? "border-emerald-600 bg-emerald-100 text-emerald-950"
                  : "border-[#d4c4a8] bg-white text-[#3d2a1a] hover:bg-[#f3e0c8]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {micError && (
        <p className="text-xs text-red-700 dark:text-red-300">{micError}</p>
      )}
      {connected && canPublish && !micOn && !hostMuted && (
        <p className="rounded-lg border border-[#d4a574] bg-[#f3e0c8] px-3 py-2 text-xs font-medium text-[#1c1410]">
          Mic is off — others cannot hear you. Tap <strong>Unmute mic</strong>.
        </p>
      )}
      {connected && canPublish && hostMuted && (
        <p className="rounded-lg border border-[#d4a574] bg-[#f3e0c8] px-3 py-2 text-xs font-medium text-[#1c1410]">
          The host muted your mic. You can still hear the show.
        </p>
      )}
    </div>
  );
}
