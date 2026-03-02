#!/usr/bin/env bash
set -euo pipefail

url="${1:-http://localhost:3000}"
session="${PLAYWRIGHT_CLI_SESSION:-uiexplore-$(date +%s)}"

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"

if [[ ! -x "$PWCLI" ]]; then
  echo "Playwright wrapper not found at $PWCLI" >&2
  exit 1
fi

export PLAYWRIGHT_CLI_SESSION="$session"
export PLAYWRIGHT_CLI_AUTO_RESIZE=0

"$PWCLI" open --headed "$url"
"$PWCLI" run-code "(async (page) => { const cdp = await page.context().newCDPSession(page); const win = await cdp.send('Browser.getWindowForTarget'); await cdp.send('Browser.setWindowBounds', { windowId: win.windowId, bounds: { windowState: 'maximized' } }); })"
