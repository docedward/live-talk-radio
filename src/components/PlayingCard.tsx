"use client";

import type { ReactNode } from "react";
import {
  cardLabel,
  cardShortLabel,
  isFaceRank,
  parseCardId,
  suitMeta,
  type CardId,
  type CardRank,
} from "@/lib/card-avatars";

type Size = "xs" | "sm" | "md" | "lg";

const SIZE: Record<
  Size,
  { box: string; rank: string; suit: string; center: string; face: string }
> = {
  xs: {
    box: "h-9 w-6 rounded",
    rank: "text-[8px] leading-none",
    suit: "text-[7px] leading-none",
    center: "text-sm",
    face: "text-[11px]",
  },
  sm: {
    box: "h-11 w-8 rounded-md",
    rank: "text-[9px] leading-none",
    suit: "text-[8px] leading-none",
    center: "text-base",
    face: "text-sm",
  },
  md: {
    box: "h-16 w-11 rounded-lg",
    rank: "text-[11px] leading-none",
    suit: "text-[10px] leading-none",
    center: "text-xl",
    face: "text-lg",
  },
  lg: {
    box: "h-20 w-14 rounded-lg",
    rank: "text-xs leading-none",
    suit: "text-[11px] leading-none",
    center: "text-2xl",
    face: "text-xl",
  },
};

const FACE_GLYPH: Record<"J" | "Q" | "K", string> = {
  J: "♞",
  Q: "♛",
  K: "♚",
};

type Props = {
  cardId: string | null | undefined;
  size?: Size;
  selected?: boolean;
  taken?: boolean;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
};

/**
 * Detailed CSS playing-card face — the card *is* the avatar.
 * Face cards (J/Q/K) and jokers get richer art than pip cards.
 */
export function PlayingCard({
  cardId,
  size = "md",
  selected = false,
  taken = false,
  className = "",
  onClick,
  disabled,
  title,
}: Props) {
  const parsed = parseCardId(cardId);
  const s = SIZE[size];
  const label = title || cardLabel(cardId);

  if (!parsed) {
    const shell = (
      <span
        className={`inline-flex ${s.box} items-center justify-center border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 ${className}`}
        title="No card"
        aria-hidden
      >
        ?
      </span>
    );
    return onClick ? (
      <button type="button" onClick={onClick} disabled={disabled} title={label}>
        {shell}
      </button>
    ) : (
      shell
    );
  }

  let face: ReactNode;

  if (parsed.kind === "joker") {
    const color = parsed.red
      ? "text-red-600"
      : "text-zinc-900 dark:text-zinc-100";
    face = (
      <span
        className={`relative inline-flex ${s.box} flex-col items-center justify-between border bg-gradient-to-b from-amber-50 to-white px-0.5 py-0.5 shadow-sm ${
          selected
            ? "border-violet-500 ring-2 ring-violet-400 ring-offset-1"
            : "border-zinc-400"
        } ${taken && !selected ? "opacity-35 grayscale" : ""} ${color} ${className}`}
        title={label}
        aria-label={label}
      >
        <span className={`font-black ${s.rank}`}>★</span>
        <span className={`font-black leading-none ${s.face}`}>J</span>
        <span className={`text-[7px] font-bold uppercase leading-none`}>
          oker
        </span>
        <span
          className={`font-black ${s.rank}`}
          style={{ transform: "rotate(180deg)" }}
        >
          ★
        </span>
      </span>
    );
  } else {
    const suit = suitMeta(parsed.suit);
    const red = suit.red;
    const color = red ? "text-red-600" : "text-zinc-900";
    const faceCard = isFaceRank(parsed.rank);

    face = (
      <span
        className={`relative inline-flex ${s.box} flex-col justify-between border bg-white px-0.5 py-0.5 shadow-sm ${
          selected
            ? "border-violet-500 ring-2 ring-violet-400 ring-offset-1"
            : faceCard
              ? "border-zinc-400"
              : "border-zinc-300"
        } ${taken && !selected ? "opacity-35 grayscale" : ""} ${color} ${className}`}
        title={label}
        aria-label={label}
      >
        <span className={`z-10 flex flex-col items-start font-bold ${s.rank}`}>
          <span>{parsed.rank}</span>
          <span className={s.suit}>{suit.symbol}</span>
        </span>

        {faceCard ? (
          <span
            className={`absolute inset-0 flex flex-col items-center justify-center ${s.face}`}
            aria-hidden
          >
            <span className="font-black leading-none opacity-90">
              {FACE_GLYPH[parsed.rank as "J" | "Q" | "K"]}
            </span>
            <span className={`${s.suit} mt-0.5 opacity-80`}>{suit.symbol}</span>
          </span>
        ) : (
          <span
            className={`absolute inset-0 flex items-center justify-center font-semibold ${s.center}`}
            aria-hidden
          >
            {pipCluster(parsed.rank, suit.symbol, size)}
          </span>
        )}

        <span
          className={`z-10 flex flex-col items-end font-bold ${s.rank}`}
          style={{ transform: "rotate(180deg)" }}
        >
          <span>{parsed.rank}</span>
          <span className={s.suit}>{suit.symbol}</span>
        </span>
      </span>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || (taken && !selected)}
        title={taken && !selected ? `${label} (taken)` : label}
        aria-pressed={selected}
        aria-label={
          taken && !selected ? `${label}, already taken` : `Choose ${label}`
        }
        className="rounded-lg transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        {face}
      </button>
    );
  }

  return face;
}

function pipCluster(rank: CardRank, symbol: string, size: Size) {
  if (size === "xs" || size === "sm") {
    return <span>{symbol}</span>;
  }
  const n =
    rank === "A"
      ? 1
      : rank === "10"
        ? 3
        : Math.min(3, Math.max(1, parseInt(rank, 10) || 1));
  if (n === 1) return <span className="text-2xl">{symbol}</span>;
  return (
    <span className="flex flex-col items-center gap-0 leading-none">
      {Array.from({ length: n }, (_, i) => (
        <span key={i}>{symbol}</span>
      ))}
    </span>
  );
}

export function CardChip({
  cardId,
  name,
  size = "xs",
}: {
  cardId?: string | null;
  name?: string;
  size?: Size;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <PlayingCard cardId={cardId} size={size} />
      {name != null && name !== "" && (
        <span className="min-w-0 truncate">
          {name}
          {cardId ? (
            <span className="ml-1 text-[10px] font-normal opacity-60">
              {cardShortLabel(cardId)}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}

export type { CardId };
