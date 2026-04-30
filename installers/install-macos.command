#!/usr/bin/env bash
set -euo pipefail

REPO="schylerchase/quick-reminder"
PLUGIN_ID="quick-reminder"
ASSETS=("main.js" "manifest.json" "styles.css")

echo "Quick Reminder installer"
echo

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required but was not found."
  exit 1
fi

VAULT_PATH="${1:-}"
if [[ -z "$VAULT_PATH" ]]; then
  VAULT_PATH="$(osascript -e 'POSIX path of (choose folder with prompt "Select your Obsidian vault folder")')"
fi

VAULT_PATH="${VAULT_PATH%/}"
if [[ ! -d "$VAULT_PATH/.obsidian" ]]; then
  echo "That does not look like an Obsidian vault: $VAULT_PATH"
  echo "Expected to find: $VAULT_PATH/.obsidian"
  exit 1
fi

INSTALL_DIR="$VAULT_PATH/.obsidian/plugins/$PLUGIN_ID"
mkdir -p "$INSTALL_DIR"

for asset in "${ASSETS[@]}"; do
  url="https://github.com/$REPO/releases/latest/download/$asset"
  echo "Downloading $asset"
  curl --fail --location --silent --show-error "$url" --output "$INSTALL_DIR/$asset"
done

echo
echo "Installed Quick Reminder to:"
echo "$INSTALL_DIR"
echo
echo "In Obsidian, reload or enable Quick Reminder under Settings > Community plugins."
