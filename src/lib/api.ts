"use client";

/**
 * Plain HTTP API used by phones / tunnels when Socket.io cannot connect.
 */

import type {
  ChatMessage,
  OnAirRequest,
  Question,
  RoomSnapshot,
} from "./types";

const SESSION_KEY = "ltr-session-id";

export function getSessionId(): string {
  if (typeof window === "undefined") return "server";

  const makeId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Private / old browsers sometimes throw on localStorage
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = makeId();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return makeId();
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": getSessionId(),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: string }).error)
        : `Request failed (${res.status})`;
    throw new Error(err);
  }

  return data as T;
}

export type PublicRoom = { id: string; name: string; listenerCount: number };

export function fetchRooms() {
  return api<PublicRoom[]>("/api/rooms");
}

export function createRoom(name: string, hostName: string) {
  return api<{ ok: true; roomId: string; hostToken: string }>("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name, hostName }),
  });
}

export function joinRoom(
  roomId: string,
  displayName: string,
  hostToken?: string
) {
  return api<{ ok: true; snapshot: RoomSnapshot }>(
    `/api/rooms/${encodeURIComponent(roomId)}/join`,
    {
      method: "POST",
      body: JSON.stringify({ displayName, hostToken }),
    }
  );
}

export function fetchSnapshot(roomId: string) {
  return api<{ ok: true; snapshot: RoomSnapshot }>(
    `/api/rooms/${encodeURIComponent(roomId)}`
  );
}

export function sendChat(roomId: string, text: string) {
  return api<{ ok: true; message: ChatMessage }>(
    `/api/rooms/${encodeURIComponent(roomId)}/chat`,
    {
      method: "POST",
      body: JSON.stringify({ text }),
    }
  );
}

export function submitQuestion(roomId: string, text: string) {
  return api<{ ok: true; question: Question }>(
    `/api/rooms/${encodeURIComponent(roomId)}/questions`,
    {
      method: "POST",
      body: JSON.stringify({ text }),
    }
  );
}

export function moderateQuestion(
  roomId: string,
  questionId: string,
  action: "approve" | "reject"
) {
  return api<{ ok: true; question?: Question }>(
    `/api/rooms/${encodeURIComponent(roomId)}/questions/${encodeURIComponent(questionId)}/${action}`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

/** Listener requests to go on air (optional short note). */
export function requestOnAir(roomId: string, note = "") {
  return api<{ ok: true; request: OnAirRequest }>(
    `/api/rooms/${encodeURIComponent(roomId)}/on-air`,
    {
      method: "POST",
      body: JSON.stringify({ note }),
    }
  );
}

/** Host: go-live (approve) or reject an on-air request. */
export function moderateOnAir(
  roomId: string,
  requestId: string,
  action: "live" | "reject"
) {
  return api<{ ok: true; request?: OnAirRequest }>(
    `/api/rooms/${encodeURIComponent(roomId)}/on-air/${encodeURIComponent(requestId)}/${action}`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export function clearOnAir(roomId: string) {
  return api<{ ok: true }>(
    `/api/rooms/${encodeURIComponent(roomId)}/on-air/clear`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

/** Mint a LiveKit access token for the current session (publish rights from server). */
export function fetchVoiceToken(roomId: string) {
  return api<{
    ok: true;
    token: string;
    url: string;
    roomName: string;
    canPublish: boolean;
  }>(`/api/rooms/${encodeURIComponent(roomId)}/voice-token`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function pingHealth() {
  return api<{ ok: true; voice?: boolean }>("/api/health");
}
