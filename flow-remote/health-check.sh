#!/usr/bin/env bash
# Quick health check — run any time to see if all services are up.
set -euo pipefail

MCP_PORT=${MCP_PORT:-3100}
NOVNC_PORT=${NOVNC_PORT:-6080}
PUBLIC_IP=$(curl -4 -fsSL https://ifconfig.me 2>/dev/null || echo "?")

echo "═══════════════════════════════════════════"
echo "  Google Flow Remote MCP — health check"
echo "═══════════════════════════════════════════"

check_svc() {
  local name=$1
  if systemctl is-active --quiet "$name"; then
    echo "  ✅  $name is running"
  else
    echo "  ❌  $name is NOT running"
    systemctl status "$name" --no-pager -l 2>/dev/null | tail -5
  fi
}

check_svc xvfb-flow
check_svc x11vnc-flow
check_svc novnc-flow
check_svc flow-mcp-bridge

echo ""
echo "  Checking MCP bridge HTTP response..."
if curl -fsSL "http://localhost:${MCP_PORT}/" &>/dev/null || \
   curl -o /dev/null -s -w "%{http_code}" "http://localhost:${MCP_PORT}/" | grep -qE '2|3|4'; then
  echo "  ✅  MCP bridge is responding on :${MCP_PORT}"
else
  echo "  ❌  MCP bridge not responding on :${MCP_PORT}"
fi

echo ""
echo "  Your URLs:"
echo "    noVNC:      http://${PUBLIC_IP}:${NOVNC_PORT}/vnc.html"
echo "    MCP SSE:    http://${PUBLIC_IP}:${MCP_PORT}/sse"
echo "═══════════════════════════════════════════"
