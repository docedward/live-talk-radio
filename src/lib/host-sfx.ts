/**
 * Host soundboard.
 * Prefers real files in /sfx/<id>.wav.
 * Falls back to Web Audio synth if a file is missing.
 */

export type HostSfxId =
  | "applause"
  | "pew"
  | "horn"
  | "asmr"
  | "riser"
  | "pop"
  | "funny"
  | "meme"
  | "alert"
  | "laugh"
  | "popwow"
  | "ghost";

export type HostSfxButton = {
  id: HostSfxId;
  label: string;
  emoji: string;
};

/** Registry = host UI. Files: public/sfx/<id>.wav (trimmed ≤ ~1.8s). */
export const HOST_SFX_BUTTONS: HostSfxButton[] = [
  { id: "applause", label: "Applause", emoji: "👏" },
  { id: "pew", label: "Pew Pew", emoji: "🔫" },
  { id: "horn", label: "Horn", emoji: "📢" },
  { id: "asmr", label: "ASMR", emoji: "🎧" },
  { id: "riser", label: "Riser", emoji: "🎢" },
  // Pads swapped from ~/GrokBox/inputs/sfx (Pixabay downloads)
  { id: "pop", label: "Pop", emoji: "☀️" },
  { id: "funny", label: "Funny", emoji: "🤡" },
  { id: "meme", label: "Meme", emoji: "👀" },
  { id: "alert", label: "Alert", emoji: "🚨" },
  { id: "laugh", label: "Laugh", emoji: "🤣" },
  { id: "popwow", label: "Wow", emoji: "😮" },
  { id: "ghost", label: "Ghost", emoji: "👻" },
];

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export async function unlockHostSfx(): Promise<void> {
  const c = ac();
  if (c?.state === "suspended") {
    try {
      await c.resume();
    } catch {
      /* ignore */
    }
  }
}

function noise(c: AudioContext, sec: number): AudioBuffer {
  const n = Math.floor(c.sampleRate * sec);
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function tone(
  c: AudioContext,
  freq: number,
  t0: number,
  dur: number,
  type: OscillatorType,
  vol: number
) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** Minimal synth fallbacks if WAV missing. */
function playGeneric(c: AudioContext, kind: HostSfxId) {
  const t0 = c.currentTime;
  switch (kind) {
    case "pew":
      tone(c, 880, t0, 0.12, "square", 0.12);
      tone(c, 220, t0 + 0.1, 0.12, "square", 0.1);
      break;
    case "horn":
      tone(c, 370, t0, 0.8, "sawtooth", 0.12);
      break;
    case "laugh":
    case "funny":
      for (let i = 0; i < 5; i++) tone(c, 240 + i * 30, t0 + i * 0.1, 0.08, "triangle", 0.1);
      break;
    case "applause":
      for (let i = 0; i < 20; i++) {
        const t = t0 + Math.random() * 0.8;
        const src = c.createBufferSource();
        src.buffer = noise(c, 0.04);
        const g = c.createGain();
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        src.connect(g);
        g.connect(c.destination);
        src.start(t);
        src.stop(t + 0.04);
      }
      break;
    case "alert":
    case "meme":
      tone(c, 880, t0, 0.15, "square", 0.12);
      tone(c, 660, t0 + 0.18, 0.15, "square", 0.12);
      break;
    case "riser":
      {
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(120, t0);
        o.frequency.exponentialRampToValueAtTime(900, t0 + 1.2);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.1, t0 + 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.25);
        o.connect(g);
        g.connect(c.destination);
        o.start(t0);
        o.stop(t0 + 1.3);
      }
      break;
    case "pop":
    case "popwow":
      tone(c, 600, t0, 0.08, "sine", 0.15);
      break;
    case "ghost":
      tone(c, 400, t0, 0.9, "sine", 0.08);
      tone(c, 280, t0 + 0.1, 0.9, "sine", 0.06);
      break;
    case "asmr":
    default:
      tone(c, 520, t0, 0.4, "sine", 0.06);
      break;
  }
}

const PLAYERS: Record<HostSfxId, (c: AudioContext) => void> = {
  applause: (c) => playGeneric(c, "applause"),
  pew: (c) => playGeneric(c, "pew"),
  horn: (c) => playGeneric(c, "horn"),
  asmr: (c) => playGeneric(c, "asmr"),
  riser: (c) => playGeneric(c, "riser"),
  pop: (c) => playGeneric(c, "pop"),
  funny: (c) => playGeneric(c, "funny"),
  meme: (c) => playGeneric(c, "meme"),
  alert: (c) => playGeneric(c, "alert"),
  laugh: (c) => playGeneric(c, "laugh"),
  popwow: (c) => playGeneric(c, "popwow"),
  ghost: (c) => playGeneric(c, "ghost"),
};

const bufferCache = new Map<HostSfxId, AudioBuffer | null>();
let preloadStarted = false;

async function loadBuffer(
  c: AudioContext,
  id: HostSfxId
): Promise<AudioBuffer | null> {
  if (bufferCache.has(id)) return bufferCache.get(id) ?? null;
  try {
    const res = await fetch(`/sfx/${id}.wav`, { cache: "force-cache" });
    if (!res.ok) {
      bufferCache.set(id, null);
      return null;
    }
    const arr = await res.arrayBuffer();
    const buf = await c.decodeAudioData(arr.slice(0));
    bufferCache.set(id, buf);
    return buf;
  } catch {
    bufferCache.set(id, null);
    return null;
  }
}

export async function preloadHostSfx(): Promise<void> {
  if (preloadStarted) return;
  preloadStarted = true;
  const c = ac();
  if (!c) return;
  await c.resume().catch(() => undefined);
  await Promise.all(HOST_SFX_BUTTONS.map((b) => loadBuffer(c, b.id)));
}

function playBuffer(c: AudioContext, buf: AudioBuffer) {
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = 0.9;
  src.connect(g);
  g.connect(c.destination);
  src.start();
}

export async function playHostSfx(id: HostSfxId): Promise<boolean> {
  const { isRoomOutputMuted } = await import("@/lib/room-audio");
  if (isRoomOutputMuted()) return false;

  await unlockHostSfx();

  try {
    const audio = new Audio(`/sfx/${id}.wav`);
    audio.volume = 0.95;
    await audio.play();
    return true;
  } catch {
    /* fall through */
  }

  const c = ac();
  if (!c) return false;
  try {
    await c.resume();
  } catch {
    return false;
  }

  const cached = bufferCache.get(id);
  if (cached) {
    playBuffer(c, cached);
    return true;
  }

  const buf = await loadBuffer(c, id);
  if (buf) {
    playBuffer(c, buf);
    return true;
  }
  const fn = PLAYERS[id];
  if (fn) {
    fn(c);
    return true;
  }
  return false;
}

export function isHostSfxId(v: string): v is HostSfxId {
  return v in PLAYERS;
}
