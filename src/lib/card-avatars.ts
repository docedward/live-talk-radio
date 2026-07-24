/**
 * Premade playing-card avatars for panel / room identity.
 * IDs look like "AS" (Ace of Spades), "7H" (7 of Hearts), "10D", "KC".
 */

export type CardSuit = "S" | "H" | "D" | "C";
export type CardRank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export type CardId = `${CardRank}${CardSuit}`;

export const SUITS: { id: CardSuit; symbol: string; name: string; red: boolean }[] =
  [
    { id: "S", symbol: "♠", name: "Spades", red: false },
    { id: "H", symbol: "♥", name: "Hearts", red: true },
    { id: "D", symbol: "♦", name: "Diamonds", red: true },
    { id: "C", symbol: "♣", name: "Clubs", red: false },
  ];

export const RANKS: CardRank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

/** Full 52-card deck, suit-major order (♠♥♦♣). */
export const FULL_DECK: CardId[] = SUITS.flatMap((s) =>
  RANKS.map((r) => `${r}${s.id}` as CardId)
);

const CARD_RE = /^(A|10|[2-9JQK])([SHDC])$/;

export function parseCardId(id: string | null | undefined): {
  rank: CardRank;
  suit: CardSuit;
} | null {
  if (!id) return null;
  const m = String(id).trim().toUpperCase().match(CARD_RE);
  if (!m) return null;
  return { rank: m[1] as CardRank, suit: m[2] as CardSuit };
}

export function isValidCardId(id: string | null | undefined): id is CardId {
  return parseCardId(id) !== null;
}

export function normalizeCardId(id: string | null | undefined): CardId | null {
  const p = parseCardId(id);
  if (!p) return null;
  return `${p.rank}${p.suit}` as CardId;
}

export function suitMeta(suit: CardSuit) {
  return SUITS.find((s) => s.id === suit)!;
}

export function cardLabel(id: string | null | undefined): string {
  const p = parseCardId(id);
  if (!p) return "Card";
  const suit = suitMeta(p.suit);
  const rankName =
    p.rank === "A"
      ? "Ace"
      : p.rank === "J"
        ? "Jack"
        : p.rank === "Q"
          ? "Queen"
          : p.rank === "K"
            ? "King"
            : p.rank;
  return `${rankName} of ${suit.name}`;
}

export function cardShortLabel(id: string | null | undefined): string {
  const p = parseCardId(id);
  if (!p) return "?";
  return `${p.rank}${suitMeta(p.suit).symbol}`;
}

/** Pick a free card (not in taken set); falls back to any valid deck card. */
export function pickFreeCard(taken: Iterable<string>): CardId {
  const used = new Set(
    Array.from(taken)
      .map((t) => normalizeCardId(t))
      .filter(Boolean) as CardId[]
  );
  const free = FULL_DECK.filter((c) => !used.has(c));
  const pool = free.length > 0 ? free : FULL_DECK;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
