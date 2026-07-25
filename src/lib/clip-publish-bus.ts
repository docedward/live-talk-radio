/**
 * Bridge: HostSoundboard lives outside LiveKitRoom; VoiceStage registers
 * a publisher when the host is connected so clips can go out as audio tracks.
 */

export type ClipPublisher = (buffer: AudioBuffer) => Promise<void>;

let publisher: ClipPublisher | null = null;
let stopActive: (() => void) | null = null;
let playing = false;
const readyListeners = new Set<(ready: boolean) => void>();
const playListeners = new Set<(isPlaying: boolean) => void>();

function setPlaying(next: boolean) {
  playing = next;
  playListeners.forEach((l) => l(playing));
}

export function setClipPublisher(fn: ClipPublisher | null) {
  publisher = fn;
  const ready = !!fn;
  readyListeners.forEach((l) => l(ready));
  if (!fn) {
    stopActive = null;
    setPlaying(false);
  }
}

/** Called only from ClipPublisherBridge while a clip is running. */
export function registerActiveClipStop(stop: (() => void) | null) {
  stopActive = stop;
  setPlaying(!!stop);
}

export function isClipPublisherReady(): boolean {
  return !!publisher;
}

export function isClipPlaying(): boolean {
  return playing;
}

export function subscribeClipPublisherReady(
  fn: (ready: boolean) => void
): () => void {
  readyListeners.add(fn);
  fn(!!publisher);
  return () => {
    readyListeners.delete(fn);
  };
}

export function subscribeClipPlaying(
  fn: (isPlaying: boolean) => void
): () => void {
  playListeners.add(fn);
  fn(playing);
  return () => {
    playListeners.delete(fn);
  };
}

export async function publishClipToRoom(buffer: AudioBuffer): Promise<void> {
  if (!publisher) {
    throw new Error("Connect Live sound first, then play the clip");
  }
  if (playing) {
    stopClipPlayback();
    // brief gap so previous unpublish settles
    await new Promise((r) => setTimeout(r, 80));
  }
  await publisher(buffer);
}

/** Stop the clip currently playing into the room (if any). */
export function stopClipPlayback(): void {
  if (stopActive) {
    try {
      stopActive();
    } catch {
      /* ignore */
    }
  }
  stopActive = null;
  setPlaying(false);
}
