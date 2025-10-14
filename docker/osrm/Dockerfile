FROM busybox:1.36.1-musl as busybox

FROM osrm/osrm-backend:latest

COPY --from=busybox /bin/busybox /usr/local/bin/busybox
RUN ln -sf /usr/local/bin/busybox /usr/local/bin/wget

COPY entrypoint.sh /usr/local/bin/osrm-entrypoint.sh
RUN chmod +x /usr/local/bin/osrm-entrypoint.sh

VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/osrm-entrypoint.sh"]
