/**
 * TypeScript reference for room logic.
 * Runtime truth for the MVP is server.mjs (REST API).
 * Keep this aligned so `next build` typechecks cleanly.
 */

import { randomBytes, randomUUID } from "crypto";
import type {
  ChatMessage,
  OnAirRequest,
  Question,
  Role,
  Room,
  RoomSnapshot,
} from "./types";

interface RoomState {
  room: Room;
  messages: ChatMessage[];
  questions: Question[];
  onAirRequests: (OnAirRequest & { memberId: string })[];
  liveOnAirId: string | null;
  members: Map<string, { displayName: string; role: Role }>;
}

const rooms = new Map<string, RoomState>();

function makeRoomId(): string {
  return randomBytes(3).toString("hex");
}

function makeHostToken(): string {
  return randomBytes(16).toString("hex");
}

export function listRoomsPublic() {
  return Array.from(rooms.values()).map((state) => ({
    id: state.room.id,
    name: state.room.name,
    listenerCount: countListeners(state),
  }));
}

function countListeners(state: RoomState): number {
  let n = 0;
  for (const member of state.members.values()) {
    if (member.role === "listener") n += 1;
  }
  return n;
}

export function createRoom(name: string): Room {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Room name is required");

  let id = makeRoomId();
  while (rooms.has(id)) id = makeRoomId();

  const room: Room = {
    id,
    name: trimmed.slice(0, 80),
    hostToken: makeHostToken(),
    createdAt: Date.now(),
  };

  rooms.set(id, {
    room,
    messages: [],
    questions: [],
    onAirRequests: [],
    liveOnAirId: null,
    members: new Map(),
  });

  return room;
}

export function joinRoom(
  roomId: string,
  memberId: string,
  displayName: string,
  hostToken?: string
): { state: RoomState; role: Role } {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");

  const name = displayName.trim().slice(0, 40) || "Guest";
  const role: Role =
    hostToken && hostToken === state.room.hostToken ? "host" : "listener";

  state.members.set(memberId, { displayName: name, role });
  return { state, role };
}

export function buildSnapshot(roomId: string, role: Role): RoomSnapshot {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");

  const live =
    state.onAirRequests.find((r) => r.id === state.liveOnAirId) ?? null;

  const questions =
    role === "host"
      ? [...state.questions]
      : state.questions.filter((q) => q.status === "approved");

  const onAirRequests =
    role === "host"
      ? state.onAirRequests.map(publicOnAir)
      : state.onAirRequests
          .filter((r) => r.status === "live" || r.status === "pending")
          .map(publicOnAir);

  return {
    room: {
      id: state.room.id,
      name: state.room.name,
      createdAt: state.room.createdAt,
    },
    role,
    messages: [...state.messages],
    questions,
    onAirRequests,
    liveOnAir: live ? publicOnAir(live) : null,
    presence: Array.from(state.members.values()).map((m) => ({
      displayName: m.displayName,
      role: m.role,
    })),
    listenerCount: countListeners(state),
  };
}

function publicOnAir(
  r: OnAirRequest & { memberId?: string }
): OnAirRequest {
  return {
    id: r.id,
    roomId: r.roomId,
    authorName: r.authorName,
    note: r.note,
    status: r.status,
    createdAt: r.createdAt,
  };
}

export function addChatMessage(
  roomId: string,
  memberId: string,
  text: string
): ChatMessage {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");
  const member = state.members.get(memberId);
  if (!member) throw new Error("You are not in this room");

  const cleaned = text.trim().slice(0, 500);
  if (!cleaned) throw new Error("Message cannot be empty");

  const message: ChatMessage = {
    id: randomUUID(),
    roomId,
    authorName: member.displayName,
    text: cleaned,
    createdAt: Date.now(),
  };

  state.messages.push(message);
  if (state.messages.length > 200) {
    state.messages = state.messages.slice(-200);
  }
  return message;
}
