/**
 * Custom server: Next.js pages + REST API (phone-friendly) + optional Socket.io.
 *
 * Listener choices: ask a question OR request On Air.
 * Host: moderate questions + approve On Air requests (no host-picked "put on air").
 * Voice: LiveKit Cloud tokens gated by role + live On Air (host always, one guest).
 */

import { createServer } from "http";
import { parse } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import next from "next";
import { Server } from "socket.io";
import { randomBytes, randomUUID } from "crypto";
import {
  AccessToken,
  RoomServiceClient,
  DataPacket_Kind,
} from "livekit-server-sdk";

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

// --- Durable host skin (Phase C): JSON file, survives process restarts when disk persists ---
const DATA_DIR = resolve(__dirname, ".data");
const HOSTS_FILE = resolve(DATA_DIR, "hosts.json");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** @type {Map<string, object>} */
const hostsBySlug = new Map();

function loadHostsFromDisk() {
  try {
    if (!existsSync(HOSTS_FILE)) return;
    const raw = JSON.parse(readFileSync(HOSTS_FILE, "utf8"));
    if (raw && typeof raw === "object") {
      for (const [slug, row] of Object.entries(raw)) {
        hostsBySlug.set(String(slug).toLowerCase(), row);
      }
    }
  } catch (err) {
    console.warn("host store load:", err instanceof Error ? err.message : err);
  }
}

function saveHostsToDisk() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const obj = Object.fromEntries(hostsBySlug.entries());
    writeFileSync(HOSTS_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.warn("host store save:", err instanceof Error ? err.message : err);
  }
}

loadHostsFromDisk();

function normalizeSlug(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  if (s.length < 2) throw new Error("Handle must be at least 2 characters");
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{2}$/.test(s)) {
    throw new Error("Handle: letters, numbers, hyphens only");
  }
  return s;
}

function publicHostProfile(row) {
  const live =
    row.liveRoomId && rooms.has(row.liveRoomId) ? row.liveRoomId : null;
  // Clear stale live link
  if (row.liveRoomId && !live) {
    row.liveRoomId = null;
    saveHostsToDisk();
  }
  return {
    slug: row.slug,
    displayName: row.displayName,
    weeklyBulletin: row.weeklyBulletin || "",
    dayNotice: row.dayNotice || "",
    liveRoomId: live,
    liveUrl: live ? `/room/${live}` : null,
    updatedAt: row.updatedAt || null,
  };
}

function createHostIdentity(slugRaw, displayName) {
  const slug = normalizeSlug(slugRaw);
  if (hostsBySlug.has(slug)) {
    throw new Error("That handle is already taken — pick another");
  }
  const hostSecret = randomBytes(18).toString("hex");
  const row = {
    slug,
    hostSecret,
    displayName: String(displayName || slug).trim().slice(0, 40) || slug,
    weeklyBulletin: "",
    weeklyBulletinAt: 0,
    dayNotice: "",
    liveRoomId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  hostsBySlug.set(slug, row);
  saveHostsToDisk();
  return { slug, hostSecret, displayName: row.displayName };
}

function requireHostSecret(slugRaw, secret) {
  const slug = normalizeSlug(slugRaw);
  const row = hostsBySlug.get(slug);
  if (!row) throw new Error("Host page not found");
  if (!secret || secret !== row.hostSecret) {
    throw new Error("Invalid host secret");
  }
  return row;
}

function updateHostPresence(slugRaw, secret, body) {
  const row = requireHostSecret(slugRaw, secret);
  const now = Date.now();
  if (body.displayName !== undefined) {
    row.displayName =
      String(body.displayName || row.displayName).trim().slice(0, 40) ||
      row.displayName;
  }
  if (body.weeklyBulletin !== undefined) {
    const next = String(body.weeklyBulletin || "").trim().slice(0, 500);
    const prev = row.weeklyBulletin || "";
    if (next !== prev) {
      if (row.weeklyBulletinAt && now - row.weeklyBulletinAt < WEEK_MS) {
        const days = Math.ceil(
          (WEEK_MS - (now - row.weeklyBulletinAt)) / (24 * 60 * 60 * 1000)
        );
        throw new Error(
          `Weekly bulletin can only change once a week (try again in ~${days} day${days === 1 ? "" : "s"})`
        );
      }
      row.weeklyBulletin = next;
      row.weeklyBulletinAt = now;
    }
  }
  if (body.dayNotice !== undefined) {
    row.dayNotice = String(body.dayNotice || "").trim().slice(0, 200);
  }
  row.updatedAt = now;
  saveHostsToDisk();
  return publicHostProfile(row);
}

function linkHostLiveRoom(slugRaw, secret, roomId) {
  const row = requireHostSecret(slugRaw, secret);
  row.liveRoomId = roomId || null;
  row.updatedAt = Date.now();
  saveHostsToDisk();
  return publicHostProfile(row);
}

function clearHostLiveRoom(roomId) {
  for (const row of hostsBySlug.values()) {
    if (row.liveRoomId === roomId) {
      row.liveRoomId = null;
      row.updatedAt = Date.now();
      saveHostsToDisk();
    }
  }
}

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

function guestHostMuted(state, memberId) {
  const live = livePanelRequests(state).find((r) => r.memberId === memberId);
  return !!(live && live.hostMuted);
}

/** Eligible for a LiveKit publish-capable token (host or on panel). Host mute does NOT remove this. */
function memberCanPublish(state, memberId, role) {
  if (role === "host") return true;
  return isLiveGuest(state, memberId);
}

function voiceInfo(state, memberId, role) {
  const enabled = isVoiceConfigured();
  const onPanel = role === "host" || isLiveGuest(state, memberId);
  const hostMuted =
    role === "listener" &&
    isLiveGuest(state, memberId) &&
    guestHostMuted(state, memberId);
  // canPublish = may stay in LiveKit as a publisher identity (subscribe always works)
  // hostMuted = one-way: stop their mic only; they still hear host
  return {
    enabled,
    canPublish: enabled && memberCanPublish(state, memberId, role),
    url: enabled ? getLiveKitUrl() : "",
    hostMuted,
    onPanel: enabled && onPanel,
  };
}

function livekitHttpHost() {
  return getLiveKitUrl()
    .replace(/^wss:/i, "https:")
    .replace(/^ws:/i, "http:");
}

function getRoomService() {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!apiKey || !apiSecret || !getLiveKitUrl()) return null;
  return new RoomServiceClient(livekitHttpHost(), apiKey, apiSecret);
}

/** Drop someone from LiveKit publish rights entirely (remove from panel / leave). */
async function livekitSetCanPublish(roomId, identity, canPublish) {
  const svc = getRoomService();
  if (!svc || !identity) return;
  try {
    await svc.updateParticipant(livekitRoomName(roomId), identity, {
      permission: {
        canPublish: Boolean(canPublish),
        canSubscribe: true,
        canPublishData: true,
      },
    });
  } catch (err) {
    console.warn(
      "LiveKit updateParticipant:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * One-way mute: silence their mic tracks only. They keep canSubscribe so they still hear the host.
 * (Revoking canPublish was reconnecting them and cutting what they heard.)
 */
async function livekitMuteGuestMic(roomId, identity, muted) {
  const svc = getRoomService();
  if (!svc || !identity) return;
  const room = livekitRoomName(roomId);
  try {
    const info = await svc.getParticipant(room, identity);
    for (const t of info.tracks || []) {
      // TrackType.AUDIO = 0; skip pure video (type 1)
      if (t.type === 1 || t.type === "VIDEO") continue;
      if (!t.sid) continue;
      try {
        await svc.mutePublishedTrack(room, identity, t.sid, Boolean(muted));
      } catch (err) {
        console.warn(
          "LiveKit mutePublishedTrack:",
          err instanceof Error ? err.message : err
        );
      }
    }
  } catch (err) {
    console.warn(
      "LiveKit mute guest mic:",
      err instanceof Error ? err.message : err
    );
  }
}

/** Push soundboard to everyone still in LiveKit (even if REST poll died). */
async function livekitBroadcastSfx(roomId, sound, eventId) {
  const svc = getRoomService();
  if (!svc) return;
  try {
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: "sfx", sound, id: eventId })
    );
    await svc.sendData(
      livekitRoomName(roomId),
      payload,
      DataPacket_Kind.RELIABLE,
      { topic: "trl-sfx" }
    );
  } catch (err) {
    console.warn("LiveKit sendData:", err instanceof Error ? err.message : err);
  }
}

async function mintVoiceToken({ roomId, memberId, displayName, canPublish }) {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    throw new Error("Voice is not configured on this server");
  }

  // Host-muted guests stay "on panel" but must not publish
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
    canPublishData: true,
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

/** Empty show GC — no members for this long → delete (not joinable). */
const EMPTY_SHOW_GC_MS = 3 * 60 * 1000;
/** Host alone with no listeners this long → soft end (optional hygiene). */
const HOST_ONLY_IDLE_MS = 60 * 60 * 1000;

function listRoomsPublic() {
  pruneIdleShows();
  return Array.from(rooms.values()).map((state) => ({
    id: state.room.id,
    name: state.room.name,
    listenerCount: countListeners(state),
  }));
}

/**
 * Drop empty shows and very long host-only zombies so free tier stays honest.
 */
function pruneIdleShows() {
  const now = Date.now();
  for (const [id, state] of rooms.entries()) {
    pruneStaleMembers(state);
    const n = state.members.size;
    if (n === 0) {
      if (!state.emptySince) state.emptySince = now;
      else if (now - state.emptySince > EMPTY_SHOW_GC_MS) {
        clearHostLiveRoom(id);
        rooms.delete(id);
        void livekitDeleteRoom(id);
      }
      continue;
    }
    state.emptySince = null;
    const listeners = countListeners(state);
    if (listeners === 0) {
      if (!state.hostOnlySince) state.hostOnlySince = now;
      else if (now - state.hostOnlySince > HOST_ONLY_IDLE_MS) {
        clearHostLiveRoom(id);
        rooms.delete(id);
        void livekitDeleteRoom(id);
      }
    } else {
      state.hostOnlySince = null;
    }
  }
}

function countListeners(state) {
  let n = 0;
  for (const member of state.members.values()) {
    if (member.role === "listener") n += 1;
  }
  return n;
}

/** Playing-card avatars: "AS", "KC", "QH", "JR"/"JB" jokers, etc. */
const CARD_RANKS = new Set([
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
]);
const CARD_SUITS = ["S", "H", "D", "C"];
const FULL_DECK = [
  ...CARD_SUITS.flatMap((s) =>
    ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map(
      (r) => `${r}${s}`
    )
  ),
  "JR",
  "JB",
];
const CARD_RE = /^(A|10|[2-9JQK])([SHDC])$/i;
const JOKER_RE = /^J([RB])$/i;

function normalizeCardId(raw) {
  if (raw == null || raw === "") return null;
  const u = String(raw).trim().toUpperCase();
  const j = u.match(JOKER_RE);
  if (j) return `J${j[1].toUpperCase()}`;
  const m = u.match(CARD_RE);
  if (!m) return null;
  if (!CARD_RANKS.has(m[1])) return null;
  return `${m[1]}${m[2]}`;
}

function takenAvatars(state, exceptMemberId) {
  const taken = new Set();
  for (const [id, m] of state.members.entries()) {
    if (exceptMemberId && id === exceptMemberId) continue;
    const a = normalizeCardId(m.avatarId);
    if (a) taken.add(a);
  }
  return taken;
}

function resolveAvatarId(state, memberId, requested) {
  const taken = takenAvatars(state, memberId);
  const want = normalizeCardId(requested);
  if (want && !taken.has(want)) return want;
  // Keep existing card on rejoin if still free / owned
  const existing = normalizeCardId(state.members.get(memberId)?.avatarId);
  if (existing && (!taken.has(existing) || want === existing)) return existing;
  if (want && taken.has(want)) {
    throw new Error(
      `That card is already taken — pick another (e.g. Ace of Spades, 7 of Hearts).`
    );
  }
  const free = FULL_DECK.filter((c) => !taken.has(c));
  const pool = free.length > 0 ? free : FULL_DECK;
  return pool[Math.floor(Math.random() * pool.length)];
}

function presenceList(state) {
  return Array.from(state.members.values()).map((m) => ({
    displayName: m.displayName,
    role: m.role,
    avatarId: m.avatarId || null,
  }));
}

function createRoom(name, opts = {}) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Show name is required");

  let id = makeRoomId();
  while (rooms.has(id)) id = makeRoomId();

  let hostSlug = null;
  let seedBulletin = "";
  let seedDay = "";
  if (opts.hostSlug && opts.hostSecret) {
    const profile = linkHostLiveRoom(opts.hostSlug, opts.hostSecret, id);
    hostSlug = profile.slug;
    const host = hostsBySlug.get(hostSlug);
    seedBulletin = host?.weeklyBulletin || "";
    seedDay = host?.dayNotice || "";
  }

  const room = {
    id,
    name: trimmed.slice(0, 80),
    hostToken: makeHostToken(),
    createdAt: Date.now(),
    bulletin: seedBulletin,
    dayNotice: seedDay,
    hostSlug: hostSlug || null,
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

/** Host: weekly-ish bulletin + day-of emergency notice (ephemeral with room). */
function setRoomPresence(roomId, hostMemberId, { bulletin, dayNotice }) {
  const { state } = requireHostMember(roomId, hostMemberId);
  if (bulletin !== undefined) {
    state.room.bulletin = String(bulletin || "").trim().slice(0, 500);
  }
  if (dayNotice !== undefined) {
    state.room.dayNotice = String(dayNotice || "").trim().slice(0, 200);
  }
  return {
    bulletin: state.room.bulletin || "",
    dayNotice: state.room.dayNotice || "",
  };
}

const HOST_SFX_IDS = new Set([
  "applause",
  "pew",
  "horn",
  "asmr",
  "riser",
  "pop",
  "funny",
  "meme",
  "alert",
  "laugh",
  "popwow",
  "ghost",
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
  // Reach people whose browser UI timed out but voice is still up
  void livekitBroadcastSfx(roomId, id, state.lastSfx.id);
  return state.lastSfx;
}

function joinRoom(roomId, memberId, displayName, hostToken, avatarId) {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Show not found or has ended");

  const name = String(displayName || "").trim().slice(0, 40) || "Guest";
  const role =
    hostToken && hostToken === state.room.hostToken ? "host" : "listener";

  for (const [otherId, other] of rooms.entries()) {
    if (otherId !== roomId && other.members.has(memberId)) {
      other.members.delete(memberId);
    }
  }

  const card = resolveAvatarId(state, memberId, avatarId);

  state.members.set(memberId, {
    displayName: name,
    role,
    avatarId: card,
    lastSeen: Date.now(),
  });

  // Keep panel / queue / chat author avatars in sync on rejoin rename
  for (const r of state.onAirRequests) {
    if (r.memberId === memberId) {
      r.authorName = name;
      r.authorAvatar = card;
    }
  }

  return { state, role };
}

function touchMember(roomId, memberId) {
  const state = rooms.get(roomId);
  const member = state?.members.get(memberId);
  if (member) member.lastSeen = Date.now();
}

/**
 * Presence list only: hide people who stopped polling.
 * Do NOT end panel/live — flaky tunnels drop REST while LiveKit voice still works.
 * Explicit leave (tab close / leave API) ends panel seat.
 */
const MEMBER_STALE_MS = 45_000;

function endLiveForMember(state, memberId) {
  for (const r of state.onAirRequests) {
    if (r.memberId === memberId && r.status === "live") {
      r.status = "done";
      r.hostMuted = false;
    }
  }
}

function pruneStaleMembers(state) {
  const now = Date.now();
  for (const [id, member] of state.members.entries()) {
    const last = member.lastSeen || 0;
    if (now - last > MEMBER_STALE_MS) {
      // Presence only — keep panel + LiveKit seat until host removes or they leave
      state.members.delete(id);
    }
  }
}

/**
 * Leave the show but keep it open.
 * If the host leaves, promote the first live panel guest to host so the show
 * can continue without the original host.
 */
function leaveRoom(roomId, memberId) {
  const state = rooms.get(roomId);
  if (!state) return;
  const leaving = state.members.get(memberId);
  const wasHost = leaving?.role === "host";
  endLiveForMember(state, memberId);
  state.members.delete(memberId);
  void livekitSetCanPublish(roomId, memberId, false);

  if (wasHost) {
    promotePanelHost(state);
  }
}

/** First live panelist becomes host (if still in the room). */
function promotePanelHost(state) {
  const live = livePanelRequests(state);
  for (const r of live) {
    const m = state.members.get(r.memberId);
    if (m && m.role !== "host") {
      m.role = "host";
      // Keep them live on panel so they can still speak
      return m;
    }
  }
  // No panelist — show stays open for listeners (no host tools until someone
  // rejoins with the original hostToken).
  return null;
}

/**
 * Host ends the show for everyone. Room is removed — no new joins.
 */
function endShow(roomId, hostMemberId) {
  const { state } = requireHostMember(roomId, hostMemberId);
  // Drop panel publishes best-effort
  for (const r of livePanelRequests(state)) {
    void livekitSetCanPublish(roomId, r.memberId, false);
  }
  for (const [id] of state.members.entries()) {
    void livekitSetCanPublish(roomId, id, false);
  }
  clearHostLiveRoom(roomId);
  rooms.delete(roomId);
  // Best-effort tear down LiveKit room
  void livekitDeleteRoom(roomId);
  return { ended: true };
}

async function livekitDeleteRoom(roomId) {
  const svc = getRoomService();
  if (!svc) return;
  try {
    await svc.deleteRoom(livekitRoomName(roomId));
  } catch (err) {
    console.warn(
      "LiveKit deleteRoom:",
      err instanceof Error ? err.message : err
    );
  }
}

function requireMember(roomId, memberId) {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Show has ended");
  const member = state.members.get(memberId);
  if (!member) throw new Error("You are not in this show — join first");
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
      bulletin: state.room.bulletin || "",
      dayNotice: state.room.dayNotice || "",
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
    authorAvatar: member.avatarId || null,
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
    authorAvatar: member.avatarId || null,
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
    authorAvatar: member.avatarId || null,
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
  request.hostMuted = false;
  void livekitSetCanPublish(roomId, request.memberId, true);
  return request;
}

/** Host toggles mute on a live panel guest (does not remove them). */
function togglePanelMute(roomId, hostMemberId, requestId) {
  const { state } = requireHostMember(roomId, hostMemberId);
  const request = state.onAirRequests.find((r) => r.id === requestId);
  if (!request) throw new Error("On Air request not found");
  if (request.status !== "live") {
    throw new Error("That person is not on the panel");
  }
  request.hostMuted = !request.hostMuted;
  // One-way: mute their mic tracks only (they still hear host + room)
  void livekitMuteGuestMic(roomId, request.memberId, request.hostMuted);
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
  request.hostMuted = false;
  void livekitSetCanPublish(roomId, request.memberId, false);
  return request;
}

/**
 * Listener leaves the speaker panel but stays in the room as a normal listener.
 * Mic publish rights are revoked; chat / questions still work.
 */
function leavePanelSelf(roomId, memberId) {
  const { state, member } = requireMember(roomId, memberId);
  if (member.role === "host") {
    throw new Error("Host stays on air — use Clear panel for guests");
  }
  const request = state.onAirRequests.find(
    (r) => r.memberId === memberId && r.status === "live"
  );
  if (!request) throw new Error("You are not on the speaker panel");
  request.status = "done";
  request.hostMuted = false;
  void livekitSetCanPublish(roomId, memberId, false);
  return request;
}

/** Listener cancels a pending On Air request (still stays in the room). */
function cancelOnAirSelf(roomId, memberId) {
  const { state } = requireMember(roomId, memberId);
  const request = state.onAirRequests.find(
    (r) => r.memberId === memberId && r.status === "pending"
  );
  if (!request) throw new Error("No pending On Air request");
  request.status = "rejected";
  return request;
}

/** Host clears entire guest panel. */
function clearOnAir(roomId, hostMemberId) {
  const { state } = requireHostMember(roomId, hostMemberId);
  for (const r of state.onAirRequests) {
    if (r.status === "live") {
      r.status = "done";
      r.hostMuted = false;
      void livekitSetCanPublish(roomId, r.memberId, false);
    }
  }
}

/**
 * Buffer the request body immediately. Must be started as soon as the
 * request arrives — if we only attach listeners after awaits, small POST
 * bodies can finish first and `end` never fires (create-room hang on Mac).
 */
function bufferRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;

    function finish() {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    }

    req.on("data", (c) => chunks.push(c));
    req.on("end", finish);
    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    // Body already fully received before we subscribed
    if (req.readableEnded || req.complete) {
      finish();
    }
  });
}

function methodHasBody(method) {
  return method === "POST" || method === "PUT" || method === "PATCH";
}

/** Public HTTPS base for Share (remote guests cannot use localhost). */
function getPublicAppBase() {
  const fromEnv = (
    process.env.PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  try {
    const p = resolve(__dirname, ".public-url");
    if (existsSync(p)) {
      return readFileSync(p, "utf8").trim().replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }
  try {
    const p = resolve(
      process.env.HOME || "",
      "GrokBox/outputs/live-talk-radio-public-url.txt"
    );
    if (existsSync(p)) {
      return readFileSync(p, "utf8").trim().replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }
  return "";
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
function publicRequest(r, viewerMemberId, { hideName = false } = {}) {
  const isMe = Boolean(viewerMemberId && r.memberId === viewerMemberId);
  return {
    id: r.id,
    roomId: r.roomId,
    authorName: hideName && !isMe ? "" : r.authorName,
    authorAvatar: hideName && !isMe ? null : r.authorAvatar || null,
    note: hideName && !isMe ? "" : r.note,
    status: r.status,
    createdAt: r.createdAt,
    isMe,
    hostMuted: Boolean(r.hostMuted),
  };
}

function publicSnapshot(roomId, role, memberId) {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");
  pruneStaleMembers(state);
  pruneIdleShows();
  if (!rooms.has(roomId)) throw new Error("Show has ended");
  const snap = buildSnapshot(roomId, role);
  const rawPanel = snap.livePanel || [];
  const panelCount = rawPanel.length;

  // Stage is public: everyone sees who is on the panel (card + name).
  const livePanelPublic = rawPanel.map((r) => publicRequest(r, memberId));

  // Pending On Air queue: host sees names; listeners see own pending + anonymized others
  const onAirPublic =
    role === "host"
      ? snap.onAirRequests.map((r) => publicRequest(r, memberId))
      : snap.onAirRequests.map((r) =>
          publicRequest(r, memberId, {
            hideName: r.memberId !== memberId,
          })
        );

  return {
    ...snap,
    onAirRequests: onAirPublic,
    liveOnAir:
      role === "host" && snap.liveOnAir
        ? publicRequest(snap.liveOnAir, memberId)
        : livePanelPublic[0] || null,
    livePanel: livePanelPublic,
    panelCount,
    panelCap: snap.panelCap ?? MAX_PANEL_GUESTS,
    voice: voiceInfo(state, memberId, role),
  };
}

/** @returns {Promise<boolean>} true if handled */
async function handleApi(req, res, pathname, query, bodyPromise) {
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    sendJson(res, 204, {});
    return true;
  }

  if (!pathname.startsWith("/api/")) return false;

  const body = bodyPromise ? await bodyPromise : {};

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        voice: isVoiceConfigured(),
      });
      return true;
    }

    if (pathname === "/api/public-base" && req.method === "GET") {
      const url = getPublicAppBase();
      sendJson(res, 200, {
        ok: true,
        url: url || null,
        hasPublicUrl: Boolean(url),
      });
      return true;
    }

    if (pathname === "/api/rooms" && req.method === "GET") {
      sendJson(res, 200, listRoomsPublic());
      return true;
    }

    if (pathname === "/api/rooms" && req.method === "POST") {
      const room = createRoom(body.name, {
        hostSlug: body.hostSlug,
        hostSecret: body.hostSecret,
      });
      sendJson(res, 200, {
        ok: true,
        roomId: room.id,
        hostToken: room.hostToken,
        hostSlug: room.hostSlug || null,
      });
      return true;
    }

    // POST /api/hosts — claim a durable host handle
    if (pathname === "/api/hosts" && req.method === "POST") {
      const created = createHostIdentity(body.slug, body.displayName);
      sendJson(res, 200, { ok: true, ...created });
      return true;
    }

    // GET /api/hosts/:slug — public host page data
    const hostGet = pathname.match(/^\/api\/hosts\/([^/]+)$/);
    if (hostGet && req.method === "GET") {
      const slug = normalizeSlug(decodeURIComponent(hostGet[1]));
      const row = hostsBySlug.get(slug);
      if (!row) throw new Error("Host page not found");
      sendJson(res, 200, { ok: true, host: publicHostProfile(row) });
      return true;
    }

    // POST /api/hosts/:slug — update bulletin / day notice (secret required)
    if (hostGet && req.method === "POST") {
      const slug = decodeURIComponent(hostGet[1]);
      const host = updateHostPresence(slug, body.hostSecret, body);
      // Mirror day notice into live room if linked
      if (host.liveRoomId && rooms.has(host.liveRoomId)) {
        const st = rooms.get(host.liveRoomId);
        if (body.dayNotice !== undefined) {
          st.room.dayNotice = host.dayNotice;
        }
        if (body.weeklyBulletin !== undefined) {
          st.room.bulletin = host.weeklyBulletin;
        }
      }
      sendJson(res, 200, { ok: true, host });
      return true;
    }

    const joinMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
    if (joinMatch && req.method === "POST") {
      const roomId = decodeURIComponent(joinMatch[1]);
      const memberId = sessionIdFrom(req, body);
      const { role } = joinRoom(
        roomId,
        memberId,
        body.displayName,
        body.hostToken,
        body.avatarId
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
      const memberId = sessionIdFrom(req, body, query);
      const lastSfx = triggerSfx(roomId, memberId, body.sound);
      sendJson(res, 200, { ok: true, lastSfx });
      return true;
    }

    // POST /api/rooms/:id/presence — host bulletin + day notice
    const presenceMatch = pathname.match(
      /^\/api\/rooms\/([^/]+)\/presence$/
    );
    if (presenceMatch && req.method === "POST") {
      const roomId = decodeURIComponent(presenceMatch[1]);
      const memberId = sessionIdFrom(req, body, query);
      const presence = setRoomPresence(roomId, memberId, {
        bulletin: body.bulletin,
        dayNotice: body.dayNotice,
      });
      const { member } = requireMember(roomId, memberId);
      sendJson(res, 200, {
        ok: true,
        ...presence,
        snapshot: publicSnapshot(roomId, member.role, memberId),
      });
      return true;
    }

    // POST /api/rooms/:id/leave — exit (show continues)
    const leaveMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/leave$/);
    if (leaveMatch && req.method === "POST") {
      const roomId = decodeURIComponent(leaveMatch[1]);
      const memberId = sessionIdFrom(req, body, query);
      leaveRoom(roomId, memberId);
      sendJson(res, 200, { ok: true });
      return true;
    }

    // POST /api/rooms/:id/end — host ends show for everyone
    const endMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/end$/);
    if (endMatch && req.method === "POST") {
      const roomId = decodeURIComponent(endMatch[1]);
      const memberId = sessionIdFrom(req, body, query);
      endShow(roomId, memberId);
      sendJson(res, 200, { ok: true, ended: true });
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
      const memberId = sessionIdFrom(req, body);
      const { state, member } = requireMember(roomId, memberId);
      // Allow publish only when not host-muted
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
        hostMuted: guestHostMuted(state, memberId),
      });
      return true;
    }

    const chatMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/chat$/);
    if (chatMatch && req.method === "POST") {
      const roomId = decodeURIComponent(chatMatch[1]);
      const memberId = sessionIdFrom(req, body);
      const message = addChat(roomId, memberId, body.text);
      sendJson(res, 200, { ok: true, message });
      return true;
    }

    const qSubmit = pathname.match(/^\/api\/rooms\/([^/]+)\/questions$/);
    if (qSubmit && req.method === "POST") {
      const roomId = decodeURIComponent(qSubmit[1]);
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
      const memberId = sessionIdFrom(req, body);
      clearOnAir(roomId, memberId);
      sendJson(res, 200, { ok: true });
      return true;
    }

    // POST /api/rooms/:id/on-air/leave-self — listener goes off air, stays in room
    const leaveSelfMatch = pathname.match(
      /^\/api\/rooms\/([^/]+)\/on-air\/leave-self$/
    );
    if (leaveSelfMatch && req.method === "POST") {
      const roomId = decodeURIComponent(leaveSelfMatch[1]);
      const memberId = sessionIdFrom(req, body);
      const request = leavePanelSelf(roomId, memberId);
      sendJson(res, 200, {
        ok: true,
        request: publicRequest(request, memberId),
      });
      return true;
    }

    // POST /api/rooms/:id/on-air/cancel-self — cancel pending request
    const cancelSelfMatch = pathname.match(
      /^\/api\/rooms\/([^/]+)\/on-air\/cancel-self$/
    );
    if (cancelSelfMatch && req.method === "POST") {
      const roomId = decodeURIComponent(cancelSelfMatch[1]);
      const memberId = sessionIdFrom(req, body);
      const request = cancelOnAirSelf(roomId, memberId);
      sendJson(res, 200, {
        ok: true,
        request: publicRequest(request, memberId),
      });
      return true;
    }

    // POST /api/rooms/:id/on-air/:requestId/live|reject|remove|mute
    const onAirAction = pathname.match(
      /^\/api\/rooms\/([^/]+)\/on-air\/([^/]+)\/(live|reject|remove|mute)$/
    );
    if (onAirAction && req.method === "POST") {
      const roomId = decodeURIComponent(onAirAction[1]);
      const requestId = decodeURIComponent(onAirAction[2]);
      const action = onAirAction[3];
      const memberId = sessionIdFrom(req, body);
      let request;
      if (action === "live") {
        request = setOnAirLive(roomId, memberId, requestId);
      } else if (action === "remove") {
        request = removeFromPanel(roomId, memberId, requestId);
      } else if (action === "mute") {
        request = togglePanelMute(roomId, memberId, requestId);
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

    // Start reading body immediately for API POSTs (avoids hang if stream ends early)
    const bodyPromise =
      pathname.startsWith("/api/") && methodHasBody(req.method || "")
        ? bufferRequestBody(req)
        : null;

    try {
      const handled = await handleApi(
        req,
        res,
        pathname,
        parsedUrl.query || {},
        bodyPromise
      );
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
