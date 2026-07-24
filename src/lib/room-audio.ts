/**
 * Shared room output audio: unlock once from the join (or first) gesture,
 * then a single Mute for speakers (voice + soundboard).
 *
 * Browsers block autoplay without a user gesture. Join is that gesture for
 * listeners. Hosts who auto-join unlock on first pad press or any page tap.
 */

type Listener = () => void;

let unlocked = false;
let outputMuted = false;
const listeners = new Set<Listener>();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function isRoomAudioUnlocked(): boolean {
  return unlocked;
}

export function isRoomOutputMuted(): boolean {
  return outputMuted;
}

export function subscribeRoomAudio(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Resume AudioContexts + mark unlocked (call from a user gesture when possible). */
export async function unlockRoomAudio(): Promise<void> {
  // Dynamic imports avoid a cycle with host-sfx (which checks mute here).
  const [{ unlockHostSfx }, { unlockPresenceAudio }] = await Promise.all([
    import("@/lib/host-sfx"),
    import("@/lib/presence-sounds"),
  ]);
  await Promise.all([unlockHostSfx(), unlockPresenceAudio()]);
  if (!unlocked) {
    unlocked = true;
    notify();
  }
}

/**
 * Mute/unmute what the user hears (LiveKit remote audio + SFX).
 * Does not touch their microphone publish state.
 */
export function setRoomOutputMuted(muted: boolean): void {
  if (outputMuted === muted) {
    applyOutputMuteToDom(muted);
    return;
  }
  outputMuted = muted;
  applyOutputMuteToDom(muted);
  notify();
}

export function toggleRoomOutputMuted(): boolean {
  setRoomOutputMuted(!outputMuted);
  return outputMuted;
}

/** Keep LiveKit <audio> elements in sync with mute (also call when tracks land). */
export function applyOutputMuteToDom(muted = outputMuted): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll("audio").forEach((el) => {
    const a = el as HTMLAudioElement;
    a.muted = muted;
    if (!muted) {
      a.volume = 1;
      void a.play().catch(() => undefined);
    }
  });
}

/** Kick remote audio elements after connect / track subscribe. */
export async function resumeRoomPlayback(): Promise<void> {
  await unlockRoomAudio();
  applyOutputMuteToDom(outputMuted);
}
