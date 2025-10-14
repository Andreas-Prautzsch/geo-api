#!/bin/sh
set -eu

log() {
  printf '%s %s\n' "[$(date '+%Y-%m-%dT%H:%M:%S%z')][PHOTON]" "$*"
}

DATA_DIR="${PHOTON_DATA_DIR:-/data}"
DATASET_URL="${PHOTON_DATASET_URL:-https://download1.graphhopper.com/public/photon/photon-db-latest.tar.bz2}"
DATASET_FILE="${PHOTON_DATASET_FILE:-photon-db-latest.tar.bz2}"
DATASET_CACHE_DIR="${PHOTON_DATASET_CACHE_DIR:-${PBF_CACHE_DIR:-}}"
LOCK_DIR=""

resolve_jar_file() {
  if [ -n "${PHOTON_JAR_FILE:-}" ] && [ -f "${PHOTON_JAR_FILE}" ]; then
    printf '%s' "${PHOTON_JAR_FILE}"
    return
  fi

  if [ -f "photon.jar" ]; then
    printf '%s' "photon.jar"
    return
  fi

  first_match="$(ls -1 photon*.jar 2>/dev/null | head -n 1 || true)"
  if [ -n "${first_match}" ]; then
    printf '%s' "${first_match}"
    return
  fi

  printf '%s' ""
}

ensure_directory() {
  dir="$1"
  if [ -n "${dir}" ]; then
    mkdir -p "${dir}"
  fi
}

JAR_FILE="$(resolve_jar_file)"

cd /opt/photon

ensure_directory "${DATA_DIR}"
ensure_directory "${DATASET_CACHE_DIR}"

PHOTON_DB="${DATA_DIR}/photon.mv.db"
PHOTON_TRACE_DB="${DATA_DIR}/photon.trace.db"

if [ -z "${JAR_FILE}" ]; then
  log "Photon JAR could not be located."
  exit 1
fi

if [ ! -f "${JAR_FILE}" ]; then
  log "Photon jar ${JAR_FILE} not found in /opt/photon."
  exit 1
fi

if [ -f "${PHOTON_DB}" ]; then
  log "Photon DB already present ($(ls -lh "${PHOTON_DB}" | awk '{print $5}')), skipping download."
fi

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
    log "Waiting for other process to finish downloading dataset..."
    sleep 15
  done

  trap release_lock EXIT INT TERM
}

move_database_files() {
  search_dir="$1"
  find "${search_dir}" -type f \( -name 'photon*.mv.db' -o -name 'photon*.trace.db' \) | while read -r file; do
    base="$(basename "${file}")"
    target="${DATA_DIR}/${base}"
    if [ "${file}" != "${target}" ]; then
      mv "${file}" "${target}"
    fi
  done
}

extract_dataset() {
  archive="$1"
  log "Extracting dataset from ${archive}..."
  tmp_dir="$(mktemp -d /tmp/photon-dataset-XXXXXX)"
  if tar -xf "${archive}" -C "${tmp_dir}"; then
    move_database_files "${tmp_dir}"
    # Some archives contain nested directories; move everything inside data dir preserving structure if DB still missing
    if [ ! -f "${PHOTON_DB}" ]; then
      find "${tmp_dir}" -mindepth 1 -maxdepth 1 -exec cp -r {} "${DATA_DIR}/" \;
    fi
    rm -rf "${tmp_dir}"
  else
    rm -rf "${tmp_dir}"
    log "Failed to extract dataset archive."
    exit 1
  fi
}

ensure_dataset() {
  if [ -f "${PHOTON_DB}" ]; then
    return
  fi

  dataset_target="${DATASET_CACHE_DIR:+${DATASET_CACHE_DIR}/${DATASET_FILE}}"
  if [ -z "${dataset_target}" ]; then
    dataset_target="${DATA_DIR}/${DATASET_FILE}"
  fi
  ensure_directory "$(dirname "${dataset_target}")"

  while true; do
    if [ -f "${PHOTON_DB}" ]; then
      return
    fi

    if [ -f "${dataset_target}" ]; then
      extract_dataset "${dataset_target}"
      if [ -f "${PHOTON_DB}" ]; then
        if [ -z "${DATASET_CACHE_DIR}" ]; then
          rm -f "${dataset_target}"
        fi
        return
      fi
      log "Extracted dataset did not contain photon.mv.db, retrying download."
      rm -f "${dataset_target}"
    fi

    acquire_lock "${dataset_target}"

    if [ -f "${dataset_target}" ]; then
      release_lock
      continue
    fi

    tmp_file="${dataset_target}.tmp"
    log "Downloading Photon dataset from ${DATASET_URL}..."
    if download_file "${DATASET_URL}" "${tmp_file}"; then
      mv "${tmp_file}" "${dataset_target}"
      release_lock
      extract_dataset "${dataset_target}"
      if [ -f "${PHOTON_DB}" ]; then
        if [ -z "${DATASET_CACHE_DIR}" ]; then
          rm -f "${dataset_target}"
        fi
        return
      fi
      log "Extracted dataset did not contain expected files, retrying in 60 seconds."
      rm -f "${dataset_target}"
    else
      log "Dataset download failed, removing partial file and retrying in 60 seconds."
      rm -f "${tmp_file}"
      release_lock
      sleep 60
    fi
  done
}

ensure_dataset

if [ ! -f "${PHOTON_DB}" ]; then
  log "Photon database not found after download."
  exit 1
fi

if [ ! -f "${PHOTON_TRACE_DB}" ]; then
  log "Photon trace DB not found; continuing without it."
fi

log "Starting Photon API..."
exec java ${JAVA_OPTS:-} -jar "${JAR_FILE}" -data-dir "${DATA_DIR}"
