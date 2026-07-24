"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "@/lib/api";

/**
 * Host form: name the room, create it via HTTP, open the room.
 */
export function CreateRoomForm() {
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [hostName, setHostName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const result = await createRoom(roomName, hostName || "Host");
      localStorage.setItem(
        `ltr-host-${result.roomId}`,
        JSON.stringify({
          hostToken: result.hostToken,
          displayName: hostName.trim() || "Host",
        })
      );
      router.push(`/room/${result.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Create a room
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          You become the host. Share the link so listeners can join.
        </p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">
          Your name
        </span>
        <input
          value={hostName}
          onChange={(e) => setHostName(e.target.value)}
          placeholder="e.g. Dr. Ed"
          className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          maxLength={40}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">
          Room name
        </span>
        <input
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="e.g. Friday Night Q&A"
          required
          className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          maxLength={80}
        />
      </label>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !roomName.trim()}
        className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create room & go live"}
      </button>
    </form>
  );
}
