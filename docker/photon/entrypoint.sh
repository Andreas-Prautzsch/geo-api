#!/bin/sh
set -euo pipefail

log() {
  printf '%s %s\n' "[$(date '+%Y-%m-%dT%H:%M:%S%z')][PHOTON]" "$*"
}

DATA_DIR="${PHOTON_DATA_DIR:-/data}"
PBF_URL="${PHOTON_PBF_URL:-https://download.geofabrik.de/europe/germany-latest.osm.pbf}"
PBF_FILE="${PHOTON_PBF_FILE:-germany-latest.osm.pbf}"
IMPORT_FORCE="${PHOTON_FORCE_REIMPORT:-false}"

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

PBF_PATH="${DATA_DIR}/${PBF_FILE}"
PHOTON_DB="${DATA_DIR}/photon.mv.db"

log "Using data directory: ${DATA_DIR}"
log "Expecting PBF: ${PBF_PATH}"
if [ -z "${JAR_FILE}" ]; then
  log "No Photon jar found in /opt/photon. Please check PHOTON_JAR_FILE / build configuration."
  exit 1
fi

log "Using Photon jar: ${JAR_FILE}"

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

download_pbf
import_data

log "Starting Photon API..."
exec java ${JAVA_OPTS:-} -jar "${JAR_FILE}"
