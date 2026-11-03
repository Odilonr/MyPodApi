#!/usr/bin/env bash
# Saves a compressed copy of the database, and keeps the last 7.
# These copies are on the same disk, so Lightsail snapshots protect against
# losing the whole server.
set -euo pipefail

BASE=/opt/mypod
cd "$BASE/api"
FILE="$BASE/backups/mypod-$(date +%Y-%m-%d).sql.gz"

docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
  pg_dump -U mypod mypod | gzip > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
chmod 600 "$FILE"

ls -1t "$BASE"/backups/mypod-*.sql.gz | tail -n +8 | xargs -r rm --
echo "$(date): saved $FILE"
