#!/usr/bin/env bash
# Open an HTTPS URL to this Mac's TRL server so phones can use mic + voice.
# Usage (from repo root or anywhere):
#   ./scripts/phone-tunnel.sh          # defaults to port 3001
#   ./scripts/phone-tunnel.sh 3000
#
# Keep this terminal open while testing. Stop with Ctrl+C.

set -euo pipefail

PORT="${1:-3001}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CF="${HOME}/GrokBox/.tools/cloudflared"
OUT_HTML="${HOME}/GrokBox/outputs/open-live-talk-radio.html"
OUT_URL="${HOME}/GrokBox/outputs/live-talk-radio-public-url.txt"

if [[ ! -x "$CF" ]]; then
  echo "cloudflared not found at $CF"
  echo "Install or restore GrokBox .tools/cloudflared, then retry."
  exit 1
fi

# Health check
if ! curl -sf "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
  echo "Nothing healthy on http://127.0.0.1:${PORT}/api/health"
  echo ""
  echo "Start the app first in another Terminal:"
  echo "  export PATH=\"\$HOME/GrokBox/.tools/node/bin:\$PATH\""
  echo "  cd ~/GrokBox/projects/live-talk-radio"
  echo "  PORT=${PORT} node server.mjs"
  echo ""
  echo "Wait until you see: Voice: LiveKit enabled"
  exit 1
fi

VOICE=$(curl -sf "http://127.0.0.1:${PORT}/api/health" || true)
echo "Server on port ${PORT}: ${VOICE}"
echo "Starting Cloudflare quick tunnel (HTTPS)…"
echo "When a https://….trycloudflare.com URL appears below:"
echo "  1) Open it on your phone"
echo "  2) Or open ${OUT_HTML} on this Mac and use the purple button"
echo "Leave this window open. Ctrl+C stops the tunnel."
echo ""

# cloudflared prints the URL on stderr; tee to a file and rewrite helper HTML
LOG="$(mktemp -t trl-tunnel)"
cleanup() { rm -f "$LOG"; }
trap cleanup EXIT

# Run tunnel; filter URL into helper files as it appears
"$CF" tunnel --url "http://127.0.0.1:${PORT}" 2>&1 | while IFS= read -r line; do
  echo "$line"
  if [[ "$line" =~ https://[a-zA-Z0-9.-]+\.trycloudflare\.com ]]; then
    URL="$(echo "$line" | grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' | head -1)"
    if [[ -n "$URL" ]]; then
      echo "$URL" > "$OUT_URL"
      cat > "$OUT_HTML" <<EOF
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Open Live Talk Radio</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    a.big { display: block; margin: 1rem 0; padding: 1rem 1.25rem; background: #7c3aed; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600; text-align: center; word-break: break-all; }
    code { background: #f4f4f5; padding: 0.15rem 0.4rem; border-radius: 6px; }
    .ok { color: #047857; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Live Talk Radio — phone link</h1>
  <p class="ok">HTTPS tunnel is up (mic works on phones).</p>
  <p><strong>On your phone:</strong> open the purple button, or AirDrop / text yourself this page.</p>
  <a class="big" href="${URL}">${URL}</a>
  <p>Host can stay on the Mac at <code>http://localhost:${PORT}</code>. Phones must use the HTTPS link above.</p>
  <p style="color:#71717a;font-size:0.9rem">Tunnel dies when you Ctrl+C the tunnel script or sleep the Mac. App must keep running too.</p>
</body>
</html>
EOF
      echo ""
      echo "=========================================="
      echo "PHONE LINK (copy this):"
      echo "$URL"
      echo "Also wrote: $OUT_HTML"
      echo "=========================================="
      echo ""
    fi
  fi
done
