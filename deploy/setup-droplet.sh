#!/usr/bin/env bash
# One-time provisioning for a fresh Ubuntu 24.04 DigitalOcean droplet.
# Run as root (or with sudo) on the droplet:
#   curl -fsSL https://raw.githubusercontent.com/Jauxon/jacksons-coffee-foundry/master/deploy/setup-droplet.sh | sudo bash
# or scp this file over and `sudo bash setup-droplet.sh`.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Jauxon/jacksons-coffee-foundry.git}"
APP_DIR="${APP_DIR:-/srv/coffee}"
DATA_DIR="${DATA_DIR:-/var/lib/coffee}"   # SQLite lives here; persists across deploys
ENV_DIR="/etc/coffee"
NODE_MAJOR=22

echo "==> System packages + build toolchain (better-sqlite3 compiles natively)"
apt-get update -y
apt-get install -y curl git build-essential python3 ca-certificates

echo "==> Node ${NODE_MAJOR} via NodeSource"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v && npm -v

echo "==> Caddy (reverse proxy + automatic HTTPS)"
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y && apt-get install -y caddy
fi

echo "==> 2GB swap (insurance so 'next build' doesn't OOM on a small droplet)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Directories"
mkdir -p "$DATA_DIR" "$ENV_DIR"

echo "==> Clone repo"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi

echo "==> Env file (edit it, then re-run deploy.sh)"
if [ ! -f "$ENV_DIR/coffee.env" ]; then
  cp "$APP_DIR/deploy/coffee.env.example" "$ENV_DIR/coffee.env"
  echo "    -> wrote $ENV_DIR/coffee.env  (PUT YOUR ANTHROPIC_API_KEY IN IT)"
fi

echo "==> systemd service"
cp "$APP_DIR/deploy/coffee.service" /etc/systemd/system/coffee.service
systemctl daemon-reload
systemctl enable coffee

echo "==> Caddy config"
cp "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
echo "    -> edit /etc/caddy/Caddyfile and set your domain, then: systemctl reload caddy"

cat <<EOF

============================================================
Provisioning done. Next:
  1. Edit $ENV_DIR/coffee.env  -> set ANTHROPIC_API_KEY
  2. Edit /etc/caddy/Caddyfile -> set your domain (or use :80 for IP-only)
  3. Build + start:   sudo bash $APP_DIR/deploy/deploy.sh
  4. systemctl reload caddy
============================================================
EOF
