/**
 * Short synthesized cues for join / leave (no external audio files).
 * Uses Web Audio API — works after any user gesture unlocks audio on phones.
 */

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx) sharedCtx = new AC();
  return sharedCtx;
}

/** Call from a click/tap so Safari allows later presence SFX. */
export async function unlockPresenceAudio(): Promise<void> {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Soft multi-clap (golf clap) when someone joins. */
export function playJoinClap(): void {
  const ctx = getCtx();
  if (!ctx) return;
  void ctx.resume().catch(() => undefined);

  const now = ctx.currentTime;
  // 4 soft claps staggered
  for (let c = 0; c < 4; c++) {
    const t0 = now + c * 0.09;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.06);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800 + c * 120;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + 0.06);
  }
}

/** Low boom when someone leaves / closes the page. */
export function playLeaveBoom(): void {
  const ctx = getCtx();
  if (!ctx) return;
  void ctx.resume().catch(() => undefined);

  const now = ctx.currentTime;

  // Sub thump
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(90, now);
  osc.frequency.exponentialRampToValueAtTime(35, now + 0.45);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(0.55, now + 0.02);
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  osc.connect(og);
  og.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.55);

  // Noise burst (cannon crack)
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.35);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(120, now + 0.3);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, now);
  ng.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  src.connect(filter);
  filter.connect(ng);
  ng.connect(ctx.destination);
  src.start(now);
  src.stop(now + 0.35);
}
