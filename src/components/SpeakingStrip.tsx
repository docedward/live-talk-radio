"use client";

import { useEffect, useState } from "react";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { RoomEvent, type Participant } from "livekit-client";
import { publishSpeaking, type SpeakingState } from "@/lib/speaking-bus";

function labelFor(p: Participant, localId: string): string {
  if (p.identity === localId) return "You";
  return (p.name && p.name.trim()) || p.identity.slice(0, 8);
}

/**
 * Shows who is talking right now (LiveKit active speakers + levels).
 * Also publishes to speaking-bus for host panel pulse.
 */
export function SpeakingStrip() {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [chips, setChips] = useState<
    { key: string; label: string; level: number; isYou: boolean }[]
  >([]);

  useEffect(() => {
    if (!room) return;
    const localId = localParticipant?.identity || room.localParticipant.identity;

    function collect(): SpeakingState {
      const names = new Set<string>();
      const levels = new Map<string, number>();
      const nextChips: {
        key: string;
        label: string;
        level: number;
        isYou: boolean;
      }[] = [];

      const consider = (p: Participant) => {
        const level = p.audioLevel ?? 0;
        const speaking = p.isSpeaking || level > 0.025;
        if (!speaking) return;
        const display = (p.name && p.name.trim()) || p.identity;
        names.add(display);
        levels.set(display, level);
        nextChips.push({
          key: p.identity,
          label: labelFor(p, localId),
          level,
          isYou: p.identity === localId,
        });
      };

      consider(room.localParticipant);
      room.remoteParticipants.forEach((p) => consider(p));

      // Prefer ActiveSpeakers order when available
      const active = room.activeSpeakers || [];
      if (active.length) {
        nextChips.sort((a, b) => {
          const ai = active.findIndex((p) => p.identity === a.key);
          const bi = active.findIndex((p) => p.identity === b.key);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
      }

      setChips(nextChips);
      publishSpeaking({ names, levels });
      return { names, levels };
    }

    const onActive = () => {
      collect();
    };
    room.on(RoomEvent.ActiveSpeakersChanged, onActive);
    // Levels update more often than active-speaker events
    const tick = setInterval(collect, 100);
    collect();

    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onActive);
      clearInterval(tick);
      publishSpeaking({ names: new Set(), levels: new Map() });
    };
  }, [room, localParticipant]);

  return (
    <div className="mt-2 border-t border-emerald-200/80 pt-2 dark:border-emerald-800/80">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
        Speaking now
      </p>
      {chips.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Quiet — say something to light this up.
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-2">
          {chips.map((c) => (
            <li
              key={c.key}
              className={`flex min-w-[4.5rem] flex-col rounded-lg border-2 px-2 py-1.5 ${
                c.isYou
                  ? "border-emerald-500 bg-emerald-100 dark:border-emerald-400 dark:bg-emerald-900/60"
                  : "border-emerald-400/80 bg-white dark:border-emerald-600 dark:bg-zinc-900"
              }`}
            >
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                {c.label}
                {c.isYou ? " · you" : ""}
              </span>
              <span
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
                aria-hidden
              >
                <span
                  className="block h-full rounded-full bg-emerald-500 transition-[width] duration-75"
                  style={{
                    width: `${Math.min(100, Math.round(c.level * 140))}%`,
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
