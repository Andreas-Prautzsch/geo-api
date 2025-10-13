#!/bin/sh
set -euo pipefail

DATA_DIR="${OSRM_DATA_DIR:-/data}"
PBF_URL="${OSRM_PBF_URL:-https://download.geofabrik.de/europe/germany-latest.osm.pbf}"
PBF_FILE="${OSRM_PBF_FILE:-germany-latest.osm.pbf}"
PROFILE="${OSRM_PROFILE:-/opt/car.lua}"
OSRM_ALGORITHM="${OSRM_ALGORITHM:-mld}"

mkdir -p "${DATA_DIR}"

PBF_PATH="${DATA_DIR}/${PBF_FILE}"
OSRM_BASENAME="${PBF_PATH%.osm.pbf}"
OSRM_FILE="${OSRM_BASENAME}.osrm"

download_pbf() {
  if [ -f "${PBF_PATH}" ]; then
    echo "OSRM: PBF already present at ${PBF_PATH}, skipping download."
    return
  fi

  echo "OSRM: Downloading ${PBF_URL}..."
  tmp_file="${PBF_PATH}.tmp"
  curl -fSL --continue-at - "${PBF_URL}" -o "${tmp_file}"
  mv "${tmp_file}" "${PBF_PATH}"
  echo "OSRM: Download complete."
}

prepare_osrm() {
  if [ -f "${OSRM_FILE}" ]; then
    if [ "${OSRM_ALGORITHM}" = "ch" ] && [ -f "${OSRM_BASENAME}.osrm.hsgr" ]; then
      echo "OSRM: Routing files already prepared (CH)."
      return
    fi

    if [ "${OSRM_ALGORITHM}" = "mld" ] && [ -f "${OSRM_BASENAME}.osrm.partition" ] && [ -f "${OSRM_BASENAME}.osrm.cells" ]; then
      echo "OSRM: Routing files already prepared (MLD)."
      return
    fi
  fi

  echo "OSRM: Preparing routing data..."
  osrm-extract -p "${PROFILE}" "${PBF_PATH}"

  if [ "${OSRM_ALGORITHM}" = "mld" ]; then
    osrm-partition "${OSRM_FILE}"
    osrm-customize "${OSRM_FILE}"
  else
    osrm-contract "${OSRM_FILE}"
  fi

  echo "OSRM: Routing data ready."
}

download_pbf
prepare_osrm

echo "OSRM: Starting osrm-routed..."
exec osrm-routed --algorithm "${OSRM_ALGORITHM}" "${OSRM_FILE}"
