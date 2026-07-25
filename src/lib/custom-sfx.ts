/**
 * Host Clip Board: user-uploaded short audio (ads, prerecords).
 * - Stored in IndexedDB (host browser only)
 * - Played into the room via LiveKit temp audio track (clip-publish-bus)
 * Never AI-generated; never multi-MB base64 fan-out.
 */

import { publishClipToRoom } from "./clip-publish-bus";

const DB_NAME = "trl-custom-sfx";
const DB_VERSION = 1;
const STORE = "clips";

export const CLIP_SLOT_COUNT = 6;
export const MAX_CLIP_SECONDS = 45;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** Target sample rate for lo-fi / smaller buffers (AM ethos). */
const TARGET_RATE = 22050;

export type StoredClip = {
  roomId: string;
  slot: number;
  name: string;
  sampleRate: number;
  /** Mono PCM */
  samples: Float32Array;
  duration: number;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser cannot store clips"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
  });
}

function clipKey(roomId: string, slot: number) {
  return `${roomId}::${slot}`;
}

function getAc(): AudioContext {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) throw new Error("Web Audio not supported");
  return new AC();
}

/** Decode upload → mono, downsampled, soft-limited. */
export async function decodeAndNormalizeClip(file: File): Promise<{
  name: string;
  sampleRate: number;
  samples: Float32Array;
  duration: number;
}> {
  if (!file || file.size === 0) {
    throw new Error("Empty file — pick an audio clip (mp3, wav, m4a, ogg)");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB — trim or compress the clip.`
    );
  }
  const raw = await file.arrayBuffer();
  const ac = getAc();
  let decoded: AudioBuffer;
  try {
    decoded = await ac.decodeAudioData(raw.slice(0));
  } catch {
    void ac.close().catch(() => undefined);
    throw new Error(
      "Could not decode that file. Use mp3, wav, m4a, or ogg (not video-only)."
    );
  }

  if (decoded.duration > MAX_CLIP_SECONDS) {
    void ac.close().catch(() => undefined);
    throw new Error(
      `Clip is ${decoded.duration.toFixed(0)}s — max ${MAX_CLIP_SECONDS}s for ads/prerecords. Trim it shorter.`
    );
  }
  if (decoded.duration < 0.05) {
    void ac.close().catch(() => undefined);
    throw new Error("Clip too short — need at least a short sting");
  }

  // Mix to mono
  const ch0 = decoded.getChannelData(0);
  const mono = new Float32Array(decoded.length);
  if (decoded.numberOfChannels === 1) {
    mono.set(ch0);
  } else {
    for (let i = 0; i < decoded.length; i++) {
      let s = 0;
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        s += decoded.getChannelData(c)[i]!;
      }
      mono[i] = s / decoded.numberOfChannels;
    }
  }

  // Downsample if needed
  const srcRate = decoded.sampleRate;
  let samples: Float32Array;
  let sampleRate = srcRate;
  if (srcRate > TARGET_RATE * 1.1) {
    const ratio = srcRate / TARGET_RATE;
    const outLen = Math.floor(mono.length / ratio);
    samples = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const src = i * ratio;
      const i0 = Math.floor(src);
      const i1 = Math.min(i0 + 1, mono.length - 1);
      const t = src - i0;
      samples[i] = mono[i0]! * (1 - t) + mono[i1]! * t;
    }
    sampleRate = TARGET_RATE;
  } else {
    samples = mono;
  }

  // Soft peak normalize to ~0.9
  let peak = 0.0001;
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i]!));
  }
  const gain = Math.min(1, 0.9 / peak);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = samples[i]! * gain;
  }

  void ac.close().catch(() => undefined);

  const name = (file.name || "Clip").replace(/\.[^.]+$/, "").slice(0, 28);
  return {
    name: name || "Clip",
    sampleRate,
    samples,
    duration: samples.length / sampleRate,
  };
}

export async function saveClip(
  roomId: string,
  slot: number,
  clip: Omit<StoredClip, "roomId" | "slot" | "createdAt">
): Promise<void> {
  const db = await openDb();
  const record = {
    key: clipKey(roomId, slot),
    roomId,
    slot,
    name: clip.name,
    sampleRate: clip.sampleRate,
    // Store as plain array for IDB structured clone
    samples: Array.from(clip.samples),
    duration: clip.duration,
    createdAt: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Save failed"));
  });
  db.close();
}

export async function loadClipsForRoom(
  roomId: string
): Promise<Map<number, StoredClip>> {
  const map = new Map<number, StoredClip>();
  try {
    const db = await openDb();
    const rows = await new Promise<
      Array<{
        key: string;
        roomId: string;
        slot: number;
        name: string;
        sampleRate: number;
        samples: number[];
        duration: number;
        createdAt: number;
      }>
    >((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as typeof rows) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    for (const r of rows) {
      if (r.roomId !== roomId) continue;
      map.set(r.slot, {
        roomId: r.roomId,
        slot: r.slot,
        name: r.name,
        sampleRate: r.sampleRate,
        samples: new Float32Array(r.samples),
        duration: r.duration,
        createdAt: r.createdAt,
      });
    }
  } catch {
    /* empty */
  }
  return map;
}

export async function clearClip(roomId: string, slot: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(clipKey(roomId, slot));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function clipToAudioBuffer(clip: StoredClip): AudioBuffer {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) throw new Error("Web Audio not supported");
  const ac = new AC();
  const buf = ac.createBuffer(1, clip.samples.length, clip.sampleRate);
  const channel = buf.getChannelData(0);
  const src = clip.samples;
  const n = Math.min(channel.length, src.length);
  for (let i = 0; i < n; i++) channel[i] = src[i]!;
  void ac.close().catch(() => undefined);
  return buf;
}

/** Play clip into the room (LiveKit) + local monitor. */
export async function playStoredClip(clip: StoredClip): Promise<void> {
  const buffer = clipToAudioBuffer(clip);
  await publishClipToRoom(buffer);
}
