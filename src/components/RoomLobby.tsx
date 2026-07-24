"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RoomSnapshot } from "@/lib/types";
import { fetchSnapshot, joinRoom, leaveRoomBeacon } from "@/lib/api";
import { ChatPanel } from "./ChatPanel";
import { QuestionQueue } from "./QuestionQueue";
import { PresencePanel } from "./PresencePanel";
import { PresenceSfx } from "./PresenceSfx";
import { HostSoundboard } from "./HostSoundboard";
import { RoomSfxPlayer } from "./RoomSfxPlayer";
import { VoiceStage } from "./VoiceStage";
import { unlockPresenceAudio } from "@/lib/presence-sounds";

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

  // Tell the room we left when the tab closes (enables leave cannon for others).
  // Depend only on joined state — not full snapshot (poll would re-fire leave every 2s).
  const hasJoined = !!snapshot;
  useEffect(() => {
    if (!hasJoined) return;
    const onHide = () => {
      leaveRoomBeacon(roomId);
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      // Leaving the room page (not every poll)
      leaveRoomBeacon(roomId);
    };
  }, [hasJoined, roomId]);

  async function join(name: string, hostToken?: string) {
    setError(null);
    setJoining(true);
    void unlockPresenceAudio();

    // Old phones sometimes leave this stuck; always clear after a hard timeout.
    const stuckTimer = window.setTimeout(() => {
      setJoining(false);
    }, 20000);

    try {
      const safeName = (name || "").trim() || "Guest";
      const result = await joinRoom(roomId, safeName, hostToken);
      setSnapshot(result.snapshot);
      if (safeName) setDisplayName(safeName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join room");
    } finally {
      window.clearTimeout(stuckTimer);
      setJoining(false);
    }
  }

  async function shareOrCopyLink() {
    const url = window.location.href;
    const title = snapshot?.room.name || "Live Talk Radio";

    // Phones: system share sheet is easier than clipboard + tiny buttons
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url, text: `Join ${title}` });
        setShareNote("Share sheet opened.");
        return;
      } catch {
        /* cancelled or failed — fall through to copy */
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      const isLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      setShareNote(
        isLocal
          ? "Link copied (localhost). Phones need the HTTPS tunnel link."
          : "Link copied — paste it to listeners."
      );
    } catch {
      setShareNote(url);
    }
  }

  // Same join UI on server + first client paint (empty name until boot finishes)
  if (!snapshot) {
    const nameReady = displayName.trim().length > 0;
    // Only block while an in-flight join is running — never because of boot/name.
    // Empty name → "Guest" (server already accepts that). Old phones often never
    // filled the name field and saw a permanently grey button.
    const canTapEnter = !joining;

    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10">
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
              onInput={(e) =>
                setDisplayName((e.target as HTMLInputElement).value)
              }
              placeholder="Type your name (or leave blank)"
              autoComplete="nickname"
              autoCapitalize="words"
              enterKeyHint="go"
              className="min-h-12 rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              maxLength={40}
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Optional — if empty you join as &quot;Guest&quot;.
            </span>
          </label>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!canTapEnter}
            onClick={() =>
              void join(displayName.trim() || "Guest", hostCreds?.hostToken)
            }
            className="mt-4 min-h-12 w-full rounded-xl bg-violet-600 px-4 py-3 text-base font-semibold text-white hover:bg-violet-500 active:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {joining
              ? "Joining…"
              : nameReady
                ? "Enter room"
                : "Enter room as Guest"}
          </button>

          {joining && (
            <p className="mt-2 text-center text-xs text-zinc-500">
              Connecting… if this hangs, refresh the page and try again.
            </p>
          )}
        </div>
      </div>
    );
  }

  const isHost = snapshot.role === "host";
  const voice = snapshot.voice;
  const voiceEnabled = !!voice?.enabled;
  const canPublish = !!voice?.canPublish;
  const hostMuted = !!voice?.hostMuted;
  const livePanel =
    snapshot.livePanel ??
    (snapshot.liveOnAir ? [snapshot.liveOnAir] : []);
  const panelCap = snapshot.panelCap ?? 5;
  const iAmLive =
    !isHost &&
    livePanel.some(
      (r) => r.isMe === true || r.authorName === displayName
    );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-10 pt-0 sm:pt-6">
      {/* Sticky bar: always on screen on phones — share is not buried at top-right after scroll */}
      <div className="sticky top-0 z-40 -mx-4 border-b border-zinc-200 bg-zinc-50/95 px-4 py-3 backdrop-blur-md dark:border-zinc-800 dark:bg-black/95">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href="/"
              className="text-xs text-violet-700 hover:underline dark:text-violet-300"
            >
              ← Rooms
            </Link>
            <h1 className="truncate text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-xl">
              {snapshot.room.name}
            </h1>
            <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
              {isHost ? "Host" : "Listener"}
              {displayName ? ` · ${displayName}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void shareOrCopyLink()}
            className="min-h-12 shrink-0 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 active:bg-violet-700"
          >
            Share link
          </button>
        </div>
        {shareNote && (
          <p className="mt-2 break-all text-xs text-emerald-700 dark:text-emerald-300">
            {shareNote}
          </p>
        )}
      </div>

      {isHost && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-100">
          <strong>Host controls are on.</strong> Approve questions. Add
          listeners to the <strong>speaker panel</strong> (up to {panelCap}{" "}
          guests + you). Remove one or clear the whole panel anytime.
        </div>
      )}

      {isHost && <HostSoundboard roomId={roomId} />}

      <RoomSfxPlayer
        roomId={roomId}
        lastSfx={snapshot.lastSfx}
        isHost={isHost}
      />

      {iAmLive && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100">
          {voiceEnabled
            ? "You are on the speaker panel — allow the mic if prompted. Everyone in the room can hear you."
            : "You are on the panel (status only — voice is not configured)."}
        </div>
      )}

      <VoiceStage
        roomId={roomId}
        enabled={voiceEnabled}
        canPublish={canPublish}
        hostMuted={hostMuted}
      />

      <PresenceSfx
        presence={snapshot.presence}
        myName={displayName || "Guest"}
        myRole={snapshot.role}
      />

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
          initialLivePanel={livePanel}
          panelCap={panelCap}
        />
      </div>
    </div>
  );
}
