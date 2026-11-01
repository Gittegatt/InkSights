#!/bin/sh
#
# InkSights - starts inksights.sh in the Docker app "inksights-script" (docker-compose.yaml)
#
# The script needs the system itself: the USB ports of the boards (also ones plugged in later), the
# drives (lsblk, df, smartctl), the ZFS tools of the system (tools of another version in the image
# could not be trusted to read its pools), the network interfaces and the status files of the
# spindown timer and drive-temp-export. So it runs in the namespaces of the system (nsenter; the app
# needs "privileged: true" and "pid: host"), with the bash and the tools of the system, exactly as if
# it was started there. The script and the data folder stay in this container: the system reaches
# them through /proc/<this shell>/root, so nothing is copied onto the system.
#
# Arguments go to inksights.sh (-l loop: the app; -n dry run; -f full update now), e.g.
#   sudo docker exec inksights-script /app/script-entry.sh -n
#

ROOT="/proc/$$/root"   # the files of this container, seen from the system

if ! nsenter -t 1 -m -- /bin/sh -c 'exit 0' 2>/dev/null; then
    echo "inksights-script: cannot reach the system; the app needs privileged: true and pid: host (docker-compose.yaml)" >&2
    exit 1
fi
if ! nsenter -t 1 -m -- /bin/bash -c 'exit 0' 2>/dev/null; then
    echo "inksights-script: the system has no /bin/bash, which inksights.sh needs" >&2
    exit 1
fi

nsenter -t 1 -m -u -i -n -- /bin/bash "$ROOT/app/inksights.sh" -d "$ROOT/data" "$@" &
child=$!
# docker stop: tell the script; it finishes the run that is busy and stops
trap 'kill -TERM "$child" 2>/dev/null' TERM INT
wait "$child"
rc=$?
[ "$rc" -gt 128 ] && { wait "$child"; rc=$?; }
exit "$rc"
