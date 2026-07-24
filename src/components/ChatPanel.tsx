"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { getSocket } from "@/lib/socket-client";

type Props = {
  roomId: string;
  initialMessages: ChatMessage[];
};

export function ChatPanel({ roomId, initialMessages }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    const socket = getSocket();

    function onNew(message: ChatMessage) {
      if (message.roomId !== roomId) return;
      setMessages((prev) => [...prev, message]);
    }

    socket.on("chat:new", onNew);
    return () => {
      socket.off("chat:new", onNew);
    };
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const socket = getSocket();
    socket.emit("chat:send", { roomId, text }, (result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText("");
    });
  }

  return (
    <section className="flex min-h-[280px] flex-1 flex-col rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Live chat
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Casual talk — questions go in the queue on the right.
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="text-sm">
              <span className="font-semibold text-violet-700 dark:text-violet-300">
                {m.authorName}
              </span>
              <span className="text-zinc-700 dark:text-zinc-300">
                {" "}
                {m.text}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={send}
        className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a chat message…"
          maxLength={500}
          className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Send
        </button>
      </form>
      {error && (
        <p className="px-3 pb-3 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </section>
  );
}
