# Project state

_Last updated: 2026-07-25_

## Goal
Live Talk Radio: one host per talk-show room, many rooms live at once; moderated Q&A, LiveKit panel (host + up to 5 guests), soundboard, public Share for friends.

## Done
- Text + voice MVP, multi-guest panel, one-way host mute, stay-alive voice
- Public HTTPS share (Render / tunnel), sticky room link + Share/Copy
- Host soundboard (12 short real WAVs): host-only pads, whole room hears
- **Build day 2026-07-25:** contrast helpers; **Clip Board** (upload ads/prerecords → LiveKit track); **Just listen** mode; **Applause emote rail** (LiveKit data, not chat)
- **Phase 2:** mic color filters (Clean/Radio/Phone); clip harden (Stop, mic duck, clearer errors, duration)
- Auto room sound on join + single speaker Mute
- One-tap Request On Air; leave panel / Exit room
- Council: foundation keep/extend; park mods/CC/record
- **Phase A:** Shows rename, richer cards/jokers, panel-first UX, show bulletin
- **Phase B:** idle GC, named emotes, on-stage panel presence
- **Phase C:** durable host skin — `/h/[slug]`, claim handle, weekly bulletin (1×/week), day-of notice, Live now when linked show is up (`.data/hosts.json`)

## Next
- Friend smoke: claim handle → open `/h/slug` → Live now when show starts; End show clears live
- Note: free Render disk may be ephemeral — host store may reset on redeploy
- Parked: moderators, live CC, show export

## Blockers
- Push needs Dr. Ed credentials if remote deploy desired
- Free Render can sleep; first open may be slow; host JSON may not survive free disk

