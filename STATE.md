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
- GitHub public repo: https://github.com/docedward/live-talk-radio
- Temporary public tunnel (Cloudflare quick tunnel) for phone tests while Mac is on

## Next
- Permanent free host on Render (Blueprint from `render.yaml` + GitHub) — needs Dr. Ed account click
- Polish from real-user feedback

## Blockers
- Pure Vercel serverless is a poor fit for classic Socket.io — prefer Render free Node web service
