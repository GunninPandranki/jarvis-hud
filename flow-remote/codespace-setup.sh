#!/usr/bin/env bash
# =============================================================================
#  Google Flow MCP — GitHub Codespace one-time setup
#  Runs automatically via postCreateCommand in devcontainer.json
#  No credit card, no VM — just your GitHub account (60 free hrs/month).
# =============================================================================
set -euo pipefail

log() { echo -e "\n\033[1;36m▶ $*\033[0m"; }

log "Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
  xvfb x11vnc novnc websockify \
  ca-certificates curl gnupg

log "Installing Google Chrome..."
curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb
sudo apt-get install -y /tmp/chrome.deb 2>/dev/null || \
  { sudo dpkg -i /tmp/chrome.deb; sudo apt-get install -f -y; }
rm /tmp/chrome.deb

log "Installing supergateway (MCP stdio→SSE bridge)..."
npm install -g supergateway@latest

log "Cloning google-flow-mcp..."
if [[ -d /opt/google-flow-mcp/.git ]]; then
  git -C /opt/google-flow-mcp pull --ff-only
else
  sudo git clone https://github.com/hitjcl/google-flow-mcp /opt/google-flow-mcp
  sudo chown -R "$(whoami)" /opt/google-flow-mcp
fi
npm ci --prefix /opt/google-flow-mcp --prefer-offline

log "Setup complete. Run 'bash flow-remote/codespace-start.sh' to launch services."
