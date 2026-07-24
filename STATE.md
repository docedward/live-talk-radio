# Project state

_Last updated: 2026-07-23_

## Goal
Text-only Live Talk Radio MVP: hosts create rooms, listeners join via link, chat + questions + listener-requested On Air, with clear presence.

## Done
- Next.js + custom `server.mjs` under `projects/live-talk-radio/`
- Phone-safe REST API + short polling (Socket.io optional; tunnel-friendly)
- Features: create/list rooms, share link, live chat, question approve/reject, On Air *requests* (listener-initiated), presence (“Who’s here”)
- Fixed React hydration join-gate + run production build for demos (no Next dev error overlay on phones)
- Tested: multi-browser local; phone via Cloudflare tunnel; daughter as real listener
- GitHub: https://github.com/docedward/live-talk-radio (push remaining commits as needed)

## Next
- Permanent free Node host (Render Blueprint / `render.yaml`) for a stable public URL
- Polish from further feedback (UI copy, mobile layout, On Air clarity)
- Keep production mode for any public demo

## Blockers
- None for local/tunnel demo
- Pure Vercel serverless still a poor fit for long-lived custom server — use Render (or similar) for always-on
