# Examples

What the displays show, drawn with the preview of the settings page (the same drawing as on the display), and
the settings page itself. The 2.13″ pictures are shown at twice their size. All names and values are examples.

Every top line here is one continuous line without a divider line: on red and yellow panels mostly in the third
colour (**Invert colors**, **Color highlight** and **Fill gaps** in the Header card), otherwise white
(**Invert colors**) or black. Left the time, in the middle the title, right the uptime (the defaults). A time page
has no top line.

[Back to the README](../README.md)

## Start screen

### 4.2″ start screen with the setup access point

![4.2″ start screen with the setup access point](example_01_4-2_start_screen.png)

After power-up, until the first data arrive: ID of the display, board, panel type, display pins and the WiFi
state. No WiFi set up yet, so the board has opened its access point **InkSights** at 192.168.4.1 and shows its
password.

## System page

### 2.13″ system page

![2.13″ system page](example_02_2-13_system_page.png)

CPU with temperature, power and load, RAM, the network interface with download and upload, and the
temperatures of the NVMe drive, the SSDs and the hard disks; hard disks that are asleep show `STBY`. The top line
in red over its whole width.

### 2.13″ system page with a white top line

![2.13″ system page with a white top line](example_03_2-13_system_page_inverted.png)

A black/white 250×122 panel with **Invert colors**: black text on a white top line. **ZFS RAM cache** is on here:
the grey part of the RAM bar is the cache.

## Drive pages

### 2.13″ drive page with highlight

![2.13″ drive page with highlight](example_04_2-13_drives_page_highlight.png)

Three rows per page: symbol, device, pool, used/total, temperature and the bar with the percentage (two
decimals). The pool above 85 % is highlighted in the third colour: its bar and its used capacity. Right: the
spindown timer of the hard disks as a badge (time left, `--:--` = timer not running); the SSD at the top has the
chip symbol and no timer.

### 2.13″ drive page with spindown rings

![2.13″ drive page with spindown rings](example_05_2-13_drives_page_rings.png)

A black/white panel, four rows, the spindown timer as a ring: shrinking ring = time left, circle with a dash =
timer not running. The pool above 85 % shows its used/total inverted. Black top line.

### 2.13″ drive page with yellow

![2.13″ drive page with yellow](example_06_2-13_drives_page_yellow.png)

A 250×122 panel with yellow as third colour, five rows: the top line and the pool above 85 % in yellow; text on
yellow is black. Asleep hard disks show `STBY` and `SLEEP`.

### 4.2″ drive page

![4.2″ drive page](example_07_4-2_drives_page.png)

Six rows in a custom order. The used capacity inside the bar, the total at the right, the temperature beside it. A
pool above 85 % shows its total inverted (black/white panel). Spindown timer as a ring; a dotted circle = asleep.
White top line.

### 4.2″ drive page with three rows

![4.2″ drive page with three rows](example_08_4-2_drives_page_three_rows.png)

Fewer rows per page: bigger bars, symbols and timers, readable from further away. The pool stands below the device,
the percentage with one decimal inside the bar, the timer as a badge. Black top line.

### 2.13″ drive page without ZFS

![2.13″ drive page without ZFS](example_09_2-13_drives_page_without_zfs.png)

A Linux server without ZFS: each disk shows the filesystem mounted on it, named after its mount point (`/` =
`root`). A disk with nothing mounted shows its size and **not mounted** instead of a bar. No spindown timer (the
default), so the bars reach to the right edge.

### 2.13″ upright

![2.13″ upright](example_10_2-13_upright_drives.png)

Turned by 90° in the Display card: device and used/total in the first line, the pool in its own line, the bar and
timer below.

## Network and WiFi pages

### 4.2″ network page

![4.2″ network page](example_11_4-2_network_page.png)

One row per network interface with download and upload, the link speed inside the bar. A bridge (br0) has no
link speed, so its values stand below the name; **no link** = no cable or not connected, **down** = switched
off. The wireless interface gets the WiFi symbol.

### 4.2″ network page without symbols

![4.2″ network page without symbols](example_12_4-2_network_page_percentage.png)

The same page without symbols, with how busy the link is (percentage, the default) inside the bar, and a white
top line.

### 4.2″ WiFi page

![4.2″ WiFi page](example_13_4-2_wifi_page.png)

The WiFi network the board is connected to, its IP address and how long it has been connected without a break.
Shown in the preview so far; the firmware does not draw this page yet.

## Time page

### 4.2″ time page

![4.2″ time page](example_14_4-2_time_page.png)

**Just give me time** in the Advanced Ink card: the display shows only the time page, in 24 hours, with the weekday
and the date (`2026-10-26`, the default).

### 2.13″ time page in red, 12 hours

![2.13″ time page in red, 12 hours](example_15_2-13_time_page_12h.png)

**Color highlight** and **Time frame** in the Time card: the time in red with a black outline, weekday and date in
black. **12h** with AM/PM in the Display card, the date as `26.10.2026`. The time page comes first (the default
order); the other pages follow, with their top line.

## Special screens

### 2.13″ without connection

![2.13″ without connection](example_16_2-13_no_connection.png)

The display got no fresh data for too long: **NO DATA** in the top line (in the third colour, where the uptime
stood) and **Check connection** below a picture of the empty table, its bottle in red. The time is when the last
data came.

### 4.2″ with nothing to show

![4.2″ with nothing to show](example_17_4-2_nothing_to_ink.png)

Every page of this display is switched off (no system, drive, network, time or WiFi page): **Nothing to ink** below
a picture of three people at a table, so the display never looks broken.

## Settings page and simulator

### The settings page

![The settings page](example_18_settings_page.png)

Two displays with their live previews; below each its cards, here the **Display** card open on the left (names,
time format, panel, rotation, rows per page, page turn, refresh, display pins) and the **Header** card on the
right (title, colours, divider line, places). The other cards are folded, each with its **Ink** tick that
switches that page on or off and its grip (two lines) to change the order of the pages.

### The simulator

![The Simulation card of the simulator](example_19_simulator.png)

`simulator/simulator.html` is the same settings page with simulated data; its **Simulation** card sets them: where
the data come from (disk list or a pasted frame), the time and host name, a controller that does not answer, per
display the board, panel, connection, WiFi network and **Connected** / **No data** / **Start screen**, the system
values (**Live values** = a running system) and the drives with storage, usage, temperature and spindown state.
**Update notice · Test** shows the line about a new version.
