FROM eclipse-temurin:21-jre-jammy

ARG PHOTON_JAR_URL=https://github.com/komoot/photon/releases/latest/download/photon.jar
USER root

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/photon

RUN echo "Downloading Photon from ${PHOTON_JAR_URL}" \
    && curl -fSL "${PHOTON_JAR_URL}" -o photon.jar \
    && chmod 644 photon.jar

COPY entrypoint.sh /usr/local/bin/photon-entrypoint.sh
RUN chmod +x /usr/local/bin/photon-entrypoint.sh

VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/photon-entrypoint.sh"]
