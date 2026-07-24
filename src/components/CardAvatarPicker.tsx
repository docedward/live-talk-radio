"use client";

import { useMemo, useState } from "react";
import {
  FULL_DECK,
  RANKS,
  SUITS,
  cardLabel,
  normalizeCardId,
  type CardId,
  type CardSuit,
} from "@/lib/card-avatars";
import { PlayingCard } from "./PlayingCard";

type Props = {
  value: string | null;
  onChange: (cardId: CardId) => void;
  /** Card IDs already claimed in the room (optional; join screen may not know). */
  takenIds?: string[];
  /** Compact = suit tabs; full = all suits stacked (default compact). */
  compact?: boolean;
};

/**
 * Premade deck picker — the card face is your avatar.
 */
export function CardAvatarPicker({
  value,
  onChange,
  takenIds = [],
  compact = true,
}: Props) {
  const [suitTab, setSuitTab] = useState<CardSuit>("S");
  const selected = normalizeCardId(value);
  const taken = useMemo(
    () =>
      new Set(
        takenIds
          .map((t) => normalizeCardId(t))
          .filter(Boolean) as CardId[]
      ),
    [takenIds]
  );

  const ranksForTab = useMemo(
    () => RANKS.map((r) => `${r}${suitTab}` as CardId),
    [suitTab]
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Your card avatar
        </span>
        {selected && (
          <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <PlayingCard cardId={selected} size="xs" />
            {cardLabel(selected)}
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Pick a playing card — that face is your avatar on the panel.
      </p>

      {compact ? (
        <>
          <div className="flex flex-wrap gap-1">
            {SUITS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSuitTab(s.id)}
                className={`min-h-9 rounded-lg px-3 text-sm font-semibold transition ${
                  suitTab === s.id
                    ? "bg-violet-600 text-white"
                    : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                } ${s.red && suitTab !== s.id ? "text-red-600 dark:text-red-400" : ""}`}
              >
                {s.symbol} {s.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ranksForTab.map((id) => (
              <PlayingCard
                key={id}
                cardId={id}
                size="md"
                selected={selected === id}
                taken={taken.has(id)}
                onClick={() => onChange(id)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="max-h-56 space-y-3 overflow-y-auto overscroll-contain pr-1">
          {SUITS.map((s) => (
            <div key={s.id}>
              <p
                className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${
                  s.red
                    ? "text-red-600 dark:text-red-400"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {s.symbol} {s.name}
              </p>
              <div className="flex flex-wrap gap-1">
                {RANKS.map((r) => {
                  const id = `${r}${s.id}` as CardId;
                  return (
                    <PlayingCard
                      key={id}
                      cardId={id}
                      size="sm"
                      selected={selected === id}
                      taken={taken.has(id)}
                      onClick={() => onChange(id)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hidden full list for a11y / no-JS-ish completeness */}
      <span className="sr-only">{FULL_DECK.length} cards available</span>
    </div>
  );
}
