<h1><img src="examples/example_00_inksights.png" alt="InkSights" width="100%"></h1>

Repository: https://github.com/Gittegatt/InkSights [![Latest release](https://img.shields.io/github/v/release/Gittegatt/InkSights?label=&color=blue)](https://github.com/Gittegatt/InkSights/releases/latest)

InkSights shows the drive status of a server, often a NAS, on small e-paper displays. On request also:

- a **system page** with CPU, RAM, network and drive temperatures
- **network pages**, **Docker pages**, a **WiFi page** and a **clock**

Every display hangs on its own small board: plugged into the server via USB, or (boards with WiFi) anywhere in
reach of the WiFi. All settings are made on a small web page.

InkSights is **highly customizable**, per display: which pages, in which order, what the top line shows, colours,
symbols, sizes and more.

<img src="examples/example_02_2-13_system_page.png" alt="System page on a 2.13″ display with a red top line: CPU, RAM, network and drive temperatures" width="400">

More pictures: [examples](examples/README.md)

**Contents**

- [Getting started](#getting-started)
- [What a display shows](#what-a-display-shows)
- [Supported hardware](#supported-hardware)
- [How it fits together](#how-it-fits-together)
- [1. Wiring](#1-wiring)
- [2. Upload the firmware](#2-upload-the-firmware)
- [3. Set up on the system](#3-set-up-on-the-system)
  - [a) Get the files](#a-get-the-files)
  - [b) Create the data folder on an SSD](#b-create-the-data-folder-on-an-ssd)
  - [c) Start the settings page and the script as a Docker app](#c-start-the-settings-page-and-the-script-as-a-docker-app)
  - [d) The script](#d-the-script)
- [4. WiFi (optional)](#4-wifi-optional)
- [5. The settings page](#5-the-settings-page)
  - [Every card and setting](docs/settings-page.md)
- [Update](#update)
- [Good to know](#good-to-know)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Protocol (for the curious)](#protocol-for-the-curious)
- [License](#license)
- [AI Notice](#ai-notice)
- [Support the project](#support-the-project)

## Getting started

1. **Wire** the display to its board ([1. Wiring](#1-wiring)).
2. **Upload the firmware** to the board ([2. Upload the firmware](#2-upload-the-firmware)).
3. **On the system** ([3. Set up on the system](#3-set-up-on-the-system)):
   - get the files (`git clone`)
   - create the data folder on an SSD for the app user
   - start the Docker app (settings page and script)
4. **Plug the board into the system** via USB, or set up its WiFi ([4. WiFi](#4-wifi-optional)).
5. **Open the settings page** at `http://<server>:8099` and choose the panel type and everything else
   ([5. The settings page](#5-the-settings-page)).

> [!NOTE]
> InkSights never wakes sleeping hard disks (see [Does not wake disks](#does-not-wake-disks)). Keep its data
> folder on an SSD, so its own writes do not wake them either.

## What a display shows

One row per drive:

- **Symbol:** chip = SSD/NVMe, grey disc = hard disk spinning, light disc = hard disk asleep (can be switched off)
- **Device name** (e.g. `sda`), **pool** and **used/total**, e.g. `3.18T/8.95T`
- **Usage bar:** free = grey raster; highlighted from 85 % (third colour, inverted on black/white panels);
  optionally the percentage (whole or with decimals) or the used capacity inside the bar
- **Temperature** of each drive (optional): `--` or `STBY` for a hard disk that is asleep
- **Spindown timer** for hard disks at the right end of the bar (optional, off by default):
  - a **badge** with the time left (MM:SS, "SLEEP" when asleep), or
  - a **ring** that shrinks until spindown (dotted when asleep)

<img src="examples/example_07_4-2_drives_page.png" alt="Drive page on a 4.2″ display: symbols, pools, bars with the used capacity, temperatures and spindown rings" width="400">

**The top line** shows the time, the title (default: InkSights) and the uptime. The page number can stand instead or
as well, in any order. Highlighted or not, black or white, in the third colour on colour panels, or no top line at
all (see [Header card](docs/settings-page.md#header-card)).

**More pages:** if not all drives fit on one page, the display turns pages by itself. Each display can also show:

- a **system page** (see [System page](docs/settings-page.md#system-page))
- **network pages** with one row per interface (see [Network card](docs/settings-page.md#network-card))
- **Docker pages** with one row per container (see [Docker card](docs/settings-page.md#docker-card))
- a **time page** (see [Time card](docs/settings-page.md#time-card))
- a **WiFi page**

Each page is switched on or off per display, in any order (by default: time, system, drives, network, Docker,
WiFi).

<img src="examples/example_06_2-13_drives_page_yellow.png" alt="Drive page on a 2.13″ display with yellow as third colour" width="400">

**Works on any Linux system** with bash and lsblk (e.g. TrueNAS SCALE, Debian, Proxmox, Unraid): with ZFS pools
and with any other Linux filesystem (ext4, XFS, btrfs, also on RAID or LVM).

## Supported hardware

### Panels

The panel type is chosen on the settings page (**Panel** in the Display card), by the name printed on the flat
cable of the display. Every firmware drives all of them.

| Panel | Size | Colours | Fast refresh |
|---|---|---|---|
| GDEW0213Z16 (older MH-ET LIVE modules) | 2.13″ 212×104 | black/white/red | - |
| GDEH0213Z19 | 2.13″ 212×104 | black/white/red | - |
| GDEY0213Z98 (newer modules) | 2.13″ 250×122 | black/white/red | - |
| GDEY0213B74 | 2.13″ 250×122 | black/white | ✓ |
| GDEY042T81 (e.g. with the DESPI-C02 adapter) | 4.2″ 400×300 | black/white | ✓ |
| GDEW0213Z16, GDEH0213Z19, GDEY0213Z98 with yellow | as above | black/white/yellow | - |

The yellow versions are driven like the red ones; the list shows them as "black/white/yellow". Text on the third
colour is black there instead of white, so it stays easy to read.

**Fast refresh:**

- Black/white panels redraw in under a second without flashing.
- Three-colour panels always need a full refresh (about 15 seconds, flashing), even when they only show black and
  white.

### Boards

| Board | WiFi | PlatformIO environment |
|---|---|---|
| Seeed XIAO SAMD21 | - | `xiao-samd21` |
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

- The spindown timer and the spinning/asleep symbols need
  [sata-sas-spindown-timer](https://github.com/Gittegatt/sata-sas-spindown-timer) **v1.1.0 or newer**.
- It writes the status file this project reads.
- Without it the display shows `--:--` (or a circle with a dash).

## How it fits together

```
Docker app "script"                 ──USB──> board 1 ──> e-paper (e.g. HDDs)
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
| `server/web/` | settings page (`inksights-web.py`, `index.html`, `inksights-ui.js`, `inksights-render.js`, `inksights.css`; `inksights-usb.js` for the USB setup) |
| `server/docker/` | `docker-compose.yaml`: the Docker stack that runs the settings page and the script; `Dockerfile`: their image; `script-entry.sh`: starts the script on the system |
| `simulator/simulator.html` | the settings page with simulated displays and data, opens in a browser straight from the folder |
| `examples/` | pictures of what the displays show |
| `LICENSE`, `licenses/` | the license, GPL-3.0, and the license of the Adafruit font ([License](#license)) |
| `usb-setup.html` | sets up a board over USB from a PC: panel type, pins, WiFi ([USB setup](#usb-setup); code in `server/web/inksights-usb.js`) |

## 1. Wiring

> [!WARNING]
> Connect VCC to **3V3**, not 5V. The pins of the boards only tolerate 3.3 V.

- Leave switch **BS1 on L** (4-line SPI).
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

- **XIAO boards:** the 3V3/GND side has D7-D10, so only Reset and Busy go to the other side.
- **Reset and Busy are optional.** Set them to **None** on the settings page and 6 wires are enough. Connecting them
  is still recommended, because without them:
  - the display waits fixed times while drawing instead of using the ready signal
  - it cannot go into deep sleep
- **XIAO ESP32-C3:** the default D/C pin D9 is a boot pin. It works as D/C. If the board does not start with the
  display connected, choose another pin for D/C on the settings page.
- **4.2″ with the DESPI-C02 adapter:**
  - check the resistor switch on the adapter against the documentation of Good Display for the GDEY042T81
  - insert the flat cable with the contacts facing the right way

## 2. Upload the firmware

The same firmware goes on **every** board. Only the board is chosen when building; the panel type and the pins are
chosen later on the settings page.

### Easiest: ready-made files, nothing to install

Download the file of your board from the [releases](https://github.com/Gittegatt/InkSights/releases). The name
ends with the PlatformIO environment of the board ([Boards](#boards)), e.g.
`inksights-v1.1.0-esp32-c3-supermini-factory.bin`. `SHA256SUMS.txt` in the release lists the checksums of all files.

**ESP32 boards (`-factory.bin`) in the browser** with [ESPWebTool](https://esptool.spacehuhn.com/) (Chrome or Edge):

1. Plug in the board, click **Connect** and choose its port. Not found: hold BOOT while plugging in.
2. Keep only one file row and delete all others.
3. Set its address to `0x0000` (if `0x` is already shown in front, enter only `0`) and choose the `-factory.bin`.
4. Click **Erase**.
5. Connect again if asked, then click **Program**.
6. If the board does not restart by itself, press RESET or plug it in again.

> [!WARNING]
> **Erase** also removes the pins, the panel type and the WiFi settings stored on the board.

> [!NOTE]
> The factory image holds everything the board needs at the right places. Always flash it as one file at
> `0x0000`, never split it up.

**XIAO SAMD21 (`.uf2`) by drag and drop:**

1. Plug in the board and press RESET twice quickly (the two pads next to the USB port; touch them twice with
   tweezers or a wire). The orange LED pulses and a drive named **Arduino** appears.
2. Copy `inksights-v1.1.0-xiao-samd21.uf2` onto that drive.
3. The board restarts with the new firmware by itself; the drive disappears.

> [!TIP]
> **Bootloader without touching the pads (1200 baud touch).** While a firmware runs on the XIAO (InkSights or any
> other Arduino sketch), the board jumps into its bootloader as soon as its serial port is opened at 1200 baud and
> closed again. The Arduino IDE and PlatformIO do this by themselves when they upload, which is why uploading
> normally works without pressing anything. By hand (use your port):
>
> | System | Command |
> |---|---|
> | Windows | `mode COM5 BAUD=1200` |
> | Linux | `stty -F /dev/ttyACM0 1200` |
> | macOS | `stty -f /dev/cu.usbmodemXXXX 1200` |
> | Python | `serial.Serial("COM5", 1200).close()` |
>
> Then the drive (mostly **Arduino**) or a new serial port appears and the LED pulses. If no firmware runs on the
> board (or it hangs), only the double press of RESET helps.

<details>
<summary><b>Build the files yourself</b></summary>

- `python scripts/build_release.py` builds every board and writes the files to `dist/v<version>/`
  (`--environment <env>` for one board only).
- Pushing a tag such as `v1.1.0` to GitHub builds them there as well and creates a draft release with them.
- In the public repository the tag also builds the Docker image of the settings page and the script
  (`ghcr.io/gittegatt/inksights:1.1.0` and `:latest`).

</details>

### With PlatformIO or the Arduino IDE

**With PlatformIO (VS Code):**

- Open the project folder, pick the environment of your board ([Boards](#boards)) and upload, e.g.
  `pio run -e esp32-c3-supermini -t upload`.
- Port not found: SAMD21 press RESET twice quickly (or the 1200 baud touch, see above), ESP32 hold BOOT while
  plugging in.

<details>
<summary><b>With the Arduino IDE</b></summary>

1. Boards:
   - XIAO SAMD21: under *File → Preferences → Additional boards manager URLs* add
     `https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json`, then install "Seeed SAMD Boards"
     and select **Seeeduino XIAO**.
   - ESP32 boards: install "esp32" by Espressif and select the board (XIAO_ESP32C3, XIAO_ESP32S3, Adafruit QT Py
     ESP32-S3; for the Super Mini and Zero boards "ESP32S3 Dev Module" or "ESP32C3 Dev Module"). Set
     *Tools → USB CDC On Boot* to **Enabled**.
   - Generic S3 / C3 selections are taken as the Super Mini. For a Zero board add
     `#define INKSIGHTS_BOARD_ESP32_S3_ZERO` (or `..._C3_ZERO`) at the top of the sketch.
2. *Library manager*: install **GxEPD2** and **Adafruit GFX Library**, for the SAMD21 also **FlashStorage** (by cmaglie).
3. Open `firmware/InkSights/InkSights.ino` and upload it.

</details>

### Start screen

After power-up every display shows a start screen until the first data arrives: below the top line the name
InkSights in big letters with its logo. It can be switched off in the [Advanced Ink card](docs/settings-page.md#advanced-ink-card).

```
InkSights                  v1.1.0
           InkSights
ID     1A2B3C4D
Board  ESP32-C3 Super Mini
Panel  GDEW0213Z16 b/w/color
GPIO   CS7 DC5 RST3 BUSY10
WiFi   AP InkSights 192.168.4.1
       Key ink!1234
Waiting for data from system ...
```

- The **ID** is the chip ID. Note which ID belongs to which display; the settings page lists the displays by it.
- The WiFi lines only appear on boards with WiFi.
- A new board starts with the first panel type (GDEW0213Z16).

**What a new upload keeps:**

| | SAMD21 | ESP32 boards |
|---|---|---|
| Pins and panel type | back to the defaults | kept |
| WiFi settings | - | kept |
| Start from scratch | upload again | erase the flash: `pio run -e <env> -t erase -t upload` |

## 3. Set up on the system

The menu paths below are from **TrueNAS SCALE 25.10**. Other systems name them differently; the steps are the
same: create a folder, start the Docker app (settings page and script).

The examples use this layout. Adjust the paths to your system:

| What | Where |
|---|---|
| Project (from GitHub) | `/home/truenas_admin/inksights/` (`server/docker/docker-compose.yaml`) |
| Docker stack | `/mnt/apps/docker/stacks/inksights/` |
| Data folder (settings, state) | `/mnt/apps/docker/data/inksights/` |

### a) Get the files

As your normal user (e.g. `truenas_admin`), one of these:

**With git** (recommended, updates later with one command):

```
git clone https://github.com/Gittegatt/InkSights.git /home/truenas_admin/inksights
```

**Without git, with curl** (only the file the system needs, same folders; settings page and script come as a
ready-made Docker image; the script itself only for [running it without Docker](#d-the-script)):

```
B=https://raw.githubusercontent.com/Gittegatt/InkSights/main/server
mkdir -p /home/truenas_admin/inksights/server/docker
cd /home/truenas_admin/inksights/server
curl -fsSL -o docker/docker-compose.yaml "$B/docker/docker-compose.yaml"
curl -fsSLO "$B/inksights.sh"        # only without Docker for the script
```

**Or as a ZIP:** on GitHub *Code → Download ZIP*, unpack it and copy its content to
`/home/truenas_admin/inksights/` (e.g. over a network share).

For the spindown timer on the display, the spindown timer project must be running as well
(see [Spindown timer](#spindown-timer-separate-project)).

### b) Create the data folder on an SSD

The settings page and the script keep their files here. The container runs as the **app user `568`** (on TrueNAS
the user `apps`) and needs write access to the folder.

> [!WARNING]
> **Not on hard disks**, otherwise the writes wake them up. The same goes for the place where Docker keeps its
> data (TrueNAS: *Apps → Configuration → Choose Pool*).

```
sudo mkdir -p /mnt/apps/docker/data/inksights
sudo chown -R 568:568 /mnt/apps/docker/data/inksights
```

An earlier setup also has a `web/` folder in it (the page files were copied there). It is no longer used and can
be deleted.

**Check the app user:**

```
id apps                                                    # TrueNAS: uid=568(apps) gid=568(apps)
ls -ln /mnt/apps/docker/data/inksights                     # owner and group: 568 568
sudo -u apps touch /mnt/apps/docker/data/inksights/.test && echo "app user can write" && sudo rm /mnt/apps/docker/data/inksights/.test
```

- `id apps` shows another number: use that one in `chown` and in the line `user:` of the settings page (see c).
- `chown` says *Operation not permitted*, or the app user cannot write: the dataset has a restricted ACL. TrueNAS:
  *Datasets* → the dataset → *Permissions* → *Edit*, owner user and group `apps`, tick *Apply recursively*, save.
- Other systems: use a user that owns the folder and enter it in the line `user:` (see c).

### c) Start the settings page and the script as a Docker app

Settings page and script come as one ready-made image, `ghcr.io/gittegatt/inksights` (for x86 and ARM): nothing to
copy. The stack starts two containers from it:

- **`inksights`**: the settings page, without any rights on the system.
- **`inksights-script`**: the script, as root with access to the system (see [d)](#d-the-script)), no port.

The settings are in `docker-compose.yaml` itself. The lines to adjust are marked with `<-` there:

| Line | What | Example |
|---|---|---|
| `- ./data:/data` (in both containers) | the data folder from b), left of the colon; the same in both | `- /mnt/apps/docker/data/inksights:/data` |
| `user: 568:568` | the user that may write to the data folder (TrueNAS: `apps`) | `user: 1000:1000` |
| `- 8099:8099` | left: the port of the page on your server | `- 8100:8099` |
| `image: ...:latest` (in both containers) | a fixed version instead of the newest | `image: ghcr.io/gittegatt/inksights:1.1.0` |
| `- INKSIGHTS_OTA=on` | firmware updates of the WiFi boards from the page: `on` or `off` (see [Security](#security)) | `- INKSIGHTS_OTA=off` |
| `- INKSIGHTS_DOCKER_CHECK=360` | Docker pages: every how many minutes the script looks for newer images of the containers, 10 to 10080 (see [Docker card](docs/settings-page.md#docker-card)) | `- INKSIGHTS_DOCKER_CHECK=60` |
| `# - INKSIGHTS_PASSWORD=` | remove the `#` and enter a password: the login is on (a `$` in it is written `$$`); or switch it on in the **Login** card of the page | `- INKSIGHTS_PASSWORD=MyPassword` |
| `# - INKSIGHTS_USER=inksights` | the user name of the login | `- INKSIGHTS_USER=admin` |
| `command: /app/script-entry.sh -l` | more options for the script at the end (see `inksights.sh -h`) | `command: /app/script-entry.sh -l -x sdz` |

```
sudo mkdir -p /mnt/apps/docker/stacks/inksights
cd /mnt/apps/docker/stacks/inksights
sudo cp /home/truenas_admin/inksights/server/docker/docker-compose.yaml .
sudo sed -i 's#- ./data:/data#- /mnt/apps/docker/data/inksights:/data#' docker-compose.yaml   # the data folder, in both containers
sudo docker compose up -d
```

**Other ways to start it:**

- **With your stack manager** (e.g. Dockge, Portainer): a new stack named `inksights`, paste the content of
  `docker-compose.yaml` and adjust the marked lines.
- **With the TrueNAS app list:** *Apps → Discover Apps* → three dots at the top right → **Install via YAML**, name
  `inksights` (app names must be lowercase), paste the content of `docker-compose.yaml` and adjust the marked lines
  (the data folder twice).
- **Without internet access on the system**, or to try changes of your own: build the image from the project
  folder and use it with `:local` instead of `:latest` in both `image:` lines:

  ```
  cd /home/truenas_admin/inksights && sudo docker build -f server/docker/Dockerfile -t ghcr.io/gittegatt/inksights:local .
  ```

**Then:**

- The page is reachable at **http://&lt;server&gt;:8099**, or at the port set left in `ports:` (then also give the
  boards with WiFi that port in the address of the settings page, e.g. `http://192.168.1.10:8100`).
- Do not open this port on your router (no port forwarding): the page belongs in your own network only.
- The page has no login at first. Switch it on in the **Login** card at the bottom of the page (or with
  `INKSIGHTS_PASSWORD`), see [Security](#security).
- On its first start the app creates the settings file `inksights.conf` in the data folder, with the defaults. An
  existing one is never overwritten.
- If the app cannot write to the data folder, the settings page says so at the top.
- If it does not start, look at its messages: `sudo docker logs --tail 20 inksights` (*Permission denied* = see
  "Check the app user" in b). The script: `sudo docker logs --tail 20 inksights-script`.

### d) The script

The script collects the data and sends every display its frame. It runs in the second container of the stack,
**`inksights-script`**, started together with the settings page in c): nothing more to set up.

- Check it with `sudo docker logs -f inksights-script` (leave with Ctrl+C): `Loop started`, then a line now and
  then (a display connected, a problem).
- It runs as root with full access to the system (see [Security](#security)): it needs the USB ports of the
  boards, the drives, the pools and the network interfaces. It uses the tools of the system itself (`bash`,
  `lsblk`, `zpool`, `df`, `docker`, ...), exactly as if it was started there, so it never wakes hard disks either.
- More options for the script (e.g. `-x sdz` to never show a disk): at the end of the line `command:` of
  `inksights-script`, then `sudo docker compose up -d`.

> [!IMPORTANT]
> **Run the script only in this container.** If you started it with tmux or cron before, remove that
> (Init/Shutdown Script or Cron Job, then `sudo tmux kill-session -t inksights`). A second loop waits until the
> first one stops, so the displays do not get every frame twice.

<details>
<summary><b>Without Docker: tmux or cron</b></summary>

Without the container (e.g. a system without Docker, or to try changes to the script): get the script as in
[3 a)](#a-get-the-files) and leave the service `inksights-script` out of `docker-compose.yaml`. The script runs
once and exits. Start it again and again, either as a loop in tmux or as a cron job.

> [!IMPORTANT]
> Use only one of the two.

| | Loop in tmux (recommended) | Cron job |
|---|---|---|
| Runs | every 10 s, every second with fast refresh | once a minute |
| Display plugged in or out | noticed within about 20 s | noticed within about a minute |
| Fast refresh | ✓ | - |

**Option 1: loop in tmux.** TrueNAS: *System → Advanced Settings → Init/Shutdown Scripts → Add*, Type `Command`,
When `Post Init`, Timeout `10`:

```
tmux has-session -t inksights 2>/dev/null || tmux new-session -d -s inksights "/bin/bash /home/truenas_admin/inksights/server/inksights.sh -l -d /mnt/apps/docker/data/inksights"
```

- Post Init scripts run as root. To start it now without a reboot, run the same line in a root shell (`sudo -i`).
- Check with `tmux ls` as root; the output shows in the session (`sudo tmux attach -t inksights`, leave with
  Ctrl+B, then D).

**Option 2: cron job.** TrueNAS: *System → Advanced Settings → Cron Jobs → Add*

- Command: `bash /home/truenas_admin/inksights/server/inksights.sh -d /mnt/apps/docker/data/inksights`
- User: `root`
- Schedule: every minute (`* * * * *`)
- Tick "Hide Standard Output" and "Hide Standard Error"

Other systems: the same line with `* * * * *` in root's crontab (`sudo crontab -e`).

> [!IMPORTANT]
> **The data folder after `-d` must be the one from b).** Otherwise the log says `Data folder … not found`: the
> displays still get data, but without your settings, and the settings page stays empty.

Dry run: `sudo bash /home/truenas_admin/inksights/server/inksights.sh -d /mnt/apps/docker/data/inksights -n`

</details>

**What the script does:**

- Every 10 seconds (every second with fast refresh) it checks whether there is anything to do; almost always
  there is nothing.
- A **full update** (drives, pools, system values, the settings page) happens:
  - as often as the shortest **Refresh** of your displays (one under a minute counts as 1 minute)
  - after saving on the settings page
  - when a display is plugged in or out
  - on "Update now" / "Redraw now"
- In a full update every display whose own **Refresh** has passed gets a frame; after a change all of them.
- In between, displays with a refresh in seconds get a new frame with fresh system values and spindown timers.
  - The time left counts down between the polls of the spindown timer; its next poll corrects it.
  - Disk and pool data then come from the last full update.

**Log:**

- In memory at `/var/run/inksights/inksights.log`, the last 2000 lines, gone after a reboot:
  `sudo tail -f /var/run/inksights/inksights.log`
- Also in `sudo docker logs inksights-script`.

**Dry run** (prints what every display would get, sends nothing):
`sudo docker exec inksights-script /app/script-entry.sh -n`

<details>
<summary><b>Files in memory</b></summary>

In `/var/run/inksights/`, gone after a reboot:

| File | Content |
|---|---|
| `system.json` | the latest system values, also usable by other tools |
| `inksights.log` | the log |
| `counters`, `temps` | previous readings |
| `disks.cache`, `fast` | data for the fast runs in between |
| `frames/` | the frames of the WiFi displays, read by the settings page |
| `live/` | for a USB display with fast refresh: a copy of its frame (without WiFi settings), for the live preview |
| `stamp`, `lock`, `loop.lock` | when the last full update ran; only one run and one loop at a time |

Displays on USB get their frame directly.

</details>

## 4. WiFi (optional)

Boards with WiFi work over USB without any WiFi setup. To run a display over WiFi (it then only needs power):

<img src="examples/example_01_4-2_start_screen.png" alt="Start screen of a 4.2″ display: no WiFi set up yet, so the board has opened its setup access point and shows its password" width="400">

1. **Set up the WiFi**, in one of three ways:
   - **On the settings page**, while the board is plugged into the system: open its **WiFi** card, enter the
     WiFi network, password and the address of the settings page (e.g. `http://192.168.1.10:8099`; `http://` may be
     left out, it is put in front), *Save*. The settings go to the board over USB with the next update.
   - **On the board itself:** without a WiFi network the board opens its own access point **InkSights** (password
     **ink!1234**, also on the start screen).
     - Connect your phone to it; the setup page opens by itself. That takes a few seconds on most phones, up to
       about a minute right after the board started.
     - If nothing opens, open **http://192.168.4.1** yourself.
     - Pick your network from the list (**Search** looks again) and enter the same values there.
   - **Over USB from any PC** with the [USB setup](#usb-setup) page, together with the panel type and the pins.
2. The board connects, shows its address on the start screen and fetches its data from the settings page about
   every 30 seconds (with fast refresh as often as set).
3. Unplug it from the system and give it power anywhere in reach of the WiFi.

**When the WiFi is lost:**

- After 30 seconds (**Failover access point after (s)**, 0 = at once) the board opens the access point again, unless
  switched off.
- It closes it once it is connected again.
- While connected, its own page at `http://inksights-<id>.local` or its address shows the status and lets you
  change the WiFi settings.

**WiFi passwords:**

- stored in the settings file of the data folder (readable only for the app and root)
- never shown on the settings page again
- sent to a board only over USB, never over WiFi
- never in a backup file: **Export** leaves them out, **Import** never takes them from a file and keeps the stored
  ones (see [Backup](#5-the-settings-page))

### USB setup

`usb-setup.html` (in the project folder) sets up a board straight over its USB port from any PC, without the system: the **panel type**, the **display pins** and, on boards with WiFi, all **WiFi settings**.

> [!NOTE]
> It needs Chrome or Edge (Firefox and Safari cannot use USB from a web page). It works when the file is opened
> from disk (double-click it) or over https, e.g. `https://gittegatt.github.io/InkSights/usb-setup.html`. Not from
> the settings page of the system (http): browsers allow USB only on such "secure" pages.

1. Plug the board into the PC (the InkSights firmware must be on it, see [2.](#2-upload-the-firmware)).
2. Open the page, click **Connect** and choose the board's port.
3. The page shows what the board reports (ID, board, firmware, panel, pins, WiFi state and network) and fills in
   its settings. Change what you need, **Save**.
4. WiFi settings are taken at once. New pins or a new panel type make the board restart; the page connects again
   by itself. Afterwards it shows what the board stored.

Good to know:

- Empty password fields keep the stored passwords (the board never reports them).
- The page sends nothing anywhere but to the board.
- If the board later goes back to the system and its WiFi card on the settings page holds WiFi settings, those
  are sent to it again with the next update.
- GitHub Pages: in the repository *Settings → Pages*, *Deploy from a branch*, branch `main`, folder `/ (root)`. The
  page and the simulator are then online at `https://<user>.github.io/<repository>/usb-setup.html` and
  `…/simulator/simulator.html`.

## 5. The settings page

Open **http://&lt;server&gt;:8099**.

- Every display has its own tab (green dot = connected, grey = not connected); the last one opened is remembered.
- On the left the display with a live preview of what it will show; it stays in view while the page scrolls. On
  narrow screens it stands above the cards.
- On the right its own foldable cards: **Display**, **Header**, **Time**, **System**, **Drives**, **Network**,
  **Docker**, (boards with WiFi) **WiFi**, **The Conversation**, **The Intermission**, **The Afterhours** and
  **Advanced Ink**.
- A display that was connected before stays in the list with its settings, also after its controller was replaced
  (a new controller has a new chip ID). Take its settings over with **Export** / **Import** in the Advanced Ink
  card, then remove the old one with **Remove display** there.
- Change settings, *Save*, and the system applies them within a minute.
- The page itself shows no explanations, to keep it tidy; they are here.
- Which cards are folded is remembered per browser.

<img align="top" vspace="4" src="examples/example_18_settings_page_2-13.png" alt="The settings page, tab of the 2.13″ display: the live preview on the left, its cards on the right with the Display card open" width="49%"> <img align="top" vspace="4" src="examples/example_18_settings_page_4-2.png" alt="The settings page, tab of the 4.2″ display: the live preview on the left, its cards on the right with the Header card open" width="49%">

**A new display starts with:**

| Card | Default |
|---|---|
| Pages | all on, in this order: time, system, drives, network, Docker, WiFi |
| Header | time · title · uptime, black, no divider line, nothing highlighted |
| Time | weekday and date (`2026-10-26`), time zone UTC, no NTP, no top line |
| System | every row, no ZFS RAM cache, asleep hard disks `STBY` |
| Drives | every drive type, the used capacity in the bar, no temperatures, no spindown timer (ring, counterclockwise when switched on), highlight from 85 % |
| Network | symbols, the percentage in the bar |
| Docker | symbols, one row per container, every container ordered by state, Color highlight, no boxes, On cue off |
| WiFi | symbols, setup access point on after 30 s |
| The Conversation, The Intermission, The Afterhours | header, caption, in the page turn, On cue on, no time window; Beverages Roast |

**Order of the pages:**

- The cards **System**, **Drives**, **Network**, **Docker**, **Time** and **WiFi** have a grip (two horizontal lines
  left of **Ink**).
- Drag a card by it up or down, or click the grip and use the arrow keys.
- The order of these cards is the order of the pages on the display; *Save* applies it.
- **Display**, **Header** and **Advanced Ink** stay in their place.
- The cards **The Conversation**, **The Intermission** and **The Afterhours** have a grip too: a picture that is a
  **Turn candidate** comes in the page turn at the place of its card.

**At the top of the page** (for all displays):

- **Update now** sends fresh values to all displays right away. How often each display gets fresh values is set in
  its card (**Refresh**).
- **New version:** when the page is opened, your browser asks GitHub for the latest InkSights release (at most every
  6 hours; the system does not). When it is newer than the installed version, a line shows it:
  - **Download** opens the release page
  - **Mute** hides it until the page is opened again
  - **Skip version** hides it until a newer version is released
- **Versions:** below the status line the versions of the WebUI, the script and the
  firmware on each controller. The WebUI sets the version; for every part that does not match it a notice says what
  to update, with **Latest release** (the release page on GitHub).

**In each display card:**

- the preview (‹ › turns its pages)
- **Redraw now**: redraws this display within a minute, even if nothing changed and without waiting for the
  3 minutes
- a line with ID, port, board, firmware and the display's last answer

**At the bottom of the page:** the **Login** card (the login of the page, see [Security](#security)) and the
**About** card with the versions, links to the project (GitHub, Releases, README), the license with the libraries
used, and how to support the project.

**Every card and setting** is described in [docs/settings-page.md](docs/settings-page.md):

- [Words used](docs/settings-page.md#words-used)
- [Display card](docs/settings-page.md#display-card)
- [Header card](docs/settings-page.md#header-card)
- [Time card](docs/settings-page.md#time-card)
- [System card](docs/settings-page.md#system-card)
- [Drives card](docs/settings-page.md#drives-card)
- [Network card](docs/settings-page.md#network-card)
- [Docker card](docs/settings-page.md#docker-card)
- [WiFi card](docs/settings-page.md#wifi-card)
- [The Conversation, The Intermission and The Afterhours cards](docs/settings-page.md#the-conversation-the-intermission-and-the-afterhours-cards)
- [Advanced Ink card](docs/settings-page.md#advanced-ink-card)
- [Beverages](docs/settings-page.md#beverages)
- [Simulator](docs/settings-page.md#simulator)

## Update

```
cd /mnt/apps/docker/stacks/inksights && sudo docker compose pull && sudo docker compose up -d   # settings page and script
```

1. Reload the settings page in the browser (Ctrl+F5).
2. Script without Docker: `git pull` in `/home/truenas_admin/inksights` (with curl / ZIP: get the files again as in
   3 a)), then `sudo tmux kill-session -t inksights` and start it again with the line from
   [3 d)](#d-the-script) (with cron there is nothing to do).
3. New firmware: upload it as in [2.](#2-upload-the-firmware). The settings stay (on the SAMD21 the system sends
   pins and panel type again). Boards with WiFi will also take it over WiFi from the
   [Advanced Ink card](docs/settings-page.md#advanced-ink-card).

Good to know:

- The settings page sets the version: script and firmware belong to the same one. In the Docker app the script
  always has the version of the settings page.
- With a fixed version in the `image:` lines, enter the new one there first.
- With the TrueNAS app list, redeploy the app so it fetches the new image.
- If `server/docker/docker-compose.yaml` changed, take the changes over into your stack and deploy it again.

## Good to know

### Does not wake disks

- The script only reads ZFS data from memory, `/proc`, `/sys`, filesystem usage (`df`) and the status file of the
  spindown timer.
- It never queries the hard disks itself; SSDs only for their temperature.
- Hard disk temperatures come from the status file of drive-temp-export (see [HDD temperatures](docs/settings-page.md#hdd-temperatures)).

### Usage = pool usage

ZFS spreads data over all disks of a pool, so all disks of a pool show the same bar. The same goes for one RAID or
one btrfs filesystem over several disks.

### Disks outside ZFS

Disks outside ZFS show the biggest filesystem mounted on them (or on their partitions, RAID or LVM), named after its
mount point (`/` = `root`). A disk with nothing mounted shows its size and "not mounted" instead of a bar.

<img src="examples/example_09_2-13_drives_page_without_zfs.png" alt="Drive page on a 2.13″ display of a server without ZFS: root, a disk not mounted, an XFS filesystem" width="400">

### Spares the panel

- A display does not redraw when nothing changed, and never more often than every 3 minutes.
- With several pages it turns one page per redraw.
- Only "Redraw now" skips both.
- A **Refresh** of 1 min gets changes there as fast as possible. With a refresh in seconds (black/white panels) it
  redraws as often as set.

### The Conversation

With every page of a display switched off (no system, drive, network, time or WiFi page), it shows **Nothing to
ink**, so it never looks broken.

The pictures of this part without the top line (the default), three per screen: **House Wine** (the bottle and the
glass, no caption), **Roast** (a coffee cup, the default of [Beverages](docs/settings-page.md#beverages), with its **Caption**) and
**Tabula Rasa** (nothing on the table) with its **Caption** and **Got the time?** (a wall clock):

<img align="top" vspace="4" src="examples/example_17_4-2_nothing_to_ink.png" alt="A 4.2″ display with every page switched off: three people at a table, the bottle and the glass (House Wine)" width="270"> <img align="top" vspace="4" src="examples/example_17_4-2_nothing_to_ink_roast_caption.png" alt="The same with its caption and a coffee cup (Roast)" width="270"> <img align="top" vspace="4" src="examples/example_17_4-2_nothing_to_ink_tabula_rasa_clock.png" alt="The same with its caption, nothing on the table and a wall clock (Tabula Rasa, Got the time?)" width="270">

### The Intermission

When a display gets no fresh data for a while, it shows **Check connection** below a picture of the empty table, and
**NO DATA** in the top line (with its **Header** ticked). E-paper keeps its picture even without power, so a display
that gets nothing any more would look the same as one that works.

- **When:** after twice its **Refresh** plus 2 minutes without fresh data (at least 10 minutes; e.g. 22 minutes at
  10 minutes, 8 hours 2 minutes at 4 hours).
- **NO DATA** stands where the page number or the uptime stands. The display stops turning pages.
- The time at the top right stays: that is when the last data came.
- With the next fresh data the pages come back.
- Reasons: the board is unplugged or the system is off, the script or the settings page does not run, or a WiFi
  board lost its WiFi.

<img align="top" vspace="4" src="examples/example_16_2-13_no_connection.png" alt="A red 2.13″ display without fresh data: the empty table, the bottle and the glass (House Wine)" width="270"> <img align="top" vspace="4" src="examples/example_16_2-13_no_connection_roast_caption.png" alt="The same with its caption and a coffee cup (Roast)" width="270"> <img align="top" vspace="4" src="examples/example_16_2-13_no_connection_tabula_rasa_clock.png" alt="The same with its caption, nothing on the table and a wall clock (Tabula Rasa, Got the time?)" width="270">

### The Afterhours

Tick **Scheduled** in the card **The Afterhours** and set **From** and **To** (e.g. 23:00 to 07:00). In that time
the display shows only this picture, the chairs up on the table, with **Closed until 07:00** below it (in the time
format of the display, with 12h `Closed until 07:00AM` as in the pictures), and spares the panel: new data do not
redraw it. With **Roast** the cup stands between the chairs, without steam: a cold cup left at closing time.

<img align="top" vspace="4" src="examples/example_21_2-13_closed.png" alt="A yellow 2.13″ display in its quiet hours: two chairs upside down on a table, the bottle and the glass (House Wine)" width="270"> <img align="top" vspace="4" src="examples/example_21_2-13_closed_roast_caption.png" alt="The same with its caption and a coffee cup (Roast)" width="270"> <img align="top" vspace="4" src="examples/example_21_2-13_closed_tabula_rasa_clock.png" alt="The same with its caption, nothing on the table and a wall clock (Tabula Rasa, Got the time?)" width="270">

### InkSights

With every page switched off and **The Conversation** with **On cue** off, the display shows the product name with
its logo instead:

<img src="examples/example_20_2-13_logo_screen.png" alt="A 2.13″ display with every page switched off: the InkSights logo" width="400">

### Refresh in seconds and minutes

A display on seconds gets fresh system values and timers that often. Its drives and pools come from the full
updates, at least once a minute while such a display is there.

## Security

> [!WARNING]
> **Keep the page in your own network.** Do not open its port on your router (no port forwarding), and put guests
> in a guest WiFi if your router has one. The port is set in `ports:` in the Docker settings
> ([3 c)](#c-start-the-settings-page-and-the-script-as-a-docker-app)).

- **The settings page is isolated.** Its container has no USB access and no rights on the system; it only shares
  the data folder with the script.
- **The script checks its settings strictly** and never executes any of it.
- **The settings page has no login at first.** Everyone in your network who opens it can change the display
  settings and update the firmware of the boards with WiFi.
- **Login card** (at the bottom of the page): tick **Login**, enter a new password twice, **Switch on**. From then
  on the browser asks for the user name `inksights` (or the one set with `INKSIGHTS_USER`) and that password. While it
  is on: **Change password** with the current one, or untick **Login** and **Switch off** with the current one.
  The data folder keeps it in `login.json` (only a salted hash, never the password itself).
- **Or in the Docker settings:** in `docker-compose.yaml` remove the `#` in front of `- INKSIGHTS_PASSWORD=` and
  enter a password, then `sudo docker compose up -d`: the login is on with that password. The newer change wins:
  change `INKSIGHTS_PASSWORD` afterwards and what the Login card set is dropped at the next start; a change in the
  Login card counts until `INKSIGHTS_PASSWORD` changes again.
- **With the login** the page only takes ESP32 firmware files, and a board only takes one that fits. A wrong
  password costs a second, so guessing is slow.
- **Without a login, always:** what the boards need, their frame and their firmware update. A board's own WiFi page
  (setup access point) has no login either.
- **Forgot the password?** Delete `login.json` in the data folder and restart the app
  (`sudo docker restart inksights`): the login is off again (or back to `INKSIGHTS_PASSWORD`, if that is set). Or
  set a new `INKSIGHTS_PASSWORD` as above. Only someone with access to the server can do this.
- **The login is sent unencrypted** (plain http, like most pages in a home network). Use it only in your own
  network.
- **The script container has full access to the system** (`privileged`, the processes of the system): it needs
  the USB ports, drives, pools and network interfaces, as root, like a script started on the system. It has no
  port and no network of its own, so it cannot be reached from outside. For the Docker pages it asks the Docker of
  the system for its containers, and the registries of their images whether a newer one is out (through the network
  of the system, see [Docker card](docs/settings-page.md#docker-card)). The settings page runs in its own
  container without these rights: whoever gets into the page does not get into the system.
- **Firmware updates can be switched off:** per display with **OTA** Off in its Advanced Ink card, or for all of them
  with `- INKSIGHTS_OTA=off` in `docker-compose.yaml`, then `sudo docker compose up -d`. The page then flashes nothing at all, and it cannot be switched on again from the
  page, only in the Docker settings.
- **WiFi passwords** stay in the settings file of the data folder (readable only for the app and root), are never
  shown on the page again and reach a board only over USB (see [4. WiFi](#4-wifi-optional)).
- **Backup files hold no WiFi passwords.** They are plain text and easily end up in a download folder, a cloud or a
  mail, so the export leaves the passwords out and the import never takes any from a file.

## Troubleshooting

| Problem | What to do |
|---|---|
| Something does not work as expected | Look at the log: `sudo tail -n 50 /var/run/inksights/inksights.log` |
| Picture shifted, cut off or just noise | The panel type does not match: choose the next type under **Panel** and save; the board restarts with it. |
| Display does not appear on the settings page | Is the script running (`sudo docker logs --tail 20 inksights-script`)? Is the board plugged in? A board with an old firmware shows up as "No answer with chip ID": upload the firmware again. |
| **NO DATA** and "Check connection" | The display got no fresh data for a while. Is the script running (`sudo docker ps`, `sudo docker logs --tail 20 inksights-script`)? Is the board plugged in? WiFi boards: is the WiFi there, does the settings page run (`sudo docker ps`)? See [The Intermission](#the-intermission) in Good to know. |
| `--:--` (badge) or a circle with a dash (ring) | The spindown timer is not running, or its status file is older than two rounds. The symbol then shows the last known state. |
| Setup page of the board does not open | Wait up to a minute after power-up, or open **http://192.168.4.1** yourself while connected to **InkSights**. |
| Port not found when uploading | SAMD21: press RESET twice quickly, or the 1200 baud touch (see [2.](#2-upload-the-firmware)). ESP32: hold BOOT while plugging in. |
| XIAO ESP32-C3 does not start with the display connected | Choose another pin than D9 for D/C on the settings page. |
| Hard disks wake up | Data folder and Docker data must be on an SSD (see 3 b). |
| Settings page asks for a login | User `inksights` (or the one set with `INKSIGHTS_USER`) and the password set in the Login card or with `INKSIGHTS_PASSWORD`. Forgotten: see [Security](#security). |
| Settings page does not start, or *Save* fails | Look at `sudo docker logs --tail 20 inksights`. *Permission denied*: the app user cannot use the data folder, see "Check the app user" in 3 b). |
| Log says `Data folder … not found`, settings page shows old data | Script without Docker: it was started with another folder after `-d` than the data folder of the app. Fix the line in 3 d) and start it again. |
| `inksights-script` stops with *cannot reach the system* | The container needs `privileged: true` and `pid: host` (as in `docker-compose.yaml`). |
| `inksights-script` stops with *the system has no /bin/bash* | The script needs bash on the system (TrueNAS, Debian, Proxmox and Unraid have it). |
| Docker page says **No containers**, but containers run | The script needs the `docker` command of the system. Look at `sudo docker logs --tail 20 inksights-script`, then **Update now**. |
| **update** never shows | The script looks only every `INKSIGHTS_DOCKER_CHECK` minutes (default 6 hours), and only while a display shows the Docker pages. The system needs `curl` and access to the registry. |

## Protocol (for the curious)

The lines between the script and a board: [docs/protocol.md](docs/protocol.md).

## License

Copyright 2026 Gittegatt

InkSights is free software: you can redistribute it and/or modify it under the terms of the
[GNU General Public License version 3](https://www.gnu.org/licenses/gpl-3.0.html) (GPL-3.0) as published by
the Free Software Foundation. The full text is in [LICENSE](LICENSE).

InkSights is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
details.

The firmware uses these libraries. They remain subject to their respective licenses:

- [GxEPD2](https://github.com/ZinggJM/GxEPD2) (GPL-3.0)
- [Adafruit GFX Library](https://github.com/adafruit/Adafruit-GFX-Library) (BSD), including its 5x7 font, which
  the settings page uses as well; its license is in [licenses/adafruit-gfx-bsd.txt](licenses/adafruit-gfx-bsd.txt)
- [Adafruit BusIO](https://github.com/adafruit/Adafruit_BusIO) (MIT)
- on the SAMD21, [FlashStorage](https://github.com/cmaglie/FlashStorage) (LGPL-2.1)

## AI Notice

AI-assisted coding tools were used during the development of this project.

Use of this source code, including for AI or machine-learning training, fine-tuning, dataset creation, and model
improvement, is subject to the terms of the GNU General Public License version 3.

This notice does not impose any additional restrictions, does not apply to third-party material beyond its
respective terms, and does not override applicable statutory rights or exceptions.

## Support the project

If you enjoy the project and would like to support its development, a small contribution is always appreciated.

[Star on GitHub](https://github.com/Gittegatt/InkSights)

[Support on Ko-fi](https://ko-fi.com/gittegatt)

[Support on PayPal](https://paypal.me/gittegatt)
