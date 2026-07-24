/**
 * Generate short stereo-ish mono WAV stings under public/sfx/
 * No ffmpeg required — pure Node buffers. Better than pure oscillators in-browser.
 *
 * Run: node scripts/generate-sfx.mjs
 */
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../public/sfx");
mkdirSync(outDir, { recursive: true });

const SR = 44100;

function clamp(x) {
  return Math.max(-1, Math.min(1, x));
}

function writeWav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = clamp(samples[i]);
    data.writeInt16LE((s * 32767) | 0, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  const path = resolve(outDir, `${name}.wav`);
  writeFileSync(path, Buffer.concat([header, data]));
  console.log("wrote", path, `(${(samples.length / SR).toFixed(2)}s)`);
}

function noise() {
  return Math.random() * 2 - 1;
}

function env(t, attack, hold, release, total) {
  if (t < attack) return t / attack;
  if (t < attack + hold) return 1;
  if (t < total) return Math.max(0, 1 - (t - attack - hold) / release);
  return 0;
}

// --- Sounds ---

function genCry() {
  const dur = 1.6;
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const wobble = 1 + 0.08 * Math.sin(2 * Math.PI * 6 * t);
    const f = (520 + 90 * Math.sin(2 * Math.PI * 3.2 * t)) * wobble;
    const tone =
      0.45 * Math.sin(2 * Math.PI * f * t) +
      0.2 * Math.sin(2 * Math.PI * f * 2.01 * t) +
      0.08 * noise();
    const e = env(t, 0.04, 0.05, 0.2, 0.35) *
      (0.6 + 0.4 * Math.sin(2 * Math.PI * 2.5 * t));
    // re-trigger cry pulses
    const pulse = Math.max(0, Math.sin(2 * Math.PI * 2.8 * t));
    out[i] = tone * e * pulse * 0.9;
  }
  return out;
}

function genDrumroll() {
  const dur = 1.5;
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  for (let hit = 0; hit < 32; hit++) {
    const t0 = hit * 0.04;
    const amp = 0.15 + (hit / 32) * 0.55;
    for (let i = 0; i < SR * 0.05; i++) {
      const t = i / SR;
      const idx = Math.floor((t0 + t) * SR);
      if (idx >= n) break;
      const e = Math.exp(-t * 60);
      out[idx] += noise() * e * amp * 0.5;
    }
  }
  // final hit
  const tHit = 1.28;
  for (let i = 0; i < SR * 0.25; i++) {
    const t = i / SR;
    const idx = Math.floor((tHit + t) * SR);
    if (idx >= n) break;
    out[idx] +=
      (0.6 * Math.sin(2 * Math.PI * 70 * Math.exp(-t * 8) * t) +
        0.35 * noise() * Math.exp(-t * 20)) *
      Math.exp(-t * 6);
  }
  return out;
}

function genPew() {
  const dur = 0.45;
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  for (let shot = 0; shot < 2; shot++) {
    const t0 = shot * 0.16;
    for (let i = 0; i < SR * 0.14; i++) {
      const t = i / SR;
      const idx = Math.floor((t0 + t) * SR);
      if (idx >= n) break;
      const f = 900 * Math.exp(-t * 18) + 80;
      out[idx] +=
        0.35 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 14) +
        0.08 * noise() * Math.exp(-t * 40);
    }
  }
  return out;
}

function genLaugh() {
  const dur = 1.2;
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  const hits = [0, 0.11, 0.22, 0.38, 0.5, 0.68, 0.82, 0.96];
  for (const t0 of hits) {
    for (let i = 0; i < SR * 0.1; i++) {
      const t = i / SR;
      const idx = Math.floor((t0 + t) * SR);
      if (idx >= n) break;
      const f = 240 + 80 * Math.sin(2 * Math.PI * 18 * t);
      out[idx] +=
        (0.35 * Math.sin(2 * Math.PI * f * t) +
          0.15 * Math.sin(2 * Math.PI * f * 1.5 * t) +
          0.05 * noise()) *
        Math.exp(-t * 22);
    }
  }
  return out;
}

function genApplause() {
  const dur = 1.5;
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  for (let k = 0; k < 120; k++) {
    const t0 = Math.random() * 1.35;
    const amp = 0.08 + Math.random() * 0.12;
    for (let i = 0; i < SR * 0.04; i++) {
      const t = i / SR;
      const idx = Math.floor((t0 + t) * SR);
      if (idx >= n) break;
      // band-limited clap-ish
      const click = noise() * Math.exp(-t * 80);
      out[idx] += click * amp;
    }
  }
  // soft bed
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] += noise() * 0.03 * env(t, 0.05, 1.0, 0.35, dur);
    out[i] *= 0.85;
  }
  return out;
}

function genOhh() {
  const dur = 1.35;
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  for (let v = 0; v < 6; v++) {
    const f0 = 280 + v * 28;
    const t0 = v * 0.03;
    for (let i = 0; i < n; i++) {
      const t = i / SR - t0;
      if (t < 0 || t > dur) continue;
      const f = f0 * Math.exp(-t * 0.55);
      const e = env(t, 0.08, 0.5, 0.6, 1.25);
      out[i] +=
        (0.12 * Math.sin(2 * Math.PI * f * t) +
          0.05 * Math.sin(2 * Math.PI * f * 2 * t) +
          0.02 * noise()) *
        e;
    }
  }
  return out;
}

function genRimshot() {
  const dur = 0.55;
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  for (const t0 of [0, 0.12]) {
    for (let i = 0; i < SR * 0.08; i++) {
      const t = i / SR;
      const idx = Math.floor((t0 + t) * SR);
      if (idx >= n) break;
      out[idx] +=
        (0.45 * Math.sin(2 * Math.PI * 90 * t) + 0.2 * noise()) *
        Math.exp(-t * 40);
    }
  }
  const tSplash = 0.28;
  for (let i = 0; i < SR * 0.28; i++) {
    const t = i / SR;
    const idx = Math.floor((tSplash + t) * SR);
    if (idx >= n) break;
    out[idx] += noise() * Math.exp(-t * 12) * 0.55;
  }
  return out;
}

function genBoo() {
  const dur = 1.2;
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  for (let v = 0; v < 6; v++) {
    const f0 = 170 + v * 14;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = f0 * (1 - 0.35 * t);
      out[i] +=
        (0.1 * Math.sin(2 * Math.PI * f * t) +
          0.04 * Math.sin(2 * Math.PI * f * 1.5 * t) +
          0.02 * noise()) *
        env(t, 0.08, 0.5, 0.5, 1.15);
    }
  }
  return out;
}

function genAirhorn() {
  const dur = 1.15;
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 370;
    const e = env(t, 0.04, 0.7, 0.35, dur);
    out[i] =
      (0.35 * Math.sin(2 * Math.PI * f * t) +
        0.2 * Math.sin(2 * Math.PI * f * 2 * t) +
        0.12 * Math.sin(2 * Math.PI * f * 3 * t) +
        0.05 * noise()) *
      e;
  }
  return out;
}

function genBuzzer() {
  const dur = 0.6;
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const sq = Math.sin(2 * Math.PI * 140 * t) > 0 ? 1 : -1;
    const sq2 = Math.sin(2 * Math.PI * 280 * t) > 0 ? 1 : -1;
    out[i] = (0.35 * sq + 0.15 * sq2) * env(t, 0.01, 0.35, 0.2, dur);
  }
  return out;
}

function genDing() {
  const dur = 1.0;
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  const partials = [
    [880, 0.4],
    [1320, 0.2],
    [1760, 0.12],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (const [f, a] of partials) {
      s += a * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (3 + f / 800));
    }
    out[i] = s * 0.7;
  }
  return out;
}

function genCrickets() {
  const dur = 2.0;
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  for (let k = 0; k < 16; k++) {
    const t0 = k * 0.12 + Math.random() * 0.03;
    const f = 4200 + Math.random() * 900;
    for (let i = 0; i < SR * 0.04; i++) {
      const t = i / SR;
      const idx = Math.floor((t0 + t) * SR);
      if (idx >= n) break;
      const sq = Math.sin(2 * Math.PI * f * t) > 0 ? 1 : -1;
      out[idx] += sq * 0.12 * Math.exp(-t * 50);
    }
  }
  return out;
}

const gens = {
  cry: genCry,
  drumroll: genDrumroll,
  pew: genPew,
  laugh: genLaugh,
  applause: genApplause,
  ohh: genOhh,
  rimshot: genRimshot,
  boo: genBoo,
  airhorn: genAirhorn,
  buzzer: genBuzzer,
  ding: genDing,
  crickets: genCrickets,
};

for (const [name, gen] of Object.entries(gens)) {
  writeWav(name, gen());
}

writeFileSync(
  resolve(outDir, "README.txt"),
  `TRL host soundboard assets (generated WAV).
Generated by scripts/generate-sfx.mjs for offline/demo use.
Replace any file with a licensed sample (keep the same filename) for production polish.
IDs: cry, drumroll, pew, laugh, applause, ohh, rimshot, boo, airhorn, buzzer, ding, crickets
`
);
console.log("done");
