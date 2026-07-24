"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchRooms, pingHealth, type PublicRoom } from "@/lib/api";

/**
 * Open rooms list — uses plain HTTP (works on phones even when Socket.io cannot).
 */
export function RoomList() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
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
        setRooms(list);
        setStatus("online");
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not load rooms");
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
    <section className="flex w-full flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Open rooms
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Join as a listener — or open a share link someone sent you.
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

      {rooms.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No rooms yet. Create one to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rooms.map((room) => (
            <li key={room.id}>
              <Link
                href={`/room/${room.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 transition hover:border-violet-300 hover:bg-violet-50 dark:border-zinc-800 dark:hover:border-violet-700 dark:hover:bg-violet-950/40"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {room.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Code: {room.id}
                  </p>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {room.listenerCount} listening
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
