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
} from "@/lib/api";

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
  const [mode, setMode] = useState<ListenerMode>("question");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const pendingQ = questions.filter((q) => q.status === "pending");
  const approvedQ = questions.filter((q) => q.status === "approved");
  const rejectedQ = questions.filter((q) => q.status === "rejected");
  const pendingOnAir = onAirRequests.filter((r) => r.status === "pending");
  const panelFull = livePanel.length >= cap;
  const iAmOnPanel = livePanel.some((r) => r.isMe);

  return (
    <section className="flex min-h-[320px] flex-1 flex-col rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Questions &amp; speaker panel
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {role === "host"
            ? `Approve questions. Put multiple guests On Air (up to ${cap}).`
            : "Choose: ask a question, or request to join the speaker panel."}
        </p>
      </header>

      {/* Speaker panel — host + multiple live guests */}
      <div className="border-b border-zinc-200 bg-violet-50 px-4 py-3 dark:border-zinc-800 dark:bg-violet-950/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
            Speaker panel ({livePanel.length}/{cap} guests)
          </p>
          {role === "host" && livePanel.length > 0 && (
            <button
              type="button"
              onClick={() => void onClearLive()}
              className="text-xs font-medium text-violet-700 underline dark:text-violet-300"
            >
              Clear whole panel
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Host is always on. Guests below have live mics when voice is
          connected.
        </p>
        {livePanel.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            No guests on the panel yet. Listeners request On Air; host adds
            them (up to {cap}).
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {livePanel.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-white/80 px-3 py-2 dark:border-violet-800 dark:bg-zinc-950/60"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {r.authorName}
                    {r.isMe ? " (you)" : ""}
                    <span className="ml-2 text-xs font-normal text-emerald-700 dark:text-emerald-300">
                      live
                    </span>
                  </p>
                  {r.note ? (
                    <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                      {r.note}
                    </p>
                  ) : null}
                </div>
                {role === "host" && (
                  <HostBtn
                    label="Remove"
                    tone="danger"
                    onClick={() => void onRemoveFromPanel(r.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {iAmOnPanel && (
          <p className="mt-2 text-xs font-medium text-violet-800 dark:text-violet-200">
            You are on the panel — allow the mic if asked. Host can remove you
            anytime.
          </p>
        )}
        {panelFull && role === "host" && (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
            Panel full. Remove someone before adding another guest.
          </p>
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
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {r.authorName}
                  <span className="ml-2 text-xs font-normal text-amber-800 dark:text-amber-300">
                    wants On Air
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

      {/* Listener (and host can still ask a text question if they want) */}
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        {role === "listener" && (
          <div className="mb-2 flex gap-2">
            <ModeBtn
              active={mode === "question"}
              onClick={() => setMode("question")}
              label="Ask a question"
            />
            <ModeBtn
              active={mode === "onair"}
              onClick={() => setMode("onair")}
              label="Request On Air"
            />
          </div>
        )}

        <form onSubmit={submit} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              role === "listener" && mode === "onair"
                ? "Optional note (topic)…"
                : "Type your question…"
            }
            maxLength={role === "listener" && mode === "onair" ? 200 : 400}
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={
              busy ||
              (mode === "question" && !text.trim() && role !== "host") ||
              (role === "host" && !text.trim())
            }
            className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {role === "listener" && mode === "onair" ? "Request" : "Ask"}
          </button>
        </form>
        {role === "listener" && mode === "onair" && (
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            Note is optional. Host must approve before you go On Air.
          </p>
        )}
        {role === "host" && (
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            As host you can still type a question into the queue for notes.
          </p>
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
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
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
