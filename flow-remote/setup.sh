#!/usr/bin/env bash
# =============================================================================
#  Google Flow Remote MCP – One-shot VM bootstrap
#  Run once on a fresh Ubuntu 22.04 VM (Oracle Cloud free ARM or any VPS).
#
#  Usage (as root or with sudo):
#    curl -fsSL https://raw.githubusercontent.com/gunninpandranki/jarvis-hud/main/flow-remote/setup.sh | bash
#  OR after cloning the repo:
#    bash flow-remote/setup.sh
# =============================================================================
set -euo pipefail

# ── helpers ──────────────────────────────────────────────────────────────────
log()  { echo -e "\n\033[1;36m▶ $*\033[0m"; }
die()  { echo -e "\n\033[1;31m✖ $*\033[0m" >&2; exit 1; }
need() { command -v "$1" &>/dev/null || die "$1 not found – install it first"; }

[[ $EUID -ne 0 ]] && SUDO=sudo || SUDO=""

# ── config ────────────────────────────────────────────────────────────────────
MCP_PORT=3100          # supergateway HTTP/SSE port (MCP bridge)
NOVNC_PORT=6080        # noVNC web port (browser VNC for phone)
DISPLAY_NUM=99         # Xvfb display

FLOW_USER=${FLOW_USER:-flowuser}
INSTALL_DIR=/opt/google-flow-mcp
BRIDGE_DIR=/opt/flow-bridge

# ─────────────────────────────────────────────────────────────────────────────
log "1/10  System update + base packages"
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq \
  curl git build-essential \
  xvfb x11vnc \
  novnc websockify \
  ca-certificates gnupg lsb-release \
  ufw jq unzip

# ─────────────────────────────────────────────────────────────────────────────
log "2/10  Node 22 (via NodeSource)"
if ! node -v 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO bash -
  $SUDO apt-get install -y nodejs
fi
node -v && npm -v

# ─────────────────────────────────────────────────────────────────────────────
log "3/10  Google Chrome stable"
if ! command -v google-chrome &>/dev/null; then
  curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb \
    || curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_arm64.deb -o /tmp/chrome.deb
  $SUDO apt-get install -y /tmp/chrome.deb || $SUDO dpkg -i /tmp/chrome.deb || true
  $SUDO apt-get install -f -y
fi
google-chrome --version || chromium-browser --version

# ─────────────────────────────────────────────────────────────────────────────
log "4/10  Create dedicated system user: $FLOW_USER"
if ! id "$FLOW_USER" &>/dev/null; then
  $SUDO useradd -r -m -s /bin/bash "$FLOW_USER"
fi

# ─────────────────────────────────────────────────────────────────────────────
log "5/10  Clone / update google-flow-mcp"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  $SUDO -u "$FLOW_USER" git -C "$INSTALL_DIR" pull --ff-only
else
  $SUDO rm -rf "$INSTALL_DIR"
  $SUDO git clone https://github.com/hitjcl/google-flow-mcp "$INSTALL_DIR"
  $SUDO chown -R "$FLOW_USER:$FLOW_USER" "$INSTALL_DIR"
fi
$SUDO -u "$FLOW_USER" bash -c "cd $INSTALL_DIR && npm ci --prefer-offline"

# ─────────────────────────────────────────────────────────────────────────────
log "6/10  Install supergateway (stdio→HTTP/SSE bridge)"
$SUDO npm install -g supergateway@latest

# ─────────────────────────────────────────────────────────────────────────────
log "7/10  Firewall – open only necessary ports"
$SUDO ufw --force reset
$SUDO ufw default deny incoming
$SUDO ufw default allow outgoing
$SUDO ufw allow ssh
$SUDO ufw allow "$MCP_PORT/tcp"   comment 'MCP bridge'
$SUDO ufw allow "$NOVNC_PORT/tcp" comment 'noVNC phone browser'
$SUDO ufw --force enable
$SUDO ufw status verbose

# ─────────────────────────────────────────────────────────────────────────────
log "8/10  systemd: Xvfb virtual display"
$SUDO tee /etc/systemd/system/xvfb-flow.service >/dev/null <<EOF
[Unit]
Description=Xvfb virtual display for Google Flow browser
After=network.target

[Service]
ExecStart=/usr/bin/Xvfb :${DISPLAY_NUM} -screen 0 1280x900x24
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# ─────────────────────────────────────────────────────────────────────────────
log "8b/10 systemd: x11vnc (VNC server)"
$SUDO tee /etc/systemd/system/x11vnc-flow.service >/dev/null <<EOF
[Unit]
Description=x11vnc server for Google Flow display
After=xvfb-flow.service
Requires=xvfb-flow.service

[Service]
ExecStartPre=/bin/sleep 2
ExecStart=/usr/bin/x11vnc -display :${DISPLAY_NUM} -nopw -listen 127.0.0.1 -forever -shared
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# ─────────────────────────────────────────────────────────────────────────────
log "8c/10 systemd: noVNC (browser-accessible VNC)"
NOVNC_BIN=$(find /usr/share/novnc /usr/local/share/novnc -name 'launch.sh' 2>/dev/null | head -1 || true)
if [[ -z "$NOVNC_BIN" ]]; then
  # fallback: websockify as proxy
  NOVNC_HTML=/usr/share/novnc
  $SUDO tee /etc/systemd/system/novnc-flow.service >/dev/null <<EOF
[Unit]
Description=noVNC web client for Google Flow
After=x11vnc-flow.service
Requires=x11vnc-flow.service

[Service]
ExecStart=/usr/bin/websockify --web=${NOVNC_HTML} ${NOVNC_PORT} 127.0.0.1:5900
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
else
  $SUDO tee /etc/systemd/system/novnc-flow.service >/dev/null <<EOF
[Unit]
Description=noVNC web client for Google Flow
After=x11vnc-flow.service
Requires=x11vnc-flow.service

[Service]
ExecStart=${NOVNC_BIN} --vnc localhost:5900 --listen ${NOVNC_PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
fi

# ─────────────────────────────────────────────────────────────────────────────
log "9/10  systemd: google-flow-mcp + supergateway bridge"
$SUDO tee /etc/systemd/system/flow-mcp-bridge.service >/dev/null <<EOF
[Unit]
Description=Google Flow MCP (stdio) bridged to HTTP/SSE via supergateway
After=xvfb-flow.service
Requires=xvfb-flow.service

[Service]
User=${FLOW_USER}
WorkingDirectory=${INSTALL_DIR}
Environment=DISPLAY=:${DISPLAY_NUM}
Environment=HOME=/home/${FLOW_USER}
ExecStart=/usr/bin/npx supergateway \\
  --stdio "node ${INSTALL_DIR}/build/index.js" \\
  --port ${MCP_PORT} \\
  --cors
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# ─────────────────────────────────────────────────────────────────────────────
log "10/10 Enable + start all services"
$SUDO systemctl daemon-reload
for svc in xvfb-flow x11vnc-flow novnc-flow flow-mcp-bridge; do
  $SUDO systemctl enable "$svc"
  $SUDO systemctl restart "$svc"
  sleep 1
done

$SUDO systemctl status xvfb-flow x11vnc-flow novnc-flow flow-mcp-bridge --no-pager -l || true

PUBLIC_IP=$(curl -4 -fsSL https://ifconfig.me 2>/dev/null || curl -4 -fsSL https://api.ipify.org || echo "YOUR_VM_IP")

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ✅  Setup complete!"
echo ""
echo "  noVNC  (open in phone browser to see / login Google Flow):"
echo "    http://${PUBLIC_IP}:${NOVNC_PORT}/vnc.html"
echo ""
echo "  MCP bridge SSE endpoint (add to Claude Mobile MCP config):"
echo "    http://${PUBLIC_IP}:${MCP_PORT}/sse"
echo ""
echo "  NEXT STEP: open the noVNC URL on your phone, then manually"
echo "  sign into https://labs.google/fx/tools/flow in the browser"
echo "  window you see.  Claude will NEVER see your password."
echo "════════════════════════════════════════════════════════════"
