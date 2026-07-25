"use client";

import { useMemo, useState } from "react";
import {
  FACE_RANKS,
  JOKERS,
  PIP_RANKS,
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
  takenIds?: string[];
};

type Tab = CardSuit | "people" | "jokers";

/**
 * Card avatar picker — suits, people cards (K/Q/J), and jokers.
 */
export function CardAvatarPicker({
  value,
  onChange,
  takenIds = [],
}: Props) {
  const [tab, setTab] = useState<Tab>("people");
  const selected = normalizeCardId(value);
  const taken = useMemo(
    () =>
      new Set(
        takenIds.map((t) => normalizeCardId(t)).filter(Boolean) as CardId[]
      ),
    [takenIds]
  );

  const suitCards = useMemo(() => {
    if (tab === "people" || tab === "jokers") return [] as CardId[];
    return [
      ...FACE_RANKS.map((r) => `${r}${tab}` as CardId),
      ...PIP_RANKS.map((r) => `${r}${tab}` as CardId),
    ];
  }, [tab]);

  const peopleCards = useMemo(
    () =>
      SUITS.flatMap((s) =>
        FACE_RANKS.map((r) => `${r}${s.id}` as CardId)
      ),
    []
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[#1c1410]">
          Your card avatar
        </span>
        {selected && (
          <span className="flex items-center gap-1.5 text-xs text-[#4a3728]">
            <PlayingCard cardId={selected} size="sm" />
            {cardLabel(selected)}
          </span>
        )}
      </div>
      <p className="text-xs text-[#4a3728]">
        Pick a card — including Kings, Queens, Jacks, and Jokers. That face is
        you on the panel.
      </p>

      <div className="flex flex-wrap gap-1">
        <TabBtn
          active={tab === "people"}
          onClick={() => setTab("people")}
          label="People K·Q·J"
        />
        <TabBtn
          active={tab === "jokers"}
          onClick={() => setTab("jokers")}
          label="Jokers"
        />
        {SUITS.map((s) => (
          <TabBtn
            key={s.id}
            active={tab === s.id}
            onClick={() => setTab(s.id)}
            label={`${s.symbol} ${s.name}`}
            red={s.red}
          />
        ))}
      </div>

      {tab === "people" && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#6b5a48]">
            Court cards — King · Queen · Jack
          </p>
          <div className="flex flex-wrap gap-1.5">
            {peopleCards.map((id) => (
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
        </div>
      )}

      {tab === "jokers" && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#6b5a48]">
            Wild cards
          </p>
          <div className="flex flex-wrap gap-2">
            {JOKERS.map((j) => (
              <PlayingCard
                key={j.id}
                cardId={j.id}
                size="lg"
                selected={selected === j.id}
                taken={taken.has(j.id)}
                onClick={() => onChange(j.id)}
              />
            ))}
          </div>
        </div>
      )}

      {tab !== "people" && tab !== "jokers" && (
        <div className="flex flex-wrap gap-1.5">
          {suitCards.map((id) => (
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
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  red,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  red?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold transition sm:px-3 sm:text-sm ${
        active
          ? "bg-[#9a3f1c] text-white"
          : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
      } ${red && !active ? "text-red-600" : ""}`}
    >
      {label}
    </button>
  );
}
