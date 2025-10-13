FROM osrm/osrm-backend:latest

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/osrm-entrypoint.sh
RUN chmod +x /usr/local/bin/osrm-entrypoint.sh

VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/osrm-entrypoint.sh"]
