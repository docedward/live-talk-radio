# Project state

_Last updated: 2026-07-24_

## Goal
Live Talk Radio: moderated text rooms **plus** live 2-person voice (host always; one listener only when host puts them On Air; others hear via LiveKit).

## Done
- Text MVP: rooms, join, chat, question queue, On Air request state machine
- REST polling primary; Socket.io present but unused for fan-out
- GitHub: https://github.com/docedward/live-talk-radio
- Council of 5 verdict → LiveKit Cloud path
- **Voice MVP (Phases 0–3):**
  - Env load from `.env.local`; graceful voice-off if keys missing
  - `POST /api/rooms/:id/voice-token` (LiveKit JWT; publish only for host or live guest)
  - Snapshot `voice: { enabled, canPublish, url }` + `liveOnAir.isMe`
  - `VoiceStage` (LiveKit): host mic, all subscribe, guest publish on On Air, clear revokes via re-token
  - Homepage copy updated for live voice
  - Phone path: tap-to-start voice, secure-context warning, `scripts/phone-tunnel.sh`, PHONE.md

## Next
- Phone test with `scripts/phone-tunnel.sh` (HTTPS)
- Phase 5: Render secrets + permanent URL
- Optional: LiveKit RoomService `updateParticipant` for faster revoke than poll+retoken
- Optional: level meter / “who you’re hearing” strip

## Blockers
- (none for local desktop if `.env.local` has LiveKit keys)
- Phones need HTTPS tunnel while Mac hosts the app (see PHONE.md)
