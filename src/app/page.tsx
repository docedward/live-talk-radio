import { CreateRoomForm } from "@/components/CreateRoomForm";
import { RoomList } from "@/components/RoomList";

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-8">
      <header className="flex flex-col gap-2 border-b border-[#d4c4a8] pb-4">
        <p className="radio-lcd text-xs font-medium uppercase tracking-[0.2em] text-[#8b3a1a]">
          Live only · panel first · no recording
        </p>
        <h1 className="text-3xl tracking-wide text-[#1c1410] sm:text-4xl">
          Start a show
        </h1>
        <p className="max-w-2xl text-base text-[#4a3728]">
          Live talk radio — not a podcast, not a VOD stream. Host a show,
          invite people in, and put listeners on the panel to talk with you.
          Nothing is recorded. Take your own notes if you want a memory.
        </p>
        <p className="max-w-2xl text-sm text-[#6b5a48]">
          Built for live shows and friend panels — not always-on hangouts.
          Empty shows close after a few minutes idle.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <CreateRoomForm />
        <RoomList />
      </div>
    </div>
  );
}
