# Project state

_Last updated: 2026-07-24_

## Goal
Live Talk Radio: moderated text rooms + LiveKit voice panel (host + up to 5 guests), host tools (mute, soundboard), speaking feedback, public share.

## Done
- Text + voice MVP, multi-guest panel, one-way host mute
- Phone HTTPS tunnel path, public share rewrite, stay-alive voice hardening
- Host soundboard (6 IDs) via REST + LiveKit data; WAV assets in `public/sfx/`
- Speaking strip (LiveKit active speakers + levels) + host panel pulse
- Listener “You are live” / pending states
- Council enhance verdict implemented (P1–P3; P0 Render still needs Dr. Ed account)

## Next
- **P0 ops:** Deploy Render free web service, set LiveKit + `PUBLIC_APP_URL` secrets
- Optional: replace WAV with higher-end licensed samples (same filenames)
- Optional: host-only memberId on panel rows if name collisions

## Blockers
- Permanent public URL needs Dr. Ed to click Render (or similar) once
