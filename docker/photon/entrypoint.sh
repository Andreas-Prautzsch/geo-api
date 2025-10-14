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
  curl --retry 5 --retry-delay 30 --retry-connrefused -fSL --continue-at - "${url}" -o "${destination}"
  return $?
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
  while true; do
    if [ -f "${PBF_PATH}" ]; then
      log "PBF already present in data directory ($(ls -lh "${PBF_PATH}" | awk '{print $5}')), skipping download."
      return
    fi

    if [ -n "${CACHE_PBF_PATH}" ] && [ -f "${CACHE_PBF_PATH}" ]; then
      log "Found cached PBF at ${CACHE_PBF_PATH}, copying..."
      cp "${CACHE_PBF_PATH}" "${PBF_PATH}"
      log "Copy complete."
      return
    fi

    target_for_lock="${CACHE_PBF_PATH:-${PBF_PATH}}"
    acquire_lock "${target_for_lock}"

    if [ -n "${CACHE_PBF_PATH}" ] && [ -f "${CACHE_PBF_PATH}" ]; then
      log "Cache file became available during wait, copying..."
      cp "${CACHE_PBF_PATH}" "${PBF_PATH}"
      log "Copy complete."
      release_lock
      continue
    fi

    if [ -n "${CACHE_PBF_PATH}" ]; then
      dest="${CACHE_PBF_PATH}"
    else
      dest="${PBF_PATH}"
    fi
    tmp_file="${dest}.tmp"

    log "Downloading ${PBF_URL} into ${dest}..."
    if download_file "${PBF_URL}" "${tmp_file}"; then
      mv "${tmp_file}" "${dest}"
      if [ "${dest}" != "${PBF_PATH}" ]; then
        cp "${dest}" "${PBF_PATH}"
      fi
      log "Download complete ($(ls -lh "${dest}" | awk '{print $5}'))."
      release_lock
      return
    fi

    log "Download failed, removing partial file and retrying in 60 seconds."
    rm -f "${tmp_file}"
    release_lock
    sleep 60
  done
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

  java ${JAVA_OPTS:-} -jar "${JAR_FILE}" import --nominatim-export "${PBF_PATH}"
  log "Import finished."
}

ensure_pbf
import_data

log "Starting Photon API..."
exec java ${JAVA_OPTS:-} -jar "${JAR_FILE}"
