#!/bin/sh
set -eu
zip_file="$1"
recipients=""

if unzip -t "$zip_file" >/dev/null 2>&1; then
  echo "zip"
  exit 0
fi

if tar -tf "$zip_file" >/dev/null 2>&1; then
  echo "tar"
  exit 0
fi

echo "unknown"
exit 0
