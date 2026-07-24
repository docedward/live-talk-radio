"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomSfxEvent } from "@/lib/types";
import { fetchSnapshot } from "@/lib/api";
import {
  isHostSfxId,
  playHostSfx,
  unlockHostSfx,
} from "@/lib/host-sfx";

type Props = {
  roomId: string;
  /** Latest board cue from the parent snapshot (or null). */
  lastSfx: RoomSfxEvent | null | undefined;
  /** Host already played on button press — skip double-play. */
  isHost: boolean;
};

/**
 * Playback only — no pads for listeners.
 * Host fires pads on HostSoundboard; server broadcasts lastSfx;
 * this component plays those cues for anyone who unlocked audio.
 */
export function RoomSfxPlayer({ roomId, lastSfx, isHost }: Props) {
  const playedId = useRef<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);

  async function enableSound() {
    await unlockHostSfx();
    setSoundOn(true);
    // Short test so they know speakers work
    await playHostSfx("ding");
  }

  async function maybePlay(event: RoomSfxEvent | null | undefined) {
    if (!event?.id || !event.sound) return;
    if (playedId.current === event.id) return;
    if (!isHostSfxId(event.sound)) return;

    // Host already played on pad press — don't double
    if (isHost && Date.now() - event.at < 2500) {
      playedId.current = event.id;
      return;
    }

    // Listeners only play after they unlocked browser audio
    if (!isHost && !soundOn) return;

    const ok = await playHostSfx(event.sound);
    if (ok) {
      playedId.current = event.id;
      setSoundOn(true);
    }
  }

  useEffect(() => {
    void maybePlay(lastSfx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSfx, isHost, soundOn]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetchSnapshot(roomId);
        if (cancelled) return;
        await maybePlay(res.snapshot.lastSfx);
      } catch {
        /* ignore */
      }
    }
    const id = setInterval(tick, 500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost, soundOn]);

  // Host: unlock speakers only (pads are on HostSoundboard)
  if (isHost) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
        <button
          type="button"
          onClick={() => void enableSound()}
          className="min-h-11 w-full rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-500"
        >
          {soundOn
            ? "Soundboard ready (tap to re-test)"
            : "Tap to enable soundboard audio"}
        </button>
        <p className="mt-1 text-[11px] text-amber-900/80 dark:text-amber-200/80">
          Only the host can fire pads. Everyone in the room hears them.
        </p>
      </div>
    );
  }

  // Listener: no pads — only unlock so they can hear host effects
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/30">
      <button
        type="button"
        onClick={() => void enableSound()}
        className="min-h-11 w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        {soundOn
          ? "Hearing host effects (tap to re-test)"
          : "Tap to hear host sound effects"}
      </button>
      <p className="mt-1 text-[11px] text-emerald-900/80 dark:text-emerald-200/80">
        You cannot fire the board — only the host can. This unlocks your speakers.
      </p>
    </div>
  );
}
