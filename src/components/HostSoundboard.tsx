"use client";

import { useEffect, useState } from "react";
import {
  HOST_SFX_BUTTONS,
  playHostSfx,
  preloadHostSfx,
  unlockHostSfx,
  type HostSfxId,
} from "@/lib/host-sfx";
import { triggerRoomSfx } from "@/lib/api";
import { unlockRoomAudio } from "@/lib/room-audio";

type Props = {
  roomId: string;
};

/**
 * Host-only pads: only the host can press them.
 * Server rejects non-hosts. Plays for host immediately, then broadcasts
 * so every listener hears the same cue.
 */
export function HostSoundboard({ roomId }: Props) {
  const [busy, setBusy] = useState<HostSfxId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    void unlockRoomAudio().then(() => preloadHostSfx());
  }, []);

  async function fire(id: HostSfxId, label: string) {
    setError(null);
    setBusy(id);
    await unlockRoomAudio();
    await unlockHostSfx();
    const heard = await playHostSfx(id); // host hears right away
    if (!heard) {
      setError(
        "Could not play — check the Mute button under Live sound, or try again."
      );
    }
    try {
      // Server: host-only. Listeners receive via RoomSfxPlayer + LiveKit.
      await triggerRoomSfx(roomId, id);
      setLast(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send sound");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/40">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-1">
        <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
          Host soundboard
        </h2>
        <p className="text-[11px] text-amber-800/80 dark:text-amber-200/80">
          Only you press · everyone hears
        </p>
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {HOST_SFX_BUTTONS.map((b) => (
          <button
            key={b.id}
            type="button"
            disabled={busy !== null}
            onClick={() => void fire(b.id, b.label)}
            title={b.label}
            className="flex min-h-11 flex-col items-center justify-center rounded-lg border border-amber-300 bg-white px-1 py-1.5 text-center shadow-sm active:scale-[0.97] disabled:opacity-50 dark:border-amber-800 dark:bg-zinc-900"
          >
            <span className="block text-base leading-none sm:text-lg">
              {b.emoji}
            </span>
            <span className="mt-0.5 block max-w-full truncate text-[10px] font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
              {busy === b.id ? "…" : b.label}
            </span>
          </button>
        ))}
      </div>
      {last && (
        <p className="mt-1.5 text-[11px] text-amber-900 dark:text-amber-200">
          Last: {last}
        </p>
      )}
      {error && (
        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </section>
  );
}
