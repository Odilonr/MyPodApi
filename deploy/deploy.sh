#!/usr/bin/env bash
# Gets the newest code from GitHub and restarts the site.
set -euo pipefail

BASE=/opt/mypod
cd "$BASE/api"
git pull --ff-only
git -C "$BASE/frontend" pull --ff-only

compose () {
  sudo docker compose -f docker-compose.prod.yml --env-file .env.production "$@"
}

compose build
compose run --rm migrate
compose up -d --remove-orphans
sudo docker image prune -f > /dev/null

echo "Deployed. Containers:"
compose ps
