"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RoomSnapshot } from "@/lib/types";
import {
  fetchSnapshot,
  getShareableRoomUrl,
  joinRoom,
  leaveRoom,
  leaveRoomBeacon,
  endShow,
} from "@/lib/api";
import { pickFreeCard, type CardId } from "@/lib/card-avatars";
import { ChatPanel } from "./ChatPanel";
import { QuestionQueue } from "./QuestionQueue";
import { PresencePanel } from "./PresencePanel";
import { PresenceSfx } from "./PresenceSfx";
import { HostSoundboard } from "./HostSoundboard";
import { RoomSfxPlayer } from "./RoomSfxPlayer";
import { VoiceStage } from "./VoiceStage";
import { CardAvatarPicker } from "./CardAvatarPicker";
import { PlayingCard } from "./PlayingCard";
import { EmoteRail } from "./EmoteRail";
import { RoomFaq } from "./RoomFaq";
import { ShowBulletin } from "./ShowBulletin";
import { unlockRoomAudio } from "@/lib/room-audio";

type Props = {
  roomId: string;
};

type HostCreds = {
  hostToken: string;
  displayName: string;
  avatarId?: string;
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

function loadSavedAvatar(): CardId | null {
  try {
    const raw = localStorage.getItem("ltr-avatar-id");
    if (!raw) return null;
    return (raw as CardId) || null;
  } catch {
    return null;
  }
}

function saveAvatar(id: string) {
  try {
    localStorage.setItem("ltr-avatar-id", id);
  } catch {
    /* ignore */
  }
}

/**
 * Join gate + room.
 * Host creds are read only after mount so server HTML matches the first client paint
 * (avoids the scary Next.js hydration error overlay on phones).
 */
export function RoomLobby({ roomId }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [avatarId, setAvatarId] = useState<CardId | null>(null);
  const [hostCreds, setHostCreds] = useState<HostCreds | null>(null);
  const [booted, setBooted] = useState(false);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [joining, setJoining] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [controlNote, setControlNote] = useState<string | null>(null);
  /** Always-visible share URL in sticky bar (host doesn't scroll for it). */
  const [roomLink, setRoomLink] = useState<string | null>(null);
  /** Listen mode: compact radio face (listeners). Host always full. */
  const [listenMode, setListenMode] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  /** Blink FAQ button for 5s after entering the room. */
  const [faqBlink, setFaqBlink] = useState(false);
  /** Chat demoted — collapsed by default (panel-first). */
  const [chatOpen, setChatOpen] = useState(false);
  const [showEnded, setShowEnded] = useState(false);

  // Client-only boot: localStorage is never read during SSR
  useEffect(() => {
    const creds = loadHostCreds(roomId);
    setHostCreds(creds);
    if (creds?.displayName) {
      setDisplayName(creds.displayName);
    }
    const saved =
      (creds?.avatarId as CardId | undefined) || loadSavedAvatar() || pickFreeCard([]);
    setAvatarId(saved);
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("mode") === "listen") setListenMode(true);
      else if (sessionStorage.getItem(`ltr-listen-${roomId}`) === "1") {
        setListenMode(true);
      }
    } catch {
      /* ignore */
    }
    setBooted(true);
  }, [roomId]);

  // Auto-join hosts after boot
  useEffect(() => {
    if (!booted || !hostCreds || snapshot || !avatarId) return;
    void join(
      hostCreds.displayName,
      hostCreds.hostToken,
      (hostCreds.avatarId as CardId) || avatarId
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, hostCreds, avatarId]);

  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;

    async function rejoinControl() {
      const creds = loadHostCreds(roomId);
      const name =
        (displayName || creds?.displayName || "Guest").trim() || "Guest";
      const card =
        avatarId ||
        (creds?.avatarId as CardId | undefined) ||
        loadSavedAvatar() ||
        undefined;
      try {
        const result = await joinRoom(roomId, name, creds?.hostToken, card);
        if (cancelled) return;
        setSnapshot(result.snapshot);
        setControlNote(null);
      } catch {
        if (!cancelled) {
          setControlNote(
            "Connection to room controls dropped. Voice may still work — tap Refresh page if mute/board fail."
          );
        }
      }
    }

    async function poll() {
      try {
        const result = await fetchSnapshot(roomId);
        if (cancelled) return;
        setSnapshot(result.snapshot);
        setControlNote(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        // Session dropped from server (stale) but user still on page / in LiveKit
        if (/show has ended|show not found|room not found/i.test(msg)) {
          if (!cancelled) {
            setShowEnded(true);
            setSnapshot(null);
          }
        } else if (
          /not in this (room|show)|join first/i.test(msg)
        ) {
          await rejoinControl();
        } else if (!cancelled) {
          setControlNote(
            "Reconnecting show controls… (voice may still work)"
          );
        }
      }
    }

    // Faster heartbeat so flaky tunnels less often mark listeners "gone"
    const id = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [snapshot, roomId, displayName, avatarId]);

  // Only leave on real tab close — not pagehide (phones fire that when backgrounding).
  const hasJoined = !!snapshot;
  useEffect(() => {
    if (!hasJoined) return;
    const onUnload = () => {
      leaveRoomBeacon(roomId);
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      leaveRoomBeacon(roomId);
    };
  }, [hasJoined, roomId]);

  // Keep guest/host share link in the sticky bar (refresh if tunnel base changes).
  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    async function loadLink() {
      try {
        const url = await getShareableRoomUrl();
        if (!cancelled) setRoomLink(url);
      } catch {
        if (!cancelled && typeof window !== "undefined") {
          setRoomLink(window.location.href);
        }
      }
    }
    void loadLink();
    const id = setInterval(loadLink, 12_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [snapshot, roomId]);

  // Blink FAQ for 5 seconds when first entering the room this session
  useEffect(() => {
    if (!snapshot) return;
    let skip = false;
    try {
      skip = sessionStorage.getItem(`ltr-faq-blinked-${roomId}`) === "1";
    } catch {
      /* ignore */
    }
    if (skip) return;
    setFaqBlink(true);
    try {
      sessionStorage.setItem(`ltr-faq-blinked-${roomId}`, "1");
    } catch {
      /* ignore */
    }
    const t = window.setTimeout(() => setFaqBlink(false), 5000);
    return () => window.clearTimeout(t);
  }, [snapshot, roomId]);

  async function join(name: string, hostToken?: string, card?: CardId | null) {
    setError(null);
    setJoining(true);
    // Join tap = user gesture → unlock speakers so voice + soundboard auto-play
    void unlockRoomAudio();

    // Old phones sometimes leave this stuck; always clear after a hard timeout.
    const stuckTimer = window.setTimeout(() => {
      setJoining(false);
    }, 20000);

    try {
      const safeName = (name || "").trim() || "Guest";
      const cardToUse = card || avatarId || pickFreeCard([]);
      const result = await joinRoom(
        roomId,
        safeName,
        hostToken,
        cardToUse || undefined
      );
      setSnapshot(result.snapshot);
      if (safeName) setDisplayName(safeName);
      if (cardToUse) {
        setAvatarId(cardToUse);
        saveAvatar(cardToUse);
      }
      // Reflect server-assigned card if random fallback happened
      const me = result.snapshot.presence.find(
        (p) => p.displayName === safeName
      );
      if (me?.avatarId) {
        setAvatarId(me.avatarId as CardId);
        saveAvatar(me.avatarId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join room");
    } finally {
      window.clearTimeout(stuckTimer);
      setJoining(false);
    }
  }

  async function resolveRoomLink(): Promise<string> {
    const url = await getShareableRoomUrl();
    setRoomLink(url);
    return url;
  }

  async function copyRoomLink() {
    const url = roomLink || (await resolveRoomLink());
    const isPublic = url.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(url);
    try {
      await navigator.clipboard.writeText(url);
      setShareNote(
        isPublic
          ? "Link copied — send to guests."
          : "Copied localhost only — remote guests need https:// (tunnel)."
      );
    } catch {
      setShareNote(url);
    }
  }

  async function shareOrCopyLink() {
    const title = snapshot?.room.name || "Live Talk Radio";
    // Remote guests cannot open localhost — use public HTTPS tunnel when available
    const url = await resolveRoomLink();
    const isPublic = url.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(url);

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({
          title,
          url,
          text: `Live right now — listen or request to join the panel: ${url}`,
        });
        setShareNote(
          isPublic
            ? "Share sheet opened — guests can listen or request the panel."
            : "Shared — remote people need an https:// link."
        );
        return;
      } catch {
        /* cancelled or failed — fall through to copy */
      }
    }

    await copyRoomLink();
  }

  /**
   * Exit: leave the show; it stays open.
   * Host exit promotes a live panel member to host when possible.
   */
  async function exitRoom() {
    if (exiting) return;
    setExiting(true);
    setError(null);
    try {
      await leaveRoom(roomId);
    } catch {
      /* still navigate home */
    }
    // Keep hostToken in localStorage so the original host can rejoin as host
    // if no panelist was promoted / they return later.
    router.push("/");
  }

  /** Host only: end show for everyone — removed from open shows, not joinable. */
  async function endShowForAll() {
    if (exiting) return;
    const ok = window.confirm(
      "End this show for everyone? People cannot rejoin this show link."
    );
    if (!ok) return;
    setExiting(true);
    setError(null);
    try {
      await endShow(roomId);
    } catch {
      /* still leave UI */
    }
    try {
      localStorage.removeItem(`ltr-host-${roomId}`);
    } catch {
      /* ignore */
    }
    router.push("/");
  }

  // Same join UI on server + first client paint (empty name until boot finishes)
  if (!snapshot) {
    if (showEnded) {
      return (
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10">
          <div className="rounded-2xl border border-[#d4c4a8] bg-[#fffdf8] p-6 text-center shadow-sm">
            <p className="radio-lcd text-[0.65rem] uppercase tracking-[0.2em] text-[#8b3a1a]">
              Live only
            </p>
            <h1 className="mt-2 text-2xl tracking-wide text-[#1c1410]">
              This show has ended
            </h1>
            <p className="mt-2 text-sm text-[#4a3728]">
              The host closed the booth. Nothing was recorded.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#9a3f1c] px-4 text-sm font-semibold text-white"
            >
              Back to shows
            </Link>
          </div>
        </div>
      );
    }

    const nameReady = displayName.trim().length > 0;
    // Only block while an in-flight join is running — never because of boot/name.
    // Empty name → "Guest" (server already accepts that). Old phones often never
    // filled the name field and saw a permanently grey button.
    const canTapEnter = !joining;

    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8">
        <Link
          href="/"
          className="radio-lcd text-xs uppercase tracking-[0.14em] text-[#8b3a1a] hover:underline"
        >
          ← Back to shows
        </Link>
        <div className="rounded-2xl border border-[#d4c4a8] bg-[#fffdf8] p-6 shadow-sm">
          <p className="radio-lcd text-[0.65rem] uppercase tracking-[0.2em] text-[#8b3a1a]">
            Live only · no recording
          </p>
          <h1 className="mt-1 text-2xl tracking-wide text-[#1c1410]">
            Join show
          </h1>
          <p className="mt-1 text-sm text-[#4a3728]">
            Show code:{" "}
            <span className="radio-lcd tracking-wider text-[#1c1410]">
              {roomId}
            </span>
          </p>
          <p className="mt-2 text-xs text-[#4a3728]">
            You are here now. Request on air to join the panel and talk with the
            host.
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

          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
            <CardAvatarPicker
              value={avatarId}
              onChange={(id) => {
                setAvatarId(id);
                saveAvatar(id);
              }}
            />
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!canTapEnter}
            onClick={() =>
              void join(
                displayName.trim() || "Guest",
                hostCreds?.hostToken,
                avatarId
              )
            }
            className="mt-4 min-h-12 w-full rounded-xl bg-[#9a3f1c] px-4 py-3 text-base font-semibold text-[#fff8f0] hover:bg-[#b34d24] active:bg-[#7a3216] disabled:cursor-not-allowed disabled:opacity-50"
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
  // Host never forced into listen mode; listeners can compact
  const compact = !isHost && listenMode;

  function setListen(next: boolean) {
    setListenMode(next);
    try {
      sessionStorage.setItem(`ltr-listen-${roomId}`, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  const faqRole: "host" | "listener" | "panel" = isHost
    ? "host"
    : iAmLive
      ? "panel"
      : "listener";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-10 pt-0 sm:pt-6">
      <RoomFaq
        open={faqOpen}
        onClose={() => setFaqOpen(false)}
        role={faqRole}
      />
      {/* Sticky bar: room link always visible — no scroll to share */}
      <div className="radio-sticky sticky top-0 z-40 -mx-4 border-b border-[#d4c4a8] bg-[#faf6ee]/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href="/"
              className="radio-lcd text-[0.65rem] uppercase tracking-[0.14em] text-[#8b3a1a] hover:underline"
            >
              ← Rooms
            </Link>
            <h1 className="truncate text-base tracking-wide text-[#1c1410] sm:text-xl">
              {snapshot.room.name}
            </h1>
            <p className="flex items-center gap-1.5 truncate text-xs text-[#6b5a48]">
              {avatarId && <PlayingCard cardId={avatarId} size="xs" />}
              <span className="radio-lcd truncate tracking-wide">
                {isHost ? "HOST" : "LISTENER"}
                {displayName ? ` · ${displayName}` : ""}
                {compact ? " · LISTEN" : ""}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
            {!isHost && (
              <button
                type="button"
                onClick={() => setListen(!compact)}
                className="min-h-11 rounded-xl border border-[#8b3a1a] bg-[#f3e0c8] px-3 py-2.5 text-sm font-semibold text-[#5c2814] hover:bg-[#e8d0b0] sm:px-4"
              >
                {compact ? "Full tools" : "Just listen"}
              </button>
            )}
            {!compact && (
              <button
                type="button"
                onClick={() => void shareOrCopyLink()}
                className="min-h-11 rounded-xl bg-[#9a3f1c] px-3 py-2.5 text-sm font-semibold text-[#fff8f0] shadow-sm hover:bg-[#b34d24] active:bg-[#7a3216] sm:px-4"
              >
                Share
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setFaqBlink(false);
                setFaqOpen(true);
              }}
              className={`min-h-11 rounded-xl border border-[#8b3a1a] px-3 py-2.5 text-sm font-semibold text-[#5c2814] sm:px-4 ${
                faqBlink
                  ? "trl-faq-blink border-[#c47a10] font-bold text-[#1c1410]"
                  : "bg-[#f3e0c8] hover:bg-[#e8d0b0]"
              }`}
              aria-haspopup="dialog"
              aria-expanded={faqOpen}
            >
              FAQ
            </button>
            {isHost && (
              <button
                type="button"
                disabled={exiting}
                onClick={() => void endShowForAll()}
                className="min-h-11 rounded-xl border border-red-700 bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50 sm:px-4"
                title="Close the show for everyone — link no longer works"
              >
                {exiting ? "…" : "End show"}
              </button>
            )}
            <button
              type="button"
              disabled={exiting}
              onClick={() => void exitRoom()}
              className="min-h-11 rounded-xl border border-[#8b3a1a] bg-white px-3 py-2.5 text-sm font-semibold text-[#8b3a1a] hover:bg-[#fff8f0] disabled:opacity-50 sm:px-4"
              title={
                isHost
                  ? "Leave but keep the show open (panel can continue)"
                  : "Leave the show"
              }
            >
              {exiting ? "Leaving…" : "Exit"}
            </button>
          </div>
        </div>

        {!compact && (
          <div className="mt-2 flex items-stretch gap-1.5">
            <label className="sr-only" htmlFor="room-host-link">
              Guest join link
            </label>
            <input
              id="room-host-link"
              readOnly
              value={roomLink || "Loading link…"}
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => e.currentTarget.select()}
              className="radio-lcd min-w-0 flex-1 rounded-lg border border-[#d4c4a8] bg-[#fffdf8] px-2.5 py-2 text-[0.7rem] leading-snug tracking-wide text-[#1c1410] outline-none ring-[#c47a10] focus:ring-2 sm:text-xs"
            />
            <button
              type="button"
              onClick={() => void copyRoomLink()}
              className="shrink-0 rounded-lg border border-[#d4c4a8] bg-[#f3e0c8] px-3 py-2 text-xs font-semibold text-[#5c2814] hover:bg-[#e8d0b0] active:bg-[#dcc09a]"
            >
              Copy
            </button>
          </div>
        )}
        {shareNote && !compact && (
          <p className="mt-1.5 break-all text-xs text-emerald-800">
            {shareNote}
          </p>
        )}
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[#8b3a1a]">
          Live only · no recording · panel first
        </p>
      </div>

      {/* Day-of notice + bulletin (everyone sees notice) */}
      <ShowBulletin
        roomId={roomId}
        isHost={isHost}
        bulletin={snapshot.room.bulletin || ""}
        dayNotice={snapshot.room.dayNotice || ""}
        onUpdated={(fields) => {
          setSnapshot((prev) =>
            prev
              ? {
                  ...prev,
                  room: {
                    ...prev.room,
                    bulletin: fields.bulletin,
                    dayNotice: fields.dayNotice,
                  },
                }
              : prev
          );
        }}
      />

      {isHost && !compact && (
        <div className="rounded-xl border border-[#d4a574] bg-[#f3e0c8] px-4 py-3 text-sm text-[#1c1410]">
          <strong>You are the host.</strong> Put people on the panel so the
          show is two-way. Up to {panelCap} guests. Chat is optional.
        </div>
      )}

      {controlNote && (
        <div className="rounded-xl border border-[#d4a574] bg-[#f3e0c8] px-4 py-3 text-sm text-[#1c1410]">
          {controlNote}
        </div>
      )}

      <RoomSfxPlayer
        roomId={roomId}
        lastSfx={snapshot.lastSfx}
        isHost={isHost}
      />

      {iAmLive && (
        <div className="rounded-xl border border-emerald-400 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950">
          {voiceEnabled
            ? "You are on the panel. Unmute mic to talk."
            : "You are on the panel (voice not configured on this server)."}
        </div>
      )}

      {/* 1. Live sound — stage */}
      <VoiceStage
        roomId={roomId}
        enabled={voiceEnabled}
        canPublish={canPublish}
        hostMuted={hostMuted}
      />

      {compact && (
        <p className="text-center text-sm text-[#4a3728]">
          Just listening. Tap <strong>Full tools</strong> for panel request and
          chat.
        </p>
      )}

      {!compact && (
        <>
          {/* 2. Panel + On air (primary engagement) */}
          <QuestionQueue
            roomId={roomId}
            role={snapshot.role}
            initialQuestions={snapshot.questions}
            initialOnAirRequests={snapshot.onAirRequests}
            initialLivePanel={livePanel}
            panelCap={panelCap}
          />

          {/* 3. Applause */}
          <EmoteRail myName={displayName || "Guest"} myAvatarId={avatarId} />

          {/* 4. Host tools */}
          {isHost && <HostSoundboard roomId={roomId} />}

          {/* 5. Chat — collapsed by default */}
          <div className="rounded-2xl border border-[#d4c4a8] bg-[#fffdf8]">
            <button
              type="button"
              onClick={() => setChatOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[#1c1410]"
            >
              <span>Chat (optional side talk)</span>
              <span className="text-xs font-medium text-[#8b3a1a]">
                {chatOpen ? "Hide" : "Show chat"}
              </span>
            </button>
            {chatOpen && (
              <div className="border-t border-[#d4c4a8] p-2">
                <ChatPanel
                  roomId={roomId}
                  initialMessages={snapshot.messages}
                />
              </div>
            )}
          </div>

          {/* 6. Presence compact */}
          <PresenceSfx
            presence={snapshot.presence}
            myName={displayName || "Guest"}
            myRole={snapshot.role}
          />
          <PresencePanel
            presence={snapshot.presence}
            listenerCount={snapshot.listenerCount}
          />
        </>
      )}

      {compact && (
        <EmoteRail myName={displayName || "Guest"} myAvatarId={avatarId} />
      )}
    </div>
  );
}
