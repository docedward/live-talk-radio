# Project state

_Last updated: 2026-07-24_

## Goal
Live Talk Radio: moderated text rooms + LiveKit voice panel (host + up to 5 guests), host tools (mute, soundboard), speaking feedback, public share.

## Done
- Text + voice MVP, multi-guest panel, one-way host mute
- Phone HTTPS tunnel path, public share rewrite, stay-alive voice hardening
- Host soundboard (12 IDs) via REST + LiveKit data; WAV assets in `public/sfx/`
- Speaking strip (LiveKit active speakers + levels) + host panel pulse
- Listener “You are live” / pending states
- Auto room sound on join + single speaker Mute (no Enable live sound / unlock taps)
- Council enhance verdict implemented (P1–P3; P0 Render still needs Dr. Ed account)

## Next
- Push `1d92ec9` + Manual Deploy on Render if auto-deploy lags
- Optional: replace WAV with higher-end licensed samples (same filenames)
- Optional: host-only memberId on panel rows if name collisions

## Blockers
- Permanent public URL needs Dr. Ed to click Render (or similar) once
