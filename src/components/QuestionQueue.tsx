"use client";

import { useEffect, useState } from "react";
import type { OnAirRequest, Question, Role } from "@/lib/types";
import {
  clearOnAir,
  fetchSnapshot,
  moderateOnAir,
  moderateQuestion,
  removeFromPanel,
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

type ListenerMode = "question" | "onair";

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
  const [mode, setMode] = useState<ListenerMode>("question");
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
      if (mode === "question") {
        if (!text.trim()) throw new Error("Type a question first");
        await submitQuestion(roomId, text);
      } else {
        if (iAmOnPanel) {
          throw new Error("You are already live on the panel");
        }
        if (iAmPendingOnAir) {
          throw new Error("You already have an On Air request pending");
        }
        await requestOnAir(roomId, text);
      }
      setText("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit");
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
    <section className="flex min-h-[320px] flex-1 flex-col rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Questions &amp; speaker panel
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {role === "host"
            ? `Approve questions. Tap a green name to mute/unmute (up to ${cap} guests).`
            : "Choose: ask a question, or request to join the speaker panel."}
        </p>
      </header>

      {/* Speaker panel — host sees names; listeners only count / own status */}
      <div className="border-b border-zinc-200 bg-violet-50 px-4 py-3 dark:border-zinc-800 dark:bg-violet-950/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
            Speaker panel ({panelCount}/{cap} guests)
          </p>
          {role === "host" && panelCount > 0 && (
            <button
              type="button"
              onClick={() => void onClearLive()}
              className="text-xs font-medium text-violet-700 underline dark:text-violet-300"
            >
              Clear whole panel
            </button>
          )}
        </div>

        {role === "host" ? (
          <>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Green = live mic. Tap a name to mute/unmute. Remove drops them
              from the panel.
            </p>
            {livePanel.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                No guests on the panel yet. Approve On Air requests below.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
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
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => void onToggleMute(r.id)}
                        className={`min-h-12 min-w-[8rem] flex-1 rounded-xl border-2 px-3 py-2 text-left transition active:scale-[0.99] ${
                          muted
                            ? "border-zinc-400 bg-zinc-100 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                            : isSpeaking
                              ? "border-emerald-400 bg-emerald-200 shadow-md ring-2 ring-emerald-400/70 dark:border-emerald-300 dark:bg-emerald-800/70 dark:ring-emerald-400/50"
                              : "border-emerald-500 bg-emerald-50 text-emerald-950 shadow-sm dark:border-emerald-400 dark:bg-emerald-950/50 dark:text-emerald-50"
                        }`}
                      >
                        <span className="flex items-start gap-2">
                          <PlayingCard
                            cardId={r.authorAvatar}
                            size="sm"
                            className="mt-0.5 shrink-0"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">
                              {name}
                              {isSpeaking ? " · speaking" : ""}
                            </span>
                            <span className="block text-xs font-medium opacity-80">
                              {muted
                                ? "Muted — tap to unmute"
                                : isSpeaking
                                  ? "Hot mic — tap to mute"
                                  : "Live — tap to mute"}
                            </span>
                            {!muted && (
                              <span
                                className="mt-1 block h-1 overflow-hidden rounded-full bg-emerald-900/20 dark:bg-black/30"
                                aria-hidden
                              >
                                <span
                                  className="block h-full rounded-full bg-emerald-600 transition-[width] duration-75 dark:bg-emerald-300"
                                  style={{
                                    width: `${Math.min(100, Math.round(level * 140))}%`,
                                  }}
                                />
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                      <HostBtn
                        label="Remove"
                        tone="danger"
                        onClick={() => void onRemoveFromPanel(r.id)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            {panelFull && (
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                Panel full. Remove someone before adding another guest.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {panelCount === 0
                ? "No guests on the panel yet."
                : `${panelCount} guest${panelCount === 1 ? "" : "s"} on the panel with the host.`}
            </p>
            {iAmOnPanel && (
              <p className="mt-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                {iAmHostMuted
                  ? "You are on the panel but the host muted your mic."
                  : "You are on the panel — allow the mic if asked."}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
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
                ? "The host muted your mic. You stay on air until they unmute or remove you."
                : "You are on the speaker panel. Use Live voice above for mute. Host can remove you anytime."}
            </p>
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
          </div>
        )}

        {role === "listener" && !iAmOnPanel && (
          <div className={iAmPendingOnAir ? "mt-3" : ""}>
            <div className="mb-2 flex gap-2">
              <ModeBtn
                active={mode === "question"}
                onClick={() => setMode("question")}
                label="Ask a question"
              />
              {!iAmPendingOnAir && (
                <ModeBtn
                  active={mode === "onair"}
                  onClick={() => setMode("onair")}
                  label="Request On Air"
                />
              )}
            </div>

            {/* While pending, only allow questions — not another On Air request */}
            {(mode === "question" || iAmPendingOnAir) && (
              <form onSubmit={submit} className="flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type your question…"
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
            )}

            {!iAmPendingOnAir && mode === "onair" && (
              <>
                <form onSubmit={submit} className="flex gap-2">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Optional note (topic)…"
                    maxLength={200}
                    className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Request
                  </button>
                </form>
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Note is optional. Host must approve before you go On Air.
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
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
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

function ModeBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold transition ${
        active
          ? "bg-violet-600 text-white"
          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
      }`}
    >
      {label}
    </button>
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
