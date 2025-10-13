#!/bin/sh
set -euo pipefail

DATA_DIR="${PHOTON_DATA_DIR:-/data}"
PBF_URL="${PHOTON_PBF_URL:-https://download.geofabrik.de/europe/germany-latest.osm.pbf}"
PBF_FILE="${PHOTON_PBF_FILE:-germany-latest.osm.pbf}"
IMPORT_FORCE="${PHOTON_FORCE_REIMPORT:-false}"

mkdir -p "${DATA_DIR}"

PBF_PATH="${DATA_DIR}/${PBF_FILE}"
PHOTON_DB="${DATA_DIR}/photon.mv.db"

download_pbf() {
  if [ -f "${PBF_PATH}" ]; then
    echo "Photon: PBF already present at ${PBF_PATH}, skipping download."
    return
  fi

  echo "Photon: Downloading ${PBF_URL}..."
  tmp_file="${PBF_PATH}.tmp"
  curl -fSL --continue-at - "${PBF_URL}" -o "${tmp_file}"
  mv "${tmp_file}" "${PBF_PATH}"
  echo "Photon: Download complete."
}

import_data() {
  if [ "${IMPORT_FORCE}" != "true" ] && [ -f "${PHOTON_DB}" ]; then
    echo "Photon: Existing index detected, skipping import."
    return
  fi

  echo "Photon: Importing data from ${PBF_PATH}..."
  java ${JAVA_OPTS:-} -jar photon.jar -nominatim-export "${PBF_PATH}"
  echo "Photon: Import finished."
}

download_pbf
import_data

echo "Photon: Starting API..."
exec java ${JAVA_OPTS:-} -jar photon.jar
