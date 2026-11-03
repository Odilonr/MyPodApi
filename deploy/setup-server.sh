#!/usr/bin/env bash
# First-time setup for a new Ubuntu server. Safe to run again.
# Usage: bash setup-server.sh <site address, for example 1-2-3-4.sslip.io>
set -euo pipefail

SITE_ADDRESS="${1:?Give the site address}"
BASE=/opt/mypod

# 1 GB of memory is tight, so add swap as a safety margin.
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
fi

# Install Docker from Docker's own package source.
if ! command -v docker > /dev/null; then
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl git
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Security updates install by themselves.
sudo apt-get install -y unattended-upgrades

sudo mkdir -p "$BASE/backups"
sudo chown -R "$USER:$USER" "$BASE"
[ -d "$BASE/api/.git" ] || git clone https://github.com/Odilonr/MyPodApi.git "$BASE/api"
[ -d "$BASE/frontend/.git" ] || git clone https://github.com/Odilonr/MyPodClient.git "$BASE/frontend"

# The secrets are made here, stay on this server, and are never committed.
ENV_FILE="$BASE/api/.env.production"
if [ ! -f "$ENV_FILE" ]; then
  umask 077
  cat > "$ENV_FILE" <<EOF
SITE_ADDRESS=$SITE_ADDRESS
POSTGRES_PASSWORD=$(openssl rand -hex 32)
ACCESS_TOKEN_SECRET=$(openssl rand -hex 48)
REFRESH_TOKEN_SECRET=$(openssl rand -hex 48)
EOF
fi

# Back up the database every night.
CRON_LINE="30 3 * * * bash $BASE/api/deploy/backup-db.sh >> $BASE/backups/backup.log 2>&1"
( sudo crontab -l 2>/dev/null | grep -v 'backup-db.sh' || true; echo "$CRON_LINE" ) | sudo crontab -

echo "Setup finished. Next, run: bash $BASE/api/deploy/deploy.sh"
