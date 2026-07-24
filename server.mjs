/**
 * Custom server: Next.js (the website) + Socket.io (live updates) on one port.
 *
 * Why a custom server?
 * Next.js alone is great for pages. Live multi-person updates need a long-lived
 * connection. Socket.io provides that; this file wires both together.
 *
 * Note for later (deploy): pure Socket.io does not run on Vercel's free
 * serverless model the same way. Local + multi-person testing works great here.
 * When we deploy, we will choose a free host that supports this pattern
 * (or a small adaptation). Step 1 is structure + local-ready code.
 */

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { randomBytes, randomUUID } from "crypto";

const dev = process.env.NODE_ENV !== "production";
// 0.0.0.0 = accept connections from outside this machine (needed on cloud hosts + same-Wi-Fi phone tests)
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// --- In-memory store (mirrors src/lib/rooms-store.ts logic for the server process) ---
// Kept here so the .mjs server does not need a TypeScript build step for MVP.

/** @typedef {"host" | "listener"} Role */
/** @typedef {"pending" | "approved" | "rejected" | "displayed"} QuestionStatus */

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

function createRoom(name) {
  const trimmed = name.trim();
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
    displayedQuestionId: null,
    members: new Map(),
  });

  return room;
}

function joinRoom(roomId, socketId, displayName, hostToken) {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");

  const name = displayName.trim().slice(0, 40) || "Guest";
  const role =
    hostToken && hostToken === state.room.hostToken ? "host" : "listener";

  state.members.set(socketId, { displayName: name, role });
  return { state, role };
}

function leaveRoom(socketId) {
  for (const [roomId, state] of rooms.entries()) {
    if (state.members.has(socketId)) {
      state.members.delete(socketId);
      return roomId;
    }
  }
  return null;
}

function requireHost(roomId, socketId) {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");
  const member = state.members.get(socketId);
  if (!member || member.role !== "host") {
    throw new Error("Only the host can do that");
  }
  return state;
}

function buildSnapshot(roomId, role) {
  const state = rooms.get(roomId);
  if (!state) throw new Error("Room not found");

  const displayed =
    state.questions.find((q) => q.id === state.displayedQuestionId) ?? null;

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

function broadcastRoomList(io) {
  io.emit("room:list-updated", listRoomsPublic());
}

// --- Boot ---

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    socket.on("room:list", (ack) => {
      if (typeof ack === "function") ack(listRoomsPublic());
    });

    socket.on("room:create", (payload, ack) => {
      try {
        const room = createRoom(payload?.name || "");
        broadcastRoomList(io);
        if (typeof ack === "function") {
          ack({ ok: true, roomId: room.id, hostToken: room.hostToken });
        }
      } catch (err) {
        if (typeof ack === "function") {
          ack({ ok: false, error: err.message || "Could not create room" });
        }
      }
    });

    socket.on("room:join", (payload, ack) => {
      try {
        const roomId = payload?.roomId;
        const displayName = payload?.displayName || "Guest";
        const hostToken = payload?.hostToken;

        // Leave any previous room first
        const previous = leaveRoom(socket.id);
        if (previous) {
          socket.leave(previous);
          io.to(previous).emit("room:presence", {
            listenerCount: countListeners(rooms.get(previous)),
          });
          broadcastRoomList(io);
        }

        const { role } = joinRoom(roomId, socket.id, displayName, hostToken);
        socket.join(roomId);

        io.to(roomId).emit("room:presence", {
          listenerCount: countListeners(rooms.get(roomId)),
        });
        broadcastRoomList(io);

        if (typeof ack === "function") {
          ack({ ok: true, snapshot: buildSnapshot(roomId, role) });
        }
      } catch (err) {
        if (typeof ack === "function") {
          ack({ ok: false, error: err.message || "Could not join room" });
        }
      }
    });

    socket.on("chat:send", (payload, ack) => {
      try {
        const roomId = payload?.roomId;
        const state = rooms.get(roomId);
        if (!state) throw new Error("Room not found");
        const member = state.members.get(socket.id);
        if (!member) throw new Error("You are not in this room");

        const cleaned = String(payload?.text || "").trim().slice(0, 500);
        if (!cleaned) throw new Error("Message cannot be empty");

        const message = {
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

        io.to(roomId).emit("chat:new", message);
        if (typeof ack === "function") ack({ ok: true });
      } catch (err) {
        if (typeof ack === "function") {
          ack({ ok: false, error: err.message || "Could not send message" });
        }
      }
    });

    socket.on("question:submit", (payload, ack) => {
      try {
        const roomId = payload?.roomId;
        const state = rooms.get(roomId);
        if (!state) throw new Error("Room not found");
        const member = state.members.get(socket.id);
        if (!member) throw new Error("You are not in this room");

        const cleaned = String(payload?.text || "").trim().slice(0, 400);
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

        // Hosts always get the full queue update; listeners get approved/displayed only.
        // For simplicity: emit full question to room; client filters by role.
        io.to(roomId).emit("question:updated", question);
        if (typeof ack === "function") ack({ ok: true, question });
      } catch (err) {
        if (typeof ack === "function") {
          ack({ ok: false, error: err.message || "Could not submit question" });
        }
      }
    });

    socket.on("question:approve", (payload, ack) => {
      try {
        const roomId = payload?.roomId;
        const state = requireHost(roomId, socket.id);
        const question = state.questions.find((q) => q.id === payload?.questionId);
        if (!question) throw new Error("Question not found");
        if (question.status === "displayed") {
          throw new Error("That question is currently on display");
        }
        question.status = "approved";
        io.to(roomId).emit("question:updated", question);
        if (typeof ack === "function") ack({ ok: true });
      } catch (err) {
        if (typeof ack === "function") {
          ack({ ok: false, error: err.message || "Could not approve" });
        }
      }
    });

    socket.on("question:reject", (payload, ack) => {
      try {
        const roomId = payload?.roomId;
        const state = requireHost(roomId, socket.id);
        const question = state.questions.find((q) => q.id === payload?.questionId);
        if (!question) throw new Error("Question not found");
        if (question.status === "displayed") {
          throw new Error("That question is currently on display");
        }
        question.status = "rejected";
        io.to(roomId).emit("question:updated", question);
        if (typeof ack === "function") ack({ ok: true });
      } catch (err) {
        if (typeof ack === "function") {
          ack({ ok: false, error: err.message || "Could not reject" });
        }
      }
    });

    socket.on("question:display", (payload, ack) => {
      try {
        const roomId = payload?.roomId;
        const state = requireHost(roomId, socket.id);
        const question = state.questions.find((q) => q.id === payload?.questionId);
        if (!question) throw new Error("Question not found");
        if (question.status === "rejected") {
          throw new Error("Cannot display a rejected question");
        }

        for (const q of state.questions) {
          if (q.status === "displayed" && q.id !== question.id) {
            q.status = "approved";
            io.to(roomId).emit("question:updated", q);
          }
        }

        question.status = "displayed";
        state.displayedQuestionId = question.id;
        io.to(roomId).emit("question:updated", question);
        io.to(roomId).emit("question:displayed", question);
        if (typeof ack === "function") ack({ ok: true });
      } catch (err) {
        if (typeof ack === "function") {
          ack({ ok: false, error: err.message || "Could not display question" });
        }
      }
    });

    socket.on("question:clear-display", (payload, ack) => {
      try {
        const roomId = payload?.roomId;
        const state = requireHost(roomId, socket.id);
        if (state.displayedQuestionId) {
          const current = state.questions.find(
            (q) => q.id === state.displayedQuestionId
          );
          if (current && current.status === "displayed") {
            current.status = "approved";
            io.to(roomId).emit("question:updated", current);
          }
        }
        state.displayedQuestionId = null;
        io.to(roomId).emit("question:displayed", null);
        if (typeof ack === "function") ack({ ok: true });
      } catch (err) {
        if (typeof ack === "function") {
          ack({ ok: false, error: err.message || "Could not clear display" });
        }
      }
    });

    socket.on("disconnect", () => {
      const roomId = leaveRoom(socket.id);
      if (roomId && rooms.has(roomId)) {
        io.to(roomId).emit("room:presence", {
          listenerCount: countListeners(rooms.get(roomId)),
        });
        broadcastRoomList(io);
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(
      `> Live Talk Radio ready on http://${hostname}:${port} (${dev ? "dev" : "prod"})`
    );
  });
});
