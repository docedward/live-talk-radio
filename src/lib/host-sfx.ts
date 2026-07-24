/**
 * Host soundboard.
 * Prefers real files in /sfx/<id>.wav (see scripts/generate-sfx.mjs).
 * Falls back to Web Audio synth if a file is missing.
 * Add a button: HOST_SFX_BUTTONS + optional public/sfx file + optional PLAYERS entry.
 */

export type HostSfxId =
  | "cry"
  | "drumroll"
  | "pew"
  | "laugh"
  | "applause"
  | "ohh";

export type HostSfxButton = {
  id: HostSfxId;
  /** Short label on the button */
  label: string;
  /** Emoji for easy scanning on phones */
  emoji: string;
};

/** Registry = what the host UI shows. Order = button order. */
export const HOST_SFX_BUTTONS: HostSfxButton[] = [
  { id: "cry", label: "Baby cry", emoji: "👶" },
  { id: "drumroll", label: "Drum roll", emoji: "🥁" },
  { id: "pew", label: "Pew-pew", emoji: "🔫" },
  { id: "laugh", label: "Laugh", emoji: "😂" },
  { id: "applause", label: "Applause", emoji: "👏" },
  { id: "ohh", label: "Crowd ohh", emoji: "😮" },
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

// --- Individual sounds (edit freely) ---

function playCry(c: AudioContext) {
  const t0 = c.currentTime;
  // Wobbly high tones ~1.5s
  for (let i = 0; i < 6; i++) {
    const t = t0 + i * 0.22;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(480 + (i % 2) * 80, t);
    o.frequency.linearRampToValueAtTime(620 + (i % 3) * 40, t + 0.18);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + 0.22);
  }
}

function playDrumroll(c: AudioContext) {
  const t0 = c.currentTime;
  for (let i = 0; i < 28; i++) {
    const t = t0 + i * 0.045;
    const src = c.createBufferSource();
    src.buffer = noise(c, 0.04);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 400 + i * 15;
    const g = c.createGain();
    const vol = 0.08 + (i / 28) * 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start(t);
    src.stop(t + 0.04);
  }
  // Final hit
  const hit = t0 + 1.3;
  tone(c, 80, hit, 0.25, "sine", 0.4);
  const src = c.createBufferSource();
  src.buffer = noise(c, 0.15);
  const g = c.createGain();
  g.gain.setValueAtTime(0.25, hit);
  g.gain.exponentialRampToValueAtTime(0.0001, hit + 0.15);
  src.connect(g);
  g.connect(c.destination);
  src.start(hit);
  src.stop(hit + 0.15);
}

function playPew(c: AudioContext) {
  const t0 = c.currentTime;
  for (let i = 0; i < 2; i++) {
    const t = t0 + i * 0.14;
    const o = c.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + 0.13);
  }
}

function playLaugh(c: AudioContext) {
  const t0 = c.currentTime;
  const pattern = [0, 0.12, 0.24, 0.4, 0.52, 0.7, 0.85, 1.0];
  pattern.forEach((off, i) => {
    const t = t0 + off;
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(220 + (i % 3) * 40, t);
    o.frequency.linearRampToValueAtTime(280 + (i % 2) * 30, t + 0.08);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + 0.11);
  });
}

function playApplause(c: AudioContext) {
  const t0 = c.currentTime;
  for (let i = 0; i < 40; i++) {
    const t = t0 + Math.random() * 1.4;
    const src = c.createBufferSource();
    src.buffer = noise(c, 0.05);
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1200 + Math.random() * 1500;
    f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 + Math.random() * 0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start(t);
    src.stop(t + 0.05);
  }
}

function playOhh(c: AudioContext) {
  const t0 = c.currentTime;
  // Crowd “ohhh” — several falling voices
  for (let i = 0; i < 5; i++) {
    const t = t0 + i * 0.05;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(320 + i * 25, t);
    o.frequency.exponentialRampToValueAtTime(140 + i * 10, t + 1.1);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    o.connect(f);
    f.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + 1.2);
  }
}

const PLAYERS: Record<HostSfxId, (c: AudioContext) => void> = {
  cry: playCry,
  drumroll: playDrumroll,
  pew: playPew,
  laugh: playLaugh,
  applause: playApplause,
  ohh: playOhh,
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

/** Call once when host opens the board (after user gesture). */
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

/** Play one board sound (host click or room broadcast). */
export function playHostSfx(id: HostSfxId): void {
  const c = ac();
  if (!c) return;
  void c.resume().catch(() => undefined);

  const cached = bufferCache.get(id);
  if (cached) {
    playBuffer(c, cached);
    return;
  }

  // Try load then play; synth fallback if missing
  void loadBuffer(c, id).then((buf) => {
    if (buf) {
      playBuffer(c, buf);
      return;
    }
    const fn = PLAYERS[id];
    if (fn) fn(c);
  });
}

export function isHostSfxId(v: string): v is HostSfxId {
  return v in PLAYERS;
}
