"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { fetchSnapshot, sendChat } from "@/lib/api";

type Props = {
  roomId: string;
  initialMessages: ChatMessage[];
};

/** Curated chat palette — no heavy emoji library. */
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Reactions",
    emojis: [
      "😂",
      "🤣",
      "😊",
      "😍",
      "😎",
      "🤔",
      "😮",
      "😢",
      "😡",
      "👍",
      "👎",
      "👏",
      "🙌",
      "🔥",
      "💯",
      "❤️",
      "💔",
      "✨",
      "🎉",
      "💪",
    ],
  },
  {
    label: "Talk radio",
    emojis: [
      "🎙️",
      "📻",
      "🔊",
      "🔇",
      "📢",
      "🗣️",
      "👂",
      "🎧",
      "📱",
      "💬",
      "❓",
      "❗",
      "💡",
      "⭐",
      "🎯",
      "🚀",
      "👀",
      "🙈",
      "🤝",
      "🙏",
    ],
  },
  {
    label: "Fun",
    emojis: [
      "😈",
      "👻",
      "🤖",
      "🦄",
      "🍕",
      "☕",
      "🍺",
      "🍩",
      "🎸",
      "🏆",
      "⚡",
      "🌈",
      "💀",
      "🫠",
      "🫡",
      "🤷",
      "🤦",
      "😴",
      "🤯",
      "🥳",
    ],
  },
];

export function ChatPanel({ roomId, initialMessages }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  /** Scroll only this list — never the whole page (phones were jumping to chat). */
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const result = await fetchSnapshot(roomId);
        if (!cancelled) setMessages(result.snapshot.messages);
      } catch {
        /* parent poll may handle */
      }
    }
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  /** Close picker on outside click / Escape. */
  useEffect(() => {
    if (!emojiOpen) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (pickerRef.current?.contains(t)) return;
      setEmojiOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEmojiOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [emojiOpen]);

  function insertEmoji(emoji: string) {
    const input = inputRef.current;
    const max = 500;
    if (!input) {
      setText((prev) => (prev + emoji).slice(0, max));
      return;
    }
    const start = input.selectionStart ?? text.length;
    const end = input.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, max);
    const caret = Math.min(start + emoji.length, next.length);
    setText(next);
    // Restore focus + caret after React re-render
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(caret, caret);
    });
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    setEmojiOpen(false);
    try {
      const result = await sendChat(roomId, text);
      setMessages((prev) => {
        if (prev.some((m) => m.id === result.message.id)) return prev;
        return [...prev, result.message];
      });
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
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

      <div
        ref={listRef}
        className="flex max-h-64 min-h-[10rem] flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 py-3 sm:max-h-none"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="text-sm leading-relaxed">
              <span className="font-semibold text-violet-700 dark:text-violet-300">
                {m.authorName}
              </span>
              <span className="break-words text-zinc-700 dark:text-zinc-300">
                {" "}
                {m.text}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="relative border-t border-zinc-200 p-3 dark:border-zinc-800">
        {emojiOpen && (
          <div
            ref={pickerRef}
            role="dialog"
            aria-label="Emoji picker"
            className="absolute bottom-full left-3 right-3 z-20 mb-2 max-h-56 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          >
            {EMOJI_GROUPS.map((group) => (
              <div key={group.label} className="mb-2 last:mb-0">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-0.5">
                  {group.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition hover:bg-zinc-100 active:scale-95 dark:hover:bg-zinc-800"
                      aria-label={`Insert ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={send} className="flex gap-2">
          <button
            type="button"
            onClick={() => setEmojiOpen((o) => !o)}
            aria-label={emojiOpen ? "Close emoji picker" : "Open emoji picker"}
            aria-expanded={emojiOpen}
            className={`shrink-0 rounded-xl border px-2.5 py-2 text-lg transition ${
              emojiOpen
                ? "border-violet-400 bg-violet-50 dark:border-violet-500 dark:bg-violet-950"
                : "border-zinc-300 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            }`}
            title="Emoji"
          >
            😊
          </button>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => {
              /* keep picker usable while typing */
            }}
            placeholder="Type a message… or tap 😊"
            maxLength={500}
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Send
          </button>
        </form>
        {error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </section>
  );
}
