"use client";

import { useEffect, useRef } from "react";
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
 * Host skips recent own cues (already played on button press).
 * Extra 500ms poll so listeners hear effects without waiting full 2s chat poll.
 */
export function RoomSfxPlayer({ roomId, lastSfx, isHost }: Props) {
  const playedId = useRef<string | null>(null);
  const cue = useRef<RoomSfxEvent | null | undefined>(lastSfx);

  useEffect(() => {
    cue.current = lastSfx;
  }, [lastSfx]);

  useEffect(() => {
    const unlock = () => {
      void unlockHostSfx();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  function maybePlay(event: RoomSfxEvent | null | undefined) {
    if (!event?.id || !event.sound) return;
    if (playedId.current === event.id) return;
    if (!isHostSfxId(event.sound)) return;

    if (isHost && Date.now() - event.at < 2500) {
      playedId.current = event.id;
      return;
    }

    playedId.current = event.id;
    void unlockHostSfx().then(() => playHostSfx(event.sound));
  }

  useEffect(() => {
    maybePlay(lastSfx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSfx, isHost]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetchSnapshot(roomId);
        if (cancelled) return;
        maybePlay(res.snapshot.lastSfx);
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
  }, [roomId, isHost]);

  return null;
}
