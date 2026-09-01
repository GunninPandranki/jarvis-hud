#!/usr/bin/env bash
# =============================================================================
#  Google Flow MCP — start all services inside a GitHub Codespace
#  Run this every time you open the Codespace:
#    bash flow-remote/codespace-start.sh
# =============================================================================
set -euo pipefail

MCP_PORT=3100
NOVNC_PORT=6080
DISPLAY_NUM=99
INSTALL_DIR=/opt/google-flow-mcp

log() { echo -e "\033[1;36m▶ $*\033[0m"; }
ok()  { echo -e "\033[1;32m✅ $*\033[0m"; }

# ── Kill any leftover processes ───────────────────────────────────
pkill -f "Xvfb :${DISPLAY_NUM}"   2>/dev/null || true
pkill -f x11vnc                    2>/dev/null || true
pkill -f websockify                2>/dev/null || true
pkill -f supergateway              2>/dev/null || true
sleep 1

# ── Xvfb ─────────────────────────────────────────────────────────
log "Starting Xvfb virtual display :${DISPLAY_NUM}..."
Xvfb :${DISPLAY_NUM} -screen 0 1280x900x24 &>/tmp/xvfb.log &
sleep 1

# ── x11vnc ───────────────────────────────────────────────────────
log "Starting x11vnc..."
x11vnc -display :${DISPLAY_NUM} -nopw -listen 127.0.0.1 -forever -shared &>/tmp/x11vnc.log &
sleep 1

# ── noVNC ────────────────────────────────────────────────────────
log "Starting noVNC on port ${NOVNC_PORT}..."
NOVNC_WEB=$(find /usr/share/novnc /usr/local/share/novnc -maxdepth 1 -name 'vnc.html' 2>/dev/null | head -1 | xargs dirname || echo /usr/share/novnc)
websockify --web="${NOVNC_WEB}" ${NOVNC_PORT} 127.0.0.1:5900 &>/tmp/novnc.log &
sleep 1

# ── google-flow-mcp via supergateway ─────────────────────────────
log "Starting google-flow-mcp bridge on port ${MCP_PORT}..."
DISPLAY=:${DISPLAY_NUM} \
  npx supergateway \
    --stdio "node ${INSTALL_DIR}/build/index.js" \
    --port ${MCP_PORT} \
    --cors \
  &>/tmp/flow-mcp.log &
sleep 2

# ── Print URLs ────────────────────────────────────────────────────
# In Codespaces, forwarded ports get a public URL like:
#   https://CODESPACE_NAME-PORT.preview.app.github.dev
CODESPACE_NAME="${CODESPACE_NAME:-}"
if [[ -n "$CODESPACE_NAME" ]]; then
  NOVNC_URL="https://${CODESPACE_NAME}-${NOVNC_PORT}.preview.app.github.dev/vnc.html"
  MCP_URL="https://${CODESPACE_NAME}-${MCP_PORT}.preview.app.github.dev/sse"
else
  NOVNC_URL="http://localhost:${NOVNC_PORT}/vnc.html"
  MCP_URL="http://localhost:${MCP_PORT}/sse"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
ok "All services started!"
echo ""
echo "  1. Open this URL on your phone to see the cloud browser:"
echo "     ${NOVNC_URL}"
echo ""
echo "  2. Inside that browser window, go to:"
echo "     https://labs.google/fx/tools/flow"
echo "     and sign in to Google manually."
echo ""
echo "  3. Add this to Claude Mobile → Settings → MCP Servers:"
echo "     ${MCP_URL}"
echo ""
echo "  NOTE: Make sure ports ${MCP_PORT} and ${NOVNC_PORT} are set to"
echo "  'Public' in the Codespace Ports tab (bottom panel)."
echo "════════════════════════════════════════════════════════════"
