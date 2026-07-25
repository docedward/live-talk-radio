/**
 * Bridge: HostSoundboard lives outside LiveKitRoom; VoiceStage registers
 * a publisher when the host is connected so clips can go out as audio tracks.
 */

export type ClipPublisher = (buffer: AudioBuffer) => Promise<void>;

let publisher: ClipPublisher | null = null;
const listeners = new Set<(ready: boolean) => void>();

export function setClipPublisher(fn: ClipPublisher | null) {
  publisher = fn;
  const ready = !!fn;
  listeners.forEach((l) => l(ready));
}

export function isClipPublisherReady(): boolean {
  return !!publisher;
}

export function subscribeClipPublisherReady(
  fn: (ready: boolean) => void
): () => void {
  listeners.add(fn);
  fn(!!publisher);
  return () => {
    listeners.delete(fn);
  };
}

export async function publishClipToRoom(buffer: AudioBuffer): Promise<void> {
  if (!publisher) {
    throw new Error("Connect Live sound first, then play the clip");
  }
  await publisher(buffer);
}
