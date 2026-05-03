#!/usr/bin/env bash
# claude-mac-mini-init.sh
# One-shot Mac mini initialization to pair with MacBook.
# Safe: backs everything up before any destructive action.
#
# Usage: bash claude-mac-mini-init.sh

set -u

# ========== CONFIG ==========
MACBOOK_DEVICE_ID="PCF23EJ-SQWYG2H-GTCEY7A-QCJ45GA-PBTA3BH-N3AMYM2-QEIB5MO-ILFGIQQ"
MACBOOK_NAME="MacBook"
GITHUB_USER="darioluanne770968-prog"
PROJECTS_DIR="$HOME/ClaudeProjects"
# The 7 repos we just pushed from MacBook. Mac mini probably has older copies locally.
NEW_REPOS=(api-mart ChristmasTree darkMode electronic-muyu jietu roi-calculator youtube-tools)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RED=$'\033[0;31m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
NC=$'\033[0m'

step() { echo ""; echo "${CYAN}${BOLD}▶ $1${NC}"; }
ok()   { echo "${GREEN}  ✓${NC} $1"; }
warn() { echo "${YELLOW}  ⚠${NC} $1"; }
err()  { echo "${RED}  ✗${NC} $1"; }

# ========== STEP 1: Prerequisites ==========
step "Step 1/7: Check prerequisites"

if ! command -v brew &>/dev/null; then
  err "Homebrew not found. Install from https://brew.sh first"
  exit 1
fi
ok "Homebrew: $(brew --version | head -1)"

if ! command -v gh &>/dev/null; then
  warn "GitHub CLI not found, installing..."
  brew install gh
fi
ok "gh: $(gh --version | head -1)"

if ! gh auth status &>/dev/null; then
  err "Not logged into GitHub. Run: gh auth login"
  exit 1
fi
CURRENT_GH=$(gh api user --jq .login 2>/dev/null || echo "unknown")
if [ "$CURRENT_GH" != "$GITHUB_USER" ]; then
  warn "Active gh account is '$CURRENT_GH', switching to '$GITHUB_USER'..."
  gh auth switch --user "$GITHUB_USER" || { err "Switch failed. Run: gh auth login --user $GITHUB_USER"; exit 1; }
fi
ok "GitHub: $GITHUB_USER"

# ========== STEP 2: Install Syncthing ==========
step "Step 2/7: Install Syncthing"

if ! command -v syncthing &>/dev/null; then
  brew install syncthing
  ok "Installed $(syncthing --version 2>&1 | head -1)"
else
  ok "Already installed: $(syncthing --version 2>&1 | head -1)"
fi

# ========== STEP 3: Back up everything ==========
step "Step 3/7: Back up existing data"

if [ -d "$HOME/.claude" ]; then
  cp -R "$HOME/.claude" "$HOME/.claude.backup-$TIMESTAMP"
  ok "Backed up ~/.claude → ~/.claude.backup-$TIMESTAMP"
else
  warn "~/.claude does not exist yet (no backup needed)"
fi

mkdir -p "$PROJECTS_DIR"
for repo in "${NEW_REPOS[@]}"; do
  if [ -d "$PROJECTS_DIR/$repo" ]; then
    mv "$PROJECTS_DIR/$repo" "$PROJECTS_DIR/$repo.backup-$TIMESTAMP"
    ok "Backed up $repo"
  fi
done

# ========== STEP 4: Install claude-sync script + .stignore ==========
step "Step 4/7: Install claude-sync helper + .stignore"

mkdir -p "$HOME/bin"
# claude-sync script (base64-encoded to avoid heredoc escaping)
CLAUDE_SYNC_B64="IyEvdXNyL2Jpbi9lbnYgYmFzaAojIGNsYXVkZS1zeW5jIOKAlCBiYXRjaCBnaXQgcHVsbC9wdXNoIGFjcm9zcyB+L0NsYXVkZVByb2plY3RzLyoKIyBVc2FnZToKIyAgIGNsYXVkZS1zeW5jIHB1c2ggICAg4oCUIHN0YWdlL2NvbW1pdC9wdXNoIGFsbCBkaXJ0eSByZXBvcwojICAgY2xhdWRlLXN5bmMgcHVsbCAgICDigJQgcHVsbCBhbGwgcmVwb3MKIyAgIGNsYXVkZS1zeW5jIHN0YXR1cyAg4oCUIHNob3cgc3RhdHVzIG9mIGVhY2ggcmVwbwojICAgY2xhdWRlLXN5bmMgICAgICAgICDigJQgc2FtZSBhcyBzdGF0dXMKCnNldCAtdQpQUk9KRUNUUz0iJHtDTEFVREVfUFJPSkVDVFNfRElSOi0kSE9NRS9DbGF1ZGVQcm9qZWN0c30iCgpHUkVFTj0kJ1wwMzNbMDszMm0nCllFTExPVz0kJ1wwMzNbMDszM20nClJFRD0kJ1wwMzNbMDszMW0nCkNZQU49JCdcMDMzWzA7MzZtJwpHUkFZPSQnXDAzM1swOzkwbScKTkM9JCdcMDMzWzBtJwoKY21kPSIkezE6LXN0YXR1c30iCmNkICIkUFJPSkVDVFMiIHx8IHsgZWNobyAiTm8gJFBST0pFQ1RTIGRpcmVjdG9yeSI7IGV4aXQgMTsgfQoKcmVwb3NfZ2l0PSgpCnJlcG9zX25vZ2l0PSgpCmZvciBkIGluICovOyBkbwogIG5hbWU9IiR7ZCUvfSIKICBbIC1kICIkZC8uZ2l0IiBdICYmIHJlcG9zX2dpdCs9KCIkbmFtZSIpIHx8IHJlcG9zX25vZ2l0Kz0oIiRuYW1lIikKZG9uZQoKZG9fc3RhdHVzKCkgewogIGxvY2FsIG5hbWU9IiQxIgogIGNkICIkUFJPSkVDVFMvJG5hbWUiIHx8IHJldHVybgogIGxvY2FsIGJyYW5jaCBkaXJ0eSBhaGVhZCBiZWhpbmQKICBicmFuY2g9JChnaXQgcmV2LXBhcnNlIC0tYWJicmV2LXJlZiBIRUFEIDI+L2Rldi9udWxsKQogIGRpcnR5PSQoZ2l0IHN0YXR1cyAtLXBvcmNlbGFpbiAyPi9kZXYvbnVsbCB8IHdjIC1sIHwgdHIgLWQgJyAnKQogIGdpdCBmZXRjaCAtLXF1aWV0IDI+L2Rldi9udWxsIHx8IHRydWUKICBhaGVhZD0kKGdpdCByZXYtbGlzdCAtLWNvdW50ICJAe3V9Li5IRUFEIiAyPi9kZXYvbnVsbCB8fCBlY2hvICIwIikKICBiZWhpbmQ9JChnaXQgcmV2LWxpc3QgLS1jb3VudCAiSEVBRC4uQHt1fSIgMj4vZGV2L251bGwgfHwgZWNobyAiMCIpCgogIGxvY2FsIHRhZz0iIgogIFsgIiRkaXJ0eSIgLWd0IDAgXSAmJiB0YWc9IiR7dGFnfSR7WUVMTE9XfeKXjyRkaXJ0eSBkaXJ0eSR7TkN9ICIKICBbICIkYWhlYWQiIC1ndCAwIF0gJiYgdGFnPSIke3RhZ30ke0NZQU594oaRJGFoZWFkJHtOQ30gIgogIFsgIiRiZWhpbmQiIC1ndCAwIF0gJiYgdGFnPSIke3RhZ30ke1JFRH3ihpMkYmVoaW5kJHtOQ30gIgogIFsgLXogIiR0YWciIF0gJiYgdGFnPSIke0dSRUVOfeKckyBjbGVhbiR7TkN9IgoKICBwcmludGYgIiAgJS0zMHMgJXMgJXNcbiIgIiRuYW1lIiAiJHtHUkFZfVskYnJhbmNoXSR7TkN9IiAiJHRhZyIKfQoKZG9fcHVzaCgpIHsKICBsb2NhbCBuYW1lPSIkMSIKICBjZCAiJFBST0pFQ1RTLyRuYW1lIiB8fCByZXR1cm4KICBsb2NhbCBicmFuY2ggZGlydHkKICBicmFuY2g9JChnaXQgcmV2LXBhcnNlIC0tYWJicmV2LXJlZiBIRUFEIDI+L2Rldi9udWxsKQogIGRpcnR5PSQoZ2l0IHN0YXR1cyAtLXBvcmNlbGFpbiAyPi9kZXYvbnVsbCB8IHdjIC1sIHwgdHIgLWQgJyAnKQoKICBpZiBbICIkZGlydHkiIC1ndCAwIF07IHRoZW4KICAgIGdpdCBhZGQgLUEKICAgIGdpdCBjb21taXQgLW0gInN5bmM6IGF1dG8tY29tbWl0IGZyb20gJChzY3V0aWwgLS1nZXQgQ29tcHV0ZXJOYW1lIDI+L2Rldi9udWxsIHx8IGhvc3RuYW1lKSBAICQoZGF0ZSArJUZcICVIOiVNKSIgLS1xdWlldAogICAgcHJpbnRmICIgICR7WUVMTE9XfeKXjyR7TkN9ICUtMjhzIGNvbW1pdHRlZCAlZCBjaGFuZ2VzXG4iICIkbmFtZSIgIiRkaXJ0eSIKICBmaQoKICBpZiBnaXQgcmVtb3RlIGdldC11cmwgb3JpZ2luICY+L2Rldi9udWxsOyB0aGVuCiAgICBsb2NhbCBhaGVhZAogICAgYWhlYWQ9JChnaXQgcmV2LWxpc3QgLS1jb3VudCAiQHt1fS4uSEVBRCIgMj4vZGV2L251bGwgfHwgZWNobyAiMCIpCiAgICBpZiBbICIkYWhlYWQiIC1ndCAwIF07IHRoZW4KICAgICAgaWYgZ2l0IHB1c2ggLS1xdWlldCAyPi9kZXYvbnVsbDsgdGhlbgogICAgICAgIHByaW50ZiAiICAke0NZQU594oaRJHtOQ30gJS0yOHMgcHVzaGVkICVzIGNvbW1pdHNcbiIgIiRuYW1lIiAiJGFoZWFkIgogICAgICBlbHNlCiAgICAgICAgcHJpbnRmICIgICR7UkVEfeKclyR7TkN9ICUtMjhzIHB1c2ggZmFpbGVkIChjaGVjayBhdXRoL2NvbmZsaWN0cylcbiIgIiRuYW1lIgogICAgICBmaQogICAgZWxzZQogICAgICBbICIkZGlydHkiIC1lcSAwIF0gJiYgcHJpbnRmICIgICR7R1JBWX3CtyR7TkN9ICUtMjhzIG5vdGhpbmcgdG8gcHVzaFxuIiAiJG5hbWUiCiAgICBmaQogIGVsc2UKICAgIHByaW50ZiAiICAke1lFTExPV33imqAke05DfSAlLTI4cyBubyByZW1vdGUgY29uZmlndXJlZFxuIiAiJG5hbWUiCiAgZmkKfQoKZG9fcHVsbCgpIHsKICBsb2NhbCBuYW1lPSIkMSIKICBjZCAiJFBST0pFQ1RTLyRuYW1lIiB8fCByZXR1cm4KICBsb2NhbCBkaXJ0eQogIGRpcnR5PSQoZ2l0IHN0YXR1cyAtLXBvcmNlbGFpbiAyPi9kZXYvbnVsbCB8IHdjIC1sIHwgdHIgLWQgJyAnKQoKICBpZiBbICIkZGlydHkiIC1ndCAwIF07IHRoZW4KICAgIHByaW50ZiAiICAke1lFTExPV33imqAke05DfSAlLTI4cyBoYXMgdW5jb21taXR0ZWQgY2hhbmdlcyDigJQgc2tpcHBpbmdcbiIgIiRuYW1lIgogICAgcmV0dXJuCiAgZmkKCiAgaWYgISBnaXQgcmVtb3RlIGdldC11cmwgb3JpZ2luICY+L2Rldi9udWxsOyB0aGVuCiAgICBwcmludGYgIiAgJHtHUkFZfcK3JHtOQ30gJS0yOHMgbm8gcmVtb3RlIOKAlCBza2lwcGluZ1xuIiAiJG5hbWUiCiAgICByZXR1cm4KICBmaQoKICBsb2NhbCBvdXQKICBpZiBvdXQ9JChnaXQgcHVsbCAtLWZmLW9ubHkgLS1xdWlldCAyPiYxKTsgdGhlbgogICAgbG9jYWwgYmVoaW5kCiAgICBiZWhpbmQ9JChnaXQgcmV2LWxpc3QgLS1jb3VudCAiSEVBREB7MX0uLkhFQUQiIDI+L2Rldi9udWxsIHx8IGVjaG8gIjAiKQogICAgaWYgWyAiJGJlaGluZCIgLWd0IDAgXTsgdGhlbgogICAgICBwcmludGYgIiAgJHtHUkVFTn3ihpMke05DfSAlLTI4cyBwdWxsZWQgJXMgY29tbWl0c1xuIiAiJG5hbWUiICIkYmVoaW5kIgogICAgZWxzZQogICAgICBwcmludGYgIiAgJHtHUkFZfcK3JHtOQ30gJS0yOHMgYWxyZWFkeSB1cCB0byBkYXRlXG4iICIkbmFtZSIKICAgIGZpCiAgZWxzZQogICAgcHJpbnRmICIgICR7UkVEfeKclyR7TkN9ICUtMjhzIHB1bGwgZmFpbGVkIChjb25mbGljdCBvciBub24tZmYpXG4iICIkbmFtZSIKICBmaQp9CgpjYXNlICIkY21kIiBpbgogIHB1c2gpCiAgICBlY2hvIC1lICIke0NZQU594oaSIFB1c2hpbmcgJHsjcmVwb3NfZ2l0W0BdfSByZXBvcy4uLiR7TkN9IgogICAgZm9yIHIgaW4gIiR7cmVwb3NfZ2l0W0BdfSI7IGRvIGRvX3B1c2ggIiRyIjsgZG9uZQogICAgOzsKICBwdWxsKQogICAgZWNobyAtZSAiJHtDWUFOfeKGkiBQdWxsaW5nICR7I3JlcG9zX2dpdFtAXX0gcmVwb3MuLi4ke05DfSIKICAgIGZvciByIGluICIke3JlcG9zX2dpdFtAXX0iOyBkbyBkb19wdWxsICIkciI7IGRvbmUKICAgIDs7CiAgc3RhdHVzfCIiKQogICAgZWNobyAtZSAiJHtDWUFOfeKGkiBTdGF0dXMgb2YgJHsjcmVwb3NfZ2l0W0BdfSByZXBvcyBpbiAkUFJPSkVDVFM6JHtOQ30iCiAgICBmb3IgciBpbiAiJHtyZXBvc19naXRbQF19IjsgZG8gZG9fc3RhdHVzICIkciI7IGRvbmUKICAgIGlmIFsgIiR7I3JlcG9zX25vZ2l0W0BdfSIgLWd0IDAgXTsgdGhlbgogICAgICBlY2hvIC1lICJcbiR7WUVMTE9XfeKaoCAkeyNyZXBvc19ub2dpdFtAXX0gZm9sZGVycyBhcmUgbm90IGdpdCByZXBvczoke05DfSIKICAgICAgZm9yIHIgaW4gIiR7cmVwb3Nfbm9naXRbQF19IjsgZG8gZWNobyAiICDCtyAkciI7IGRvbmUKICAgIGZpCiAgICA7OwogICopCiAgICBlY2hvICJVc2FnZTogY2xhdWRlLXN5bmMgW3B1c2h8cHVsbHxzdGF0dXNdIgogICAgZXhpdCAxCiAgICA7Owplc2FjCg=="
echo "$CLAUDE_SYNC_B64" | base64 -d > "$HOME/bin/claude-sync"
chmod +x "$HOME/bin/claude-sync"
ok "Wrote ~/bin/claude-sync"

if [[ ":$PATH:" != *":$HOME/bin:"* ]]; then
  warn "~/bin is NOT in your PATH. Add to ~/.zshrc: export PATH=\"\$HOME/bin:\$PATH\""
fi

mkdir -p "$HOME/.claude"
STIGNORE_B64="Ly8gU3luY3RoaW5nIGlnbm9yZSBwYXR0ZXJucyBmb3Igfi8uY2xhdWRlLwovLyBPbmx5IHN5bmMgY29udmVyc2F0aW9uIGRhdGEgJiBtZW1vcnk7IGV4Y2x1ZGUgbWFjaGluZS1zcGVjaWZpYyBzdGF0ZQoKLy8gLS0tIE1hY2hpbmUtc3BlY2lmaWMgY2FjaGVzICYgc3RhdGUgLS0tCmNhY2hlCnN0YXRzaWcKdGVsZW1ldHJ5CnNoZWxsLXNuYXBzaG90cwpzZXNzaW9uLWVudgpkZWJ1ZwpmaWxlLWhpc3RvcnkKYmFja3VwcwppZGUKcGxhbnMKdGFza3MKbWNwLW5lZWRzLWF1dGgtY2FjaGUuanNvbgpzdGF0cy1jYWNoZS5qc29uCgovLyAtLS0gUGx1Z2lucyAoY2FuIGhhdmUgbWFjaGluZS1zcGVjaWZpYyBiaW5hcmllcykgLS0tCnBsdWdpbnMKCi8vIC0tLSBMb2NhbC1vbmx5IHNldHRpbmdzIChtYWNoaW5lIGRpZmZlcnMpIC0tLQpzZXR0aW5ncy5sb2NhbC5qc29uCgovLyAtLS0gU3luY3RoaW5nIGludGVybmFsIC0tLQouc3R2ZXJzaW9ucwouc3Rmb2xkZXIKCi8vIC0tLSBPUyBub2lzZSAtLS0KLkRTX1N0b3JlCioubG9nCioudG1wCioubG9jawoKLy8gLS0tIFdoYXQgSVMgc3luY2VkIChieSBOT1QgYmVpbmcgaWdub3JlZCkgLS0tCi8vIHByb2plY3RzLyAgICAgICAgICDigJQgY29udmVyc2F0aW9uIHRyYW5zY3JpcHRzIChtYWluIGRhdGEpCi8vIHRvZG9zLyAgICAgICAgICAgICDigJQgdG9kbyBsaXN0cwovLyBtZW1vcnkvICAgICAgICAgICAg4oCUIHlvdXIgYXV0by1tZW1vcnkKLy8gc2Vzc2lvbnMvICAgICAgICAgIOKAlCBhY3RpdmUgc2Vzc2lvbiBtYXJrZXJzCi8vIGhpc3RvcnkuanNvbmwgICAgICDigJQgcHJvbXB0IGhpc3RvcnkKLy8gc2V0dGluZ3MuanNvbiAgICAgIOKAlCB1c2VyLWxldmVsIHNldHRpbmdzCi8vIHN0YXR1c2xpbmUuc2ggICAgICDigJQgY3VzdG9tIHN0YXR1c2xpbmUKLy8gQ0xBVURFLm1kICAgICAgICAgIOKAlCBnbG9iYWwgQ0xBVURFLm1kIGlmIGFueQo="
echo "$STIGNORE_B64" | base64 -d > "$HOME/.claude/.stignore"
ok "Wrote ~/.claude/.stignore"

# ========== STEP 5: Start Syncthing & configure ==========
step "Step 5/7: Start Syncthing and configure folder/device"

brew services start syncthing &>/dev/null || true
# Wait for web UI
for i in {1..30}; do
  if curl -s -o /dev/null http://localhost:8384; then break; fi
  sleep 1
done

CONFIG_XML="$HOME/Library/Application Support/Syncthing/config.xml"
if [ ! -f "$CONFIG_XML" ]; then
  err "Syncthing config not found at $CONFIG_XML — is it running?"
  exit 1
fi

API_KEY=$(grep -oE '<apikey>[^<]+' "$CONFIG_XML" | sed 's/<apikey>//')
MY_DEVICE_ID=$(curl -s -H "X-API-Key: $API_KEY" http://localhost:8384/rest/system/status | python3 -c "import json,sys; print(json.load(sys.stdin)['myID'])")
ok "Mac mini Device ID: $MY_DEVICE_ID"

# Add MacBook as remote device
curl -s -X POST -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  "http://localhost:8384/rest/config/devices" \
  -d "{\"deviceID\":\"$MACBOOK_DEVICE_ID\",\"name\":\"$MACBOOK_NAME\",\"addresses\":[\"dynamic\"]}" >/dev/null
ok "Added MacBook as remote device"

# Add shared folder
curl -s -X POST -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  "http://localhost:8384/rest/config/folders" \
  -d "{
    \"id\": \"claude-sessions\",
    \"label\": \"Claude Sessions & Memory\",
    \"path\": \"$HOME/.claude\",
    \"type\": \"sendreceive\",
    \"rescanIntervalS\": 60,
    \"fsWatcherEnabled\": true,
    \"fsWatcherDelayS\": 10,
    \"devices\": [{\"deviceID\": \"$MACBOOK_DEVICE_ID\"}],
    \"versioning\": {\"type\": \"simple\", \"params\": {\"keep\": \"10\"}}
  }" >/dev/null
ok "Added sync folder 'claude-sessions'"

# ========== STEP 6: Re-clone the 7 new repos from GitHub ==========
step "Step 6/7: Clone 7 new repos from GitHub"

cd "$PROJECTS_DIR"
for repo in "${NEW_REPOS[@]}"; do
  if gh repo clone "$GITHUB_USER/$repo" "$repo" -- --quiet 2>/dev/null; then
    ok "Cloned $repo"
  else
    err "Failed to clone $repo (check repo exists on GitHub)"
  fi
done

# ========== STEP 7: Pull existing git repos ==========
step "Step 7/7: Pull existing git repos"

"$HOME/bin/claude-sync" pull || true

# ========== Final instructions ==========
echo ""
echo "${GREEN}${BOLD}══════════════════════════════════════════════════════════${NC}"
echo "${GREEN}${BOLD}  Mac mini setup complete. One last manual step:${NC}"
echo "${GREEN}${BOLD}══════════════════════════════════════════════════════════${NC}"
echo ""
echo "  On ${BOLD}MacBook${NC}, open: ${CYAN}http://localhost:8384${NC}"
echo "  You will see a popup:"
echo "    ${YELLOW}\"New device $MY_DEVICE_ID wants to connect\"${NC}"
echo "  → Click ${GREEN}Add Device${NC}, name it \"Mac mini\""
echo ""
echo "  Then another popup:"
echo "    ${YELLOW}\"Mac mini wants to share folder claude-sessions\"${NC}"
echo "  → Click ${GREEN}Add${NC}"
echo ""
echo "  After that, both machines will sync automatically. 🎉"
echo ""
echo "  Backups from this run (delete later if sync looks good):"
echo "    ~/.claude.backup-$TIMESTAMP"
for repo in "${NEW_REPOS[@]}"; do
  [ -d "$PROJECTS_DIR/$repo.backup-$TIMESTAMP" ] && echo "    $PROJECTS_DIR/$repo.backup-$TIMESTAMP"
done
echo ""
