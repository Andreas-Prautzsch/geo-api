FROM curlimages/curl:8.8.0 as fetcher

FROM osrm/osrm-backend:latest

COPY --from=fetcher /usr/bin/curl /usr/local/bin/curl
COPY --from=fetcher /lib/x86_64-linux-gnu/libz.so.1 /lib/x86_64-linux-gnu/libz.so.1
COPY --from=fetcher /lib/x86_64-linux-gnu/libnghttp2.so.14 /lib/x86_64-linux-gnu/libnghttp2.so.14
COPY --from=fetcher /lib/x86_64-linux-gnu/libbrotlidec.so.1 /lib/x86_64-linux-gnu/libbrotlidec.so.1
COPY --from=fetcher /lib/x86_64-linux-gnu/libbrotlicommon.so.1 /lib/x86_64-linux-gnu/libbrotlicommon.so.1
COPY --from=fetcher /lib/x86_64-linux-gnu/libssl.so.3 /lib/x86_64-linux-gnu/libssl.so.3
COPY --from=fetcher /lib/x86_64-linux-gnu/libcrypto.so.3 /lib/x86_64-linux-gnu/libcrypto.so.3
COPY --from=fetcher /usr/lib/x86_64-linux-gnu/libcurl.so.4 /usr/lib/x86_64-linux-gnu/libcurl.so.4
COPY --from=fetcher /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

COPY entrypoint.sh /usr/local/bin/osrm-entrypoint.sh
RUN chmod +x /usr/local/bin/osrm-entrypoint.sh

VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/osrm-entrypoint.sh"]
