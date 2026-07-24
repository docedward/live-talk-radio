# Project state

_Last updated: 2026-07-23_

## Goal
Text-only Live Talk Radio MVP: hosts create rooms, listeners join via link, moderated question queue + live chat in real time.

## Done
- Scaffolded Next.js (TypeScript + Tailwind) under `projects/live-talk-radio/`
- Installed Socket.io (server + client)
- Added custom server (`server.mjs`) for live multi-person updates
- Core pages: home (create/list rooms), room lobby (chat + queue)
- Host vs listener roles, approve/reject/display question flow
- Local multi-browser test (Safari + Chrome) — passed
- Server binds `0.0.0.0` for cloud / LAN access; `render.yaml` added for free Node host

## Next
- GitHub: first commit + remote push (needs `gh auth login`)
- Deploy to Render (or similar Node host) for public phone links
- Polish from real-user feedback

## Blockers
- GitHub CLI not logged in yet in this environment (user auth required)
- Pure Vercel serverless is a poor fit for classic Socket.io — using a free Node web host instead
