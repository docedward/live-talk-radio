"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "@/lib/api";
import { pickFreeCard, type CardId } from "@/lib/card-avatars";
import { CardAvatarPicker } from "./CardAvatarPicker";

/**
 * Host form: name the room, create it via HTTP, open the room.
 */
export function CreateRoomForm() {
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [hostName, setHostName] = useState("");
  const [avatarId, setAvatarId] = useState<CardId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ltr-avatar-id") as CardId | null;
      setAvatarId(saved || pickFreeCard([]));
    } catch {
      setAvatarId(pickFreeCard([]));
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const card = avatarId || pickFreeCard([]);
      const result = await createRoom(
        roomName,
        hostName || "Host",
        card
      );
      localStorage.setItem(
        `ltr-host-${result.roomId}`,
        JSON.stringify({
          hostToken: result.hostToken,
          displayName: hostName.trim() || "Host",
          avatarId: card,
        })
      );
      try {
        localStorage.setItem("ltr-avatar-id", card);
      } catch {
        /* ignore */
      }
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
        <p className="radio-lcd text-[0.65rem] uppercase tracking-[0.2em] text-[#8b3a1a]">
          Host booth
        </p>
        <h2 className="mt-1 text-xl tracking-wide text-[#1c1410]">
          Create a room
        </h2>
        <p className="mt-1 text-sm text-[#6b5a48]">
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

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
        <CardAvatarPicker
          value={avatarId}
          onChange={(id) => {
            setAvatarId(id);
            try {
              localStorage.setItem("ltr-avatar-id", id);
            } catch {
              /* ignore */
            }
          }}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !roomName.trim()}
        className="rounded-xl bg-[#9a3f1c] px-4 py-2.5 text-sm font-semibold text-[#fff8f0] transition hover:bg-[#b34d24] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create room & go live"}
      </button>
    </form>
  );
}
