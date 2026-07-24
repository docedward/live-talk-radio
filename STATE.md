# Project state

_Last updated: 2026-07-24_

## Goal
Live Talk Radio: one host per talk-show room, many rooms live at once; moderated Q&A, LiveKit panel (host + up to 5 guests), soundboard, public Share for friends.

## Done
- Text + voice MVP, multi-guest panel, one-way host mute, stay-alive voice
- Public HTTPS share (Render / tunnel), sticky room link + Share/Copy
- Host soundboard (12 short real WAVs): host-only pads, whole room hears
- Auto room sound on join + single speaker Mute (no Enable live sound taps)
- One-tap Request On Air; leave panel / Exit room
- Product model confirmed: room = talk show; many concurrent shows; guest Share ≠ host setup

## Next
- Push local commits (`1d92ec9`, `4be46ae`) + Manual Deploy if auto-deploy lags
- Friend smoke test on public URL with hard refresh (`?v=15`+)
- Optional: rename UI copy to fixed terms (“Start show” / “Guest link”)

## Blockers
- Local branch is **2 commits ahead of origin** — push needs Dr. Ed credentials (agent push failed)
- Free Render can sleep; first open may be slow
