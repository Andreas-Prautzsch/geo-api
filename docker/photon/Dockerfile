FROM eclipse-temurin:21-jre-jammy

ARG PHOTON_JAR_URL=https://github.com/komoot/photon/releases/download/0.7.4/photon-0.7.4.jar
ARG PHOTON_JAR_FILE=photon-0.7.4.jar
USER root

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/photon

RUN echo "Downloading Photon from ${PHOTON_JAR_URL}" \
    && curl -fSL "${PHOTON_JAR_URL}" -o "${PHOTON_JAR_FILE}" \
    && chmod 644 "${PHOTON_JAR_FILE}"

COPY entrypoint.sh /usr/local/bin/photon-entrypoint.sh
RUN chmod +x /usr/local/bin/photon-entrypoint.sh

ENV PHOTON_JAR_FILE=${PHOTON_JAR_FILE}

VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/photon-entrypoint.sh"]
