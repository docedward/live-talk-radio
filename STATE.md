# Project state

_Last updated: 2026-07-23_

## Goal
Live Talk Radio: text rooms with moderated questions **and** live 2-person voice (host always; one listener only when host puts them On Air; others hear).

## Done
- Scaffolded Next.js (TypeScript + Tailwind) under `projects/live-talk-radio/`
- Installed Socket.io (server + client) — currently unused for room fan-out; REST polling is primary
- Custom server (`server.mjs`): rooms, chat, question queue, **On Air request state machine** (text/status only)
- Core pages: home (create/list rooms), room lobby (chat + queue + presence)
- Host vs listener roles; approve/reject questions; listener request On Air → host live/clear
- Local multi-browser test (Safari + Chrome) — text path passed
- GitHub public repo: https://github.com/docedward/live-talk-radio
- Temporary public tunnel (Cloudflare) for phone tests while Mac is on
- Council of 5 review → voice path (LiveKit Cloud + VoiceStage); verdict in GrokBox outputs

## Next
- **Voice MVP (Council verdict):** LiveKit Cloud tokens from `server.mjs` + `VoiceStage` driven by On Air
  - Phase 0: LiveKit env + graceful disable
  - Phase 1: `POST .../voice-token` + snapshot `voice.canPublish`
  - Phase 2: host publish, all subscribe
  - Phase 3: guest publish only while On Air live; clear revokes
  - Phase 4: phone listen + permission UX honesty
  - Phase 5: Render secrets when ready for stable HTTPS
- Permanent free host on Render (Blueprint from `render.yaml` + GitHub) — needs Dr. Ed account click + LiveKit secrets

## Blockers
- LiveKit Cloud project + API keys (Dr. Ed signup) before Phase 1 can run against real media
- Pure Vercel serverless is a poor fit for classic Socket.io / long-lived Node — prefer Render free Node web service
