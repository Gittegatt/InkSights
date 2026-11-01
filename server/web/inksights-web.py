#!/usr/bin/env python3
"""
inksights-web.py - settings page for InkSights (Docker app on the server)

Lets you choose, per e-paper display, which disk types it shows, the spindown timer and
its style, symbols, the percentage in the bar, rows per page, the disk order and which disks
are shown, from which usage the bar is highlighted, the rotation, the automatic page turn,
the panel type and the control pins, the title and a name, the system page and its network
interface, the fast refresh (black/white panels), and for boards with WiFi the WiFi settings, plus how often the
server updates the displays. Runs inside a container and shares only one data
folder with the server:

  state.json            written by inksights.sh (disks, displays)
  inksights.conf        written here, read by inksights.sh
  refresh-request       created here, picked up by inksights.sh
  redraw-request        chip IDs to redraw now ("Redraw now"), picked up by inksights.sh
  wifi/<id>.info, .seen written here when a WiFi display fetches its frame (GET /api/frame)
  wifi/<id>.redraw      "Redraw now" for a WiFi display, sent with its next frame
  login.json            the login set in the Login card: on/off and the password (a salted hash only),
                        readable for the app only

Firmware updates over WiFi (OTA) are kept in memory only: the firmware the image carries
(fw/<board>.bin with fw/manifest.json next to this file) or a file uploaded on the page; the
display gets a U line with its next frame and fetches the file (GET /api/firmware).

It also reads, from the run folder of inksights.sh (--run, mounted read-only; in memory):

  frames/<id>.txt       frames for the WiFi displays, written by inksights.sh
  live/<id>.txt         frames of the USB displays with fast refresh (live preview, GET /api/live)

Standard library only.
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

VERSION = "1.0"   # of InkSights (firmware, script and this app go together); the page compares it with the latest release
ID_RE = re.compile(r"^[0-9A-F]{8}$")
NAME_RE = re.compile(r"^[A-Za-z0-9 ._+/-]{0,12}$")
PAGE_NAME_RE = re.compile(r"^[^\x00-\x1f\x7f]{0,32}$")   # name of this page (header, browser tab); no tabs/line breaks
DEFAULT_PAGE_NAME = "InkSights"
UID_RE = re.compile(r"^[A-Za-z0-9._-]{1,40}$")
TYPES = ("hdd", "ssd", "nvme")
SORTS = ("pool", "uid", "dev", "manual")
MAX_ORDER = 32
MAX_BOXES = 20                          # spindown boxes per disk; 0 = none
ROWS = (0, 2, 3, 4, 5, 6)               # rows per page; 0 = automatic; 6 only fits the 4.2" panel
# Refresh per display in seconds: below a minute only for panels that redraw fast without flashing
# (black/white, fast=1), as fast refresh; from a minute on a full update that often (colour panels
# redraw at most every 3 min, and only on change)
REFRESH = (2, 5, 10, 30, 60, 180, 300, 600, 900, 1800, 3600, 5400, 7200, 10800, 14400)
DEFAULT_REFRESH = 600
MAX_INTERVAL = 240                      # minutes; the interval line = the shortest refresh of the displays
DEFAULT_INTERVAL = 10
DEFAULT_WARN = 85                     # bar is highlighted from this % used; 0 = never
ROTATIONS = (0, 90, 180, 270)         # degrees clockwise
DEFAULT_PAGE = 600                    # seconds between automatic page turns; 0 = off
MAX_PAGE = 86400
MAX_PIN = 48                          # pin numbers of the board (D numbers / GPIO); the page offers
                                      # only the board's pins, the board itself takes only those
PIN_NONE = -1                         # Reset / Busy not connected
DNAME_RE = re.compile(r"^[^\x00-\x1f\x7f]{0,32}$")         # display name on this page
HOST_RE = re.compile(r"^[A-Za-z0-9-]{1,32}$")                 # WiFi host name of the board
SERVER_RE = re.compile(r"^https?://[^\s|]{1,120}$")          # address of this page, as the board reaches it
HEX_RE = re.compile(r"^([0-9a-f]{2}){1,128}$")
WIFI_KEYS = ("ssid", "pass", "host", "server", "apOn", "apSsid", "apPass", "apDelay")
DEFAULT_AP_DELAY, MAX_AP_DELAY = 30, 3600   # seconds without WiFi before the board opens its access point
FAST = (0, 2, 5, 10, 30)              # seconds between fast refreshes (panels that report fast=1); 0 = off
IFACE_RE = re.compile(r"^[A-Za-z0-9._-]{1,15}$")             # network interface for the system page
MAX_NETS = 32                          # interfaces in the order and hidden lists of the network pages
NET_SORTS = ("name", "manual")
NET_BARS = (0, 1, 2)                   # details in the bar of the network pages: none, percentage of the link, link speed
SYS_PARTS = ("cpu", "ram", "net", "nvme", "ssd", "hdd")       # system page components (rows); none = no system page
CONF_COLS = 68
# Time page: NTP server (boards with WiFi), time zone name and its POSIX rule for the board
NTP_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.-]{0,39}$")
TZ_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_+/-]{0,39}$")
TZPOSIX_RE = re.compile(r"^[A-Za-z<][A-Za-z0-9<>+,./:-]{0,47}$")
PANELS = (1, 2, 3, 4, 5, 6, 7, 8)    # panel types (GDEW0213Z16, GDEH0213Z19, GDEY0213Z98, GDEY0213B74, GDEY042T81; 6-8 = 1-3 with yellow)
# Header layout: what stands left, in the middle and right; T title, P page number, U uptime,
# C time, - nothing; lower case = that place highlighted; each of T, P, U, C at most once
# (like layout_valid in inksights.sh)
DEFAULT_LAYOUT = "CTU"   # a new display: time, title, uptime (user)
LAYOUT_RE = re.compile(r"^[TPUCtpuc-]{3}$")


def layout_ok(v):
    return isinstance(v, str) and bool(LAYOUT_RE.match(v)) and all(v.upper().count(c) <= 1 for c in "TPUC")


# Order of the pages on the display: S system, D drives, N network, T time, W WiFi, each once
# (like order_valid in inksights.sh)
DEFAULT_PAGE_ORDER = "TSDNW"   # a new display: time, system, drives, network, WiFi (user)


def page_order_ok(v):
    return isinstance(v, str) and len(v) == 5 and sorted(v) == sorted(DEFAULT_PAGE_ORDER)


# The pictures: The Conversation (C, "Nothing to ink"), The Intermission (I, "Check connection"), The Afterhours
# (A, quiet hours). Per picture Ink (used at all), Caption, Header, Page turn candidate, Scheduled with From/To; the
# card order (the pages and the pictures, their place in the page turn) and Beverages (what stands on the table:
# 0 House Wine, the bottle and the glass; 1 Tabula Rasa, nothing; 2 Roast, a coffee cup, the default of a new display).
PICS = (("conv", "18:00", "19:00", 0), ("inter", "12:00", "13:00", 1), ("after", "23:00", "07:00", 1))   # prefix, window, caption
PIC_BITS = (("Cap", 1), ("Head", 2), ("Rot", 4), ("Sched", 8))   # bits of a picture in conf column picflags
HHMM_RE = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
CARD_LETTERS = "SDNTWCIA"


def card_order_ok(v):
    return isinstance(v, str) and len(v) == len(CARD_LETTERS) and sorted(v) == sorted(CARD_LETTERS)


def card_order_fix(card, page_order):
    """The card order with its pages in the page order (that one decides the order of the pages)."""
    card = card if card_order_ok(card) else page_order + "CIA"
    pages = iter(page_order)
    return "".join(next(pages) if k in DEFAULT_PAGE_ORDER else k for k in card)


def in_window(m, start, end):
    """Is minute m of the day in start..end ("HH:MM"; past midnight when end < start; start = end: empty)?"""
    f, e = int(start[:2]) * 60 + int(start[3:]), int(end[:2]) * 60 + int(end[3:])
    return f <= m < e if f < e else f > e and (m >= f or m < e)


def pics_from_conf(parts, page_order):
    """The picture settings from conf columns 62-66 (missing: the defaults)."""
    ink, flags, card, win, sober = parts[61], parts[62], parts[63], parts[64], parts[65]
    ink = ink if re.match(r"^[01]{3}$", ink) else "111"
    flags = flags if re.match(r"^[0-9a-f]{3}$", flags) else "".join(str(c) for _, _, _, c in PICS)
    wins = win.split(",") if re.match(r"^([0-9]{4}-[0-9]{4},){2}[0-9]{4}-[0-9]{4}$", win) else []
    # older lines without the column keep Tabula Rasa, their earlier default
    out = {"cardOrder": card_order_fix(card, page_order), "sober": int(sober) if sober in ("0", "1", "2") else 1}
    for i, (p, f0, t0, _) in enumerate(PICS):
        out[p + "Ink"] = int(ink[i])
        bits = int(flags[i], 16)
        for k, b in PIC_BITS:
            out[p + k] = 1 if bits & b else 0
        f, t = (wins[i][:2] + ":" + wins[i][2:4], wins[i][5:7] + ":" + wins[i][7:]) if wins else (f0, t0)
        out[p + "From"], out[p + "To"] = (f, t) if HHMM_RE.match(f) and HHMM_RE.match(t) else (f0, t0)
    return out


def pics_to_conf(s):
    """conf columns 62-66 of the picture settings."""
    ink = "".join(str(s.get(p + "Ink", 1)) for p, _, _, _ in PICS)
    flags = "".join(format(sum(b for k, b in PIC_BITS if s.get(p + k, c if k == "Cap" else 0)), "x") for p, _, _, c in PICS)
    win = ",".join((s.get(p + "From", f0) + "-" + s.get(p + "To", t0)).replace(":", "") for p, f0, t0, _ in PICS)
    card = card_order_fix(s.get("cardOrder", ""), s.get("pageOrder") if page_order_ok(s.get("pageOrder")) else DEFAULT_PAGE_ORDER)
    return [ink, flags, card, win, str(s.get("sober", 2))]


def validate_pics(did, s, page_order):
    """The picture settings of a display, checked like the page does (time windows must not overlap)."""
    out = {"sober": s.get("sober", 2)}   # Beverages: 2 Roast for a new display (user)
    if out["sober"] not in (0, 1, 2) or isinstance(out["sober"], bool):
        raise SettingsError(f"Display {did}: invalid sober.")
    for p, f0, t0, cap in PICS:
        # a new display (user, 2026-10-27): Header, Caption, Turn candidate on, Scheduled off (the conf
        # without these columns keeps the earlier ones: PICS caption, no header, not in the page turn)
        for k, d in (("Ink", 1), ("Cap", 1), ("Head", 1), ("Rot", 1), ("Sched", 0)):
            v = s.get(p + k, d)
            if v not in (0, 1) or isinstance(v, bool):
                raise SettingsError(f"Display {did}: invalid {p}{k}.")
            out[p + k] = v
        for k, d in (("From", f0), ("To", t0)):
            v = s.get(p + k, d)
            if not isinstance(v, str) or not HHMM_RE.match(v):
                raise SettingsError(f"Display {did}: invalid {p}{k}.")
            out[p + k] = v
    timed = [p for p, _, _, _ in PICS if out[p + "Ink"] and out[p + "Sched"]]
    for p in timed:
        if out[p + "From"] == out[p + "To"]:
            raise SettingsError(f"Display {did}: a time window needs a different start and end.")
    for i, a in enumerate(timed):
        for b in timed[i + 1:]:
            if any(in_window(m, out[a + "From"], out[a + "To"]) and in_window(m, out[b + "From"], out[b + "To"]) for m in range(1440)):
                raise SettingsError(f"Display {did}: the time windows of two pictures overlap.")
    card = s.get("cardOrder", page_order + "CIA")
    if not card_order_ok(card):
        raise SettingsError(f"Display {did}: invalid card order.")
    out["cardOrder"] = card_order_fix(card, page_order)
    return out


def iface_list(text):
    """Interface names from a conf column ("-" = none), each once, at most MAX_NETS"""
    return list(dict.fromkeys(n for n in text.split(",") if n != "-" and IFACE_RE.match(n)))[:MAX_NETS]


PAGES = ("system", "disks", "network", "wifi")   # pages switched on


def pins_ok(p):
    """cs, dc, rst, busy: pin numbers 0..MAX_PIN, all different; rst and busy may be PIN_NONE"""
    if not isinstance(p, list) or len(p) != 4 or not all(is_int(x) for x in p):
        return False
    if any(not 0 <= x <= MAX_PIN for x in p[:2]) or any(not 0 <= x <= MAX_PIN and x != PIN_NONE for x in p[2:]):
        return False
    used = [x for x in p if x != PIN_NONE]
    return len(set(used)) == len(used)


def to_hex(text):
    return text.encode("utf-8").hex() if text else "-"


def from_hex(h):
    if h == "-" or not HEX_RE.match(h or ""):
        return ""
    try:
        return bytes.fromhex(h).decode("utf-8")
    except ValueError:
        return ""


def wifi_defaults():
    return {"ssid": "", "pass": "", "host": "", "server": "", "apOn": True, "apSsid": "", "apPass": "",
            "apDelay": DEFAULT_AP_DELAY}
CONF_NAME = "inksights.conf"
STATE_NAME = "state.json"
REFRESH_NAME = "refresh-request"
REDRAW_NAME = "redraw-request"
MAX_BODY = 64 * 1024
MAX_DISPLAYS = 32
WIFI_DIR = "wifi"
FRAMES_DIR = "frames"
LIVE_DIR = "live"   # frames of the USB displays with fast refresh (live preview only)

WEB_DIR = os.path.dirname(os.path.abspath(__file__))
FW_DIR = os.path.join(WEB_DIR, "fw")   # firmware for the OTA updates (built into the Docker image)
MAX_FW = 4 * 1024 * 1024               # bytes; the biggest firmware slot is 3.2 MB
BOARD_RE = re.compile(r"^[a-z0-9-]{1,40}$")
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/inksights-render.js": ("inksights-render.js", "text/javascript; charset=utf-8"),
    "/inksights-ui.js": ("inksights-ui.js", "text/javascript; charset=utf-8"),
    "/inksights.css": ("inksights.css", "text/css; charset=utf-8"),
}


def read_conf(path):
    """-> (display settings by chip id, update interval in minutes, page name)"""
    conf, interval, page_name = {}, DEFAULT_INTERVAL, ""
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                if line.startswith("#") or not line.strip():
                    continue
                parts = line.rstrip("\r\n").split("\t")
                if parts[0] == "interval" and len(parts) > 1 and parts[1].isdigit():
                    interval = int(parts[1]) if 1 <= int(parts[1]) <= MAX_INTERVAL else DEFAULT_INTERVAL
                    continue
                if parts[0] == "pagename" and len(parts) > 1:
                    page_name = parts[1].strip() if PAGE_NAME_RE.match(parts[1]) else ""
                    continue
                if len(parts) < 10 or not ID_RE.match(parts[0]):
                    continue
                parts += ["-"] * (CONF_COLS - len(parts))   # older files have fewer columns
                pins = [int(x) for x in parts[9].split(",") if x.lstrip("-").isdigit()]
                warn = int(parts[6]) if parts[6].isdigit() else DEFAULT_WARN
                rot = int(parts[7]) if parts[7].isdigit() else 0
                page = int(parts[8]) if parts[8].isdigit() else DEFAULT_PAGE
                boxes = int(parts[2]) if parts[2].isdigit() else 10
                rows = int(parts[3]) if parts[3].isdigit() else 0
                order = [u for u in parts[5].split(",") if u != "-" and UID_RE.match(u)][:MAX_ORDER]
                hidden = [u for u in parts[12].split(",") if u != "-" and UID_RE.match(u)][:MAX_ORDER]
                style = parts[11].split(",")
                style = ([int(x) for x in style] if len(style) in (4, 5, 6) and all(x in ("0", "1") for x in style[:5])
                         and style[5:] in ([], ["0"], ["1"], ["2"]) else [1, 1, 1, 1, 1, 1])
                style += [0] * (6 - len(style))   # bar details: 0 percentage, 1 used capacity; decimals of the percentage
                title = "" if parts[10] == "-" else parts[10]
                dname = "" if parts[13] == "-" else parts[13]
                wifi = wifi_defaults()
                if parts[14] != "-" and HEX_RE.match(parts[14]):
                    wifi = {"ssid": from_hex(parts[14]), "pass": from_hex(parts[15]), "host": from_hex(parts[16]),
                            "server": from_hex(parts[17]), "apOn": parts[18] != "0",
                            "apSsid": from_hex(parts[19]), "apPass": from_hex(parts[20]),
                            "apDelay": int(parts[21]) if parts[21].isdigit() and int(parts[21]) <= MAX_AP_DELAY
                            else DEFAULT_AP_DELAY}
                fast = int(parts[22]) if parts[22].isdigit() else 0
                # components; "1" = all (system page on, earlier version)
                sysp = list(SYS_PARTS) if parts[23] == "1" else [p for p in SYS_PARTS if p in parts[23].split(",")]
                types = [t for t in TYPES if t in parts[1].split(",")]
                if not types and parts[1] != "-":   # "-" = no disk types (the display may show nothing: "Nothing to ink")
                    types = list(TYPES)
                conf[parts[0]] = {
                    "types": types,
                    "boxes": boxes if 0 <= boxes <= MAX_BOXES else 10,
                    "rows": rows if rows in ROWS else 0,
                    "sort": parts[4] if parts[4] in SORTS else "pool",
                    "order": order,
                    "warn": warn if 0 <= warn <= 100 else DEFAULT_WARN,
                    "rot": rot if rot in ROTATIONS else 0,
                    "page": page if 0 <= page <= MAX_PAGE else DEFAULT_PAGE,
                    "pins": pins if pins_ok(pins) else None,
                    "name": title if NAME_RE.match(title) else "",
                    "timer": style[0], "ringDir": style[1], "icons": style[2], "pctBar": style[3], "barCap": style[4], "pctDec": style[5],
                    "hidden": hidden,
                    "dname": dname if DNAME_RE.match(dname) else "",
                    "wifi": wifi,
                    "fast": fast if fast in FAST else 0,
                    # refresh in seconds; missing (earlier version): the fast refresh, else the interval line
                    "refresh": int(parts[42]) if parts[42].isdigit() and int(parts[42]) in REFRESH else None,
                    "sys": sysp,
                    "net": parts[24] if parts[24] != "-" and IFACE_RE.match(parts[24]) else "",
                    "zfs": 0 if parts[25] == "0" else 1,
                    "showSys": 0 if parts[26] not in ("-", "") and "system" not in parts[26].split(",") else 1,
                    "showDisks": 0 if parts[26] not in ("-", "") and "disks" not in parts[26].split(",") else 1,
                    "showWifi": 1 if "wifi" in parts[26].split(",") else 0,
                    "showTime": 1 if "time" in parts[26].split(",") else 0,
                    "sysIcons": 0 if parts[27] == "0" else 1,
                    "showHeader": 0 if parts[32] == "0" else 1,
                    "showNet": 1 if "network" in parts[26].split(",") else 0,
                    "netSort": parts[33] if parts[33] in NET_SORTS else "name",
                    "netOrder": iface_list(parts[34]),
                    "netHidden": iface_list(parts[35]),
                    "netIcons": 0 if parts[36] == "0" else 1,
                    "netBar": int(parts[37]) if parts[37] in ("0", "1", "2") else 0,
                    "driveTemp": 1 if parts[38] == "1" else 0,
                    "stby": 1 if parts[39] == "1" else 0,
                    "headInv": 1 if parts[40] == "1" else 0,
                    "headCol": 1 if parts[41] == "1" else 0,   # inverted header: highlighted boxes in the third colour
                    # time: 12 hours (header and time page); time page: date, weekday, date format, NTP
                    "timeFmt": 1 if parts[43] in ("1", "2") else 0,
                    "ampm": 0 if parts[43] == "2" else 1,   # 12 hours without AM/PM
                    "timeDate": 0 if parts[44] == "0" else 1,
                    "timeWday": 0 if parts[45] == "0" else 1,
                    "dateFmt": int(parts[46]) if parts[46] in ("0", "1", "2", "3") else 0,
                    "ntp": 1 if parts[47] == "1" else 0,
                    "ntpServer": parts[48] if NTP_RE.match(parts[48]) else "pool.ntp.org",
                    "tz": parts[49] if TZ_RE.match(parts[49]) else "UTC",
                    "tzPosix": parts[50] if TZPOSIX_RE.match(parts[50]) else "UTC0",
                    # Advanced Ink: screens shown when needed (1) or never (0)
                    "inkSplash": 0 if parts[51] == "0" else 1,
                    "inkNothing": 0 if parts[52] == "0" else 1,
                    "inkNoData": 0 if parts[53] == "0" else 1,
                    # inverted header: lines at the top and the bottom
                    "lineBottom": 1 if parts[54] == "1" else 0,
                    "pageOrder": parts[55] if page_order_ok(parts[55]) else DEFAULT_PAGE_ORDER,
                    "justTime": 1 if parts[56] == "1" else 0,   # Advanced Ink: only the time page
                    "ota": 0 if parts[66] == "0" else 1,   # Advanced Ink: firmware updates from this page allowed
                    # Got the time? (a wall clock) per picture C I A; a single digit (earlier): The Afterhours
                    **{p + "Clock": int(c) for (p, _, _, _), c in zip(PICS, parts[67] if re.match(r"^[01]{3}$", parts[67]) else "00" + ("1" if parts[67] == "1" else "0"))},
                    "timeHead": 1 if parts[57] == "1" else 0,   # the time page with the header line (default without)
                    "headFill": 1 if parts[58] == "1" else 0,   # header: the gaps between the boxes filled
                    # time page: the time in the third colour, with a black outline
                    "timeColor": 1 if parts[59] == "1" else 0,
                    "timeFrame": 1 if parts[60] == "1" else 0,
                    # the pictures (columns 62-66)
                    **pics_from_conf(parts, parts[55] if page_order_ok(parts[55]) else DEFAULT_PAGE_ORDER),
                    "panel": int(parts[29]) if parts[29] in ("1", "2", "3", "4", "5", "6", "7", "8") else None,
                    "wifiIcons": 0 if parts[30] == "0" else 1,
                    # missing (earlier version): title, time, then the page number or the uptime
                    "layout": parts[31] if layout_ok(parts[31]) else "TCU" if parts[28] == "1" else DEFAULT_LAYOUT,
                }
    except FileNotFoundError:
        pass
    for s in conf.values():
        if s["refresh"] is None:
            s["refresh"] = s["fast"] or (interval * 60 if interval * 60 in REFRESH else DEFAULT_REFRESH)
    return conf, interval, page_name


def read_interval(conf, default=DEFAULT_INTERVAL):
    """Minutes between full updates (drives, pools, the settings page): the shortest refresh of
    the displays, one under a minute counts as 1 minute"""
    mins = [max(1, s.get("refresh", DEFAULT_REFRESH) // 60) for s in conf.values()]
    return min(min(mins), MAX_INTERVAL) if mins else default


class SettingsError(ValueError):
    """Invalid settings; the message is shown on the page."""


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def validate_wifi(did, w, old):
    """WiFi settings of one display. Passwords: None = keep the stored one."""
    if w is None:
        return dict(old)
    if not isinstance(w, dict):
        raise SettingsError(f"Display {did}: invalid WiFi settings.")
    out = wifi_defaults()
    for key in ("ssid", "host", "server", "apSsid"):
        v = w.get(key, "")
        v = v.strip() if isinstance(v, str) else ""
        if len(v) > 32 and key != "server" or any(ord(c) < 32 or c == "\x7f" for c in v):
            raise SettingsError(f"Display {did}: WiFi {key}: max. 32 characters, no control characters.")
        out[key] = v
    if out["host"] and not HOST_RE.match(out["host"]):
        raise SettingsError(f"Display {did}: host name only letters, digits and -, max. 32.")
    if out["server"] and not SERVER_RE.match(out["server"]):
        raise SettingsError(f"Display {did}: settings page address like http://hostname:8099.")
    out["apOn"] = w.get("apOn", True) is not False
    d = w.get("apDelay", DEFAULT_AP_DELAY)
    if not is_int(d) or not 0 <= d <= MAX_AP_DELAY:
        raise SettingsError(f"Display {did}: access point after 0 to {MAX_AP_DELAY} seconds.")
    out["apDelay"] = d
    for key, keep in (("pass", old.get("pass", "")), ("apPass", old.get("apPass", ""))):
        v = w.get(key)
        if v is None:
            v = keep
        if not isinstance(v, str) or (v and not 8 <= len(v) <= 63) or any(ord(c) < 32 for c in v):
            raise SettingsError(f"Display {did}: WiFi passwords need 8 to 63 characters.")
        out[key] = v
    if not out["ssid"]:
        out["pass"] = ""
    return out


def validate(displays, old_conf=None):
    old_conf = old_conf or {}
    if not isinstance(displays, dict) or len(displays) > MAX_DISPLAYS:
        raise SettingsError("Invalid data.")
    clean = {}
    for did, s in displays.items():
        if not isinstance(did, str) or not ID_RE.match(did) or not isinstance(s, dict):
            raise SettingsError(f"Invalid display ID: {did}")
        types = s.get("types")
        types = [t for t in TYPES if isinstance(types, list) and t in types]
        sysp = s.get("sys", [])
        if not isinstance(sysp, list) or not all(p in SYS_PARTS for p in sysp):
            raise SettingsError(f"Display {did}: invalid system page components.")
        sysp = [p for p in SYS_PARTS if p in sysp]
        show = {}
        for key, default in (("showSys", 1), ("showDisks", 1), ("showWifi", 1), ("wifiIcons", 1), ("sysIcons", 1), ("showHeader", 1),
                             ("showNet", 1), ("netIcons", 1), ("driveTemp", 0), ("stby", 1), ("headInv", 0), ("headCol", 0),
                             ("showTime", 1), ("timeFmt", 0), ("ampm", 1), ("timeDate", 1), ("timeWday", 1), ("ntp", 0),
                             ("inkSplash", 1), ("inkNothing", 1), ("inkNoData", 1), ("lineBottom", 0), ("justTime", 0), ("timeHead", 0), ("headFill", 0), ("timeColor", 0), ("timeFrame", 0), ("ota", 1), ("convClock", 0), ("interClock", 0), ("afterClock", 0)):
            v = s.get(key, default)
            if v not in (0, 1) or isinstance(v, bool):
                raise SettingsError(f"Display {did}: invalid {key}.")
            show[key] = v
        refresh = s.get("refresh", DEFAULT_REFRESH)
        if not is_int(refresh) or refresh not in REFRESH:
            raise SettingsError(f"Display {did}: invalid refresh.")
        date_fmt = s.get("dateFmt", 1)
        if not is_int(date_fmt) or not 0 <= date_fmt <= 3:
            raise SettingsError(f"Display {did}: invalid date format.")
        ntp_server, tz, tz_posix = s.get("ntpServer", "pool.ntp.org"), s.get("tz", "UTC"), s.get("tzPosix", "UTC0")
        if not isinstance(ntp_server, str) or not NTP_RE.match(ntp_server):
            raise SettingsError(f"Display {did}: NTP server like pool.ntp.org.")
        if not isinstance(tz, str) or not TZ_RE.match(tz) or not isinstance(tz_posix, str) or not TZPOSIX_RE.match(tz_posix):
            raise SettingsError(f"Display {did}: invalid time zone.")
        show.update(dateFmt=date_fmt, ntpServer=ntp_server, tz=tz, tzPosix=tz_posix)
        page_order = s.get("pageOrder", DEFAULT_PAGE_ORDER)
        if not page_order_ok(page_order):
            raise SettingsError(f"Display {did}: invalid page order.")
        show["pageOrder"] = page_order
        show.update(validate_pics(did, s, page_order))
        fast = refresh if refresh < 60 else 0   # under a minute: fast refresh
        zfs = s.get("zfs", 0)
        if zfs not in (0, 1) or isinstance(zfs, bool):
            raise SettingsError(f"Display {did}: invalid ZFS cache setting.")
        net = s.get("net", "")
        if not isinstance(net, str) or (net and (net == "-" or not IFACE_RE.match(net))):
            raise SettingsError(f"Display {did}: invalid network interface.")
        boxes = s.get("boxes")
        if not is_int(boxes) or not 0 <= boxes <= MAX_BOXES:   # 0 = none
            raise SettingsError(f"Display {did}: spindown boxes must be between 0 and {MAX_BOXES}.")
        rows = s.get("rows", 0)
        if not is_int(rows) or rows not in ROWS:
            raise SettingsError(f"Display {did}: rows must be 2 to 6.")
        sort = s.get("sort", "pool")
        if sort not in SORTS:
            raise SettingsError(f"Display {did}: unknown order.")
        order = s.get("order", [])
        if not isinstance(order, list) or len(order) > MAX_ORDER or not all(isinstance(u, str) and UID_RE.match(u) for u in order):
            raise SettingsError(f"Display {did}: invalid custom order.")
        warn = s.get("warn", DEFAULT_WARN)
        if not is_int(warn) or not 0 <= warn <= 100:
            raise SettingsError(f"Display {did}: highlight threshold must be between 1 and 100 %.")
        rot = s.get("rot", 0)
        if not is_int(rot) or rot not in ROTATIONS:
            raise SettingsError(f"Display {did}: rotation must be 0, 90, 180 or 270.")
        page = s.get("page", DEFAULT_PAGE)
        if not is_int(page) or not 0 <= page <= MAX_PAGE:
            raise SettingsError(f"Display {did}: page turn must be between 00:00:00 and 24:00:00.")
        panel = s.get("panel")
        if panel is not None and (not is_int(panel) or panel not in PANELS):
            raise SettingsError(f"Display {did}: unknown panel type.")
        pins = s.get("pins")
        if pins is not None and not pins_ok(pins):
            raise SettingsError(f"Display {did}: CS, D/C, Reset and Busy need different pins "
                                "(Reset and Busy may be None).")
        name = s.get("name", "")
        name = name.strip() if isinstance(name, str) else ""
        if not NAME_RE.match(name):
            raise SettingsError(f"Display {did}: title max. 12 characters, only letters, digits, spaces and . _ - + /")
        style = []
        for key, default in (("timer", 1), ("ringDir", 1), ("icons", 1), ("pctBar", 1), ("barCap", 1)):   # a new display: Ring, counterclockwise (user)
            v = s.get(key, default)
            if v not in (0, 1) or isinstance(v, bool):
                raise SettingsError(f"Display {did}: invalid {key}.")
            style.append(v)
        pct_dec = s.get("pctDec", 1)   # decimals of the percentage in the bar: 0, 1 or 2
        if pct_dec not in (0, 1, 2) or isinstance(pct_dec, bool):
            raise SettingsError(f"Display {did}: invalid pctDec.")
        style.append(pct_dec)
        hidden = s.get("hidden", [])
        if not isinstance(hidden, list) or len(hidden) > MAX_ORDER or not all(isinstance(u, str) and UID_RE.match(u) for u in hidden):
            raise SettingsError(f"Display {did}: invalid list of hidden disks.")
        dname = s.get("dname", "")
        dname = dname.strip() if isinstance(dname, str) else ""
        if not DNAME_RE.match(dname) or dname == "-":
            raise SettingsError(f"Display {did}: name max. 32 characters.")
        layout = s.get("layout", DEFAULT_LAYOUT)
        if not layout_ok(layout):
            raise SettingsError(f"Display {did}: invalid header layout.")
        netp = {"netSort": s.get("netSort", "name"), "netBar": s.get("netBar", 1)}
        if netp["netSort"] not in NET_SORTS or not is_int(netp["netBar"]) or netp["netBar"] not in NET_BARS:
            raise SettingsError(f"Display {did}: invalid network page settings.")
        for key in ("netOrder", "netHidden"):
            v = s.get(key, [])
            if not isinstance(v, list) or len(v) > MAX_NETS or not all(isinstance(n, str) and IFACE_RE.match(n) for n in v):
                raise SettingsError(f"Display {did}: invalid list of network interfaces.")
            netp[key] = list(dict.fromkeys(v))
        wifi = validate_wifi(did, s.get("wifi"), old_conf.get(did, {}).get("wifi", wifi_defaults()))
        clean[did] = {"layout": layout, **netp, "types": types, "boxes": boxes, "rows": rows, "sort": sort,
                      "order": list(dict.fromkeys(order)), "warn": warn, "rot": rot, "page": page, "pins": pins, "name": name,
                      "timer": style[0], "ringDir": style[1], "icons": style[2], "pctBar": style[3], "barCap": style[4], "pctDec": style[5],
                      "hidden": list(dict.fromkeys(hidden)), "dname": dname, "wifi": wifi,
                      "fast": fast, "refresh": refresh, "sys": sysp, "net": net, "zfs": zfs, "panel": panel, **show}
    return clean


def public_conf(conf):
    """Settings for the browser: WiFi passwords are never sent back, only whether one is set."""
    out = {}
    for did, s in conf.items():
        c = dict(s)
        w = dict(s.get("wifi") or wifi_defaults())
        w["passSet"], w["apPassSet"] = bool(w.pop("pass", "")), bool(w.pop("apPass", ""))
        c["wifi"] = w
        out[did] = c
    return out


def write_conf(path, conf, interval, page_name=""):
    lines = [
        "# InkSights - display settings (written by the web page)",
        "# interval<TAB>minutes between full updates: the shortest refresh of the displays (written here)",
        f"interval\t{read_interval(conf, interval)}",
        "# pagename<TAB>name in the header of the settings page (empty = InkSights)",
        f"pagename\t{page_name}",
        "# id<TAB>types<TAB>boxes<TAB>rows<TAB>sort<TAB>order<TAB>warn<TAB>rot<TAB>page<TAB>pins<TAB>title"
        "<TAB>style<TAB>hidden<TAB>name<TAB>ssid<TAB>password<TAB>host<TAB>server<TAB>ap<TAB>ap ssid<TAB>ap password<TAB>ap delay"
        "<TAB>fast<TAB>system<TAB>network<TAB>zfs<TAB>pages<TAB>system icons<TAB>header<TAB>panel<TAB>wifi icons<TAB>layout<TAB>header on"
        "<TAB>net sort<TAB>net order<TAB>net hidden<TAB>net icons<TAB>net bar<TAB>drive temps<TAB>stby<TAB>header inverted<TAB>header color<TAB>refresh"
        "<TAB>time format<TAB>date<TAB>weekday<TAB>date format<TAB>ntp<TAB>ntp server<TAB>time zone<TAB>posix time zone"
        "<TAB>start screen<TAB>nothing to ink<TAB>no connection<TAB>divider line<TAB>page order<TAB>just time<TAB>time header<TAB>header fill<TAB>time color<TAB>time frame"
        "<TAB>picture ink<TAB>picture flags<TAB>card order<TAB>picture windows<TAB>sober<TAB>ota<TAB>picture clocks",
        "#   '-' = empty. boxes 0 = timer off, rows 0 = auto, warn = highlight from % used (0 = never),",
        "#   rot = degrees clockwise (0, 90, 180, 270), page = seconds between page turns (0 = off),",
        "#   pins = cs,dc,rst,busy (rst/busy -1 = none, '-' = keep the pins of the display),",
        "#   style = timer,ring direction,symbols,details in the bar,capacity instead of percentage,decimals of the percentage (0-2),",
        "#   hidden = uids not shown, name = name on this page,",
        "#   ssid ... ap password = WiFi settings (hex encoded UTF-8), sent to the display over USB;",
        "#   ap delay = seconds without WiFi before the display opens its setup access point (0-3600),",
        "#   fast = seconds between fast refreshes (0 = off; from refresh), system = system page components cpu,ram,net,nvme,ssd,hdd",
        "#   ('-' = no system page; types '-' = only the system page),",
        "#   network = interface for the system page ('-' = the one with the default route),",
        "#   zfs = ZFS cache on the system page 1 = shown / 0 = hidden,",
        "#   pages = pages switched on: system,disks,network,time,wifi or none (the settings below a page stay when it is off),",
        "#   system icons = symbols on the system page 1 = on / 0 = off, header = 1 the layout shows the uptime,",
        "#   panel = panel type 1-8 (1 GDEW0213Z16, 2 GDEH0213Z19, 3 GDEY0213Z98, 4 GDEY0213B74, 5 GDEY042T81, 6-8 = 1-3 yellow;",
        "#   '-' = keep the panel type of the display), wifi icons = symbols on the WiFi page 1 = on / 0 = off,",
        "#   layout = header left, middle, right: T title, P page number, U uptime, C time, - nothing",
        "#   (lower case = highlighted; default TCP), header on = header line 1 = shown / 0 = off",
        "#   net sort = network pages by name or manual (net order first), net hidden = interfaces not shown,",
        "#   net icons = symbols 1 = on / 0 = off, net bar = details in the bar 0 none / 1 percentage / 2 link speed,",
        "#   drive temps = temperatures on the drive pages 1 = on / 0 = off, stby = asleep hard disks 1 = STBY / 0 = --,",
        "#   header inverted = 1 white header with black text / 0 black with white text",
        "#   header color = inverted header: 1 highlighted places in the third colour / 0 black,",
        "#   refresh = seconds between updates of this display (under 60 = fast refresh, black/white panels only),",
        "#   time format = 0 24 hours / 1 12 hours with AM/PM / 2 without; time page (pages: time): date, weekday 1/0, date format 0 26 Oct 2026 /",
        "#   1 2026-10-26 / 2 10/26/2026 / 3 26.10.2026, ntp 1/0 (boards with WiFi), ntp server, time zone and its POSIX rule,",
        "#   start screen, nothing to ink, no connection = 1 shown when needed (default) / 0 never (Advanced Ink),",
        "#   divider line = the line at the bottom of the inverted header 1 on (default) / 0 off,",
        "#   page order = S system, D drives, N network, T time, W WiFi, each once (default SDNTW),",
        "#   just time = 1 only the time page (the pages stay as set) / 0 the pages (default),",
        "#   time header = the time page with the header line 1 / 0 without (default),",
        "#   header fill = 1 the whole header in the colour of the highlighted boxes / 0 only the boxes (default),",
        "#   time color, time frame = time page: the time in the third colour 1 / 0, with a black outline 1 / 0,",
        "#   picture ink = The Conversation, The Intermission, The Afterhours used 1 / 0 (default 111),",
        "#   picture flags = per picture one hex digit: 1 caption, 2 header, 4 in the page turn, 8 scheduled (default 011),",
        "#   card order = the pages and the pictures C I A, each once (their place in the page turn),",
        "#   picture windows = HHMM-HHMM of each picture (scheduled: only that picture), sober = Beverages 0 House Wine / 1 Tabula Rasa / 2 Roast,",
        "#   ota = firmware updates of this display from the settings page 1 allowed / 0 off,",
        "#   picture clocks = Got the time? (a wall clock showing the time now) for C I A, 1 / 0 each (default 000)",
    ]
    for did, s in sorted(conf.items()):
        order = ",".join(s["order"]) or "-"
        pins = ",".join(str(p) for p in s["pins"]) if s["pins"] else "-"
        style = f"{s.get('timer', 0)},{s.get('ringDir', 0)},{s.get('icons', 1)},{s.get('pctBar', 1)},{s.get('barCap', 0)},{s.get('pctDec', 1)}"
        hidden = ",".join(s.get("hidden") or []) or "-"
        w = s.get("wifi") or wifi_defaults()
        wifi = [to_hex(w["ssid"]), to_hex(w["pass"]), to_hex(w["host"]), to_hex(w["server"]),
                "1" if w["apOn"] else "0", to_hex(w["apSsid"]), to_hex(w["apPass"]),
                str(w.get("apDelay", DEFAULT_AP_DELAY))]
        lines.append("\t".join([did, ",".join(s["types"]) or "-", str(s["boxes"]), str(s["rows"]), s["sort"], order,
                                str(s["warn"]), str(s["rot"]), str(s["page"]), pins, s["name"] or "-",
                                style, hidden, s.get("dname") or "-", *wifi,
                                str(s.get("fast", 0)), ",".join(s.get("sys") or []) or "-", s.get("net") or "-", str(s.get("zfs", 0)),
                                ",".join(p for p, k, d in (("system", "showSys", 1), ("disks", "showDisks", 1), ("network", "showNet", 0), ("time", "showTime", 0), ("wifi", "showWifi", 0))
                                         if s.get(k, d)) or "none",   # "-" would read as the defaults (an earlier version)
                                str(s.get("sysIcons", 1)),
                                "1" if layout_ok(s.get("layout")) and "U" in s["layout"].upper() else "0",
                                str(s["panel"]) if s.get("panel") in PANELS else "-", str(s.get("wifiIcons", 1)),
                                s.get("layout") if layout_ok(s.get("layout")) else DEFAULT_LAYOUT,
                                str(s.get("showHeader", 1)), s.get("netSort", "name"),
                                ",".join(s.get("netOrder") or []) or "-", ",".join(s.get("netHidden") or []) or "-",
                                str(s.get("netIcons", 1)), str(s.get("netBar", 1)), str(s.get("driveTemp", 0)), str(s.get("stby", 1)), str(s.get("headInv", 0)), str(s.get("headCol", 0)),
                                str(s.get("refresh", DEFAULT_REFRESH)),
                                str(2 if s.get("timeFmt") == 1 and s.get("ampm", 1) == 0 else s.get("timeFmt", 0)), str(s.get("timeDate", 1)), str(s.get("timeWday", 1)), str(s.get("dateFmt", 0)),
                                str(s.get("ntp", 0)), s.get("ntpServer") or "pool.ntp.org", s.get("tz") or "UTC", s.get("tzPosix") or "UTC0",
                                str(s.get("inkSplash", 1)), str(s.get("inkNothing", 1)), str(s.get("inkNoData", 1)),
                                str(s.get("lineBottom", 0)),
                                s.get("pageOrder") if page_order_ok(s.get("pageOrder")) else DEFAULT_PAGE_ORDER,
                                str(s.get("justTime", 0)), str(s.get("timeHead", 0)), str(s.get("headFill", 0)),
                                str(s.get("timeColor", 0)), str(s.get("timeFrame", 0)), *pics_to_conf(s), str(s.get("ota", 1)),
                                "".join(str(s.get(p + "Clock", 0)) for p, _, _, _ in PICS)]))
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".conf.")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(lines) + "\n")
        os.chmod(tmp, 0o640)   # holds WiFi passwords: not readable for everybody
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def write_atomic(path, text, mode=0o644):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp.")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


FRAME_ARGS = {   # what a WiFi display reports when it fetches its frame
    "size": re.compile(r"^[0-9]{2,4}x[0-9]{2,4}$"),
    "colors": re.compile(r"^[23]$"),
    "rows": re.compile(r"^[0-9]{1,2}$"),
    "pins": re.compile(r"^-?[0-9]{1,2},-?[0-9]{1,2},-?[0-9]{1,2},-?[0-9]{1,2}$"),
    "panel": re.compile(r"^[1-8]$"),
    "board": re.compile(r"^[a-z0-9-]{1,40}$"),
    "fw": re.compile(r"^[0-9.]{1,10}$"),
    "ip": re.compile(r"^[0-9.]{7,15}$"),
    "fast": re.compile(r"^[01]$"),
    "ssid": re.compile(r"^([0-9a-f]{2}){1,32}$"),   # the stored WiFi network, UTF-8 hex encoded
}
SEEN_EVERY = 10   # seconds; fast displays fetch every few seconds, the data folder is only written this often
WIFI_LOCK = threading.Lock()
# What the panel of a WiFi display shows, reported with every fetch (live=<page>,<s since the last
# redraw>,<s until the next page turn>): kept in memory only, for Sync with display on the page
PANEL_NOW = {}
PANEL_NOW_RE = re.compile(r"^([0-9]{1,3}),([0-9]{1,8}),(-1|[0-9]{1,6})$")


def wifi_frame(data_dir, run_dir, query):
    """GET /api/frame from a WiFi display: note what it reported, return its frame (or None)"""
    q = {k: v[0] for k, v in parse_qs(query, keep_blank_values=True).items() if v}
    did = q.get("id", "")
    if not ID_RE.match(did):
        return None, 400
    info = {k: q[k] for k, rx in FRAME_ARGS.items() if k in q and rx.match(q[k])}
    if "size" not in info:
        return None, 400
    answer = "".join(c for c in q.get("answer", "")[:100] if 32 <= ord(c) < 127)
    ota_line = ota_note(did, "".join(c for c in q.get("ota", "")[:80] if 32 <= ord(c) < 127), info.get("fw", ""))
    m = PANEL_NOW_RE.match(q.get("live", ""))
    if m:
        with WIFI_LOCK:
            PANEL_NOW[did] = {"at": int(time.time()), "shown": int(m[1]), "drawn": int(m[2]), "turn": int(m[3])}
            while len(PANEL_NOW) > 64:
                PANEL_NOW.pop(next(iter(PANEL_NOW)))
    wdir = os.path.join(data_dir, WIFI_DIR)
    with WIFI_LOCK:
        os.makedirs(wdir, exist_ok=True)
        known = [n for n in os.listdir(wdir) if n.endswith(".info")]
        info_path = os.path.join(wdir, did + ".info")
        if not os.path.exists(info_path) and len(known) >= MAX_DISPLAYS:
            return None, 429
        text = "".join(f"{k}={info[k]}\n" for k in FRAME_ARGS if k in info)
        try:
            with open(info_path, encoding="utf-8") as f:
                same = f.read() == text
        except OSError:
            same = False
        if not same:   # only on changes: the script starts a full run when this file changes
            write_atomic(info_path, text)
        seen_path, now = os.path.join(wdir, did + ".seen"), int(time.time())
        try:
            with open(seen_path, encoding="utf-8") as f:
                last, last_answer = (f.read().split("\n") + ["", ""])[:2]
            fresh = last.isdigit() and now - int(last) < SEEN_EVERY and last_answer == answer
        except OSError:
            fresh = False
        if not fresh:
            write_atomic(seen_path, f"{now}\n{answer}\n")
        try:
            with open(os.path.join(run_dir, FRAMES_DIR, did + ".txt"), encoding="utf-8") as f:
                frame = f.read(16384)
        except OSError:
            return None, 204   # no frame yet: the script writes it within seconds
        redraw = os.path.join(wdir, did + ".redraw")
        if os.path.exists(redraw) and "#END" in frame:   # "Redraw now": once, with this frame
            frame = frame.replace("#END", "R\n#END", 1)
            os.unlink(redraw)
    if ota_line and ota_allowed() and ota_display_on(data_dir, did) and "#END" in frame:   # a firmware update waits: fetched after this frame
        frame = frame.replace("#END", ota_line + "\n#END", 1)
    return frame, 200


# ------------------------------------------------------------ firmware updates over WiFi (OTA)
OTA = {}           # display id -> {"state", "version", "pct", "error", "at", "size", "md5", "data"}
OTA_LOCK = threading.Lock()
OTA_WAIT = 600     # seconds a display may take to fetch the update (it asks every 30 s)
OTA_KEEP = 600     # seconds "done" / "failed" stay on the page
OTA_OFF_TEXT = "Firmware updates are switched off on the server (OTA in the Docker settings)."
OTA_DISPLAY_OFF_TEXT = "Firmware updates are switched off for this display (OTA in its Advanced Ink card)."


def ota_display_on(data_dir, did):
    """OTA of the saved settings of display did (Advanced Ink card), on unless switched off"""
    conf, _, _ = read_conf(os.path.join(data_dir, CONF_NAME))
    return conf.get(did, {}).get("ota", 1) != 0


def ota_switch(text):
    """--ota / INKSIGHTS_OTA: on (default) or off; off = no firmware updates from this page at all"""
    return (text or "on").strip().lower() not in ("off", "0", "no", "false")


OTA_ON = [True]   # set in main(): --ota / INKSIGHTS_OTA

# ------------------------------------------------------------ login
# Off by default (user): the page is open. Switched on in the Login card (a password set there) or with
# LOGIN_PASSWORD in the Docker settings (-> INKSIGHTS_PASSWORD); then the page asks for a user name
# (LOGIN_USER, default inksights) and the password (the browser's login window). The boards fetch their
# frame and their firmware without it. login.json in the data folder holds what the Login card set (on/off,
# the salted hash of its password) and a mark of the Docker password of that moment. The newer change wins:
# when LOGIN_PASSWORD in the Docker settings differs from that mark at the start (changed there since),
# login.json is dropped and the Docker settings count again (forgotten password: delete login.json, or set
# a new one there).
DEFAULT_USER = "inksights"
OPEN_PATHS = ("/api/frame", "/api/firmware", "/api/health")   # the boards cannot log in; health: the Docker check
LOGIN_NAME = "login.json"
LOGIN_ROUNDS = 200000
LOGIN_LOCK = threading.Lock()


def env_mark(password):
    return hashlib.sha256(("inksights-login:" + password).encode("utf-8")).hexdigest()


def pw_hash(password, salt=None):
    salt = salt or os.urandom(16).hex()
    return f"pbkdf2_sha256${LOGIN_ROUNDS}${salt}$" + hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), LOGIN_ROUNDS).hex()


def pw_check(password, stored):
    try:
        kind, rounds, salt, digest = stored.split("$")
        got = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), int(rounds)).hex()
    except (ValueError, TypeError):
        return False
    return kind == "pbkdf2_sha256" and hmac.compare_digest(got, digest)


class Login:
    """The login of the page: off, the Docker password, or the one set in the Login card (login.json)"""
    def __init__(self, data_dir, user, password):
        self.path, self.user, self.env = os.path.join(data_dir, LOGIN_NAME), user, password or ""
        self.on, self.hash, self.ok = bool(self.env), None, set()   # ok: Authorization headers already checked (PBKDF2 is slow)
        try:
            with open(self.path, encoding="utf-8") as f:
                d = json.load(f)
            if not isinstance(d, dict):
                raise ValueError
            if d.get("env") == env_mark(self.env):
                h = d.get("hash") if isinstance(d.get("hash"), str) else None
                self.on = d.get("on", True) is True and bool(h or self.env)   # a file without "on" (older): on
                self.hash = h if self.on else None
            else:   # the Docker password was changed since: the Docker settings count again
                os.unlink(self.path)
                print("InkSights: the password in the Docker settings changed, the login set on the page is dropped", flush=True)
        except (OSError, ValueError):
            pass

    def check(self, password):
        if self.hash:
            return pw_check(password, self.hash)
        return bool(self.env) and hmac.compare_digest(password.encode(), self.env.encode())

    def header_ok(self, header):
        """Login off, or Authorization: Basic <user:password> matches"""
        if not self.on:
            return True
        key = hashlib.sha256(header.encode("utf-8", "replace")).hexdigest()
        with LOGIN_LOCK:
            if key in self.ok:
                return True
        if not header.startswith("Basic "):
            return False
        try:
            given = base64.b64decode(header[6:].strip(), validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return False
        u, sep, p = given.partition(":")
        # compare_digest: the time taken tells nothing about how much of it was right
        good = bool(sep) and hmac.compare_digest(u.encode(), self.user.encode()) & self.check(p)
        if good:
            with LOGIN_LOCK:
                if len(self.ok) > 64:
                    self.ok.clear()
                self.ok.add(key)
        return good

    def public(self):
        return {"on": self.on, "user": self.user}

    def set(self, on, current, new):
        """The Login card: switch it on (with a new password), change the password, or switch it off;
        while it is on, the current password is needed for each"""
        if self.on and not (isinstance(current, str) and self.check(current)):
            raise SettingsError("The current password is wrong.")
        h = None
        if on:
            if not isinstance(new, str) or not 8 <= len(new) <= 64 or any(ord(c) < 32 for c in new):
                raise SettingsError("The new password needs 8 to 64 characters.")
            h = pw_hash(new)
        write_atomic(self.path, json.dumps({"on": on, "hash": h, "env": env_mark(self.env)}) + "\n", mode=0o600)
        with LOGIN_LOCK:
            self.on, self.hash = on, h
            self.ok.clear()   # the old password does not work any more


def ota_allowed():
    return OTA_ON[0]


def firmware_catalog():
    """The firmware the WebUI carries: {board: {"version", "size"}} from fw/manifest.json, only boards whose
    file is there"""
    try:
        with open(os.path.join(FW_DIR, "manifest.json"), encoding="utf-8") as f:
            manifest = json.load(f)
    except (OSError, ValueError):
        return {}
    out = {}
    for board, e in manifest.items() if isinstance(manifest, dict) else []:
        if (BOARD_RE.match(board) and isinstance(e, dict) and isinstance(e.get("version"), str)
                and is_int(e.get("size")) and os.path.isfile(os.path.join(FW_DIR, board + ".bin"))):
            out[board] = {"version": e["version"], "size": e["size"]}
    return out


def wifi_board(data_dir, did):
    """board= of a WiFi display (wifi/<id>.info), "" when it never fetched a frame"""
    try:
        with open(os.path.join(data_dir, WIFI_DIR, did + ".info"), encoding="utf-8") as f:
            for line in f.read(4096).splitlines():
                if line.startswith("board=") and BOARD_RE.match(line[6:]):
                    return line[6:]
    except OSError:
        pass
    return ""


def ota_request(did, data, version):
    """An update for display did: waits for its next frame"""
    if not data or data[0] != 0xE9:
        raise SettingsError("Not an ESP32 firmware file.")
    with OTA_LOCK:
        OTA[did] = {"state": "pending", "version": version, "pct": 0, "error": "", "at": time.time(),
                    "size": len(data), "md5": hashlib.md5(data).hexdigest(), "data": data}


def ota_note(did, report, fw):
    """A frame fetch of display did: its report of the update (&ota=) and its firmware; returns the U line to
    send with the frame, "" for none"""
    now = time.time()
    with OTA_LOCK:
        o = OTA.get(did)
        if not o:
            return ""
        if o["state"] in ("done", "failed"):
            if now - o["at"] > OTA_KEEP:
                del OTA[did]
            return ""
        if report == "done" or (o["state"] == "loading" and o["pct"] >= 100 and o["version"] and fw == o["version"]):
            o.update(state="done", at=now, data=None, version=o["version"] or fw)
        elif report.startswith("failed"):
            o.update(state="failed", at=now, data=None, error=report[7:60] or "unknown")
        elif o["state"] == "loading":   # fetching frames again without restarting: the update broke off
            if now - o["at"] > 60:
                o.update(state="failed", at=now, data=None, error="the board kept its firmware")
        elif now - o["at"] > OTA_WAIT:
            o.update(state="failed", at=now, data=None, error="the board did not fetch it")
        elif o["state"] == "pending":
            return f"U|{o['size']}|{o['md5']}"
    return ""


def ota_public(did):
    """What the page shows of an update: {"state", "version", "pct", "error"} or None"""
    with OTA_LOCK:
        o = OTA.get(did)
        return {k: o[k] for k in ("state", "version", "pct", "error")} if o else None


def live_frame(run_dir, query):
    """GET /api/live: the latest frame of a display with fast refresh, for the live preview.
    Only reads (the run folder of inksights.sh): {"frame": text, "age": seconds}, frame null if none"""
    did = parse_qs(query).get("id", [""])[0]
    if not ID_RE.match(did):
        return {"frame": None, "age": -1}
    best = None
    for sub in (FRAMES_DIR, LIVE_DIR):   # WiFi displays, USB displays
        path = os.path.join(run_dir, sub, did + ".txt")
        try:
            mtime = os.path.getmtime(path)
            if best is None or mtime > best[0]:
                with open(path, encoding="utf-8") as f:
                    best = (mtime, f.read(16384))
        except OSError:
            pass
    if best is None:
        return {"frame": None, "age": -1}
    return {"frame": best[1], "age": max(0, int(time.time() - best[0]))}


REDRAW_LOCK = threading.Lock()


def request_redraw(path, did):
    """Add a chip ID to the redraw requests (one per line, written atomically)"""
    with REDRAW_LOCK:
        ids = []
        try:
            with open(path, encoding="utf-8") as f:
                ids = [x.strip() for x in f if ID_RE.match(x.strip())]
        except OSError:
            pass
        ids = list(dict.fromkeys(ids + [did]))[:MAX_DISPLAYS]
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".redraw.")
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
                f.write("\n".join(ids) + "\n")
            os.chmod(tmp, 0o644)
            os.replace(tmp, path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise


def app_user():
    return f"user {os.getuid()}" if hasattr(os, "getuid") else "the app user"


def data_problem(data_dir):
    """Can the app use its data folder? -> problem for the settings page, "" = fine (no write, cheap)"""
    if not os.path.isdir(data_dir):
        return f"Data folder {data_dir} not found. Check the volume of the container."
    if not os.access(data_dir, os.W_OK | os.X_OK):
        return (f"The app ({app_user()}) cannot write to its data folder, so settings cannot be saved. "
                "Give the folder to the app user (README: Check the app user).")
    conf = os.path.join(data_dir, CONF_NAME)
    if os.path.exists(conf) and not os.access(conf, os.W_OK):
        return (f"The app ({app_user()}) cannot change {CONF_NAME}, so settings cannot be saved. "
                "Give the file to the app user (README: Check the app user).")
    return ""


def prepare_data_dir(data_dir):
    """At the start: try a real write, and create the settings file with the defaults if it is missing
    (never overwrites one). The settings file is only ever written by this app."""
    problem = data_problem(data_dir)
    if not problem:
        try:
            fd, tmp = tempfile.mkstemp(dir=data_dir, prefix=".write-test.")
            os.close(fd)
            os.unlink(tmp)
            conf = os.path.join(data_dir, CONF_NAME)
            if not os.path.exists(conf):
                write_conf(conf, {}, DEFAULT_INTERVAL, "")
                print(f"InkSights: created {conf} with the defaults", flush=True)
        except OSError as e:
            problem = (f"The app ({app_user()}) cannot write to its data folder ({e.strerror}), so settings cannot "
                       "be saved. Give the folder to the app user (README: Check the app user).")
    if problem:
        print(f"InkSights: {problem}", flush=True)


def load_state(data_dir):
    try:
        with open(os.path.join(data_dir, STATE_NAME), encoding="utf-8") as f:
            state = json.load(f)
        return state if isinstance(state, dict) else {}
    except (OSError, ValueError):
        return {}


class Handler(BaseHTTPRequestHandler):
    server_version = "InkSights"

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj).encode("utf-8"), "application/json; charset=utf-8")

    def _logged_in(self, path):
        """The page and its API need the login; else answer 401 (the browser then asks for it)"""
        if path in OPEN_PATHS or self.server.login.header_ok(self.headers.get("Authorization", "")):
            return True
        if self.headers.get("Authorization"):
            time.sleep(1)   # a wrong password: slows down guessing
        body = b"Login required."
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="InkSights", charset="UTF-8"')
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return False

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        data_dir = self.server.data_dir
        if not self._logged_in(path):
            return
        if path in STATIC:
            name, ctype = STATIC[path]
            try:
                with open(os.path.join(WEB_DIR, name), "rb") as f:
                    self._send(200, f.read(), ctype)
            except OSError:
                self._json(404, {"error": f"{name} is missing next to inksights-web.py"})
        elif path == "/api/health":   # the Docker health check (no login, tells nothing)
            self._json(200, {"ok": True})
        elif path == "/api/state":
            conf, interval, page_name = read_conf(os.path.join(data_dir, CONF_NAME))
            state = load_state(data_dir)
            with WIFI_LOCK:   # WiFi displays: what their panel shows (Sync with display)
                for d in state.get("displays", []) if isinstance(state, dict) else []:
                    if isinstance(d, dict) and d.get("transport") == "wifi" and d.get("id") in PANEL_NOW:
                        d["panelNow"] = PANEL_NOW[d["id"]]
            for d in state.get("displays", []) if isinstance(state, dict) else []:   # firmware updates running
                if isinstance(d, dict) and isinstance(d.get("id"), str) and ota_public(d["id"]):
                    d["ota"] = ota_public(d["id"])
            self._json(200, {"state": state, "config": public_conf(conf), "interval": interval,
                             "pagename": page_name, "defaultPagename": DEFAULT_PAGE_NAME,
                             "problem": data_problem(data_dir), "version": VERSION,
                             "versionCheck": True,   # the version line and the About card: WebUI, script and firmware
                             # the Login card: on or off, the user name
                             "login": self.server.login.public(),
                             "otaEnabled": self.server.ota_on,   # OTA switched off in the Docker settings: no updates
                             "firmware": self.server.firmware})   # the firmware the WebUI carries per board (OTA)
        elif path == "/api/firmware":   # a WiFi display fetches its update
            did = parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "").get("id", [""])[0]
            with OTA_LOCK:
                o = OTA.get(did) if ID_RE.match(did) else None
                data = o["data"] if o and o["state"] in ("pending", "loading") else None
                if data:
                    o.update(state="loading", pct=0, at=time.time())
            if not data:
                return self._json(404, {"error": "No update waiting."})
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                for i in range(0, len(data), 4096):
                    self.wfile.write(data[i:i + 4096])
                    with OTA_LOCK:
                        o.update(pct=min(100, (i + 4096) * 100 // len(data)), at=time.time())
                self.log_message("firmware sent to display %s (%d bytes)", did, len(data))
            except OSError:
                with OTA_LOCK:
                    o.update(state="failed", at=time.time(), data=None, error="download interrupted")
        elif path == "/api/frame":
            try:
                frame, code = wifi_frame(data_dir, self.server.run_dir, self.path.split("?", 1)[1] if "?" in self.path else "")
            except OSError as e:
                self.log_message("cannot write to %s: %s", data_dir, e)
                return self._send(500, b"", "text/plain")
            self._send(code, (frame or "").encode("utf-8"), "text/plain; charset=utf-8")
        elif path == "/api/live":
            self._json(200, live_frame(self.server.run_dir, self.path.split("?", 1)[1] if "?" in self.path else ""))
        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        data_dir = self.server.data_dir
        if not self._logged_in(path):
            return
        if path in ("/api/ota", "/api/ota-file") and not self.server.ota_on:
            return self._json(403, {"error": OTA_OFF_TEXT})
        if path == "/api/ota-file":   # manual update: the firmware file itself (not a form: no other website can send it)
            return self._ota_file(data_dir)
        # JSON only: another website cannot send this from your browser without asking first
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            return self._json(415, {"error": "Only JSON is accepted."})
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if not 0 <= length <= MAX_BODY:
            return self._json(413, {"error": "Request too large."})
        raw = self.rfile.read(length)

        try:
            if path in ("/api/config", "/api/validate"):
                try:
                    data = json.loads(raw or b"{}")
                    if not isinstance(data, dict):
                        raise SettingsError("Invalid data.")
                    old_conf, _, _ = read_conf(os.path.join(data_dir, CONF_NAME))
                    conf = validate(data.get("displays"), old_conf)
                    interval = read_interval(conf)   # the shortest refresh of the displays
                    page_name = data.get("pagename", "")
                    if not isinstance(page_name, str) or not PAGE_NAME_RE.match(page_name):
                        raise SettingsError("Name: max. 32 characters, no tabs or line breaks.")
                    page_name = page_name.strip()
                except SettingsError as e:
                    return self._json(400, {"error": str(e)})
                except ValueError:   # broken JSON
                    return self._json(400, {"error": "Invalid data."})
                if path == "/api/validate":   # import of a backup: only checked, nothing written
                    return self._json(200, {"ok": True})
                write_conf(os.path.join(data_dir, CONF_NAME), conf, interval, page_name)
                self.log_message("settings saved for %d display(s)", len(conf))
                self._json(200, {"ok": True})
            elif path == "/api/ota":   # update a WiFi display with the firmware the WebUI carries for its board
                try:
                    data = json.loads(raw or b"{}")
                except ValueError:
                    return self._json(400, {"error": "Invalid data."})
                did = data.get("id") if isinstance(data, dict) else None
                if not isinstance(did, str) or not ID_RE.match(did):
                    return self._json(400, {"error": "Invalid display ID."})
                if not ota_display_on(data_dir, did):
                    return self._json(403, {"error": OTA_DISPLAY_OFF_TEXT})
                board = wifi_board(data_dir, did)
                if not board:
                    return self._json(400, {"error": "This display has not fetched a frame over WiFi."})
                fw = self.server.firmware.get(board)
                if not fw:
                    return self._json(400, {"error": "The WebUI carries no firmware for this board."})
                try:
                    with open(os.path.join(FW_DIR, board + ".bin"), "rb") as f:
                        ota_request(did, f.read(MAX_FW + 1)[:MAX_FW], fw["version"])
                except SettingsError as e:
                    return self._json(400, {"error": str(e)})
                self.log_message("firmware %s requested for display %s", fw["version"], did)
                self._json(200, {"ok": True})
            elif path == "/api/refresh":
                with open(os.path.join(data_dir, REFRESH_NAME), "w", encoding="utf-8"):
                    pass
                self._json(200, {"ok": True})
            elif path == "/api/login":   # the Login card: switch the login on or off, change its password
                try:
                    data = json.loads(raw or b"{}")
                    if not isinstance(data, dict) or not isinstance(data.get("on"), bool):
                        raise ValueError
                    was = self.server.login.on
                    self.server.login.set(data["on"], data.get("current"), data.get("next"))
                except SettingsError as e:
                    time.sleep(1)   # a wrong password: slows down guessing
                    return self._json(400, {"error": str(e)})
                except ValueError:
                    return self._json(400, {"error": "Invalid data."})
                self.log_message("login of the settings page " + ("switched off" if not data["on"] else "password changed" if was else "switched on"))
                self._json(200, {"ok": True})
            elif path == "/api/redraw":
                try:
                    data = json.loads(raw or b"{}")
                except ValueError:
                    return self._json(400, {"error": "Invalid data."})
                did = data.get("id") if isinstance(data, dict) else None
                if not isinstance(did, str) or not ID_RE.match(did):
                    return self._json(400, {"error": "Invalid display ID."})
                request_redraw(os.path.join(data_dir, REDRAW_NAME), did)
                if os.path.exists(os.path.join(data_dir, WIFI_DIR, did + ".info")):   # WiFi display: with its next frame
                    with open(os.path.join(data_dir, WIFI_DIR, did + ".redraw"), "w", encoding="utf-8"):
                        pass
                self.log_message("redraw requested for display %s", did)
                self._json(200, {"ok": True})
            else:
                self._json(404, {"error": "Not found"})
        except OSError as e:
            self.log_message("cannot write to %s: %s", data_dir, e)
            self._json(500, {"error": "Cannot write to the data folder. Does user 568 (apps) have write access?"})

    def _ota_file(self, data_dir):
        did = parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "").get("id", [""])[0]
        if self.headers.get("Content-Type", "") != "application/octet-stream":
            return self._json(415, {"error": "Only a firmware file is accepted."})
        if not ID_RE.match(did) or not wifi_board(data_dir, did):
            return self._json(400, {"error": "This display has not fetched a frame over WiFi."})
        if not ota_display_on(data_dir, did):
            return self._json(403, {"error": OTA_DISPLAY_OFF_TEXT})
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if not 0 < length <= MAX_FW:
            return self._json(413, {"error": "The file is too big for a firmware."})
        try:
            ota_request(did, self.rfile.read(length), "")
        except SettingsError as e:
            return self._json(400, {"error": str(e)})
        self.log_message("firmware file uploaded for display %s (%d bytes)", did, length)
        self._json(200, {"ok": True})

    def log_message(self, fmt, *args):
        # The page asks for the state every 10 s; keep those requests out of the log
        if self.command == "GET" and not fmt.startswith("cannot"):
            return
        super().log_message(fmt, *args)


def main():
    ap = argparse.ArgumentParser(description="Settings page for InkSights")
    ap.add_argument("--data", default="/data", help="data folder shared with inksights.sh")
    ap.add_argument("--port", type=int, default=8099)
    ap.add_argument("--run", default="/run/inksights",
                    help="run folder of inksights.sh (/var/run/inksights on the host): frames of the WiFi displays")
    ap.add_argument("--user", default=os.environ.get("INKSIGHTS_USER") or DEFAULT_USER,
                    help=f"user name of the login (also INKSIGHTS_USER; default {DEFAULT_USER})")
    ap.add_argument("--password", default=os.environ.get("INKSIGHTS_PASSWORD") or "",
                    help="password of the login (also INKSIGHTS_PASSWORD; default none: no login, unless one is switched on in the Login card)")
    ap.add_argument("--ota", default=os.environ.get("INKSIGHTS_OTA", "on"),
                    help="firmware updates over WiFi from this page: on (default) or off (also INKSIGHTS_OTA)")
    args = ap.parse_args()

    server = ThreadingHTTPServer(("", args.port), Handler)
    server.data_dir = args.data
    server.run_dir = args.run
    server.ota_on = OTA_ON[0] = ota_switch(args.ota)
    server.login = Login(args.data, args.user, args.password)
    server.firmware = firmware_catalog() if server.ota_on else {}   # the files do not change while the app runs
    print(f"InkSights: port {args.port}, data folder {args.data}, firmware updates {'on' if server.ota_on else 'off'}", flush=True)
    prepare_data_dir(args.data)
    server.serve_forever()


if __name__ == "__main__":
    main()
