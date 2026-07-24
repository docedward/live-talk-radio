/**
 * Custom server: Next.js pages + REST API (phone-friendly) + optional Socket.io.
 *
 * Listener choices: ask a question OR request On Air.
 * Host: moderate questions + approve On Air requests (no host-picked "put on air").
 * Voice: LiveKit Cloud tokens gated by role + live On Air (host always, one guest).
 */

import { createServer } from "http";
import { parse } from "url";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import next from "next";
import { Server } from "socket.io";
import { randomBytes, randomUUID } from "crypto";
import { AccessToken } from "livekit-server-sdk";

// --- Load .env.local / .env (Node does not auto-load for custom server) ---
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(resolve(__dirname, ".env.local"));
loadEnvFile(resolve(__dirname, ".env"));

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

function getLiveKitUrl() {
  return (
    process.env.LIVEKIT_URL ||
    process.env.NEXT_PUBLIC_LIVEKIT_URL ||
    ""
  ).trim();
}

function isVoiceConfigured() {
  return Boolean(
    getLiveKitUrl() &&
      process.env.LIVEKIT_API_KEY?.trim() &&
      process.env.LIVEKIT_API_SECRET?.trim()
  );
}

function livekitRoomName(roomId) {
  return `trl-${roomId}`;
}

/** Max simultaneous guest mics on the panel (host is separate). */
const MAX_PANEL_GUESTS = 5;

function livePanelRequests(state) {
  return state.onAirRequests.filter((r) => r.status === "live");
}

function isLiveGuest(state, memberId) {
  return livePanelRequests(state).some((r) => r.memberId === memberId);
}

function memberCanPublish(state, memberId, role) {
  if (role === "host") return true;
  return isLiveGuest(state, memberId);
}

function voiceInfo(state, memberId, role) {
  const enabled = isVoiceConfigured();
  return {
    enabled,
    canPublish: enabled && memberCanPublish(state, memberId, role),
    url: enabled ? getLiveKitUrl() : "",
  };
}

async function mintVoiceToken({ roomId, memberId, displayName, canPublish }) {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    throw new Error("Voice is not configured on this server");
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: memberId,
    name: displayName || "Guest",
    ttl: "2h",
  });
  at.addGrant({
    roomJoin: true,
    room: livekitRoomName(roomId),
    canPublish,
    canSubscribe: true,
    canPublishData: false,
  });
  return at.toJwt();
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const rooms = new Map();

function makeRoomId() {
  return randomBytes(3).toString("hex");
}

function makeHostToken() {
  return randomBytes(16).toString("hex");
}

function listRoomsPublic() {
  return Array.from(rooms.values()).map((state) => ({
    id: state.room.id,
    name: state.room.name,
    listenerCount: countListeners(state),
  }));
}

function countListeners(state) {
  let n = 0;
  for (const member of state.members.values()) {
    if (member.role === "listener") n += 1;
  }
  return n;
}

function presenceList(state) {
  return Array.from(state.members.values()).map((m) => ({
    displayName: m.displayName,
    role: m.role,
  }));
}

function createRoom(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Room name is required");

  let id = makeRoomId();
  while (rooms.has(id)) id = makeRoomId();

  const room = {
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
    members: new Map(),
    lastSfx: null,
  });

  return room;
}

const HOST_SFX_IDS = new Set([
  "cry",
  "drumroll",
  "pew",
  "laugh",
  "applause",
  "ohh",
]);

function triggerSfx(roomId, hostMemberId, sound) {
  const { state, member } = requireHostMember(roomId, hostMemberId);
  const id = String(sound || "").trim();
  if (!HOST_SFX_IDS.has(id)) {
    throw new Error("Unknown sound");
  }
  state.lastSfx = {
    id: randomUUID(),
    sound: id,
    at: Date.now(),
    byName: member.displayName,
  };
  return state.lastSfx;
}

function joinRoom(roomId, memberId, displayName, hostToken) {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");

  const name = String(displayName || "").trim().slice(0, 40) || "Guest";
  const role =
    hostToken && hostToken === state.room.hostToken ? "host" : "listener";

  for (const [otherId, other] of rooms.entries()) {
    if (otherId !== roomId && other.members.has(memberId)) {
      other.members.delete(memberId);
    }
  }

  state.members.set(memberId, {
    displayName: name,
    role,
    lastSeen: Date.now(),
  });
  return { state, role };
}

function touchMember(roomId, memberId) {
  const state = rooms.get(roomId);
  const member = state?.members.get(memberId);
  if (member) member.lastSeen = Date.now();
}

/** Drop people who stopped polling / closed the tab (~12s of silence). */
const MEMBER_STALE_MS = 12_000;

function endLiveForMember(state, memberId) {
  for (const r of state.onAirRequests) {
    if (r.memberId === memberId && r.status === "live") {
      r.status = "done";
    }
  }
}

function pruneStaleMembers(state) {
  const now = Date.now();
  for (const [id, member] of state.members.entries()) {
    const last = member.lastSeen || 0;
    if (now - last > MEMBER_STALE_MS) {
      endLiveForMember(state, id);
      state.members.delete(id);
    }
  }
}

function leaveRoom(roomId, memberId) {
  const state = rooms.get(roomId);
  if (!state) return;
  endLiveForMember(state, memberId);
  state.members.delete(memberId);
}

function requireMember(roomId, memberId) {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");
  const member = state.members.get(memberId);
  if (!member) throw new Error("You are not in this room — join first");
  touchMember(roomId, memberId);
  return { state, member };
}

function requireHostMember(roomId, memberId) {
  const { state, member } = requireMember(roomId, memberId);
  if (member.role !== "host") throw new Error("Only the host can do that");
  return { state, member };
}

function buildSnapshot(roomId, role) {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");

  const livePanel = livePanelRequests(state);
  /** @deprecated single-slot field — first panelist if any (compat) */
  const liveOnAir = livePanel[0] ?? null;

  const questions =
    role === "host"
      ? [...state.questions]
      : state.questions.filter((q) => q.status === "approved");

  const onAirRequests =
    role === "host"
      ? [...state.onAirRequests]
      : state.onAirRequests.filter(
          (r) => r.status === "live" || r.status === "pending"
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
    onAirRequests,
    liveOnAir,
    livePanel,
    panelCap: MAX_PANEL_GUESTS,
    presence: presenceList(state),
    listenerCount: countListeners(state),
    lastSfx: state.lastSfx || null,
  };
}

function addChat(roomId, memberId, text) {
  const { state, member } = requireMember(roomId, memberId);
  const cleaned = String(text || "").trim().slice(0, 500);
  if (!cleaned) throw new Error("Message cannot be empty");

  const message = {
    id: randomUUID(),
    roomId,
    authorName: member.displayName,
    text: cleaned,
    createdAt: Date.now(),
  };
  state.messages.push(message);
  if (state.messages.length > 200) state.messages = state.messages.slice(-200);
  return message;
}

function addQuestion(roomId, memberId, text) {
  const { state, member } = requireMember(roomId, memberId);
  const cleaned = String(text || "").trim().slice(0, 400);
  if (!cleaned) throw new Error("Question cannot be empty");

  const question = {
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

function setQuestionStatus(roomId, memberId, questionId, status) {
  const { state } = requireHostMember(roomId, memberId);
  const question = state.questions.find((q) => q.id === questionId);
  if (!question) throw new Error("Question not found");
  question.status = status;
  return question;
}

function addOnAirRequest(roomId, memberId, note) {
  const { state, member } = requireMember(roomId, memberId);
  if (member.role === "host") {
    throw new Error("Host is already on air as moderator");
  }

  const pendingExists = state.onAirRequests.some(
    (r) =>
      r.memberId === memberId &&
      (r.status === "pending" || r.status === "live")
  );
  if (pendingExists) {
    throw new Error("You already have an On Air request open");
  }

  const request = {
    id: randomUUID(),
    roomId,
    memberId,
    authorName: member.displayName,
    note: String(note || "").trim().slice(0, 200),
    status: "pending",
    createdAt: Date.now(),
  };
  state.onAirRequests.push(request);
  return request;
}

function setOnAirLive(roomId, hostMemberId, requestId) {
  const { state } = requireHostMember(roomId, hostMemberId);
  const request = state.onAirRequests.find((r) => r.id === requestId);
  if (!request) throw new Error("On Air request not found");
  if (request.status === "rejected" || request.status === "done") {
    throw new Error("That request is no longer available");
  }
  if (request.status === "live") {
    return request;
  }

  const panel = livePanelRequests(state);
  if (panel.length >= MAX_PANEL_GUESTS) {
    throw new Error(
      `Panel is full (${MAX_PANEL_GUESTS} guests). Remove someone before adding another.`
    );
  }

  // Add to panel — do not demote other live guests
  request.status = "live";
  return request;
}

function rejectOnAir(roomId, hostMemberId, requestId) {
  const { state } = requireHostMember(roomId, hostMemberId);
  const request = state.onAirRequests.find((r) => r.id === requestId);
  if (!request) throw new Error("On Air request not found");
  request.status = "rejected";
  return request;
}

/** Host removes one guest from the panel (mic off for them). */
function removeFromPanel(roomId, hostMemberId, requestId) {
  const { state } = requireHostMember(roomId, hostMemberId);
  const request = state.onAirRequests.find((r) => r.id === requestId);
  if (!request) throw new Error("On Air request not found");
  if (request.status !== "live") {
    throw new Error("That person is not on the panel");
  }
  request.status = "done";
  return request;
}

/** Host clears entire guest panel. */
function clearOnAir(roomId, hostMemberId) {
  const { state } = requireHostMember(roomId, hostMemberId);
  for (const r of state.onAirRequests) {
    if (r.status === "live") {
      r.status = "done";
    }
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(body);
}

function sessionIdFrom(req, body, query) {
  const header = req.headers["x-session-id"];
  if (typeof header === "string" && header.trim()) return header.trim();
  if (body?.sessionId) return String(body.sessionId);
  if (query?.sessionId) return String(query.sessionId);
  return randomUUID();
}

/** Public snapshot fields for API — strip internal memberId from on-air requests */
function publicRequest(r, viewerMemberId) {
  return {
    id: r.id,
    roomId: r.roomId,
    authorName: r.authorName,
    note: r.note,
    status: r.status,
    createdAt: r.createdAt,
    isMe: Boolean(viewerMemberId && r.memberId === viewerMemberId),
  };
}

function publicSnapshot(roomId, role, memberId) {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");
  pruneStaleMembers(state);
  const snap = buildSnapshot(roomId, role);
  return {
    ...snap,
    onAirRequests: snap.onAirRequests.map((r) => publicRequest(r, memberId)),
    liveOnAir: snap.liveOnAir
      ? publicRequest(snap.liveOnAir, memberId)
      : null,
    livePanel: (snap.livePanel || []).map((r) => publicRequest(r, memberId)),
    panelCap: snap.panelCap ?? MAX_PANEL_GUESTS,
    voice: voiceInfo(state, memberId, role),
  };
}

/** @returns {Promise<boolean>} true if handled */
async function handleApi(req, res, pathname, query) {
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    sendJson(res, 204, {});
    return true;
  }

  if (!pathname.startsWith("/api/")) return false;

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        voice: isVoiceConfigured(),
      });
      return true;
    }

    if (pathname === "/api/rooms" && req.method === "GET") {
      sendJson(res, 200, listRoomsPublic());
      return true;
    }

    if (pathname === "/api/rooms" && req.method === "POST") {
      const body = await readBody(req);
      const room = createRoom(body.name);
      sendJson(res, 200, {
        ok: true,
        roomId: room.id,
        hostToken: room.hostToken,
      });
      return true;
    }

    const joinMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
    if (joinMatch && req.method === "POST") {
      const roomId = decodeURIComponent(joinMatch[1]);
      const body = await readBody(req);
      const memberId = sessionIdFrom(req, body);
      const { role } = joinRoom(
        roomId,
        memberId,
        body.displayName,
        body.hostToken
      );
      sendJson(res, 200, {
        ok: true,
        snapshot: publicSnapshot(roomId, role, memberId),
        sessionId: memberId,
      });
      return true;
    }

    const roomGet = pathname.match(/^\/api\/rooms\/([^/]+)$/);
    if (roomGet && req.method === "GET") {
      const roomId = decodeURIComponent(roomGet[1]);
      const memberId = sessionIdFrom(req, query);
      const state = rooms.get(roomId);
      if (!state) throw new Error("Room not found");
      const member = state.members.get(memberId);
      if (!member) throw new Error("You are not in this room — join first");
      touchMember(roomId, memberId);
      sendJson(res, 200, {
        ok: true,
        snapshot: publicSnapshot(roomId, member.role, memberId),
      });
      return true;
    }

    // POST /api/rooms/:id/sfx — host soundboard
    const sfxMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/sfx$/);
    if (sfxMatch && req.method === "POST") {
      const roomId = decodeURIComponent(sfxMatch[1]);
      const body = await readBody(req);
      const memberId = sessionIdFrom(req, body, query);
      const lastSfx = triggerSfx(roomId, memberId, body.sound);
      sendJson(res, 200, { ok: true, lastSfx });
      return true;
    }

    // POST /api/rooms/:id/leave — tab close / explicit leave
    const leaveMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/leave$/);
    if (leaveMatch && req.method === "POST") {
      const roomId = decodeURIComponent(leaveMatch[1]);
      const body = await readBody(req);
      const memberId = sessionIdFrom(req, body, query);
      leaveRoom(roomId, memberId);
      sendJson(res, 200, { ok: true });
      return true;
    }

    // POST /api/rooms/:id/voice-token — mint LiveKit JWT for current member
    const voiceTokenMatch = pathname.match(
      /^\/api\/rooms\/([^/]+)\/voice-token$/
    );
    if (voiceTokenMatch && req.method === "POST") {
      if (!isVoiceConfigured()) {
        throw new Error("Voice is not configured on this server");
      }
      const roomId = decodeURIComponent(voiceTokenMatch[1]);
      const body = await readBody(req);
      const memberId = sessionIdFrom(req, body);
      const { state, member } = requireMember(roomId, memberId);
      const canPublish = memberCanPublish(state, memberId, member.role);
      const token = await mintVoiceToken({
        roomId,
        memberId,
        displayName: member.displayName,
        canPublish,
      });
      sendJson(res, 200, {
        ok: true,
        token,
        url: getLiveKitUrl(),
        roomName: livekitRoomName(roomId),
        canPublish,
      });
      return true;
    }

    const chatMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/chat$/);
    if (chatMatch && req.method === "POST") {
      const roomId = decodeURIComponent(chatMatch[1]);
      const body = await readBody(req);
      const memberId = sessionIdFrom(req, body);
      const message = addChat(roomId, memberId, body.text);
      sendJson(res, 200, { ok: true, message });
      return true;
    }

    const qSubmit = pathname.match(/^\/api\/rooms\/([^/]+)\/questions$/);
    if (qSubmit && req.method === "POST") {
      const roomId = decodeURIComponent(qSubmit[1]);
      const body = await readBody(req);
      const memberId = sessionIdFrom(req, body);
      const question = addQuestion(roomId, memberId, body.text);
      sendJson(res, 200, { ok: true, question });
      return true;
    }

    const qAction = pathname.match(
      /^\/api\/rooms\/([^/]+)\/questions\/([^/]+)\/(approve|reject)$/
    );
    if (qAction && req.method === "POST") {
      const roomId = decodeURIComponent(qAction[1]);
      const questionId = decodeURIComponent(qAction[2]);
      const action = qAction[3];
      const body = await readBody(req);
      const memberId = sessionIdFrom(req, body);
      const question = setQuestionStatus(
        roomId,
        memberId,
        questionId,
        action === "approve" ? "approved" : "rejected"
      );
      sendJson(res, 200, { ok: true, question });
      return true;
    }

    // POST /api/rooms/:id/on-air  — listener requests on air
    const onAirSubmit = pathname.match(/^\/api\/rooms\/([^/]+)\/on-air$/);
    if (onAirSubmit && req.method === "POST") {
      const roomId = decodeURIComponent(onAirSubmit[1]);
      const body = await readBody(req);
      const memberId = sessionIdFrom(req, body);
      const request = addOnAirRequest(roomId, memberId, body.note);
      sendJson(res, 200, {
        ok: true,
        request: publicRequest(request, memberId),
      });
      return true;
    }

    // POST /api/rooms/:id/on-air/clear — clear entire guest panel
    const onAirClear = pathname.match(/^\/api\/rooms\/([^/]+)\/on-air\/clear$/);
    if (onAirClear && req.method === "POST") {
      const roomId = decodeURIComponent(onAirClear[1]);
      const body = await readBody(req);
      const memberId = sessionIdFrom(req, body);
      clearOnAir(roomId, memberId);
      sendJson(res, 200, { ok: true });
      return true;
    }

    // POST /api/rooms/:id/on-air/:requestId/live|reject|remove
    const onAirAction = pathname.match(
      /^\/api\/rooms\/([^/]+)\/on-air\/([^/]+)\/(live|reject|remove)$/
    );
    if (onAirAction && req.method === "POST") {
      const roomId = decodeURIComponent(onAirAction[1]);
      const requestId = decodeURIComponent(onAirAction[2]);
      const action = onAirAction[3];
      const body = await readBody(req);
      const memberId = sessionIdFrom(req, body);
      let request;
      if (action === "live") {
        request = setOnAirLive(roomId, memberId, requestId);
      } else if (action === "remove") {
        request = removeFromPanel(roomId, memberId, requestId);
      } else {
        request = rejectOnAir(roomId, memberId, requestId);
      }
      sendJson(res, 200, {
        ok: true,
        request: publicRequest(request, memberId),
      });
      return true;
    }

    sendJson(res, 404, { error: "API route not found" });
    return true;
  } catch (err) {
    sendJson(res, 400, { error: err.message || "Request failed" });
    return true;
  }
}

// --- Boot ---

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url || "/", true);
    const pathname = parsedUrl.pathname || "/";

    try {
      const handled = await handleApi(req, res, pathname, parsedUrl.query || {});
      if (handled) return;
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Server error" });
      return;
    }

    handle(req, res, parsedUrl);
  });

  // Socket.io kept optional for desktop; phones use REST polling.
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: "*" },
    transports: ["polling", "websocket"],
  });
  void io;

  httpServer.listen(port, hostname, () => {
    console.log(
      `> Live Talk Radio ready on http://${hostname}:${port} (${dev ? "dev" : "prod"})`
    );
    console.log("> REST: questions + On Air requests + presence");
    console.log(
      isVoiceConfigured()
        ? `> Voice: LiveKit enabled (${getLiveKitUrl()})`
        : "> Voice: off (set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)"
    );
  });
});
