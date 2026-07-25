"use client";

import { useEffect, useState } from "react";
import { updateShowPresence } from "@/lib/api";

type Props = {
  roomId: string;
  isHost: boolean;
  bulletin: string;
  dayNotice: string;
  onUpdated?: (fields: { bulletin: string; dayNotice: string }) => void;
};

/**
 * Live-show presence: weekly-ish bulletin + day-of emergency banner.
 * Ephemeral with the show process (not a blog).
 */
export function ShowBulletin({
  roomId,
  isHost,
  bulletin,
  dayNotice,
  onUpdated,
}: Props) {
  const [b, setB] = useState(bulletin);
  const [d, setD] = useState(dayNotice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setB(bulletin);
    setD(dayNotice);
  }, [bulletin, dayNotice]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await updateShowPresence(roomId, {
        bulletin: b,
        dayNotice: d,
      });
      onUpdated?.({
        bulletin: res.bulletin,
        dayNotice: res.dayNotice,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  if (!isHost && !dayNotice && !bulletin) return null;

  return (
    <div className="flex flex-col gap-2">
      {dayNotice ? (
        <div className="rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-950">
          Notice: {dayNotice}
        </div>
      ) : null}

      {bulletin && !isHost ? (
        <div className="rounded-xl border border-[#d4c4a8] bg-[#fffdf8] px-4 py-2 text-sm text-[#1c1410]">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#8b3a1a]">
            This show
          </p>
          <p className="mt-0.5 whitespace-pre-wrap">{bulletin}</p>
        </div>
      ) : null}

      {isHost && (
        <div className="rounded-xl border border-[#d4c4a8] bg-[#fffdf8] px-3 py-3">
          <p className="text-xs font-semibold text-[#1c1410]">
            Show board (not a blog)
          </p>
          <p className="mt-0.5 text-[11px] text-[#4a3728]">
            Lives with this live show only. Cleared when the show ends or the
            server restarts.
          </p>
          <label className="mt-2 flex flex-col gap-1 text-xs font-medium text-[#1c1410]">
            This week / about the show
            <textarea
              value={b}
              onChange={(e) => setB(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="e.g. Fridays · open Q&A on sleep"
              className="rounded-lg border border-[#d4c4a8] bg-white px-2 py-1.5 text-sm font-normal text-[#1c1410]"
            />
          </label>
          <label className="mt-2 flex flex-col gap-1 text-xs font-medium text-[#1c1410]">
            Day-of notice (cancel / late / reschedule)
            <input
              value={d}
              onChange={(e) => setD(e.target.value)}
              maxLength={200}
              placeholder="e.g. Starting 15 minutes late"
              className="rounded-lg border border-[#d4c4a8] bg-white px-2 py-1.5 text-sm font-normal text-[#1c1410]"
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="min-h-9 rounded-lg bg-[#9a3f1c] px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save board"}
            </button>
            {saved && (
              <span className="text-xs font-medium text-emerald-800">Saved</span>
            )}
            {error && (
              <span className="text-xs font-medium text-red-700">{error}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
