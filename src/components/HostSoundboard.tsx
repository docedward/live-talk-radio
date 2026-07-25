"use client";

import { useEffect, useRef, useState } from "react";
import {
  HOST_SFX_BUTTONS,
  playHostSfx,
  preloadHostSfx,
  unlockHostSfx,
  type HostSfxId,
} from "@/lib/host-sfx";
import { triggerRoomSfx } from "@/lib/api";
import { unlockRoomAudio } from "@/lib/room-audio";
import {
  CLIP_SLOT_COUNT,
  MAX_CLIP_SECONDS,
  clearClip,
  decodeAndNormalizeClip,
  loadClipsForRoom,
  playStoredClip,
  saveClip,
  type StoredClip,
} from "@/lib/custom-sfx";
import {
  isClipPublisherReady,
  stopClipPlayback,
  subscribeClipPlaying,
  subscribeClipPublisherReady,
} from "@/lib/clip-publish-bus";
import { markSfxEventPlayed, noteHostLocalSfxPlay } from "@/lib/sfx-dedupe";

type Props = {
  roomId: string;
};

/**
 * Host-only: stock stings + Clip Board (user uploads).
 * Stock pads: existing SFX bus. Clips: IndexedDB + LiveKit temp track.
 */
const BOARD_COOLDOWN_MS = 5000;

export function HostSoundboard({ roomId }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [clips, setClips] = useState<Map<number, StoredClip>>(new Map());
  const [voiceReady, setVoiceReady] = useState(isClipPublisherReady());
  const [clipPlaying, setClipPlaying] = useState(false);
  /** Unix ms when stock pads unlock again (0 = ready). */
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadSlot = useRef<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  useEffect(() => {
    void unlockRoomAudio().then(() => preloadHostSfx());
  }, []);

  useEffect(() => {
    return subscribeClipPublisherReady(setVoiceReady);
  }, []);

  useEffect(() => {
    return subscribeClipPlaying(setClipPlaying);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadClipsForRoom(roomId).then((map) => {
      if (!cancelled) setClips(map);
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // Tick remaining cooldown for UI (seconds left)
  useEffect(() => {
    if (cooldownUntil <= 0) {
      setCooldownLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, cooldownUntil - Date.now());
      setCooldownLeft(left);
      if (left <= 0) setCooldownUntil(0);
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const boardLocked = cooldownLeft > 0 || busy !== null;

  async function fireStock(id: HostSfxId, label: string) {
    if (Date.now() < cooldownUntil) {
      setError("Wait 5 seconds between soundboard hits.");
      return;
    }
    setError(null);
    setBusy(id);
    // Lock immediately so double-taps cannot race
    setCooldownUntil(Date.now() + BOARD_COOLDOWN_MS);
    await unlockRoomAudio();
    await unlockHostSfx();
    // Suppress LiveKit/REST echo of this press (server data has no isLocal)
    noteHostLocalSfxPlay();
    const heard = await playHostSfx(id);
    if (!heard) {
      setError("Could not play. Check Mute under Live sound.");
    }
    try {
      const res = await triggerRoomSfx(roomId, id);
      markSfxEventPlayed(res.lastSfx?.id);
      setLast(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send sound");
    } finally {
      setBusy(null);
    }
  }

  function openUpload(slot: number) {
    uploadSlot.current = slot;
    fileRef.current?.click();
  }

  async function onFilePicked(file: File | null) {
    const slot = uploadSlot.current;
    uploadSlot.current = null;
    if (!file || slot == null) return;
    setError(null);
    setBusy(`clip-${slot}`);
    try {
      const decoded = await decodeAndNormalizeClip(file);
      await saveClip(roomId, slot, decoded);
      const map = await loadClipsForRoom(roomId);
      setClips(map);
      setLast(
        `Loaded “${decoded.name}” (${decoded.duration.toFixed(1)}s) · Clip ${slot + 1}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function playClip(slot: number) {
    const clip = clips.get(slot);
    if (!clip) {
      openUpload(slot);
      return;
    }
    if (!voiceReady) {
      setError(
        "Connect Live sound first (scroll to Live sound), then play the clip so the room hears it."
      );
      return;
    }
    setError(null);
    setBusy(`clip-${slot}`);
    try {
      await unlockRoomAudio();
      await playStoredClip(clip);
      setLast(`Played “${clip.name}”`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not play clip";
      setError(
        /publish|track|Live/i.test(msg)
          ? `${msg} — try Restart mic under Live sound, then play again.`
          : msg
      );
    } finally {
      setBusy(null);
    }
  }

  async function removeClip(slot: number) {
    setError(null);
    try {
      await clearClip(roomId, slot);
      const map = await loadClipsForRoom(roomId);
      setClips(map);
      setLast(`Cleared clip ${slot + 1}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear");
    }
  }

  function onClipPointerDown(slot: number) {
    longPressFired.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      longPressFired.current = true;
      openUpload(slot);
    }, 550);
  }

  function onClipPointerCancel() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/40">
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm"
        className="hidden"
        onChange={(e) => void onFilePicked(e.target.files?.[0] ?? null)}
      />

      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-1">
        <h2 className="text-sm font-semibold text-[#1c1410]">
          Host soundboard
        </h2>
        <p className="radio-helper text-[11px]">
          Only you press. Everyone hears.
          {cooldownLeft > 0
            ? ` · Wait ${Math.ceil(cooldownLeft / 1000)}s`
            : " · 5s between hits"}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {HOST_SFX_BUTTONS.map((b) => (
          <button
            key={b.id}
            type="button"
            disabled={boardLocked}
            onClick={() => void fireStock(b.id, b.label)}
            title={
              cooldownLeft > 0
                ? `Wait ${Math.ceil(cooldownLeft / 1000)}s`
                : b.label
            }
            className="flex min-h-11 flex-col items-center justify-center rounded-lg border border-amber-300 bg-white px-1 py-1.5 text-center shadow-sm active:scale-[0.97] disabled:opacity-50 dark:border-amber-800 dark:bg-zinc-900"
          >
            <span className="block text-base leading-none sm:text-lg">
              {b.emoji}
            </span>
            <span className="mt-0.5 block max-w-full truncate text-[10px] font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
              {busy === b.id
                ? "…"
                : cooldownLeft > 0
                  ? `${Math.ceil(cooldownLeft / 1000)}s`
                  : b.label}
            </span>
          </button>
        ))}
      </div>

      {/* Clip Board — prerecords / ads */}
      <div className="mt-3 border-t border-amber-200/80 pt-2 dark:border-amber-900">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#1c1410]">
              Clip board · ads &amp; prerecords
            </h3>
            <p className="radio-helper mt-0.5 text-[10px]">
              Max {MAX_CLIP_SECONDS}s · mp3/wav/m4a/ogg · talk over clips OK
            </p>
          </div>
          {clipPlaying && (
            <button
              type="button"
              onClick={() => stopClipPlayback()}
              className="min-h-9 shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500"
            >
              Stop clip
            </button>
          )}
        </div>
        <p className="radio-helper mb-1.5 text-[10px]">
          {voiceReady
            ? "Click = play · hold / right-click = load · Shift+click = clear"
            : "Connect Live sound below first — then clips play into the room"}
        </p>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {Array.from({ length: CLIP_SLOT_COUNT }, (_, slot) => {
            const clip = clips.get(slot);
            const id = `clip-${slot}`;
            return (
              <button
                key={slot}
                type="button"
                disabled={busy !== null}
                title={
                  clip
                    ? `${clip.name} (${clip.duration.toFixed(1)}s) — click play, right-click replace, Shift+click clear`
                    : "Empty — click or hold to upload audio"
                }
                onClick={(e) => {
                  if (longPressFired.current) {
                    longPressFired.current = false;
                    return;
                  }
                  if (e.shiftKey && clip) {
                    void removeClip(slot);
                    return;
                  }
                  void playClip(slot);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openUpload(slot);
                }}
                onPointerDown={() => onClipPointerDown(slot)}
                onPointerUp={() => {
                  if (longPressTimer.current) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                }}
                onPointerLeave={onClipPointerCancel}
                onPointerCancel={onClipPointerCancel}
                className={`flex min-h-12 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-center shadow-sm active:scale-[0.97] disabled:opacity-50 ${
                  clip
                    ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                    : "border-dashed border-amber-400 bg-white/80 dark:border-amber-800 dark:bg-zinc-900"
                }`}
              >
                <span className="block text-sm leading-none">
                  {clip ? "📼" : "＋"}
                </span>
                <span className="mt-0.5 block max-w-full truncate text-[10px] font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
                  {busy === id
                    ? "…"
                    : clip
                      ? clip.name
                      : `Clip ${slot + 1}`}
                </span>
                {clip && (
                  <span className="text-[9px] font-medium text-zinc-600">
                    {clip.duration.toFixed(1)}s
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {last && (
        <p className="radio-helper mt-1.5 text-[11px]">Last: {last}</p>
      )}
      {error && (
        <p className="mt-1 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-medium text-red-800 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
