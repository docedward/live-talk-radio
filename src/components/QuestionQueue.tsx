"use client";

import { useEffect, useState } from "react";
import type { Question, Role } from "@/lib/types";
import { getSocket } from "@/lib/socket-client";

type Props = {
  roomId: string;
  role: Role;
  initialQuestions: Question[];
  initialDisplayed: Question | null;
};

export function QuestionQueue({
  roomId,
  role,
  initialQuestions,
  initialDisplayed,
}: Props) {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [displayed, setDisplayed] = useState<Question | null>(initialDisplayed);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuestions(initialQuestions);
    setDisplayed(initialDisplayed);
  }, [initialQuestions, initialDisplayed]);

  useEffect(() => {
    const socket = getSocket();

    function onUpdated(question: Question) {
      if (question.roomId !== roomId) return;

      setQuestions((prev) => {
        const idx = prev.findIndex((q) => q.id === question.id);
        // Listeners should not keep pending/rejected items
        if (role === "listener") {
          if (question.status === "pending" || question.status === "rejected") {
            if (idx === -1) return prev;
            return prev.filter((q) => q.id !== question.id);
          }
        }

        if (idx === -1) return [...prev, question];
        const next = [...prev];
        next[idx] = question;
        return next;
      });
    }

    function onDisplayed(question: Question | null) {
      setDisplayed(question);
    }

    socket.on("question:updated", onUpdated);
    socket.on("question:displayed", onDisplayed);
    return () => {
      socket.off("question:updated", onUpdated);
      socket.off("question:displayed", onDisplayed);
    };
  }, [roomId, role]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const socket = getSocket();
    socket.emit("question:submit", { roomId, text }, (result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText("");
      // Hosts see pending immediately via event; submitter who is listener
      // also gets the ack — add locally if host so it shows without waiting.
      if (role === "host" && result.ok) {
        // event will also arrive; fine if duplicate handled by id merge
      }
    });
  }

  function act(
    event:
      | "question:approve"
      | "question:reject"
      | "question:display",
    questionId: string
  ) {
    setError(null);
    const socket = getSocket();
    socket.emit(event, { roomId, questionId }, (result) => {
      if (!result.ok) setError(result.error);
    });
  }

  function clearDisplay() {
    setError(null);
    const socket = getSocket();
    socket.emit("question:clear-display", { roomId }, (result) => {
      if (!result.ok) setError(result.error);
    });
  }

  const pending = questions.filter((q) => q.status === "pending");
  const approved = questions.filter((q) => q.status === "approved");
  const rejected = questions.filter((q) => q.status === "rejected");

  return (
    <section className="flex min-h-[280px] flex-1 flex-col rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Question queue
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {role === "host"
            ? "Approve, reject, or put a question on air for everyone."
            : "Submit a question. The host moderates what goes on air."}
        </p>
      </header>

      {/* On-air banner */}
      <div className="border-b border-zinc-200 bg-violet-50 px-4 py-3 dark:border-zinc-800 dark:bg-violet-950/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
          On air
        </p>
        {displayed ? (
          <div className="mt-1">
            <p className="text-base font-medium text-zinc-900 dark:text-zinc-50">
              {displayed.text}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              from {displayed.authorName}
            </p>
            {role === "host" && (
              <button
                type="button"
                onClick={clearDisplay}
                className="mt-2 text-xs font-medium text-violet-700 underline dark:text-violet-300"
              >
                Clear on-air question
              </button>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            No question on air yet.
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        {role === "host" && (
          <QueueGroup
            title="Pending"
            empty="No pending questions."
            items={pending}
            role={role}
            onApprove={(id) => act("question:approve", id)}
            onReject={(id) => act("question:reject", id)}
            onDisplay={(id) => act("question:display", id)}
          />
        )}

        <QueueGroup
          title="Approved"
          empty="No approved questions yet."
          items={approved}
          role={role}
          onApprove={(id) => act("question:approve", id)}
          onReject={(id) => act("question:reject", id)}
          onDisplay={(id) => act("question:display", id)}
        />

        {role === "host" && rejected.length > 0 && (
          <QueueGroup
            title="Rejected"
            empty=""
            items={rejected}
            role={role}
            onApprove={(id) => act("question:approve", id)}
            onReject={(id) => act("question:reject", id)}
            onDisplay={(id) => act("question:display", id)}
          />
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask a question for the host…"
          maxLength={400}
          className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Ask
        </button>
      </form>
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
  onDisplay,
}: {
  title: string;
  empty: string;
  items: Question[];
  role: Role;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDisplay: (id: string) => void;
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
              {role === "host" && q.status !== "rejected" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.status === "pending" && (
                    <>
                      <HostBtn label="Approve" onClick={() => onApprove(q.id)} />
                      <HostBtn label="Reject" tone="danger" onClick={() => onReject(q.id)} />
                    </>
                  )}
                  {(q.status === "pending" || q.status === "approved") && (
                    <HostBtn label="Put on air" tone="primary" onClick={() => onDisplay(q.id)} />
                  )}
                  {q.status === "approved" && (
                    <HostBtn label="Reject" tone="danger" onClick={() => onReject(q.id)} />
                  )}
                </div>
              )}
              {role === "host" && q.status === "rejected" && (
                <div className="mt-2">
                  <HostBtn label="Approve instead" onClick={() => onApprove(q.id)} />
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
