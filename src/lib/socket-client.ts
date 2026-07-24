"use client";

/**
 * Browser-side Socket.io helper.
 * One shared connection so the home page and room page talk to the same live server.
 */

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./types";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (typeof window === "undefined") {
    throw new Error("Socket is only available in the browser");
  }

  if (!socket) {
    // Empty URL = same host that served the page (our custom server).
    socket = io({
      path: "/socket.io",
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
  }

  return socket;
}
