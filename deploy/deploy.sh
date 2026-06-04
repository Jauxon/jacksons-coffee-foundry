#!/usr/bin/env bash
# Pull latest, install, build, restart. Run on the droplet after a push:
#   sudo bash /srv/coffee/deploy/deploy.sh
# This is what the GitHub Action (.github/workflows/deploy-droplet.yml) runs too.
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/coffee}"
cd "$APP_DIR"

echo "==> Pulling latest"
git fetch origin
git reset --hard origin/master

echo "==> Installing deps (rebuilds the better-sqlite3 native binding)"
npm ci

echo "==> Building"
npm run build

echo "==> Restarting service"
systemctl restart coffee
sleep 2
systemctl --no-pager --lines=15 status coffee || true
echo "==> Deployed."
