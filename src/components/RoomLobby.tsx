"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RoomSnapshot } from "@/lib/types";
import { fetchSnapshot, joinRoom } from "@/lib/api";
import { ChatPanel } from "./ChatPanel";
import { QuestionQueue } from "./QuestionQueue";
import { PresencePanel } from "./PresencePanel";

type Props = {
  roomId: string;
};

type HostCreds = {
  hostToken: string;
  displayName: string;
};

function loadHostCreds(roomId: string): HostCreds | null {
  try {
    const raw = localStorage.getItem(`ltr-host-${roomId}`);
    if (!raw) return null;
    return JSON.parse(raw) as HostCreds;
  } catch {
    return null;
  }
}

/**
 * Join gate + room.
 * Host creds are read only after mount so server HTML matches the first client paint
 * (avoids the scary Next.js hydration error overlay on phones).
 */
export function RoomLobby({ roomId }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [hostCreds, setHostCreds] = useState<HostCreds | null>(null);
  const [booted, setBooted] = useState(false);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  // Client-only boot: localStorage is never read during SSR
  useEffect(() => {
    const creds = loadHostCreds(roomId);
    setHostCreds(creds);
    if (creds?.displayName) {
      setDisplayName(creds.displayName);
    }
    setBooted(true);
  }, [roomId]);

  // Auto-join hosts after boot
  useEffect(() => {
    if (!booted || !hostCreds || snapshot) return;
    void join(hostCreds.displayName, hostCreds.hostToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, hostCreds]);

  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;

    async function poll() {
      try {
        const result = await fetchSnapshot(roomId);
        if (cancelled) return;
        setSnapshot(result.snapshot);
      } catch {
        /* keep last good snapshot */
      }
    }

    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [snapshot, roomId]);

  async function join(name: string, hostToken?: string) {
    setError(null);
    setJoining(true);

    try {
      const result = await joinRoom(roomId, name, hostToken);
      setSnapshot(result.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join room");
    } finally {
      setJoining(false);
    }
  }

  async function copyLink() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied — send it to listeners.");
    } catch {
      setShareNote(url);
    }
  }

  // Same join UI on server + first client paint (empty name until boot finishes)
  if (!snapshot) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-16">
        <Link
          href="/"
          className="text-sm text-violet-700 hover:underline dark:text-violet-300"
        >
          ← Back to rooms
        </Link>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Join room
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Room code: <span className="font-mono">{roomId}</span>
          </p>

          <label className="mt-4 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              Your display name
            </span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex"
              autoComplete="nickname"
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              maxLength={40}
            />
          </label>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={joining || !booted || !displayName.trim()}
            onClick={() => join(displayName.trim())}
            className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {joining || (booted && hostCreds) ? "Joining…" : "Enter room"}
          </button>
        </div>
      </div>
    );
  }

  const isHost = snapshot.role === "host";
  const iAmLive =
    !isHost &&
    !!snapshot.liveOnAir &&
    snapshot.liveOnAir.authorName === displayName;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/"
            className="text-sm text-violet-700 hover:underline dark:text-violet-300"
          >
            ← All rooms
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {snapshot.room.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            You are the{" "}
            <span
              className={
                isHost
                  ? "font-semibold text-violet-700 dark:text-violet-300"
                  : "font-semibold"
              }
            >
              {isHost ? "host" : "listener"}
            </span>
            {displayName ? ` · ${displayName}` : ""}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Copy share link
          </button>
          {shareNote && (
            <p className="max-w-xs text-right text-xs text-emerald-700 dark:text-emerald-300">
              {shareNote}
            </p>
          )}
        </div>
      </div>

      {isHost && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-100">
          <strong>Host controls are on.</strong> Approve or reject questions.
          On Air only happens when a listener requests it and you put them on.
        </div>
      )}

      {iAmLive && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100">
          You are On Air right now — the host and room can see you featured.
        </div>
      )}

      <PresencePanel
        presence={snapshot.presence}
        listenerCount={snapshot.listenerCount}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChatPanel roomId={roomId} initialMessages={snapshot.messages} />
        <QuestionQueue
          roomId={roomId}
          role={snapshot.role}
          initialQuestions={snapshot.questions}
          initialOnAirRequests={snapshot.onAirRequests}
          initialLiveOnAir={snapshot.liveOnAir}
        />
      </div>
    </div>
  );
}
