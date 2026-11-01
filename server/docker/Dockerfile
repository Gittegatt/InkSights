# InkSights - the settings page (WebUI) and the script as a ready-made image
#
# Built from the root of the repository:  docker build -f server/docker/Dockerfile -t inksights .
# The image holds the app and all files of the page, and in fw/ the firmware for the boards with WiFi
# (built by the workflow before the image: scripts/build_release.py --ota-dir server/web/fw); the data
# folder (/data) only keeps the settings and the state, the run folder (/run/inksights) is only read.
# The same image runs inksights.sh in the app "inksights-script" (docker-compose.yaml):
# script-entry.sh starts it on the system with nsenter.

FROM python:3.12-alpine

LABEL org.opencontainers.image.title="InkSights" \
      org.opencontainers.image.description="Settings page (WebUI) of InkSights: e-paper displays with drive status and system values" \
      org.opencontainers.image.source="https://github.com/Gittegatt/InkSights" \
      org.opencontainers.image.licenses="GPL-3.0-only"

COPY server/web/ /app/
COPY server/inksights.sh server/docker/script-entry.sh /app/
# nsenter for script-entry.sh
RUN apk add --no-cache util-linux-misc && chmod 755 /app/inksights.sh /app/script-entry.sh

ENV PYTHONUNBUFFERED=1
# the TrueNAS apps user; docker-compose.yaml sets it with user: (the script container: root)
USER 568:568
EXPOSE 8099

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8099/api/health', timeout=4)"

CMD ["python", "/app/inksights-web.py", "--data", "/data", "--run", "/run/inksights", "--port", "8099"]
