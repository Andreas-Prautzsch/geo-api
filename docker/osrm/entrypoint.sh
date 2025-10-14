#!/bin/sh
set -eu

log() {
  printf '%s %s\n' "[$(date '+%Y-%m-%dT%H:%M:%S%z')][OSRM]" "$*"
}

DATA_DIR="${OSRM_DATA_DIR:-/data}"
PBF_URL="${OSRM_PBF_URL:-https://download.geofabrik.de/europe/germany-latest.osm.pbf}"
PBF_URLS="${OSRM_PBF_URLS:-}"
MULTI_PBF=0
if [ -n "${PBF_URLS}" ]; then
  MULTI_PBF=1
fi
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

trim() {
  echo "$1" | sed 's/^ *//;s/ *$//'
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
  if [ -d "${LOCK_DIR}" ]; then
    log "Removing stale lock ${LOCK_DIR}"
    rm -rf "${LOCK_DIR}"
  fi
  until mkdir "${LOCK_DIR}" 2>/dev/null; do
    log "Waiting for other process to finish downloading ${PBF_FILE}..."
    sleep 15
  done

  trap release_lock EXIT INT TERM
}

download_file() {
  src="$1"
  dest="$2"
  curl --retry 5 --retry-delay 30 --retry-connrefused -fSL --continue-at - "${src}" -o "${dest}"
  return $?
}

download_with_cache() {
  url="$1"
  dest="$2"
  dest_dir="$(dirname "${dest}")"
  mkdir -p "${dest_dir}"

  while true; do
    if [ -f "${dest}" ]; then
      log "Using cached file ${dest} ($(ls -lh "${dest}" | awk '{print $5}'))."
      return 0
    fi

    acquire_lock "${dest}"

    if [ -f "${dest}" ]; then
      release_lock
      continue
    fi

    tmp_file="${dest}"
    log "Downloading ${url} into ${dest}..."
    if download_file "${url}" "${tmp_file}"; then
      log "Download complete (${dest})."
      release_lock
      return 0
    fi

    log "Download failed for ${url}, retrying in 5 minutes."
    release_lock
    sleep 300
  done
}

ensure_single_pbf() {
  target_cache="${CACHE_PBF_PATH:-${PBF_PATH}}"
  download_with_cache "${PBF_URL}" "${target_cache}"
  if [ "${target_cache}" != "${PBF_PATH}" ]; then
    cp "${target_cache}" "${PBF_PATH}"
  fi
}

ensure_multi_pbf() {
  if [ -z "${PBF_CACHE_DIR}" ]; then
    PBF_CACHE_DIR="/osm-cache"
    mkdir -p "${PBF_CACHE_DIR}"
  fi

  region_files=""
  IFS=','
  for raw_url in ${PBF_URLS}; do
    url="$(trim "${raw_url}")"
    if [ -z "${url}" ]; then
      continue
    fi
    region_name="$(basename "${url}")"
    region_path="${PBF_CACHE_DIR}/${region_name}"
    download_with_cache "${url}" "${region_path}"
    region_files="${region_files} ${region_path}"
  done
  unset IFS

  if [ -z "${region_files}" ]; then
    log "No region URLs provided; aborting."
    exit 1
  fi

  combined_cache="${CACHE_PBF_PATH:-${PBF_PATH}}"
  acquire_lock "${combined_cache}"
  if [ ! -f "${combined_cache}" ]; then
    tmp_combined="${combined_cache}.tmp.$$"
    if ! command -v osmium >/dev/null 2>&1; then
      log "osmium tool not found; cannot merge multiple regions."
      release_lock
      exit 1
    fi
    log "Combining regions into ${combined_cache}..."
    if osmium cat ${region_files} -o "${tmp_combined}" --output-format osm.pbf; then
      mv -f "${tmp_combined}" "${combined_cache}"
      log "Combined dataset created (${combined_cache})."
    else
      log "Failed to combine datasets; retrying in 5 minutes."
      rm -f "${tmp_combined}"
      release_lock
      sleep 300
      ensure_multi_pbf
      return
    fi
  fi
  release_lock

  if [ "${combined_cache}" != "${PBF_PATH}" ]; then
    cp "${combined_cache}" "${PBF_PATH}"
  fi
}

ensure_pbf() {
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

  if [ "${MULTI_PBF}" -eq 1 ]; then
    ensure_multi_pbf
  else
    ensure_single_pbf
  fi
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
