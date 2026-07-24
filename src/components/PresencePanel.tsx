"use client";

import type { PresenceMember } from "@/lib/types";
import { PlayingCard } from "./PlayingCard";

type Props = {
  presence: PresenceMember[];
  listenerCount: number;
};

/**
 * Who is in the room right now — card face + name.
 */
export function PresencePanel({ presence, listenerCount }: Props) {
  const hosts = presence.filter((p) => p.role === "host");
  const listeners = presence.filter((p) => p.role === "listener");

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Who&apos;s here
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {listenerCount} listening
          {hosts.length > 0 ? ` · ${hosts.length} host` : ""}
        </p>
      </div>

      {presence.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          No one listed yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {hosts.map((p, i) => (
            <li
              key={`host-${p.displayName}-${p.avatarId || i}`}
              className="inline-flex items-center gap-2 rounded-full bg-violet-100 py-1 pl-1 pr-3 text-sm font-medium text-violet-900 dark:bg-violet-950 dark:text-violet-200"
            >
              <PlayingCard cardId={p.avatarId} size="xs" />
              <span>
                {p.displayName}
                <span className="ml-1 text-xs font-normal opacity-80">host</span>
              </span>
            </li>
          ))}
          {listeners.map((p, i) => (
            <li
              key={`listener-${p.displayName}-${p.avatarId || i}`}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-100 py-1 pl-1 pr-3 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <PlayingCard cardId={p.avatarId} size="xs" />
              <span>{p.displayName}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
