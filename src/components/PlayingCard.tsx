"use client";

import {
  cardLabel,
  cardShortLabel,
  parseCardId,
  suitMeta,
  type CardId,
} from "@/lib/card-avatars";

type Size = "xs" | "sm" | "md" | "lg";

const SIZE: Record<
  Size,
  { box: string; rank: string; suit: string; center: string }
> = {
  xs: {
    box: "h-8 w-6 rounded",
    rank: "text-[8px] leading-none",
    suit: "text-[7px] leading-none",
    center: "text-sm",
  },
  sm: {
    box: "h-10 w-7 rounded-md",
    rank: "text-[9px] leading-none",
    suit: "text-[8px] leading-none",
    center: "text-base",
  },
  md: {
    box: "h-14 w-10 rounded-lg",
    rank: "text-[11px] leading-none",
    suit: "text-[10px] leading-none",
    center: "text-xl",
  },
  lg: {
    box: "h-[4.5rem] w-12 rounded-lg",
    rank: "text-xs leading-none",
    suit: "text-[11px] leading-none",
    center: "text-2xl",
  },
};

type Props = {
  cardId: string | null | undefined;
  size?: Size;
  selected?: boolean;
  taken?: boolean;
  className?: string;
  /** Interactive button look */
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
};

/**
 * Simple CSS playing-card face — the card *is* the avatar.
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
        className={`inline-flex ${s.box} items-center justify-center border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 ${className}`}
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

  const suit = suitMeta(parsed.suit);
  const red = suit.red;
  const color = red
    ? "text-red-600 dark:text-red-400"
    : "text-zinc-900 dark:text-zinc-100";

  const face = (
    <span
      className={`relative inline-flex ${s.box} flex-col justify-between border bg-white px-0.5 py-0.5 shadow-sm dark:bg-zinc-50 ${
        selected
          ? "border-violet-500 ring-2 ring-violet-400 ring-offset-1 dark:ring-offset-zinc-950"
          : "border-zinc-300 dark:border-zinc-400"
      } ${taken && !selected ? "opacity-35 grayscale" : ""} ${color} ${className}`}
      title={label}
      aria-label={label}
    >
      <span className={`flex flex-col items-start font-bold ${s.rank}`}>
        <span>{parsed.rank}</span>
        <span className={s.suit}>{suit.symbol}</span>
      </span>
      <span
        className={`absolute inset-0 flex items-center justify-center font-semibold ${s.center}`}
        aria-hidden
      >
        {suit.symbol}
      </span>
      <span
        className={`flex flex-col items-end font-bold ${s.rank}`}
        style={{ transform: "rotate(180deg)" }}
      >
        <span>{parsed.rank}</span>
        <span className={s.suit}>{suit.symbol}</span>
      </span>
    </span>
  );

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

/** Tiny inline chip: card + short label for lists. */
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
