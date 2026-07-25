/**
 * Cross-device emotes via LiveKit data packets (registered from VoiceStage).
 */

export type EmoteMeta = {
  emoji: string;
  from: string;
  avatarId?: string | null;
};

export type EmoteSender = (meta: EmoteMeta) => Promise<void>;

let sender: EmoteSender | null = null;
const localHandlers = new Set<(meta: EmoteMeta) => void>();

export function setEmoteSender(fn: EmoteSender | null) {
  sender = fn;
}

export function subscribeEmotes(fn: (meta: EmoteMeta) => void): () => void {
  localHandlers.add(fn);
  return () => {
    localHandlers.delete(fn);
  };
}

export function receiveEmote(meta: EmoteMeta) {
  localHandlers.forEach((h) => h(meta));
}

export async function sendEmote(meta: EmoteMeta): Promise<void> {
  // Always show locally even if LiveKit not ready
  receiveEmote(meta);
  if (sender) {
    try {
      await sender(meta);
    } catch {
      /* local-only */
    }
  }
}
