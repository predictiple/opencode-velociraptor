#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="${HOME}/.config/opencode"
OPENCODE_PKG="${CONFIG_DIR}/package.json"
OPENCODE_PLUGINS="${CONFIG_DIR}/plugins"
PLUGIN_NAME="opencode-velociraptor"
PLUGIN_FILE="${OPENCODE_PLUGINS}/velociraptor.ts"

if [ ! -f "$OPENCODE_PKG" ]; then
  echo "Nothing to uninstall — ${OPENCODE_PKG} not found."
  exit 0
fi

# --- Step 1: Remove dependency from package.json ---
node -e "
const pkg = JSON.parse(require('fs').readFileSync('${OPENCODE_PKG}', 'utf-8'));
if (pkg.dependencies && pkg.dependencies['${PLUGIN_NAME}']) {
  delete pkg.dependencies['${PLUGIN_NAME}'];
  if (Object.keys(pkg.dependencies).length === 0) {
    delete pkg.dependencies;
  }
  require('fs').writeFileSync('${OPENCODE_PKG}', JSON.stringify(pkg, null, 2) + '\n');
  console.log('Removed dependency ${PLUGIN_NAME} from ${OPENCODE_PKG}');
} else {
  console.log('Dependency ${PLUGIN_NAME} not found in ${OPENCODE_PKG}');
}
"

# --- Step 2: Remove plugin wrapper ---
if [ -f "$PLUGIN_FILE" ]; then
  rm "$PLUGIN_FILE"
  echo "Removed ${PLUGIN_FILE}"
else
  echo "Plugin file ${PLUGIN_FILE} not found"
fi

echo ""
echo "Velociraptor plugin uninstalled."
echo "Restart OpenCode to complete removal."
