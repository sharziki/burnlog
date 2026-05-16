#!/bin/sh
set -e

# Apply any pending Prisma migrations before starting the server.
# Safe to run on every boot — migrate deploy is idempotent.
if [ -n "$DATABASE_URL" ]; then
  echo "burnlog: applying database migrations..."
  node /app/node_modules/prisma/build/index.js migrate deploy
else
  echo "burnlog: DATABASE_URL not set — skipping migrations" >&2
fi

exec "$@"
