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

type Props = {
  roomId: string;
};

/**
 * Host-only pad: 6 effects (WAV in /sfx, synth fallback).
 * Plays immediately here, then tells the server so everyone else hears too.
 */
export function HostSoundboard({ roomId }: Props) {
  const [busy, setBusy] = useState<HostSfxId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    void unlockHostSfx().then(() => preloadHostSfx());
  }, []);

  async function fire(id: HostSfxId, label: string) {
    setError(null);
    setBusy(id);
    await unlockHostSfx();
    playHostSfx(id); // host hears right away
    try {
      await triggerRoomSfx(roomId, id);
      setLast(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send sound");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/90 px-3 py-3 dark:border-amber-900 dark:bg-amber-950/40">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
        <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
          Host soundboard
        </h2>
        <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
          Whole room hears these
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {HOST_SFX_BUTTONS.map((b) => (
          <button
            key={b.id}
            type="button"
            disabled={busy !== null}
            onClick={() => void fire(b.id, b.label)}
            className="min-h-14 rounded-xl border border-amber-300 bg-white px-2 py-3 text-center shadow-sm active:scale-[0.98] disabled:opacity-50 dark:border-amber-800 dark:bg-zinc-900"
          >
            <span className="block text-xl leading-none">{b.emoji}</span>
            <span className="mt-1 block text-xs font-semibold text-zinc-800 dark:text-zinc-100">
              {busy === b.id ? "…" : b.label}
            </span>
          </button>
        ))}
      </div>
      {last && (
        <p className="mt-2 text-xs text-amber-900 dark:text-amber-200">
          Last: {last}
        </p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </section>
  );
}
