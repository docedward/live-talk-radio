"use client";

import { useEffect, useRef } from "react";
import type { RoomSfxEvent } from "@/lib/types";
import { fetchSnapshot } from "@/lib/api";
import {
  isHostSfxId,
  playHostSfx,
  unlockHostSfx,
} from "@/lib/host-sfx";
import {
  isRoomAudioUnlocked,
  isRoomOutputMuted,
  subscribeRoomAudio,
  unlockRoomAudio,
} from "@/lib/room-audio";

type Props = {
  roomId: string;
  /** Latest board cue from the parent snapshot (or null). */
  lastSfx: RoomSfxEvent | null | undefined;
  /** Host already played on button press — skip double-play. */
  isHost: boolean;
};

/**
 * Playback only — no enable buttons, no pads.
 * Host fires on HostSoundboard; server broadcasts lastSfx;
 * this plays cues for everyone (honors room Mute).
 * Unlock happens on Join / first gesture via room-audio.
 */
export function RoomSfxPlayer({ roomId, lastSfx, isHost }: Props) {
  const playedId = useRef<string | null>(null);
  const readyRef = useRef(isRoomAudioUnlocked());

  useEffect(() => {
    return subscribeRoomAudio(() => {
      readyRef.current = isRoomAudioUnlocked();
    });
  }, []);

  // Soft unlock if join already unlocked, or first pointer/key anywhere
  useEffect(() => {
    if (isRoomAudioUnlocked()) {
      void unlockHostSfx();
      return;
    }
    const unlock = () => {
      void unlockRoomAudio();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  async function maybePlay(event: RoomSfxEvent | null | undefined) {
    if (!event?.id || !event.sound) return;
    if (playedId.current === event.id) return;
    if (!isHostSfxId(event.sound)) return;
    if (isRoomOutputMuted()) {
      // Still mark as seen so we don't blast a backlog after unmute
      playedId.current = event.id;
      return;
    }

    // Host already played on pad press — don't double
    if (isHost && Date.now() - event.at < 2500) {
      playedId.current = event.id;
      return;
    }

    // Try play; unlock may have come from Join
    if (!isRoomAudioUnlocked()) {
      await unlockRoomAudio();
    }

    const ok = await playHostSfx(event.sound);
    if (ok || isRoomAudioUnlocked()) {
      playedId.current = event.id;
    }
  }

  useEffect(() => {
    void maybePlay(lastSfx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSfx, isHost]);

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
  }, [roomId, isHost]);

  // Headless — Mute lives on the voice strip
  return null;
}
