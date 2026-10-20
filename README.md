# InkSights

Repository: https://github.com/Gittegatt/InkSights

Shows the drive status of a NAS server on small e-paper displays, and on request a system page with CPU, RAM,
network and drive temperatures. Every display hangs on its own small board, plugged into the NAS server via USB
or (boards with WiFi) running anywhere in reach of the WiFi. All settings are made on a small web page.

**Contents**

- [Getting started](#getting-started)
- [What a display shows](#what-a-display-shows)
- [Supported hardware](#supported-hardware)
- [How it fits together](#how-it-fits-together)
- [1. Wiring](#1-wiring)
- [2. Upload the firmware](#2-upload-the-firmware)
- [3. Set up on the NAS server](#3-set-up-on-the-nas-server)
- [4. WiFi (optional)](#4-wifi-optional)
- [5. The settings page](#5-the-settings-page)
- [Update](#update)
- [System page](#system-page)
- [Good to know](#good-to-know)
- [Troubleshooting](#troubleshooting)
- [Protocol (for the curious)](#protocol-for-the-curious)

## Getting started

1. **Wire** the display to its board ([1. Wiring](#1-wiring)).
2. **Upload the firmware** to the board ([2. Upload the firmware](#2-upload-the-firmware)).
3. **On the NAS server** ([3. Set up on the NAS server](#3-set-up-on-the-nas-server)):
   get the files (`git clone`), create the data folder on an SSD for the app user, start the Docker app, start the
   script as root.
4. **Plug the board into the NAS server** via USB, or set up its WiFi ([4. WiFi](#4-wifi-optional)).
5. **Open the settings page** at `http://<server>:8099`, choose the panel type and everything else
   ([5. The settings page](#5-the-settings-page)).

## What a display shows

Per drive one row:

- **Symbol:** chip = SSD/NVMe, grey disc = hard disk spinning, light disc = hard disk asleep (can be switched off)
- **Device name** (e.g. `sda`), **pool** and **used/total**, e.g. `3.18T/8.95T`
- **Usage bar** (free = grey raster), highlighted from 85 % (third colour, inverted on black/white panels),
  optionally with the percentage or the used capacity inside the bar
- **Spindown timer** for hard disks at the right end of the bar: a **badge** with the time left (MM:SS, "SLEEP" when
  asleep) or a **ring** that shrinks until spindown (dotted when asleep)

The top line shows the title (default: name of the NAS server), the page number or the uptime, and the time.
If not all drives fit on one page, the display turns pages by itself. An optional **system page** comes first
(see [System page](#system-page)).

Works on any Linux NAS server with bash and lsblk (e.g. TrueNAS SCALE, Debian, Proxmox, Unraid), with ZFS pools
and with any other Linux filesystem (ext4, XFS, btrfs, also on RAID or LVM).

## Supported hardware

### Panels

The panel type is chosen on the settings page (**Panel** in the Display card), by the name printed on the flat
cable of the display. Every firmware drives all of them.

| Panel | Size | Colours | Fast refresh |
|---|---|---|---|
| GDEW0213Z16 (older MH-ET LIVE modules) | 2.13″ 212×104 | black/white/colour (red or yellow) | – |
| GDEH0213Z19 | 2.13″ 212×104 | black/white/colour | – |
| GDEY0213Z98 (newer modules) | 2.13″ 250×122 | black/white/colour | – |
| GDEY0213B74 | 2.13″ 250×122 | black/white | ✓ |
| GDEY042T81 (e.g. with the DESPI-C02 adapter) | 4.2″ 400×300 | black/white | ✓ |

**Fast refresh:** black/white panels redraw in under a second without flashing. Three-colour panels always need a
full refresh (about 15 seconds, flashing), even when they only show black and white.

### Boards

| Board | WiFi | PlatformIO environment |
|---|---|---|
| Seeed XIAO SAMD21 | – | `xiao-samd21` |
| Seeed XIAO ESP32-C3 | ✓ | `seeed-xiao-esp32-c3` |
| Seeed XIAO ESP32-S3 | ✓ | `seeed-xiao-esp32-s3` |
| ESP32-S3 Super Mini | ✓ | `esp32-s3-supermini` |
| Waveshare ESP32-S3-Zero | ✓ | `esp32-s3-zero` |
| ESP32-C3 Super Mini | ✓ | `esp32-c3-supermini` |
| Waveshare ESP32-C3-Zero | ✓ | `esp32-c3-zero` |
| Adafruit QT Py ESP32-S3 N4R2 | ✓ | `adafruit-qtpy-esp32-s3-n4r2` |
| Adafruit QT Py ESP32-S3 No PSRAM | ✓ | `adafruit-qtpy-esp32-s3-nopsram` |

Untested on real hardware so far: the black/white panels and drawing on the ESP32 boards.

### Spindown timer (separate project)

The spindown timer and the spinning/asleep symbols need
[truenas-sata-sas-spindown-timer](https://github.com/Gittegatt/truenas-sata-sas-spindown-timer) **v1.1.0 or newer**.
It writes the status file this project reads. Without it the display shows `--:--` (or a circle with a dash).

## How it fits together

```
Script on the NAS server (loop or cron) ──USB──> board 1 ──> e-paper (e.g. HDDs)
        │                               ──USB──> board 2 ──> e-paper (e.g. SSD + NVMe)
        │ reads settings, writes current data
        ▼
  Data folder on an SSD  <──── Docker app "settings page" (http://<server>:8099) <──WiFi── board 3 ──> e-paper
```

| Path | Content |
|---|---|
| `firmware/InkSights/` | Arduino sketch, the same for every board (`BoardProfile.h`: pins per board) |
| `platformio.ini` | PlatformIO environments, one per board |
| `scripts/` | builds the ready-made firmware files of a release (`build_release.py`) |
| `server/inksights.sh` | collects the data and sends every display its frame |
| `server/web/` | settings page (`inksights-web.py`, `index.html`, `inksights-ui.js`, `inksights-render.js`, `inksights.css`) |
| `server/docker/docker-compose.yaml` | Docker stack that runs the settings page |
| `simulator/simulator.html` | the settings page with simulated displays and data, opens in a browser straight from the folder |

## 1. Wiring

- Leave switch **BS1 on L** (4-line SPI).
- Connect VCC to **3V3**, not 5V (the boards' pins only tolerate 3.3V).
- SCLK and SDI are fixed per board. CS, D/C, Reset and Busy have defaults and can be changed on the settings page.

| Board | SCLK | SDI | CS | D/C | Reset | Busy |
|---|---|---|---|---|---|---|
| XIAO SAMD21 | D8 | D10 | D7 | D9 | D6 | D5 |
| XIAO ESP32-C3 | D8 (GPIO8) | D10 (GPIO10) | D7 (GPIO20) | D9 (GPIO9) | D6 (GPIO21) | D5 (GPIO7) |
| XIAO ESP32-S3 | D8 (GPIO7) | D10 (GPIO9) | D7 (GPIO44) | D9 (GPIO8) | D6 (GPIO43) | D5 (GPIO6) |
| ESP32-S3 Super Mini, ESP32-S3-Zero | GPIO12 | GPIO11 | GPIO10 | GPIO9 | GPIO8 | GPIO7 |
| ESP32-C3 Super Mini | GPIO4 | GPIO6 | GPIO7 | GPIO5 | GPIO3 | GPIO10 |
| ESP32-C3-Zero | GPIO4 | GPIO6 | GPIO7 | GPIO5 | GPIO3 | GPIO1 |
| QT Py ESP32-S3 (both) | SCK (GPIO36) | MO (GPIO35) | A2 (GPIO9) | A3 (GPIO8) | A0 (GPIO18) | A1 (GPIO17) |

On the XIAO boards the 3V3/GND side has D7–D10, so only Reset and Busy go to the other side.

**Reset and Busy are optional.** Set them to **None** on the settings page and 6 wires are enough. Drawbacks: the
display waits fixed times while drawing instead of using the ready signal, and it cannot go into deep sleep.
Connecting them is still recommended.

**XIAO ESP32-C3:** the default D/C pin D9 is a boot pin. It works as D/C, but if the board does not start with the
display connected, choose another pin for D/C on the settings page.

**4.2″ with the DESPI-C02 adapter:** check the resistor switch on the adapter against the documentation of
Good Display for the GDEY042T81, and insert the flat cable with the contacts facing the right way.

## 2. Upload the firmware

The same firmware goes on **every** board. Only the board is chosen when building; the panel type and the pins are
chosen later on the settings page.

### Easiest: ready-made files, nothing to install

Download the file of your board from the [releases](https://github.com/Gittegatt/InkSights/releases). The name
ends with the PlatformIO environment of the board ([Boards](#boards)), e.g.
`inksights-v1.0-esp32-c3-supermini-factory.bin`.

**ESP32 boards (`-factory.bin`) in the browser** with [ESPWebTool](https://esptool.spacehuhn.com/) (Chrome or Edge):

1. Plug in the board, click **Connect** and choose its port. Not found: hold BOOT while plugging in.
2. Keep only one file row and delete all others.
3. Set its address to `0x0000` (if `0x` is already shown in front, enter only `0`) and choose the `-factory.bin`.
4. Click **Erase**. This also removes pins, panel type and WiFi settings stored on the board.
5. Connect again if asked, then click **Program**.
6. If the board does not restart by itself, press RESET or plug it in again.

The factory image holds everything the board needs at the right places. Always flash it as one file at `0x0000`,
never split it up.

**XIAO SAMD21 (`.uf2`) by drag and drop:**

1. Plug in the board and press RESET twice quickly (the two pads next to the USB port; touch them twice with
   tweezers or a wire). The orange LED pulses and a drive named **Arduino** appears.
2. Copy `inksights-v1.0-xiao-samd21.uf2` onto that drive.
3. The board restarts with the new firmware by itself; the drive disappears.

`SHA256SUMS.txt` in the release lists the checksums of all files.

**Build the files yourself:** `python scripts/build_release.py` builds every board and writes the files to
`dist/v<version>/` (`--environment <env>` for one board only). Pushing a tag such as `v1.0` to GitHub builds them
there as well and creates a draft release with them.

### With PlatformIO or the Arduino IDE

**With PlatformIO (VS Code):** open the project folder, pick the environment of your board
([Boards](#boards)) and upload, e.g. `pio run -e esp32-c3-supermini -t upload`.
If the port is not found: SAMD21 press RESET twice quickly, ESP32 hold BOOT while plugging in.

**With the Arduino IDE:**

1. Boards:
   - XIAO SAMD21: under *File → Preferences → Additional boards manager URLs* add
     `https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json`, then install "Seeed SAMD Boards"
     and select **Seeeduino XIAO**.
   - ESP32 boards: install "esp32" by Espressif, select the board (XIAO_ESP32C3, XIAO_ESP32S3, Adafruit QT Py
     ESP32-S3; for the Super Mini and Zero boards "ESP32S3 Dev Module" or "ESP32C3 Dev Module"),
     and set *Tools → USB CDC On Boot* to **Enabled**. Generic S3 / C3 selections are taken as the Super Mini;
     for a Zero board add `#define INKSIGHTS_BOARD_ESP32_S3_ZERO` (or `..._C3_ZERO`) at the top of the sketch.
2. *Library manager*: install **GxEPD2** and **Adafruit GFX Library**, for the SAMD21 also **FlashStorage** (by cmaglie).
3. Open `firmware/InkSights/InkSights.ino` and upload it.

**Start screen.** After power-up every display shows a start screen until the first data arrives:

```
InkSights                    v1.0
ID     1A2B3C4D
Board  ESP32-C3 Super Mini
Panel  GDEW0213Z16 b/w/color
GPIO   CS7 DC5 RST3 BUSY10
WiFi   AP InkSights 192.168.4.1
       Key ink!1234
Waiting for data from system ...
```

The **ID** is the chip ID. Note which ID belongs to which display; the settings page lists the displays by it.
The WiFi lines only appear on boards with WiFi. A new board starts with the first panel type (GDEW0213Z16).

**What a new upload keeps:**

| | SAMD21 | ESP32 boards |
|---|---|---|
| Pins and panel type | back to the defaults | kept |
| WiFi settings | – | kept |
| Start from scratch | upload again | erase the flash: `pio run -e <env> -t erase -t upload` |

## 3. Set up on the NAS server

The menu paths below are from **TrueNAS SCALE 25.10**. Other systems name them differently; the steps are the
same: create a folder, start the Docker app, run the script as root.

The examples use this layout. Adjust the paths to your system:

| What | Where |
|---|---|
| Project (from GitHub) | `/home/truenas_admin/inksights/` (script: `server/inksights.sh`) |
| Docker stack | `/mnt/apps/docker/stacks/inksights/` |
| Data folder (web page files, settings, state) | `/mnt/apps/docker/data/inksights/` |

### a) Get the files

As your normal user (e.g. `truenas_admin`), one of these:

**With git (recommended, updates later with one command):**

```
git clone https://github.com/Gittegatt/InkSights.git /home/truenas_admin/inksights
```

**Without git, with curl** (only the files the NAS server needs, same folders):

```
B=https://raw.githubusercontent.com/Gittegatt/InkSights/main/server
mkdir -p /home/truenas_admin/inksights/server/web /home/truenas_admin/inksights/server/docker
cd /home/truenas_admin/inksights/server
curl -fsSLO "$B/inksights.sh"
curl -fsSL -o docker/docker-compose.yaml "$B/docker/docker-compose.yaml"
for f in inksights-web.py index.html inksights-ui.js inksights-render.js inksights.css; do curl -fsSL -o "web/$f" "$B/web/$f"; done
```

**Or as a ZIP:** on GitHub *Code → Download ZIP*, unpack it and copy its content to
`/home/truenas_admin/inksights/` (e.g. over a network share).

For the spindown timer on the display, the spindown timer project must be running as well
(see [Spindown timer](#spindown-timer-separate-project)).

### b) Create the data folder on an SSD

The settings page and the script keep their files here. **Not on hard disks**, otherwise the writes wake them up.
The container runs as the **app user `568`** (on TrueNAS the user `apps`) and needs write access to the folder.

```
sudo mkdir -p /mnt/apps/docker/data/inksights/web
sudo cp /home/truenas_admin/inksights/server/web/* /mnt/apps/docker/data/inksights/web/
sudo chown -R 568:568 /mnt/apps/docker/data/inksights
```

**Check the app user:**

```
id apps                                                    # TrueNAS: uid=568(apps) gid=568(apps)
ls -ln /mnt/apps/docker/data/inksights                     # owner and group: 568 568
sudo -u apps touch /mnt/apps/docker/data/inksights/.test && echo "app user can write" && sudo rm /mnt/apps/docker/data/inksights/.test
```

- `id apps` shows another number: use that one in `chown` and as `PUID`/`PGID` (see c).
- `chown` says *Operation not permitted*, or the app user cannot write: the dataset has a restricted ACL. TrueNAS:
  *Datasets* → the dataset → *Permissions* → *Edit*, owner user and group `apps`, tick *Apply recursively*, save.
- Other systems: use a user that owns the folder and set it with `PUID`/`PGID` (see c).

Also check where Docker keeps its data (TrueNAS: *Apps → Configuration → Choose Pool*).
If that is on hard disks, the app wakes them up as well.

### c) Start the settings page as a Docker app

`docker-compose.yaml` contains no system-specific paths. Its settings come from a `.env` file next to it:

| Setting | Meaning | Default |
|---|---|---|
| `DATA_DIR` | data folder from b) | `./data` (next to the compose file) |
| `PORT` | port of the settings page | `8099` |
| `PUID` / `PGID` | user/group the container runs as, needs write access to `DATA_DIR` | `568` (TrueNAS apps user) |
| `RUN_DIR` | run folder of the script (in memory, frames for WiFi displays), read-only for the app | `/var/run/inksights` |

```
sudo mkdir -p /mnt/apps/docker/stacks/inksights
sudo cp /home/truenas_admin/inksights/server/docker/docker-compose.yaml /mnt/apps/docker/stacks/inksights/
echo "DATA_DIR=/mnt/apps/docker/data/inksights" | sudo tee /mnt/apps/docker/stacks/inksights/.env
cd /mnt/apps/docker/stacks/inksights && sudo docker compose up -d
```

Or start it with your stack manager (most of them read the `.env` file or have a field for these values).
With the TrueNAS app list instead: *Apps → Discover Apps* → three dots at the top right → **Install via YAML**,
name `inksights` (app names must be lowercase), paste the content of `docker-compose.yaml`.
There is no `.env` file there, so replace `${DATA_DIR:-./data}` with the full path of the data folder
(`${RUN_DIR:-/var/run/inksights}` can stay as it is).

The page is then reachable at **http://&lt;server&gt;:8099**. On its first start the app creates the settings file
`inksights.conf` in the data folder (with the defaults; an existing one is never overwritten). If the app cannot
write to the data folder, the settings page says so at the top. If it does not start, look at its messages:
`sudo docker logs --tail 20 inksights` (*Permission denied* = see "Check the app user" in b).

### d) Run the script regularly (as root)

The script runs once and exits. Start it again and again, either as a loop in tmux or as a cron job.
Use only one of the two.

| | Loop in tmux (recommended) | Cron job |
|---|---|---|
| Runs | every 10 s, every second with fast refresh | once a minute |
| Display plugged in or out | noticed within about 20 s | noticed within about a minute |
| Fast refresh | ✓ | – |

**Option 1: loop in tmux.** TrueNAS: *System → Advanced Settings → Init/Shutdown Scripts → Add*, Type `Command`,
When `Post Init`, Timeout `10`:

```
tmux has-session -t inksights 2>/dev/null || tmux new-session -d -s inksights "/bin/bash /home/truenas_admin/inksights/server/inksights.sh -l -d /mnt/apps/docker/data/inksights"
```

Post Init scripts run as root. To start it now without a reboot, run the same line in a root shell (`sudo -i`).
Check with `tmux ls` as root. If you used an older line (with `while true; ... sleep 10` or `| tee -a …`),
stop it first (`tmux kill-session -t inksights`) and use this one.

**Option 2: cron job.** TrueNAS: *System → Advanced Settings → Cron Jobs → Add*

- Command: `bash /home/truenas_admin/inksights/server/inksights.sh -d /mnt/apps/docker/data/inksights`
- User: `root`
- Schedule: every minute (`* * * * *`)
- Tick "Hide Standard Output" and "Hide Standard Error"

Other systems: the same line with `* * * * *` in root's crontab (`sudo crontab -e`).

**The data folder after `-d` must be the one from b).** Otherwise the log says
`Data folder … not found`: the displays still get data, but without your settings, and the settings page stays empty.

**What the script does.** It almost always does nothing and exits right away. A full update only happens at the set
interval, after saving on the settings page, when a display is plugged in or out, or on "Update now" / "Redraw now".
In between, displays with fast refresh get a new frame with fresh system values and spindown timers; disk and pool
data then come from the last full update.

**Log:** the script keeps its log in memory at `/var/run/inksights/inksights.log` (the last 2000 lines, gone after
a reboot): `sudo tail -f /var/run/inksights/inksights.log`. With the loop it also shows in the tmux session
(`sudo tmux attach -t inksights`, leave with Ctrl+B, then D).

**Dry run** (prints what every display would get, sends nothing):
`sudo bash /home/truenas_admin/inksights/server/inksights.sh -d /mnt/apps/docker/data/inksights -n`

**Files in memory** (gone after a reboot) in `/var/run/inksights/`: `system.json` (the latest system values, also
usable by other tools), `inksights.log` (the log), `counters` and `temps` (previous readings), `disks.cache`, `fast`,
`frames/` (the frames of the WiFi displays, read by the settings page), `stamp` and `lock`. Displays on USB get their frame directly; nothing
is written for them.

## 4. WiFi (optional)

Boards with WiFi work over USB without any WiFi setup. To run a display over WiFi (it then only needs power):

1. **Set up the WiFi**, either
   - **on the settings page** while the board is plugged into the NAS server: open its **WiFi** card, enter the WiFi
     network, password and the address of the settings page (e.g. `http://192.168.1.10:8099`), *Save*. The settings
     go to the board over USB with the next update; or
   - **on the board itself:** without a WiFi network the board opens its own access point **InkSights**
     (password **ink!1234**, also on the start screen). Connect your phone to it; the setup page opens by itself.
     That can take a moment: a few seconds on most phones, up to about a minute right after the board started while
     it is still drawing its start screen. If nothing opens, open **http://192.168.4.1** yourself.
     Pick your network from the list (**Search** looks again) and enter the same values there.
2. The board connects, shows its address on the start screen and fetches its data from the settings page about
   every 30 seconds (with fast refresh as often as set). Unplug it from the NAS server and give it power anywhere in
   reach of the WiFi.

If the WiFi is lost for 30 seconds (**Access point after (s)**, 0 = at once), the board opens the access point again
(unless switched off) and closes it once it is connected again. While connected, its own page at
`http://inksights-<id>.local` or its address shows the status and lets you change the WiFi settings.

WiFi passwords are stored in the settings file of the data folder (readable only for the app and root) and never
shown on the settings page again. They are sent to a board only over USB, never over WiFi.

## 5. The settings page

Open **http://&lt;server&gt;:8099**. Every display appears with a live preview of what it will show, and below it its own
foldable cards **Display**, **System page**, **Disks** and (boards with WiFi) **WiFi**. Change settings, *Save*, and
the NAS server applies them within a minute. The page itself shows no explanations, to keep it tidy; they are here.
Which cards are folded is remembered per browser.

**At the top of the page** (for all displays):

- **Update every** (1–60 minutes): how often the NAS server sends fresh values.
- **Update now**: sends fresh values right away.

**In each display card:** the preview (‹ › turns its pages), **Redraw now** (redraws this display within a minute,
even if nothing changed and without waiting for the 3 minutes) and a line with ID, port, board, firmware and the
display's last answer.

### Display card

| Setting | Options | Notes |
|---|---|---|
| **Display name** | up to 32 characters | Name of the display on this page (card heading). Empty = the title, else "Display <ID>". |
| **Instance name** | up to 32 characters | One setting for the whole page, shown in every card: name in the page header and browser tab (empty = InkSights). The name on the display's start screen is `PRODUCT_NAME` at the top of the `.ino`. |
| **Panel** | the panel types ([Panels](#panels)) | By the name on the flat cable; next to it the board. The board saves it and restarts with it (over USB with the next update, over WiFi with its next fetch). Preview, rows and fast refresh follow it. |
| **Rotation** | 0°, 90°, 180°, 270° | Clockwise. 90° and 270° stand the display upright: device and used/total in the first line, the pool in its own line. |
| **Title (top left)** | up to 12 characters | Empty = name of the NAS server (e.g. TRUENAS). |
| **Rows per page** | Auto, 2–5 (6 on the 4.2″) | More rows fit more disks per page. Fewer rows: bigger bar, symbols and timer (readable from further away). |
| **Auto page turn** | HH:MM:SS | 00:00:00 = always page 1. The display redraws at most every 3 minutes, so shorter times act like 00:03:00 (not with fast refresh). |
| **Header** | Pages, Uptime | Top line: the page number (e.g. 1/3) or how long the NAS server has been running, see below. |
| **Fast refresh** | Off, 2, 5, 10, 30 s | Only black/white panels. The display gets a new frame this often and redraws the changed parts; a full refresh on page turns and every 10 minutes against ghosting. Needs the loop (`-l`). |
| **Display pins** | CS, D/C, Reset, Busy | Only the pins the board allows; Reset and Busy can be None. The board stores new pins and restarts once. |
| **Frame** | – | What the display receives (over USB or WiFi). |
| **Remove settings** | – | Only for displays that are not connected: forget their settings. |

**Uptime** is shown in the three biggest units, e.g. `1W 5d 4h`, `2M 1W 3d` or `1Y 2M 3W`; where room is short the
smallest unit on the right goes first (`2M 1W`, `2M`). Y = year, M = calendar month (counted by the date: from
15 March to 15 April is one month), W = week, d = day, h = hour, m = minute.

### System page card

| Setting | Options | Notes |
|---|---|---|
| **Ink** | tick | Shows the system page on the display or not; its settings stay. |
| **Components** | CPU, RAM, Network, NVMe, SSD, any combination | The ticked rows form an extra first page; none = no system page. The number of drives of each type is shown in brackets. |
| **Network** | Default, the interfaces found | The interface shown; Default = the one with the default route. |
| **ZFS RAM cache** | On, Off | Off: no grey part in the RAM bar, the cache counts as free. |
| **Icons** | On, Off | Symbol at the left of each row. |

### Disks card

| Setting | Options | Notes |
|---|---|---|
| **Ink** | tick | Shows the disk pages on the display or not; their settings stay. |
| **Disk types** | HDD, SSD, NVMe, any combination | The number of disks of each type is shown in brackets. None = only the system page. |
| **Icons** | On, Off | Symbol left of each bar. |
| **Details in bar** | On, Off | Text inside the bar, only where the bar is high and wide enough. |
| **Details** | Percentage, Capacity | Percentage used (e.g. 35%) or the used capacity (e.g. 3.18T). With the capacity in the bar, the top right shows only the total. |
| **Spindown timer** | On, Off | Hard disks only. Off = no timer, full-width bar. |
| **Timer style** | Badge, Ring | Badge: time left as MM:SS. Ring: shrinks until spindown. |
| **Ring direction** | Clockwise, Counterclockwise | For the ring. |
| **Color highlight** | on/off, from … % used | Bar and used/total are highlighted once a pool is this full: in the third colour on colour panels, inverted on black/white panels. |
| **Order and visibility by** | Pool, UID, Device, Custom (▲▼) | The tick next to each disk shows or hides it on this display. Names like sda can change after a reboot, so Pool, UID and Custom use the serial number (UID); Device orders by name. |

### WiFi card

Boards with WiFi only: network, password, settings page, host name, setup access point on/off, access point after (s),
access point name and password. See [4. WiFi](#4-wifi-optional).

| Setting | Options | Notes |
|---|---|---|
| **Ink** | tick | An extra page after the disk pages with the rows **WiFi** (network, or the setup access point), **IP** (address) and **Connected** (how long the board has been connected without a break). The WiFi settings apply either way. |
| **Icons** | On, Off | Symbol at the left of each row. |

The WiFi page is shown in the preview so far; the firmware does not draw it yet.

### Simulator

`simulator/simulator.html` opens in any browser straight from the folder. It is the same settings page with simulated
data. Below the displays, the **Simulation** section sets the simulated boards, panels and connections, the system
values (incl. when the server started), the disks (with or without ZFS), or a frame pasted from a dry run.
**No data** at a display shows what it draws when it gets no fresh data any more.
Nothing is sent anywhere.

## Update

```
cd /home/truenas_admin/inksights && git pull                                   # with curl / ZIP: get the files again as in 3 a)
sudo cp /home/truenas_admin/inksights/server/web/* /mnt/apps/docker/data/inksights/web/
sudo chown -R 568:568 /mnt/apps/docker/data/inksights
sudo docker restart inksights                                                   # settings page
sudo tmux kill-session -t inksights                                             # script: stop it ...
```

... and start it again with the line from [3 d)](#d-run-the-script-regularly-as-root) (with cron there is nothing to
do). If `server/docker/docker-compose.yaml` changed, take the changes over into your stack and deploy it again.
Then reload the settings page in the browser (Ctrl+F5). New firmware: upload it as in
[2.](#2-upload-the-firmware); the settings stay (on the SAMD21 the NAS server sends pins and panel type again).

## System page

One extra first page with the ticked rows; sizes like a disk page with as many rows:

| Row | Left | Middle | Right | Bar |
|---|---|---|---|---|
| CPU | `CPU` | temperature, power | load | load |
| RAM | `RAM` | ZFS RAM cache (shown as `ZFS`) | used by programs / total | black = programs, grey = ZFS RAM cache, light = free |
| Network | interface | ↓ download per second | ↑ upload per second | the busier direction of the link speed (none without a link speed, e.g. bridges) |
| NVMe | `NVMe` | temperature of each NVMe drive | – | – |
| SSD | `SSD` | temperature of each SATA / SAS SSD | – | – |

- With **Icons** on, each row gets a symbol: a processor for CPU, a memory module for RAM, linked boxes for the
  network and the chip for NVMe and SSD.
- Temperatures stand after the name (upright: below it), at most six per row. A temperature row without such drives
  is left out, and the other rows get bigger.
- The network row without a link speed shows its values below the name instead of a bar.

All values come from `/proc` and `/sys`, never from the hard disks:

- **RAM:** ZFS uses almost all free memory as cache and gives it back when programs need it, so it is shown apart
  (can be switched off per display). Systems without ZFS simply show no cache.
- **Power:** what the processor itself uses (Intel, newer AMD), not the whole server. Not available in virtual machines.
- **CPU temperature:** Intel (`coretemp`), AMD (`k10temp`, `zenpower`) or the CPU sensor of ARM boards.
- **NVMe temperature:** read from the NVMe driver at most every 30 seconds (a tiny request to the NVMe drive; no
  moving parts, it does not wake anything).
- **SSD temperature:** only when a display shows the SSD row, at most every 30 seconds, with `smartctl` (TrueNAS has
  it; without it the row stays empty). Only drives the system reports as SSD are asked, with `-n standby` (a drive
  that says it is asleep is not asked). Hard disks are never asked.
- Load, power and network are averages since the previous reading: over seconds with fast refresh, otherwise since
  the last update. Unknown values show `--` or are left out.
- The preview on the settings page shows the values of the last full update.

## Good to know

- **Does not wake disks.** The script only reads ZFS data from memory, `/proc`, `/sys`, filesystem usage (`df`) and the
  status file of the spindown timer. It never queries the hard disks itself; SSDs only for their temperature.
- **Usage = pool usage.** ZFS spreads data over all disks of a pool, so all disks of a pool show the same bar; the
  same goes for one RAID or one btrfs filesystem over several disks.
- **Disks outside ZFS** show the biggest filesystem mounted on them (or on their partitions, RAID or LVM), named after
  its mount point (`/` = `root`). A disk with nothing mounted shows its size and "not mounted" instead of a bar.
- **Spares the panel.** A display does not redraw when nothing changed, and never more often than every 3 minutes;
  with several pages it turns one page per redraw. Only "Redraw now" skips both. "1 min (redraw on change)" gets
  changes there as fast as possible. With fast refresh (black/white panels) it redraws as often as set.
- **NO DATA.** E-paper keeps its picture even without power, so a display that gets nothing any more would look
  the same as one that works. Without fresh data for twice the **Update every** time plus 2 minutes (at least
  10 minutes; e.g. 22 minutes at 10 minutes), the display shows **NO DATA** in the top line, where the page number
  or the uptime stands, and **Check connection** in the middle, and stops turning pages. The time at the top right
  stays: that is when the last data came. With the next fresh data the pages come back. Reasons: the board is
  unplugged or the NAS server is off, the script or the settings page does not run, or a WiFi board lost its WiFi.
- **"Update every" and fast refresh:** "Update every" stays the interval of the full updates (disks, pools, the
  settings page); fast refresh comes on top.
- **The app is isolated.** It has no USB access and no rights on the NAS server; it only shares the data folder with
  the script. The script checks its settings strictly and never executes any of it.
- **Anyone who can open the page on your network can change the display settings.** Nothing more. The same goes for
  a board's own WiFi page.

## Troubleshooting

| Problem | What to do |
|---|---|
| Something does not work as expected | Look at the log: `sudo tail -n 50 /var/run/inksights/inksights.log` |
| Picture shifted, cut off or just noise | The panel type does not match: choose the next type under **Panel** and save; the board restarts with it. |
| Display does not appear on the settings page | Is the script running as root (`tmux ls`)? Is the board plugged in? A board with an old firmware shows up as "No answer with chip ID": upload the firmware again. |
| **NO DATA** and "Check connection" | The display got no fresh data for a while. Is the script running as root (`tmux ls`)? Is the board plugged in? WiFi boards: is the WiFi there, does the settings page run (`sudo docker ps`)? See "NO DATA" in [Good to know](#good-to-know). |
| `--:--` (badge) or a circle with a dash (ring) | The spindown timer is not running, or its status file is older than two rounds. The symbol then shows the last known state. |
| Setup page of the board does not open | Wait up to a minute after power-up, or open **http://192.168.4.1** yourself while connected to **InkSights**. |
| Port not found when uploading | SAMD21: press RESET twice quickly. ESP32: hold BOOT while plugging in. |
| XIAO ESP32-C3 does not start with the display connected | Choose another pin than D9 for D/C on the settings page. |
| Hard disks wake up | Data folder and Docker data must be on an SSD (see 3 b). |
| Settings page does not start, or *Save* fails | Look at `sudo docker logs --tail 20 inksights`. *Permission denied*: the app user cannot use the data folder, see "Check the app user" in 3 b). |
| Log says `Data folder … not found`, settings page shows old data | The script was started with another folder after `-d` than the data folder of the app. Fix the line in 3 d) and start it again. |

## Protocol (for the curious)

```
PING                                   -> PONG InkSights id=1A2B3C4D size=212x104 colors=3 rows=4 pins=7,9,6,5 panel=1 board=xiao-samd21 wifi=0 fw=1.0
#BEGIN
H|HDD|14:30|5|85|0|600
D|sda|data|3.18T|8.95T|35|3|10|A
#END                                   -> OK disks=1 page=1/1 refresh=now
```

**PONG:** `colors=3` colour panel, `colors=2` black/white; `panel=` the panel type 1–5 (order of the [Panels](#panels)
table). A WiFi board also reports `net=sta|ap|off` and `ip=…`; a panel with fast refresh adds `fast=1`.

| Line | Fields | Notes |
|---|---|---|
| `H` | title, time, rows, highlight from %, quarter turns, page turn in seconds [, timer, ring direction, symbols, details in the bar, fast refresh, uptime, uptime months, WiFi page, no data after] | The last nine are optional: timer 0 badge / 1 ring; ring direction 0 clockwise / 1 counterclockwise; symbols 1 on / 0 off; details in the bar 0 none / 1 percentage / 2 used capacity; fast refresh in seconds, 0 = off; uptime in minutes after the full calendar months, -1 = page number; full calendar months; WiFi page 0 off / 1 with symbols / 2 without; seconds without fresh data before "NO DATA", 0 = never. |
| `D` | device, pool, used, total, percent, filled boxes, total boxes, state, seconds until spindown, timeout seconds | The boxes are no longer drawn. Seconds until spindown -1 = timer not running. State: `A` spinning, `S` asleep, `N` SSD/NVMe, `?` unknown, `-` timer off (HDDs only). Percent -1 = no pool and nothing mounted (total = the size of the disk, or `-`). |
| `S` | rows, CPU %, CPU °C, CPU W, RAM used MiB, ZFS cache MiB, RAM total MiB, interface, down KiB/s, up KiB/s, link Mb/s, NVMe °C,…, SSD °C,… | Only with the system page. Rows: `C` CPU, `R` RAM, `N` network, `V` NVMe, `S` SSD, `I` = symbols on. -1 = unknown, `-` = none; at most six temperatures each. |
| `P` | CS, D/C, Reset, Busy [, panel] | Only when pins or the panel type are set on the settings page. Pin numbers of the board (D numbers on the SAMD21, GPIO numbers on the ESP32 boards). New values → store and restart. |
| `W` | network, password, host, settings page, access point 1/0, access point name, access point password, access point after (s) | USB only, boards with WiFi; texts hex encoded. |
| `R` | – | Only after "Redraw now": redraw right away, even without changes and before the 3 minutes are up. |

WiFi boards fetch the same frame with `GET /api/frame?id=…&size=…` from the settings page; their answer goes along
with the next request.
