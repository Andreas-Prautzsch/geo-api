FROM osrm/osrm-backend:latest

COPY entrypoint.sh /usr/local/bin/osrm-entrypoint.sh
RUN chmod +x /usr/local/bin/osrm-entrypoint.sh

VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/osrm-entrypoint.sh"]
