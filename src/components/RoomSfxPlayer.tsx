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
import { claimSfxEventId, hasPlayedSfxEvent } from "@/lib/sfx-dedupe";

type Props = {
  roomId: string;
  lastSfx: RoomSfxEvent | null | undefined;
  /** Host already played on pad press — skip REST/LiveKit echo. */
  isHost: boolean;
};

/**
 * Listeners hear host board cues via lastSfx (REST) and/or LiveKit data.
 * Deduped globally so we never multi-fire one event id.
 */
export function RoomSfxPlayer({ roomId, lastSfx, isHost }: Props) {
  const readyRef = useRef(isRoomAudioUnlocked());

  useEffect(() => {
    return subscribeRoomAudio(() => {
      readyRef.current = isRoomAudioUnlocked();
    });
  }, []);

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
    if (!isHostSfxId(event.sound)) return;
    // Host already played locally and marked the id in HostSoundboard
    if (isHost) return;
    if (hasPlayedSfxEvent(event.id)) return;
    if (!claimSfxEventId(event.id)) return;

    if (isRoomOutputMuted()) return;

    if (!isRoomAudioUnlocked()) {
      await unlockRoomAudio();
    }
    await playHostSfx(event.sound);
  }

  useEffect(() => {
    void maybePlay(lastSfx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSfx?.id, isHost]);

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
    // Slower poll — LiveKit data is primary; REST is backup only
    const id = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost]);

  return null;
}
