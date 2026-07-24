# How to run Talk Radio Live (one path)

## Always true

- **Share must be `https://….trycloudflare.com`** for remote people.
- `localhost` only works on this Mac.
- The Mac must stay **awake** while the tunnel is up.

## Start (when app + tunnel are already running)

**Everyone (you on phone, remote guest, or Mac in Safari):**

Open the green **public link** on the home page, or:

https://sheep-talented-lands-intermediate.trycloudflare.com  
*(URL changes each time the tunnel restarts — check the green banner on the home page)*

1. Create a room (or join).
2. Tap **Share link** — it copies the **public** room URL.
3. Send that to anyone.

## If nothing loads

App + tunnel must both be running on the Mac. In two terminals:

```bash
# Terminal A — app
export PATH="$HOME/GrokBox/.tools/node/bin:$PATH"
cd ~/GrokBox/projects/live-talk-radio
PORT=3001 node server.mjs
```

```bash
# Terminal B — public HTTPS tunnel
cd ~/GrokBox/projects/live-talk-radio
./scripts/phone-tunnel.sh 3001
```

Copy the new `https://….trycloudflare.com` line.  
Then open that on Mac or phone — **same link**.
