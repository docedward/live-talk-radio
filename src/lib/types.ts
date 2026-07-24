/** Shared shapes used by the browser UI and the live server. */

export type Role = "host" | "listener";

export type QuestionStatus = "pending" | "approved" | "rejected";

/** Listener asked to be featured on air; host approves → live. */
export type OnAirStatus = "pending" | "live" | "rejected" | "done";

export interface ChatMessage {
  id: string;
  roomId: string;
  authorName: string;
  text: string;
  createdAt: number;
}

export interface Question {
  id: string;
  roomId: string;
  authorName: string;
  text: string;
  status: QuestionStatus;
  createdAt: number;
}

export interface OnAirRequest {
  id: string;
  roomId: string;
  authorName: string;
  /** Optional note from the listener (topic, why, etc.) */
  note: string;
  status: OnAirStatus;
  createdAt: number;
}

export interface PresenceMember {
  displayName: string;
  role: Role;
}

export interface Room {
  id: string;
  name: string;
  hostToken: string;
  createdAt: number;
}

/** What the UI needs for a room once someone has joined. */
export interface RoomSnapshot {
  room: {
    id: string;
    name: string;
    createdAt: number;
  };
  role: Role;
  messages: ChatMessage[];
  questions: Question[];
  onAirRequests: OnAirRequest[];
  /** Who is currently featured on air (from an approved request). */
  liveOnAir: OnAirRequest | null;
  /** Everyone currently in the room (host + listeners). */
  presence: PresenceMember[];
  listenerCount: number;
}
