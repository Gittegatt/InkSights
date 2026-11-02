# Protocol

The lines between the script and a board (USB) and what a WiFi board fetches. See
[README](../README.md) for the rest.

```
PING                                   -> PONG InkSights id=1A2B3C4D size=212x104 colors=3 rows=4 pins=7,9,6,5 panel=1 board=xiao-samd21 wifi=0 fw=1.1.2
#BEGIN
H|HDD|14:30|5|85|0|600
D|sda|data|3.18T|8.95T|35|3|10|A
#END                                   -> OK disks=1 page=1/1 refresh=now shown=1 drawn=0 turn=-1
```

**Answer:** `page=` the page after this frame, `refresh=` whether it redraws now, later (at most every 3 minutes) or
not at all (nothing changed); `shown=` the page on the panel (0 = start screen), `drawn=` seconds since the last
redraw, `turn=` seconds until the next page turn (-1 = none): for **Sync with display**. A WiFi board sends the answer and
the panel status with its next fetch.

**PONG:**

- `colors=3` colour panel, `colors=2` black/white
- `panel=` the panel type: 1-5 in the order of the [Panels](../README.md#panels) table, 6-8 the yellow versions of 1-3
- a WiFi board also reports `net=sta|ap|off`, `ip=…` and its stored WiFi settings without the passwords: `ssid=`,
  `host=`, `server=`, `apssid=` (hex encoded, only when set), `ap=1|0`, `apdelay=`, `pass=1|0` (= a password is
  stored)
- a panel with fast refresh adds `fast=1`

| Line | Fields | Notes |
|---|---|---|
| `H` | title, time, rows, highlight from %, quarter turns, page turn in seconds [, the 30 optional fields below] | The settings of the screen. |
| `A` | per picture C I A one hex digit (1 caption, 2 header, 4 in the page turn, 8 scheduled), Beverages 0 House Wine / 1 Tabula Rasa / 2 Roast, card order (`SDNTW`, `K` and `CIA`), time windows `HHMM-HHMM,HHMM-HHMM,HHMM-HHMM` [, Got the time? per picture C I A `1`/`0`, the Refresh in seconds; missing = none] | The pictures; only when they differ from the defaults (`011`, 1, page order + `CIA`, `1800-1900,1200-1300,2300-0700`; a new display has Roast, so it gets this line). |
| `D` | device, pool, used, total, percent, filled boxes, total boxes, state, seconds until spindown, timeout seconds [, °C] | One per drive. |
| `S` | rows, CPU %, CPU °C, CPU W, RAM used MiB, ZFS cache MiB, RAM total MiB, interface, down KiB/s, up KiB/s, link Mb/s, NVMe °C,…, SSD °C,… | Only with the system page. |
| `C` | local date and time `YYYYMMDDHHMMSS`, date 1/0, weekday 1/0, date format 0-3, NTP 1/0, NTP server, POSIX time zone [, time in the third colour 1/0, black outline 1/0] | Only with the time page. |
| `T` | HDD °C,… | After the `S` line, only with the HDD row and drive-temp-export running. |
| `N` | interface, down KiB/s, up KiB/s, link Mb/s, wireless 1/0, state | Only with the network pages, one per interface, at most 8. |
| `K` | container (or stack), state, update 1/0 | Only with the Docker pages, one per row in the order shown, at most 24. |
| `P` | CS, D/C, Reset, Busy [, panel] | Only when pins or the panel type are set on the settings page. |
| `W` | network, password, host, settings page, access point 1/0, access point name, access point password, access point after (s) | USB only, boards with WiFi; texts hex encoded. |
| `R` | - | Only after "Redraw now". |
| `U` | size, MD5 | WiFi only: a firmware update waits. The board fetches it from the settings page, checks it and restarts with it; the result goes with its next fetch. |

**Optional fields of the `H` line,** in this order (`H` itself is field 1):

| # | Field | Values |
|---|---|---|
| 8 | timer | 0 badge / 1 ring / 2 none (spindown timer off; the `D` lines keep the real state for the symbol) |
| 9 | ring direction | 0 clockwise / 1 counterclockwise |
| 10 | symbols | 1 on / 0 off |
| 11 | details in the bar | 0 none / 1 percentage / 2 used capacity |
| 12 | fast refresh | seconds, 0 = off |
| 13 | uptime | minutes after the full calendar months, -1 = none |
| 14 | uptime months | full calendar months |
| 15 | WiFi page | 0 off / 1 with symbols / 2 without |
| 16 | no data after | seconds without fresh data before "NO DATA", 0 = never |
| 17 | header layout | left, middle, right as three letters: `T` title, `P` page number, `U` uptime, `C` time, `-` nothing; lower case = highlighted (default `TCP`, `---` = no top line) |
| 18 | drive pages | 1 on / 0 off (with no system or network page either: "Nothing to ink") |
| 19 | network details | 0 none / 1 percentage / 2 link speed |
| 20 | network symbols | 1 on / 0 off |
| 21 | drive temperatures | 1 on / 0 off (the D lines then carry them) |
| 22 | asleep | hard disks asleep 1 `STBY` / 0 `--` |
| 23 | header inverted | 1 white / 0 black |
| 24 | header colour | inverted top line: highlighted places 1 in the third colour / 0 black |
| 25 | time format | 0 24 hours / 1 12 hours with AM/PM / 2 12 hours without |
| 26 | screens | shown when needed: 1 start screen + 2 Nothing to ink + 4 Check connection (default 7; 2 and 4 only with the Ink of their picture on) |
| 27 | divider line | 1 below the top line / 0 none (default 1) |
| 28 | page order | `S` system, `D` drives, `N` network, `T` time, `W` WiFi, each once, `K` Docker once or not at all (missing: after `N`; default `SDNTW`) |
| 29 | time page header | 1 with the top line / 0 without (default 0) |
| 30 | header fill | 1 the top line filled in the third colour / 0 (default 0, sent only with header inverted and header colour) |
| 31 | network pages | 1 on / 0 off (on without interfaces: the page "No interfaces") |
| 32 | Docker pages | 0 off / 1 with symbols / 2 without |
| 33 | Docker show | 0 all / 1 errors / 2 updates / 3 both (only for the text when no `K` line came) |
| 34 | Docker colour | `error` and `update` 1 in the third colour / 0 black (default 1) |
| 35 | Docker highlight | `error` and `update` 1 in a box / 0 (default 0) |
| 36 | Docker on cue | 1 no Docker page when no `K` line came / 0 (default 0) |
| 37 | Docker found | 1 (default) / 0 no Docker on the system: the Docker page says **Docker not found** |

**Notes on the other lines:**

- `D`:
  - °C only with drive temperatures on; -1 = unknown, -2 = asleep (older firmware shows `--`)
  - the boxes are no longer drawn
  - seconds until spindown -1 = timer not running
  - state: `A` spinning, `S` asleep, `N` SSD/NVMe, `?` unknown (`-` from older scripts: timer off, shown as spinning)
  - percent may have one or two decimals (cut) for the text in the bar; -1 = no pool and nothing mounted (total =
    the size of the disk, or `-`)
- `S`: rows `C` CPU, `R` RAM, `N` network, `V` NVMe, `S` SSD, `H` HDD (temperatures in the `T` line), `I` = symbols
  on, `W` = the interface is wireless, `D` / `L` = it is down / has no link. -1 = unknown, `-` = none; at most six
  temperatures each.
- `C`: without NTP the board counts on from the date and time; server and zone `-` without NTP. The outline only
  with the colour; both only on colour panels.
- `T`: -1 = unknown, -2 = asleep, at most six.
- `N`: state `U` up, `L` no link, `D` down.
- `K`: state `R` running, `E` error, `S` stopped.
- `P`: pin numbers of the board (D numbers on the SAMD21, GPIO numbers on the ESP32 boards). New values → store and
  restart.
- `R`: redraw right away, even without changes and before the 3 minutes are up.

WiFi boards fetch the same frame with `GET /api/frame?id=…&size=…` from the settings page; their answer goes along
with the next request.
