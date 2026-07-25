"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { sendEmote, subscribeEmotes } from "@/lib/emote-bus";

const EMOTES = ["👏", "😂", "😮", "🔥", "👎", "❤️", "🎉", "🙌"] as const;

type Floaty = {
  id: string;
  emoji: string;
  /** 0–100 viewport left % */
  x: number;
  /** start height 0–30 from bottom as vh */
  y0: number;
  /** scale variation */
  scale: number;
};

/**
 * Applause rail — buttons stay in the panel; floats render full-screen
 * over the whole app (portal to body) so they are actually visible.
 */
export function EmoteRail() {
  const [floats, setFloats] = useState<Floaty[]>([]);
  const [cooldown, setCooldown] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    return subscribeEmotes((emoji) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const float: Floaty = {
        id,
        emoji,
        x: 6 + Math.random() * 88,
        y0: 4 + Math.random() * 18,
        scale: 0.95 + Math.random() * 0.55,
      };
      setFloats((prev) => [...prev.slice(-18), float]);
      window.setTimeout(() => {
        setFloats((prev) => prev.filter((f) => f.id !== id));
      }, 2800);
    });
  }, []);

  function fire(emoji: string) {
    if (cooldown) return;
    setCooldown(true);
    window.setTimeout(() => setCooldown(false), 850);
    void sendEmote(emoji);
  }

  const overlay =
    mounted && floats.length > 0
      ? createPortal(
          <div
            className="trl-emote-stage pointer-events-none fixed inset-0 z-[9999]"
            aria-hidden
          >
            {floats.map((f) => (
              <span
                key={f.id}
                className="trl-emote-float absolute select-none"
                style={{
                  left: `${f.x}%`,
                  bottom: `${f.y0}vh`,
                  fontSize: `calc(2.25rem * ${f.scale})`,
                  ["--trl-emote-rise" as string]: `${45 + Math.random() * 35}vh`,
                }}
              >
                {f.emoji}
              </span>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <section className="rounded-2xl border border-[#d4c4a8] bg-[#fffdf8] px-3 py-2.5">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#1c1410]">Applause</h2>
          <p className="radio-helper text-[11px]">
            Tap — floats over the whole screen
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
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
      </section>
      {overlay}
    </>
  );
}
