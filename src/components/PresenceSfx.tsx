"use client";

import { useEffect, useRef } from "react";
import type { PresenceMember } from "@/lib/types";
import { playJoinClap, playLeaveBoom } from "@/lib/presence-sounds";
import { isRoomOutputMuted, unlockRoomAudio } from "@/lib/room-audio";

type Props = {
  presence: PresenceMember[];
  /** Your display name — avoid treating your own first paint as a join. */
  myName: string;
  myRole: "host" | "listener";
};

function bagKey(m: PresenceMember): string {
  return `${m.role}\0${m.displayName}`;
}

/** Multiset counts for presence rows. */
function toBag(list: PresenceMember[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of list) {
    const k = bagKey(p);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/**
 * Plays golf-clap when someone joins the room, cannon boom when they leave.
 * Compares presence between polls (and parent snapshot updates).
 */
export function PresenceSfx({ presence, myName, myRole }: Props) {
  const prevRef = useRef<Map<string, number> | null>(null);
  const myKey = `${myRole}\0${myName}`;

  // Soft unlock if Join didn't (e.g. host auto-join) — first tap anywhere
  useEffect(() => {
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

  useEffect(() => {
    const next = toBag(presence);
    const prev = prevRef.current;

    if (prev === null) {
      // First snapshot after join — baseline, no SFX (you just entered)
      prevRef.current = next;
      return;
    }

    if (isRoomOutputMuted()) {
      prevRef.current = next;
      return;
    }

    let joins = 0;
    let leaves = 0;

    const keys = new Set([...prev.keys(), ...next.keys()]);
    for (const k of keys) {
      const a = prev.get(k) || 0;
      const b = next.get(k) || 0;
      if (b > a) {
        // New seats for this name/role
        const added = b - a;
        // Don't clap for yourself if your row appears (edge rejoin)
        if (k !== myKey) joins += added;
      } else if (a > b) {
        const removed = a - b;
        if (k !== myKey) leaves += removed;
      }
    }

    // Cap bursts if many join at once
    const clapN = Math.min(joins, 3);
    const boomN = Math.min(leaves, 3);
    for (let i = 0; i < clapN; i++) {
      window.setTimeout(() => playJoinClap(), i * 120);
    }
    for (let i = 0; i < boomN; i++) {
      window.setTimeout(() => playLeaveBoom(), i * 200);
    }

    prevRef.current = next;
  }, [presence, myKey]);

  return null;
}
