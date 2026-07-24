# Phone access (HTTPS)

Phones need **HTTPS** for microphone and reliable live audio.  
`http://192.168…` or `http://localhost` on the phone will **not** work for voice.

## What you need running

**Two Terminal windows** on the Mac. Leave both open.

### Terminal A — the app

```bash
export PATH="$HOME/GrokBox/.tools/node/bin:$PATH"
cd ~/GrokBox/projects/live-talk-radio
PORT=3001 node server.mjs
```

Wait until you see:

```text
Voice: LiveKit enabled
```

### Terminal B — the phone tunnel

```bash
cd ~/GrokBox/projects/live-talk-radio
./scripts/phone-tunnel.sh 3001
```

Wait until you see:

```text
PHONE LINK (copy this):
https://….trycloudflare.com
```

## On the phone

1. Open that **https://…trycloudflare.com** link (Safari or Chrome).  
   Or on the Mac open `~/GrokBox/outputs/open-live-talk-radio.html` and use the purple button / AirDrop.
2. Create or join a room.
3. Tap **Enable live sound** / **Start live voice (mic)**.
4. Allow microphone if you are host or On Air guest.
5. If silent: tap **Tap if you hear nothing**.

## On the Mac (host)

You can keep using **http://localhost:3001** as host while phones use the HTTPS link.  
Same rooms — share the **HTTPS** link with listeners (Copy share link **on the phone host**, or replace the host in the URL with the tunnel host).

**Tip:** Create the room on the phone via the tunnel, or create on Mac then change the link:

- Mac: `http://localhost:3001/room/abc123`
- Phone: `https://YOUR-TUNNEL.trycloudflare.com/room/abc123`

## Stop

- Tunnel: Ctrl+C in Terminal B  
- App: Ctrl+C in Terminal A  

## Permanent later

Render (or similar) with LiveKit env secrets = always-on HTTPS without a tunnel.
