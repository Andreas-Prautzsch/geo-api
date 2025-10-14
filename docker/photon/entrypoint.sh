#!/bin/sh
set -eu

log() {
  printf '%s %s\n' "[$(date '+%Y-%m-%dT%H:%M:%S%z')][PHOTON]" "$*"
}

DATA_DIR="${PHOTON_DATA_DIR:-/data}"
PBF_URL="${PHOTON_PBF_URL:-https://download.geofabrik.de/europe/germany-latest.osm.pbf}"
PBF_FILE="${PHOTON_PBF_FILE:-germany-latest.osm.pbf}"
IMPORT_FORCE="${PHOTON_FORCE_REIMPORT:-false}"
PBF_CACHE_DIR="${PHOTON_PBF_CACHE_DIR:-${PBF_CACHE_DIR:-}}"
LOCK_DIR=""

resolve_jar_file() {
  if [ -n "${PHOTON_JAR_FILE:-}" ]; then
    printf '%s' "${PHOTON_JAR_FILE}"
    return
  fi

  if [ -f "photon-0.7.4.jar" ]; then
    printf '%s' "photon-0.7.4.jar"
    return
  fi

  first_match="$(ls -1 photon*.jar 2>/dev/null | head -n 1 || true)"
  if [ -n "${first_match}" ]; then
    printf '%s' "${first_match}"
    return
  fi

  printf '%s' ""
}

JAR_FILE="$(resolve_jar_file)"

cd /opt/photon

mkdir -p "${DATA_DIR}"
if [ -n "${PBF_CACHE_DIR}" ]; then
  mkdir -p "${PBF_CACHE_DIR}"
fi

PBF_PATH="${DATA_DIR}/${PBF_FILE}"
PHOTON_DB="${DATA_DIR}/photon.mv.db"
CACHE_PBF_PATH=""
if [ -n "${PBF_CACHE_DIR}" ]; then
  CACHE_PBF_PATH="${PBF_CACHE_DIR}/${PBF_FILE}"
fi

log "Using data directory: ${DATA_DIR}"
log "Expecting PBF: ${PBF_PATH}"
if [ -z "${JAR_FILE}" ]; then
  log "No Photon jar found in /opt/photon. Please check PHOTON_JAR_FILE / build configuration."
  exit 1
fi

log "Using Photon jar: ${JAR_FILE}"

download_file() {
  url="$1"
  destination="$2"
  if command -v curl >/dev/null 2>&1; then
    curl --retry 5 --retry-delay 30 --retry-connrefused -fSL --continue-at - "${url}" -o "${destination}"
    return $?
  fi
  if command -v wget >/dev/null 2>&1; then
    wget --tries=5 --waitretry=30 -c -O "${destination}" "${url}"
    return $?
  fi
  log "Neither curl nor wget available for download."
  return 1
}

release_lock() {
  if [ -n "${LOCK_DIR}" ]; then
    rmdir "${LOCK_DIR}" 2>/dev/null || true
    LOCK_DIR=""
  fi
  trap - EXIT INT TERM
}

acquire_lock() {
  lock_target="$1"
  if [ -z "${lock_target}" ]; then
    return 0
  fi

  LOCK_DIR="${lock_target}.lock"
  until mkdir "${LOCK_DIR}" 2>/dev/null; do
    log "Waiting for other process to finish downloading ${PBF_FILE}..."
    sleep 15
  done

  trap release_lock EXIT INT TERM
}

ensure_pbf() {
  if [ -f "${PBF_PATH}" ]; then
    log "PBF already present in data directory ($(ls -lh "${PBF_PATH}" | awk '{print $5}')), skipping download."
    return
  fi

  # Try cache first
  if [ -n "${CACHE_PBF_PATH}" ] && [ -f "${CACHE_PBF_PATH}" ]; then
    log "Found cached PBF at ${CACHE_PBF_PATH}, copying..."
    cp "${CACHE_PBF_PATH}" "${PBF_PATH}"
    log "Copy complete."
    release_lock
    return
  fi

  target_for_lock="${CACHE_PBF_PATH:-${PBF_PATH}}"
  acquire_lock "${target_for_lock}"

  if [ -n "${CACHE_PBF_PATH}" ]; then
    if [ -f "${CACHE_PBF_PATH}" ]; then
      log "Cache file became available, copying..."
      cp "${CACHE_PBF_PATH}" "${PBF_PATH}"
      log "Copy complete."
      release_lock
      return
    fi
    log "Downloading ${PBF_URL} into cache directory..."
    tmp_file="${CACHE_PBF_PATH}.tmp"
    if download_file "${PBF_URL}" "${tmp_file}"; then
      mv "${tmp_file}" "${CACHE_PBF_PATH}"
      cp "${CACHE_PBF_PATH}" "${PBF_PATH}"
      log "Download complete ($(ls -lh "${CACHE_PBF_PATH}" | awk '{print $5}'))."
      release_lock
    else
      log "Download failed, removing partial file."
      rm -f "${tmp_file}"
      release_lock
      exit 1
    fi
  else
    log "Downloading ${PBF_URL} into data directory..."
    tmp_file="${PBF_PATH}.tmp"
    if download_file "${PBF_URL}" "${tmp_file}"; then
      mv "${tmp_file}" "${PBF_PATH}"
      log "Download complete ($(ls -lh "${PBF_PATH}" | awk '{print $5}'))."
      release_lock
    else
      log "Download failed, removing partial file."
      rm -f "${tmp_file}"
      release_lock
      exit 1
    fi
  fi
}

import_data() {
  if [ "${IMPORT_FORCE}" != "true" ] && [ -f "${PHOTON_DB}" ]; then
    log "Existing index detected ($(ls -lh "${PHOTON_DB}" | awk '{print $5}')), skipping import."
    return
  fi

  log "Importing data from ${PBF_PATH} (can take several minutes)..."
  if [ ! -f "${JAR_FILE}" ]; then
    log "Photon jar ${JAR_FILE} not found."
    exit 1
  fi

  java ${JAVA_OPTS:-} -jar "${JAR_FILE}" -nominatim-export "${PBF_PATH}"
  log "Import finished."
}

ensure_pbf
import_data

log "Starting Photon API..."
exec java ${JAVA_OPTS:-} -jar "${JAR_FILE}"
