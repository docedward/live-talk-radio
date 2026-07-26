"use client";

/**
 * Plain HTTP API used by phones / tunnels when Socket.io cannot connect.
 */

import type {
  ChatMessage,
  CraftEmote,
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

export function createRoom(
  name: string,
  hostName: string,
  avatarId?: string,
  hostOpts?: { hostSlug?: string; hostSecret?: string }
) {
  return api<{
    ok: true;
    roomId: string;
    hostToken: string;
    hostSlug?: string | null;
  }>("/api/rooms", {
    method: "POST",
    body: JSON.stringify({
      name,
      hostName,
      avatarId,
      hostSlug: hostOpts?.hostSlug,
      hostSecret: hostOpts?.hostSecret,
    }),
  });
}

export type PublicHost = {
  slug: string;
  displayName: string;
  weeklyBulletin: string;
  dayNotice: string;
  liveRoomId: string | null;
  liveUrl: string | null;
  craftPack: CraftEmote[];
  updatedAt: number | null;
};

/** Claim a durable host handle (once). Secret is shown once — store it. */
export function createHostIdentity(slug: string, displayName: string) {
  return api<{
    ok: true;
    slug: string;
    hostSecret: string;
    displayName: string;
  }>("/api/hosts", {
    method: "POST",
    body: JSON.stringify({ slug, displayName }),
  });
}

export function fetchHost(slug: string) {
  return api<{ ok: true; host: PublicHost }>(
    `/api/hosts/${encodeURIComponent(slug)}`
  );
}

export function updateHostPage(
  slug: string,
  hostSecret: string,
  fields: {
    displayName?: string;
    weeklyBulletin?: string;
    dayNotice?: string;
    removeCraftId?: string;
  }
) {
  return api<{ ok: true; host: PublicHost }>(
    `/api/hosts/${encodeURIComponent(slug)}`,
    {
      method: "POST",
      body: JSON.stringify({ hostSecret, ...fields }),
    }
  );
}

/** Propose a handmade craft emote (host auto-approves into the pack). */
export function submitCraftEmote(
  roomId: string,
  emoji: string,
  label = ""
) {
  return api<{
    ok: true;
    craft: CraftEmote;
    status: string;
    snapshot: RoomSnapshot;
  }>(`/api/rooms/${encodeURIComponent(roomId)}/craft`, {
    method: "POST",
    body: JSON.stringify({ emoji, label }),
  });
}

/** Host: approve / reject pending craft, or remove from pack. */
export function moderateCraftEmote(
  roomId: string,
  craftId: string,
  action: "approve" | "reject" | "remove"
) {
  return api<{
    ok: true;
    craft?: CraftEmote | { removed: true };
    snapshot: RoomSnapshot;
  }>(
    `/api/rooms/${encodeURIComponent(roomId)}/craft/${encodeURIComponent(craftId)}/${action}`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

/** Host: set bulletin / day-of notice for the live show. */
export function updateShowPresence(
  roomId: string,
  fields: { bulletin?: string; dayNotice?: string }
) {
  return api<{
    ok: true;
    bulletin: string;
    dayNotice: string;
    snapshot: RoomSnapshot;
  }>(`/api/rooms/${encodeURIComponent(roomId)}/presence`, {
    method: "POST",
    body: JSON.stringify(fields),
  });
}

export function joinRoom(
  roomId: string,
  displayName: string,
  hostToken?: string,
  avatarId?: string
) {
  return api<{ ok: true; snapshot: RoomSnapshot }>(
    `/api/rooms/${encodeURIComponent(roomId)}/join`,
    {
      method: "POST",
      body: JSON.stringify({ displayName, hostToken, avatarId }),
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

/** Listener: leave speaker panel, stay in room as listener. */
export function leaveSpeakerPanel(roomId: string) {
  return api<{ ok: true; request?: OnAirRequest }>(
    `/api/rooms/${encodeURIComponent(roomId)}/on-air/leave-self`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

/** Listener: cancel a pending On Air request. */
export function cancelOnAirRequest(roomId: string) {
  return api<{ ok: true; request?: OnAirRequest }>(
    `/api/rooms/${encodeURIComponent(roomId)}/on-air/cancel-self`,
    { method: "POST", body: JSON.stringify({}) }
  );
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

/** Leave show (show continues; host exit may promote a panelist). */
export function leaveRoom(roomId: string) {
  return api<{ ok: true }>(
    `/api/rooms/${encodeURIComponent(roomId)}/leave`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

/** Host: end show for everyone — no longer joinable. */
export function endShow(roomId: string) {
  return api<{ ok: true; ended: true }>(
    `/api/rooms/${encodeURIComponent(roomId)}/end`,
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
