/**
 * Lightweight bus: VoiceStage publishes LiveKit speaking state;
 * QuestionQueue / strips subscribe (panel is outside LiveKitRoom tree).
 */

export type SpeakingState = {
  /** Display names (or identity fallback) currently speaking */
  names: Set<string>;
  /** 0–1 audio levels by name */
  levels: Map<string, number>;
};

type Listener = (state: SpeakingState) => void;

const listeners = new Set<Listener>();
let last: SpeakingState = { names: new Set(), levels: new Map() };

export function publishSpeaking(state: SpeakingState) {
  last = state;
  for (const fn of listeners) fn(state);
}

export function subscribeSpeaking(fn: Listener): () => void {
  listeners.add(fn);
  fn(last);
  return () => {
    listeners.delete(fn);
  };
}

export function getLastSpeaking(): SpeakingState {
  return last;
}
