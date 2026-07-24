/**
 * In-memory room store for the MVP.
 * Everything lives in the server's RAM while the app is running.
 * Restarting the server clears rooms (fine for a first version).
 */

import { randomBytes, randomUUID } from "crypto";
import type { ChatMessage, Question, Room, RoomSnapshot, Role } from "./types";

interface RoomState {
  room: Room;
  messages: ChatMessage[];
  questions: Question[];
  displayedQuestionId: string | null;
  /** socket.id -> display name */
  members: Map<string, { displayName: string; role: Role }>;
}

const rooms = new Map<string, RoomState>();

function makeRoomId(): string {
  // Short, shareable codes (e.g. "k7m2pq")
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
  if (!trimmed) {
    throw new Error("Room name is required");
  }

  let id = makeRoomId();
  while (rooms.has(id)) {
    id = makeRoomId();
  }

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
    displayedQuestionId: null,
    members: new Map(),
  });

  return room;
}

export function getRoom(roomId: string): RoomState | undefined {
  return rooms.get(roomId);
}

export function joinRoom(
  roomId: string,
  socketId: string,
  displayName: string,
  hostToken?: string
): { state: RoomState; role: Role } {
  const state = rooms.get(roomId);
  if (!state) {
    throw new Error("Room not found");
  }

  const name = displayName.trim().slice(0, 40) || "Guest";
  const role: Role =
    hostToken && hostToken === state.room.hostToken ? "host" : "listener";

  state.members.set(socketId, { displayName: name, role });
  return { state, role };
}

export function leaveRoom(socketId: string): string | null {
  for (const [roomId, state] of rooms.entries()) {
    if (state.members.has(socketId)) {
      state.members.delete(socketId);
      return roomId;
    }
  }
  return null;
}

export function getMember(roomId: string, socketId: string) {
  return rooms.get(roomId)?.members.get(socketId);
}

export function addChatMessage(
  roomId: string,
  socketId: string,
  text: string
): ChatMessage {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");
  const member = state.members.get(socketId);
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
  // Keep chat from growing forever in memory
  if (state.messages.length > 200) {
    state.messages = state.messages.slice(-200);
  }

  return message;
}

export function submitQuestion(
  roomId: string,
  socketId: string,
  text: string
): Question {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");
  const member = state.members.get(socketId);
  if (!member) throw new Error("You are not in this room");

  const cleaned = text.trim().slice(0, 400);
  if (!cleaned) throw new Error("Question cannot be empty");

  const question: Question = {
    id: randomUUID(),
    roomId,
    authorName: member.displayName,
    text: cleaned,
    status: "pending",
    createdAt: Date.now(),
  };

  state.questions.push(question);
  return question;
}

function requireHost(roomId: string, socketId: string): RoomState {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");
  const member = state.members.get(socketId);
  if (!member || member.role !== "host") {
    throw new Error("Only the host can do that");
  }
  return state;
}

export function setQuestionStatus(
  roomId: string,
  socketId: string,
  questionId: string,
  status: "approved" | "rejected"
): Question {
  const state = requireHost(roomId, socketId);
  const question = state.questions.find((q) => q.id === questionId);
  if (!question) throw new Error("Question not found");
  if (question.status === "displayed") {
    throw new Error("That question is currently on display");
  }
  question.status = status;
  return question;
}

export function displayQuestion(
  roomId: string,
  socketId: string,
  questionId: string
): Question {
  const state = requireHost(roomId, socketId);
  const question = state.questions.find((q) => q.id === questionId);
  if (!question) throw new Error("Question not found");
  if (question.status === "rejected") {
    throw new Error("Cannot display a rejected question");
  }

  // Only one on-air question at a time
  for (const q of state.questions) {
    if (q.status === "displayed" && q.id !== questionId) {
      q.status = "approved";
    }
  }

  question.status = "displayed";
  state.displayedQuestionId = questionId;
  return question;
}

export function clearDisplayedQuestion(
  roomId: string,
  socketId: string
): void {
  const state = requireHost(roomId, socketId);
  if (state.displayedQuestionId) {
    const current = state.questions.find(
      (q) => q.id === state.displayedQuestionId
    );
    if (current && current.status === "displayed") {
      current.status = "approved";
    }
  }
  state.displayedQuestionId = null;
}

export function buildSnapshot(roomId: string, role: Role): RoomSnapshot {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");

  const displayed =
    state.questions.find((q) => q.id === state.displayedQuestionId) ?? null;

  // Hosts see every question; listeners only see approved / displayed (and their own pending is still ok for MVP via full list of approved+)
  const questions =
    role === "host"
      ? [...state.questions]
      : state.questions.filter(
          (q) => q.status === "approved" || q.status === "displayed"
        );

  return {
    room: {
      id: state.room.id,
      name: state.room.name,
      createdAt: state.room.createdAt,
    },
    role,
    messages: [...state.messages],
    questions,
    displayedQuestion: displayed,
    listenerCount: countListeners(state),
  };
}

export function getListenerCount(roomId: string): number {
  const state = rooms.get(roomId);
  if (!state) return 0;
  return countListeners(state);
}
