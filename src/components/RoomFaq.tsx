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
            Live Talk Radio is a live talk show: one host, listeners, and an
            optional speaker panel. Pick the section that matches you.
          </p>

          <Section
            title="Listener"
            emoji="👂"
            highlight={role === "listener"}
            bullets={[
              "Open the Share link the host sent (must be https://, not localhost).",
              "Enter a display name (optional) and pick a card avatar, then Enter room.",
              "Under Live sound, tap Unmute if you want to hear the show (speakers).",
              "Use Just listen for a simple radio face, or Full tools for chat and questions.",
              "Chat is casual talk. Use Ask for a question to the host queue.",
              "Request On Air if you want to join the speaker panel (host must approve).",
              "Applause row: tap emoji — they float for everyone (not chat).",
              "You do not control the soundboard or mute other people.",
            ]}
          />

          <Section
            title="Panel member"
            emoji="🎙️"
            highlight={role === "panel"}
            bullets={[
              "Start as a listener, then Request On Air (optional short topic).",
              "When the host adds you to the panel, allow the microphone if the browser asks.",
              "Under Live sound: Unmute mic to talk, Mute mic when you are done speaking.",
              "Mic color (Clean / Radio / Phone) changes how your voice sounds — optional.",
              "If the host mutes you, you stay on the panel but others cannot hear you until they unmute.",
              "You still hear the host, other panel mics, and soundboard / clips.",
              "Host can remove you from the panel anytime; you can also leave when the show ends.",
              "Do not expect host tools (soundboard, approve questions) — those are host-only.",
            ]}
          />

          <Section
            title="Host"
            emoji="📻"
            highlight={role === "host"}
            bullets={[
              "Create the room (or open your host link). Share / Copy the guest link — always the public https URL.",
              "Connect Live sound; Unmute mic to speak. Use Mic color for radio/phone character.",
              "Soundboard: short stings for the whole room. Clip board: hold / right-click a pad to upload ads or prerecords; click to play; you can talk over clips; Stop clip if needed.",
              "Approve or reject questions. On Air requests: Add to panel or Reject.",
              "Green name boxes = panel guests live. Tap a name to mute/unmute their mic (one-way). Remove drops them from the panel.",
              "Clear whole panel if you need a clean slate.",
              "You are always the show’s moderator — guests cannot press host boards.",
              "When finished, Exit room. Free hosting may sleep when idle; wake the site before a live show.",
            ]}
          />

          <p className="border-t border-[#d4c4a8] pt-3 text-xs text-[#4a3728]">
            Tip: Keep this page open during the show. Tap FAQ anytime next to
            Share.
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
