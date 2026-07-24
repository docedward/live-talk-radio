/** Shared shapes used by the browser UI and the live server. */

export type Role = "host" | "listener";

export type QuestionStatus = "pending" | "approved" | "rejected" | "displayed";

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
  displayedQuestion: Question | null;
  listenerCount: number;
}

/** Events the browser sends to the server. */
export interface ClientToServerEvents {
  "room:list": (ack: (rooms: { id: string; name: string; listenerCount: number }[]) => void) => void;
  "room:create": (
    payload: { name: string; hostName: string },
    ack: (result: { ok: true; roomId: string; hostToken: string } | { ok: false; error: string }) => void
  ) => void;
  "room:join": (
    payload: { roomId: string; displayName: string; hostToken?: string },
    ack: (result: { ok: true; snapshot: RoomSnapshot } | { ok: false; error: string }) => void
  ) => void;
  "chat:send": (
    payload: { roomId: string; text: string },
    ack: (result: { ok: true } | { ok: false; error: string }) => void
  ) => void;
  "question:submit": (
    payload: { roomId: string; text: string },
    ack: (result: { ok: true; question: Question } | { ok: false; error: string }) => void
  ) => void;
  "question:approve": (
    payload: { roomId: string; questionId: string },
    ack: (result: { ok: true } | { ok: false; error: string }) => void
  ) => void;
  "question:reject": (
    payload: { roomId: string; questionId: string },
    ack: (result: { ok: true } | { ok: false; error: string }) => void
  ) => void;
  "question:display": (
    payload: { roomId: string; questionId: string },
    ack: (result: { ok: true } | { ok: false; error: string }) => void
  ) => void;
  "question:clear-display": (
    payload: { roomId: string },
    ack: (result: { ok: true } | { ok: false; error: string }) => void
  ) => void;
}

/** Events the server pushes to everyone in a room (or to one client). */
export interface ServerToClientEvents {
  "room:list-updated": (rooms: { id: string; name: string; listenerCount: number }[]) => void;
  "chat:new": (message: ChatMessage) => void;
  "question:updated": (question: Question) => void;
  "question:displayed": (question: Question | null) => void;
  "room:presence": (payload: { listenerCount: number }) => void;
}
