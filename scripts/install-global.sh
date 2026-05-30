#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="${HOME}/.config/opencode"
OPENCODE_PKG="${CONFIG_DIR}/package.json"
OPENCODE_PLUGINS="${CONFIG_DIR}/plugins"
PLUGIN_NAME="opencode-velociraptor"
PLUGIN_FILE="${OPENCODE_PLUGINS}/velociraptor.ts"

if [ ! -d "$CONFIG_DIR" ]; then
  echo "Error: OpenCode config directory not found at $CONFIG_DIR"
  echo "Is OpenCode installed?"
  exit 1
fi

mkdir -p "$OPENCODE_PLUGINS"

# --- Step 1: Add/update the file: dependency in package.json ---
if [ ! -f "$OPENCODE_PKG" ]; then
  echo '{}' > "$OPENCODE_PKG"
fi

node -e "
const pkg = JSON.parse(require('fs').readFileSync('${OPENCODE_PKG}', 'utf-8'));
pkg.dependencies = pkg.dependencies || {};
pkg.dependencies['${PLUGIN_NAME}'] = 'file:${PROJECT_DIR}';
require('fs').writeFileSync('${OPENCODE_PKG}', JSON.stringify(pkg, null, 2) + '\n');
"

echo "Added '${PLUGIN_NAME}': 'file:${PROJECT_DIR}' to ${OPENCODE_PKG}"

# --- Step 2: Create the plugin wrapper ---
cat > "$PLUGIN_FILE" << EOF
export { velociraptorPlugin } from "${PLUGIN_NAME}/dist/plugin.js";
EOF

echo "Created ${PLUGIN_FILE}"

# --- Step 3: Install dependencies ---
echo "Installing dependencies..."
bun install --cwd "$CONFIG_DIR" --frozen=false

echo ""
echo "Velociraptor plugin installed globally!"
echo "Restart OpenCode (or reload config) to pick it up."
