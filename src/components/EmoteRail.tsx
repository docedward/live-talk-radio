"use client";

import { useEffect, useState } from "react";
import { sendEmote, subscribeEmotes } from "@/lib/emote-bus";

const EMOTES = ["👏", "😂", "😮", "🔥", "👎", "❤️", "🎉", "🙌"] as const;

type Floaty = {
  id: string;
  emoji: string;
  x: number;
};

/**
 * Applause / reaction rail — floating pops, never chat log.
 * Fan-out via LiveKit data (emote-bus) when voice is connected.
 */
export function EmoteRail() {
  const [floats, setFloats] = useState<Floaty[]>([]);
  const [cooldown, setCooldown] = useState(false);

  useEffect(() => {
    return subscribeEmotes((emoji) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const x = 12 + Math.random() * 76;
      setFloats((prev) => [...prev.slice(-14), { id, emoji, x }]);
      window.setTimeout(() => {
        setFloats((prev) => prev.filter((f) => f.id !== id));
      }, 1600);
    });
  }, []);

  function fire(emoji: string) {
    if (cooldown) return;
    setCooldown(true);
    window.setTimeout(() => setCooldown(false), 850);
    void sendEmote(emoji);
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#d4c4a8] bg-[#fffdf8] px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#1c1410]">Applause</h2>
        <p className="radio-helper text-[11px]">Tap — floats, not chat</p>
      </div>
      <div className="relative z-10 flex flex-wrap gap-1.5">
        {EMOTES.map((e) => (
          <button
            key={e}
            type="button"
            disabled={cooldown}
            onClick={() => fire(e)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#d4c4a8] bg-white text-xl shadow-sm active:scale-95 disabled:opacity-50"
            aria-label={`React ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 top-8 z-0"
        aria-hidden
      >
        {floats.map((f) => (
          <span
            key={f.id}
            className="trl-emote-float absolute text-2xl"
            style={{ left: `${f.x}%`, bottom: "2.5rem" }}
          >
            {f.emoji}
          </span>
        ))}
      </div>
    </section>
  );
}
