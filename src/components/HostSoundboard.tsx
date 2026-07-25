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
  clearClip,
  decodeAndNormalizeClip,
  loadClipsForRoom,
  playStoredClip,
  saveClip,
  type StoredClip,
} from "@/lib/custom-sfx";
import {
  isClipPublisherReady,
  subscribeClipPublisherReady,
} from "@/lib/clip-publish-bus";

type Props = {
  roomId: string;
};

/**
 * Host-only: stock stings + Clip Board (user uploads).
 * Stock pads: existing SFX bus. Clips: IndexedDB + LiveKit temp track.
 */
export function HostSoundboard({ roomId }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [clips, setClips] = useState<Map<number, StoredClip>>(new Map());
  const [voiceReady, setVoiceReady] = useState(isClipPublisherReady());
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
    let cancelled = false;
    void loadClipsForRoom(roomId).then((map) => {
      if (!cancelled) setClips(map);
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  async function fireStock(id: HostSfxId, label: string) {
    setError(null);
    setBusy(id);
    await unlockRoomAudio();
    await unlockHostSfx();
    const heard = await playHostSfx(id);
    if (!heard) {
      setError(
        "Could not play — check Mute under Live sound, or try again."
      );
    }
    try {
      await triggerRoomSfx(roomId, id);
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
      setLast(`Loaded: ${decoded.name}`);
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
    setError(null);
    setBusy(`clip-${slot}`);
    try {
      await unlockRoomAudio();
      await playStoredClip(clip);
      setLast(clip.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not play clip");
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
        <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
          Host soundboard
        </h2>
        <p className="radio-helper text-[11px]">
          Only you press · everyone hears
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {HOST_SFX_BUTTONS.map((b) => (
          <button
            key={b.id}
            type="button"
            disabled={busy !== null}
            onClick={() => void fireStock(b.id, b.label)}
            title={b.label}
            className="flex min-h-11 flex-col items-center justify-center rounded-lg border border-amber-300 bg-white px-1 py-1.5 text-center shadow-sm active:scale-[0.97] disabled:opacity-50 dark:border-amber-800 dark:bg-zinc-900"
          >
            <span className="block text-base leading-none sm:text-lg">
              {b.emoji}
            </span>
            <span className="mt-0.5 block max-w-full truncate text-[10px] font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
              {busy === b.id ? "…" : b.label}
            </span>
          </button>
        ))}
      </div>

      {/* Clip Board — prerecords / ads */}
      <div className="mt-3 border-t border-amber-200/80 pt-2 dark:border-amber-900">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-950 dark:text-amber-100">
            Clip board · ads &amp; prerecords
          </h3>
          <p className="radio-helper text-[10px]">
            {voiceReady
              ? "Click play · hold / right-click load file"
              : "Connect Live sound to play into the room"}
          </p>
        </div>
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
                    ? `${clip.name} — click play, right-click replace, Shift+click clear`
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
              </button>
            );
          })}
        </div>
      </div>

      {last && (
        <p className="radio-helper mt-1.5 text-[11px]">Last: {last}</p>
      )}
      {error && (
        <p className="mt-1 text-[11px] text-red-700 dark:text-red-400">{error}</p>
      )}
    </section>
  );
}
