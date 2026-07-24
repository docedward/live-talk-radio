# Live Talk Radio (text-only MVP)

Simple live Q&A rooms: hosts moderate a question queue; listeners chat and submit questions. Real-time via Socket.io.

## What this is

- **Host** creates a room → gets a shareable link → approves / rejects / puts questions “on air”
- **Listener** opens the link → joins with a name → chats + submits questions
- **No voice / recording / transcripts** in this version

## Stack

- Next.js (website pages)
- Socket.io (live updates for everyone in a room)
- In-memory rooms (reset when the server restarts — fine for MVP)

## Run locally

From this folder:

```bash
npm run dev
```

Then open **http://localhost:3000**

Use two browser windows (or one normal + one private window) to act as host and listener.

## Project map (plain language)

| Path | What it is |
|------|------------|
| `server.mjs` | The “live switchboard” — website + real-time connections |
| `src/app/page.tsx` | Home: create a room or pick an open one |
| `src/app/room/[id]/page.tsx` | A single room’s page |
| `src/components/` | UI pieces (forms, chat, queue) |
| `src/lib/types.ts` | Shared data shapes |
| `src/lib/rooms-store.ts` | Room logic (TypeScript reference copy) |
| `src/lib/socket-client.ts` | Browser connection helper |

## Deploy note

Socket.io needs a long-lived Node server. Local testing works out of the box.

**Why not pure Vercel for this MVP?** Vercel’s free serverless model does not keep classic Socket.io connections the way a normal Node process does. This app uses a custom server (`server.mjs`).

**Recommended free path:** [Render](https://render.com) Web Service (see `render.yaml`):
- Build: `npm install && npm run build`
- Start: `npm start`
- Env: `NODE_ENV=production`, `HOSTNAME=0.0.0.0` (Render also sets `PORT`)
