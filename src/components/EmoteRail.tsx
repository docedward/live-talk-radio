"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { sendEmote, subscribeEmotes } from "@/lib/emote-bus";
import { PlayingCard } from "./PlayingCard";

const EMOTES = ["👏", "😂", "😮", "🔥", "👎", "❤️", "🎉", "🙌"] as const;

type Floaty = {
  id: string;
  emoji: string;
  from: string;
  avatarId?: string | null;
  x: number;
  y0: number;
  scale: number;
};

type Props = {
  myName?: string;
  myAvatarId?: string | null;
};

/**
 * Applause rail — floats over the whole screen with card + name.
 */
export function EmoteRail({ myName = "Guest", myAvatarId = null }: Props) {
  const [floats, setFloats] = useState<Floaty[]>([]);
  const [cooldown, setCooldown] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    return subscribeEmotes((meta) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const float: Floaty = {
        id,
        emoji: meta.emoji,
        from: meta.from || "Guest",
        avatarId: meta.avatarId,
        x: 6 + Math.random() * 88,
        y0: 4 + Math.random() * 18,
        scale: 0.95 + Math.random() * 0.45,
      };
      setFloats((prev) => [...prev.slice(-16), float]);
      window.setTimeout(() => {
        setFloats((prev) => prev.filter((f) => f.id !== id));
      }, 3200);
    });
  }, []);

  function fire(emoji: string) {
    if (cooldown) return;
    setCooldown(true);
    window.setTimeout(() => setCooldown(false), 850);
    void sendEmote({
      emoji,
      from: myName,
      avatarId: myAvatarId,
    });
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
                className="trl-emote-float absolute flex flex-col items-center select-none"
                style={{
                  left: `${f.x}%`,
                  bottom: `${f.y0}vh`,
                  transform: "translateX(-50%)",
                  ["--trl-emote-rise" as string]: `${45 + Math.random() * 30}vh`,
                }}
              >
                <span
                  className="leading-none drop-shadow-md"
                  style={{ fontSize: `calc(2rem * ${f.scale})` }}
                >
                  {f.emoji}
                </span>
                <span className="mt-1 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-white shadow">
                  <PlayingCard cardId={f.avatarId} size="xs" />
                  <span className="max-w-[5.5rem] truncate text-[10px] font-semibold">
                    {f.from}
                  </span>
                </span>
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
          <p className="text-[11px] font-medium text-[#4a3728]">
            Tap — shows your card + name
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
