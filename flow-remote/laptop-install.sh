#!/usr/bin/env bash
# =============================================================================
#  Google Flow MCP — one-shot laptop install
#  Installs google-flow-mcp and wires it into Claude Desktop automatically.
#  Run: bash <(curl -fsSL https://raw.githubusercontent.com/GunninPandranki/jarvis-hud/claude/viral-content-pipeline-3q91uh/flow-remote/laptop-install.sh)
# =============================================================================
set -euo pipefail

log()  { echo -e "\n\033[1;36m▶ $*\033[0m"; }
ok()   { echo -e "\033[1;32m✅ $*\033[0m"; }
die()  { echo -e "\033[1;31m✖ $*\033[0m" >&2; exit 1; }

INSTALL_DIR="$HOME/.google-flow-mcp"

# ── 1. Node check ─────────────────────────────────────────────────
log "Checking Node.js..."
if ! command -v node &>/dev/null; then
  die "Node.js not found. Install it from https://nodejs.org (LTS) then re-run this script."
fi
NODE_VER=$(node -e 'console.log(process.versions.node.split(".")[0])')
[[ $NODE_VER -lt 18 ]] && die "Node $NODE_VER found — need 18+. Update at https://nodejs.org"
ok "Node $(node -v)"

# ── 2. Clone / update google-flow-mcp ─────────────────────────────
log "Installing google-flow-mcp → $INSTALL_DIR"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone https://github.com/hitjcl/google-flow-mcp "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
npm install --prefer-offline
npm run build
ok "google-flow-mcp built"

# ── 3. Detect Claude Desktop config path ──────────────────────────
log "Locating Claude Desktop config..."
case "$(uname -s)" in
  Darwin) CFG_DIR="$HOME/Library/Application Support/Claude" ;;
  Linux)  CFG_DIR="$HOME/.config/Claude" ;;
  MINGW*|MSYS*|CYGWIN*) CFG_DIR="$APPDATA/Claude" ;;
  *) die "Unknown OS — manually add the MCP config (see output below)." ;;
esac
mkdir -p "$CFG_DIR"
CFG="$CFG_DIR/claude_desktop_config.json"

# ── 4. Merge MCP entry into config ────────────────────────────────
log "Writing MCP config → $CFG"
ENTRY_KEY="google-flow"
ENTRY_VAL="{\"command\":\"node\",\"args\":[\"$INSTALL_DIR/build/index.js\"]}"

if [[ -f "$CFG" ]]; then
  # use node to merge safely (no jq dependency needed)
  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$CFG','utf8'));
    cfg.mcpServers = cfg.mcpServers || {};
    cfg.mcpServers['$ENTRY_KEY'] = $ENTRY_VAL;
    fs.writeFileSync('$CFG', JSON.stringify(cfg, null, 2));
    console.log('Merged into existing config.');
  "
else
  # create fresh
  cat > "$CFG" <<JSON
{
  "mcpServers": {
    "$ENTRY_KEY": $ENTRY_VAL
  }
}
JSON
fi
ok "Config written"

# ── 5. Done ───────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
ok "All done!"
echo ""
echo "  NEXT: Fully quit and reopen Claude Desktop."
echo "  (File → Quit / Cmd+Q — not just close the window)"
echo ""
echo "  Then open a new chat and ask:"
echo "    'Call flow_auth_status to check my Google Flow login.'"
echo ""
echo "  Config written to:"
echo "    $CFG"
echo "════════════════════════════════════════════════════════════"
