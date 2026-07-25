"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Highlight the section that matches this session’s role */
  role?: "host" | "listener" | "panel";
};

/**
 * In-app FAQ: simple how-to for listener, panel member, and host.
 */
export function RoomFaq({ open, onClose, role = "listener" }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trl-faq-title"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#d4c4a8] bg-[#fffdf8] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#d4c4a8] bg-[#faf6ee] px-4 py-3">
          <h2
            id="trl-faq-title"
            className="text-lg font-semibold tracking-wide text-[#1c1410]"
          >
            How this show works
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-xl border border-[#d4c4a8] bg-white px-3 text-sm font-semibold text-[#5c2814]"
          >
            Close
          </button>
        </header>

        <div className="space-y-4 p-4 text-sm text-[#2a1c12]">
          <p className="radio-helper text-xs">
            One host runs the show. Listeners hear and chat. Panel members can
            talk on mic when the host lets them on air.
          </p>

          <Section
            title="Listener"
            emoji="👂"
            highlight={role === "listener"}
            bullets={[
              "Open the host’s Share link (https://).",
              "Pick a name and card, then enter the room.",
              "Unmute under Live sound to hear the show.",
              "Just listen = simple view. Full tools = chat and questions.",
              "Ask sends a question to the host. Chat is casual.",
              "Request On Air if you want to speak. Wait for host approval.",
              "Applause emoji float for everyone. They are not chat messages.",
            ]}
          />

          <Section
            title="Panel member"
            emoji="🎙️"
            highlight={role === "panel"}
            bullets={[
              "Join as a listener, then Request On Air.",
              "When approved, allow the mic if the browser asks.",
              "Unmute mic to talk. Mute mic when you are done.",
              "Mic color is optional (Clean / Radio / Phone).",
              "Host can mute or remove you. You still hear the room.",
              "Only the host runs the soundboard and approvals.",
            ]}
          />

          <Section
            title="Host"
            emoji="📻"
            highlight={role === "host"}
            bullets={[
              "Create a room. Share or Copy the guest link from the top bar.",
              "Unmute mic under Live sound. Optional Mic color.",
              "Soundboard pads play short effects for the room.",
              "Clip board: hold a pad to upload an ad or clip. Click to play. You can talk over it.",
              "Approve questions. Add On Air guests to the panel (up to the cap).",
              "Tap a green name to mute or unmute that guest. Remove drops them.",
              "Exit room when the show ends.",
            ]}
          />

          <p className="border-t border-[#d4c4a8] pt-3 text-xs text-[#4a3728]">
            FAQ is always next to Share.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  emoji,
  bullets,
  highlight,
}: {
  title: string;
  emoji: string;
  bullets: string[];
  highlight?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border px-3 py-3 ${
        highlight
          ? "border-[#9a3f1c] bg-[#f3e0c8]/80 ring-2 ring-[#c47a10]/40"
          : "border-[#d4c4a8] bg-white"
      }`}
    >
      <h3 className="text-base font-semibold text-[#1c1410]">
        <span className="mr-1.5" aria-hidden>
          {emoji}
        </span>
        {title}
        {highlight && (
          <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-[#8b3a1a]">
            You
          </span>
        )}
      </h3>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-snug text-[#3d2a1a]">
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ol>
    </section>
  );
}
