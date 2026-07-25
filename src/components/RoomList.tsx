"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchRooms, pingHealth, type PublicRoom } from "@/lib/api";

/**
 * Open shows list — plain HTTP (works on phones even when Socket.io cannot).
 */
export function RoomList() {
  const [shows, setShows] = useState<PublicRoom[]>([]);
  const [status, setStatus] = useState<"loading" | "online" | "error">(
    "loading"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        await pingHealth();
        const list = await fetchRooms();
        if (cancelled) return;
        setShows(list);
        setStatus("online");
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not load shows");
      }
    }

    tick();
    const id = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <section className="flex w-full flex-col gap-3 rounded-2xl border border-[#d4c4a8] bg-[#fffdf8] p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="radio-lcd text-[0.65rem] uppercase tracking-[0.2em] text-[#8b3a1a]">
            Live now
          </p>
          <h2 className="mt-1 text-xl tracking-wide text-[#1c1410]">
            Open shows
          </h2>
          <p className="mt-1 text-sm text-[#4a3728]">
            Join as a listener, or open a share link. Request on air to join the
            panel.
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            status === "online"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : status === "error"
                ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          }`}
        >
          {status === "online"
            ? "Online"
            : status === "error"
              ? "Offline"
              : "Checking…"}
        </span>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {shows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#d4c4a8] px-4 py-8 text-center text-sm text-[#4a3728]">
          No shows live right now. Create one to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shows.map((show) => (
            <li key={show.id}>
              <Link
                href={`/room/${show.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#d4c4a8] px-4 py-3 transition hover:border-[#9a3f1c] hover:bg-[#f3e0c8]/50"
              >
                <div>
                  <p className="font-medium text-[#1c1410]">{show.name}</p>
                  <p className="text-xs text-[#6b5a48]">Code: {show.id}</p>
                </div>
                <span className="text-xs font-semibold text-[#8b3a1a]">
                  {show.listenerCount} listening
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
