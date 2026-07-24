import { CreateRoomForm } from "@/components/CreateRoomForm";
import { RoomList } from "@/components/RoomList";

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wider text-violet-600 dark:text-violet-400">
          Live voice + text
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          Live Talk Radio
        </h1>
        <p className="max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
          Create a room, share the link, moderate questions, and put one
          listener On Air with live voice (host + one guest). Everyone else
          listens. Chat stays open.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <CreateRoomForm />
        <RoomList />
      </div>
    </div>
  );
}
