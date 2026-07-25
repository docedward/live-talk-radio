/**
 * Cross-device emotes via LiveKit data packets (registered from VoiceStage).
 */

export type EmoteSender = (emoji: string) => Promise<void>;

let sender: EmoteSender | null = null;
const localHandlers = new Set<(emoji: string, from: string) => void>();

export function setEmoteSender(fn: EmoteSender | null) {
  sender = fn;
}

export function subscribeEmotes(
  fn: (emoji: string, from: string) => void
): () => void {
  localHandlers.add(fn);
  return () => {
    localHandlers.delete(fn);
  };
}

export function receiveEmote(emoji: string, from: string) {
  localHandlers.forEach((h) => h(emoji, from));
}

export async function sendEmote(emoji: string): Promise<void> {
  // Always show locally even if LiveKit not ready
  receiveEmote(emoji, "you");
  if (sender) {
    try {
      await sender(emoji);
    } catch {
      /* local-only */
    }
  }
}
