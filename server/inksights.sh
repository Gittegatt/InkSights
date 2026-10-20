#!/bin/bash
#
# inksights.sh v1.0.0
#
# Collects drive status and system values (CPU, RAM, network, NVMe temperatures) on a Linux
# NAS server and sends them to one or more e-paper displays (firmware: firmware/InkSights):
# over USB serial to every connected board, and as a frame file for displays that fetch their
# data over WiFi from the settings page.
# Every display reports its chip ID; its settings (disk types, spindown timer, timer style,
# rows per page, disk order, hidden disks, title, system page, fast refresh, WiFi) come from
# inksights.conf in the data folder, written by the settings web page
# (web/inksights-web.py). Displays without settings show all disks.
# Does NOT wake disks: only uses lsblk, sysfs, /proc, zpool/zfs metadata, statfs (df) and the status
# file written by truenas-sata-sas-spindown-timer.sh. The one exception, only when a display
# shows SSD temperatures: smartctl -n standby for drives the kernel reports as non-rotational
# (SSDs), never for hard disks.
#
# Runs once and exits; start it every minute (cron) or let it loop (-l, e.g. in tmux). A full
# update only happens every INTERVAL minutes, when the settings changed, a display was plugged
# in or the web page asked for it ("Update now", "Redraw now"). In between, displays with fast
# refresh (4.2" black/white) get a new frame every 2 to 30 seconds (loop only).
#
# Usage:
#   ./inksights.sh [-h] [-l] [-n] [-f] [-d <dir>] [-I <min>] [-s <file>] [-p <port>]... [-x <disk>]...
#
# Options:
#   -d DIR    : Data folder shared with the web page (default: script folder)
#   -I MIN    : Minutes between regular updates (default: from the web page, else 10)
#   -l        : Loop: run again and again (every 10 s; every second while a display uses fast refresh)
#   -f        : Force a full update now
#   -s FILE   : Spindown status file (default: /var/run/truenas-sata-sas-spindown-status)
#   -p PORT   : Only use this serial port (repeatable). Default: every connected board
#   -x <disk> : Never show this disk (repeatable), e.g. -x sdz
#   -n        : Dry run: print the frame for every display instead of sending it
#   -h        : Help
#
# Frame format (one line per record, fields separated by '|'):
#   #BEGIN
#   H|<title>|<HH:MM>|<rows per page, 0 = auto>|<highlight from % used, 0 = never>|<quarter turns 0-3>|<page turn s, 0 = off>[|<timer 0 badge / 1 ring>|<ring direction 0 cw / 1 ccw>|<symbols 1 on / 0 off>|<details in the bar 0 none / 1 percentage / 2 used capacity>|<fast refresh s, 0 = off>|<uptime: minutes after the full months, -1 = page number>|<uptime: full calendar months>|<WiFi page 0 off / 1 symbols / 2 without>|<s without a fresh frame before "NO DATA", 0 = never>|<header left, middle, right: T title, P page, U uptime, C time, - nothing; lower case = highlighted; --- = no header>|<disk pages 1 on / 0 off>|<network details in the bar 0 none / 1 percentage / 2 link speed>|<network symbols 1 / 0>|<drive temperatures 1 on / 0 off>|<asleep hard disks 1 "STBY" / 0 "--">|<header inverted 1 / 0>]
#   D|<disk>|<pool>|<used>|<total>|<pct, with 1 or 2 decimals (cut) when set>|<idle boxes>|<boxes>|<state A/S/N/?/- (timer off, flash drives keep N)>|<s until spindown, -1 = unknown>|<timeout s>[|<°C, -1 = unknown, -2 = asleep: only with drive temperatures on>]
#   S|<components>|<cpu %>|<cpu °C>|<cpu W>|<RAM used MiB>|<ZFS cache MiB>|<RAM total MiB>|<interface>|<down KiB/s>|<up KiB/s>|<link Mb/s>|<NVMe °C,...>|<SSD °C,...>  (components may add H: HDD temperatures in a T line after it)
#   T|<HDD °C,...>              (only with the HDD component and drive-temp-export running; -2 = asleep, -1 = unknown)
#                              (only with the system page; components: C cpu, R ram, N network, V NVMe,
#                              S SSD, I = symbols; -1 = unknown, "-" = none; at most 6 temperatures each)
#   P|<cs>|<dc>|<rst>|<busy>[|<panel>]
#                              (only when pins or the panel type are set on the web page; panel type
#                              1-5; new values make the board save them and restart)
#   R                          (only after "Redraw now": redraw right away, even without changes)
#   W|<ssid>|<password>|<host>|<server>|<ap>|<ap ssid>|<ap password>|<ap delay>
#                              (USB only, boards with WiFi, when WiFi is set on the web page; texts hex
#                              encoded, ap delay in seconds)
#   #END
#
# WiFi displays: the settings page writes wifi/<id>.info (what the display reported) and
# wifi/<id>.seen (time, answer) when a display fetches its frame; this script writes the
# frame to /var/run/inksights/frames/<id>.txt (in memory: fast displays get a new one every few
# seconds; the settings page reads this folder, mounted read-only into its container).
#
# /var/run/inksights (memory, gone after a reboot):
#   system.json  the latest system values (also for other tools)
#   counters     previous readings for CPU load, power and network rates
#   temps        NVMe and SSD temperatures, read at most every 30 s
#   disks.cache  disk data of the last full update (fast refreshes reuse it)
#   fast         displays with fast refresh: <id> <seconds> <port or wifi> <last frame epoch>
#   frames/      frames of the WiFi displays, read by the settings page (<id>.txt)
#   stamp, lock  time and signature of the last full update, one run at a time
#   inksights.log  what the script did and problems (also on stderr); trimmed to the last
#                  LOG_LINES lines, not written in a dry run
#

export PATH=$PATH:/sbin:/usr/sbin

ORIG_ARGS=("$@")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
DATA_DIR="$SCRIPT_DIR"
INTERVAL=10
INTERVAL_SET=false
FORCE=false
DRY_RUN=false
LOOP=false
STATUS_FILE="/var/run/truenas-sata-sas-spindown-status"
RUN_DIR="/var/run/inksights"
STAMP_FILE="$RUN_DIR/stamp"
LOCK_FILE="$RUN_DIR/lock"
FAST_FILE="$RUN_DIR/fast"
CACHE_FILE="$RUN_DIR/disks.cache"
COUNTERS_FILE="$RUN_DIR/counters"
TEMPS_FILE="$RUN_DIR/temps"
EXPORT_FILE="$RUN_DIR/system.json"
LOG_FILE="$RUN_DIR/inksights.log"
LOG_LINES=2000           # the log keeps the last lines (about 150 KB in memory)
LOG_MAX=262144           # bytes; above this the log is cut back to LOG_LINES
USB_VIDS="2886 303a 239a" # USB vendor IDs: Seeed Studio (XIAO SAMD21), Espressif (ESP32 native USB), Adafruit (QT Py)
ALL_TYPES="hdd,ssd,nvme"
DEFAULT_BOXES=10
DEFAULT_WARN=85          # bar is highlighted from this % used
DEFAULT_PAGE=600         # seconds between automatic page turns on the display, 0 = off
WIFI_STALE=300           # a WiFi display that has not fetched its frame for this long is left out
TEMPS_EVERY=30           # seconds between NVMe / SSD temperature readings
SYS_PARTS_RE='^(cpu|ram|net|nvme|ssd|hdd)(,(cpu|ram|net|nvme|ssd|hdd))*$'
# HDD temperatures come from the status file of drive-temp-export (a separate tool; it asks only
# spinning disks, with smartctl -n standby), never from the hard disks themselves. Older than
# HDD_TEMPS_STALE seconds = the tool does not run: no HDD temperatures.
DRIVE_TEMP_STATUS="${DRIVE_TEMP_STATUS:-/run/system-metrics/output/disk-temp/status}"
HDD_TEMPS_STALE=300
PORTS=()
EXCLUDE=()

# To stderr (tmux, terminal) and into the log in the run folder (not in a dry run)
log() {
    local line
    printf -v line '[%(%Y-%m-%d %H:%M:%S)T] %s' -1 "$*"
    echo "$line" >&2
    [[ "$DRY_RUN" == false && -d "$RUN_DIR" && -O "$RUN_DIR" ]] && echo "$line" >> "$LOG_FILE" 2>/dev/null
    return 0
}

# Cut the log back to its last LOG_LINES lines once it is bigger than LOG_MAX (one run at a time)
trim_log() {
    local size
    size=$(stat -c %s "$LOG_FILE" 2>/dev/null) || return 0
    (( size > LOG_MAX )) || return 0
    tail -n "$LOG_LINES" "$LOG_FILE" > "$LOG_FILE.$$" && mv -f "$LOG_FILE.$$" "$LOG_FILE"
    rm -f "$LOG_FILE.$$"
}

usage() {
    awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
}

while getopts "hlnfd:I:s:p:x:" opt; do
    case $opt in
        h) usage; exit 0 ;;
        l) LOOP=true ;;
        n) DRY_RUN=true ;;
        f) FORCE=true ;;
        d) DATA_DIR=$OPTARG ;;
        I) INTERVAL=$OPTARG; INTERVAL_SET=true ;;
        s) STATUS_FILE=$OPTARG ;;
        p) PORTS+=("$OPTARG") ;;
        x) EXCLUDE+=("$OPTARG") ;;
        *) usage; exit 1 ;;
    esac
done

# Folder for the run files and exports: in memory, root only may write
if ! mkdir -p "$RUN_DIR" 2>/dev/null || [[ ! -O "$RUN_DIR" ]]; then
    log "Cannot use $RUN_DIR (run this script as root)"
    exit 1
fi
chmod 755 "$RUN_DIR"

# -----------------------
# Loop (-l): this script again and again as a new process, so every run starts clean
# -----------------------
if [ "$LOOP" = true ] && [[ -z "${INKSIGHTS_CHILD:-}" ]]; then
    [ "$DRY_RUN" = true ] && { log "-l and -n do not go together"; exit 1; }
    export INKSIGHTS_CHILD=1
    child_args=()
    for a in "${ORIG_ARGS[@]}"; do [[ "$a" == "-l" || "$a" == "-f" ]] || child_args+=("$a"); done
    log "Loop started"
    while :; do
        /bin/bash "$SCRIPT_PATH" "${child_args[@]}"
        if [[ -s "$FAST_FILE" ]]; then sleep 1; else sleep 10; fi
    done
fi

CONF_FILE="$DATA_DIR/inksights.conf"

# Update interval from the web page ("interval<TAB>minutes"), unless -I was given
if [ "$INTERVAL_SET" = false ] && [[ -r "$CONF_FILE" ]]; then
    while IFS=$'\t' read -r k v _; do
        [[ "$k" == "interval" ]] && { conf_interval="${v%$'\r'}"; break; }
    done < "$CONF_FILE"
    [[ "${conf_interval:-}" =~ ^[0-9]{1,3}$ ]] && (( 10#$conf_interval >= 1 && 10#$conf_interval <= 120 )) && INTERVAL=$((10#$conf_interval))
fi
[[ "$INTERVAL" =~ ^[1-9][0-9]*$ ]] || INTERVAL=10
# A display that gets no fresh frame for this long shows "NO DATA": two full updates missed plus
# 2 minutes, at least 10 minutes (same rule as noDataSecs() in inksights-render.js)
NODATA_SECS=$(( INTERVAL * 120 + 120 ))
(( NODATA_SECS < 600 )) && NODATA_SECS=600

STATE_FILE="$DATA_DIR/state.json"
REFRESH_FILE="$DATA_DIR/refresh-request"
REDRAW_FILE="$DATA_DIR/redraw-request"
WIFI_DIR="$DATA_DIR/wifi"
FRAMES_DIR="$RUN_DIR/frames"      # frames of the WiFi displays, in memory (written often)

# -----------------------
# One run at a time (cron starts us every minute, an update can take longer)
# -----------------------
exec 9>"$LOCK_FILE" || exit 1
if [ "$DRY_RUN" = true ]; then
    flock -w 90 9 || { log "Another run is busy. Try again."; exit 1; }
else
    flock -n 9 || exit 0
    trim_log
fi

# -----------------------
# Helpers
# -----------------------
in_list() {
    local x="$1" e
    shift
    for e in "$@"; do [[ "$e" == "$x" ]] && return 0; done
    return 1
}

# Bytes -> short human readable size, binary units like most NAS web interfaces (3.62T, 219G)
hsize() {
    awk -v b="$1" 'BEGIN {
        split("B K M G T P", u, " "); i = 1
        while (b >= 1024 && i < 6) { b /= 1024; i++ }
        if (b < 10) f = "%.2f%s"; else if (b < 100) f = "%.1f%s"; else f = "%.0f%s"
        printf f, b, u[i]
    }'
}

# Resolve a vdev path (/dev/disk/by-partuuid/..., /dev/sda1, ...) to its base disk (sda, nvme0n1)
to_base_disk() {
    local real pk
    real="$(readlink -f "$1" 2>/dev/null)" || return 1
    pk="$(lsblk -no PKNAME "$real" 2>/dev/null | head -n 1)"
    [[ -z "$pk" ]] && pk="$(lsblk -dno NAME "$real" 2>/dev/null | head -n 1)"
    [[ -n "$pk" ]] && echo "$pk"
}

# hdd, ssd or nvme
disk_type() {
    if [[ "$1" == nvme* ]]; then
        echo "nvme"
    elif [[ "$(cat "/sys/block/$1/queue/rotational" 2>/dev/null)" == "0" ]]; then
        echo "ssd"
    else
        echo "hdd"
    fi
}

# Stable disk ID that survives reboots (sda/sdb may swap): serial number, else WWN, else name
disk_uid() {
    local u
    u="$(lsblk -dno SERIAL "/dev/$1" 2>/dev/null | head -n 1 | tr -cd 'A-Za-z0-9._-' | cut -c1-40)"
    [[ -z "$u" ]] && u="$(lsblk -dno WWN "/dev/$1" 2>/dev/null | head -n 1 | tr -cd 'A-Za-z0-9._-' | cut -c1-40)"
    echo "${u:-$1}"
}

json_str() {
    local s="$1"
    s=${s//\\/\\\\}
    s=${s//\"/\\\"}
    s=${s//$'\n'/\\n}
    s=${s//$'\r'/}
    s=${s//$'\t'/\\t}
    printf '"%s"' "$s"
}

# Serial ports of all connected boards (USB vendor ID from sysfs)
find_ports() {
    local tty vid
    for tty in /sys/class/tty/ttyACM*; do
        [[ -e "$tty" ]] || continue
        vid=""
        { read -r vid < "$tty/device/../idVendor"; } 2>/dev/null
        [[ -n "$vid" && " $USB_VIDS " == *" $vid "* ]] && echo "/dev/${tty##*/}"
    done
}

(( ${#PORTS[@]} )) || mapfile -t PORTS < <(find_ports)

# -----------------------
# Anything to do? (cheap check, touches no disk)
# MODE full: everything; fast: only the displays with fast refresh that are due, from the cache
# -----------------------
printf -v NOW '%(%s)T' -1
# WiFi displays: what they reported (changes only when a display appears or changes)
WIFI_SIG="$(cat "$WIFI_DIR"/*.info 2>/dev/null | cksum | cut -d' ' -f1)"
# (no trailing space: read strips it from the stamp file, the signature would never match)
SIGNATURE="$(stat -c %Y "$CONF_FILE" 2>/dev/null || echo 0) $WIFI_SIG ports:${PORTS[*]}"
MODE=full
declare -A FAST_SECS FAST_PORT FAST_LAST FAST_DUE

# Displays with fast refresh from the last full update; due ones get a frame now
read_fast_file() {
    local id secs port last
    [[ -r "$FAST_FILE" ]] || return
    while read -r id secs port last; do
        [[ "$id" =~ ^[0-9A-F]{8}$ && "$secs" =~ ^(2|5|10|30)$ && "$last" =~ ^[0-9]+$ ]] || continue
        [[ "$port" == "wifi" || "$port" =~ ^/dev/ttyACM[0-9]+$ ]] || continue
        FAST_SECS[$id]=$secs; FAST_PORT[$id]=$port; FAST_LAST[$id]=$last
        (( NOW - last >= secs )) && FAST_DUE[$id]=1
    done < "$FAST_FILE"
}

if [ "$FORCE" = false ] && [ "$DRY_RUN" = false ] && [[ ! -e "$REFRESH_FILE" && ! -e "$REDRAW_FILE" ]]; then
    last_run=0; last_sig=""
    [[ -r "$STAMP_FILE" ]] && read -r last_run last_sig < "$STAMP_FILE"
    [[ "$last_run" =~ ^[0-9]+$ ]] || last_run=0
    if [[ "$SIGNATURE" == "$last_sig" ]] && (( NOW - last_run < INTERVAL * 60 )); then
        read_fast_file
        (( ${#FAST_DUE[@]} )) || exit 0
        [[ -O "$CACHE_FILE" ]] || exit 0
        MODE=fast
    fi
fi
if [ "$MODE" = full ]; then
    [ "$DRY_RUN" = false ] && rm -f "$REFRESH_FILE"
    read_fast_file   # keeps the last frame times
fi

# Displays to redraw right away ("Redraw now" on the web page): one chip ID per line.
# Taken over by renaming first, so a click during this run is kept for the next one.
declare -A REDRAW
if [ "$MODE" = full ] && [ "$DRY_RUN" = false ] && mv -f "$REDRAW_FILE" "$REDRAW_FILE.$$" 2>/dev/null; then
    while read -r rid; do
        rid="${rid%$'\r'}"
        [[ "$rid" =~ ^[0-9A-F]{8}$ ]] && REDRAW[$rid]=1
    done < <(head -n 32 "$REDRAW_FILE.$$")
    rm -f "$REDRAW_FILE.$$"
fi

# -----------------------
# Display settings (written by the web page; parsed strictly, never executed)
# Line format (TAB separated, "-" = empty):
#   <id> <types> <boxes> <rows> <sort> <order> <warn> <rot> <page> <pins> <title>
#   <style> <hidden> <name> <ssid> <password> <host> <server> <ap> <ap ssid> <ap password> <ap delay>
#   <fast> <system> <network> <zfs> <pages> <system icons> <header> <panel> <wifi icons> <layout> <header on>
#   <net sort> <net order> <net hidden> <net icons> <net bar> <drive temps> <stby> <header inverted>
#   types : hdd,ssd,nvme; - = none
#   boxes : 0 = timer off, else on | rows : 0 = auto, 2 to 6 | sort : pool, uid, dev or manual
#   order : uid,uid,... | warn : highlight from % used, 0 = never | rot : 0, 90, 180 or 270
#   page  : seconds between automatic page turns, 0 = off
#   pins  : cs,dc,rst,busy (pin numbers of the board, rst/busy -1 = none) or - = keep the pins of the display
#   style : timer,ring direction,symbols,details in the bar[,capacity instead of percentage[,decimals
#           of the percentage 0-2]] (e.g. 1,0,1,1,0,1)
#   hidden : uid,uid,... not shown
#   name  : display name on the web page (not used here)
#   ssid ... ap delay : WiFi settings for boards with WiFi, texts hex encoded (sent over USB only)
#   fast  : seconds between fast refreshes (0, 2, 5, 10, 30)
#   system: system page components cpu,ram,net,nvme,ssd,hdd; - = no system page (1 = all of an earlier version, without hdd)
#   network : interface for the system page, - = the one with the default route
#   zfs   : ZFS cache on the system page 1 = shown / 0 = hidden (counted as free)
#   pages : pages switched on: system,disks,network,wifi (the settings of a page stay when it is off)
#   system icons : symbols on the system page 1 = on / 0 = off
#   header : 1 = the layout shows the uptime (written by the web page; earlier version: 1 = uptime
#            instead of the page number, used when the layout is missing)
#   panel : panel type 1-5 (1 GDEW0213Z16, 2 GDEH0213Z19, 3 GDEY0213Z98, 4 GDEY0213B74, 5 GDEY042T81)
#           or - = keep the panel type of the display
#   layout: header left, middle, right: T title, P page number, U uptime, C time, - nothing (default TCP);
#           lower case = that place highlighted; each of T, P, U, C at most once
#   header on : 1 = header line shown (default), 0 = off (the layout stays)
#   net sort : order of the network pages, name (default) or manual | net order : name,name,... first
#   net hidden : name,name,... not shown | net icons : 1 = symbols (default) / 0 = off
#   net bar : details in the bar 0 = none (default) / 1 = percentage of the link / 2 = link speed
#   drive temps : 1 = temperatures on the drive pages, 0 = off (default)
#   stby : asleep hard disks show 1 = "STBY" / 0 = "--" (default)
#   header inverted : 1 = white header with black text, 0 = black with white text (default)
# -----------------------
declare -A CFG_TYPES CFG_BOXES CFG_ROWS CFG_SORT CFG_ORDER CFG_WARN CFG_ROT CFG_PAGE CFG_PINS CFG_NAME CFG_STYLE CFG_HIDDEN CFG_WIFI CFG_FAST CFG_SYS CFG_NET CFG_ZFS CFG_PAGES CFG_SYSICONS CFG_HEADER CFG_PANEL CFG_LAYOUT CFG_NETP CFG_DRIVETEMP CFG_STBY CFG_HEADINV
IFLIST_RE='^[A-Za-z0-9._-]{1,15}(,[A-Za-z0-9._-]{1,15}){0,31}$'
NAME_RE='^[A-Za-z0-9 ._+/-]{0,12}$'
ORDER_RE='^[A-Za-z0-9._-]{1,40}(,[A-Za-z0-9._-]{1,40}){0,31}$'
HEX_RE='^(-|([0-9a-f]{2}){1,128})$'
IFACE_RE='^[A-Za-z0-9._-]{1,15}$'

# cs,dc,rst,busy: different pin numbers 0..48; rst and busy may be -1 (not connected).
# The board itself only takes pins it allows (and keeps its old ones otherwise).
pins_valid() {
    local -a p
    local i j
    [[ "$1" =~ ^[0-9]{1,2},[0-9]{1,2},(-1|[0-9]{1,2}),(-1|[0-9]{1,2})$ ]] || return 1
    IFS=, read -ra p <<< "$1"
    for i in 0 1 2 3; do
        (( p[i] == -1 )) && continue
        (( p[i] > 48 )) && return 1
        for (( j = 0; j < i; j++ )); do (( p[i] == p[j] )) && return 1; done
    done
    return 0
}

# Header layout: three of T (title), P (page number), U (uptime), C (time), - (nothing); lower case =
# that place highlighted; T, P, U, C each at most once
layout_valid() {
    local s="${1^^}" c rest
    [[ "$1" =~ ^[TPUCtpuc-]{3}$ ]] || return 1
    for c in T P U C; do
        rest="${s/$c/}"
        [[ "$rest" == *"$c"* ]] && return 1
    done
    return 0
}

if [[ -r "$CONF_FILE" ]]; then
    while IFS=$'\t' read -r id types boxes rows sortm order warn rot pagesec pins name style hidden _dname wssid wpass whost wserver wap wapssid wappass wapdelay fastc sysc netc zfsc pagesc sysiconc headerc panelc _wifiiconc layoutc headonc nsortc norderc nhidec niconc nbarc dtempc stbyc headinvc; do
        name="${name%$'\r'}"; wappass="${wappass%$'\r'}"; wapdelay="${wapdelay%$'\r'}"
        fastc="${fastc%$'\r'}"; sysc="${sysc%$'\r'}"; netc="${netc%$'\r'}"; zfsc="${zfsc%$'\r'}"; pagesc="${pagesc%$'\r'}"; sysiconc="${sysiconc%$'\r'}"; headerc="${headerc%$'\r'}"; panelc="${panelc%$'\r'}"
        layoutc="${layoutc%$'\r'}"; headonc="${headonc%$'\r'}"
        nsortc="${nsortc%$'\r'}"; norderc="${norderc%$'\r'}"; nhidec="${nhidec%$'\r'}"; niconc="${niconc%$'\r'}"
        nbarc="${nbarc%$'\r'}"; dtempc="${dtempc%$'\r'}"; stbyc="${stbyc%$'\r'}"; headinvc="${headinvc%%[$'\t\r']*}"   # last column: also cut anything after it
        [[ "$id" =~ ^[0-9A-F]{8}$ ]] || continue
        [[ "$name" == "-" ]] && name=""
        [[ "$sysc" == "1" ]] && sysc="cpu,ram,net,nvme,ssd"
        [[ "$sysc" =~ $SYS_PARTS_RE ]] || sysc=""
        if [[ "$types" == "-" ]]; then
            types=""   # no disk types (with nothing else switched on the display shows "Nothing to ink")
        else
            [[ "$types" =~ ^(hdd|ssd|nvme)(,(hdd|ssd|nvme))*$ ]] || types=$ALL_TYPES
        fi
        [[ "$boxes" =~ ^([0-9]|1[0-9]|20)$ ]] || boxes=$DEFAULT_BOXES   # 0 = spindown timer off
        [[ "$rows" =~ ^[0-6]$ ]] || rows=0
        [[ "$sortm" =~ ^(pool|uid|dev|manual)$ ]] || sortm=pool
        [[ "$order" =~ $ORDER_RE && "$order" != "-" ]] || order=""
        [[ "$warn" =~ ^([0-9]|[1-9][0-9]|100)$ ]] || warn=$DEFAULT_WARN
        [[ "$rot" =~ ^(0|90|180|270)$ ]] || rot=0
        [[ "$pagesec" =~ ^[0-9]{1,5}$ ]] && (( 10#$pagesec <= 86400 )) || pagesec=$DEFAULT_PAGE
        pins_valid "$pins" || pins=""
        [[ "$name" =~ $NAME_RE ]] || name=""
        [[ "$style" =~ ^[01],[01],[01],[01](,[01](,[012])?)?$ ]] || style="0,0,1,0"
        [[ "$hidden" =~ $ORDER_RE && "$hidden" != "-" ]] || hidden=""
        [[ "$fastc" =~ ^(0|2|5|10|30)$ ]] || fastc=0
        [[ "$zfsc" == "0" ]] || zfsc=1
        [[ "$sysiconc" == "0" ]] || sysiconc=1
        [[ "$headerc" == "1" ]] || headerc=0
        [[ "$panelc" =~ ^[1-5]$ ]] || panelc=""   # - = keep the panel type of the display
        # header: missing layout (earlier version) = title, time, then the page number or the uptime;
        # switched off = no header line ("---"); the uptime is sent when the layout shows it
        if ! layout_valid "$layoutc"; then [[ "$headerc" == 1 ]] && layoutc=TCU || layoutc=TCP; fi
        [[ "$headonc" == "0" ]] && layoutc="---"
        [[ "${layoutc^^}" == *U* ]] && headerc=1 || headerc=0
        [[ "$pagesc" =~ ^(system|disks|network|wifi)(,(system|disks|network|wifi)){0,3}$ ]] || pagesc="system,disks"   # missing = both
        # network pages: sort, order, hidden interfaces, symbols, details in the bar
        [[ "$nsortc" == manual ]] || nsortc=name
        [[ "$norderc" =~ $IFLIST_RE ]] || norderc=""
        [[ "$nhidec" =~ $IFLIST_RE ]] || nhidec=""
        [[ "$niconc" == 0 ]] || niconc=1
        [[ "$nbarc" =~ ^[012]$ ]] || nbarc=0
        [[ "$dtempc" == 1 ]] || dtempc=0   # temperatures on the drive pages
        [[ "$stbyc" == 1 ]] || stbyc=0     # asleep hard disks: 1 "STBY", 0 "--"
        [[ "$headinvc" == 1 ]] || headinvc=0   # header inverted: white with black text
        [[ "$netc" =~ $IFACE_RE && "$netc" != "-" ]] || netc=""
        # WiFi: all hex (or "-"), ap 0/1, ap delay 0-3600 s; only kept when complete and a network is set
        [[ -z "$wapdelay" ]] && wapdelay=30   # lines written before this column existed
        CFG_WIFI[$id]=""
        if [[ "$wssid" =~ $HEX_RE && "$wssid" != "-" && "$wpass" =~ $HEX_RE && "$whost" =~ $HEX_RE && "$wserver" =~ $HEX_RE \
              && "$wap" =~ ^[01]$ && "$wapssid" =~ $HEX_RE && "$wappass" =~ $HEX_RE \
              && "$wapdelay" =~ ^[0-9]{1,4}$ ]] && (( 10#$wapdelay <= 3600 )); then
            CFG_WIFI[$id]="W|$wssid|$wpass|$whost|$wserver|$wap|$wapssid|$wappass|$((10#$wapdelay))"
        fi
        CFG_STYLE[$id]=$style
        CFG_HIDDEN[$id]=$hidden
        CFG_TYPES[$id]=$types
        CFG_BOXES[$id]=$boxes
        CFG_ROWS[$id]=$rows
        CFG_SORT[$id]=$sortm
        CFG_ORDER[$id]=$order
        CFG_WARN[$id]=$warn
        CFG_ROT[$id]=$rot
        CFG_PAGE[$id]=$((10#$pagesec))
        CFG_PINS[$id]=$pins
        CFG_NAME[$id]=$name
        CFG_FAST[$id]=$fastc
        CFG_SYS[$id]=$sysc
        CFG_NET[$id]=$netc
        CFG_ZFS[$id]=$zfsc
        CFG_PAGES[$id]=$pagesc
        CFG_SYSICONS[$id]=$sysiconc
        CFG_HEADER[$id]=$headerc
        CFG_PANEL[$id]=$panelc
        CFG_LAYOUT[$id]=$layoutc
        CFG_NETP[$id]="$nsortc;$norderc;$nhidec;$niconc;$nbarc"
        CFG_DRIVETEMP[$id]=$dtempc
        CFG_STBY[$id]=$stbyc
        CFG_HEADINV[$id]=$headinvc
    done < "$CONF_FILE"
fi

# -----------------------
# Spindown status (written by truenas-sata-sas-spindown-timer.sh)
# Line format: <disk> <ACTIVE|STANDBY> <idle_s> <timeout_s> <poll_s> <updated_epoch>
# -----------------------
declare -A SD_STATE SD_IDLE SD_TMO SD_POLL SD_TS

if [[ -r "$STATUS_FILE" ]]; then
    while read -r d st idle tmo poll ts _; do
        [[ -z "$d" || "$d" == \#* ]] && continue
        SD_STATE[$d]=$st
        SD_IDLE[$d]=$idle
        SD_TMO[$d]=$tmo
        SD_POLL[$d]=$poll
        SD_TS[$d]=$ts
    done < "$STATUS_FILE"
fi

declare -A DEV_POOL POOL_USED POOL_TOTAL D_UID UID_DEV
declare -A D_TYPE D_POOL D_USEDB D_TOTALB D_USEDH D_TOTALH D_PCT D_SIZE D_ST D_IDLE D_TMO D_POLL D_STALE
DISKS=(); POOL_ORDER=(); UID_ORDER=()

if [ "$MODE" = fast ]; then
    # Disks, pools and host name of the last full update (written by this script as root)
    # shellcheck disable=SC1090
    source "$CACHE_FILE" || exit 1
else
    HOST="$(hostname -s | cut -c1-12)"

    # -----------------------
    # ZFS pools: disk -> pool, pool used/total (usable capacity, as NAS web interfaces show it)
    # -----------------------
    if command -v zpool >/dev/null 2>&1; then
        while read -r pool; do
            [[ -z "$pool" ]] && continue

            used=""; avail=""
            read -r used avail < <(zfs list -Hp -o used,avail "$pool" 2>/dev/null)
            if [[ "$used" =~ ^[0-9]+$ && "$avail" =~ ^[0-9]+$ ]]; then
                POOL_USED[$pool]=$used
                POOL_TOTAL[$pool]=$(( used + avail ))
            fi

            while read -r tok _; do
                [[ "$tok" =~ ^/dev/ ]] || continue
                base="$(to_base_disk "$tok")"
                [[ -n "$base" ]] && DEV_POOL[$base]=$pool
            done < <(zpool status -P "$pool" 2>/dev/null)
        done < <(zpool list -H -o name 2>/dev/null)
    fi

    # -----------------------
    # Disks. Orders never use sda/sdb (those can swap after a reboot):
    #   POOL_ORDER : by pool name, then UID; disks without pool last
    #   UID_ORDER  : by UID (serial number)
    # -----------------------
    mapfile -t ALL_DISKS < <(lsblk -dn -o NAME,TYPE 2>/dev/null | awk '$2 == "disk" && $1 ~ /^(sd|nvme)/ { print $1 }')

    for d in "${ALL_DISKS[@]}"; do
        (( ${#EXCLUDE[@]} )) && in_list "$d" "${EXCLUDE[@]}" && continue
        DISKS+=("$d")
        D_UID[$d]=$(disk_uid "$d")
        UID_DEV[${D_UID[$d]}]=$d
    done

    # -----------------------
    # Disks outside ZFS (any Linux: ext4, XFS, btrfs, ..., also on RAID or LVM): the biggest
    # filesystem mounted on the disk or on what is built on it. Its usage comes from statfs (df),
    # which the kernel answers from memory without touching the disk. Name: the last part of the
    # mount point ("/" = root). Disks of one RAID share one filesystem and so one bar, like a pool.
    # -----------------------
    declare -A FS_OF_MP
    NL_ESC='\x0a'   # lsblk -r between two mount points (taken literally in the replacement below)
    for d in "${DISKS[@]}"; do
        [[ -n "${DEV_POOL[$d]:-}" ]] && continue
        best=""; bestsize=0; bestused=0
        while read -r _ mps; do
            # all mount points of this device (lsblk -r writes \x0a between them and \x20 for a space);
            # the shortest one names it ("/" = root)
            mp=""
            while IFS= read -r m; do
                [[ "$m" == /* ]] || continue                   # [SWAP] or nothing
                [[ -z "$mp" || ${#m} -lt ${#mp} ]] && mp="$m"
            done < <(printf '%b\n' "${mps//"$NL_ESC"/$'\n'}")
            [[ -n "$mp" ]] || continue
            used=""; avail=""
            read -r used avail < <(df -P -B1 -- "$mp" 2>/dev/null | awk 'NR == 2 { print $3, $4 }')
            [[ "$used" =~ ^[0-9]+$ && "$avail" =~ ^[0-9]+$ ]] || continue
            if (( used + avail > bestsize )); then best="$mp"; bestsize=$(( used + avail )); bestused=$used; fi
        done < <(lsblk -rno NAME,MOUNTPOINTS "/dev/$d" 2>/dev/null || lsblk -rno NAME,MOUNTPOINT "/dev/$d" 2>/dev/null)
        [[ -n "$best" ]] || continue
        if [[ -z "${FS_OF_MP[$best]:-}" ]]; then
            name="${best##*/}"; [[ "$best" == "/" ]] && name="root"
            name="$(tr -cd 'A-Za-z0-9._-' <<< "$name" | cut -c1-15)"; name="${name:-fs}"
            [[ -n "${POOL_TOTAL[$name]:-}" ]] && name="${name:0:12}-fs"   # a ZFS pool with the same name
            FS_OF_MP[$best]=$name
            POOL_USED[$name]=$bestused
            POOL_TOTAL[$name]=$bestsize
        fi
        DEV_POOL[$d]=${FS_OF_MP[$best]}
    done

    # btrfs over several disks: Linux names the mount point at one of them only; the others get
    # the same name and bar (members from /sys/fs/btrfs/<uuid>/devices)
    for fsdir in /sys/fs/btrfs/*/devices; do
        [[ -d "$fsdir" ]] || continue
        members=(); name=""
        for dev in "$fsdir"/*; do
            [[ -e "$dev" ]] || continue
            real="$(readlink -f "$dev")"                    # .../block/sdb/sdb1 or .../block/sdb
            [[ -e "$real/partition" ]] && real="${real%/*}"   # a partition: its disk
            base="${real##*/}"
            members+=("$base")
            [[ -z "$name" && -n "${DEV_POOL[$base]:-}" ]] && name="${DEV_POOL[$base]}"
        done
        [[ -n "$name" ]] || continue
        for base in "${members[@]}"; do
            [[ -z "${DEV_POOL[$base]:-}" ]] && in_list "$base" "${DISKS[@]}" && DEV_POOL[$base]=$name
        done
    done

    mapfile -t POOL_ORDER < <(
        for d in "${DISKS[@]}"; do
            p="${DEV_POOL[$d]:-}"
            if [[ -n "$p" ]]; then printf '0\t%s\t%s\t%s\n' "$p" "${D_UID[$d]}" "$d"; else printf '1\t~\t%s\t%s\n' "${D_UID[$d]}" "$d"; fi
        done | LC_ALL=C sort -t $'\t' -k1,1 -k2,2 -k3,3 | cut -f4
    )
    mapfile -t UID_ORDER < <(
        for d in "${DISKS[@]}"; do printf '%s\t%s\n' "${D_UID[$d]}" "$d"; done | LC_ALL=C sort -t $'\t' -k1,1 | cut -f2
    )

    for d in "${POOL_ORDER[@]}"; do
        D_TYPE[$d]=$(disk_type "$d")
        pool="${DEV_POOL[$d]:-}"
        D_POOL[$d]="${pool:--}"
        D_USEDB[$d]=0; D_TOTALB[$d]=0; D_USEDH[$d]="-"; D_TOTALH[$d]="-"; D_PCT[$d]=-1
        # nothing mounted: the size of the disk instead (sysfs, 512-byte sectors)
        sectors=""; { read -r sectors < "/sys/block/$d/size"; } 2>/dev/null
        D_SIZE[$d]=0
        [[ "$sectors" =~ ^[0-9]+$ ]] && (( sectors > 0 )) && { D_SIZE[$d]=$(( sectors * 512 )); D_TOTALH[$d]=$(hsize "${D_SIZE[$d]}"); }
        if [[ -n "$pool" && "${POOL_TOTAL[$pool]:-0}" -gt 0 ]]; then
            D_USEDB[$d]=${POOL_USED[$pool]}
            D_TOTALB[$d]=${POOL_TOTAL[$pool]}
            D_USEDH[$d]=$(hsize "${POOL_USED[$pool]}")
            D_TOTALH[$d]=$(hsize "${POOL_TOTAL[$pool]}")
            D_PCT[$d]=$(( ${POOL_USED[$pool]} * 100 / ${POOL_TOTAL[$pool]} ))
        fi
    done

    if [ "$DRY_RUN" = false ]; then
        tmp="$(mktemp "$RUN_DIR/.cache.XXXXXX")" && {
            declare -p HOST DISKS POOL_ORDER UID_ORDER D_UID UID_DEV D_TYPE D_POOL D_USEDB D_TOTALB D_USEDH D_TOTALH D_PCT D_SIZE > "$tmp"
            chmod 600 "$tmp"
            mv -f "$tmp" "$CACHE_FILE"
        }
    fi
fi

# Spindown state of a disk: A (spinning), S (standby), N (SSD/NVMe), ? (no status at all).
# D_STALE=1: the status is too old (spindown timer not running); A / S is then the last known state.
spin_raw() {
    local d="$1" st idle tmo poll ts
    D_ST[$d]="?"; D_IDLE[$d]=0; D_TMO[$d]=0; D_POLL[$d]=0; D_STALE[$d]=0

    if [[ "${D_TYPE[$d]}" != "hdd" ]]; then
        D_ST[$d]="N"
        return
    fi

    st="${SD_STATE[$d]:-}"; idle="${SD_IDLE[$d]:-}"; tmo="${SD_TMO[$d]:-}"
    poll="${SD_POLL[$d]:-}"; ts="${SD_TS[$d]:-}"
    [[ -n "$st" && "$idle" =~ ^[0-9]+$ && "$tmo" =~ ^[1-9][0-9]*$ \
        && "$poll" =~ ^[1-9][0-9]*$ && "$ts" =~ ^[0-9]+$ ]] || return

    # Status file too old -> spindown script is not running; keep the last known state
    (( NOW - ts > 2 * poll + 120 )) && D_STALE[$d]=1

    D_IDLE[$d]=$idle; D_TMO[$d]=$tmo; D_POLL[$d]=$poll
    [[ "$st" == "STANDBY" ]] && D_ST[$d]="S" || D_ST[$d]="A"
}

for d in "${POOL_ORDER[@]}"; do spin_raw "$d"; done

# -----------------------
# System values for the system page, only from /proc and /sys (never the disks):
#   CPU load (/proc/stat), CPU temperature (hwmon: coretemp, k10temp, zenpower or an ARM
#   cpu thermal zone), CPU package power (RAPL energy counter), RAM (/proc/meminfo; the ZFS
#   cache from arcstats is shown apart, it is not used by programs), network (bytes per
#   interface; containers' and VMs' virtual interfaces left out), NVMe temperatures (kernel
#   hwmon of the NVMe driver) and SSD temperatures (smartctl, see ssd_temp; only when a display
#   shows them); temperatures at most every TEMPS_EVERY seconds.
# Load, power and network rates are the difference to the previous reading ($COUNTERS_FILE).
# -1 = unknown.
# -----------------------
SYS_CPU=-1; SYS_TEMP=-1; SYS_POWER=-1; SYS_RAMU=-1; SYS_ARC=-1; SYS_RAMT=-1; DEF_IF=""
IF_NAMES=()
declare -A IF_RX IF_TX IF_SPEED IF_WIFI IF_STATE D_TEMP

num_ok() { [[ "$1" =~ ^[0-9]{1,19}$ ]]; }

cpu_temp() {
    local h name f lab best t z
    for h in /sys/class/hwmon/hwmon*; do
        name=""
        { read -r name < "$h/name"; } 2>/dev/null
        case "$name" in coretemp|k10temp|zenpower|cpu_thermal|cpu-thermal|soc_thermal|soc-thermal) ;; *) continue ;; esac
        best=""
        for f in "$h"/temp*_label; do
            [[ -r "$f" ]] || continue
            lab=""
            { read -r lab < "$f"; } 2>/dev/null
            case "$lab" in
                "Package id 0"|Tdie) best="${f%_label}_input"; break ;;
                Tctl) best="${f%_label}_input" ;;   # keep looking for Tdie (Tctl may have an offset)
            esac
        done
        [[ -z "$best" ]] && best="$h/temp1_input"
        t=""
        { read -r t < "$best"; } 2>/dev/null
        [[ "$t" =~ ^[0-9]{1,6}$ ]] && { SYS_TEMP=$(( (t + 500) / 1000 )); return; }
    done
    for z in /sys/class/thermal/thermal_zone*; do
        name=""
        { read -r name < "$z/type"; } 2>/dev/null
        case "$name" in x86_pkg_temp|cpu_thermal|cpu-thermal|soc_thermal|soc-thermal) ;; *) continue ;; esac
        t=""
        { read -r t < "$z/temp"; } 2>/dev/null
        [[ "$t" =~ ^[0-9]{1,6}$ ]] && { SYS_TEMP=$(( (t + 500) / 1000 )); return; }
    done
}

# SATA / SAS SSD temperature (°C) from smartctl. Only for drives the kernel reports as
# non-rotational (checked right here), and with -n standby: a drive that reports standby is not
# asked at all. Hard disks are never queried.
ssd_temp() {
    local d="$1" rot="" line t="" air=""
    local -a w
    { read -r rot < "/sys/block/$d/queue/rotational"; } 2>/dev/null
    [[ "$rot" == 0 ]] || return 1
    while read -r line; do
        read -ra w <<< "$line"
        case "$line" in
            *Temperature_Celsius*) [[ "${w[9]}" =~ ^[0-9]{1,3}$ ]] && t=${w[9]} ;;
            *Airflow_Temperature_Cel*) [[ "${w[9]}" =~ ^[0-9]{1,3}$ ]] && air=${w[9]} ;;
            "Current Drive Temperature:"*) [[ "${w[3]}" =~ ^[0-9]{1,3}$ ]] && t=${w[3]} ;;   # SAS
        esac
    done < <(timeout 10 smartctl -A -n standby "/dev/$d" 2>/dev/null)
    t=${t:-$air}
    [[ -n "$t" ]] && echo "$t"
}

# NVMe and SSD temperatures -> D_TEMP (-1 = unknown); SSDs only when a display shows them
# (its system page SSD row, or temperatures on its drive pages)
drive_temps() {
    local ts=0 d t f line want_ssd=""
    for d in "${CFG_SYS[@]}"; do [[ ",$d," == *",ssd,"* ]] && want_ssd=1; done
    for d in "${CFG_DRIVETEMP[@]}"; do [[ "$d" == 1 ]] && want_ssd=1; done
    if [[ -r "$TEMPS_FILE" ]]; then
        { read -r ts; while read -r d t; do [[ "$d" =~ ^(nvme[0-9a-z]+|sd[a-z]+)$ && "$t" =~ ^-?[0-9]{1,3}$ ]] && D_TEMP[$d]=$t; done; } < "$TEMPS_FILE"
    fi
    [[ "$ts" =~ ^[0-9]+$ ]] || ts=0
    (( NOW - ts < TEMPS_EVERY )) && return
    D_TEMP=()
    line="$NOW"$'\n'
    for d in "${DISKS[@]}"; do
        if [[ "${D_TYPE[$d]}" == nvme ]]; then
            D_TEMP[$d]=-1
            for f in /sys/block/"$d"/device/hwmon*/temp1_input; do
                t=""
                { read -r t < "$f"; } 2>/dev/null
                [[ "$t" =~ ^-?[0-9]{1,6}$ ]] && { D_TEMP[$d]=$(( (t + 500) / 1000 )); break; }
            done
        elif [[ "${D_TYPE[$d]}" == ssd && -n "$want_ssd" ]] && command -v smartctl >/dev/null 2>&1; then
            t="$(ssd_temp "$d")"
            D_TEMP[$d]=${t:--1}
        else
            continue
        fi
        line+="$d ${D_TEMP[$d]}"$'\n'
    done
    [ "$DRY_RUN" = false ] && printf '%s' "$line" > "$TEMPS_FILE.$$" && mv -f "$TEMPS_FILE.$$" "$TEMPS_FILE"
}

# HDD temperatures -> D_TEMP from the status file of drive-temp-export (see DRIVE_TEMP_STATUS),
# lines like "ACTIVE    HDD   8TB  SERIAL  38.0 C  /dev/sda  MODEL": asleep (STANDBY, or asleep
# for the spindown timer) = -2 ("--" or "STBY"), not listed = -1 ("--"). HDD_TEMPS_OK=1: the
# file is there and fresh.
HDD_TEMPS_OK=0
hdd_temps() {
    local mt line d
    [[ -r "$DRIVE_TEMP_STATUS" ]] || return 0
    mt=$(stat -c %Y "$DRIVE_TEMP_STATUS" 2>/dev/null) || return 0
    [[ "$mt" =~ ^[0-9]+$ ]] && (( NOW - mt <= HDD_TEMPS_STALE )) || return 0
    HDD_TEMPS_OK=1
    for d in "${DISKS[@]}"; do [[ "${D_TYPE[$d]}" == hdd ]] && D_TEMP[$d]=-1; done
    while read -r line; do
        if [[ "$line" =~ ^ACTIVE\ .*\ ([0-9]{1,3})(\.[0-9]+)?\ C\ +/dev/(sd[a-z]{1,3})(\ |$) ]]; then
            d=${BASH_REMATCH[3]}
            [[ "${D_TYPE[$d]:-}" == hdd ]] && D_TEMP[$d]=$((10#${BASH_REMATCH[1]}))
        elif [[ "$line" =~ ^STANDBY\ .*\ /dev/(sd[a-z]{1,3})(\ |$) ]]; then
            d=${BASH_REMATCH[1]}
            [[ "${D_TYPE[$d]:-}" == hdd ]] && D_TEMP[$d]=-2
        fi
    done < <(head -n 64 "$DRIVE_TEMP_STATUS" 2>/dev/null)
    for d in "${DISKS[@]}"; do [[ "${D_TYPE[$d]}" == hdd && "${D_ST[$d]:-}" == S ]] && D_TEMP[$d]=-2; done   # asleep for the spindown timer
    return 0
}

read_system() {
    local now_us=${EPOCHREALTIME//[!0-9]/} k a b c rest dt
    [[ "$now_us" =~ ^[0-9]{16,}$ ]] || now_us=$(( NOW * 1000000 ))   # bash before 5.0: whole seconds
    local prev_t=0 prev_total=0 prev_idle=0 prev_e=0 pname="" e="" max=0 cur_e=0
    local -A prev_rx prev_tx
    if [[ -r "$COUNTERS_FILE" ]]; then
        while read -r k a b c; do
            case "$k" in
                t)    num_ok "$a" && prev_t=$a ;;
                cpu)  num_ok "$a" && num_ok "$b" && { prev_total=$a; prev_idle=$b; } ;;
                rapl) num_ok "$a" && prev_e=$a ;;
                if)   [[ "$a" =~ $IFACE_RE ]] && num_ok "$b" && num_ok "$c" && { prev_rx[$a]=$b; prev_tx[$a]=$c; } ;;
            esac
        done < "$COUNTERS_FILE"
    fi
    dt=$(( now_us - prev_t ))
    (( prev_t > 0 && dt >= 200000 )) || dt=0   # too close to the last reading: no rates this time
    local new="t $now_us"$'\n'

    # CPU load
    local cu=0 cn=0 cs=0 ci=0 cw=0 cq=0 csq=0 cst=0 total idle
    read -r k cu cn cs ci cw cq csq cst rest < /proc/stat
    if [[ "$k" == cpu ]] && num_ok "$cu" && num_ok "$cn" && num_ok "$cs" && num_ok "$ci" && num_ok "${cw:-0}" \
          && num_ok "${cq:-0}" && num_ok "${csq:-0}" && num_ok "${cst:-0}"; then
        total=$(( cu + cn + cs + ci + ${cw:-0} + ${cq:-0} + ${csq:-0} + ${cst:-0} )); idle=$(( ci + ${cw:-0} ))
        if (( dt > 0 && total > prev_total && idle >= prev_idle )); then
            SYS_CPU=$(( ( (total - prev_total) - (idle - prev_idle) ) * 100 / (total - prev_total) ))
            (( SYS_CPU < 0 )) && SYS_CPU=0
            (( SYS_CPU > 100 )) && SYS_CPU=100
        fi
        new+="cpu $total $idle"$'\n'
    fi

    # RAM (MiB): used by programs = total - available - ZFS cache
    local mt="" ma="" arc=0
    while read -r k a rest; do
        case "$k" in MemTotal:) mt=$a ;; MemAvailable:) ma=$a ;; esac
    done < /proc/meminfo
    if [[ -r /proc/spl/kstat/zfs/arcstats ]]; then
        while read -r k a b; do [[ "$k" == size ]] && { num_ok "$b" && arc=$b; break; }; done < /proc/spl/kstat/zfs/arcstats
    fi
    if num_ok "$mt" && num_ok "$ma" && (( mt > 0 )); then
        SYS_RAMT=$(( mt / 1024 ))
        SYS_ARC=$(( arc / 1048576 ))
        SYS_RAMU=$(( (mt - ma) / 1024 - SYS_ARC ))
        (( SYS_RAMU < 0 )) && SYS_RAMU=$(( (mt - ma) / 1024 ))   # the cache was counted as available
    fi

    cpu_temp

    # CPU package power (W) from the RAPL energy counter (µJ); the counter wraps at max_energy_range_uj
    local rapl=/sys/class/powercap/intel-rapl:0
    { read -r pname < "$rapl/name" && read -r e < "$rapl/energy_uj" && read -r max < "$rapl/max_energy_range_uj"; } 2>/dev/null
    if [[ "$pname" == package* ]] && num_ok "$e" && num_ok "$max"; then
        if (( dt > 0 && prev_e > 0 )); then
            local de=$(( e - prev_e ))
            (( de < 0 )) && de=$(( de + max ))
            (( de >= 0 )) && SYS_POWER=$(( (de + dt / 2) / dt ))   # µJ per µs = W
        fi
        new+="rapl $e"$'\n'
    fi

    # Network: bytes per interface -> KiB/s; link speed in Mb/s (-1 = none, e.g. bridges)
    local p n rxb txb sp pr pt
    for p in /sys/class/net/*; do
        n=${p##*/}
        case "$n" in lo|veth*|docker*|br-*|vnet*|tap*|kube*|cni*|flannel*|virbr*) continue ;; esac
        [[ "$n" =~ $IFACE_RE ]] || continue
        rxb=""; txb=""
        { read -r rxb < "$p/statistics/rx_bytes"; read -r txb < "$p/statistics/tx_bytes"; } 2>/dev/null
        num_ok "$rxb" && num_ok "$txb" || continue
        sp=-1
        { read -r sp < "$p/speed"; } 2>/dev/null
        [[ "$sp" =~ ^[0-9]{1,7}$ ]] && (( sp > 0 )) || sp=-1
        IF_NAMES+=("$n"); IF_SPEED[$n]=$sp; IF_RX[$n]=-1; IF_TX[$n]=-1
        IF_WIFI[$n]=0   # wireless: the kernel gives it a wireless folder / phy80211 link
        [[ -d "$p/wireless" || -e "$p/phy80211" ]] && IF_WIFI[$n]=1
        # state: U up, L no link (no cable / not connected to a WiFi network), D down (switched off)
        local fl="" op="" ca=""
        { read -r fl < "$p/flags"; read -r op < "$p/operstate"; } 2>/dev/null
        { read -r ca < "$p/carrier"; } 2>/dev/null   # not readable while down
        if [[ "$fl" =~ ^0x[0-9a-fA-F]+$ ]] && (( (fl & 1) == 0 )); then IF_STATE[$n]=D
        elif [[ "$ca" == 0 || "$op" =~ ^(down|dormant|lowerlayerdown|notpresent)$ ]]; then IF_STATE[$n]=L
        else IF_STATE[$n]=U
        fi
        pr="${prev_rx[$n]:-}"; pt="${prev_tx[$n]:-}"
        if (( dt > 0 )) && [[ -n "$pr" && -n "$pt" ]] && (( rxb >= pr && txb >= pt )); then
            IF_RX[$n]=$(( (rxb - pr) * 1000000 / dt / 1024 ))
            IF_TX[$n]=$(( (txb - pt) * 1000000 / dt / 1024 ))
        fi
        new+="if $n $rxb $txb"$'\n'
    done
    # interface of the default route
    local dest gw flags rc use metric mask
    while read -r n dest gw flags rc use metric mask rest; do
        [[ "$dest" == 00000000 && "$mask" == 00000000 && "$n" =~ $IFACE_RE ]] && { DEF_IF=$n; break; }
    done < /proc/net/route
    [[ -n "$DEF_IF" && -n "${IF_SPEED[$DEF_IF]+x}" ]] || DEF_IF="${IF_NAMES[0]:-}"

    drive_temps
    hdd_temps

    if [ "$DRY_RUN" = false ]; then
        printf '%s' "$new" > "$COUNTERS_FILE.$$" && mv -f "$COUNTERS_FILE.$$" "$COUNTERS_FILE"
    fi
}

read_system

# Days in a month (year, month 1-12)
month_days() {
    case $2 in
        2) if (( $1 % 4 == 0 && ($1 % 100 != 0 || $1 % 400 == 0) )); then echo 29; else echo 28; fi ;;
        4|6|9|11) echo 30 ;;
        *) echo 31 ;;
    esac
}

# Uptime of the NAS server (header option), from /proc/uptime: UPTIME_MIN in minutes, split into
# full calendar months (UP_MONTHS, local time: a month after 31 Jan is 28/29 Feb, a month after
# 15 Mar is 15 Apr) and the minutes after them (UP_REST)
UPTIME_MIN="" UP_MONTHS=0 UP_REST=""
read_uptime() {
    local up_s now_s boot_s by bm bd bh bi bs ty tm n y m d when from
    { read -r up_s _ < /proc/uptime; } 2>/dev/null
    [[ "${up_s:-}" =~ ^[0-9]+ ]] || return 0
    up_s=${BASH_REMATCH[0]}
    UPTIME_MIN=$(( up_s / 60 ))
    UP_REST=$UPTIME_MIN
    (( UPTIME_MIN >= 28 * 1440 )) || return 0
    printf -v now_s '%(%s)T' -1
    boot_s=$(( now_s - up_s ))
    read -r by bm bd bh bi bs <<< "$(printf '%(%Y %m %d %H %M %S)T' "$boot_s")"
    read -r ty tm <<< "$(printf '%(%Y %m)T' "$now_s")"
    n=$(( (10#$ty - 10#$by) * 12 + 10#$tm - 10#$bm ))
    from=$boot_s
    while (( n > 0 )); do
        y=$(( 10#$by + (10#$bm - 1 + n) / 12 )) m=$(( (10#$bm - 1 + n) % 12 + 1 ))
        d=$(month_days "$y" "$m")
        (( 10#$bd < d )) && d=$(( 10#$bd ))
        printf -v when '%04d-%02d-%02d %s:%s:%s' "$y" "$m" "$d" "$bh" "$bi" "$bs"
        from=$(date -d "$when" +%s 2>/dev/null) && (( from <= now_s )) && break
        n=$(( n - 1 ))
        from=$boot_s
    done
    UP_MONTHS=$n
    UP_REST=$(( (now_s - from) / 60 ))
}
read_uptime

# state.system for the web page and system.json in $RUN_DIR
system_json() {
    local n sep="" out
    out="{\"uptime\": $(( ${UPTIME_MIN:-0} * 60 )), \"upMonths\": $UP_MONTHS, \"upRest\": ${UP_REST:--1}, \"cpu\": $SYS_CPU, \"temp\": $SYS_TEMP, \"power\": $SYS_POWER, \"ramUsed\": $SYS_RAMU, \"ramArc\": $SYS_ARC, \"ramTotal\": $SYS_RAMT, \"defaultIface\": $(json_str "$DEF_IF"), \"ifaces\": ["
    for n in "${IF_NAMES[@]}"; do
        out+="$sep{\"name\": $(json_str "$n"), \"rx\": ${IF_RX[$n]}, \"tx\": ${IF_TX[$n]}, \"speed\": ${IF_SPEED[$n]}, \"wireless\": ${IF_WIFI[$n]:-0}, \"state\": \"${IF_STATE[$n]:-U}\"}"
        sep=", "
    done
    out+="]"
    local kind
    for kind in nvme ssd hdd; do
        [[ "$kind" == hdd && "$HDD_TEMPS_OK" != 1 ]] && { out+=", \"hdd\": []"; continue; }   # without drive-temp-export: none
        out+=", \"$kind\": ["
        sep=""
        for n in "${DISKS[@]}"; do
            [[ "${D_TYPE[$n]}" == "$kind" && -n "${D_TEMP[$n]+x}" ]] || continue
            out+="$sep{\"dev\": $(json_str "$n"), \"temp\": ${D_TEMP[$n]}}"
            sep=", "
        done
        out+="]"
    done
    printf '%s}' "$out"
}
SYS_JSON="$(system_json)"
if [ "$DRY_RUN" = false ]; then
    printf '{"updated": %s, "system": %s}\n' "$NOW" "$SYS_JSON" > "$EXPORT_FILE.$$" && chmod 644 "$EXPORT_FILE.$$" && mv -f "$EXPORT_FILE.$$" "$EXPORT_FILE"
fi

# Temperatures of one drive type for the S line: at most 6, "-" = none
temps_of() {
    local kind="$1" d out="" sep="" k=0
    for d in "${DISKS[@]}"; do
        [[ "${D_TYPE[$d]}" == "$kind" && -n "${D_TEMP[$d]+x}" ]] || continue
        (( k++ < 6 )) || break
        out+="$sep${D_TEMP[$d]}"; sep=","
    done
    echo "${out:--}"
}

# S line for one display:
# system_line <components cpu,ram,...> <interface, "" = default route> <ZFS cache 1 shown / 0 hidden> <symbols 1 / 0>
system_line() {
    local parts=",$1," n="$2" arc=$SYS_ARC letters=""
    [[ "$parts" == *,cpu,* ]] && letters+=C
    [[ "$parts" == *,ram,* ]] && letters+=R
    [[ "$parts" == *,net,* ]] && letters+=N
    [[ "$parts" == *,nvme,* ]] && letters+=V
    [[ "$parts" == *,ssd,* ]] && letters+=S
    [[ "$parts" == *,hdd,* ]] && letters+=H   # HDD temperatures: in the T line after it
    [[ "${4:-1}" == 0 ]] || letters+=I   # symbols left of the rows
    [[ "${3:-1}" == 0 ]] && arc=-1   # hidden: the display shows no cache, it counts as free
    [[ -n "$n" && -n "${IF_SPEED[$n]+x}" ]] || n="$DEF_IF"
    [[ -n "$n" && "${IF_WIFI[$n]:-0}" == 1 ]] && letters+=W   # wireless: WiFi symbol instead of the network one
    [[ -n "$n" && "${IF_STATE[$n]:-U}" != U ]] && letters+=${IF_STATE[$n]}   # D down / L no link: shown instead of the bar
    if [[ -n "$n" ]]; then
        SYS_LINE="S|$letters|$SYS_CPU|$SYS_TEMP|$SYS_POWER|$SYS_RAMU|$arc|$SYS_RAMT|$n|${IF_RX[$n]}|${IF_TX[$n]}|${IF_SPEED[$n]}|$(temps_of nvme)|$(temps_of ssd)"
    else
        SYS_LINE="S|$letters|$SYS_CPU|$SYS_TEMP|$SYS_POWER|$SYS_RAMU|$arc|$SYS_RAMT|-|-1|-1|-1|$(temps_of nvme)|$(temps_of ssd)"
    fi
    # T line: HDD temperatures of the system page (own line, the S line must stay below 128 bytes);
    # only when drive-temp-export runs, -1 = asleep
    SYS_TLINE=""
    [[ "$parts" == *,hdd,* ]] && (( HDD_TEMPS_OK )) && SYS_TLINE="T|$(temps_of hdd)"
    return 0
}

# N lines of the network pages for one display, at most 8 (one per interface):
# net_lines <name|manual> <order name,name,...> <hidden name,name,...> -> NET_LINES
#   N|<interface>|<down KiB/s>|<up KiB/s>|<link Mb/s>|<wireless 1/0>|<state U up / L no link / D down>
# name: by name; manual: the listed interfaces first, in that order, then the others by name
NET_MAX=8
net_lines() {
    local sort="$1" hidden=",$3," n k=0
    local -a names list=()
    mapfile -t names < <(printf '%s\n' "${IF_NAMES[@]}" | LC_ALL=C sort)
    if [[ "$sort" == manual ]]; then
        local -a want
        IFS=, read -ra want <<< "$2"
        for n in "${want[@]}"; do [[ -n "${IF_SPEED[$n]+x}" && " ${list[*]} " != *" $n "* ]] && list+=("$n"); done
    fi
    for n in "${names[@]}"; do [[ -n "$n" && " ${list[*]} " != *" $n "* ]] && list+=("$n"); done
    NET_LINES=()
    for n in "${list[@]}"; do
        [[ "$hidden" == *",$n,"* ]] && continue
        (( k++ < NET_MAX )) || break
        NET_LINES+=("N|$n|${IF_RX[$n]}|${IF_TX[$n]}|${IF_SPEED[$n]}|${IF_WIFI[$n]:-0}|${IF_STATE[$n]:-U}")
    done
}

# -----------------------
# Disk order for one display: order_disks <pool|uid|dev|manual> <uid,uid,...> -> ORDERED
# dev: by device name, shorter names first (sda..sdz, sdaa.., nvme0n1); names can change after a reboot
# manual: the listed disks first, in that order, then all others by pool
# -----------------------
order_disks() {
    local mode="$1" u d
    local -a wanted
    local -A added
    ORDERED=()
    case "$mode" in
        uid)
            ORDERED=("${UID_ORDER[@]}")
            ;;
        dev)
            mapfile -t ORDERED < <(for d in "${DISKS[@]}"; do printf '%d\t%s\n' "${#d}" "$d"; done | LC_ALL=C sort -t $'\t' -k1,1n -k2,2 | cut -f2)
            ;;
        manual)
            IFS=, read -ra wanted <<< "$2"
            for u in "${wanted[@]}"; do
                d="${UID_DEV[$u]:-}"
                [[ -n "$d" && -z "${added[$d]:-}" ]] || continue
                ORDERED+=("$d")
                added[$d]=1
            done
            for d in "${POOL_ORDER[@]}"; do
                [[ -z "${added[$d]:-}" ]] && ORDERED+=("$d")
            done
            ;;
        *)
            ORDERED=("${POOL_ORDER[@]}")
            ;;
    esac
}

# -----------------------
# Frame for one display:
# build_frame <title> <types> <max boxes> <rows> <sort> <order> <warn> <rotation°> <page s> <pins[,panel]> <style> <hidden>
#             <fast s> <system page components, "" = none> <interface> <ZFS cache 1/0> <system symbols 1/0>
#             <header 1 uptime / 0 page number> <header layout, default TCP, --- = no header>
#             <network pages "sort;order;hidden;icons;bar", "" = off> -> FRAME
# style: timer,ring direction,symbols,percentage; sent with the fast refresh as H fields 8-12, only
# as far as they differ from the defaults (0,0,1,0,0). hidden: UIDs not shown on this display.
# -----------------------
build_frame() {
    local title="$1" types=",$2," maxb="$3" rows="$4" warn="$7" turns=$(( ${8:-0} / 90 )) pagesec="${9:-$DEFAULT_PAGE}"
    local pins="${10:-}" style="${11:-0,0,1,0}" hidden=",${12:-}," fast="${13:-0}" sysp="${14:-}" net="${15:-}" zfs="${16:-1}" sysicons="${17:-1}" header="${18:-0}" layout="${19:-TCP}" netp="${20:-}" dtemp="${21:-0}" stby="${22:-0}" headinv="${23:-0}"
    local d steps idle tmo poll st remain tsec head i dt pct pdec u t
    local -a sv defs=(0 0 1 0 0 -1 0 0 0 TCP 1 0 1 0 0 0)
    order_disks "$5" "$6"
    local hm
    printf -v hm '%(%H:%M)T' -1
    head="H|$title|$hm|$rows|$warn|$turns|$pagesec"
    IFS=, read -ra sv <<< "$style"
    # field 11: details in the bar 0 none / 1 percentage / 2 used capacity (style: details on, capacity)
    # percentage with decimals (style value 6, 0-2), only while the percentage stands in the bar
    pdec=0; (( sv[3] == 1 && ${sv[4]:-0} == 0 )) && pdec=${sv[5]:-0}
    (( sv[3] == 1 && ${sv[4]:-0} == 1 )) && sv[3]=2
    # field 15: WiFi page (not sent yet, 0 = off); field 16: seconds without a fresh frame before
    # the display shows "NO DATA"; field 17: header layout (left, middle, right); field 18: disk
    # pages 1 on / 0 off (no disk types: with nothing else the display shows "Nothing to ink")
    # fields 19 and 20: network pages, details in the bar 0 none / 1 percentage of the link / 2 link
    # speed, and symbols 1 on / 0 off; netp = "sort;order;hidden;icons;bar", "" = network pages off
    local -a np
    IFS=';' read -ra np <<< "$netp"
    sv=("${sv[@]:0:4}" "$fast" -1 0 0 "$NODATA_SECS" "$layout" "$([[ -n "$2" ]] && echo 1 || echo 0)" "${np[4]:-0}" "${np[3]:-1}" "$dtemp" "$stby" "$headinv")   # field 21: drive temperatures 1 on / 0 off, 22: asleep 1 "STBY" / 0 "--", 23: header inverted 1 / 0
    # header: uptime instead of the page number (minutes after the full months, months)
    [[ "$header" == 1 && "$UP_REST" =~ ^[0-9]+$ ]] && sv[5]=$UP_REST sv[6]=$UP_MONTHS
    local n=16
    while (( n > 0 )) && [[ "${sv[n-1]}" == "${defs[n-1]}" ]]; do n=$((n - 1)); done
    for (( i = 0; i < n; i++ )); do head+="|${sv[i]}"; done
    FRAME=("#BEGIN" "$head")
    for d in "${ORDERED[@]}"; do
        [[ "$types" == *",${D_TYPE[$d]},"* ]] || continue
        [[ "$hidden" == *",${D_UID[$d]},"* ]] && continue
        steps=0; idle=0; st="${D_ST[$d]}"; remain=-1; tsec=0
        if (( maxb == 0 )); then
            [[ "$st" == "N" ]] || st="-"   # timer off for this display; flash drives keep N (chip symbol)
        elif [[ "$st" == "A" || "$st" == "S" ]]; then
            tmo=${D_TMO[$d]}; poll=${D_POLL[$d]}
            steps=$(( (tmo + poll - 1) / poll ))
            (( steps > maxb )) && steps=$maxb
            idle=$(( ${D_IDLE[$d]} * steps / tmo ))
            (( idle > steps )) && idle=$steps
            # seconds until spindown and the timeout, for the MM:SS timer styles
            tsec=$tmo
            remain=0
            [[ "$st" == "A" ]] && remain=$(( tmo - ${D_IDLE[$d]} ))
            (( remain < 0 )) && remain=0
            (( ${D_STALE[$d]} )) && remain=-1   # timer not running: last known state, no time left
        fi
        dt=""
        if [[ "$dtemp" == 1 ]]; then   # with temperatures: °C, -1 = unknown, -2 = asleep (also without drive-temp-export)
            dt="|${D_TEMP[$d]:--1}"
            [[ "${D_TYPE[$d]}" == hdd && "${D_ST[$d]:-}" == S ]] && dt="|-2"
        fi
        pct=${D_PCT[$d]}
        if (( pdec > 0 && pct >= 0 && ${D_TOTALB[$d]:-0} > 0 )); then   # cut, not rounded, like the whole percent
            u=${D_USEDB[$d]}; t=${D_TOTALB[$d]}
            while (( u > 900000000000000 )); do u=$(( u / 1000 )); t=$(( t / 1000 )); done   # u * 10000 stays in 64 bits
            (( t > 0 )) && { u=$(( u * 10000 / t )); (( u > 10000 )) && u=10000
                if (( pdec == 1 )); then pct="$(( u / 100 )).$(( u / 10 % 10 ))"; else printf -v pct '%d.%02d' $(( u / 100 )) $(( u % 100 )); fi; }
        fi
        FRAME+=("D|$d|${D_POOL[$d]}|${D_USEDH[$d]}|${D_TOTALH[$d]}|$pct|$idle|$steps|$st|$remain|$tsec$dt")
    done
    if [[ -n "$sysp" ]]; then
        system_line "$sysp" "$net" "$zfs" "$sysicons"
        FRAME+=("$SYS_LINE")
        [[ -n "$SYS_TLINE" ]] && FRAME+=("$SYS_TLINE")
    fi
    if [[ -n "$netp" ]]; then   # network pages: one N line per interface shown
        net_lines "${np[0]:-name}" "${np[1]:-}" "${np[2]:-}"
        FRAME+=("${NET_LINES[@]}")
    fi
    # Pins (and panel type) only when set on the web page; new values make the board save them and restart
    [[ -n "$pins" ]] && FRAME+=("P|${pins//,/|}")
    FRAME+=("#END")
}

# Frame with the settings of display <id>; fastcap 1 = the panel can do fast refreshes;
# devpins = the pins the display reports (sent along when only the panel type is set)
frame_for() {
    local id="$1" fastcap="$2" devpins="${3:-}" title="${CFG_NAME[$1]:-}" fast=0 types="${CFG_TYPES[$1]-$ALL_TYPES}" sysp="${CFG_SYS[$1]:-}"
    local pages=",${CFG_PAGES[$1]:-system,disks},"
    # a display without settings yet: header and the system page with all components
    [[ -z "${CFG_PAGES[$1]+set}" ]] && sysp="cpu,ram,net,nvme,ssd,hdd" pages=",system,"
    local pins="${CFG_PINS[$1]:-}"
    (( fastcap )) && fast="${CFG_FAST[$id]:-0}"
    if [[ -n "${CFG_PANEL[$id]:-}" ]]; then   # panel type chosen: P line with it (pins kept if not set)
        [[ -z "$pins" ]] && pins_valid "$devpins" && pins=$devpins
        [[ -n "$pins" ]] && pins+=",${CFG_PANEL[$id]}"
    fi
    [[ "$pages" == *,disks,* ]] || types=""   # disk pages switched off
    [[ "$pages" == *,system,* ]] || sysp=""   # system page switched off
    local netp=""
    [[ "$pages" == *,network,* ]] && netp="${CFG_NETP[$id]:-name;;;1;0}"   # network pages switched on
    build_frame "${title:-$HOST}" "$types" "${CFG_BOXES[$id]:-$DEFAULT_BOXES}" "${CFG_ROWS[$id]:-0}" \
        "${CFG_SORT[$id]:-pool}" "${CFG_ORDER[$id]:-}" "${CFG_WARN[$id]:-$DEFAULT_WARN}" "${CFG_ROT[$id]:-0}" \
        "${CFG_PAGE[$id]:-$DEFAULT_PAGE}" "$pins" "${CFG_STYLE[$id]:-}" "${CFG_HIDDEN[$id]:-}" \
        "$fast" "$sysp" "${CFG_NET[$id]:-}" "${CFG_ZFS[$id]:-1}" "${CFG_SYSICONS[$id]:-1}" "${CFG_HEADER[$id]:-0}" \
        "${CFG_LAYOUT[$id]:-TCP}" "$netp" "${CFG_DRIVETEMP[$id]:-0}" "${CFG_STBY[$id]:-0}" "${CFG_HEADINV[$id]:-0}"
}

# Display with fast refresh: remember it (port or wifi) for the fast runs in between
note_fast() {
    local id="$1" fastcap="$2" port="$3" secs="${CFG_FAST[$1]:-0}"
    (( fastcap && secs > 0 )) || return
    FAST_SECS[$id]=$secs; FAST_PORT[$id]=$port; FAST_LAST[$id]=$NOW; FAST_SEEN[$id]=1
}
declare -A FAST_SEEN

# -----------------------
# Talk to one display: PING -> chip ID -> its frame -> "OK ..."
# -----------------------
DISPLAYS_JSON=()
declare -A USB_IDS

update_display() {
    local port="$1" line id="" size="" devpins="" colors="3" answer="" board="" wifi=0 fw="" netst="" ip="" fastcap=0 devpanel=0 ssidhex=""
    stty -F "$port" 115200 raw -echo -hupcl 2>/dev/null
    if ! exec 3<>"$port"; then
        log "$port: cannot open"
        DISPLAYS_JSON+=("{\"port\": $(json_str "$port"), \"id\": \"\", \"error\": \"Cannot open port\"}")
        return 1
    fi

    while read -r -t 0.2 line <&3; do :; done   # drop old output
    printf 'PING\n' >&3
    # A display that is just redrawing answers after up to ~20 s
    while read -r -t 25 line <&3; do
        line="${line%$'\r'}"
        if [[ "$line" =~ ^PONG\ InkSights\ id=([0-9A-F]{8})\ size=([0-9]+x[0-9]+) ]]; then
            id="${BASH_REMATCH[1]}"
            size="${BASH_REMATCH[2]}"
            [[ "$line" =~ \ pins=(-?[0-9]+,-?[0-9]+,-?[0-9]+,-?[0-9]+) ]] && devpins="${BASH_REMATCH[1]}"
            [[ "$line" =~ \ colors=([23]) ]] && colors="${BASH_REMATCH[1]}"   # 2 = black/white panel
            [[ "$line" =~ \ panel=([1-5]) ]] && devpanel="${BASH_REMATCH[1]}"   # panel type, 0 = not reported
            [[ "$line" =~ \ board=([a-z0-9-]{1,40}) ]] && board="${BASH_REMATCH[1]}"
            [[ "$line" =~ \ wifi=1 ]] && wifi=1
            [[ "$line" =~ \ fw=([0-9.]{1,10}) ]] && fw="${BASH_REMATCH[1]}"
            [[ "$line" =~ \ net=(sta|ap|off) ]] && netst="${BASH_REMATCH[1]}"
            [[ "$line" =~ \ ip=([0-9.]{7,15}) ]] && ip="${BASH_REMATCH[1]}"
            [[ "$line" =~ \ fast=1 ]] && fastcap=1   # the panel can do fast refreshes
            [[ "$line" =~ \ ssid=(([0-9a-f]{2}){1,32})(\ |$) ]] && ssidhex="${BASH_REMATCH[1]}"   # stored WiFi network, hex
            break
        fi
    done

    if [[ -z "$id" ]]; then
        exec 3>&-
        log "$port: no answer with chip ID (old firmware?)"
        DISPLAYS_JSON+=("{\"port\": $(json_str "$port"), \"id\": \"\", \"error\": \"No answer with chip ID (old firmware?)\"}")
        return 1
    fi

    frame_for "$id" "$fastcap" "$devpins"
    # "Redraw now" for this display: R just before #END
    [[ -n "${REDRAW[$id]:-}" ]] && FRAME=("${FRAME[@]:0:${#FRAME[@]}-1}" "R" "#END")
    # WiFi settings (USB only); the copy for the web page and the log hides them
    local shown=("${FRAME[@]}")
    if (( wifi )) && [[ -n "${CFG_WIFI[$id]:-}" ]]; then
        FRAME=("${FRAME[@]:0:${#FRAME[@]}-1}" "${CFG_WIFI[$id]}" "#END")
        shown=("${shown[@]:0:${#shown[@]}-1}" "W|(WiFi settings)" "#END")
    fi
    local ndisks=0
    for line in "${FRAME[@]}"; do [[ "$line" == D\|* ]] && ndisks=$((ndisks + 1)); done

    if [ "$DRY_RUN" = true ]; then
        exec 3>&-
        echo "===== $port  ID $id  $size  board=${board:-?}  types=${CFG_TYPES[$id]-$ALL_TYPES} sort=${CFG_SORT[$id]:-pool} ====="
        printf '%s\n' "${shown[@]}"
        return 0
    fi

    printf '%s\n' "${FRAME[@]}" >&3
    while read -r -t 30 line <&3; do
        line="${line%$'\r'}"
        [[ "$line" == OK* ]] && { answer="$line"; break; }
    done
    exec 3>&-

    answer="$(tr -cd '[:print:]' <<< "$answer")"
    if [[ -n "$answer" ]]; then
        [ "$MODE" = full ] && log "$port (ID $id): $ndisks disks$([[ -n "${REDRAW[$id]:-}" ]] && echo ", redraw requested") -> $answer"
    else
        log "$port (ID $id): no answer to the frame"
    fi
    USB_IDS[$id]=1
    note_fast "$id" "$fastcap" "$port"
    DISPLAYS_JSON+=("{\"port\": $(json_str "$port"), \"transport\": \"usb\", \"id\": \"$id\", \"size\": \"$size\", \"colors\": $colors, \"panel\": $devpanel, \"pins\": \"$devpins\", \"board\": \"$board\", \"wifi\": $wifi, \"fw\": \"$fw\", \"net\": \"$netst\", \"ip\": \"$ip\", \"ssidHex\": \"$ssidhex\", \"fast\": $fastcap, \"answer\": $(json_str "$answer"), \"frame\": $(json_str "$(printf '%s\n' "${shown[@]}")")}")
}

# -----------------------
# WiFi displays: frame file for every display that fetched its frame lately and is not on USB
# wifi/<id>.info: key=value lines (size, colors, rows, pins, panel, board, fw, ip, fast), written by the web page
# wifi/<id>.seen: line 1 epoch of the last fetch, line 2 the display's answer to the last frame
# -----------------------
update_wifi_display() {
    local info="$1" id k v size="" colors=3 devpins="" board="" fw="" ip="" seen=0 answer="" tmp fastcap=0 devpanel=0 ssidhex=""
    id="$(basename "$info" .info)"
    [[ "$id" =~ ^[0-9A-F]{8}$ ]] || return
    [[ -n "${USB_IDS[$id]:-}" ]] && return   # on USB as well: that one counts
    { read -r seen; read -r answer; } < "$WIFI_DIR/$id.seen" 2>/dev/null
    [[ "$seen" =~ ^[0-9]+$ ]] && (( NOW - seen <= WIFI_STALE )) || return
    answer="$(tr -cd '[:print:]' <<< "${answer:0:100}")"
    while IFS='=' read -r k v; do
        v="${v%$'\r'}"
        case "$k" in
            size)   [[ "$v" =~ ^[0-9]{2,4}x[0-9]{2,4}$ ]] && size=$v ;;
            colors) [[ "$v" =~ ^[23]$ ]] && colors=$v ;;
            pins)   [[ "$v" =~ ^-?[0-9]{1,2},-?[0-9]{1,2},-?[0-9]{1,2},-?[0-9]{1,2}$ ]] && devpins=$v ;;
            panel)  [[ "$v" =~ ^[1-5]$ ]] && devpanel=$v ;;
            board)  [[ "$v" =~ ^[a-z0-9-]{1,40}$ ]] && board=$v ;;
            fw)     [[ "$v" =~ ^[0-9.]{1,10}$ ]] && fw=$v ;;
            ip)     [[ "$v" =~ ^[0-9.]{7,15}$ ]] && ip=$v ;;
            fast)   [[ "$v" == 1 ]] && fastcap=1 ;;
            ssid)   [[ "$v" =~ ^([0-9a-f]{2}){1,32}$ ]] && ssidhex=$v ;;   # stored WiFi network, hex
        esac
    done < <(head -n 20 "$info")
    [[ -n "$size" ]] || return

    frame_for "$id" "$fastcap" "$devpins"
    if [ "$DRY_RUN" = true ]; then
        echo "===== WiFi $ip  ID $id  $size  board=${board:-?} ====="
        printf '%s\n' "${FRAME[@]}"
        return
    fi
    mkdir -p "$FRAMES_DIR" && chmod 755 "$FRAMES_DIR"
    tmp="$(mktemp "$FRAMES_DIR/.frame.XXXXXX")" || return
    printf '%s\n' "${FRAME[@]}" > "$tmp"
    chmod 644 "$tmp"
    mv -f "$tmp" "$FRAMES_DIR/$id.txt"
    [ "$MODE" = full ] && log "WiFi $ip (ID $id): frame ready${answer:+, last answer: $answer}"
    note_fast "$id" "$fastcap" wifi
    DISPLAYS_JSON+=("{\"port\": \"WiFi\", \"transport\": \"wifi\", \"id\": \"$id\", \"size\": \"$size\", \"colors\": $colors, \"panel\": $devpanel, \"pins\": \"$devpins\", \"board\": \"$board\", \"wifi\": 1, \"fw\": \"$fw\", \"net\": \"sta\", \"ip\": \"$ip\", \"ssidHex\": \"$ssidhex\", \"fast\": $fastcap, \"seen\": $seen, \"answer\": $(json_str "$answer"), \"frame\": $(json_str "$(printf '%s\n' "${FRAME[@]}")")}")
}

# List of the displays with fast refresh for the next runs (only entries seen in this run when full)
write_fast_file() {
    local id out=""
    [ "$DRY_RUN" = true ] && return
    for id in "${!FAST_SECS[@]}"; do
        [ "$MODE" = full ] && [[ -z "${FAST_SEEN[$id]:-}" ]] && continue
        out+="$id ${FAST_SECS[$id]} ${FAST_PORT[$id]} ${FAST_LAST[$id]}"$'\n'
    done
    if [[ -n "$out" ]]; then
        printf '%s' "$out" > "$FAST_FILE.$$" && mv -f "$FAST_FILE.$$" "$FAST_FILE"
    else
        rm -f "$FAST_FILE"
    fi
}

# -----------------------
# Fast run: only the due displays with fast refresh, then done (no state for the web page)
# -----------------------
if [ "$MODE" = fast ]; then
    for id in "${!FAST_DUE[@]}"; do
        if [[ "${FAST_PORT[$id]}" == wifi ]]; then
            [[ -f "$WIFI_DIR/$id.info" ]] && update_wifi_display "$WIFI_DIR/$id.info"
        elif [[ -e "${FAST_PORT[$id]}" ]]; then
            update_display "${FAST_PORT[$id]}"
        fi
        FAST_LAST[$id]=$NOW   # also when it did not answer: try again after its interval
    done
    write_fast_file
    exit 0
fi

for port in "${PORTS[@]}"; do
    if [[ -e "$port" ]]; then
        update_display "$port"
    else
        log "$port: not found"
    fi
done

for info in "$WIFI_DIR"/*.info; do
    [[ -f "$info" ]] && update_wifi_display "$info"
done

write_fast_file

if (( ${#PORTS[@]} == 0 )) && [[ -z "$(compgen -G "$WIFI_DIR/*.info")" ]]; then
    log "No display connected"
    if [ "$DRY_RUN" = true ]; then
        echo "===== no display connected - frame with all disks and the system page ====="
        build_frame "$HOST" "$ALL_TYPES" "$DEFAULT_BOXES" 0 pool "" "$DEFAULT_WARN" 0 "$DEFAULT_PAGE" "" "" "" 0 "cpu,ram,net,nvme,ssd,hdd" ""
        printf '%s\n' "${FRAME[@]}"
    fi
fi

[ "$DRY_RUN" = true ] && exit 0

# -----------------------
# State for the web page (atomic: temp file + rename, never follows symlinks)
# -----------------------
write_state() {
    local tmp d sep="" pool temp
    tmp="$(mktemp "$DATA_DIR/.state.XXXXXX")" || return 1
    {
        printf '{\n  "host": %s,\n  "updated": %s,\n  "disks": [' "$(json_str "$HOST")" "$NOW"
        for d in "${POOL_ORDER[@]}"; do
            pool="${D_POOL[$d]}"; [[ "$pool" == "-" ]] && pool=""
            temp="${D_TEMP[$d]:-null}"; [[ "$temp" == -1 ]] && temp=null   # -2 = asleep stays
            printf '%s\n    {"dev": %s, "uid": %s, "type": "%s", "pool": %s, "used": %s, "total": %s, "state": "%s", "stale": %s, "idle": %s, "timeout": %s, "poll": %s, "temp": %s, "size": %s}' \
                "$sep" "$(json_str "$d")" "$(json_str "${D_UID[$d]}")" "${D_TYPE[$d]}" "$(json_str "$pool")" "${D_USEDB[$d]}" "${D_TOTALB[$d]}" \
                "${D_ST[$d]}" "$( (( ${D_STALE[$d]:-0} )) && echo true || echo false )" "${D_IDLE[$d]}" "${D_TMO[$d]}" "${D_POLL[$d]}" "$temp" "${D_SIZE[$d]:-0}"
            sep=","
        done
        printf '\n  ],\n  "system": %s,\n  "displays": [' "$SYS_JSON"
        sep=""
        for d in "${DISPLAYS_JSON[@]}"; do
            printf '%s\n    %s' "$sep" "$d"
            sep=","
        done
        printf '\n  ]\n}\n'
    } > "$tmp"
    chmod 644 "$tmp"
    mv -f "$tmp" "$STATE_FILE"
}

if [[ -d "$DATA_DIR" ]]; then
    write_state || log "Cannot write $STATE_FILE"
else
    log "Data folder $DATA_DIR not found - web page gets no data"
fi

printf '%s %s\n' "$NOW" "$SIGNATURE" > "$STAMP_FILE"
