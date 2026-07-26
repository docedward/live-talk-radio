"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  role?: "host" | "listener" | "panel";
};

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
          <p className="text-xs leading-relaxed text-[#3d2a1a]">
            <strong>Live only.</strong> No recording. No replay. You are here
            now. One host runs the show. Listeners can join the{" "}
            <strong>panel</strong> to talk on air — that is the main path, not
            chat.
          </p>

          <Section
            title="Listener"
            emoji="👂"
            highlight={role === "listener"}
            bullets={[
              "Open the host’s share link (https://).",
              "Pick a name and a card avatar (including Kings, Queens, Jacks, Jokers).",
              "Unmute under Live sound to hear the show.",
              "Just listen keeps the screen simple. Full tools opens more options.",
              "Request on air if you want to speak. Wait for the host to approve.",
              "Chat is optional side talk. The panel is how you join the broadcast.",
              "Applause emojis float for everyone. They are not chat.",
              "Nothing is recorded. Take your own notes if you want a memory.",
            ]}
          />

          <Section
            title="Panel member"
            emoji="🎙️"
            highlight={role === "panel"}
            bullets={[
              "Join as a listener, then Request on air.",
              "When approved, allow the mic if the browser asks.",
              "Unmute mic to talk. Mute when you are done.",
              "Mic color is optional (Clean, Radio, Phone).",
              "The host can mute or remove you. You still hear the show.",
              "Only the host runs the soundboard and approvals.",
            ]}
          />

          <Section
            title="Host"
            emoji="📻"
            highlight={role === "host"}
            bullets={[
              "Create a show. Share or Copy the guest link at the top.",
              "Unmute your mic. Optional Mic color.",
              "Put people on the panel so the show is two-way, not just chat.",
              "Soundboard: short effects, five seconds between hits. Effects play out fully.",
              "Clip board: hold a pad to upload an ad or clip. You can talk over it.",
              "Show board: optional “this week” note and day-of cancel/late notice.",
              "Tap a green panel name to mute or unmute. Remove drops them.",
              "Exit leaves the show open (a panel member may become host). End show closes it for everyone.",
              "Optional durable host page: claim a handle at create (e.g. /h/dred). Listeners open that sticky link; Live now appears when you are on air.",
            ]}
          />

          <p className="border-t border-[#d4c4a8] pt-3 text-xs text-[#4a3728]">
            FAQ is next to Share anytime.
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
