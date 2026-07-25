"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Highlight the section that matches this session’s role */
  role?: "host" | "listener" | "panel";
};

/**
 * In-app FAQ — plain language for listener, panel, and host.
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
          <p className="text-xs leading-relaxed text-[#3d2a1a]">
            One host runs the show. Listeners hear and chat. If the host puts
            you on the panel, you can talk on the mic.
          </p>

          <Section
            title="Listener"
            emoji="👂"
            highlight={role === "listener"}
            bullets={[
              "Open the share link the host sent (it should start with https://).",
              "Choose a name and a card, then enter the room.",
              "Under Live sound, unmute so you can hear the show.",
              "Just listen keeps the screen simple. Full tools opens chat and questions.",
              "Use Ask for a question to the host. Chat is for casual talk.",
              "Tap Request on air if you want to speak. The host has to approve you.",
              "Applause emojis float for everyone. They are not chat messages.",
            ]}
          />

          <Section
            title="Panel member"
            emoji="🎙️"
            highlight={role === "panel"}
            bullets={[
              "Join as a listener first, then tap Request on air.",
              "When the host adds you, allow the microphone if the browser asks.",
              "Unmute mic to talk. Mute mic when you are done.",
              "Mic color is optional (Clean, Radio, or Phone).",
              "The host can mute or remove you. You can still hear the room.",
              "Only the host uses the soundboard and approvals.",
            ]}
          />

          <Section
            title="Host"
            emoji="📻"
            highlight={role === "host"}
            bullets={[
              "Create a room. Use Share or Copy at the top for the guest link.",
              "Unmute your mic under Live sound. Mic color is optional.",
              "Soundboard pads play short effects. Wait five seconds between hits so they do not stack.",
              "Effects play all the way through. The five-second wait only blocks a new press.",
              "Clip board: hold a pad to upload an ad or clip, then click to play. You can talk over it.",
              "Approve questions. Add people to the panel from On air requests.",
              "Tap a green name to mute or unmute that guest. Remove drops them from the panel.",
              "Exit room when the show is over.",
            ]}
          />

          <p className="border-t border-[#d4c4a8] pt-3 text-xs text-[#4a3728]">
            You can open FAQ anytime next to Share.
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
