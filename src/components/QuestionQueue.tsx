"use client";

import { useEffect, useState } from "react";
import type { OnAirRequest, Question, Role } from "@/lib/types";
import {
  clearOnAir,
  fetchSnapshot,
  moderateOnAir,
  moderateQuestion,
  removeFromPanel,
  leaveSpeakerPanel,
  cancelOnAirRequest,
  requestOnAir,
  submitQuestion,
  togglePanelMute,
} from "@/lib/api";
import { subscribeSpeaking } from "@/lib/speaking-bus";
import { PlayingCard } from "./PlayingCard";

type Props = {
  roomId: string;
  role: Role;
  initialQuestions: Question[];
  initialOnAirRequests: OnAirRequest[];
  initialLivePanel: OnAirRequest[];
  panelCap: number;
};

/**
 * Questions + On Air panel.
 * Host can put multiple guests On Air (up to panelCap).
 */
export function QuestionQueue({
  roomId,
  role,
  initialQuestions,
  initialOnAirRequests,
  initialLivePanel,
  panelCap,
}: Props) {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [onAirRequests, setOnAirRequests] = useState<OnAirRequest[]>(
    initialOnAirRequests
  );
  const [livePanel, setLivePanel] = useState<OnAirRequest[]>(
    initialLivePanel
  );
  const [cap, setCap] = useState(panelCap);
  const [panelCount, setPanelCount] = useState(initialLivePanel.length);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [speakingNames, setSpeakingNames] = useState<Set<string>>(new Set());
  const [speakingLevels, setSpeakingLevels] = useState<Map<string, number>>(
    new Map()
  );

  useEffect(() => {
    return subscribeSpeaking((s) => {
      setSpeakingNames(new Set(s.names));
      setSpeakingLevels(new Map(s.levels));
    });
  }, []);

  useEffect(() => {
    setQuestions(initialQuestions);
    setOnAirRequests(initialOnAirRequests);
    setLivePanel(initialLivePanel);
    setCap(panelCap);
  }, [initialQuestions, initialOnAirRequests, initialLivePanel, panelCap]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const result = await fetchSnapshot(roomId);
        if (cancelled) return;
        setQuestions(result.snapshot.questions);
        setOnAirRequests(result.snapshot.onAirRequests);
        setLivePanel(
          result.snapshot.livePanel ??
            (result.snapshot.liveOnAir ? [result.snapshot.liveOnAir] : [])
        );
        if (result.snapshot.panelCap) setCap(result.snapshot.panelCap);
        setPanelCount(
          result.snapshot.panelCount ??
            result.snapshot.livePanel?.length ??
            0
        );
      } catch {
        /* ignore */
      }
    }
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomId]);

  async function refresh() {
    const result = await fetchSnapshot(roomId);
    setQuestions(result.snapshot.questions);
    setOnAirRequests(result.snapshot.onAirRequests);
    setLivePanel(
      result.snapshot.livePanel ??
        (result.snapshot.liveOnAir ? [result.snapshot.liveOnAir] : [])
    );
    if (result.snapshot.panelCap) setCap(result.snapshot.panelCap);
    setPanelCount(
      result.snapshot.panelCount ?? result.snapshot.livePanel?.length ?? 0
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!text.trim()) throw new Error("Type a question first");
      await submitQuestion(roomId, text);
      setText("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  /** One tap — send On Air request to the host immediately (optional note = current text). */
  async function onRequestOnAirNow() {
    setError(null);
    setBusy(true);
    try {
      if (iAmOnPanel) {
        throw new Error("You are already live on the panel");
      }
      if (iAmPendingOnAir) {
        throw new Error("You already have an On Air request pending");
      }
      await requestOnAir(roomId, text.trim());
      setText("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request On Air");
    } finally {
      setBusy(false);
    }
  }

  async function onQuestion(action: "approve" | "reject", questionId: string) {
    setError(null);
    try {
      await moderateQuestion(roomId, questionId, action);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function onOnAir(action: "live" | "reject", requestId: string) {
    setError(null);
    try {
      await moderateOnAir(roomId, requestId, action);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function onClearLive() {
    setError(null);
    try {
      await clearOnAir(roomId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear");
    }
  }

  async function onRemoveFromPanel(requestId: string) {
    setError(null);
    try {
      await removeFromPanel(roomId, requestId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove");
    }
  }

  async function onToggleMute(requestId: string) {
    setError(null);
    try {
      await togglePanelMute(roomId, requestId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mute");
    }
  }

  async function onLeavePanel() {
    setError(null);
    try {
      await leaveSpeakerPanel(roomId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not leave panel");
    }
  }

  async function onCancelOnAir() {
    setError(null);
    try {
      await cancelOnAirRequest(roomId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel");
    }
  }

  const pendingQ = questions.filter((q) => q.status === "pending");
  const approvedQ = questions.filter((q) => q.status === "approved");
  const rejectedQ = questions.filter((q) => q.status === "rejected");
  const pendingOnAir = onAirRequests.filter((r) => r.status === "pending");
  const panelFull = panelCount >= cap;
  const iAmOnPanel = livePanel.some((r) => r.isMe);
  const iAmHostMuted = livePanel.some((r) => r.isMe && r.hostMuted);
  const iAmPendingOnAir = onAirRequests.some(
    (r) => r.isMe && r.status === "pending"
  );

  return (
    <section className="flex h-[28rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white sm:h-[32rem] dark:border-zinc-800 dark:bg-zinc-950">
      <header className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-[#1c1410]">
          Speaker panel · join the show
        </h2>
        <p className="radio-helper text-xs">
          {role === "host"
            ? `Panel is the main stage. Tap a green name to mute/unmute (up to ${cap} guests). Questions are secondary.`
            : "Request on air to talk with the host. Asking a text question is optional."}
        </p>
      </header>

      {/* On-stage panel — public booth seats */}
      <div className="shrink-0 border-b border-[#d4c4a8] bg-gradient-to-b from-[#2a1a0f] to-[#1a1008] px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#e8a820]">
            On stage · {panelCount}/{cap}
          </p>
          {role === "host" && panelCount > 0 && (
            <button
              type="button"
              onClick={() => void onClearLive()}
              className="text-xs font-medium text-[#f5e6c8] underline"
            >
              Clear stage
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] text-[#c4b8a8]">
          {role === "host"
            ? "Green seats are live. Tap a seat to mute/unmute."
            : "These people are on the broadcast with the host."}
        </p>

        {livePanel.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[#5c3d24] bg-black/20 px-3 py-4 text-center text-sm text-[#c4b8a8]">
            Stage is empty.{" "}
            {role === "host"
              ? "Approve someone from On air requests below."
              : "Request on air to take a seat."}
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {livePanel.map((r) => {
              const muted = !!r.hostMuted;
              const name = r.authorName || "Guest";
              const isSpeaking =
                !muted &&
                (speakingNames.has(name) ||
                  [...speakingNames].some(
                    (n) => n.toLowerCase() === name.toLowerCase()
                  ));
              const level =
                speakingLevels.get(name) ??
                [...speakingLevels.entries()].find(
                  ([n]) => n.toLowerCase() === name.toLowerCase()
                )?.[1] ??
                0;
              const seat = (
                <div
                  className={`flex min-w-[9.5rem] flex-1 flex-col items-center rounded-2xl border-2 px-3 py-3 text-center transition ${
                    muted
                      ? "border-zinc-500 bg-zinc-800/80 text-zinc-300"
                      : isSpeaking
                        ? "border-emerald-400 bg-emerald-900/50 text-emerald-50 shadow-[0_0_20px_rgba(52,211,153,0.35)] ring-2 ring-emerald-400/50"
                        : "border-emerald-600/80 bg-emerald-950/40 text-emerald-50"
                  }`}
                >
                  <PlayingCard
                    cardId={r.authorAvatar}
                    size="md"
                    className="shrink-0 shadow-md"
                  />
                  <span className="mt-2 block max-w-full truncate text-sm font-bold">
                    {name}
                  </span>
                  <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-90">
                    {muted
                      ? "Muted"
                      : isSpeaking
                        ? "Speaking"
                        : r.isMe
                          ? "You · live"
                          : "On air"}
                  </span>
                  {!muted && (
                    <span
                      className="mt-2 h-1 w-full max-w-[6rem] overflow-hidden rounded-full bg-black/40"
                      aria-hidden
                    >
                      <span
                        className="block h-full rounded-full bg-emerald-400 transition-[width] duration-75"
                        style={{
                          width: `${Math.min(100, Math.round(level * 140))}%`,
                        }}
                      />
                    </span>
                  )}
                </div>
              );
              return (
                <li key={r.id} className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
                  {role === "host" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void onToggleMute(r.id)}
                        className="w-full text-left active:scale-[0.99]"
                      >
                        {seat}
                      </button>
                      <HostBtn
                        label="Remove"
                        tone="danger"
                        onClick={() => void onRemoveFromPanel(r.id)}
                      />
                    </>
                  ) : (
                    seat
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {panelFull && role === "host" && (
          <p className="mt-2 text-xs text-amber-200">
            Stage full. Remove someone before adding another guest.
          </p>
        )}
        {role === "listener" && iAmOnPanel && (
          <p className="mt-2 text-xs font-medium text-emerald-200">
            {iAmHostMuted
              ? "You are on stage but muted."
              : "You are on stage — unmute mic under Live sound."}
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-3">
        {/* On Air requests */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            On Air requests ({pendingOnAir.length} pending)
          </h3>
          {role === "host" && pendingOnAir.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No pending On Air requests.
            </p>
          )}
          {role === "listener" && pendingOnAir.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No open On Air requests. Use the button below to request.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {pendingOnAir.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  <PlayingCard cardId={r.authorAvatar} size="sm" />
                  <span>
                    {r.authorName || "Someone"}
                    <span className="ml-2 text-xs font-normal text-amber-800 dark:text-amber-300">
                      wants On Air
                    </span>
                  </span>
                </p>
                {r.note ? (
                  <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                    {r.note}
                  </p>
                ) : null}
                {role === "host" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <HostBtn
                      label={panelFull ? "Panel full" : "Add to panel"}
                      tone="primary"
                      onClick={() => {
                        if (panelFull) return;
                        void onOnAir("live", r.id);
                      }}
                    />
                    <HostBtn
                      label="Reject"
                      tone="danger"
                      onClick={() => onOnAir("reject", r.id)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Questions */}
        {role === "host" && (
          <QueueGroup
            title="Pending questions"
            empty="No pending questions."
            items={pendingQ}
            role={role}
            onApprove={(id) => onQuestion("approve", id)}
            onReject={(id) => onQuestion("reject", id)}
          />
        )}

        <QueueGroup
          title="Approved questions"
          empty="No approved questions yet."
          items={approvedQ}
          role={role}
          onApprove={(id) => onQuestion("approve", id)}
          onReject={(id) => onQuestion("reject", id)}
        />

        {role === "host" && rejectedQ.length > 0 && (
          <QueueGroup
            title="Rejected questions"
            empty=""
            items={rejectedQ}
            role={role}
            onApprove={(id) => onQuestion("approve", id)}
            onReject={(id) => onQuestion("reject", id)}
          />
        )}
      </div>

      {/* Listener compose — different state if already live / pending */}
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        {role === "listener" && iAmOnPanel && (
          <div
            className={`rounded-xl border-2 px-4 py-3 text-center ${
              iAmHostMuted
                ? "border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900"
                : "border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-950/50"
            }`}
          >
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {iAmHostMuted ? "You are on the panel (muted)" : "You are live"}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {iAmHostMuted
                ? "The host muted your mic. You can leave the panel anytime and stay as a listener."
                : "You are on the speaker panel. Leave the panel to go off air but stay in the room."}
            </p>
            <button
              type="button"
              onClick={() => void onLeavePanel()}
              className="mt-3 min-h-11 w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Leave panel (stay as listener)
            </button>
          </div>
        )}

        {role === "listener" && !iAmOnPanel && iAmPendingOnAir && (
          <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-center dark:border-amber-600 dark:bg-amber-950/40">
            <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
              On Air request pending
            </p>
            <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">
              Waiting for the host to add you to the panel. You can still ask a
              text question below.
            </p>
            <button
              type="button"
              onClick={() => void onCancelOnAir()}
              className="mt-3 min-h-11 w-full rounded-xl border border-amber-600 bg-white px-4 py-2.5 text-sm font-semibold text-amber-950 dark:bg-zinc-900 dark:text-amber-100"
            >
              Cancel On Air request
            </button>
          </div>
        )}

        {role === "listener" && !iAmOnPanel && (
          <div className={iAmPendingOnAir ? "mt-3" : ""}>
            <form onSubmit={submit} className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  iAmPendingOnAir
                    ? "Type a text question…"
                    : "Type a question (optional note for On Air)…"
                }
                maxLength={400}
                className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <button
                type="submit"
                disabled={busy || !text.trim()}
                className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Ask
              </button>
            </form>

            {!iAmPendingOnAir && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRequestOnAirNow()}
                  className="mt-2 min-h-11 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  Request on air
                </button>
                <p className="radio-helper mt-1.5 text-xs">
                  Join the panel and talk with the host. Optional topic above.
                </p>
              </>
            )}
          </div>
        )}

        {role === "host" && (
          <>
            <form onSubmit={submit} className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a question into the queue for notes…"
                maxLength={400}
                className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <button
                type="submit"
                disabled={busy || !text.trim()}
                className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Ask
              </button>
            </form>
            <p className="radio-helper mt-1.5 text-xs">
              As host you can still type a question into the queue for notes.
            </p>
          </>
        )}
      </div>
      {error && (
        <p className="px-3 pb-3 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </section>
  );
}

function QueueGroup({
  title,
  empty,
  items,
  role,
  onApprove,
  onReject,
}: {
  title: string;
  empty: string;
  items: Question[];
  role: Role;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        empty ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{empty}</p>
        ) : null
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((q) => (
            <li
              key={q.id}
              className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <p className="text-sm text-zinc-900 dark:text-zinc-50">{q.text}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                <PlayingCard cardId={q.authorAvatar} size="xs" />
                {q.authorName}
              </p>
              {role === "host" && q.status === "pending" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <HostBtn label="Approve" onClick={() => onApprove(q.id)} />
                  <HostBtn
                    label="Reject"
                    tone="danger"
                    onClick={() => onReject(q.id)}
                  />
                </div>
              )}
              {role === "host" && q.status === "approved" && (
                <div className="mt-2">
                  <HostBtn
                    label="Reject"
                    tone="danger"
                    onClick={() => onReject(q.id)}
                  />
                </div>
              )}
              {role === "host" && q.status === "rejected" && (
                <div className="mt-2">
                  <HostBtn
                    label="Approve instead"
                    onClick={() => onApprove(q.id)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HostBtn({
  label,
  onClick,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "primary" | "danger";
}) {
  const styles =
    tone === "primary"
      ? "bg-violet-600 text-white hover:bg-violet-500"
      : tone === "danger"
        ? "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-950 dark:text-red-300"
        : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-xs font-medium ${styles}`}
    >
      {label}
    </button>
  );
}
