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

/** Host: add to panel (live), reject, remove, or toggle mute. */
export function moderateOnAir(
  roomId: string,
  requestId: string,
  action: "live" | "reject" | "remove" | "mute"
) {
  return api<{ ok: true; request?: OnAirRequest }>(
    `/api/rooms/${encodeURIComponent(roomId)}/on-air/${encodeURIComponent(requestId)}/${action}`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

/** Host: click name box — mute / unmute panel guest. */
export function togglePanelMute(roomId: string, requestId: string) {
  return moderateOnAir(roomId, requestId, "mute");
}

/** Host: clear entire guest panel. */
export function clearOnAir(roomId: string) {
  return api<{ ok: true }>(
    `/api/rooms/${encodeURIComponent(roomId)}/on-air/clear`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

/** Host: remove one guest from the panel. */
export function removeFromPanel(roomId: string, requestId: string) {
  return moderateOnAir(roomId, requestId, "remove");
}

/** Host: fire a soundboard effect for the whole room. */
export function triggerRoomSfx(roomId: string, sound: string) {
  return api<{ ok: true; lastSfx: { id: string; sound: string; at: number } }>(
    `/api/rooms/${encodeURIComponent(roomId)}/sfx`,
    {
      method: "POST",
      body: JSON.stringify({ sound }),
    }
  );
}

/** Leave room (also used via sendBeacon on tab close). */
export function leaveRoom(roomId: string) {
  return api<{ ok: true }>(
    `/api/rooms/${encodeURIComponent(roomId)}/leave`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

/** Fire-and-forget leave for pagehide (phones often kill the tab). */
export function leaveRoomBeacon(roomId: string) {
  if (typeof window === "undefined") return;
  const sessionId = getSessionId();
  const url = `/api/rooms/${encodeURIComponent(roomId)}/leave`;
  const body = JSON.stringify({ sessionId });
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      // Some browsers ignore custom content-type on beacon; also send session in query
      const ok = navigator.sendBeacon(
        `${url}?sessionId=${encodeURIComponent(sessionId)}`,
        blob
      );
      if (ok) return;
    }
  } catch {
    /* fall through */
  }
  void fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": sessionId,
    },
    body,
    keepalive: true,
  }).catch(() => undefined);
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

/** HTTPS public base (Cloudflare tunnel) for sharing with remote guests. */
export function fetchPublicBase() {
  return api<{ ok: true; url: string | null; hasPublicUrl: boolean }>(
    "/api/public-base"
  );
}

/**
 * Room URL remote people can open. Rewrites localhost/LAN → tunnel HTTPS.
 */
export async function getShareableRoomUrl(): Promise<string> {
  const here = typeof window !== "undefined" ? window.location.href : "";
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.");

  if (!isLocal) return here;

  try {
    const { url: base } = await fetchPublicBase();
    if (base) {
      const path =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "";
      return `${base.replace(/\/$/, "")}${path}`;
    }
  } catch {
    /* fall through */
  }
  return here;
}
