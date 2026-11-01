#!/bin/bash
# Push code and update the EXISTING deployment (URL never changes).
set -e
cd "$(dirname "$0")"
[ -f .clasp.json ] && [ -f .deployment-id ] || { echo "Run ./setup.sh first."; exit 1; }
clasp push -f
clasp deploy -i "$(cat .deployment-id)" --description "Review of Reviews $(date '+%Y-%m-%d %H:%M')"
echo "Deployed: https://script.google.com/macros/s/$(cat .deployment-id)/exec"
