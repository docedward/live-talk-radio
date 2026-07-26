"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchHost,
  updateHostPage,
  type PublicHost,
} from "@/lib/api";

type Props = {
  slug: string;
};

/**
 * Public durable host page — schedule bulletin + Live now.
 * Host can edit with secret stored in localStorage.
 */
export function HostPage({ slug }: Props) {
  const [host, setHost] = useState<PublicHost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [bulletin, setBulletin] = useState("");
  const [dayNotice, setDayNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`ltr-host-page-${slug.toLowerCase()}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { hostSecret?: string };
        if (parsed.hostSecret) {
          setSecret(parsed.hostSecret);
          setIsOwner(true);
        }
      }
    } catch {
      /* ignore */
    }
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchHost(slug);
        if (cancelled) return;
        setHost(res.host);
        setBulletin(res.host.weeklyBulletin || "");
        setDayNotice(res.host.dayNotice || "");
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Not found");
          setHost(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const id = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [slug]);

  async function save(fields: {
    weeklyBulletin?: string;
    dayNotice?: string;
    removeCraftId?: string;
  }) {
    if (!secret) return;
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const res = await updateHostPage(slug, secret, fields);
      setHost(res.host);
      setBulletin(res.host.weeklyBulletin || "");
      setDayNotice(res.host.dayNotice || "");
      setNote(fields.removeCraftId ? "Craft removed" : "Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-sm text-[#4a3728]">
        Loading…
      </div>
    );
  }

  if (!host) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <h1 className="text-xl font-semibold text-[#1c1410]">Host not found</h1>
        <p className="mt-2 text-sm text-[#4a3728]">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-[#8b3a1a]">
          ← Shows
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-8">
      <Link
        href="/"
        className="radio-lcd text-xs uppercase tracking-[0.14em] text-[#8b3a1a] hover:underline"
      >
        ← Shows
      </Link>

      <header className="rounded-2xl border border-[#d4c4a8] bg-[#fffdf8] p-5 shadow-sm">
        <p className="radio-lcd text-[0.65rem] uppercase tracking-[0.2em] text-[#8b3a1a]">
          Live only · host page
        </p>
        <h1 className="mt-1 text-2xl tracking-wide text-[#1c1410]">
          {host.displayName}
        </h1>
        <p className="mt-0.5 font-mono text-sm text-[#6b5a48]">@{host.slug}</p>
        {host.liveRoomId ? (
          <div className="mt-4">
            <p className="text-sm font-semibold text-emerald-800">On air now</p>
            <Link
              href={host.liveUrl || `/room/${host.liveRoomId}`}
              className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-4 text-base font-semibold text-white hover:bg-emerald-500"
            >
              Join live show
            </Link>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[#4a3728]">
            Not live right now. Check the schedule below.
          </p>
        )}
      </header>

      {host.dayNotice ? (
        <div className="rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-950">
          Notice: {host.dayNotice}
        </div>
      ) : null}

      <section className="rounded-2xl border border-[#d4c4a8] bg-[#fffdf8] p-4">
        <h2 className="text-sm font-semibold text-[#1c1410]">This week</h2>
        {host.weeklyBulletin ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-[#2a1c12]">
            {host.weeklyBulletin}
          </p>
        ) : (
          <p className="mt-2 text-sm text-[#6b5a48]">No weekly note yet.</p>
        )}
      </section>

      <section className="rounded-2xl border border-[#d4c4a8] bg-[#fffdf8] p-4">
        <h2 className="text-sm font-semibold text-[#1c1410]">
          Community craft
        </h2>
        <p className="mt-1 text-[11px] text-[#4a3728]">
          Host-approved handmade emotes. Usable only while a show is live.
        </p>
        {(host.craftPack || []).length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {(host.craftPack || []).map((c) => (
              <div
                key={c.id}
                className="flex flex-col items-center gap-0.5 rounded-xl border border-[#d4c4a8] bg-white px-2 py-1.5"
              >
                <span className="text-2xl leading-none">{c.emoji}</span>
                <span className="max-w-[4.5rem] truncate text-[9px] text-[#6b5a48]">
                  {c.byName}
                </span>
                {isOwner && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save({ removeCraftId: c.id })}
                    className="text-[10px] font-semibold text-red-800 underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#6b5a48]">
            No craft emotes yet — suggest them during a live show.
          </p>
        )}
      </section>

      {isOwner && (
        <section className="rounded-2xl border border-[#d4c4a8] bg-[#f3e0c8]/40 p-4">
          <h2 className="text-sm font-semibold text-[#1c1410]">
            Host tools (you)
          </h2>
          <p className="mt-1 text-[11px] text-[#4a3728]">
            Weekly bulletin: once per week. Day-of notice: anytime (cancel /
            late).
          </p>
          <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-[#1c1410]">
            Weekly bulletin
            <textarea
              value={bulletin}
              onChange={(e) => setBulletin(e.target.value)}
              maxLength={500}
              rows={3}
              className="rounded-lg border border-[#d4c4a8] bg-white px-2 py-1.5 text-sm font-normal"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save({ weeklyBulletin: bulletin })}
            className="mt-2 min-h-9 rounded-lg bg-[#9a3f1c] px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            Save weekly bulletin
          </button>
          <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-[#1c1410]">
            Day-of notice
            <input
              value={dayNotice}
              onChange={(e) => setDayNotice(e.target.value)}
              maxLength={200}
              placeholder="e.g. Canceled tonight · back Friday"
              className="rounded-lg border border-[#d4c4a8] bg-white px-2 py-1.5 text-sm font-normal"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({ dayNotice })}
              className="min-h-9 rounded-lg bg-[#9a3f1c] px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              Save day notice
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDayNotice("");
                void save({ dayNotice: "" });
              }}
              className="min-h-9 rounded-lg border border-[#8b3a1a] bg-white px-3 text-xs font-semibold text-[#8b3a1a]"
            >
              Clear notice
            </button>
          </div>
          {note && (
            <p className="mt-2 text-xs font-medium text-emerald-800">{note}</p>
          )}
          {error && (
            <p className="mt-2 text-xs font-medium text-red-700">{error}</p>
          )}
          <p className="mt-3 text-[10px] text-[#6b5a48]">
            Public link:{" "}
            <span className="font-mono">/h/{host.slug}</span>
          </p>
        </section>
      )}

      {!isOwner && (
        <p className="text-center text-xs text-[#6b5a48]">
          Live only — no recording, no off-air chat.
        </p>
      )}
    </div>
  );
}
