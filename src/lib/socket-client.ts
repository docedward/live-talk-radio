"use client";

/**
 * Optional Socket.io helper. Phones use REST polling (src/lib/api.ts).
 * Kept for desktop/local experiments; not required for the MVP path.
 */

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (typeof window === "undefined") {
    throw new Error("Socket is only available in the browser");
  }

  if (!socket) {
    socket = io({
      path: "/socket.io",
      autoConnect: true,
      transports: ["polling", "websocket"],
      upgrade: true,
      rememberUpgrade: false,
      reconnection: true,
      timeout: 20000,
    });
  }

  return socket;
}

export function waitForSocket(timeoutMs = 15000): Promise<Socket> {
  const s = getSocket();
  if (s.connected) return Promise.resolve(s);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Could not reach the live server"));
    }, timeoutMs);

    function onConnect() {
      cleanup();
      resolve(s);
    }

    function onError(err: Error) {
      cleanup();
      reject(new Error(err?.message || "Live connection failed"));
    }

    function cleanup() {
      clearTimeout(timer);
      s.off("connect", onConnect);
      s.off("connect_error", onError);
    }

    s.once("connect", onConnect);
    s.once("connect_error", onError);
    if (!s.active) s.connect();
  });
}
