#!/bin/sh
set -eu

log() {
  printf '%s %s\n' "[$(date '+%Y-%m-%dT%H:%M:%S%z')][APP]" "$*"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

run_with_retry() {
  label="$1"
  shift
  max_attempts="${DB_MIGRATION_MAX_RETRIES:-30}"
  sleep_seconds="${DB_MIGRATION_RETRY_DELAY:-10}"
  attempt=1

  while [ "$attempt" -le "$max_attempts" ]; do
    if "$@"; then
      log "$label completed (attempt ${attempt}/${max_attempts})."
      return 0
    fi
    exit_code=$?
    log "$label failed (attempt ${attempt}/${max_attempts}, exit ${exit_code}). Retrying in ${sleep_seconds}s..."
    attempt=$((attempt + 1))
    sleep "$sleep_seconds"
  done

  log "$label failed after ${max_attempts} attempts."
  return 1
}

log "Using DB host ${DB_HOST:-<undefined>}:${DB_PORT:-<undefined>} database ${DB_NAME:-<undefined>}."

if ! command_exists npx; then
  log "npx command not found; exiting."
  exit 1
fi

run_with_retry "Database migration" npx sequelize-cli db:migrate
run_with_retry "Database seed" npx sequelize-cli db:seed:all

log "Starting application server..."
exec npm start
