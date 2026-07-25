/**
 * Playing-card avatars for show identity.
 * Suit cards: "AS", "7H", "10D", "KC", "QH", "JS"
 * Jokers: "JR" (red), "JB" (black)
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

export type JokerId = "JR" | "JB";
export type CardId = `${CardRank}${CardSuit}` | JokerId;

export const SUITS: {
  id: CardSuit;
  symbol: string;
  name: string;
  red: boolean;
}[] = [
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

/** Face / people cards first in picker sections */
export const FACE_RANKS: CardRank[] = ["K", "Q", "J"];
export const PIP_RANKS: CardRank[] = [
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
];

export const JOKERS: { id: JokerId; label: string; red: boolean }[] = [
  { id: "JR", label: "Red Joker", red: true },
  { id: "JB", label: "Black Joker", red: false },
];

/** 52 suit cards + 2 jokers */
export const FULL_DECK: CardId[] = [
  ...SUITS.flatMap((s) => RANKS.map((r) => `${r}${s.id}` as CardId)),
  ...JOKERS.map((j) => j.id),
];

const SUIT_RE = /^(A|10|[2-9JQK])([SHDC])$/;
const JOKER_RE = /^J([RB])$/;

export function isJokerId(id: string | null | undefined): id is JokerId {
  return id === "JR" || id === "JB";
}

export function parseCardId(id: string | null | undefined):
  | { kind: "suit"; rank: CardRank; suit: CardSuit }
  | { kind: "joker"; id: JokerId; red: boolean }
  | null {
  if (!id) return null;
  const raw = String(id).trim().toUpperCase();
  const j = raw.match(JOKER_RE);
  if (j) {
    const jid = `J${j[1]}` as JokerId;
    return { kind: "joker", id: jid, red: j[1] === "R" };
  }
  const m = raw.match(SUIT_RE);
  if (!m) return null;
  return { kind: "suit", rank: m[1] as CardRank, suit: m[2] as CardSuit };
}

export function isValidCardId(id: string | null | undefined): id is CardId {
  return parseCardId(id) !== null;
}

export function normalizeCardId(id: string | null | undefined): CardId | null {
  const p = parseCardId(id);
  if (!p) return null;
  if (p.kind === "joker") return p.id;
  return `${p.rank}${p.suit}` as CardId;
}

export function suitMeta(suit: CardSuit) {
  return SUITS.find((s) => s.id === suit)!;
}

export function isFaceRank(rank: CardRank): boolean {
  return rank === "J" || rank === "Q" || rank === "K";
}

export function cardLabel(id: string | null | undefined): string {
  const p = parseCardId(id);
  if (!p) return "Card";
  if (p.kind === "joker") return p.red ? "Red Joker" : "Black Joker";
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
  if (p.kind === "joker") return p.red ? "🃏R" : "🃏B";
  return `${p.rank}${suitMeta(p.suit).symbol}`;
}

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
