"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createHostIdentity, createRoom } from "@/lib/api";
import { pickFreeCard, type CardId } from "@/lib/card-avatars";
import { CardAvatarPicker } from "./CardAvatarPicker";

const LAST_SLUG_KEY = "ltr-last-host-slug";

function hostPageKey(slug: string) {
  return `ltr-host-page-${slug.toLowerCase()}`;
}

function loadSavedHost(): { slug: string; hostSecret: string } | null {
  try {
    const last = localStorage.getItem(LAST_SLUG_KEY);
    if (!last) return null;
    const raw = localStorage.getItem(hostPageKey(last));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { hostSecret?: string };
    if (!parsed.hostSecret) return null;
    return { slug: last.toLowerCase(), hostSecret: parsed.hostSecret };
  } catch {
    return null;
  }
}

function saveHostPage(slug: string, hostSecret: string, displayName: string) {
  const s = slug.toLowerCase();
  localStorage.setItem(
    hostPageKey(s),
    JSON.stringify({ hostSecret, displayName })
  );
  localStorage.setItem(LAST_SLUG_KEY, s);
}

/**
 * Host form: name the show, optional durable handle, create it, open it.
 */
export function CreateRoomForm() {
  const router = useRouter();
  const [showName, setShowName] = useState("");
  const [hostName, setHostName] = useState("");
  const [hostHandle, setHostHandle] = useState("");
  const [useHostPage, setUseHostPage] = useState(false);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
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
    const host = loadSavedHost();
    if (host) {
      setSavedSlug(host.slug);
      setHostHandle(host.slug);
      setUseHostPage(true);
    }
  }, []);

  async function resolveHostOpts(
    displayName: string
  ): Promise<{ hostSlug?: string; hostSecret?: string } | undefined> {
    if (!useHostPage) return undefined;
    const slug = hostHandle.trim().toLowerCase();
    if (!slug) {
      throw new Error("Enter a host handle (e.g. dred) or turn off host page");
    }

    // Reuse secret if this browser already claimed this handle
    try {
      const raw = localStorage.getItem(hostPageKey(slug));
      if (raw) {
        const parsed = JSON.parse(raw) as { hostSecret?: string };
        if (parsed.hostSecret) {
          saveHostPage(slug, parsed.hostSecret, displayName);
          return { hostSlug: slug, hostSecret: parsed.hostSecret };
        }
      }
    } catch {
      /* claim new */
    }

    // Claim new handle (fails if taken elsewhere)
    const created = await createHostIdentity(slug, displayName);
    saveHostPage(created.slug, created.hostSecret, created.displayName);
    setSavedSlug(created.slug);
    return { hostSlug: created.slug, hostSecret: created.hostSecret };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const card = avatarId || pickFreeCard([]);
      const displayName = hostName.trim() || "Host";
      const hostOpts = await resolveHostOpts(displayName);
      const result = await createRoom(showName, displayName, card, hostOpts);
      localStorage.setItem(
        `ltr-host-${result.roomId}`,
        JSON.stringify({
          hostToken: result.hostToken,
          displayName,
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
          Host booth · live only
        </p>
        <h2 className="mt-1 text-xl tracking-wide text-[#1c1410]">
          Create a show
        </h2>
        <p className="mt-1 text-sm text-[#4a3728]">
          You are the host. Put listeners on the panel to talk with you. Nothing
          is recorded.
        </p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-[#1c1410]">Your name</span>
        <input
          value={hostName}
          onChange={(e) => setHostName(e.target.value)}
          placeholder="e.g. Dr. Ed"
          className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-violet-500 focus:ring-2"
          maxLength={40}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-[#1c1410]">Show name</span>
        <input
          value={showName}
          onChange={(e) => setShowName(e.target.value)}
          placeholder="e.g. Friday Night Q&A"
          required
          className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-violet-500 focus:ring-2"
          maxLength={80}
        />
      </label>

      <div className="rounded-xl border border-[#d4c4a8] bg-[#faf6ee] p-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={useHostPage}
            onChange={(e) => setUseHostPage(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-[#1c1410]">
              Durable host page
            </span>
            <span className="mt-0.5 block text-xs text-[#4a3728]">
              Sticky public link{" "}
              <span className="font-mono">/h/your-handle</span> — Live now when
              you open a show. Weekly bulletin once a week; day-of notice
              anytime.
            </span>
          </span>
        </label>
        {useHostPage && (
          <label className="mt-3 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-[#1c1410]">Host handle</span>
            <input
              value={hostHandle}
              onChange={(e) =>
                setHostHandle(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "")
                )
              }
              placeholder="e.g. dred"
              required={useHostPage}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 font-mono text-zinc-900 outline-none ring-violet-500 focus:ring-2"
              maxLength={32}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            {savedSlug && hostHandle.toLowerCase() === savedSlug ? (
              <p className="text-xs text-emerald-800">
                Using your saved handle. Public page:{" "}
                <Link
                  href={`/h/${savedSlug}`}
                  className="font-semibold underline"
                >
                  /h/{savedSlug}
                </Link>
              </p>
            ) : (
              <p className="text-xs text-[#4a3728]">
                First time claims the handle on this browser. Same browser can
                reopen shows under it later.
              </p>
            )}
          </label>
        )}
      </div>

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
        disabled={busy || !showName.trim() || (useHostPage && !hostHandle.trim())}
        className="rounded-xl bg-[#9a3f1c] px-4 py-2.5 text-sm font-semibold text-[#fff8f0] transition hover:bg-[#b34d24] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create show & go live"}
      </button>
    </form>
  );
}
