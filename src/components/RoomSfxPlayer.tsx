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
  /** Host already played on click — skip double-play. */
  isHost: boolean;
};

/**
 * Everyone: play host soundboard cues when lastSfx changes.
 * Shows an explicit “Enable room sound” control so browsers allow audio.
 */
export function RoomSfxPlayer({ roomId, lastSfx, isHost }: Props) {
  const playedId = useRef<string | null>(null);
  const cue = useRef<RoomSfxEvent | null | undefined>(lastSfx);
  const [soundOn, setSoundOn] = useState(false);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    cue.current = lastSfx;
  }, [lastSfx]);

  async function enableSound() {
    await unlockHostSfx();
    setSoundOn(true);
    setHint(false);
    // Prove audio works with a short ding
    await playHostSfx("ding");
  }

  async function maybePlay(event: RoomSfxEvent | null | undefined) {
    if (!event?.id || !event.sound) return;
    if (playedId.current === event.id) return;
    if (!isHostSfxId(event.sound)) return;

    // Host already plays on button press
    if (isHost && Date.now() - event.at < 2500) {
      playedId.current = event.id;
      return;
    }

    // Don't mark played until audio actually starts
    const ok = await playHostSfx(event.sound);
    if (ok) {
      playedId.current = event.id;
      setSoundOn(true);
      setHint(false);
    }
  }

  useEffect(() => {
    if (!soundOn && !isHost) return;
    void maybePlay(lastSfx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSfx, isHost, soundOn]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (!soundOn && !isHost) return;
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

  // Host: board clicks unlock audio; still show a small enable if they hear nothing
  if (isHost) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
        <button
          type="button"
          onClick={() => void enableSound()}
          className="min-h-11 w-full rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-500"
        >
          {soundOn ? "Test soundboard audio (ding)" : "Tap to enable soundboard audio"}
        </button>
        <p className="mt-1 text-[11px] text-amber-900/80 dark:text-amber-200/80">
          Browsers block sound until you tap. Then try a pad (Laugh, Ding…).
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/30">
      <button
        type="button"
        onClick={() => void enableSound()}
        className="min-h-11 w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        {soundOn
          ? "Room sound on — tap to test (ding)"
          : "Tap to enable room sound (effects + help voice)"}
      </button>
      {hint && (
        <p className="mt-1 text-[11px] text-emerald-900/80 dark:text-emerald-200/80">
          Required on phones: without this tap, host soundboard and voice stay silent.
        </p>
      )}
    </div>
  );
}
