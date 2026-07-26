"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  moderateCraftEmote,
  submitCraftEmote,
} from "@/lib/api";
import type { CraftEmote } from "@/lib/types";
import { sendEmote, subscribeEmotes } from "@/lib/emote-bus";
import { PlayingCard } from "./PlayingCard";

const STOCK_EMOTES = ["👏", "😂", "😮", "🔥", "👎", "❤️", "🎉", "🙌"] as const;

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
  roomId: string;
  role?: "host" | "listener";
  myName?: string;
  myAvatarId?: string | null;
  craftPack?: CraftEmote[];
  craftPending?: CraftEmote[];
  onCraftChange?: (pack: CraftEmote[], pending: CraftEmote[]) => void;
};

/**
 * Applause rail — stock + host-curated craft pack; floats with card + name.
 */
export function EmoteRail({
  roomId,
  role = "listener",
  myName = "Guest",
  myAvatarId = null,
  craftPack = [],
  craftPending = [],
  onCraftChange,
}: Props) {
  const [floats, setFloats] = useState<Floaty[]>([]);
  const [cooldown, setCooldown] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [suggest, setSuggest] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pack, setPack] = useState(craftPack);
  const [pending, setPending] = useState(craftPending);

  useEffect(() => {
    setPack(craftPack);
  }, [craftPack]);

  useEffect(() => {
    setPending(craftPending);
  }, [craftPending]);

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

  function applySnapshot(snap: {
    craftPack?: CraftEmote[];
    craftPending?: CraftEmote[];
  }) {
    const nextPack = snap.craftPack || [];
    const nextPending = snap.craftPending || [];
    setPack(nextPack);
    setPending(nextPending);
    onCraftChange?.(nextPack, nextPending);
  }

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

  async function onSuggest(e: React.FormEvent) {
    e.preventDefault();
    if (!suggest.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await submitCraftEmote(roomId, suggest.trim(), label.trim());
      applySnapshot(res.snapshot);
      setSuggest("");
      setLabel("");
      setNote(
        res.status === "pending" || res.craft.status === "pending"
          ? "Sent to host for approval"
          : "Added to craft pack"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  async function moderate(
    craftId: string,
    action: "approve" | "reject" | "remove"
  ) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await moderateCraftEmote(roomId, craftId, action);
      applySnapshot(res.snapshot);
      setNote(
        action === "approve"
          ? "Approved — in the pack"
          : action === "reject"
            ? "Rejected"
            : "Removed from pack"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
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
          {STOCK_EMOTES.map((e) => (
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

        {pack.length > 0 && (
          <div className="mt-3 border-t border-[#d4c4a8] pt-2.5">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8b3a1a]">
                Community craft
              </h3>
              <p className="text-[10px] text-[#4a3728]">
                Host-approved · this show
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pack.map((c) => (
                <div key={c.id} className="relative">
                  <button
                    type="button"
                    disabled={cooldown}
                    onClick={() => fire(c.emoji)}
                    title={
                      c.label
                        ? `${c.label} · by ${c.byName}`
                        : `by ${c.byName}`
                    }
                    className="flex h-11 min-w-11 items-center justify-center rounded-xl border-2 border-[#9a3f1c]/50 bg-[#f3e0c8]/60 px-1.5 text-xl shadow-sm active:scale-95 disabled:opacity-50"
                    aria-label={`Craft ${c.emoji}`}
                  >
                    {c.emoji}
                  </button>
                  {role === "host" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void moderate(c.id, "remove")}
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#5c2814] text-[9px] font-bold text-white"
                      title="Remove from pack"
                      aria-label="Remove craft"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {role === "host" && pending.length > 0 && (
          <div className="mt-3 rounded-xl border border-[#d4a574] bg-[#f3e0c8]/50 px-2.5 py-2">
            <h3 className="text-xs font-semibold text-[#1c1410]">
              Craft queue ({pending.length})
            </h3>
            <ul className="mt-1.5 space-y-1.5">
              {pending.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="text-xl leading-none">{c.emoji}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-[#2a1c12]">
                    {c.label ? `${c.label} · ` : ""}
                    {c.byName}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void moderate(c.id, "approve")}
                    className="min-h-8 rounded-lg bg-emerald-700 px-2 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void moderate(c.id, "reject")}
                    className="min-h-8 rounded-lg border border-[#8b3a1a] bg-white px-2 text-[11px] font-semibold text-[#8b3a1a] disabled:opacity-50"
                  >
                    No
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {role === "listener" && pending.length > 0 && (
          <p className="mt-2 text-[11px] font-medium text-[#6b5a48]">
            Your craft idea is waiting for the host…
            {pending.map((c) => (
              <span key={c.id} className="ml-1 text-base">
                {c.emoji}
              </span>
            ))}
          </p>
        )}

        <form
          onSubmit={(e) => void onSuggest(e)}
          className="mt-3 flex flex-col gap-1.5 border-t border-[#d4c4a8] pt-2.5"
        >
          <p className="text-[11px] font-medium text-[#4a3728]">
            {role === "host"
              ? "Add a craft emote to the pack (auto-approved)."
              : "Suggest a handmade emote — host curates the pack."}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <input
              value={suggest}
              onChange={(e) => setSuggest(e.target.value)}
              placeholder="Emoji"
              maxLength={12}
              className="w-16 rounded-lg border border-[#d4c4a8] bg-white px-2 py-1.5 text-center text-lg"
              aria-label="Craft emoji"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Optional label"
              maxLength={24}
              className="min-w-0 flex-1 rounded-lg border border-[#d4c4a8] bg-white px-2 py-1.5 text-xs"
            />
            <button
              type="submit"
              disabled={busy || !suggest.trim()}
              className="min-h-9 rounded-lg bg-[#9a3f1c] px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {role === "host" ? "Add" : "Suggest"}
            </button>
          </div>
          {note && (
            <p className="text-[11px] font-medium text-emerald-800">{note}</p>
          )}
          {error && (
            <p className="text-[11px] font-medium text-red-700">{error}</p>
          )}
        </form>
      </section>
      {overlay}
    </>
  );
}
