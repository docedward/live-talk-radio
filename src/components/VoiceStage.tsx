"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useConnectionState,
  useRoomContext,
} from "@livekit/components-react";
import { ConnectionState, Room, RoomEvent } from "livekit-client";
import { fetchVoiceToken } from "@/lib/api";
import { isHostSfxId, playHostSfx, unlockHostSfx } from "@/lib/host-sfx";

type Props = {
  roomId: string;
  /** From snapshot.voice — host always true when enabled; guest only while On Air live. */
  canPublish: boolean;
  /** Server has LiveKit configured. */
  enabled: boolean;
  /** Host forced this guest’s mic off (panel mute). */
  hostMuted?: boolean;
};

function isProbablyMobile() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * LiveKit media plane with phone-friendly UX:
 * - User must tap to start voice (Safari mic + autoplay policies)
 * - HTTPS / secure-context warning when needed
 * - Explicit mic enable when On Air on mobile
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

  const secure = useMemo(() => {
    if (typeof window === "undefined") return true;
    return window.isSecureContext;
  }, []);

  const mobile = useMemo(() => isProbablyMobile(), []);

  const refreshToken = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchVoiceToken(roomId);
      setToken(result.token);
      setUrl(result.url);
      setTokenCanPublish(result.canPublish);
    } catch (err) {
      setToken(null);
      setUrl(null);
      setLoadError(err instanceof Error ? err.message : "Could not start voice");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  // After user starts, keep token in sync when On Air / host-mute flips.
  useEffect(() => {
    if (!enabled || !started) return;
    void refreshToken();
  }, [enabled, started, canPublish, hostMuted, refreshToken]);

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
          Phones block the microphone on plain <code className="text-xs">http://</code>{" "}
          LAN addresses. Open the app via the <strong>HTTPS tunnel</strong> link
          (see <code className="text-xs">scripts/phone-tunnel.sh</code>), not{" "}
          <code className="text-xs">http://192.168…</code>.
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
          Tap once so this phone can play sound
          {canPublish ? " and use the mic" : ""}.
        </p>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          {mobile
            ? "Safari and Chrome on phones require a tap before audio or mic work."
            : "Also recommended on desktop if sound is blocked."}
          {" "}
          Not recording. Only people in this room hear you when your mic is on.
        </p>
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 sm:w-auto"
        >
          {canPublish ? "Start live voice (mic)" : "Enable live sound"}
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <p className="font-medium">Voice error</p>
        <p className="mt-1">{loadError}</p>
        <button
          type="button"
          onClick={() => void refreshToken()}
          className="mt-2 min-h-11 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading || !token || !url) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        Connecting voice…
      </div>
    );
  }

  return (
    <LiveKitRoom
      key={`${roomId}-${tokenCanPublish ? "pub" : "sub"}-${token.slice(0, 24)}`}
      token={token}
      serverUrl={url}
      connect
      // Don't auto-grab mic; VoiceChrome turns it on after an explicit tap (phones).
      audio={false}
      video={false}
      onError={(err) => setLoadError(err.message)}
      className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40"
    >
      <RoomAudioRenderer />
      <LiveKitSfxListener />
      <VoiceChrome
        canPublish={tokenCanPublish}
        hostMuted={hostMuted}
        mobile={mobile}
      />
    </LiveKitRoom>
  );
}

/** Soundboard over LiveKit data plane — works if REST/page timed out. */
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
        /* ignore bad packets */
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
  const connectionState = useConnectionState();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [micError, setMicError] = useState<string | null>(null);
  const [audioHint, setAudioHint] = useState(mobile);

  const connected = connectionState === ConnectionState.Connected;
  const connecting =
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting;

  // When host (or newly On Air guest) gains publish rights, enable mic unless host-muted.
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
              ? "Tap Unmute and allow the microphone when iPhone/Android asks."
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

  // Off panel or host-muted → force mic off.
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
      setMicError(
        "Could not access the microphone. Allow mic permission and try again."
      );
    }
  }

  /** Extra gesture to satisfy Safari autoplay if remote audio is silent. */
  async function pokeAudio() {
    setAudioHint(false);
    try {
      // Resume any suspended audio elements RoomAudioRenderer attached.
      const els = document.querySelectorAll("audio");
      for (const el of els) {
        try {
          await el.play();
        } catch {
          /* ignore single element failures */
        }
      }
      // Touch room if available via window (not always exposed); no-op otherwise.
      void Room;
    } catch {
      /* ignore */
    }
  }

  let statusLabel = "Voice off";
  if (connecting) statusLabel = "Connecting…";
  else if (connected && canPublish && hostMuted)
    statusLabel = "Host muted your mic — you can still hear the room";
  else if (connected && canPublish && isMicrophoneEnabled)
    statusLabel = "Mic live — the room can hear you";
  else if (connected && canPublish && !isMicrophoneEnabled)
    statusLabel = "Mic muted — you can still hear the room";
  else if (connected && !canPublish)
    statusLabel = "Listening — your mic is off";

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
          {canPublish ? (
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Who can hear you: everyone in this room. Not recording. Earbuds
              help reduce echo.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              You can hear the host (and a guest if someone is On Air). Your mic
              stays off until the host puts you On Air.
            </p>
          )}
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

      {connected && (
        <button
          type="button"
          onClick={() => void pokeAudio()}
          className="min-h-11 w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-100 sm:w-auto"
        >
          {audioHint ? "Tap if you hear nothing" : "Replay room audio"}
        </button>
      )}

      {micError && (
        <p className="text-xs text-red-700 dark:text-red-300">{micError}</p>
      )}
      {connected && canPublish && hostMuted && (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          The host muted your microphone. You stay on the panel until they
          unmute or remove you.
        </p>
      )}
      {connected &&
        canPublish &&
        !hostMuted &&
        !isMicrophoneEnabled &&
        !micError && (
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Mic is off. Tap <strong>Unmute</strong>
            {mobile ? " and allow the microphone" : ""}.
          </p>
        )}
    </div>
  );
}
