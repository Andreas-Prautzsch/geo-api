ARG PHOTON_BASE_IMAGE=ghcr.io/komoot/photon:latest
FROM ${PHOTON_BASE_IMAGE}

USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/photon-entrypoint.sh
RUN chmod +x /usr/local/bin/photon-entrypoint.sh

VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/photon-entrypoint.sh"]
