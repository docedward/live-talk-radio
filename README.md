# Live Talk Radio

Live Q&A rooms with **moderated questions** and **2-person live voice** (host + one On Air guest). Others listen. Chat stays open.

## What this is

- **Host** creates a room → shareable link → mic live when voice is configured → moderates questions and On Air requests
- **Listener** joins → chats, submits questions, can **Request On Air**
- **Host** puts them On Air → guest mic publishes; **Clear On Air** ends guest mic
- **Voice** via [LiveKit Cloud](https://livekit.com) (token-gated). Text still works if keys are missing.

## Stack

- Next.js + custom Node server (`server.mjs`)
- REST API + ~2s client polling (Socket.io unused for room fan-out)
- LiveKit Cloud for WebRTC audio
- In-memory rooms (reset on server restart)

## Voice setup (local)

1. LiveKit Cloud project + CLI:
   ```bash
   brew install livekit-cli
   lk cloud auth
   cd projects/live-talk-radio
   lk app env -w
   ```
2. Confirm `.env.local` has `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (never commit).
3. See `.env.example` for the shape.

Without keys, the app runs; voice UI shows “Voice is off.”

## Run locally

From this folder (Node on PATH):

```bash
npm run dev
```

Then open **http://localhost:3000**

Use two browser windows (or one normal + one private window) for host and listener. For the full voice test, use a third window as a spectator.

### Voice acceptance script

1. Host creates room, allows mic → listener hears host.
2. Listener requests On Air → host Put them On Air → guest allows mic → host + spectator hear guest.
3. Host Clear On Air → guest mic stops; host still heard.

## Project map (plain language)

| Path | What it is |
|------|------------|
| `server.mjs` | The “live switchboard” — website + real-time connections |
| `src/app/page.tsx` | Home: create a room or pick an open one |
| `src/app/room/[id]/page.tsx` | A single room’s page |
| `src/components/` | UI pieces (forms, chat, queue) |
| `src/lib/types.ts` | Shared data shapes |
| `src/lib/rooms-store.ts` | Room logic (TypeScript reference copy) |
| `src/lib/socket-client.ts` | Browser connection helper (unused path) |
| `src/components/VoiceStage.tsx` | LiveKit connect + mute + listen |
| `POST /api/rooms/:id/voice-token` | LiveKit JWT (server-minted) |

## Deploy note

Socket.io needs a long-lived Node server. Local testing works out of the box.

**Why not pure Vercel for this MVP?** Vercel’s free serverless model does not keep classic Socket.io connections the way a normal Node process does. This app uses a custom server (`server.mjs`).

**Recommended free path:** [Render](https://render.com) Web Service (see `render.yaml`):
- Build: `npm install && npm run build`
- Start: `npm start`
- Env: `NODE_ENV=production`, `HOSTNAME=0.0.0.0` (Render also sets `PORT`)
