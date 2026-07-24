"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSocket } from "@/lib/socket-client";

type PublicRoom = { id: string; name: string; listenerCount: number };

/**
 * Live list of open rooms. Updates when anyone creates a room or joins/leaves.
 */
export function RoomList() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    function refresh() {
      socket.emit("room:list", (list) => setRooms(list));
    }

    function onConnect() {
      setConnected(true);
      refresh();
    }

    function onDisconnect() {
      setConnected(false);
    }

    function onListUpdated(list: PublicRoom[]) {
      setRooms(list);
    }

    if (socket.connected) onConnect();
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:list-updated", onListUpdated);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:list-updated", onListUpdated);
    };
  }, []);

  return (
    <section className="flex w-full flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Open rooms
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Join as a listener — or open a share link someone sent you.
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            connected
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          }`}
        >
          {connected ? "Live" : "Connecting…"}
        </span>
      </div>

      {rooms.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No rooms yet. Create one to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rooms.map((room) => (
            <li key={room.id}>
              <Link
                href={`/room/${room.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 transition hover:border-violet-300 hover:bg-violet-50 dark:border-zinc-800 dark:hover:border-violet-700 dark:hover:bg-violet-950/40"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {room.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Code: {room.id}
                  </p>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {room.listenerCount} listening
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
