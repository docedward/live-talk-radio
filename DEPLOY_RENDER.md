# Deploy Live Talk Radio on Render (free)

**Money:** Use the **Free** plan only → **$0/month**.  
App may sleep after ~15 min idle (first open can take ~1 minute).

## One-click (easiest)

1. Open:  
   **https://render.com/deploy?repo=https://github.com/docedward/live-talk-radio**
2. Sign up / log in (GitHub is fine).
3. Confirm the service name **live-talk-radio** and plan **Free**.
4. If asked for optional env vars (`LIVEKIT_*`, `PUBLIC_APP_URL`), leave them **blank** for now (text app still works).
5. Click **Apply** / **Create**.
6. Wait for the first deploy (build can take a few minutes).
7. Open the URL Render shows: `https://live-talk-radio-….onrender.com`

## After it is live

1. Create a room on that URL (host).
2. Copy the share link and open on a phone.
3. Optional voice later: add LiveKit keys in Render → Environment, then redeploy.
4. Optional: set `PUBLIC_APP_URL` to your full `https://….onrender.com` URL.

## Manual path (Blueprint)

1. https://dashboard.render.com → **New** → **Blueprint**
2. Connect repo **docedward/live-talk-radio**
3. Render reads `render.yaml` (plan: free)

## Do not

- Switch to Starter ($7/mo) unless you choose to pay for less sleep.
- Commit LiveKit secrets into git.
