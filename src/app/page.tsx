import { CreateRoomForm } from "@/components/CreateRoomForm";
import { PublicStartBanner } from "@/components/PublicStartBanner";
import { RoomList } from "@/components/RoomList";

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-8">
      <header className="flex flex-col gap-2 border-b border-[#d4c4a8] pb-4">
        <p className="radio-lcd text-xs font-medium uppercase tracking-[0.2em] text-[#8b3a1a]">
          Live voice + text · studio open
        </p>
        <h1 className="text-3xl tracking-wide text-[#1c1410] sm:text-4xl">
          Start a show
        </h1>
        <p className="max-w-2xl text-base text-[#6b5a48]">
          One public link for Mac, phone, and remote guests. Create a room,
          tap <strong className="text-[#1c1410]">Share link</strong> — it
          always sends the public HTTPS address (not localhost).
        </p>
      </header>

      <PublicStartBanner />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <CreateRoomForm />
        <RoomList />
      </div>
    </div>
  );
}
