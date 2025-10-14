#!/bin/sh
set -euo pipefail

log() {
  printf '%s %s\n' "[$(date '+%Y-%m-%dT%H:%M:%S%z')][OSRM]" "$*"
}

DATA_DIR="${OSRM_DATA_DIR:-/data}"
PBF_URL="${OSRM_PBF_URL:-https://download.geofabrik.de/europe/germany-latest.osm.pbf}"
PBF_FILE="${OSRM_PBF_FILE:-germany-latest.osm.pbf}"
PROFILE="${OSRM_PROFILE:-/opt/car.lua}"
OSRM_ALGORITHM="${OSRM_ALGORITHM:-mld}"

mkdir -p "${DATA_DIR}"

PBF_PATH="${DATA_DIR}/${PBF_FILE}"
OSRM_BASENAME="${PBF_PATH%.osm.pbf}"
OSRM_FILE="${OSRM_BASENAME}.osrm"

log "Using data directory: ${DATA_DIR}"
log "Expecting PBF: ${PBF_PATH}"

download_pbf() {
  if [ -f "${PBF_PATH}" ]; then
    log "PBF already present ($(ls -lh "${PBF_PATH}" | awk '{print $5}')), skipping download."
    return
  fi

  log "Downloading ${PBF_URL} ..."
  tmp_file="${PBF_PATH}.tmp"
  if curl -fSL --continue-at - "${PBF_URL}" -o "${tmp_file}"; then
    mv "${tmp_file}" "${PBF_PATH}"
    log "Download complete ($(ls -lh "${PBF_PATH}" | awk '{print $5}'))."
  else
    log "Download failed, removing partial file."
    rm -f "${tmp_file}"
    exit 1
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

download_pbf
prepare_osrm

log "Starting osrm-routed on ${OSRM_FILE}"
exec osrm-routed --algorithm "${OSRM_ALGORITHM}" "${OSRM_FILE}"
