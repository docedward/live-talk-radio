"use client";

import { useEffect, useState } from "react";
import { fetchPublicBase } from "@/lib/api";

/**
 * One clear public HTTPS link for Mac + phone + remote guests.
 * Tunnel must be running (phone-tunnel.sh) for this to show.
 */
export function PublicStartBanner() {
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchPublicBase();
        if (cancelled) return;
        setPublicUrl(res.url);
      } catch {
        if (!cancelled) setPublicUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyPublic() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setNote("Public link copied — send this to anyone (phone or remote).");
    } catch {
      setNote(publicUrl);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        Checking public link…
      </div>
    );
  }

  if (!publicUrl) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="font-semibold">No public link yet</p>
        <p className="mt-1">
          The Mac tunnel is not running. Without it, only this computer can
          open the app. Start the tunnel (see PHONE.md) so Share always works
          for phones and remote guests.
        </p>
      </div>
    );
  }

  const onPublic =
    typeof window !== "undefined" &&
    window.location.href.startsWith(publicUrl);

  return (
    <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-4 dark:border-emerald-800 dark:bg-emerald-950/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
        Always use this public link
      </p>
      <p className="mt-1 text-sm text-emerald-950 dark:text-emerald-50">
        Start on Mac or phone with the same address.{" "}
        <strong>Share link</strong> always sends this HTTPS URL (not
        localhost), so remote people can join.
      </p>
      <a
        href={publicUrl}
        className="mt-3 block break-all rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-500"
      >
        {publicUrl}
      </a>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copyPublic()}
          className="min-h-11 rounded-xl border border-emerald-400 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 dark:border-emerald-700 dark:bg-zinc-900 dark:text-emerald-100"
        >
          Copy public link
        </button>
        {!onPublic && (
          <a
            href={publicUrl}
            className="inline-flex min-h-11 items-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Open public app
          </a>
        )}
      </div>
      {note && (
        <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">
          {note}
        </p>
      )}
      {onPublic && (
        <p className="mt-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
          You are on the public link now — good. Create a room, then Share.
        </p>
      )}
    </div>
  );
}
