"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useConnectionState,
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { fetchVoiceToken } from "@/lib/api";

type Props = {
  roomId: string;
  /** From snapshot.voice — host always true when enabled; guest only while On Air live. */
  canPublish: boolean;
  /** Server has LiveKit configured. */
  enabled: boolean;
};

/**
 * LiveKit media plane: host publishes when canPublish; everyone subscribes.
 * Re-fetches token when canPublish flips so guest gains/loses publish rights.
 */
export function VoiceStage({ roomId, canPublish, enabled }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [tokenCanPublish, setTokenCanPublish] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  // Connect / refresh when room joins or publish rights change (On Air live/clear).
  useEffect(() => {
    if (!enabled) {
      setToken(null);
      setUrl(null);
      return;
    }
    void refreshToken();
  }, [enabled, canPublish, refreshToken]);

  if (!enabled) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Voice is off on this server (no LiveKit keys). Text chat and On Air
        status still work.
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
          className="mt-2 text-xs font-semibold underline"
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
      audio={tokenCanPublish}
      video={false}
      onError={(err) => setLoadError(err.message)}
      className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40"
    >
      <RoomAudioRenderer />
      <VoiceChrome canPublish={tokenCanPublish} />
    </LiveKitRoom>
  );
}

function VoiceChrome({ canPublish }: { canPublish: boolean }) {
  const connectionState = useConnectionState();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [micError, setMicError] = useState<string | null>(null);

  const connected = connectionState === ConnectionState.Connected;
  const connecting =
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting;

  async function toggleMute() {
    if (!localParticipant || !canPublish) return;
    setMicError(null);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      setMicError(
        "Could not access the microphone. Allow mic permission and try again."
      );
    }
  }

  let statusLabel = "Voice off";
  if (connecting) statusLabel = "Connecting…";
  else if (connected && canPublish && isMicrophoneEnabled)
    statusLabel = "Mic live — the room can hear you";
  else if (connected && canPublish && !isMicrophoneEnabled)
    statusLabel = "Mic muted — you can still hear the room";
  else if (connected && !canPublish)
    statusLabel = "Listening — your mic is off";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Live voice
          </p>
          <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {statusLabel}
          </p>
          {canPublish ? (
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Who can hear you: everyone in this room (not the public internet
              outside the link). Not recording.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              You can hear the host (and a guest if someone is On Air). Your mic
              stays off until the host puts you On Air.
            </p>
          )}
        </div>
        {canPublish && (
          <button
            type="button"
            onClick={() => void toggleMute()}
            disabled={!connected}
            className={`rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
              isMicrophoneEnabled
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-amber-500 text-white"
            }`}
          >
            {isMicrophoneEnabled ? "Mute" : "Unmute"}
          </button>
        )}
      </div>
      {micError && (
        <p className="text-xs text-red-700 dark:text-red-300">{micError}</p>
      )}
      {connected && canPublish && !isMicrophoneEnabled && !micError && (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Mic is muted or waiting for browser permission. Click Unmute and allow
          the microphone if prompted.
        </p>
      )}
    </div>
  );
}
