FROM --platform=linux/amd64 iconloop/goloop-icon:v1.4.4

USER root

# curl and jq back the compose healthcheck and the genesis patch, so the image
# serves both on its own. Branch on the package manager: the base image may be
# Debian- or Alpine-based.
RUN if command -v apt-get >/dev/null 2>&1; then \
      apt-get update \
      && apt-get install -y --no-install-recommends bash curl jq ca-certificates \
      && rm -rf /var/lib/apt/lists/*; \
    elif command -v apk >/dev/null 2>&1; then \
      apk add --no-cache bash curl jq; \
    else \
      echo "neither apt-get nor apk available in base image" >&2; exit 1; \
    fi

COPY coin-tester-goloop/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# JSON-RPC
EXPOSE 9080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
