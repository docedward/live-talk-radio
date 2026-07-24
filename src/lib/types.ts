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
  /** True when this request belongs to the current session (server-computed). */
  isMe?: boolean;
  /** Host forced this panel guest’s mic off (host-only control). */
  hostMuted?: boolean;
}

/** LiveKit media plane status for the current session. */
export interface VoiceInfo {
  /** Server has LiveKit credentials configured. */
  enabled: boolean;
  /** This session may publish audio (host, or any live panel guest). */
  canPublish: boolean;
  /** LiveKit WebSocket URL (public). */
  url: string;
  /** Host has muted this guest’s mic (panel only). */
  hostMuted?: boolean;
  /** Guest is on the speaker panel (even if host-muted). */
  onPanel?: boolean;
}

export interface PresenceMember {
  displayName: string;
  role: Role;
}

/** Host soundboard cue broadcast to the room. */
export type RoomSfxId =
  | "cry"
  | "drumroll"
  | "pew"
  | "laugh"
  | "applause"
  | "ohh";

export interface RoomSfxEvent {
  id: string;
  sound: RoomSfxId;
  at: number;
  byName: string;
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
  /**
   * @deprecated Prefer livePanel. First guest on the panel if any (compat).
   */
  liveOnAir: OnAirRequest | null;
  /**
   * Live panel guests. Host sees full names; listeners only see their own row
   * if they are on the panel (names of others are host-only).
   */
  livePanel: OnAirRequest[];
  /** How many guests are live (for listeners when names are hidden). */
  panelCount?: number;
  /** Max simultaneous guest panelists. */
  panelCap: number;
  /** Everyone currently in the room (host + listeners). */
  presence: PresenceMember[];
  listenerCount: number;
  /** Voice / LiveKit gate for this session (absent if older server). */
  voice?: VoiceInfo;
  /** Latest host soundboard hit (everyone should play once). */
  lastSfx?: RoomSfxEvent | null;
}
