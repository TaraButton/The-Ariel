#!/bin/bash
# ONE-TIME SETUP: creates the "British Review of Reviews" Google Sheet + its Apps Script,
# pushes the code and creates the web app deployment. Run once from this folder.
set -e
cd "$(dirname "$0")"
command -v clasp >/dev/null || npm install -g @google/clasp
if [ -f .clasp.json ]; then echo "Already set up (.clasp.json exists). Use ./deploy.sh"; exit 0; fi
cp appsscript.json appsscript.keep.json
clasp create --type sheets --title "British Review of Reviews" --rootDir .
mv -f appsscript.keep.json appsscript.json
clasp push -f
OUT=$(clasp deploy --description "Review of Reviews v1")
echo "$OUT"
DEPLOY_ID=$(echo "$OUT" | grep -oE 'AKfycb[A-Za-z0-9_-]+' | head -1)
echo "$DEPLOY_ID" > .deployment-id
URL="https://script.google.com/macros/s/$DEPLOY_ID/exec"
HQ="$HOME/Cowork/AI_Consulting/The Ariel HQ/Platform/review-of-reviews"
mkdir -p "$HQ" && echo "$URL" > "$HQ/backend-url.txt"
echo ""
echo "=== Done. The address is saved for Claude in The Ariel HQ. ==="
echo "Opening the script editor now..."
clasp open || true
