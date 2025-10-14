#!/bin/sh
set -eu

log() {
  printf '%s %s\n' "[$(date '+%Y-%m-%dT%H:%M:%S%z')][OSRM]" "$*"
}

DATA_DIR="${OSRM_DATA_DIR:-/data}"
PBF_URL="${OSRM_PBF_URL:-https://download.geofabrik.de/europe/germany-latest.osm.pbf}"
PBF_FILE="${OSRM_PBF_FILE:-germany-latest.osm.pbf}"
PROFILE="${OSRM_PROFILE:-/opt/car.lua}"
OSRM_ALGORITHM="${OSRM_ALGORITHM:-mld}"
PBF_CACHE_DIR="${OSRM_PBF_CACHE_DIR:-${PBF_CACHE_DIR:-}}"
LOCK_DIR=""

mkdir -p "${DATA_DIR}"
if [ -n "${PBF_CACHE_DIR}" ]; then
  mkdir -p "${PBF_CACHE_DIR}"
fi

PBF_PATH="${DATA_DIR}/${PBF_FILE}"
OSRM_BASENAME="${PBF_PATH%.osm.pbf}"
OSRM_FILE="${OSRM_BASENAME}.osrm"
CACHE_PBF_PATH=""
if [ -n "${PBF_CACHE_DIR}" ]; then
  CACHE_PBF_PATH="${PBF_CACHE_DIR}/${PBF_FILE}"
fi

log "Using data directory: ${DATA_DIR}"
log "Expecting PBF: ${PBF_PATH}"

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

download_file() {
  src="$1"
  dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl --retry 5 --retry-delay 30 --retry-connrefused -fSL --continue-at - "${src}" -o "${dest}"
    return $?
  fi

  if command -v wget >/dev/null 2>&1; then
    wget --tries=5 --waitretry=30 -c -O "${dest}" "${src}"
    return $?
  fi

  log "Neither curl nor wget is available in the container."
  return 1
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

prepare_osrm() {
  if [ -f "${OSRM_FILE}" ]; then
    if [ "${OSRM_ALGORITHM}" = "ch" ] && [ -f "${OSRM_BASENAME}.osrm.hsgr" ]; then
      log "Routing files already prepared (CH)."
      return
    fi

    if [ "${OSRM_ALGORITHM}" = "mld" ] && [ -f "${OSRM_BASENAME}.osrm.partition" ] && [ -f "${OSRM_BASENAME}.osrm.cells" ]; then
      log "Routing files already prepared (MLD)."
      return
    fi
  fi

  log "Preparing routing data (this can take several minutes)..."
  osrm-extract -p "${PROFILE}" "${PBF_PATH}"

  if [ "${OSRM_ALGORITHM}" = "mld" ]; then
    osrm-partition "${OSRM_FILE}"
    osrm-customize "${OSRM_FILE}"
  else
    osrm-contract "${OSRM_FILE}"
  fi

  log "Routing data ready."
}

ensure_pbf
prepare_osrm

log "Starting osrm-routed on ${OSRM_FILE}"
exec osrm-routed --algorithm "${OSRM_ALGORITHM}" "${OSRM_FILE}"
