/*
 * InkSights
 * One firmware for several boards (see BoardProfile.h and platformio.ini):
 *   Seeed XIAO SAMD21 (USB only), Seeed XIAO ESP32-C3 / ESP32-S3, ESP32-S3 Super Mini,
 *   Waveshare ESP32-S3-Zero, ESP32-C3 Super Mini, Waveshare ESP32-C3-Zero,
 *   Adafruit QT Py ESP32-S3 (N4R2 / No PSRAM)
 * and e-paper panels: 2.13" (black / white / colour, e.g. red or yellow, or black / white only)
 * or 4.2" black / white. The panel type is chosen on the settings page (saved on the board, like
 * the pins); every firmware drives all of them.
 *
 * Gets the drive status from the NAS server over USB (virtual COM port) or, on the ESP32
 * boards, over WiFi (it fetches its frame from the settings page about every 30 s, with fast refresh as often as that), and
 * shows it on the e-paper. Per disk:
 *   symbol (chip = SSD/NVMe, grey disc = spinning, light disc = asleep) | device | pool | used/total
 *   usage bar (free = grey raster, optional percentage inside) | spindown timer (badge or ring)
 * Rows per page, timer style, highlight threshold etc. come from the NAS server (settings web page).
 * The drawing is the same, pixel for pixel, as server/web/inksights-render.js (preview on the
 * settings page and the simulator). When the layout changes, change both.
 *
 * Arduino IDE:
 *   Board:     "Seeeduino XIAO" (Seeed SAMD Boards) or the ESP32 board (esp32 by Espressif,
 *              Tools > USB CDC On Boot: Enabled)
 *   Libraries: GxEPD2 (Jean-Marc Zingg), Adafruit GFX Library, FlashStorage (cmaglie, SAMD21 only)
 *
 * Wiring (module -> board), switch BS1 on L (4-line SPI). SCLK and SDI are fixed per board,
 * CS, D/C, Reset and Busy have defaults per board (BoardProfile.h, README). On the XIAO boards:
 *   VCC   -> 3V3       SCLK  -> D8  (hardware SPI, fixed)
 *   GND   -> GND       CS    -> D7
 *   SDI   -> D10 (hardware SPI, fixed)
 *   D/C   -> D9        Reset -> D6   (other side)
 *                      Busy  -> D5   (other side)
 *   Reset and Busy are optional (web page: "None"): then the display waits fixed times and
 *   cannot go into deep sleep. CS, D/C, Reset, Busy and the panel type can be changed on the
 *   settings web page; the board stores them in flash and restarts. Uploading the sketch resets
 *   them to the defaults on the SAMD21; the ESP32 boards keep them (erase the flash to reset).
 *
 * WiFi (ESP32 boards): with a network set, the board connects to it and fetches its frame from
 * the settings page ("Settings page" address). Without a network, or 30 s (adjustable) after the
 * connection was lost, it opens its own access point (default "InkSights", password "ink!1234")
 * with a setup page at http://192.168.4.1; as a captive portal, phones and laptops open that page
 * by themselves once connected. The settings page can also send the WiFi settings over USB (W line).
 *
 * Protocol (one line per record, fields separated by '|'):
 *   #BEGIN
 *   H|<title>|<HH:MM>|<rows>|<warn>|<rot>|<page>[|<timer>|<ringdir>|<icons>|<pct>|<fast>|<uptime>|<months>|<wifi>|<nodata>|<layout>|<disks>|<netbar>|<neticons>|<temps>|<stby>|<headinv>]
 *     rows   : 2 to 6 (6 only on the 4.2"), 0/missing = automatic
 *     warn   : % used from which bar and used/total are highlighted (third colour, or inverted
 *              on black/white panels); 0 = never, missing = WARN_PCT
 *     rot    : quarter turns clockwise from ROTATION (0 = 0°, 1 = 90°, 2 = 180°, 3 = 270°)
 *     page   : seconds between automatic page turns; 0 = off (always page 1),
 *              missing = PAGE_SECS. Never faster than MIN_REFRESH_MS.
 *     timer  : 0 = badge (MM:SS in a frame, default), 1 = ring
 *     ringdir: 0 = clockwise (default), 1 = counterclockwise
 *     icons  : 1 = symbols left of the bar (default), 0 = off
 *     pct    : details inside the bar: 1 = percentage, 2 = used capacity, 0 = off (default)
 *     uptime : (13th field) uptime of the NAS server, shown in the header instead of the page
 *              number ("2M 1W 3d", "3d 4h 5m"): minutes after the full calendar months; missing / -1 =
 *              page number
 *     months : (14th field) full calendar months of the uptime, missing = 0
 *     wifi   : (15th field) WiFi page 0 off / 1 with symbols / 2 without (not drawn here yet)
 *     nodata : (16th field) seconds without a fresh frame (one that differs, its time included)
 *              before the display shows "NO DATA" in the header and "Check connection" instead
 *              of the pages; 0 / missing = never
 *     layout : (17th field) header left, middle, right: T title, P page number, U uptime, C time,
 *              - nothing; lower case = that place highlighted (black on white); T, P, U, C each at
 *              most once; "---" = no header line (the rows get its room); missing / invalid = TCP
 *              (TCU when the uptime field is set). "NO DATA" takes the place of P, else U, else a
 *              free one (the middle first), else the middle, and brings the header back.
 *     disks  : (18th field) disk pages 1 on (default) / 0 off; with no system page and no network
 *              page either the display shows "Nothing to ink"
 *     netbar : (19th field) network pages: details in the bar 0 none / 1 percentage of the link /
 *              2 link speed (e.g. 1G)
 *     neticons: (20th field) network pages: symbols 1 on (default) / 0 off
 *     temps  : (21st field) drive temperatures in the rows 1 on / 0 off (default); the D lines then
 *              carry the temperature as their 12th field
 *     stby   : (22nd field) asleep hard disks (temperature -2) 1 = "STBY", 0 = "--" (default),
 *              in the drive rows and the HDD row of the system page
 *     headinv: (23rd field) header 1 = inverted (white with black text and a black line at the
 *              bottom, highlighted places black with white text), 0 = black with white text (default)
 *   N|<interface>|<down KiB/s>|<up KiB/s>|<link Mb/s>|<wireless 1/0>|<state U / L / D>
 *                              (optional, at most 8) network pages after the disk pages, one row per
 *                              interface like the network row of the system page: WiFi symbol when
 *                              wireless; L no link / D down: "no link" / "down" in the bar's place.
 *                              The S line's letters may add W (wireless) and L / D for its interface.
 *     fast   : seconds between fast refreshes (2, 5, 10, 30), 0 = off (default). Only panels
 *              that can redraw without flashing (black/white, PANELS fast): partial refresh at most this
 *              often, a full refresh on page turns and every FULL_REFRESH_MS against ghosting.
 *              Over WiFi the board then also fetches its frame this often.
 *   D|<device>|<pool>|<used>|<total>|<pct>|<idle>|<boxes>|<state>[|<remain>|<timeout>[|<°C>]]
 *   #END
 *     pct     : 0..100, also with 1 or 2 decimals ("35.47", cut) for the text in the bar;
 *               -1 = no pool / nothing mounted (total = disk size or "-")
 *     idle, boxes : old spindown box count (still sent, not drawn any more)
 *     state   : A = spinning, S = standby, N = SSD/NVMe, ? = unknown,
 *               - = timer off for this display (HDDs only, no timer at the right)
 *     remain  : seconds until spindown, -1 = timer not running (no fresh status)
 *     timeout : spindown timeout in seconds
 *     °C      : drive temperature (only with the temps field), -1 = unknown: "--",
 *               -2 = asleep hard disk: "--", or "STBY" with the stby field
 *   S|<rows>|<cpu %>|<cpu C>|<cpu W>|<RAM used MiB>|<ZFS cache MiB>|<RAM total MiB>|<interface>|<down KiB/s>|<up KiB/s>|<link Mb/s>|<NVMe C,...>|<SSD C,...>
 *                              (optional) system page, shown as page 1 before the disk pages; rows:
 *                              C cpu, R ram, N network, V NVMe, S SSD temperatures, H HDD
 *                              temperatures (from the T line), I = symbols on;
 *                              -1 = unknown, "-" = none, at most 6 temperatures each
 *   T|<HDD C,...>              (optional, after the S line) HDD temperatures of the system page,
 *                              -1 = unknown ("--"), -2 = asleep ("--" or "STBY", like the D lines);
 *                              only when drive-temp-export runs on the NAS server
 *   P|<cs>|<dc>|<rst>|<busy>[|<panel>]
 *                              (optional) pin numbers of the board (D numbers on the SAMD21, GPIO
 *                              numbers on the ESP32 boards), rst/busy -1 = not connected, and
 *                              the panel type 1-5 (PANELS, missing = keep); new values are saved
 *                              and the board restarts
 *   R                          (optional) redraw now, even if nothing changed and
 *                              before MIN_REFRESH_MS ("Redraw now" on the web page)
 *   W|<ssid>|<password>|<hostname>|<server>|<ap>|<ap ssid>|<ap password>[|<ap delay>]
 *                              (optional, USB only, ESP32 boards) WiFi settings, every text
 *                              field hex encoded (UTF-8), "-" = empty; password "*" = keep;
 *                              ap 1 = setup access point allowed; ap delay = seconds without
 *                              connection before it opens (0-3600, missing = 30). Saved when different.
 *   Answer: "OK disks=<n> page=<p>/<n> refresh=now|later|no" (+ " pins=saved restart")
 *   "PING" -> "PONG InkSights id=<chip id> size=<w>x<h> colors=<2|3> rows=<n>
 *              pins=<cs>,<dc>,<rst>,<busy> panel=<1-5> board=<board id> wifi=<0|1> fw=<version>
 *              [fast=1] [net=<sta|ap|off> ip=<address> ssid=<hex> host=<hex> server=<hex> ap=<1|0>
 *              apssid=<hex> apdelay=<s> pass=<1|0>]"   (fast=1: the panel can do fast refreshes; WiFi
 *              boards: the stored WiFi settings, texts UTF-8 hex encoded and only when set, never the
 *              passwords: pass=1 only says one is stored)
 *     The chip ID differs on every board. The NAS server uses it to tell which display
 *     gets which settings. It is shown on the start screen after power-up.
 *
 * Start screen: after power-up the display shows ID, board, panel, pins, WiFi and firmware
 * version until the first data arrives.
 */

#include <SPI.h>
#include "BoardProfile.h"
#if defined(ARDUINO_ARCH_SAMD)
  #include <FlashStorage.h>
#elif defined(ARDUINO_ARCH_ESP32)
  #include <Preferences.h>
  #include <WiFi.h>
  #include <WebServer.h>
  #include <HTTPClient.h>
  #include <ESPmDNS.h>
  #include <DNSServer.h>
#endif

const char PRODUCT_NAME[] = "InkSights";  // name in the start screen header (display name only;
                                                // "PONG InkSights" below stays, the server looks for it)
const char FW_VERSION[]   = "1.0";             // shown on the start screen and reported in PONG

// ============================== Settings ===============================

// Panel types (chosen on the settings page, saved on the board; PANELS below). If the picture is
// shifted, mirrored or just noise, choose the next one.
//   black / white / colour (red or yellow, drawn with GxEPD_RED):
//   1 = 212x104  GDEW0213Z16 (UC8151 / IL0373)  <- older MH-ET LIVE 2.13" red
//   2 = 212x104  GDEH0213Z19 (UC8151D)
//   3 = 250x122  GDEY0213Z98 (SSD1680)           <- newer modules
//   black / white only (no colour: highlighted used/total is shown inverted instead of in colour;
//   fast refresh possible):
//   4 = 250x122  GDEY0213B74 (SSD1680)
//   5 = 400x300  GDEY042T81  (SSD1683)           <- 4.2", e.g. Good Display with DESPI-C02 adapter
// The panel type a new board starts with (until one is chosen on the settings page):
#ifndef DEFAULT_PANEL
#define DEFAULT_PANEL 1
#endif
#if DEFAULT_PANEL < 1 || DEFAULT_PANEL > 5
  #error "DEFAULT_PANEL must be 1 to 5"
#endif

#define ROTATION 1               // orientation for 0° (1 = landscape); the web page turns it further

// Default control pins: per board in BoardProfile.h

const int      WARN_PCT       = 85;        // highlight bar and numbers from here, unless the NAS server says otherwise
const uint32_t MIN_REFRESH_MS = 180000UL;  // redraw at most every 3 min (full refresh only, spares the panel)
const uint32_t PAGE_SECS      = 600;       // automatic page turn, unless the NAS server says otherwise
const uint32_t FULL_REFRESH_MS = 600000UL; // fast refresh: a full refresh at least this often (against ghosting)

#if HAS_WIFI
// WiFi defaults (the setup access point opens without a network, or apDelay seconds after the
// connection was lost)
const char     DEFAULT_AP_SSID[]  = "InkSights";
const char     DEFAULT_AP_PASS[]  = "ink!1234";
const uint16_t DEFAULT_AP_DELAY   = 30;        // seconds without connection -> setup access point
const uint16_t MAX_AP_DELAY       = 3600;
const uint32_t AP_RETRY_MS        = 30000UL;
const uint32_t MDNS_RETRY_MS      = 5000UL;
const uint32_t POLL_MS            = 30000UL;   // fetch the frame from the settings page this often
#endif

// =======================================================================

// All panel types behind one base class (GxEPD2_GFX), so the type can be chosen at runtime
#define ENABLE_GxEPD2_GFX 1
#include <GxEPD2_BW.h>
#include <GxEPD2_3C.h>

// All types come before the first function: the Arduino IDE and PlatformIO put
// generated function prototypes there, and those need the types.

// One panel type: name (as printed on the flat cable), third colour, fast partial refresh
struct PanelInfo {
  const char* name;
  bool        color;   // black / white / colour (red or yellow)
  bool        fast;    // partial refresh in under a second without flashing (black / white panels)
};
const uint8_t PANEL_COUNT = 5;
const PanelInfo PANELS[PANEL_COUNT] = {   // panel type 1 to 5
  { "GDEW0213Z16", true,  false },
  { "GDEH0213Z19", true,  false },
  { "GDEY0213Z98", true,  false },
  { "GDEY0213B74", false, true  },
  { "GDEY042T81",  false, true  },
};

GxEPD2_GFX* epd = nullptr;   // created in setup() with the panel type and pins from flash

// Set in setup() from the panel type: third colour, and fast refresh possible (black / white
// panels: 2.13" GDEY0213B74, 4.2" GDEY042T81; three-colour panels only do a full refresh)
bool hasColor = true;
bool fastPanel = false;

const uint16_t BK = GxEPD_BLACK;
const uint16_t WH = GxEPD_WHITE;
uint16_t RD = GxEPD_RED;   // third colour (red or yellow panel); black on black / white panels

// Control pins (pin numbers of the board) and the panel type, kept in flash (survive power-off)
struct PinConfig {
  uint32_t magic;
  int8_t   cs, dc, rst, busy;
  int8_t   panel;   // 1 to PANEL_COUNT
};

// Fonts: the built-in 5x7, bold (drawn twice, 1 px wider) and double size
enum Font : uint8_t { F5, F5B, F5X2 };

// Fonts, bar height and timer font of one layout
struct Scale { Font dev, pool, cap; int16_t bar; Font time; };

// Badge or ring size
struct Geo { int16_t w, h, r; };

// Positions inside a row, the same for every row of a screen (rowLayout())
struct Lay {
  Scale   sc;
  int16_t x0, devX, devW, lineAsc, line2, line3, colGap, barDy, barH, boxX, textEnd, barW;
  int16_t iconBox, iconDy, timerDy, rowDy, ringW, contentH;
  bool    stacked, capLine, hasG, ccw, deepChip, boldDots, shineTurned, greyToRim, greyWider, capBelow;
  bool    driveTemp;       // temperatures in the rows (H field 21)
  bool    stby;            // asleep hard disks "STBY" instead of "--" (H field 22)
  uint8_t timer, pctBar;   // pctBar: details in the bar, 0 none, 1 percentage, 2 used capacity
  Geo     g;
};

struct Disk {
  char    dev[10];
  char    pool[16];
  char    used[8];
  char    total[8];
  char    pctTxt[7]; // the percentage as sent, up to 2 decimals ("35.47"), cut not rounded
  int8_t  pct;
  char    state;
  int32_t remain;    // seconds until spindown, -1 = timer not running
  int32_t timeout;   // spindown timeout in seconds
  int16_t temp;      // °C, -1 = unknown, -2 = asleep (only with hasTemp: the D line carries it)
  bool    hasTemp;
};

// Settings of the screen from the H line
struct Head {
  uint8_t  rows, warn, rot, timer, ringDir, icons, pctBar, fast;
  uint32_t page;
  int32_t  uptime;   // header: uptime of the NAS server instead of the page number, minutes after the
                     // full months, -1 = page number
  uint16_t upMonths; // full calendar months of the uptime
  uint32_t noData;   // seconds without fresh data before "NO DATA" is shown, 0 = never
  char     layout[4];// header left, middle, right: T title, P page, U uptime, C time, - nothing (lower case = highlighted)
  uint8_t  diskPages;// 1 = disk pages on, 0 = off (with nothing else on: "Nothing to ink")
  uint8_t  netBar;   // network pages: details in the bar 0 none, 1 percentage of the link, 2 link speed
  uint8_t  netIcons; // network pages: symbols 1 on / 0 off
  uint8_t  driveTemp;// temperatures in the drive rows 1 on / 0 off
  uint8_t  stby;     // asleep hard disks: 1 "STBY", 0 "--"
  uint8_t  headInv;  // header 1 = inverted (white with black text), 0 = black with white text
};

// System page from the S line (memset before filling: the change detection hashes the raw bytes)
struct SysInfo {
  bool    on;          // the frame has a system page
  bool    icons;       // symbols left of the rows
  char    parts[8];    // rows: C cpu, R ram, N network, V NVMe, S SSD, H HDD
  char    iface[16];
  int32_t cpu, temp, power, ramUsed, ramArc, ramTotal, rx, tx, link;   // -1 = unknown
  int16_t nvme[6], ssd[6], hdd[6];   // hdd: from the T line, -1 = asleep
  uint8_t nNvme, nSsd, nHdd;
  bool    wifiNet;     // the interface is wireless (letter W): WiFi symbol
  char    netState;    // U up, L no link, D down (letters L / D)
};

// One interface of the network pages (N line; memset before filling: hashed)
struct NetIf {
  char    name[16];
  int32_t rx, tx, link;   // KiB/s, KiB/s, Mb/s; -1 = unknown / none
  bool    wifi;           // wireless
  char    state;          // U up, L no link, D down
};

// One row of the system page and the network pages
enum SysIcon : uint8_t { SI_CPU, SI_RAM, SI_NET, SI_CHIP, SI_WIFI, SI_HDD };
struct SysRow {
  SysIcon icon;
  char    label[16], info[40], value[24], barText[8];
  bool    hasBar, pair, inl;   // pair: down and up belong together; inl: temperatures, no bar
  int16_t p1, p2;              // bar: black up to p1 %, grey up to p2 %
};

#if HAS_WIFI
// WiFi settings, kept in flash (Preferences)
struct NetConfig {
  String   ssid, pass, host, server, apSsid, apPass;
  bool     apOn;
  uint16_t apDelay;   // seconds
};
#endif

const uint32_t PIN_MAGIC = 0x45504432;  // "EPD2": pin numbers of the board (older test builds kept XIAO D numbers)
#if defined(ARDUINO_ARCH_SAMD)
FlashStorage(pinStore, PinConfig);
#else
Preferences prefs;
#endif
PinConfig pins = { PIN_MAGIC, DEF_CS, DEF_DC, DEF_RST, DEF_BUSY, DEFAULT_PANEL };
PinConfig rxPins;
bool      rxPinsGiven = false;

#if HAS_WIFI
NetConfig net;
WebServer web(80);
DNSServer dns;            // setup access point: every name points to the board (captive portal)
bool     apActive = false, mdnsActive = false, stationWasConnected = false, disconnectTimerActive = false;
bool     apAttempted = false, mdnsAttempted = false;
uint32_t disconnectedSince = 0, lastApAttempt = 0, lastMdnsAttempt = 0, lastPollMs = 0;
bool     pollDone = false;
String   activeApSsid, activeApPass;
String   lastAnswer;          // answer to the last frame, sent with the next poll
String   lastPoll = "never";  // result of the last poll, shown on the setup page
char     netShown[48] = "";   // WiFi line on the start screen, redrawn when it changes
#endif
bool     fromWifi = false;    // the line being handled came over WiFi

// Layout constants (pixels; default font = 5x7 in a 6x8 cell)
const int16_t HEADER_H      = 11;
const int16_t ROW_H_AUTO    = 22;   // row height when the NAS server sends no row count
const int16_t ROW_H_MIN     = 17;
const int16_t ROW_H_WIDE    = 34;   // 4.2" landscape: automatic = 8 rows (9 were too many)
const int16_t ROW_H_UPRIGHT = 32;   // small panels turned upright
const int16_t ROW_H_BIG_UPRIGHT = 63;   // 4.2" turned upright (pool in its own line): automatic = 6 rows
const int16_t CHAR_W        = 6;
const uint8_t MAX_DISKS     = 32;

// 2.13" by rows per page 2..5 (landscape and upright)
const Scale SCALE_213[4] = {
  { F5B, F5, F5, 14, F5 },     // 2 rows (double-size time made the badge too big)
  { F5B, F5, F5, 10, F5 },     // 3 rows
  { F5B, F5, F5,  8, F5 },     // 4 rows
  { F5B, F5, F5,  6, F5 },     // 5 rows
};
// 4.2" landscape: bar height by rows per page 2..6 (automatic: from the row height)
const int16_t BAR_WIDE[5] = { 32, 26, 22, 20, 18 };

// Characters of the 5x7 font (Adafruit GFX default font; Copyright (c) 2012 Adafruit Industries. All rights
// reserved. BSD license: licenses/adafruit-gfx-bsd.txt) for the details inside the bar (percentage or used capacity,
// e.g. "35%" or "3.18T"; column bytes, LSB = top)
const char    BAR_CHARS[] = "0123456789%.BKMGTP";
const uint8_t BAR_FONT[18][5] = {
  {0x3E,0x51,0x49,0x45,0x3E}, {0x00,0x42,0x7F,0x40,0x00}, {0x72,0x49,0x49,0x49,0x46}, {0x21,0x41,0x49,0x4D,0x33},
  {0x18,0x14,0x12,0x7F,0x10}, {0x27,0x45,0x45,0x45,0x39}, {0x3C,0x4A,0x49,0x49,0x31}, {0x41,0x21,0x11,0x09,0x07},
  {0x36,0x49,0x49,0x49,0x36}, {0x46,0x49,0x49,0x29,0x1E}, {0x23,0x13,0x08,0x64,0x62}, {0x00,0x00,0x60,0x60,0x00},
  {0x7F,0x49,0x49,0x49,0x36}, {0x7F,0x08,0x14,0x22,0x41}, {0x7F,0x02,0x1C,0x02,0x7F}, {0x3E,0x41,0x41,0x51,0x73},
  {0x03,0x01,0x7F,0x01,0x03}, {0x7F,0x09,0x09,0x09,0x06},
};
// 7x7 chip for small symbols (9 / 11 px)
const char* const ICON_CHIP[7] = { ".#.#.#.", ".#####.", "##...##", ".#...#.", "##...##", ".#####.", ".#.#.#." };  // hollow body

Disk    disks[MAX_DISKS];      // what is shown
Disk    rxDisks[MAX_DISKS];    // what is being received
uint8_t diskCount  = 0;
uint8_t rxCount    = 0;
bool    rxActive   = false;
const Head HEAD_DEFAULT = { 0, (uint8_t)WARN_PCT, 0, 0, 0, 1, 0, 0, PAGE_SECS, -1, 0, 0, "TCP", 1, 0, 1, 0, 0, 0 };
Head    head   = HEAD_DEFAULT;
Head    rxHead = HEAD_DEFAULT;
SysInfo sys;                   // system page shown
SysInfo rxSys;                 // system page being received
const uint8_t MAX_NETS = 8;    // interfaces of the network pages (N lines)
NetIf   nets[MAX_NETS];        // shown
NetIf   rxNets[MAX_NETS];      // being received
uint8_t netCount   = 0;
uint8_t rxNetCount = 0;
uint32_t lastPageMs = 0;        // when the page was last turned

char chipId[9]    = "";
char hostName[17] = "";
char timeStr[6]   = "--:--";
char rxHost[17]   = "";
char rxTime[6]    = "";

// One protocol line; the W line with the hex encoded WiFi settings needs the long buffer
#if HAS_WIFI
char     lineBuf[800];
#else
char     lineBuf[128];
#endif
uint16_t lineLen = 0;

uint8_t  page          = 0;
uint8_t  shownPage     = 0;      // page that is on the panel right now
uint32_t lastHash      = 0;
uint32_t lastRefreshMs = 0;
uint32_t lastFullMs    = 0;      // last full refresh (fast refresh: one every FULL_REFRESH_MS)
bool     refreshed     = false;  // drawn at least once?
bool     dataReceived  = false;  // got real data yet?
bool     screenIsSplash = false; // start screen on the panel (replaced at once by the first data)
bool     pending       = false;  // redraw as soon as allowed
bool     turnPage      = false;  // show the next page with that redraw
bool     rxRedraw      = false;  // frame being received asks for a redraw now
bool     forceRedraw   = false;  // redraw without waiting for MIN_REFRESH_MS
uint32_t freshHash     = 0;      // frame including its time: a new one means the NAS server is still sending
uint32_t lastFreshMs   = 0;      // when the last fresh frame arrived
bool     noDataShown   = false;  // "NO DATA" screen on the panel (or being drawn)

// ---------------------------------------------------------------- helpers

static inline int16_t imax(int16_t a, int16_t b) { return a > b ? a : b; }
static inline int16_t imin(int16_t a, int16_t b) { return a < b ? a : b; }
static inline int32_t iclamp(int32_t v, int32_t lo, int32_t hi) { return v < lo ? lo : v > hi ? hi : v; }
// Division rounding down (Math.floor in the JS code), also for negative values
static inline int16_t floorDiv(int16_t a, int16_t b) { return (a >= 0) ? a / b : -((-a + b - 1) / b); }
// Math.round of JS: halves round up, also for negative values
static inline int32_t jsRound(double v) { return (int32_t)floor(v + 0.5); }

void copyStr(char* dst, const char* src, size_t size) {
  strncpy(dst, src, size - 1);
  dst[size - 1] = '\0';
}

// Only printable ASCII; anything else becomes '?' like in the preview
void sanitize(char* s) {
  for (; *s; s++) if (*s < 32 || *s > 126) *s = '?';
}

int16_t textW(const char* s) {
  const size_t n = strlen(s);
  return n ? n * CHAR_W - 1 : 0;
}

void printAt(int16_t x, int16_t y, const char* s, uint16_t color, uint8_t size = 1) {
  epd->setTextSize(size);
  epd->setTextColor(color);
  epd->setCursor(x, y);
  epd->print(s);
  epd->setTextSize(1);
}

void printClipped(int16_t x, int16_t y, const char* s, int16_t maxChars, uint16_t color, uint8_t size = 1) {
  if (maxChars <= 0) return;
  char buf[40];
  copyStr(buf, s, sizeof(buf));
  if (maxChars < (int16_t)strlen(buf)) buf[maxChars] = '\0';
  printAt(x, y, buf, color, size);
}

uint32_t fnv1a(const void* data, size_t len, uint32_t h = 2166136261UL) {
  const uint8_t* p = (const uint8_t*)data;
  while (len--) { h ^= *p++; h *= 16777619UL; }
  return h;
}

// Chip ID: a hash of the chip's serial number (SAMD21) or factory MAC (ESP32), 8 hex digits
void readChipId() {
#if defined(ARDUINO_ARCH_SAMD)
  const uint32_t w[4] = {
    *(volatile const uint32_t*)0x0080A00C, *(volatile const uint32_t*)0x0080A040,
    *(volatile const uint32_t*)0x0080A044, *(volatile const uint32_t*)0x0080A048 };  // datasheet 10.3.3
  snprintf(chipId, sizeof(chipId), "%08lX", (unsigned long)fnv1a(w, sizeof(w)));
#else
  const uint64_t mac = ESP.getEfuseMac();
  snprintf(chipId, sizeof(chipId), "%08lX", (unsigned long)fnv1a(&mac, sizeof(mac)));
#endif
}

void loadPins() {
  PinConfig stored;
#if defined(ARDUINO_ARCH_SAMD)
  stored = pinStore.read();
#else
  prefs.begin("inksights", true);
  stored.magic = prefs.getUInt("magic", 0);
  stored.cs = prefs.getChar("cs", DEF_CS);
  stored.dc = prefs.getChar("dc", DEF_DC);
  stored.rst = prefs.getChar("rst", DEF_RST);
  stored.busy = prefs.getChar("busy", DEF_BUSY);
  stored.panel = prefs.getChar("panel", DEFAULT_PANEL);
  prefs.end();
#endif
  if (stored.magic == PIN_MAGIC && pinsValid(stored)) pins = stored;
  if (!panelValid(pins.panel)) pins.panel = DEFAULT_PANEL;
}

void savePinsAndRestart(const PinConfig& p) {
#if defined(ARDUINO_ARCH_SAMD)
  pinStore.write(p);
  delay(300);
  NVIC_SystemReset();
#else
  prefs.begin("inksights", false);
  prefs.putUInt("magic", p.magic);
  prefs.putChar("cs", p.cs);
  prefs.putChar("dc", p.dc);
  prefs.putChar("rst", p.rst);
  prefs.putChar("busy", p.busy);
  prefs.putChar("panel", p.panel);
  prefs.end();
  delay(300);
  ESP.restart();
#endif
}

bool pinAllowed(int8_t p) {
  for (int8_t a : ALLOWED_PINS) if (a == p) return true;
  return false;
}

// Usable: the board's allowed pins (BoardProfile.h; SCLK and SDI are not among them).
// All used pins different. CS and D/C are required; Reset and Busy may be -1 (not connected).
bool pinsValid(const PinConfig& p) {
  const int8_t v[4] = { p.cs, p.dc, p.rst, p.busy };
  for (uint8_t i = 0; i < 4; i++) {
    if (v[i] == -1 && i >= 2) continue;
    if (!pinAllowed(v[i])) return false;
    for (uint8_t j = 0; j < i; j++) if (v[i] == v[j]) return false;
  }
  return true;
}

bool panelValid(int8_t p) { return p >= 1 && p <= PANEL_COUNT; }

bool samePins(const PinConfig& a, const PinConfig& b) {
  return a.cs == b.cs && a.dc == b.dc && a.rst == b.rst && a.busy == b.busy && a.panel == b.panel;
}

const PanelInfo& panelInfo() { return PANELS[pins.panel - 1]; }

// The display object for a panel type (GxEPD2 class, full-screen buffer)
GxEPD2_GFX* newDisplay(int8_t panel, int8_t cs, int8_t dc, int8_t rst, int8_t busy) {
  switch (panel) {
    case 2:  return new GxEPD2_3C<GxEPD2_213_Z19c, GxEPD2_213_Z19c::HEIGHT>(GxEPD2_213_Z19c(cs, dc, rst, busy));
    case 3:  return new GxEPD2_3C<GxEPD2_213_Z98c, GxEPD2_213_Z98c::HEIGHT>(GxEPD2_213_Z98c(cs, dc, rst, busy));
    case 4:  return new GxEPD2_BW<GxEPD2_213_GDEY0213B74, GxEPD2_213_GDEY0213B74::HEIGHT>(GxEPD2_213_GDEY0213B74(cs, dc, rst, busy));
    case 5:  return new GxEPD2_BW<GxEPD2_420_GDEY042T81, GxEPD2_420_GDEY042T81::HEIGHT>(GxEPD2_420_GDEY042T81(cs, dc, rst, busy));
    default: return new GxEPD2_3C<GxEPD2_213c, GxEPD2_213c::HEIGHT>(GxEPD2_213c(cs, dc, rst, busy));
  }
}

uint8_t splitFields(char* s, char* fields[], uint8_t maxFields) {
  uint8_t n = 0;
  fields[n++] = s;
  for (; *s && n < maxFields; s++) {
    if (*s == '|') { *s = '\0'; fields[n++] = s + 1; }
  }
  return n;
}

uint8_t currentRotation() { return (ROTATION + head.rot) % 4; }

// Wide panels (4.2" in landscape): everything in double text size
bool isBig(int16_t w, int16_t h) { return imax(w, h) >= 360; }
// Upright panels (turned by 90°, about 100 px wide): pool and used/total in a second line
bool isUpright(int16_t w) { return w > 0 && w < 150; }
int16_t headerH(int16_t w, int16_t h) { return !headerOn() ? 0 : isBig(w, h) ? 20 : HEADER_H; }   // 0 = header off, the rows get its room

int16_t rowsArea() { return epd->height() - headerH(epd->width(), epd->height()) - 1; }

uint8_t rowsPerPage() {
  const int16_t w = epd->width(), h = epd->height(), area = rowsArea();
  const int16_t tall = isBig(w, h) ? (w >= h ? ROW_H_WIDE : ROW_H_BIG_UPRIGHT) : isUpright(w) ? ROW_H_UPRIGHT : 0;
  if (head.rows > 0 && area / head.rows >= (tall ? tall : ROW_H_MIN)) return head.rows;
  return area / (tall ? tall : ROW_H_AUTO);
}

int16_t rowHeight() { return rowsArea() / rowsPerPage(); }

// Pages: the system page (S line) first, then the disk pages and the network pages (N lines, as
// many rows per page as the disk pages); without disks the others are the only pages
uint8_t pageCount() {
  const uint8_t rows = rowsPerPage();
  return (sys.on ? 1 : 0) + (netCount + rows - 1) / rows +
         (diskCount == 0 ? (sys.on || netCount ? 0 : 1) : (diskCount + rows - 1) / rows);
}

// Fast refresh switched on by the NAS server and possible on this panel
bool fastMode() { return fastPanel && dataReceived && head.fast > 0; }

// Header layout from the H line: three of T, I, C, '-', each of T, I, C at most once
bool layoutValid(const char* s) {
  if (strlen(s) != 3) return false;
  for (uint8_t i = 0; i < 3; i++) {
    if (!strchr("TPUCtpuc-", s[i])) return false;
    for (uint8_t j = 0; j < i; j++) if (s[i] != '-' && toupper(s[i]) == toupper(s[j])) return false;
  }
  return true;
}

// Header line shown: not switched off (layout "---"), or "NO DATA" must be shown
bool headerOn() { return noDataShown || strcmp(head.layout, "---") != 0; }

// No fresh frame for head.noData seconds (cable, WiFi, settings page or script down): the display
// shows "NO DATA" in the header and "Check connection" instead of the pages, until data comes again.
// Over WiFi the settings page keeps handing out the last frame when the script stops, so only a
// frame that differs (its time changes every minute) counts as fresh.
bool noDataNow() { return dataReceived && head.noData > 0 && millis() - lastFreshMs >= head.noData * 1000UL; }

bool canRefreshNow() {
  if (!refreshed || screenIsSplash || forceRedraw) return true;
  const uint32_t minMs = fastMode() ? head.fast * 1000UL - 500 : MIN_REFRESH_MS;   // a little early is fine
  return millis() - lastRefreshMs >= minMs;
}

// ---------------------------------------------------------------- WiFi (ESP32 boards)
// Station with automatic reconnect; the setup access point opens without a network or when the
// connection is lost for net.apDelay seconds and closes again once connected.

#if HAS_WIFI
void loadNet() {
  prefs.begin("inksights", true);
  net.ssid   = prefs.getString("ssid", "");
  net.pass   = prefs.getString("pass", "");
  net.host   = prefs.getString("host", "");
  net.server = prefs.getString("server", "");
  net.apOn   = prefs.getBool("apOn", true);
  net.apSsid = prefs.getString("apSsid", DEFAULT_AP_SSID);
  net.apPass = prefs.getString("apPass", DEFAULT_AP_PASS);
  net.apDelay = prefs.getUShort("apDelay", DEFAULT_AP_DELAY);
  prefs.end();
  if (net.apDelay > MAX_AP_DELAY) net.apDelay = DEFAULT_AP_DELAY;
  if (net.host.isEmpty()) { net.host = "inksights-" + String(chipId); net.host.toLowerCase(); }
  if (net.apSsid.isEmpty()) net.apSsid = DEFAULT_AP_SSID;
  if (net.apPass.length() < 8) net.apPass = DEFAULT_AP_PASS;   // WPA2 needs at least 8 characters
}

void saveNet() {
  prefs.begin("inksights", false);
  prefs.putString("ssid", net.ssid);
  prefs.putString("pass", net.pass);
  prefs.putString("host", net.host);
  prefs.putString("server", net.server);
  prefs.putBool("apOn", net.apOn);
  prefs.putString("apSsid", net.apSsid);
  prefs.putString("apPass", net.apPass);
  prefs.putUShort("apDelay", net.apDelay);
  prefs.end();
}

bool apModeOn() { const wifi_mode_t m = WiFi.getMode(); return m == WIFI_AP || m == WIFI_AP_STA; }

bool apConfigMatches() {
  return apActive && apModeOn() && WiFi.softAPSSID() == net.apSsid &&
         activeApSsid == net.apSsid && activeApPass == net.apPass;
}

void resetDisconnectTimer() { disconnectedSince = millis(); disconnectTimerActive = true; }

void stopAp() {
  if (!apActive && !apModeOn()) return;   // also catches an unintended default ESP_xxxxxx access point
  dns.stop();
  WiFi.softAPdisconnect(true);
  apActive = false;
  activeApSsid = "";
  activeApPass = "";
  apAttempted = false;
  WiFi.mode(WIFI_STA);
}

void startAp(bool force) {
  if (!net.apOn || apConfigMatches()) return;
  if (apActive) stopAp();
  const uint32_t now = millis();
  if (!force && apAttempted && now - lastApAttempt < AP_RETRY_MS) return;
  apAttempted = true;
  lastApAttempt = now;
  WiFi.mode(WIFI_AP_STA);   // AP and station together only while the access point is needed
  apActive = WiFi.softAP(net.apSsid.c_str(), net.apPass.c_str());
  if (apActive) {
    activeApSsid = net.apSsid;
    activeApPass = net.apPass;
    dns.start(53, "*", WiFi.softAPIP());   // phones and laptops then open the setup page by themselves
  }
}

void netConnect() {
  if (!net.ssid.isEmpty()) {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(net.ssid.c_str(), net.pass.c_str());
  } else {
    WiFi.setAutoReconnect(false);
    startAp(true);
  }
}

void netBegin() {
  WiFi.setAutoReconnect(false);
  WiFi.mode(WIFI_MODE_NULL);   // start with WiFi completely off; the host name must be set before STA mode
  delay(50);
  WiFi.setHostname(net.host.c_str());
  resetDisconnectTimer();
  netConnect();
}

// New settings: reconnect, keep the setup access point open while trying the new network
void netReconnect() {
  if (mdnsActive) MDNS.end();
  mdnsActive = mdnsAttempted = false;
  const bool keepAp = apConfigMatches();
  if (apModeOn() && !keepAp) stopAp();
  WiFi.setAutoReconnect(false);
  WiFi.disconnect(false, false);
  delay(100);
  if (keepAp) {
    WiFi.mode(WIFI_AP_STA);
  } else {
    WiFi.mode(WIFI_MODE_NULL);
    delay(50);
    WiFi.setHostname(net.host.c_str());
    WiFi.mode(WIFI_STA);
  }
  stationWasConnected = false;
  resetDisconnectTimer();
  netConnect();
}

void netLoop() {
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (!net.apOn && apModeOn()) stopAp();
  if (connected) {
    stationWasConnected = true;
    WiFi.setAutoReconnect(true);
    disconnectTimerActive = false;
    if (apActive || apModeOn()) stopAp();   // never leave an access point open while connected
    const uint32_t now = millis();
    if (!mdnsActive && (!mdnsAttempted || now - lastMdnsAttempt >= MDNS_RETRY_MS)) {
      mdnsAttempted = true;
      lastMdnsAttempt = now;
      if (MDNS.begin(net.host.c_str())) { MDNS.addService("http", "tcp", 80); mdnsActive = true; }
    }
    return;
  }
  if (stationWasConnected) {
    stationWasConnected = false;
    if (mdnsActive) MDNS.end();
    mdnsActive = mdnsAttempted = false;
    resetDisconnectTimer();
  } else if (!disconnectTimerActive) {
    resetDisconnectTimer();
  }
  if (apActive && !apConfigMatches()) startAp(true);
  if (net.apOn && (net.ssid.isEmpty() || millis() - disconnectedSince >= net.apDelay * 1000UL)) startAp(false);
}

String netIp() {
  if (WiFi.status() == WL_CONNECTED) return WiFi.localIP().toString();
  if (apModeOn()) return WiFi.softAPIP().toString();
  return "";
}

// "sta" (connected), "ap" (setup access point open) or "off"
const char* netState() {
  if (WiFi.status() == WL_CONNECTED) return "sta";
  if (apActive) return "ap";
  return "off";
}

// WiFi line of the start screen
void netLine(char* buf, size_t size) {
  if (WiFi.status() == WL_CONNECTED) snprintf(buf, size, "%s", WiFi.localIP().toString().c_str());
  else if (apActive) snprintf(buf, size, "AP %s 192.168.4.1", net.apSsid.c_str());
  else if (!net.ssid.isEmpty()) snprintf(buf, size, "connecting ...");
  else snprintf(buf, size, "off");
}

// Hex text <-> string (W line, ssid= in PONG and the WiFi query: any character, no '|' trouble)
String toHex(const String& s) {
  static const char digits[] = "0123456789abcdef";
  String out;
  for (size_t i = 0; i < s.length(); i++) {
    const uint8_t b = (uint8_t)s[i];
    out += digits[b >> 4];
    out += digits[b & 15];
  }
  return out;
}
bool fromHex(const char* h, String& out) {
  out = "";
  if (strcmp(h, "-") == 0) return true;
  const size_t n = strlen(h);
  if (n % 2 || n > 256) return false;
  for (size_t i = 0; i < n; i += 2) {
    char b[3] = { h[i], h[i + 1], 0 };
    char* end = nullptr;
    const long v = strtol(b, &end, 16);
    if (*end || !isxdigit(h[i]) || !isxdigit(h[i + 1]) || v == 0) return false;
    out += (char)v;
  }
  return true;
}

String urlEncode(const String& s) {
  String o;
  const char* hex = "0123456789ABCDEF";
  for (size_t i = 0; i < s.length(); i++) {
    const uint8_t c = s[i];
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') o += (char)c;
    else { o += '%'; o += hex[c >> 4]; o += hex[c & 15]; }
  }
  return o;
}

String htmlEscape(const String& s) {
  String o;
  for (size_t i = 0; i < s.length(); i++) {
    const char c = s[i];
    if (c == '&') o += "&amp;"; else if (c == '<') o += "&lt;"; else if (c == '>') o += "&gt;";
    else if (c == '"') o += "&quot;"; else o += c;
  }
  return o;
}

bool hostValid(const String& h) {
  if (h.isEmpty() || h.length() > 32) return false;
  for (size_t i = 0; i < h.length(); i++) if (!isalnum((unsigned char)h[i]) && h[i] != '-') return false;
  return true;
}
bool delayValid(const String& s) {
  if (s.isEmpty() || s.length() > 4) return false;
  for (size_t i = 0; i < s.length(); i++) if (!isdigit((unsigned char)s[i])) return false;
  return s.toInt() <= MAX_AP_DELAY;
}
bool serverValid(const String& s) {
  return s.isEmpty() || ((s.startsWith("http://") || s.startsWith("https://")) && s.length() <= 128 && s.indexOf(' ') < 0);
}

// W line from the settings page (USB only): store when different, then reconnect
void applyWifiLine(char* line) {
  char* f[9];
  const uint8_t nf = splitFields(line, f, 9);
  if (nf < 8) return;
  NetConfig n = net;
  String v;
  if (!fromHex(f[1], n.ssid)) return;
  if (strcmp(f[2], "*") != 0) { if (!fromHex(f[2], v)) return; n.pass = v; }
  if (!fromHex(f[3], v)) return;
  if (!v.isEmpty()) { if (!hostValid(v)) return; n.host = v; }
  if (!fromHex(f[4], v) || !serverValid(v)) return;
  n.server = v;
  n.apOn = strcmp(f[5], "0") != 0;
  if (!fromHex(f[6], v)) return;
  if (!v.isEmpty()) n.apSsid = v;
  if (strcmp(f[7], "*") != 0) { if (!fromHex(f[7], v)) return; if (v.length() >= 8) n.apPass = v; }
  if (nf > 8) {
    char* end = nullptr;
    const long d = strtol(f[8], &end, 10);
    if (end == f[8] || *end || d < 0 || d > MAX_AP_DELAY) return;
    n.apDelay = (uint16_t)d;
  }
  const bool reconnect = n.ssid != net.ssid || n.pass != net.pass || n.host != net.host;
  const bool changed = reconnect || n.server != net.server || n.apOn != net.apOn ||
                       n.apSsid != net.apSsid || n.apPass != net.apPass || n.apDelay != net.apDelay;
  if (!changed) return;
  net = n;
  saveNet();
  if (reconnect) netReconnect();
}

// Setup page of the board (port 80): status and WiFi settings
void handleRoot() {
  String ip = netIp();
  String h = F("<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
               "<title>InkSights</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#15161a;color:#e9e7e2}"
               "main{max-width:520px;margin:0 auto;padding:24px 16px;display:grid;gap:16px}h1{margin:0;font-size:1.5rem}"
               ".card{background:#1e2024;border:1px solid #33363c;border-radius:10px;padding:16px;display:grid;gap:10px}"
               "label{display:grid;gap:4px;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:#a3a49f}"
               "input,select{font:inherit;color:inherit;background:#15161a;border:1px solid #33363c;border-radius:6px;padding:7px 9px;text-transform:none;letter-spacing:0}"
               ".pick{display:flex;gap:8px}.pick select{flex:1;min-width:0}.pick button{background:#2a2c31;color:#e9e7e2;border:1px solid #33363c}"
               ".row{display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font-size:1rem;color:#e9e7e2}"
               "button{font:inherit;font-weight:600;background:#e2aa3e;color:#1b1406;border:0;border-radius:6px;padding:9px 16px;cursor:pointer}"
               "dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0;font-family:ui-monospace,monospace;font-size:.85rem}"
               "dt{color:#a3a49f}dd{margin:0;overflow-wrap:anywhere}</style></head><body><main>"
               "<span style='font-family:ui-monospace,monospace;font-size:.72rem;letter-spacing:.08em;color:#e2aa3e'>YOUR SYSTEM METRICS AT A GLANCE</span>"
               "<h1>InkSights</h1><div class=card><dl>");
  h += "<dt>ID</dt><dd>" + String(chipId) + "</dd><dt>Board</dt><dd>" BOARD_NAME "</dd>";
  h += "<dt>Panel</dt><dd>" + String(panelInfo().name) + ", " + String(epd->width()) + "x" + String(epd->height()) +
       (hasColor ? ", b/w/color" : ", b/w") + "</dd>";
  h += "<dt>WiFi</dt><dd>" + (WiFi.status() == WL_CONNECTED ? "connected to " + htmlEscape(WiFi.SSID()) : apActive ? "setup access point " + htmlEscape(net.apSsid) : String("not connected")) + "</dd>";
  h += "<dt>Address</dt><dd>" + (ip.isEmpty() ? String("-") : ip) + "</dd>";
  h += "<dt>Last data</dt><dd>" + htmlEscape(lastPoll) + "</dd><dt>Firmware</dt><dd>" + String(FW_VERSION) + "</dd></dl></div>";
  // WiFi networks in reach: a list to pick from (strongest first), "Search" scans again
  h += F("<form class=card method=post action=/save><label>Networks found<span class=pick><select id=nets>"
         "<option value=''>Searching ...</option></select><button type=button id=again>Search</button></span></label>"
         "<label>WiFi network<input name=ssid id=ssid autocomplete=off value='");
  h += htmlEscape(net.ssid) + F("'></label><label>Password<input name=pass id=pass type=password autocomplete=off placeholder='");
  h += net.pass.isEmpty() ? "" : "unchanged";
  h += F("'></label><label>Settings page<input name=server autocomplete=off placeholder='http://hostname:8099' value='");
  h += htmlEscape(net.server) + F("'></label><label>Host name<input name=host autocomplete=off value='");
  h += htmlEscape(net.host) + F("'></label><label class=row><input type=checkbox name=apOn value=1");
  h += net.apOn ? " checked" : "";
  h += F(">Setup access point</label><label>Access point after (s)<input name=apDelay type=number min=0 max=3600 value='");
  h += String(net.apDelay) + F("'></label><label>Access point name<input name=apSsid autocomplete=off value='");
  h += htmlEscape(net.apSsid) + F("'></label><label>Access point password<input name=apPass type=password autocomplete=off placeholder='unchanged'></label>"
                                  "<div><button>Save</button></div></form>"
                                  "<script>const $=i=>document.getElementById(i),sel=$('nets');"
                                  "function opt(v,t){const o=document.createElement('option');o.value=v;o.textContent=t;return o}"
                                  "function scan(){sel.replaceChildren(opt('','Searching ...'));$('again').disabled=true;fetch('/scan').then(r=>r.json()).then(function f(d){"
                                  "if(d.running){setTimeout(()=>fetch('/scan').then(r=>r.json()).then(f),1500);return}$('again').disabled=false;"
                                  "const n=d.networks||[];sel.replaceChildren(opt('',n.length?'Choose a network ('+n.length+')':'No network found'));"
                                  "n.forEach(w=>sel.append(opt(w.ssid,w.ssid+'  '+'▮'.repeat(w.bars)+'▯'.repeat(4-w.bars)+(w.open?'  open':''))))"
                                  "}).catch(()=>{$('again').disabled=false;sel.replaceChildren(opt('','Search failed'))})}"
                                  "sel.onchange=()=>{if(sel.value){$('ssid').value=sel.value;$('pass').focus()}};$('again').onclick=scan;scan()</script>"
                                  "</main></body></html>");
  web.send(200, "text/html; charset=utf-8", h);
}

void handleSave() {
  NetConfig n = net;
  n.ssid = web.arg("ssid");
  if (web.arg("pass").length()) n.pass = web.arg("pass");
  if (n.ssid.isEmpty()) n.pass = "";
  const String host = web.arg("host");
  const String server = web.arg("server");
  String err;
  if (n.ssid.length() > 32) err = "WiFi network: max. 32 characters.";
  else if (n.pass.length() && (n.pass.length() < 8 || n.pass.length() > 63)) err = "Password: 8 to 63 characters.";
  else if (!hostValid(host)) err = "Host name: letters, digits and -, max. 32.";
  else if (!serverValid(server)) err = "Settings page: an address like http://hostname:8099.";
  else if (web.arg("apSsid").length() > 32) err = "Access point name: max. 32 characters.";
  else if (web.hasArg("apDelay") && !delayValid(web.arg("apDelay"))) err = "Access point after: 0 to 3600 seconds.";
  else if (web.arg("apPass").length() && (web.arg("apPass").length() < 8 || web.arg("apPass").length() > 63)) err = "Access point password: 8 to 63 characters.";
  if (err.length()) { web.send(400, "text/plain; charset=utf-8", err); return; }
  n.host = host;
  n.server = server;
  n.apOn = web.hasArg("apOn");
  if (web.arg("apSsid").length()) n.apSsid = web.arg("apSsid");
  if (web.arg("apPass").length()) n.apPass = web.arg("apPass");
  if (web.hasArg("apDelay")) n.apDelay = (uint16_t)web.arg("apDelay").toInt();
  const bool reconnect = n.ssid != net.ssid || n.pass != net.pass || n.host != net.host;
  net = n;
  saveNet();
  web.send(200, "text/html; charset=utf-8",
           F("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>"
             "<body style='font-family:system-ui;background:#15161a;color:#e9e7e2;padding:24px'>"
             "<p>Saved. The display connects now. <a style='color:#e2aa3e' href=/>Back</a></p>"));
  delay(300);
  if (reconnect) netReconnect();
}

// While the panel draws (each step can take seconds, up to the busy timeout when no panel answers),
// the setup page and the captive portal keep answering
bool inBusy = false;
void whileBusy(const void*) {
  if (inBusy) return;
  inBusy = true;
  if (apActive) dns.processNextRequest();
  web.handleClient();
  inBusy = false;
}

// Captive portal: while the setup access point is open, any other address (the connectivity checks
// of Android, iOS, macOS and Windows included) is sent to the setup page, so it opens by itself
void handleNotFound() {
  if (apActive) {
    web.sendHeader("Location", "http://" + WiFi.softAPIP().toString() + "/", true);
    web.send(302, "text/plain", "");
    return;
  }
  web.send(404, "text/plain", "Not found");
}

void handleScan() {
  String j = "{";
  const int16_t r = WiFi.scanComplete();
  if (r == WIFI_SCAN_RUNNING) {
    j += "\"running\":true";
  } else if (r < 0) {
    WiFi.scanDelete();
    j += WiFi.scanNetworks(true, true) == WIFI_SCAN_RUNNING ? "\"running\":true" : "\"running\":false";
  } else {
    // each name once (the strongest entry), strongest first; hidden networks left out
    j += "\"running\":false,\"networks\":[";
    bool used[64] = { false };
    const int n = r > 64 ? 64 : r;
    bool first = true;
    for (int k = 0; k < n; k++) {
      int best = -1;
      for (int i = 0; i < n; i++)
        if (!used[i] && WiFi.SSID(i).length() && (best < 0 || WiFi.RSSI(i) > WiFi.RSSI(best))) best = i;
      if (best < 0) break;
      const String name = WiFi.SSID(best);
      for (int i = 0; i < n; i++) if (WiFi.SSID(i) == name) used[i] = true;   // drop the weaker copies
      String ssid = name;
      ssid.replace("\\", "\\\\");
      ssid.replace("\"", "\\\"");
      const int rssi = WiFi.RSSI(best);
      const int bars = rssi >= -55 ? 4 : rssi >= -65 ? 3 : rssi >= -75 ? 2 : 1;
      j += String(first ? "" : ",") + "{\"ssid\":\"" + ssid + "\",\"bars\":" + bars +
           ",\"open\":" + (WiFi.encryptionType(best) == WIFI_AUTH_OPEN ? "true" : "false") + "}";
      first = false;
    }
    j += "]";
    WiFi.scanDelete();
  }
  j += "}";
  web.send(200, "application/json", j);
}

// Fetch this display's frame from the settings page; its answer goes along with the next request
void pollServer() {
  if (WiFi.status() != WL_CONNECTED || net.server.isEmpty()) return;
  const uint32_t every = fastPanel && head.fast > 0 ? head.fast * 1000UL : POLL_MS;   // fast refresh: fetch as often
  if (pollDone && millis() - lastPollMs < every) return;
  pollDone = true;
  lastPollMs = millis();
  char pinsBuf[24];
  snprintf(pinsBuf, sizeof(pinsBuf), "%d,%d,%d,%d", pins.cs, pins.dc, pins.rst, pins.busy);
  String ssidArg;   // the stored WiFi network (hex), for the WiFi page of the settings page
  if (!net.ssid.isEmpty()) ssidArg = String("&ssid=") + toHex(net.ssid);
  String url = net.server;
  while (url.endsWith("/")) url.remove(url.length() - 1);
  url += "/api/frame?id=" + String(chipId) + "&size=" + String(epd->width()) + "x" + String(epd->height()) +
         "&colors=" + String(hasColor ? 3 : 2) + "&rows=" + String(rowsPerPage()) + "&pins=" + urlEncode(pinsBuf) +
         "&panel=" + String(pins.panel) + "&board=" BOARD_ID "&fw=" + String(FW_VERSION) + (fastPanel ? "&fast=1" : "") +
         "&ip=" + netIp() + ssidArg +
         "&answer=" + urlEncode(lastAnswer);
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(url)) { lastPoll = "address not usable"; return; }
  const int code = http.GET();
  if (code == 200) {
    const String body = http.getString();
    int start = 0;
    static char wifiLine[160];   // own buffer: lineBuf may hold half a line from USB
    fromWifi = true;
    while (start < (int)body.length()) {
      int end = body.indexOf('\n', start);
      if (end < 0) end = body.length();
      String line = body.substring(start, end);
      line.trim();
      copyStr(wifiLine, line.c_str(), sizeof(wifiLine));
      handleLine(wifiLine);
      start = end + 1;
    }
    fromWifi = false;
    lastPoll = "ok";
  } else if (code == 204) {
    lastPoll = "no frame yet (settings page has not seen this display)";
  } else {
    lastPoll = code > 0 ? "HTTP " + String(code) : String("no connection to the settings page");
  }
  http.end();
}
#endif

// ---------------------------------------------------------------- fonts

int16_t fAsc(Font f) { return f == F5X2 ? 14 : 7; }

int16_t fW(Font f, const char* s) {
  if (!*s) return 0;
  if (f == F5X2) return textW(s) * 2;
  if (f == F5B) return textW(s) + 1;
  return textW(s);
}

// Text with its capitals starting at top
void fText(Font f, int16_t x, int16_t top, const char* s, uint16_t c) {
  if (f == F5X2) { printAt(x, top, s, c, 2); return; }
  printAt(x, top, s, c);
  if (f == F5B) printAt(x + 1, top, s, c);
}

// Longest start of s that fits into w px
void fFit(Font f, const char* s, int16_t w, char* out, size_t size) {
  copyStr(out, s, size);
  size_t n = strlen(out);
  while (n && fW(f, out) > w) out[--n] = '\0';
}

// ---------------------------------------------------------------- drawing

void px(int16_t x, int16_t y, uint16_t c) { epd->drawPixel(x, y, c); }

// Checkerboard raster = "grey" (the panel has no grey)
void fillRaster(int16_t x, int16_t y, int16_t w, int16_t h) {
  for (int16_t py = y; py < y + h; py++)
    for (int16_t pX = x; pX < x + w; pX++)
      if (((pX + py) & 1) == 0) px(pX, py, BK);
}

// Pixel (cx, cy) of the percentage text t drawn at tx, ty in size z?
bool pctOn(const char* t, int16_t tx, int16_t ty, int16_t z, int16_t cx, int16_t cy) {
  if (cx < tx || cy < ty) return false;
  const int16_t fx = (cx - tx) / z, row = (cy - ty) / z;
  const int16_t i = fx / CHAR_W, col = fx - i * CHAR_W;
  if (i >= (int16_t)strlen(t) || col > 4 || row > 6) return false;
  const char* k = strchr(BAR_CHARS, t[i]);
  if (!k || !t[i]) return false;   // not in the table: left out (the bar text only uses these)
  return (BAR_FONT[k - BAR_CHARS][col] >> row) & 1;
}

// text: details centred in the bar (percentage "35%" or the used capacity "3.18T"; nullptr = none),
// white over the used part, black on a light rectangle over the grey part; in the size of the row
// text (pctSize 1 or 2), but only as big as fits inside the frame (5x7: bar at least 9 px, double:
// at least 18 px), else nothing
void drawBar(int16_t x, int16_t y, int16_t w, int16_t h, int pct, bool warn, const char* text, int16_t pctSize) {
  epd->drawRect(x, y, w, h, BK);
  const int16_t iw = w - 2, ih = h - 2;
  int16_t uw = (int32_t)iw * pct / 100;
  if (pct > 0 && uw == 0) uw = 1;
  if (uw > 0) epd->fillRect(x + 1, y + 1, uw, ih, warn && hasColor ? RD : BK);
  fillRaster(x + 1 + uw, y + 1, iw - uw, ih);  // free part
  barText(x, y, w, h, uw, text, pctSize);
}
// Text centred in a bar of w x h with uw px used (see drawBar); also the network bars
void barText(int16_t x, int16_t y, int16_t w, int16_t h, int16_t uw, const char* text, int16_t pctSize) {
  if (!text || !*text) return;
  const int16_t iw = w - 2, ih = h - 2;
  const char* t = text;
  int16_t z = pctSize;
  while (z > 1 && (ih < 7 * z + 2 || textW(t) * z > iw - 2)) z--;   // double size: 1 px air above and below
  if (ih < 7 * z || textW(t) * z > iw - 2) return;
  const int16_t tw = textW(t) * z, th = 7 * z;
  const int16_t usedEnd = x + 1 + uw;   // first pixel of the grey part
  const int16_t tx = x + 1 + (iw - tw) / 2;
  const int16_t ty = y + 1 + (ih - th + 1) / 2;   // odd space: the extra pixel above
  // over the grey part a light rectangle behind the digits (margin 1 px, 2 px at double size),
  // never over the frame or the used part
  const int16_t rx = imax(tx - z, usedEnd), ry = imax(ty - z, y + 1);
  const int16_t rx2 = imin(tx + tw - 1 + z, x + w - 2), ry2 = imin(ty + th - 1 + z, y + h - 2);
  if (rx <= rx2) epd->fillRect(rx, ry, rx2 - rx + 1, ry2 - ry + 1, WH);
  for (int16_t py = ty; py < ty + th; py++)
    for (int16_t pX = tx; pX < tx + tw; pX++)
      if (pctOn(t, tx, ty, z, pX, py)) px(pX, py, pX < usedEnd ? WH : BK);
}

// Inside a rectangle with corners rounded by radius r (r limited so the corner centres never cross)
bool inRound(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, int16_t pX, int16_t pY) {
  if (pX < x || pY < y || pX >= x + w || pY >= y + h) return false;
  r = imin(r, (imin(w, h) - 1) / 2);
  const int16_t dx = pX - iclamp(pX, x + r, x + w - 1 - r), dy = pY - iclamp(pY, y + r, y + h - 1 - r);
  return dx * dx + dy * dy <= r * r + r;
}
void strokeRound(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t c) {
  for (int16_t j = y; j < y + h; j++) for (int16_t i = x; i < x + w; i++)
    if (inRound(x, y, w, h, r, i, j) && !inRound(x + 1, y + 1, w - 2, h - 2, imax(0, r - 1), i, j)) px(i, j, c);
}
// Grey (raster) inside a rounded frame
void rasterRound(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r) {
  for (int16_t j = y + 1; j < y + h - 1; j++) for (int16_t i = x + 1; i < x + w - 1; i++)
    if (((i + j) & 1) == 0 && inRound(x + 1, y + 1, w - 2, h - 2, imax(0, r - 1), i, j)) px(i, j, BK);
}
bool inDisc(int16_t dx, int16_t dy, int16_t r) { return dx * dx + dy * dy <= r * r + r; }

// Ring of radius r, lw px thick, from 12 o'clock over frac of the circle, clockwise or (ccw)
// counterclockwise. frac = time left.
void drawRing(int16_t cx, int16_t cy, int16_t r, double frac, int16_t lw, bool ccw) {
  if (frac <= 0) return;
  for (int16_t dy = -r; dy <= r; dy++) for (int16_t dx = -r; dx <= r; dx++) {
    if (!inDisc(dx, dy, r) || inDisc(dx, dy, r - lw)) continue;
    double a = atan2((double)(ccw ? -dx : dx), (double)-dy);
    if (a < 0) a += 2 * M_PI;
    if (a <= frac * 2 * M_PI) px(cx + dx, cy + dy, BK);
  }
}
// Asleep (ring style): on the 2.13" single pixels about every 3 px; bold (4.2"): dots as thick
// as the progress ring (at least 2 px), a gap of about one dot, from 4 px on with cut corners
void dottedCircle(int16_t cx, int16_t cy, int16_t r, int16_t lw, bool bold) {
  if (!bold) {
    const int32_t n = max((int32_t)8, jsRound(2 * M_PI * r / 3));
    for (int32_t k = 0; k < n; k++) {
      const double a = 2 * M_PI * k / n;
      px(cx + jsRound(r * sin(a)), cy - jsRound(r * cos(a)), BK);
    }
    return;
  }
  const int16_t d = imax(2, lw);
  const double rc = r - (d - 1) / 2.0;   // radius of the dot centres
  const int32_t n = max((int32_t)8, jsRound(2 * M_PI * rc / (d * 2)));
  for (int32_t k = 0; k < n; k++) {
    const double a = 2 * M_PI * k / n;
    const int16_t x0 = jsRound(cx + rc * sin(a) - (d - 1) / 2.0), y0 = jsRound(cy - rc * cos(a) - (d - 1) / 2.0);
    for (int16_t j = 0; j < d; j++) for (int16_t i = 0; i < d; i++)
      if (d < 4 || !((i == 0 || i == d - 1) && (j == 0 || j == d - 1))) px(x0 + i, y0 + j, BK);
  }
}
// Timer not running (ring style): thin circle with a dash in the middle
void dashCircle(int16_t cx, int16_t cy, int16_t r) {
  for (int16_t dy = -r; dy <= r; dy++) for (int16_t dx = -r; dx <= r; dx++)
    if (inDisc(dx, dy, r) && !inDisc(dx, dy, r - 1)) px(cx + dx, cy + dy, BK);
  const int16_t k = r / 2;
  epd->fillRect(cx - k, cy, 2 * k + 1, 1, BK);
}

// Shine of a spinning disc: light wedges along both diagonals (|dx| - |dy| at most dist / 4)
bool shine(int16_t dx, int16_t dy) { const int32_t d = abs(dx) - abs(dy); return 16 * d * d <= dx * dx + dy * dy; }
// The same turned by 45 degrees: light wedges along the axes
bool shineAxes(int16_t dx, int16_t dy) { const int32_t m = imin(abs(dx), abs(dy)); return 32 * m * m <= dx * dx + dy * dy; }

// Disc symbol of radius r: 1 px rim, grey (checkerboard) or light inside, a plus in the middle.
// The symbols per layout:
//   turned : 2.13" with 3 or 4 rows, shine along the axes and a light middle around the plus
//   toRim  : 2.13" with 2 rows, checkerboard up to the rim
//   wider  : 2.13" with 4 rows, checkerboard one pixel wider
void drawDiscIcon(int16_t cx, int16_t cy, int16_t r, bool grey, bool turned, bool toRim, bool wider) {
  const int16_t arm = r >= 8 ? imax(2, r / 5) : 1;   // plus grows with big symbols
  for (int16_t dy = -r; dy <= r; dy++) for (int16_t dx = -r; dx <= r; dx++) {
    if (!inDisc(dx, dy, r)) continue;
    const int32_t d2 = dx * dx + dy * dy;
    bool black = !inDisc(dx, dy, r - 1)                                                   // rim
      || (dx == 0 && abs(dy) <= arm) || (dy == 0 && abs(dx) <= arm);                      // plus
    if (!black && grey) {
      const bool inside = wider ? d2 <= (r - 2) * (r - 2) + r - 1 : inDisc(dx, dy, toRim ? r - 1 : r - 2);
      const bool light = turned ? (shineAxes(dx, dy) || d2 <= (arm + 1) * (arm + 1)) : shine(dx, dy);
      black = inside && ((dx + dy) & 1) == 1 && !light;                                   // checkerboard
    }
    if (black) px(cx + dx, cy + dy, BK);
  }
}

bool nearAny(int16_t i, const int16_t* list, uint8_t n) {
  for (uint8_t k = 0; k < n; k++) if (abs(i - list[k]) <= 1) return true;
  return false;
}
// Chip filling a box of B px (odd): up to 11 px the 7x7 bitmap; from 13 px a body with pins.
// The body is hollow: a light square inside, the black border a quarter of the body minus 1 px (at least 1 px).
// deep: the notches between the pins reach 1 px into the body (4.2" with 2 rows)
void drawChip(int16_t x, int16_t y, int16_t B, bool deep) {
  if (B <= 11) {
    const int16_t ox = x + (B - 7) / 2, oy = y + (B - 7) / 2;
    for (int16_t j = 0; j < 7; j++) for (int16_t i = 0; i < 7; i++)
      if (ICON_CHIP[j][i] == '#') px(ox + i, oy + j, BK);
    return;
  }
  const int16_t p = B >= 17 ? 3 : 2, s = imax(4, B * 28 / 100), h = s * 6 / 10, mid = (B - 1) / 2;
  const int16_t body = B - 2 * p, edge = imax(2, body / 4) - 1;
  epd->fillRect(x + p, y + p, body, body, BK);
  epd->fillRect(x + p + edge, y + p + edge, body - 2 * edge, body - 2 * edge, WH);
  const int16_t top[3] = { (int16_t)(mid - s), mid, (int16_t)(mid + s) };
  const int16_t side[2] = { (int16_t)(mid - h), (int16_t)(mid + h) };
  for (uint8_t k = 0; k < 3; k++) {
    epd->fillRect(x + top[k] - 1, y, 3, p, BK);
    epd->fillRect(x + top[k] - 1, y + B - p, 3, p, BK);
  }
  for (uint8_t k = 0; k < 2; k++) {
    epd->fillRect(x, y + side[k] - 1, p, 3, BK);
    epd->fillRect(x + B - p, y + side[k] - 1, p, 3, BK);
  }
  if (!deep) return;
  for (int16_t i = p; i < B - p; i++) {
    if (!nearAny(i, top, 3)) { px(x + i, y + p, WH); px(x + i, y + B - p - 1, WH); }
    if (!nearAny(i, side, 2)) { px(x + p, y + i, WH); px(x + B - p - 1, y + i, WH); }
  }
}

// Row symbol in a box of B px (odd)
void drawIcon(const Disk& d, int16_t x, int16_t y, int16_t B, const Lay& lay) {
  if (d.state == 'N') { drawChip(x, y, B, lay.deepChip); return; }
  const int16_t r = (B - 1) / 2;
  drawDiscIcon(x + r, y + r, r, d.state != 'S', lay.shineTurned, lay.greyToRim, lay.greyWider);
}

// Time left until spindown: MM:SS, from 100 minutes on 1h40
void timerText(int32_t s, char* buf, size_t size) {
  if (s >= 6000) snprintf(buf, size, "%ldh%02ld", (long)(s / 3600), (long)((s / 60) % 60));
  else           snprintf(buf, size, "%02ld:%02ld", (long)(s / 60), (long)(s % 60));
}
bool hasTimer(const Disk& d) { return d.state != 'N' && d.state != '-'; }
bool timerRunning(const Disk& d) { return (d.state == 'A' || d.state == 'S') && d.remain >= 0 && d.timeout > 0; }
double timerLeft(const Disk& d) {
  if (d.state != 'A' || !timerRunning(d)) return 0;
  const double f = (double)d.remain / d.timeout;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

// Badge and ring size from the bar height and the time font: the badge is 4 px (small bars) or
// 6 px higher than the bar, its text exactly in the middle; the ring is as high as the badge.
// On the 2.13" the badge of the tall bars (2 and 3 rows) is a little smaller: 4 px higher than the
// bar instead of 6, less air at the sides. The ring keeps its size.
Geo widgetGeo(uint8_t style, int16_t bar, Font font) {
  const int16_t asc = fAsc(font);
  const bool slim = !isBig(epd->width(), epd->height()) && bar > 8 && style != 1;
  int16_t h = bar + (bar <= 8 || slim ? 4 : 6);
  if ((h - asc) % 2) h += 1;                               // same gap above and below the text
  if (style == 1) { const int16_t dd = h % 2 ? h : h - 1; return Geo{ dd, dd, (int16_t)((dd - 1) / 2) }; }
  const int16_t tw = fW(font, "00:00");
  int16_t w = tw + 2 * iclamp(h / (slim ? 4 : 3), 3, 6);   // side air, at most 6 px (tall 4.2" badges)
  if ((w - tw) % 2) w += 1;                                // same gap left and right
  return Geo{ w, h, imin(5, h / 3) };
}

// Badge or ring for one disk at x, y
void drawTimer(const Disk& d, int16_t x, int16_t y, const Lay& lay) {
  if (!hasTimer(d)) return;
  const Geo& g = lay.g;
  if (lay.timer == 1) {
    const int16_t cx = x + g.r, cy = y + g.r;
    if (!timerRunning(d)) dashCircle(cx, cy, g.r);
    else if (d.state == 'S') dottedCircle(cx, cy, g.r, lay.ringW, lay.boldDots);
    else drawRing(cx, cy, g.r, timerLeft(d), lay.ringW, lay.ccw);
    return;
  }
  const Font font = lay.sc.time;
  const int16_t asc = fAsc(font);
  char t[8];
  if (!timerRunning(d)) copyStr(t, "--:--", sizeof(t));
  else if (d.state == 'S') copyStr(t, "SLEEP", sizeof(t));
  else timerText(d.remain, t, sizeof(t));
  const int16_t tw = fW(font, t), tx = x + (g.w - tw) / 2, ty = y + (g.h - asc) / 2;
  if (timerRunning(d) && d.state == 'S') {
    // grey like the bar's free part; the text on a white field so it stays readable
    rasterRound(x, y, g.w, g.h, g.r);
    const int16_t my = imin(2, (g.h - 2 - asc) / 2);
    epd->fillRect(tx - 2, ty - my, tw + 3, asc + 2 * my, WH);
  }
  strokeRound(x, y, g.w, g.h, g.r, BK);
  fText(font, tx, ty, t, BK);
}

// Positions inside a row (the same for every row of a screen). The bar starts under the device
// name; symbol, badge and ring are centred on the bar's height; the row content is centred in the row.
Lay rowLayout(int16_t W, int16_t rowH, const Scale& sc, int16_t x0, int16_t icon, bool stacked, bool capLine, uint8_t timer, int16_t ringW) {
  Lay lay;
  memset(&lay, 0, sizeof(lay));
  lay.sc = sc;
  lay.x0 = x0;
  lay.devX = icon ? x0 + icon + (icon >= 17 ? 5 : 3) : x0;
  lay.devW = 0;
  bool timerOn = false;
  for (uint8_t i = 0; i < diskCount; i++) {
    lay.devW = imax(lay.devW, fW(sc.dev, disks[i].dev));
    if (hasTimer(disks[i])) timerOn = true;
  }
  lay.lineAsc = stacked ? fAsc(sc.dev) : imax(fAsc(sc.dev), imax(fAsc(sc.pool), fAsc(sc.cap)));
  lay.line2 = stacked ? fAsc(sc.pool) + 3 : 0;   // second text line with the pool (upright)
  lay.line3 = capLine ? fAsc(sc.cap) + 3 : 0;    // third line with used/total (upright, too long beside the device)
  lay.capLine = capLine;
  lay.hasG = timerOn;
  if (timerOn) lay.g = widgetGeo(timer, sc.bar, sc.time);
  // gap between text and bar: the widget reaches (h - bar) / 2 above the bar, plus 1 px air
  const int16_t gap = timerOn ? (lay.g.h - sc.bar + 1) / 2 + 1 : 3;
  lay.barDy = lay.lineAsc + lay.line2 + lay.line3 + gap;
  lay.boxX = W - x0 - (timerOn ? lay.g.w : 0);
  lay.stacked = stacked;
  lay.timer = timer;
  lay.ringW = ringW;
  lay.colGap = fAsc(sc.dev) >= 12 ? 8 : 6;
  lay.barH = sc.bar;
  lay.textEnd = timerOn && !stacked ? lay.boxX - 5 : W - x0;   // text ends before the timer column
  lay.barW = (timerOn ? lay.boxX - 5 : W - x0) - lay.devX;
  lay.iconBox = icon;
  lay.iconDy = icon ? lay.barDy + floorDiv(sc.bar - icon, 2) : 0;
  lay.timerDy = timerOn ? lay.barDy + floorDiv(sc.bar - lay.g.h, 2) : 0;
  const int16_t top = imin(0, imin(lay.iconDy, lay.timerDy));
  const int16_t bottom = imax(lay.barDy + sc.bar, timerOn ? lay.timerDy + lay.g.h : 0);
  lay.contentH = bottom - top;
  lay.rowDy = imax(-top, (rowH - (bottom - top)) / 2 - top);
  return lay;
}

// Does every pool name fit between device and used/total (one-line layout)?
// Text at the top right of a disk row: used/total; only the total when the used capacity stands in
// the bar (saves room). The bar shows it only if it fits (like drawBar, at least in 5x7).
bool barTextFits(int16_t w, int16_t h, const char* t) { return h - 2 >= 7 && textW(t) <= w - 4; }
// Percentage in the bar: as sent ("35.47%"), with fewer decimals when that is too wide (like
// pctLabel() in inksights-render.js)
void pctLabel(const Disk& d, const Lay& lay, char* out, size_t size) {
  const char* dot = strchr(d.pctTxt, '.');
  const size_t len = strlen(d.pctTxt), cuts[3] = { len, dot ? (size_t)(dot - d.pctTxt) + 2 : len, dot ? (size_t)(dot - d.pctTxt) : len };
  for (uint8_t i = 0; i < 3; i++) {
    const size_t n = cuts[i] < len ? cuts[i] : len;
    snprintf(out, size, "%.*s%%", (int)n, d.pctTxt);
    if (barTextFits(lay.barW, lay.barH, out)) return;
  }
}
void capText(const Disk& d, const Lay& lay, uint8_t pctBar, char* out, size_t size) {
  out[0] = '\0';
  if (d.pct < 0) {   // not mounted: the disk size
    if (strcmp(d.total, "-") != 0) copyStr(out, d.total, size);
    return;
  }
  if (pctBar == 2 && barTextFits(lay.barW, lay.barH, d.used)) copyStr(out, d.total, size);
  else snprintf(out, size, "%s/%s", d.used, d.total);
}

// Upright: does used/total of any disk not fit beside its device name?
bool capTooLong(const Lay& lay) {
  for (uint8_t i = 0; i < diskCount; i++) {
    const Disk& d = disks[i];
    if (d.pct < 0) continue;
    char cap[20];
    capText(d, lay, head.pctBar, cap, sizeof(cap));
    if (lay.textEnd - fW(lay.sc.cap, cap) < lay.devX + fW(lay.sc.dev, d.dev) + 4) return true;
  }
  return false;
}

bool poolsFit(const Lay& lay) {
  for (uint8_t i = 0; i < diskCount; i++) {
    const Disk& d = disks[i];
    if (d.pct < 0) continue;
    char cap[20];
    capText(d, lay, head.pctBar, cap, sizeof(cap));
    const Font capFont = lay.textEnd - fW(lay.sc.cap, cap) < lay.devX + lay.devW + 4 ? F5 : lay.sc.cap;
    const int16_t capX = lay.textEnd - fW(capFont, cap), poolX = lay.devX + lay.devW + lay.colGap;
    if (fW(lay.sc.pool, d.pool) > capX - lay.colGap - poolX) return false;
  }
  return true;
}

// Row: symbol | device | pool | used/total, the bar below (starting under the device name), the
// timer at the right end of the bar. Upright: device | used/total, the pool in its own second line.
void drawDisk(const Disk& d, int16_t y, const Lay& lay) {
  const bool warn = head.warn > 0 && d.pct >= head.warn;
  if (lay.iconBox) drawIcon(d, lay.x0, y + lay.iconDy, lay.iconBox, lay);
  const int16_t base = y + lay.lineAsc;                       // baseline of the first text line
  // rows of several lines without a pool: the device name moves down into the last text line, right
  // above "not mounted"
  const int16_t lastBase = base + lay.line2 + lay.line3;
  const int16_t devBase = lay.stacked && d.pct < 0 ? lastBase : base;
  fText(lay.sc.dev, lay.devX, devBase - fAsc(lay.sc.dev), d.dev, BK);
  // Drive temperature (H field 21; "--" = unknown, asleep "--" or "STBY" by H field 22), ending at the right edge: landscape
  // in the first text line above the timer column (two-line rows: beside the device name); without
  // a timer column used/total moves left before it. Upright in the pool line (the pool gets
  // shorter), in the first line when used/total stands in the pool line. In the row font, else
  // 5x7, else without the "C"; nothing when that does not fit either. Like drawDisk() in
  // inksights-render.js.
  char temp[8] = "";
  if (lay.driveTemp && d.hasTemp) tempText(d.temp, lay.stby, temp, sizeof(temp));
  const int16_t tEnd = epd->width() - lay.x0;
  char tStr[8] = "";
  Font tFont = F5;
  // the longest temperature text that fits into room px: tStr / tFont, false when none
  auto tPick = [&](int16_t room) -> bool {
    char shortT[8];
    copyStr(shortT, temp, sizeof(shortT));
    const size_t n = strlen(shortT);
    if (n > 2 && shortT[n - 1] == 'C') shortT[n - 1] = '\0';   // "38°C" -> "38°"
    const char* variants[2] = { temp, shortT };
    const uint8_t count = d.temp < 0 ? 1 : 2;   // "--" / "STBY" have no short form
    for (uint8_t v = 0; v < count; v++)
      for (uint8_t k = 0; k < 2; k++) {
        const Font f = k == 0 ? lay.sc.pool : F5;
        if (fW(f, variants[v]) <= room) { copyStr(tStr, variants[v], sizeof(tStr)); tFont = f; return true; }
      }
    return false;
  };
  int16_t capEnd = lay.textEnd;
  bool tOn = false;
  uint8_t tLine = 0;   // 0 first text line, 1 pool line
  if (temp[0] && !lay.stacked && !lay.hasG && !lay.capBelow) {   // no timer column: used/total gives way
    copyStr(tStr, temp, sizeof(tStr));
    tFont = lay.sc.pool;
    tOn = true;
    capEnd = tEnd - fW(tFont, tStr) - lay.colGap;
  } else if (temp[0] && !lay.stacked && lay.hasG && !lay.capBelow && !tPick(tEnd - (lay.textEnd + 4))) {
    // too wide for the room above the timer column (ring: "STBY", "31°C"): used/total gives way here too (user)
    copyStr(tStr, temp, sizeof(tStr));
    tFont = lay.sc.pool;
    tOn = true;
    capEnd = tEnd - fW(tFont, tStr) - lay.colGap;
  }
  char cap[20];
  capText(d, lay, lay.pctBar, cap, sizeof(cap));
  Font capFont = lay.sc.cap;
  if (!lay.stacked && capEnd - fW(capFont, cap) < lay.devX + lay.devW + 4) capFont = F5;   // does not fit beside the name
  const int16_t capW = fW(capFont, cap), capX = capEnd - capW;
  // upright: used/total beside the device; only if it does not fit there, in the pool line
  const bool capLow = lay.stacked && (lay.capBelow || d.pct < 0 || capX < lay.devX + fW(lay.sc.dev, d.dev) + 4);
  // three lines (upright): used/total in its own last line, the pool keeps the whole second line
  const int16_t capBase = lay.capLine ? lastBase : capLow ? base + lay.line2 : base, capTop = capBase - fAsc(capFont);
  // Highlight: third colour on colour panels; black/white panels show used/total inverted
  if (warn && !hasColor && cap[0]) {
    epd->fillRect(capX - 1, capTop - 1, capW + 2, fAsc(capFont) + 2, BK);
    fText(capFont, capX, capTop, cap, WH);
  } else {
    // colour panels: only the used part (before the slash) in the third colour, "/" and the total black
    // (user); the total alone (used capacity in the bar) stays black
    fText(capFont, capX, capTop, cap, BK);
    const char* slash = strchr(cap, '/');
    if (warn && slash && slash > cap) {
      char used[20];
      copyStr(used, cap, imin((int)sizeof(used), (int)(slash - cap) + 1));
      fText(capFont, capX, capTop, used, RD);   // the same glyphs again, in colour
    }
  }
  const int16_t poolX = lay.stacked ? lay.devX : lay.devX + lay.devW + lay.colGap;
  const int16_t poolBase = lay.stacked ? base + lay.line2 : base;
  if (temp[0] && !tOn) {
    if (lay.stacked && !(capLow && !lay.capLine)) { tLine = 1; tOn = tPick(tEnd - poolX); }   // pool line
    else if (lay.stacked || lay.capBelow) tOn = tPick(tEnd - (d.pct < 0 && lay.stacked ? lay.devX : lay.devX + fW(lay.sc.dev, d.dev) + 4));
    else tOn = tPick(tEnd - (capEnd + 4));   // above the timer column, after used/total
  }
  const int16_t tX = tOn ? tEnd - fW(tFont, tStr) : tEnd;
  char pool[16];
  // no pool and nothing mounted: nothing in the pool column, the disk size at the right and
  // "not mounted" in the place of the bar
  const int16_t poolEnd = lay.stacked && (!capLow || lay.capLine) ? (tOn && tLine == 1 ? tX - lay.colGap : lay.textEnd) : capX - lay.colGap;
  if (d.pct < 0) pool[0] = '\0';
  else fFit(lay.sc.pool, d.pool, poolEnd - poolX, pool, sizeof(pool));
  if (pool[0]) fText(lay.sc.pool, poolX, poolBase - fAsc(lay.sc.pool), pool, BK);
  if (tOn) fText(tFont, tX, (tLine == 1 ? base + lay.line2 : base) - fAsc(tFont), tStr, BK);
  const int16_t by = y + lay.barDy;
  char barText[8] = "";   // details in the bar: percentage or used capacity
  if (lay.pctBar == 1) pctLabel(d, lay, barText, sizeof(barText));
  else if (lay.pctBar == 2) copyStr(barText, d.used, sizeof(barText));
  if (d.pct >= 0) drawBar(lay.devX, by, lay.barW, lay.barH, d.pct, warn, lay.pctBar ? barText : nullptr, lay.sc.cap == F5X2 ? 2 : 1);
  else {   // in the size of the row text (5x7 when that is much taller than the bar), centred on the bar
    // the longest text that fits (row font, else 5x7): up to the timer, or up to the right edge
    // when this disk has no timer (SSD)
    static const char* const NOT_MOUNTED[3] = { "not mounted", "unmounted", "none" };
    const int16_t room = hasTimer(d) || !lay.hasG ? lay.barW : lay.boxX + lay.g.w - lay.devX;
    Font f = fAsc(lay.sc.pool) <= lay.barH + 4 ? lay.sc.pool : F5;
    const char* t = "";
    for (uint8_t k = 0; k < 2 && !*t; k++) {
      const Font font = k == 0 ? f : F5;
      for (uint8_t i = 0; i < 3; i++)
        if (fW(font, NOT_MOUNTED[i]) <= room) { t = NOT_MOUNTED[i]; f = font; break; }
    }
    fText(f, lay.devX, by + floorDiv(lay.barH - fAsc(f), 2), t, BK);
  }
  if (lay.hasG) drawTimer(d, lay.boxX, y + lay.timerDy, lay);
}

// ---------------------------------------------------------------- system page
// Rows, each one chosen on the settings page (S line: C R N V S; I = symbols left of the rows):
//   C  CPU     load | temperature, power | bar = load
//   R  RAM     used by programs / total | ZFS cache | bar: black programs, grey ZFS cache, light free
//   N  network interface | down | up | bar = the busier direction of the link speed; without a link
//              speed the values below the name instead
//   V  NVMe    temperatures (no bar)
//   S  SSD     temperatures of the SATA / SAS SSDs (no bar)
// A temperature row without drives is left out. Like a disk row: name | info | value, the bar below;
// upright the info gets its own second line (network: down and up together in it, temperatures below
// the name). Sizes like a disk page with as many rows. The same pixels as drawSystem() in
// inksights-render.js; the arrows and the degree sign are glyphs 0x18, 0x19, 0xF8 (cp437).

const char SYM_UP = 0x18, SYM_DOWN = 0x19, SYM_DEG = (char)0xF8;

// fillRect only for a real area (Adafruit GFX draws 2 px for a height of 0)
void fillBox(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) {
  if (w > 0 && h > 0) epd->fillRect(x, y, w, h, c);
}

// Bytes -> 3.62T / 219G, like hsize() in inksights.sh and the preview (JS toFixed: halves round up)
void hsize(uint64_t bytes, char* out, size_t size) {
  static const char UNIT[6] = { 'B', 'K', 'M', 'G', 'T', 'P' };
  uint8_t i = 0;
  uint64_t div = 1;
  while (i < 5 && bytes >= div * 1024) { div *= 1024; i++; }
  const uint8_t f = bytes < 10 * div ? 2 : bytes < 100 * div ? 1 : 0;   // decimals
  const uint64_t scale = f == 2 ? 100 : f == 1 ? 10 : 1;
  const uint64_t n = (bytes * scale + div / 2) / div;                    // rounded, halves up
  if (f) snprintf(out, size, "%lu.%0*lu%c", (unsigned long)(n / scale), (int)f, (unsigned long)(n % scale), UNIT[i]);
  else   snprintf(out, size, "%lu%c", (unsigned long)n, UNIT[i]);
}
void kib(int32_t v, char* out, size_t size) {   // KiB/s, 0 = "0K"
  if (v > 0) hsize((uint64_t)v * 1024, out, size); else copyStr(out, "0K", size);
}
void mib(int32_t v, char* out, size_t size) { hsize((uint64_t)(v < 0 ? 0 : v) * 1048576ULL, out, size); }

int16_t pct100(int64_t v) { return v > 100 ? 100 : v < 0 ? 0 : (int16_t)v; }
int16_t sysPct(int64_t a, int64_t b) { return b > 0 && a >= 0 ? pct100(a * 100 / b) : -1; }

// Drive temperature text: °C, asleep (-2) "STBY" when wanted (H field 22), else "--"
void tempText(int16_t t, bool stby, char* out, size_t size) {
  if (t >= 0) snprintf(out, size, "%d%cC", t, SYM_DEG);
  else copyStr(out, t == -2 && stby ? "STBY" : "--", size);
}

void tempList(const int16_t* t, uint8_t n, char* out, size_t size) {
  out[0] = '\0';
  for (uint8_t i = 0; i < n; i++) {
    char one[8];
    tempText(t[i], head.stby == 1, one, sizeof(one));
    if (i) strncat(out, " ", size - strlen(out) - 1);
    strncat(out, one, size - strlen(out) - 1);
  }
}

// Link speed in Mb/s -> "100M", "1G", "2.5G" (like linkText in inksights-render.js)
void linkText(int32_t mbs, char* out, size_t size) {
  if (mbs < 1000) { snprintf(out, size, "%ldM", (long)mbs); return; }
  const long d = mbs / 100;   // tenths of Gb/s
  if (d % 10) snprintf(out, size, "%ld.%ldG", d / 10, d % 10);
  else        snprintf(out, size, "%ldG", d / 10);
}

// A network row (system page and network pages): name | down | up, the bar = the busier direction
// of the link speed (none without a link speed: the values below the name instead). Symbol: WiFi
// for a wireless interface, else the network one. Down / without a link: "down" / "no link" in the
// bar's place instead of the values. barMode (network pages): 1 percentage / 2 link speed in the bar.
void netRow(const NetIf& ni, uint8_t barMode, SysRow& r) {
  char a[16];
  memset(&r, 0, sizeof(r));
  r.icon = ni.wifi ? SI_WIFI : SI_NET;
  copyStr(r.label, ni.name, sizeof(r.label));
  r.pair = true;   // down and up belong together
  if (ni.state == 'D' || ni.state == 'L') { copyStr(r.info, ni.state == 'D' ? "down" : "no link", sizeof(r.info)); return; }
  const int32_t busy = ni.rx > ni.tx ? ni.rx : ni.tx;   // KiB/s of Mb/s
  const int16_t link = ni.link > 0 && busy >= 0 ? pct100((int64_t)busy * 8192 / ((int64_t)ni.link * 10000)) : -1;
  if (ni.rx >= 0) { kib(ni.rx, a, sizeof(a)); snprintf(r.info, sizeof(r.info), "%c%s", SYM_DOWN, a); }
  if (ni.tx >= 0) { kib(ni.tx, a, sizeof(a)); snprintf(r.value, sizeof(r.value), "%c%s", SYM_UP, a); }
  else copyStr(r.value, "--", sizeof(r.value));
  r.hasBar = link >= 0;
  r.p1 = r.p2 = link;
  if (link >= 0 && barMode == 1) snprintf(r.barText, sizeof(r.barText), "%d%%", link);
  else if (link >= 0 && barMode == 2) linkText(ni.link, r.barText, sizeof(r.barText));
}

uint8_t sysRows(SysRow* rows) {
  uint8_t n = 0;
  const bool C = strchr(sys.parts, 'C'), R = strchr(sys.parts, 'R'), N = strchr(sys.parts, 'N');
  const bool V = strchr(sys.parts, 'V'), S = strchr(sys.parts, 'S');
  char a[16], b[16];
  if (C) {
    SysRow& r = rows[n++];
    memset(&r, 0, sizeof(r));
    r.icon = SI_CPU;
    copyStr(r.label, "CPU", sizeof(r.label));
    if (sys.temp >= 0 && sys.power >= 0) snprintf(r.info, sizeof(r.info), "%ld%cC %ldW", (long)sys.temp, SYM_DEG, (long)sys.power);
    else if (sys.temp >= 0) snprintf(r.info, sizeof(r.info), "%ld%cC", (long)sys.temp, SYM_DEG);
    else if (sys.power >= 0) snprintf(r.info, sizeof(r.info), "%ldW", (long)sys.power);
    if (sys.cpu >= 0) snprintf(r.value, sizeof(r.value), "%ld%%", (long)sys.cpu); else copyStr(r.value, "--", sizeof(r.value));
    r.hasBar = sys.cpu >= 0;
    r.p1 = r.p2 = sys.cpu;
  }
  const bool ramOk = sys.ramTotal > 0 && sys.ramUsed >= 0;
  if (R) {
    SysRow& r = rows[n++];
    memset(&r, 0, sizeof(r));
    r.icon = SI_RAM;
    copyStr(r.label, "RAM", sizeof(r.label));
    if (ramOk && sys.ramArc > 0) { mib(sys.ramArc, a, sizeof(a)); snprintf(r.info, sizeof(r.info), "ZFS %s", a); }
    if (ramOk) { mib(sys.ramUsed, a, sizeof(a)); mib(sys.ramTotal, b, sizeof(b)); snprintf(r.value, sizeof(r.value), "%s/%s", a, b); }
    else copyStr(r.value, "--", sizeof(r.value));
    r.hasBar = ramOk;
    if (ramOk) {
      r.p1 = sysPct(sys.ramUsed, sys.ramTotal);
      r.p2 = sysPct((int64_t)sys.ramUsed + (sys.ramArc > 0 ? sys.ramArc : 0), sys.ramTotal);
    }
  }
  if (N) {
    NetIf ni;
    memset(&ni, 0, sizeof(ni));
    copyStr(ni.name, sys.iface[0] ? sys.iface : "NET", sizeof(ni.name));
    ni.rx = sys.rx; ni.tx = sys.tx; ni.link = sys.link; ni.wifi = sys.wifiNet; ni.state = sys.netState;
    netRow(ni, 0, rows[n++]);
  }
  if (V && sys.nNvme) {
    SysRow& r = rows[n++];
    memset(&r, 0, sizeof(r));
    r.icon = SI_CHIP;
    copyStr(r.label, "NVMe", sizeof(r.label));
    tempList(sys.nvme, sys.nNvme, r.info, sizeof(r.info));
    r.inl = true;
  }
  if (S && sys.nSsd) {
    SysRow& r = rows[n++];
    memset(&r, 0, sizeof(r));
    r.icon = SI_CHIP;
    copyStr(r.label, "SSD", sizeof(r.label));
    tempList(sys.ssd, sys.nSsd, r.info, sizeof(r.info));
    r.inl = true;
  }
  if (strchr(sys.parts, 'H') && sys.nHdd) {   // HDD temperatures (T line, from drive-temp-export; asleep = "--" or "STBY")
    SysRow& r = rows[n++];
    memset(&r, 0, sizeof(r));
    r.icon = SI_HDD;
    copyStr(r.label, "HDD", sizeof(r.label));
    tempList(sys.hdd, sys.nHdd, r.info, sizeof(r.info));
    r.inl = true;
  }
  return n;
}

// Bar of the system page: black up to p1 %, grey up to p2 %, light after that; text: details in
// the bar (network pages), like on the disk bars
void drawSysBar(int16_t x, int16_t y, int16_t w, int16_t h, int16_t p1, int16_t p2, const char* text, int16_t size) {
  epd->drawRect(x, y, w, h, BK);
  const int16_t iw = w - 2, ih = h - 2;
  int16_t u1 = (int32_t)iw * p1 / 100, u2 = (int32_t)iw * p2 / 100;
  if (p1 > 0 && u1 == 0) u1 = 1;
  if (p2 > p1 && u2 <= u1) u2 = u1 + 1;
  u2 = imin(imax(u2, u1), iw);
  if (u1 > 0) fillBox(x + 1, y + 1, u1, ih, BK);
  fillRaster(x + 1 + u1, y + 1, u2 - u1, ih);
  barText(x, y, w, h, u1, text, size);
}

// Symbols of the system page in a box of B px (odd):
//   CPU: square body with a 1 px outline, 1 px pins every 2 px on all four sides, a black die in the middle
//   RAM: memory module: a wide frame, black memory chips in its upper half, contacts below it
//   network: three boxes joined by lines (one at the top, two at the bottom)
void drawCpu(int16_t x, int16_t y, int16_t B) {
  const int16_t p = B >= 17 ? 3 : B >= 11 ? 2 : 1, L = B - 2 * p - 2, m = imax(1, L / 4), d = L - 2 * m;
  epd->drawRect(x + p, y + p, B - 2 * p, B - 2 * p, BK);
  for (int16_t c = p + 1; c <= p + L; c += 2) {
    fillBox(x + c, y, 1, p, BK); fillBox(x + c, y + B - p, 1, p, BK);
    fillBox(x, y + c, p, 1, BK); fillBox(x + B - p, y + c, p, 1, BK);
  }
  fillBox(x + p + 1 + m, y + p + 1 + m, d, d, BK);
}
void drawRam(int16_t x, int16_t y, int16_t B) {
  const int16_t q = B / 4, h = B - 2 * q, y0 = y + q;
  epd->drawRect(x, y0, B, h, BK);
  for (int16_t i = 1; i < B - 1; i += 2) px(x + i, y0 + h, BK);   // contacts below the module
  // memory chips in the upper half, a gap of 1 or 2 px between them
  const int16_t n = B >= 17 ? 4 : 3, g = B >= 13 ? 2 : 1, iw = B - 4, cw = imax(1, (iw - (n - 1) * g) / n);
  const int16_t used = n * cw + (n - 1) * g, left = x + 2 + (iw - used) / 2, ch = imax(1, (h - 3) / 2);
  for (int16_t k = 0; k < n; k++) fillBox(left + k * (cw + g), y0 + 2, cw, ch, BK);
}
void drawNet(int16_t x, int16_t y, int16_t B) {
  const int16_t s = (B / 3) | 1, mid = B / 2, cx = (B - 1) / 2, c = (s - 1) / 2;
  const int16_t bx[3] = { (int16_t)(x + (B - s) / 2), x, (int16_t)(x + B - s) };
  const int16_t by[3] = { y, (int16_t)(y + B - s), (int16_t)(y + B - s) };
  for (uint8_t k = 0; k < 3; k++) {
    if (s >= 5) epd->drawRect(bx[k], by[k], s, s, BK);
    else        fillBox(bx[k], by[k], s, s, BK);
  }
  fillBox(x + cx, y + s, 1, mid - s + 1, BK);               // down from the top box
  fillBox(x + c, y + mid, B - 2 * c, 1, BK);                 // across
  fillBox(x + c, y + mid, 1, B - s - mid, BK);               // down to the bottom boxes
  fillBox(x + B - 1 - c, y + mid, 1, B - s - mid, BK);
}
// WiFi: a dot at the bottom and three arcs above it (a quarter circle each, opening upwards)
void drawWifiIcon(int16_t x, int16_t y, int16_t B) {
  const int16_t t = B >= 27 ? 3 : B >= 15 ? 2 : 1, cx = (B - 1) / 2, cy = B - 1 - t, R = B - 1 - t;
  fillBox(x + cx - (t - 1), y + cy, 2 * t - 1, t, BK);   // the dot
  for (int16_t k = 1; k <= 3; k++) {
    const int16_t r = k * R / 3, r0 = r - t;
    for (int16_t dy = -r; dy < 0; dy++)
      for (int16_t dx = -cx; dx <= cx; dx++) {
        const int32_t d2 = (int32_t)dx * dx + (int32_t)dy * dy;
        if (d2 > (int32_t)r0 * r0 && d2 <= (int32_t)r * r && abs(dx) <= -dy) px(x + cx + dx, y + cy + dy, BK);
      }
  }
}
// SI_HDD: the spinning disc of the drive pages, in the style of its size (like there; wide = 4.2")
void drawSysIcon(SysIcon kind, int16_t x, int16_t y, int16_t B, bool deep, bool wide) {
  if (kind == SI_HDD) {
    const int16_t r = (B - 1) / 2;
    drawDiscIcon(x + r, y + r, r, true, !wide && (B == 11 || B == 13), !wide && B == 17, !wide && B == 11);
    return;
  }
  if (kind == SI_CPU) drawCpu(x, y, B);
  else if (kind == SI_RAM) drawRam(x, y, B);
  else if (kind == SI_NET) drawNet(x, y, B);
  else if (kind == SI_WIFI) drawWifiIcon(x, y, B);
  else drawChip(x, y, B, deep);
}

void drawSystem(int16_t HH, bool wide, bool stacked) {
  SysRow rows[6];   // CPU, RAM, network, NVMe, SSD, HDD
  const uint8_t n = sysRows(rows);
  drawRows(rows, n, 0, HH, wide, stacked, sys.icons);
}

// Network page np (0 = the first): its interfaces, every page sized for as many rows as the fullest one
void drawNetPage(uint8_t np, int16_t HH, bool wide, bool stacked) {
  const uint8_t per = rowsPerPage(), from = np * per;
  SysRow rows[MAX_NETS];
  uint8_t n = 0;
  for (uint8_t i = from; i < netCount && n < per && n < MAX_NETS; i++) netRow(nets[i], head.netBar, rows[n++]);
  drawRows(rows, n, imin(netCount, per), HH, wide, stacked, head.netIcons);
}

// Rows of the system page and the network pages; slots: sized for this many rows (network pages:
// the last page keeps the size), 0 = as many as given
void drawRows(SysRow* rows, uint8_t count, uint8_t slots, int16_t HH, bool wide, bool stacked, bool icons) {
  const int16_t W = epd->width();
  const uint8_t n = slots ? slots : count;
  if (!n) { printAt(wide ? 4 : 2, HH + 6, "No values", BK, wide ? 2 : 1); return; }
  const int16_t rowH = rowsArea() / n;
  Scale sc;
  if (wide) {
    const int16_t bar = BAR_WIDE[iclamp(n, 2, 6) - 2];
    sc = Scale{ F5X2, F5X2, F5X2, bar, bar >= 14 ? F5X2 : F5 };
  } else {
    sc = SCALE_213[iclamp(n, 2, 5) - 2];
  }
  // symbols like on the disk pages: a box of bar + 3 (odd), at least 21 on the 4.2"; text and bars start after it
  const int16_t icon = icons ? (wide ? imax(21, (sc.bar + 3) | 1) : (sc.bar + 3) | 1) : 0;
  const int16_t ix0 = wide ? 4 : 2, x0 = icon ? ix0 + icon + (icon >= 17 ? 5 : 3) : ix0, end = W - ix0;
  const int16_t colGap = fAsc(sc.dev) >= 12 ? 8 : 6;
  int16_t labelW = 0;
  for (uint8_t i = 0; i < count; i++) {
    char t[16];
    fFit(sc.dev, rows[i].label, stacked ? (end - x0) / 2 : W / 4, t, sizeof(t));
    copyStr(rows[i].label, t, sizeof(rows[i].label));
    labelW = imax(labelW, fW(sc.dev, rows[i].label));
  }
  const int16_t lineAsc = stacked ? imax(fAsc(sc.dev), fAsc(sc.cap)) : imax(fAsc(sc.dev), imax(fAsc(sc.pool), fAsc(sc.cap)));
  const int16_t line2 = stacked ? fAsc(sc.pool) + 3 : 0;
  const int16_t barDy = lineAsc + line2 + 3;
  const int16_t rowDy = imax(0, (rowH - (barDy + sc.bar)) / 2);
  char t[40];
  for (uint8_t i = 0; i < count; i++) {
    const SysRow& r = rows[i];
    // temperature rows have no bar: their text sits in the middle of the space a bar row takes,
    // so the gaps above and below them look even
    const int16_t shift = r.inl ? floorDiv(barDy + sc.bar - lineAsc - (stacked ? line2 : 0), 2) : 0;
    // 2.13" landscape with bar rows taller than the row (6 rows on 212x104): their text line 2 px
    // lower, so it does not touch the bar of the row above (user)
    const int16_t drop = !wide && !stacked && !r.inl && barDy + sc.bar > rowH ? 2 : 0;
    const int16_t y = HH + 2 + i * rowH + rowDy + shift, base = y + lineAsc + drop;
    if (icon) {
      // centred on the bar (or the values in its place); temperature rows: on their text lines
      const int16_t top = r.inl ? base - fAsc(sc.dev) : y + barDy;
      const int16_t h = r.inl ? (stacked ? line2 : 0) + fAsc(sc.dev) : sc.bar;
      drawSysIcon(r.icon, ix0, top + floorDiv(h - icon, 2), icon, wide && n == 2, wide);
    }
    fText(sc.dev, x0, base - fAsc(sc.dev), r.label, BK);
    if (r.inl) {   // temperatures: landscape after the name (info column), upright in the second line
      const int16_t ix = stacked ? x0 : x0 + labelW + colGap;
      fFit(sc.pool, r.info, end - ix, t, sizeof(t));
      fText(sc.pool, ix, (stacked ? base + line2 : base) - fAsc(sc.pool), t, BK);
      continue;
    }
    if (!r.hasBar) {   // no bar: the values below the name, where the bar would be (upright: in the second line)
      const int16_t vX = end - fW(sc.cap, r.value);
      const int16_t topCap = stacked ? base + line2 - fAsc(sc.cap) : y + barDy + floorDiv(sc.bar - fAsc(sc.cap), 2);
      const int16_t topPool = stacked ? base + line2 - fAsc(sc.pool) : y + barDy + floorDiv(sc.bar - fAsc(sc.pool), 2);
      fText(sc.cap, vX, topCap, r.value, BK);
      fFit(sc.pool, r.info, (r.value[0] ? vX - colGap : end) - x0, t, sizeof(t));
      fText(sc.pool, x0, topPool, t, BK);
      continue;
    }
    // upright, a pair (network: down | up) shares the second line, so both values line up
    const bool low = stacked && r.pair;
    const int16_t vX = end - fW(sc.cap, r.value);
    fText(sc.cap, vX, (low ? base + line2 : base) - fAsc(sc.cap), r.value, BK);
    const int16_t infoX = stacked ? x0 : x0 + labelW + colGap;
    fFit(sc.pool, r.info, (stacked && !low ? end : vX - colGap) - infoX, t, sizeof(t));
    fText(sc.pool, infoX, (stacked ? base + line2 : base) - fAsc(sc.pool), t, BK);
    drawSysBar(x0, y + barDy, end - x0, sc.bar, r.p1, r.p2, r.barText, sc.cap == F5X2 ? 2 : 1);
  }
}

void pinText(char* buf, size_t size, int8_t p) {
  if (p < 0) copyStr(buf, "-", size);
  else       snprintf(buf, size, "%d", p);
}

// Start screen: a header like the normal screen, below it the product name big and centred, then
// the lines ID, board, panel, pins (and WiFi, key), both together in the middle of the room above
// "Waiting for data ..." at the bottom. Everything in u = 1 (2.13") or 2 (4.2", like its header
// and rows): the name as big as fits (at most 3u x), the lines 11u px apart (down to 9 on the
// 2.13" when room is short). Like drawSplash() in inksights-render.js.
// Logo bars in front of the product name on the start screen (as in examples/example_00_inksights.png):
// four bars in units of the name's pixel size z, 1.4 z wide and z apart, 1.5 / 3.2 / 5.3 / 2.5 z high,
// standing on the baseline of the name, then z of air before the name. Like drawLogo() in inksights-render.js.
const uint8_t LOGO_BARS[4] = { 15, 32, 53, 25 };   // heights in tenths of z
int16_t logoBarW(int16_t z) { return (14 * z + 5) / 10; }
int16_t logoW(int16_t z) { return 4 * logoBarW(z) + 4 * z; }   // incl. the air before the name
void drawLogo(int16_t x, int16_t base, int16_t z) {
  const int16_t bw = logoBarW(z);
  for (uint8_t i = 0; i < 4; i++) {
    const int16_t h = (LOGO_BARS[i] * z + 5) / 10;
    epd->fillRect(x + i * (bw + z), base - h, bw, h, BK);
  }
}

void drawSplash() {
  const int16_t W = epd->width(), H = epd->height();
  const uint8_t u = isBig(W, H) ? 2 : 1;
  const int16_t CW = CHAR_W * u, HH = isBig(W, H) ? 20 : HEADER_H, hx = 2 * u, hy = u == 2 ? 3 : 2;
  char line[48];
  epd->fillRect(0, 0, W, HH, BK);
  snprintf(line, sizeof(line), "v%s", FW_VERSION);
  const int16_t verX = W - hx - textW(line) * u;
  printAt(verX, hy, line, WH, u);
  printClipped(hx, hy, PRODUCT_NAME, (verX - CW - hx) / CW, WH, u);  // cut before the version

  const int16_t lh = 7 * u, waitY = H - 2 * u - lh, avail = waitY - 4 * u - HH;   // room between the header and the waiting line
#if HAS_WIFI
  const uint8_t lines = 4 + 1 + (apActive ? 1 : 0);
#else
  const uint8_t lines = 4;
#endif
  int16_t pitch = 11 * u;
  while (pitch > 9 * u && 7 * 2 * u + 6 * u + (lines - 1) * pitch + lh > avail) pitch--;
  const int16_t blockH = (lines - 1) * pitch + lh;
  int16_t z = 3 * u;
  while (z > 1 && (7 * z + 6 * u + blockH > avail || textW(PRODUCT_NAME) * z + logoW(z) > W - 2 * hx)) z--;
  const int16_t gap = iclamp(avail - 7 * z - blockH - 4 * u, 2 * u, 12 * u), group = 7 * z + gap + blockH;
  const int16_t ty = HH + imax(2 * u, (avail - group) / 2);
  const int16_t nx = (W - textW(PRODUCT_NAME) * z - logoW(z)) / 2;   // logo bars + name, centred together
  drawLogo(nx, ty + 7 * z, z);
  printAt(nx + logoW(z), ty, PRODUCT_NAME, BK, z);

  const int16_t x = hx + 7 * CW;  // value column
  int16_t y = ty + 7 * z + gap;
  printAt(hx, y, "ID", BK, u);
  printAt(x, y, chipId, BK, u);
  printAt(x + u, y, chipId, BK, u);  // bold
  y += pitch;
  printAt(hx, y, "Board", BK, u);
  printClipped(x, y, BOARD_NAME, (W - x) / CW, BK, u);
  y += pitch;
  printAt(hx, y, "Panel", BK, u);
  snprintf(line, sizeof(line), "%s %s", panelInfo().name, hasColor ? "b/w/color" : "b/w");
  printAt(x, y, line, BK, u);
  y += pitch;
  char cs[4], dc[4], rst[4], busy[4];
  pinText(cs, sizeof(cs), pins.cs);
  pinText(dc, sizeof(dc), pins.dc);
  pinText(rst,  sizeof(rst),  pins.rst);
  pinText(busy, sizeof(busy), pins.busy);
  printAt(hx, y, PIN_TITLE, BK, u);
  snprintf(line, sizeof(line), "CS%s DC%s RST%s BUSY%s", cs, dc, rst, busy);
  printClipped(x, y, line, (W - x) / CW, BK, u);

#if HAS_WIFI
  y += pitch;
  printAt(hx, y, "WiFi", BK, u);
  netLine(netShown, sizeof(netShown));
  printClipped(x, y, netShown, (W - x) / CW, BK, u);
  if (apActive) {   // how to set it up: the access point password
    snprintf(line, sizeof(line), "Key %s", net.apPass.c_str());
    printClipped(x, y + pitch, line, (W - x) / CW, BK, u);
  }
#endif

  printAt(hx, waitY, "Waiting for data from system ...", BK, u);
}

// Uptime of the NAS server for the header: full calendar months plus the minutes after them; the
// three biggest units from the first one that is not 0 ("1Y 2M 3W", "2M 1W 3d", "1W 5d 4h"),
// fewer when room is short ("2M 1W", "2M"); Y year, M month, W week, d day, h hour, m minute
void uptimeText(uint16_t months, int32_t min, int16_t maxChars, char* out, size_t size) {
  static const char UNIT[7] = "YMWdhm";
  const int32_t v[6] = { months / 12, months % 12, min / 10080, min % 10080 / 1440, min % 1440 / 60, min % 60 };
  uint8_t i = 0;
  while (i < 5 && v[i] == 0) i++;
  out[0] = '\0';
  char t[32] = "";
  size_t len = 0;
  for (uint8_t k = i; k < i + 3 && k < 6; k++) {
    len += snprintf(t + len, sizeof(t) - len, "%s%ld%c", len ? " " : "", (long)v[k], UNIT[k]);
    if ((int16_t)len > maxChars) break;
    copyStr(out, t, size);
  }
}

// Header: three places (left, middle, right) as in head.layout: T title, P page number, U uptime of
// the NAS server, C time, - nothing (default TCP; "---" = no header line, the rows get its room);
// a lower-case letter highlights its place (black text on a white box; inverted header, H field
// 23: white with black text and a black line at the bottom, highlighted white on black). Left and right stand at
// the edges, the middle one centred but never into its neighbours; only the title is cut, and
// where there is room the others leave 5 of its characters. "NO DATA" stands in the place of the
// page number, else of the uptime, else in a free place (the middle first), else in the middle;
// it brings the header line back when it is switched off.
void drawHeader(int16_t W, bool wide) {
  if (!headerOn()) return;
  const uint8_t hs = wide ? 2 : 1;
  const int16_t hx = wide ? 4 : 2, hy = wide ? 3 : 2, gap = 6 * hs;
  const bool inv = head.headInv == 1;
  const uint16_t bg = inv ? WH : BK, fg = inv ? BK : WH;
  const int16_t HH = headerH(W, epd->height());
  epd->fillRect(0, 0, W, HH, bg);
  if (inv) epd->fillRect(0, HH - 1, W, 1, BK);
  char lay[4];
  bool lit[3];
  for (uint8_t i = 0; i < 3; i++) { lay[i] = toupper(head.layout[i]); lit[i] = islower(head.layout[i]); }
  lay[3] = '\0';
  if (noDataShown) {
    const char* p = strchr(lay, 'P');
    if (!p) p = strchr(lay, 'U');
    const uint8_t at = p ? p - lay : lay[1] == '-' ? 1 : lay[2] == '-' ? 2 : lay[0] == '-' ? 0 : 1;
    lay[at] = 'N';
  }
  const bool hasT = strchr(lay, 'T') != nullptr;
  const int16_t keep = hasT ? imin(strlen(hostName), 5) * 6 * hs : 0;
  const uint8_t pages = pageCount();
  char pg[8] = "", up[16] = "";
  if (pages > 1) snprintf(pg, sizeof(pg), "%u/%u", page + 1, pages);
  auto txt = [&](char k) -> const char* { return k == 'C' ? timeStr : k == 'P' ? pg : k == 'N' ? "NO DATA" : k == 'U' ? up : ""; };
  if (strchr(lay, 'U') && head.uptime >= 0) {   // as many units as fit beside the others and 5 characters of the title
    int16_t room = W - 2 * hx - (hasT ? keep - hs + gap : 0);
    for (uint8_t i = 0; i < 3; i++) if (strchr("CPN", lay[i]) && txt(lay[i])[0]) room -= textW(txt(lay[i])) * hs + gap;
    uptimeText(head.upMonths, head.uptime, (room + hs) / (6 * hs), up, sizeof(up));
  }
  char item[3];
  for (uint8_t i = 0; i < 3; i++) item[i] = lay[i] != 'T' && lay[i] != '-' && !txt(lay[i])[0] ? '-' : lay[i];
  auto fixed = [](char k) { return k != 'T' && k != '-'; };
  auto wOf = [&](char k) -> int16_t { return fixed(k) ? textW(txt(k)) * hs : 0; };
  // highlighted: a box in the text colour 2 px (4 px on the 4.2") wider than the text on each
  // side, the text in the header colour; "NO DATA": white box, text in the third colour (inverted
  // header: a box in the third colour, white text; there the boxes reach up to the top edge, so no
  // white line stays above them, user)
  const int16_t boxY = inv ? 0 : hy - hs;
  auto put = [&](uint8_t i, int16_t px, const char* s) {
    const bool nd = item[i] == 'N';
    if (lit[i] || nd) epd->fillRect(px - 2 * hs, boxY, textW(s) * hs + 4 * hs, hy - hs + 9 * hs - boxY, nd ? (inv ? RD : WH) : fg);
    printAt(px, hy, s, nd ? (inv ? WH : RD) : lit[i] ? bg : fg, hs);
  };
  int16_t x[3] = { 0, 0, 0 };
  if (fixed(item[0])) x[0] = hx;
  if (fixed(item[2])) x[2] = W - hx - wOf(item[2]);
  if (fixed(item[1])) {
    const int16_t w = wOf(item[1]);
    const int16_t lo = item[0] == 'T' ? hx + keep + 5 * hs : item[0] == '-' ? hx : x[0] + wOf(item[0]) + gap;
    const int16_t hi = item[2] == 'T' ? W - hx - (keep - hs) - gap - w : item[2] == '-' ? W - hx - w : x[2] - gap - w;
    x[1] = imin(hi, imax(lo, (W - w) / 2));
  }
  int8_t ti = -1;
  for (int8_t i = 0; i < 3; i++) if (item[i] == 'T') ti = i;
  if (ti >= 0) {   // the title gets the room between its neighbours
    int16_t start = hx, end = W - hx;
    for (int8_t i = ti - 1; i >= 0; i--) if (item[i] != '-') { start = x[i] + wOf(item[i]) + gap; break; }
    for (int8_t i = ti + 1; i < 3; i++) if (item[i] != '-') { end = x[i] - gap; break; }
    char t[17];
    fFit(hs == 2 ? F5X2 : F5, hostName, end - start, t, sizeof(t));
    const int16_t tw = textW(t) * hs;
    if (t[0]) put(ti, ti == 0 ? start : ti == 2 ? end - tw : imin(end - tw, imax(start, (W - tw) / 2)), t);
  }
  for (uint8_t i = 0; i < 3; i++) if (fixed(item[i])) put(i, x[i], txt(item[i]));   // "NO DATA": inverted, in the third colour
}

// Pictures of the "Nothing to ink" screen: three people sitting about, rows of whole bytes (MSB = left
// pixel), the same tables as in inksights-render.js: NOTHING_ART 118 x 60 (4.2"), NOTHING_ART_M the same
// with the 2.13" bottle (longer neck, one row higher, like on the "Check connection" picture; user),
// NOTHING_ART_S 96 x 49 for narrow panels (2.13" upright), all sampled from the same drawing.
// NOTHING_RED(_M, _S) = x0, y0, x1, y1 of the bottle's content, in the third colour on colour panels (user)
const int16_t NOTHING_ART_W = 118, NOTHING_ART_H = 60, NOTHING_ART_S_W = 96, NOTHING_ART_S_H = 49;
// pixels that lose their upper outer quarter when drawn 2x or bigger (x, y, side -1 left / 1 right):
// the bottle's step from the neck to the shoulder, half a picture pixel high (user)
const int16_t NOTHING_CUT[6] = { 70, 18, -1, 73, 18, 1 };
const int16_t NOTHING_RED[4] = { 70, 14, 73, 27 }, NOTHING_RED_M[4] = { 70, 13, 73, 26 }, NOTHING_RED_S[4] = { 57, 12, 59, 22 };
const uint8_t NOTHING_ART[900] = {
  0x00, 0x00, 0xF8, 0x00, 0x00, 0x00, 0x00, 0x1F, 0xC0, 0x00, 0x00, 0x00, 0x0C, 0x00, 0x00,
  0x00, 0x01, 0xFC, 0x00, 0x00, 0x00, 0x00, 0x3F, 0xA0, 0x00, 0x00, 0x01, 0xFE, 0x00, 0x00,
  0x00, 0x03, 0xFE, 0x00, 0x00, 0x00, 0x00, 0xFF, 0x90, 0x00, 0x00, 0x03, 0xFF, 0x80, 0x00,
  0x00, 0x07, 0xCF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0x90, 0x00, 0x00, 0x07, 0xFF, 0xC0, 0x00,
  0x00, 0x07, 0x87, 0x00, 0x00, 0x00, 0x01, 0xFF, 0xF0, 0x00, 0x00, 0x07, 0xFF, 0xC0, 0x00,
  0x00, 0x07, 0x87, 0x00, 0x00, 0x00, 0x01, 0xFF, 0xF0, 0x00, 0x00, 0x0F, 0xCF, 0xE0, 0x00,
  0x00, 0x07, 0x03, 0xC0, 0x00, 0x00, 0x03, 0xE0, 0xF8, 0x00, 0x00, 0x0F, 0x8F, 0xE0, 0x00,
  0x00, 0x05, 0xFE, 0x80, 0x00, 0x00, 0x03, 0x06, 0x30, 0x00, 0x00, 0x0F, 0x07, 0xC0, 0x00,
  0x00, 0x04, 0x7F, 0x20, 0x00, 0x00, 0x03, 0x06, 0x60, 0x00, 0x00, 0x06, 0x3B, 0xE0, 0x00,
  0x00, 0x00, 0x66, 0xD0, 0x00, 0x00, 0x01, 0x80, 0xE0, 0x00, 0x00, 0x05, 0xB9, 0x60, 0x00,
  0x00, 0x02, 0x05, 0x48, 0x00, 0x00, 0x07, 0xC0, 0x40, 0x00, 0x00, 0x07, 0x98, 0x40, 0x00,
  0x00, 0x02, 0x0D, 0x88, 0x00, 0x00, 0x04, 0x61, 0xC0, 0x00, 0x00, 0x03, 0x81, 0xC0, 0x00,
  0x00, 0x05, 0x10, 0x48, 0x00, 0x00, 0x1F, 0xD3, 0x80, 0x00, 0x00, 0x01, 0x21, 0x00, 0x00,
  0x00, 0x04, 0x88, 0x2E, 0x00, 0x00, 0x1F, 0xD9, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00,
  0x00, 0x3A, 0x70, 0x36, 0x00, 0x00, 0x3F, 0xFE, 0x01, 0x80, 0x00, 0x00, 0x05, 0x80, 0x00,
  0x00, 0x7F, 0x30, 0x17, 0x00, 0x00, 0x7F, 0xFE, 0x01, 0x80, 0x00, 0x00, 0x41, 0x80, 0x00,
  0x00, 0xFF, 0x9F, 0x1F, 0x80, 0x00, 0xFF, 0xFF, 0x01, 0x80, 0x00, 0x00, 0x3A, 0x78, 0x00,
  0x01, 0xFF, 0xDF, 0x8F, 0x80, 0x00, 0xFF, 0xFF, 0x81, 0x80, 0x00, 0x00, 0xE7, 0xFF, 0x00,
  0x07, 0xFF, 0xDF, 0xCF, 0x80, 0x01, 0xFF, 0xFF, 0x83, 0xC0, 0x00, 0x01, 0xCF, 0xFF, 0x80,
  0x1F, 0xFF, 0xE7, 0xF7, 0x80, 0x01, 0xFF, 0xFF, 0x83, 0xC0, 0x00, 0x03, 0xDF, 0xFF, 0x80,
  0x78, 0xFF, 0xF7, 0xFF, 0xC0, 0x03, 0xFF, 0xFF, 0xC3, 0xC0, 0x00, 0x07, 0xDF, 0xFF, 0xF0,
  0xFF, 0x8F, 0xF7, 0xFF, 0xC0, 0x03, 0xFF, 0xFF, 0xC0, 0xC0, 0x00, 0x0F, 0xBF, 0xFF, 0xF0,
  0xFF, 0x87, 0xFB, 0xFF, 0xC0, 0x03, 0xFF, 0xF7, 0xE0, 0xC0, 0x00, 0x0F, 0xBF, 0xFF, 0xF8,
  0xFF, 0xC7, 0xFB, 0xFF, 0xC0, 0x03, 0xFF, 0xF7, 0xF0, 0xC0, 0x00, 0x7F, 0x3F, 0xC0, 0x7C,
  0xFF, 0xE3, 0xFB, 0xBF, 0xC0, 0x07, 0xFF, 0xFF, 0xF0, 0xC0, 0x01, 0xFF, 0x7F, 0x8F, 0xFC,
  0x7C, 0x71, 0xFD, 0x87, 0x80, 0x74, 0xFF, 0xFC, 0xFC, 0xC7, 0xFF, 0xFF, 0x7F, 0x1F, 0xFC,
  0x03, 0x35, 0xFD, 0x80, 0x00, 0x46, 0xFF, 0xFC, 0xFF, 0xE7, 0xFF, 0xF9, 0x7E, 0x37, 0xFC,
  0x01, 0x2D, 0xFD, 0x81, 0xFC, 0x46, 0x80, 0x04, 0xFF, 0xF8, 0x7F, 0xF9, 0xFE, 0x36, 0x78,
  0x01, 0x3F, 0xFD, 0x83, 0xFC, 0x3E, 0x80, 0x04, 0xFF, 0xF0, 0x3F, 0x82, 0xFE, 0xD4, 0x00,
  0x01, 0xBF, 0xFE, 0x8F, 0xFE, 0x42, 0x7F, 0xFC, 0x78, 0x08, 0x00, 0x02, 0xFE, 0x94, 0x00,
  0x01, 0x9F, 0xFF, 0x7F, 0xFE, 0x7F, 0x7F, 0xFC, 0xBF, 0xF8, 0x00, 0x05, 0xFF, 0xE4, 0x00,
  0x01, 0x9F, 0xFD, 0xFF, 0xFF, 0x1F, 0x7F, 0xFC, 0xFF, 0xE0, 0xF8, 0x0B, 0xFF, 0xEC, 0x00,
  0x00, 0xDF, 0xF3, 0xFF, 0xCF, 0x03, 0x40, 0x04, 0xE0, 0x00, 0xFF, 0x9B, 0xFF, 0xE8, 0x00,
  0x00, 0xCF, 0xDF, 0xFF, 0xBF, 0x83, 0x40, 0x04, 0xF8, 0x01, 0xFF, 0xE7, 0xFF, 0xE8, 0x00,
  0x00, 0xCF, 0xBF, 0xFF, 0xFB, 0x81, 0x7F, 0xFC, 0xFE, 0x01, 0xFF, 0xF3, 0xFF, 0xC8, 0x00,
  0x00, 0xC7, 0x7F, 0xFF, 0xFB, 0x81, 0x3F, 0xFC, 0xFE, 0x01, 0xFF, 0xFD, 0xFF, 0xC8, 0x00,
  0x00, 0xC7, 0xFF, 0xFD, 0xFB, 0xC1, 0x3F, 0xFC, 0xFF, 0x03, 0xFF, 0xFE, 0x7F, 0xD8, 0x00,
  0x00, 0x67, 0xFF, 0xFB, 0xFB, 0xC3, 0x3F, 0xFC, 0xFF, 0x07, 0xFF, 0xFF, 0x9F, 0x90, 0x00,
  0x00, 0x60, 0xFF, 0xCF, 0xFB, 0xE3, 0x3F, 0xFC, 0xFF, 0x0F, 0xE7, 0xFF, 0xE7, 0x90, 0x00,
  0x00, 0x7F, 0x00, 0x33, 0xFB, 0xE0, 0xBF, 0xFC, 0xF7, 0x1F, 0xDB, 0xFF, 0xFB, 0x10, 0x00,
  0x00, 0x7F, 0xFF, 0xF1, 0xFB, 0xE0, 0xEF, 0xEF, 0x8E, 0x3F, 0xBC, 0xFF, 0xFF, 0x30, 0x00,
  0x00, 0x7F, 0xFF, 0xF0, 0xFB, 0xF0, 0xA0, 0x04, 0xBE, 0x7F, 0xBF, 0x00, 0x00, 0x20, 0x00,
  0x00, 0x32, 0x03, 0x20, 0xF9, 0xF0, 0xBF, 0xFC, 0xFC, 0x7F, 0xBE, 0xFF, 0xFF, 0xE0, 0x00,
  0x00, 0x32, 0x03, 0x20, 0xF9, 0xF8, 0xBF, 0xFC, 0xFC, 0x3F, 0xBC, 0xFF, 0xFF, 0xE0, 0x00,
  0x00, 0x32, 0x03, 0x20, 0xF9, 0xC8, 0xA3, 0xE4, 0xF8, 0x3F, 0xBC, 0x4C, 0x04, 0x60, 0x00,
  0x00, 0x32, 0x03, 0x20, 0x78, 0x9D, 0xA3, 0xE4, 0xF8, 0x1E, 0x3C, 0x4C, 0x04, 0x60, 0x00,
  0x00, 0x32, 0x03, 0x20, 0x78, 0xFF, 0xA3, 0xE6, 0xF8, 0x1E, 0x3C, 0x4C, 0x04, 0x60, 0x00,
  0x00, 0x3F, 0xFF, 0xE0, 0x78, 0x7F, 0x23, 0xE6, 0xF0, 0x7E, 0x3E, 0x4C, 0x04, 0x60, 0x00,
  0x00, 0x32, 0x03, 0xE0, 0x78, 0x7F, 0x31, 0xE6, 0xF0, 0xFC, 0x3E, 0x6F, 0xFF, 0xE0, 0x00,
  0x00, 0x32, 0x03, 0x20, 0x78, 0x7F, 0x39, 0xEE, 0xF1, 0xFC, 0x3E, 0x7C, 0x04, 0x20, 0x00,
  0x00, 0x32, 0x03, 0x20, 0x78, 0x73, 0x79, 0xFE, 0xE7, 0xFC, 0x3C, 0x4C, 0x04, 0x20, 0x00,
  0x00, 0x7F, 0xFF, 0xE0, 0x78, 0x21, 0x60, 0xE6, 0xCF, 0xEC, 0x04, 0x6C, 0x04, 0x20, 0x00,
  0x00, 0x64, 0x03, 0x20, 0x78, 0x01, 0x60, 0xE6, 0xCF, 0xCC, 0x1C, 0x7F, 0xFF, 0xF0, 0x00,
  0x00, 0x64, 0x03, 0x20, 0x78, 0x01, 0x60, 0xE6, 0xCF, 0x8C, 0x1C, 0x4C, 0x02, 0x30, 0x00,
  0x00, 0x64, 0x03, 0x20, 0x7C, 0x01, 0x61, 0xF6, 0xC0, 0x00, 0x3E, 0x4C, 0x02, 0x10, 0x00,
  0x00, 0x64, 0x03, 0x20, 0x7C, 0x02, 0x61, 0xF6, 0xE0, 0x00, 0x7E, 0x4C, 0x02, 0x10, 0x00,
  0x00, 0xC0, 0x03, 0x00, 0x7E, 0x02, 0x63, 0xFE, 0xF0, 0x00, 0xFE, 0x0C, 0x00, 0x18, 0x00,
  0x00, 0xC0, 0x03, 0x00, 0x6F, 0x82, 0x43, 0xFE, 0xF0, 0x03, 0xF6, 0x04, 0x00, 0x18, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x67, 0xC2, 0xC1, 0xF2, 0x60, 0x07, 0xE6, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x07, 0x80, 0x03, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};
const uint8_t NOTHING_ART_M[900] = {
  0x00, 0x00, 0xF8, 0x00, 0x00, 0x00, 0x00, 0x1F, 0xC0, 0x00, 0x00, 0x00, 0x0C, 0x00, 0x00,
  0x00, 0x01, 0xFC, 0x00, 0x00, 0x00, 0x00, 0x3F, 0xA0, 0x00, 0x00, 0x01, 0xFE, 0x00, 0x00,
  0x00, 0x03, 0xFE, 0x00, 0x00, 0x00, 0x00, 0xFF, 0x90, 0x00, 0x00, 0x03, 0xFF, 0x80, 0x00,
  0x00, 0x07, 0xCF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0x90, 0x00, 0x00, 0x07, 0xFF, 0xC0, 0x00,
  0x00, 0x07, 0x87, 0x00, 0x00, 0x00, 0x01, 0xFF, 0xF0, 0x00, 0x00, 0x07, 0xFF, 0xC0, 0x00,
  0x00, 0x07, 0x87, 0x00, 0x00, 0x00, 0x01, 0xFF, 0xF0, 0x00, 0x00, 0x0F, 0xCF, 0xE0, 0x00,
  0x00, 0x07, 0x03, 0xC0, 0x00, 0x00, 0x03, 0xE0, 0xF8, 0x00, 0x00, 0x0F, 0x8F, 0xE0, 0x00,
  0x00, 0x05, 0xFE, 0x80, 0x00, 0x00, 0x03, 0x06, 0x30, 0x00, 0x00, 0x0F, 0x07, 0xC0, 0x00,
  0x00, 0x04, 0x7F, 0x20, 0x00, 0x00, 0x03, 0x06, 0x60, 0x00, 0x00, 0x06, 0x3B, 0xE0, 0x00,
  0x00, 0x00, 0x66, 0xD0, 0x00, 0x00, 0x01, 0x80, 0xE0, 0x00, 0x00, 0x05, 0xB9, 0x60, 0x00,
  0x00, 0x02, 0x05, 0x48, 0x00, 0x00, 0x07, 0xC0, 0x40, 0x00, 0x00, 0x07, 0x98, 0x40, 0x00,
  0x00, 0x02, 0x0D, 0x88, 0x00, 0x00, 0x04, 0x61, 0xC0, 0x00, 0x00, 0x03, 0x81, 0xC0, 0x00,
  0x00, 0x05, 0x10, 0x48, 0x00, 0x00, 0x1F, 0xD3, 0x80, 0x00, 0x00, 0x01, 0x21, 0x00, 0x00,
  0x00, 0x04, 0x88, 0x2E, 0x00, 0x00, 0x1F, 0xD9, 0x01, 0x80, 0x00, 0x00, 0x03, 0x00, 0x00,
  0x00, 0x3A, 0x70, 0x36, 0x00, 0x00, 0x3F, 0xFE, 0x01, 0x80, 0x00, 0x00, 0x05, 0x80, 0x00,
  0x00, 0x7F, 0x30, 0x17, 0x00, 0x00, 0x7F, 0xFE, 0x01, 0x80, 0x00, 0x00, 0x41, 0x80, 0x00,
  0x00, 0xFF, 0x9F, 0x1F, 0x80, 0x00, 0xFF, 0xFF, 0x01, 0x80, 0x00, 0x00, 0x3A, 0x78, 0x00,
  0x01, 0xFF, 0xDF, 0x8F, 0x80, 0x00, 0xFF, 0xFF, 0x83, 0xC0, 0x00, 0x00, 0xE7, 0xFF, 0x00,
  0x07, 0xFF, 0xDF, 0xCF, 0x80, 0x01, 0xFF, 0xFF, 0x83, 0xC0, 0x00, 0x01, 0xCF, 0xFF, 0x80,
  0x1F, 0xFF, 0xE7, 0xF7, 0x80, 0x01, 0xFF, 0xFF, 0x83, 0xC0, 0x00, 0x03, 0xDF, 0xFF, 0x80,
  0x78, 0xFF, 0xF7, 0xFF, 0xC0, 0x03, 0xFF, 0xFF, 0xC0, 0xC0, 0x00, 0x07, 0xDF, 0xFF, 0xF0,
  0xFF, 0x8F, 0xF7, 0xFF, 0xC0, 0x03, 0xFF, 0xFF, 0xC0, 0xC0, 0x00, 0x0F, 0xBF, 0xFF, 0xF0,
  0xFF, 0x87, 0xFB, 0xFF, 0xC0, 0x03, 0xFF, 0xF7, 0xE0, 0xC0, 0x00, 0x0F, 0xBF, 0xFF, 0xF8,
  0xFF, 0xC7, 0xFB, 0xFF, 0xC0, 0x03, 0xFF, 0xF7, 0xF0, 0xC0, 0x00, 0x7F, 0x3F, 0xC0, 0x7C,
  0xFF, 0xE3, 0xFB, 0xBF, 0xC0, 0x07, 0xFF, 0xFF, 0xF0, 0xC0, 0x01, 0xFF, 0x7F, 0x8F, 0xFC,
  0x7C, 0x71, 0xFD, 0x87, 0x80, 0x74, 0xFF, 0xFC, 0xFF, 0xC7, 0xFF, 0xFF, 0x7F, 0x1F, 0xFC,
  0x03, 0x35, 0xFD, 0x80, 0x00, 0x46, 0xFF, 0xFC, 0xFF, 0xE7, 0xFF, 0xF9, 0x7E, 0x37, 0xFC,
  0x01, 0x2D, 0xFD, 0x81, 0xFC, 0x46, 0x80, 0x04, 0xFF, 0xF8, 0x7F, 0xF9, 0xFE, 0x36, 0x78,
  0x01, 0x3F, 0xFD, 0x83, 0xFC, 0x3E, 0x80, 0x04, 0xFF, 0xF0, 0x3F, 0x82, 0xFE, 0xD4, 0x00,
  0x01, 0xBF, 0xFE, 0x8F, 0xFE, 0x42, 0x7F, 0xFC, 0x78, 0x08, 0x00, 0x02, 0xFE, 0x94, 0x00,
  0x01, 0x9F, 0xFF, 0x7F, 0xFE, 0x7F, 0x7F, 0xFC, 0xBF, 0xF8, 0x00, 0x05, 0xFF, 0xE4, 0x00,
  0x01, 0x9F, 0xFD, 0xFF, 0xFF, 0x1F, 0x7F, 0xFC, 0xFF, 0xE0, 0xF8, 0x0B, 0xFF, 0xEC, 0x00,
  0x00, 0xDF, 0xF3, 0xFF, 0xCF, 0x03, 0x40, 0x04, 0xE0, 0x00, 0xFF, 0x9B, 0xFF, 0xE8, 0x00,
  0x00, 0xCF, 0xDF, 0xFF, 0xBF, 0x83, 0x40, 0x04, 0xF8, 0x01, 0xFF, 0xE7, 0xFF, 0xE8, 0x00,
  0x00, 0xCF, 0xBF, 0xFF, 0xFB, 0x81, 0x7F, 0xFC, 0xFE, 0x01, 0xFF, 0xF3, 0xFF, 0xC8, 0x00,
  0x00, 0xC7, 0x7F, 0xFF, 0xFB, 0x81, 0x3F, 0xFC, 0xFE, 0x01, 0xFF, 0xFD, 0xFF, 0xC8, 0x00,
  0x00, 0xC7, 0xFF, 0xFD, 0xFB, 0xC1, 0x3F, 0xFC, 0xFF, 0x03, 0xFF, 0xFE, 0x7F, 0xD8, 0x00,
  0x00, 0x67, 0xFF, 0xFB, 0xFB, 0xC3, 0x3F, 0xFC, 0xFF, 0x07, 0xFF, 0xFF, 0x9F, 0x90, 0x00,
  0x00, 0x60, 0xFF, 0xCF, 0xFB, 0xE3, 0x3F, 0xFC, 0xFF, 0x0F, 0xE7, 0xFF, 0xE7, 0x90, 0x00,
  0x00, 0x7F, 0x00, 0x33, 0xFB, 0xE0, 0xBF, 0xFC, 0xF7, 0x1F, 0xDB, 0xFF, 0xFB, 0x10, 0x00,
  0x00, 0x7F, 0xFF, 0xF1, 0xFB, 0xE0, 0xEF, 0xEF, 0x8E, 0x3F, 0xBC, 0xFF, 0xFF, 0x30, 0x00,
  0x00, 0x7F, 0xFF, 0xF0, 0xFB, 0xF0, 0xA0, 0x04, 0xBE, 0x7F, 0xBF, 0x00, 0x00, 0x20, 0x00,
  0x00, 0x32, 0x03, 0x20, 0xF9, 0xF0, 0xBF, 0xFC, 0xFC, 0x7F, 0xBE, 0xFF, 0xFF, 0xE0, 0x00,
  0x00, 0x32, 0x03, 0x20, 0xF9, 0xF8, 0xBF, 0xFC, 0xFC, 0x3F, 0xBC, 0xFF, 0xFF, 0xE0, 0x00,
  0x00, 0x32, 0x03, 0x20, 0xF9, 0xC8, 0xA3, 0xE4, 0xF8, 0x3F, 0xBC, 0x4C, 0x04, 0x60, 0x00,
  0x00, 0x32, 0x03, 0x20, 0x78, 0x9D, 0xA3, 0xE4, 0xF8, 0x1E, 0x3C, 0x4C, 0x04, 0x60, 0x00,
  0x00, 0x32, 0x03, 0x20, 0x78, 0xFF, 0xA3, 0xE6, 0xF8, 0x1E, 0x3C, 0x4C, 0x04, 0x60, 0x00,
  0x00, 0x3F, 0xFF, 0xE0, 0x78, 0x7F, 0x23, 0xE6, 0xF0, 0x7E, 0x3E, 0x4C, 0x04, 0x60, 0x00,
  0x00, 0x32, 0x03, 0xE0, 0x78, 0x7F, 0x31, 0xE6, 0xF0, 0xFC, 0x3E, 0x6F, 0xFF, 0xE0, 0x00,
  0x00, 0x32, 0x03, 0x20, 0x78, 0x7F, 0x39, 0xEE, 0xF1, 0xFC, 0x3E, 0x7C, 0x04, 0x20, 0x00,
  0x00, 0x32, 0x03, 0x20, 0x78, 0x73, 0x79, 0xFE, 0xE7, 0xFC, 0x3C, 0x4C, 0x04, 0x20, 0x00,
  0x00, 0x7F, 0xFF, 0xE0, 0x78, 0x21, 0x60, 0xE6, 0xCF, 0xEC, 0x04, 0x6C, 0x04, 0x20, 0x00,
  0x00, 0x64, 0x03, 0x20, 0x78, 0x01, 0x60, 0xE6, 0xCF, 0xCC, 0x1C, 0x7F, 0xFF, 0xF0, 0x00,
  0x00, 0x64, 0x03, 0x20, 0x78, 0x01, 0x60, 0xE6, 0xCF, 0x8C, 0x1C, 0x4C, 0x02, 0x30, 0x00,
  0x00, 0x64, 0x03, 0x20, 0x7C, 0x01, 0x61, 0xF6, 0xC0, 0x00, 0x3E, 0x4C, 0x02, 0x10, 0x00,
  0x00, 0x64, 0x03, 0x20, 0x7C, 0x02, 0x61, 0xF6, 0xE0, 0x00, 0x7E, 0x4C, 0x02, 0x10, 0x00,
  0x00, 0xC0, 0x03, 0x00, 0x7E, 0x02, 0x63, 0xFE, 0xF0, 0x00, 0xFE, 0x0C, 0x00, 0x18, 0x00,
  0x00, 0xC0, 0x03, 0x00, 0x6F, 0x82, 0x43, 0xFE, 0xF0, 0x03, 0xF6, 0x04, 0x00, 0x18, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x67, 0xC2, 0xC1, 0xF2, 0x60, 0x07, 0xE6, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x07, 0x80, 0x03, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};
const uint8_t NOTHING_ART_S[588] = {
  0x00, 0x07, 0x80, 0x00, 0x00, 0x00, 0xFC, 0x00, 0x00, 0x00, 0x60, 0x00,
  0x00, 0x0F, 0xC0, 0x00, 0x00, 0x01, 0xF8, 0x00, 0x00, 0x07, 0xF0, 0x00,
  0x00, 0x1F, 0xE0, 0x00, 0x00, 0x07, 0xFA, 0x00, 0x00, 0x0F, 0xF8, 0x00,
  0x00, 0x3C, 0x60, 0x00, 0x00, 0x0F, 0xF2, 0x00, 0x00, 0x1F, 0xFC, 0x00,
  0x00, 0x38, 0x20, 0x00, 0x00, 0x0F, 0x3F, 0x00, 0x00, 0x3F, 0x7E, 0x00,
  0x00, 0x2A, 0x78, 0x00, 0x00, 0x0D, 0x27, 0x00, 0x00, 0x3C, 0x3C, 0x00,
  0x00, 0x23, 0xE4, 0x00, 0x00, 0x08, 0x34, 0x00, 0x00, 0x18, 0xDE, 0x00,
  0x00, 0x23, 0x7A, 0x00, 0x00, 0x0C, 0x2C, 0x00, 0x00, 0x15, 0xD6, 0x00,
  0x00, 0x10, 0x49, 0x00, 0x00, 0x1E, 0x00, 0x00, 0x00, 0x1E, 0xC4, 0x00,
  0x00, 0x10, 0x51, 0x00, 0x00, 0x31, 0x28, 0x00, 0x00, 0x0E, 0x0C, 0x00,
  0x00, 0x2C, 0x89, 0x00, 0x00, 0x7E, 0x90, 0x00, 0x00, 0x05, 0x90, 0x00,
  0x00, 0xD7, 0x86, 0x80, 0x00, 0xFF, 0xE0, 0x00, 0x00, 0x00, 0x38, 0x00,
  0x01, 0xF9, 0x02, 0xC0, 0x01, 0xFF, 0xE0, 0x30, 0x00, 0x00, 0x08, 0x00,
  0x03, 0xFD, 0xE3, 0xC0, 0x01, 0xFF, 0xF0, 0x30, 0x00, 0x00, 0x9F, 0xC0,
  0x0F, 0xFE, 0xF9, 0xC0, 0x03, 0xFF, 0xF8, 0x70, 0x00, 0x07, 0x3F, 0xE0,
  0x1F, 0xFF, 0x7D, 0xE0, 0x03, 0xFF, 0xF8, 0x70, 0x00, 0x06, 0x7F, 0xF0,
  0x71, 0xFF, 0x7F, 0xE0, 0x03, 0xFF, 0xFC, 0x30, 0x00, 0x0E, 0xFF, 0xFC,
  0xFE, 0x7F, 0x7F, 0xF0, 0x07, 0xFF, 0x7C, 0x30, 0x00, 0x1F, 0xFF, 0xFE,
  0xFE, 0x3F, 0xFF, 0xF0, 0x07, 0xFF, 0xBC, 0x30, 0x00, 0x7F, 0xFF, 0xFE,
  0xFF, 0x9F, 0xF7, 0xF0, 0x07, 0xFF, 0xBE, 0x30, 0x01, 0xFD, 0xF8, 0xFF,
  0x79, 0x8F, 0xF1, 0xE0, 0x71, 0xFF, 0xDF, 0xB1, 0xFF, 0xFD, 0xF1, 0xFF,
  0x04, 0xAF, 0xF0, 0x00, 0x55, 0xFF, 0xCF, 0xFB, 0xFF, 0xF5, 0xE3, 0x7F,
  0x00, 0xEF, 0xF0, 0x7E, 0x55, 0x00, 0x0F, 0xFC, 0x7F, 0xE7, 0xE3, 0x5E,
  0x00, 0xFF, 0xD1, 0xFF, 0x44, 0xFF, 0xCF, 0x04, 0x3F, 0x0B, 0xE9, 0x40,
  0x02, 0xFF, 0xEF, 0xFF, 0x7C, 0xFF, 0xC7, 0xFC, 0x00, 0x0F, 0xEA, 0x40,
  0x02, 0xFF, 0xDF, 0xFF, 0x3E, 0xFF, 0xCF, 0xF8, 0x78, 0x1F, 0xFE, 0xC0,
  0x03, 0x7F, 0x7F, 0xF7, 0x06, 0x80, 0x0E, 0x00, 0x7F, 0x2F, 0xFE, 0x80,
  0x03, 0x7F, 0xFF, 0xEF, 0x82, 0xFF, 0xCF, 0x80, 0xFF, 0xEF, 0xFE, 0x80,
  0x03, 0x3B, 0xFF, 0xFF, 0x82, 0xFF, 0xDF, 0xC0, 0xFF, 0xF7, 0xFC, 0x80,
  0x01, 0x3F, 0xFF, 0xFF, 0xC2, 0xFF, 0xDF, 0xC1, 0xFF, 0xF9, 0xFD, 0x80,
  0x01, 0xBF, 0xFF, 0xFF, 0xC6, 0xFF, 0xDF, 0xC1, 0xFF, 0xFE, 0xF9, 0x00,
  0x01, 0x87, 0xF9, 0xFF, 0xE2, 0xFF, 0xDF, 0x47, 0xE7, 0xFF, 0x39, 0x00,
  0x01, 0xFF, 0xFE, 0x7D, 0xE1, 0xFF, 0xFC, 0xCF, 0xFF, 0xFF, 0xF3, 0x00,
  0x01, 0xFF, 0xFE, 0x7D, 0xF1, 0x80, 0x33, 0xDF, 0xBE, 0x00, 0x02, 0x00,
  0x00, 0xD0, 0x24, 0x7D, 0xF1, 0xFF, 0xEF, 0x9F, 0xBE, 0xFF, 0xFE, 0x00,
  0x00, 0xD0, 0x24, 0x7C, 0xF1, 0xFF, 0xEF, 0x8F, 0xBC, 0xFF, 0xFE, 0x00,
  0x00, 0x90, 0x24, 0x3C, 0xCA, 0x8F, 0x2F, 0x07, 0xBC, 0x90, 0x16, 0x00,
  0x00, 0x90, 0x24, 0x3C, 0x7E, 0x8F, 0x2F, 0x07, 0x3C, 0x90, 0x16, 0x00,
  0x00, 0xFF, 0xFC, 0x3C, 0x7E, 0x8F, 0x2E, 0x1F, 0x3C, 0x90, 0x16, 0x00,
  0x00, 0x90, 0x34, 0x3C, 0x7E, 0xEF, 0x2E, 0x1E, 0x3C, 0xDF, 0xFE, 0x00,
  0x00, 0x90, 0x24, 0x3C, 0x7E, 0xEF, 0xEE, 0x7E, 0x3C, 0xF0, 0x12, 0x00,
  0x01, 0xFF, 0xFC, 0x3C, 0x62, 0x87, 0x6C, 0xFA, 0x18, 0x90, 0x12, 0x00,
  0x01, 0x90, 0x24, 0x1C, 0x02, 0x87, 0x29, 0xF6, 0x1C, 0xFF, 0xFF, 0x00,
  0x01, 0xA0, 0x24, 0x1C, 0x02, 0x87, 0x28, 0xE6, 0x1C, 0x90, 0x13, 0x00,
  0x01, 0xA0, 0x24, 0x3E, 0x00, 0x87, 0xAC, 0x00, 0x3C, 0x90, 0x11, 0x00,
  0x01, 0x00, 0x24, 0x3F, 0x04, 0x8F, 0xAC, 0x00, 0x7C, 0x90, 0x09, 0x00,
  0x03, 0x00, 0x20, 0x3F, 0x84, 0x8F, 0xAE, 0x01, 0xF4, 0x10, 0x09, 0x80,
  0x00, 0x00, 0x00, 0x33, 0xC5, 0x0F, 0x2C, 0x03, 0xE4, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x07, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00
};
// Pictures of the "Check connection" screen (NO DATA): the same table and chairs without the people
// and the bottle of the "Nothing to ink" picture (red = the bottle, third colour; user):
// 172 x 93 in the pixels of the 4.2" (drawn 1x), the same tables as in inksights-render.js
const int16_t NODATA_ART_W = 172, NODATA_ART_H = 93;
const uint8_t NODATA_ART[2046] = {
  0xFF, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xFF, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xFF, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xFF, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xF0, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xF0,
  0xF0, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xF0,
  0x3C, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xF0,
  0x3C, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xF0,
  0x3C, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x30, 0xF0,
  0x3C, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x30, 0xF0,
  0x3C, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x33, 0xC0,
  0x3C, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x33, 0xC0,
  0x3C, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x33, 0xC0,
  0x3C, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07, 0xE0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x33, 0xC0,
  0x0F, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC3, 0xC0,
  0x0F, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC3, 0xC0,
  0x0F, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC3, 0xC0,
  0x0F, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC3, 0xC0,
  0x0F, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xCF, 0x00,
  0x0F, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xCF, 0x00,
  0x0F, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xCF, 0x00,
  0x0F, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xF0, 0x00, 0x00, 0x0F, 0xF0, 0x00, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xCF, 0x00,
  0x03, 0xFC, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xCF, 0xF0, 0x00, 0x00, 0x0F, 0xF0, 0x00, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xCF, 0x00,
  0x03, 0xFC, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xCC, 0x30, 0x00, 0x00, 0x0C, 0x30, 0x00, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xCF, 0x00,
  0x03, 0xCC, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C, 0x30, 0x00, 0x00, 0x0C, 0x30, 0x00, 0xF7, 0xF0, 0x00, 0x00, 0x00, 0x03, 0x0F, 0x00,
  0x03, 0xCC, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0F, 0x3F, 0xFF, 0xFF, 0xFC, 0x30, 0x00, 0xF7, 0xF0, 0x00, 0x00, 0x00, 0x03, 0x0F, 0x00,
  0x03, 0xCC, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0F, 0x3F, 0xFF, 0xFF, 0xFC, 0x30, 0x00, 0xF6, 0x30, 0x00, 0x00, 0x00, 0x03, 0xFC, 0x00,
  0x03, 0xCC, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0F, 0x30, 0x00, 0x00, 0x0C, 0x30, 0x00, 0xF6, 0x30, 0x00, 0x00, 0x00, 0x03, 0xFC, 0x00,
  0x03, 0xC3, 0x00, 0x00, 0x00, 0x00, 0x03, 0xFF, 0x30, 0x00, 0x00, 0x0C, 0x30, 0x00, 0xF3, 0xE0, 0x00, 0x00, 0x00, 0x03, 0x3C, 0x00,
  0x03, 0xC3, 0x00, 0x00, 0x00, 0x00, 0x03, 0xFF, 0x30, 0x00, 0x00, 0x0C, 0x3C, 0x0F, 0xF1, 0xC0, 0x00, 0x00, 0x00, 0x03, 0x3C, 0x00,
  0x00, 0xF3, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x03, 0x30, 0x00, 0x00, 0x0C, 0x3C, 0x0F, 0xF0, 0x80, 0x00, 0x00, 0x00, 0x03, 0x3C, 0x00,
  0x00, 0xF3, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x03, 0x0F, 0xFF, 0xFF, 0xFC, 0x0C, 0x0F, 0xF0, 0x80, 0x00, 0x00, 0x00, 0x03, 0x3C, 0x00,
  0x00, 0xF3, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xFF, 0x0F, 0xFF, 0xFF, 0xFC, 0x0C, 0x0F, 0xF3, 0xE0, 0x00, 0x00, 0x00, 0x0C, 0x3C, 0x00,
  0x00, 0xF3, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xFF, 0xCC, 0x00, 0x00, 0x0C, 0x3F, 0xFF, 0xFF, 0xF0, 0x00, 0x00, 0x00, 0x0C, 0x3C, 0x00,
  0x00, 0xF3, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xFF, 0xCF, 0xFF, 0xFF, 0xFC, 0x3F, 0xFF, 0xFF, 0xF0, 0x00, 0x00, 0x00, 0x0C, 0xF0, 0x00,
  0x00, 0xF3, 0x00, 0x00, 0x00, 0x00, 0x0F, 0xFF, 0xCF, 0xFF, 0xFF, 0xFC, 0x3F, 0xFF, 0xFF, 0xF0, 0x00, 0x00, 0x00, 0x0C, 0xF0, 0x00,
  0x00, 0xF3, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xCF, 0xFF, 0xFF, 0xFC, 0x3F, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x0C, 0xF0, 0x00,
  0x00, 0xF3, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xCC, 0x00, 0x00, 0x0C, 0x3F, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x0C, 0xF0, 0x00,
  0x00, 0x3C, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xCC, 0x00, 0x00, 0x0C, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0xF0, 0x00,
  0x00, 0x3C, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xCC, 0x00, 0x00, 0x0C, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0xF0, 0x00,
  0x00, 0x3C, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xCC, 0x00, 0x00, 0x0C, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0xF0, 0x00,
  0x00, 0x3C, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xCF, 0xFF, 0xFF, 0xFC, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0xF0, 0x00,
  0x00, 0x3C, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xCF, 0xFF, 0xFF, 0xFC, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x33, 0xC0, 0x00,
  0x00, 0x3C, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC3, 0x00, 0x0F, 0x0C, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x33, 0xC0, 0x00,
  0x00, 0x3F, 0xFF, 0xFF, 0xFF, 0xFF, 0xC0, 0x00, 0xC3, 0x00, 0x0F, 0x0C, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x33, 0xC0, 0x00,
  0x00, 0x3F, 0xFF, 0xFF, 0xFF, 0xFF, 0xC0, 0x00, 0xC3, 0x00, 0x0F, 0x0C, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x33, 0xC0, 0x00,
  0x00, 0x3F, 0xFF, 0xFF, 0xFF, 0xFF, 0xC0, 0x00, 0xC3, 0x00, 0x0F, 0x0C, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x33, 0xC0, 0x00,
  0x00, 0x3F, 0xFF, 0xFF, 0xFF, 0xFF, 0xC0, 0x00, 0xC3, 0x00, 0x0F, 0x0C, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x33, 0xC0, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0xC3, 0x00, 0x0F, 0x0C, 0x30, 0x00, 0x00, 0x3F, 0xFF, 0xFF, 0xFF, 0xFF, 0xC0, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0xC3, 0x0F, 0xFF, 0xFC, 0x3F, 0xF0, 0x00, 0x3F, 0xFF, 0xFF, 0xFF, 0xFF, 0xC0, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0xC3, 0x0F, 0xFF, 0xFC, 0x7F, 0xF0, 0x00, 0x3F, 0xFF, 0xFF, 0xFF, 0xFF, 0xC0, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0xF3, 0xFC, 0x00, 0x0C, 0x60, 0x70, 0x00, 0x3F, 0xFF, 0xFF, 0xFF, 0xFF, 0xC0, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0xF3, 0xFC, 0x00, 0x0C, 0x60, 0xF0, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x7C, 0x00, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0x33, 0x80, 0x00, 0x0C, 0x61, 0xF0, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x7C, 0x00, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0x33, 0x80, 0x00, 0x0C, 0x67, 0xB0, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x7C, 0x00, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0x3F, 0x00, 0x00, 0x0F, 0xEF, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x7C, 0x00, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0x3F, 0x00, 0x00, 0x0F, 0xFF, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x7C, 0x00, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0x33, 0xFF, 0xFF, 0xFC, 0x73, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x7C, 0x00, 0x00,
  0x00, 0x03, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x33, 0xFF, 0xFF, 0xFC, 0x73, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x7C, 0x00, 0x00,
  0x00, 0x03, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x33, 0x0F, 0xCF, 0x0C, 0x73, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x7C, 0x00, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0x33, 0x0C, 0xCF, 0x0C, 0x73, 0x30, 0x00, 0x0F, 0xFF, 0xFF, 0xFF, 0xFC, 0x00, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0x33, 0x0C, 0xCF, 0x0C, 0x73, 0x30, 0x00, 0x0F, 0xFF, 0xFF, 0xFF, 0xFC, 0x00, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0x33, 0x0C, 0xCF, 0x0C, 0x73, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x7C, 0x00, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0x33, 0x0C, 0xCF, 0x0C, 0x33, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x7C, 0x00, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0x33, 0x0C, 0xCF, 0x0C, 0x33, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x7C, 0x00, 0x00,
  0x00, 0x03, 0xE0, 0x00, 0x03, 0xC3, 0x00, 0x00, 0xF3, 0x0C, 0xCF, 0x0F, 0x33, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x7C, 0x00, 0x00,
  0x00, 0x0F, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0xF3, 0x0C, 0xCF, 0x0F, 0x33, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x6F, 0x00, 0x00,
  0x00, 0x0F, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0xC3, 0x0C, 0xCF, 0x03, 0x33, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x6F, 0x00, 0x00,
  0x00, 0x0F, 0x60, 0x00, 0x03, 0xC3, 0x00, 0x00, 0xC3, 0x0C, 0xCF, 0x03, 0x33, 0x30, 0x00, 0x0F, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00,
  0x00, 0x0F, 0x60, 0x00, 0x03, 0xC3, 0x00, 0x00, 0xC3, 0x0C, 0xCF, 0x03, 0x33, 0x30, 0x00, 0x0F, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00,
  0x00, 0x0F, 0x60, 0x00, 0x03, 0xC3, 0x00, 0x00, 0xC3, 0x0C, 0xFF, 0xF3, 0x33, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x6F, 0x00, 0x00,
  0x00, 0x0F, 0x60, 0x00, 0x03, 0xC3, 0x00, 0x00, 0xC3, 0x0C, 0xFF, 0xF3, 0x33, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x6F, 0x00, 0x00,
  0x00, 0x0F, 0x60, 0x00, 0x03, 0xC3, 0x00, 0x00, 0xC3, 0x0C, 0xFF, 0xFF, 0x33, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x6F, 0x00, 0x00,
  0x00, 0x0F, 0x60, 0x00, 0x03, 0xC3, 0x00, 0x00, 0xCF, 0x0C, 0xFF, 0xFF, 0x33, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x6F, 0x00, 0x00,
  0x00, 0x0F, 0x00, 0x00, 0x03, 0xC3, 0x00, 0x00, 0xCF, 0x0C, 0xC0, 0x03, 0x33, 0x30, 0x00, 0x0C, 0x3C, 0x00, 0x00, 0x0F, 0x00, 0x00,
  0x00, 0x0F, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0xCC, 0x0C, 0xC0, 0x03, 0x33, 0x30, 0x00, 0x00, 0x3C, 0x00, 0x00, 0x0F, 0x00, 0x00,
  0x00, 0x3C, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0xCC, 0x0C, 0xC0, 0x03, 0x33, 0x30, 0x00, 0x00, 0x3C, 0x00, 0x00, 0x03, 0xC0, 0x00,
  0x00, 0x3C, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0xCC, 0x0C, 0xC0, 0x03, 0x33, 0x30, 0x00, 0x00, 0x3C, 0x00, 0x00, 0x03, 0xC0, 0x00,
  0x00, 0x3C, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0xCC, 0x0C, 0xC0, 0x03, 0x33, 0x30, 0x00, 0x00, 0x3C, 0x00, 0x00, 0x03, 0xC0, 0x00,
  0x00, 0x3C, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0xCC, 0x0C, 0xC0, 0x03, 0x33, 0x30, 0x00, 0x00, 0x3C, 0x00, 0x00, 0x03, 0xC0, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xCC, 0x0C, 0xC0, 0x03, 0x33, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0xCC, 0x0C, 0xC0, 0x03, 0x33, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0xCC, 0x0C, 0xC0, 0x03, 0x33, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x8C, 0x0C, 0xC0, 0x03, 0x33, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x8C, 0x0C, 0xC0, 0x03, 0x33, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x8C, 0x0F, 0xC0, 0x03, 0x33, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x8C, 0x0F, 0xC0, 0x03, 0x33, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x8C, 0x00, 0x00, 0x03, 0x38, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x0C, 0x00, 0x00, 0x03, 0x38, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x3C, 0x00, 0x00, 0x03, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x3C, 0x00, 0x00, 0x03, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xF0, 0x00, 0x00, 0x03, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xF0, 0x00, 0x00, 0x03, 0xF8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};
// the same at half size for the 2.13" (landscape and upright)
const int16_t NODATA_ART_M_W = 86, NODATA_ART_M_H = 47;
const uint8_t NODATA_ART_M[517] = {
  0xFC, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xFC, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xC8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x80, 0x00, 0x00, 0xFC,
  0x68, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x80, 0x00, 0x00, 0xFC,
  0x68, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x80, 0x00, 0x00, 0x4C,
  0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x80, 0x00, 0x00, 0x58,
  0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0x58,
  0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0x98,
  0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0x98,
  0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC0, 0x00, 0x00, 0xB0,
  0x32, 0x00, 0x00, 0x03, 0xC0, 0x00, 0x00, 0xC0, 0x00, 0x00, 0xB0,
  0x1E, 0x00, 0x00, 0x3A, 0x40, 0x03, 0xC0, 0xC0, 0x00, 0x00, 0xB0,
  0x1A, 0x00, 0x00, 0x23, 0x7F, 0xFE, 0x40, 0xDC, 0x00, 0x01, 0x30,
  0x1A, 0x00, 0x00, 0x23, 0x40, 0x02, 0x40, 0xD4, 0x00, 0x01, 0xE0,
  0x19, 0x00, 0x00, 0x1F, 0x7F, 0xFE, 0x43, 0xC8, 0x00, 0x01, 0x60,
  0x0D, 0x00, 0x00, 0x21, 0x60, 0x02, 0x23, 0xDC, 0x00, 0x01, 0x60,
  0x0D, 0x00, 0x00, 0x3F, 0xBF, 0xFE, 0x7F, 0xFC, 0x00, 0x02, 0x60,
  0x0D, 0x00, 0x00, 0x3F, 0xA0, 0x02, 0x7F, 0xFC, 0x00, 0x02, 0xC0,
  0x0D, 0x00, 0x00, 0x0F, 0xA0, 0x02, 0x7F, 0xF0, 0x00, 0x02, 0xC0,
  0x06, 0x80, 0x00, 0x00, 0xBF, 0xFE, 0x40, 0x00, 0x00, 0x02, 0xC0,
  0x06, 0x80, 0x00, 0x00, 0x90, 0x32, 0x40, 0x00, 0x00, 0x02, 0xC0,
  0x06, 0x80, 0x00, 0x00, 0x90, 0x32, 0x40, 0x00, 0x00, 0x05, 0x80,
  0x07, 0xFF, 0xFF, 0x80, 0x90, 0x32, 0x40, 0x00, 0x00, 0x05, 0x80,
  0x07, 0xFF, 0xFF, 0x80, 0x90, 0x32, 0x40, 0x00, 0x00, 0x05, 0x80,
  0x01, 0xC0, 0x19, 0x00, 0x93, 0xFE, 0x7C, 0x07, 0xFF, 0xFF, 0x80,
  0x01, 0xC0, 0x19, 0x00, 0xDF, 0xFE, 0xFC, 0x07, 0xFF, 0xFF, 0x80,
  0x01, 0xC0, 0x19, 0x00, 0xDE, 0x02, 0xDC, 0x02, 0x60, 0x0E, 0x00,
  0x01, 0xC0, 0x19, 0x00, 0x78, 0x03, 0xFC, 0x02, 0x60, 0x0E, 0x00,
  0x01, 0xC0, 0x19, 0x00, 0x7F, 0xFF, 0xF4, 0x02, 0x60, 0x0E, 0x00,
  0x01, 0xFF, 0xFF, 0x00, 0x5F, 0xFE, 0xD4, 0x02, 0x60, 0x0E, 0x00,
  0x01, 0xC0, 0x19, 0x00, 0x52, 0xB2, 0xD4, 0x03, 0xFF, 0xFE, 0x00,
  0x01, 0xC0, 0x19, 0x00, 0x52, 0xB2, 0xD4, 0x02, 0x60, 0x0E, 0x00,
  0x01, 0xC0, 0x19, 0x00, 0xD2, 0xB3, 0x54, 0x02, 0x60, 0x0E, 0x00,
  0x03, 0xFF, 0xFF, 0x00, 0xD2, 0xB3, 0x54, 0x02, 0x60, 0x0F, 0x00,
  0x03, 0xC0, 0x19, 0x00, 0x92, 0xB1, 0x54, 0x03, 0xFF, 0xFF, 0x00,
  0x03, 0xC0, 0x19, 0x00, 0x92, 0xFD, 0x54, 0x02, 0x60, 0x0F, 0x00,
  0x03, 0xC0, 0x19, 0x00, 0xB2, 0xFF, 0x54, 0x02, 0x60, 0x0F, 0x00,
  0x03, 0x00, 0x19, 0x00, 0xB2, 0x81, 0x54, 0x02, 0x60, 0x03, 0x00,
  0x06, 0x00, 0x18, 0x00, 0xA2, 0x81, 0x54, 0x00, 0x60, 0x01, 0x80,
  0x06, 0x00, 0x18, 0x00, 0xA2, 0x81, 0x54, 0x00, 0x60, 0x01, 0x80,
  0x00, 0x00, 0x00, 0x01, 0xA2, 0x81, 0x54, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x01, 0xA2, 0x81, 0x54, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x01, 0xA3, 0x81, 0x5C, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x01, 0xA3, 0x81, 0x7C, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x01, 0x60, 0x01, 0x60, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x01, 0xE0, 0x01, 0x60, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x01, 0xC0, 0x01, 0xE0, 0x00, 0x00, 0x00, 0x00
};
const int16_t NODATA_RED[4] = { 108, 5, 115, 32 }, NODATA_RED_M[4] = { 54, 2, 57, 15 };   // the bottle
// draws picture bm (w x h) at x, y with every picture pixel s x s; cut: ncut pixels (x, y, side) that
// lose their upper outer quarter when drawn 2x or bigger (like drawArt() in inksights-render.js)
void drawArt(const uint8_t* bm, int16_t w, int16_t h, const int16_t* red, int16_t x, int16_t y, int16_t s,
             const int16_t* cut = nullptr, uint8_t ncut = 0) {
  const int16_t bpr = (w + 7) / 8;
  for (int16_t r = 0; r < h; r++)
    for (int16_t c = 0; c < w; c++)
      if (bm[r * bpr + (c >> 3)] & (0x80 >> (c & 7)))
        epd->fillRect(x + c * s, y + r * s, s, s, c >= red[0] && c <= red[2] && r >= red[1] && r <= red[3] ? RD : BK);
  const int16_t q = s >> 1;
  if (q) for (uint8_t i = 0; i < ncut; i++)
    epd->fillRect(x + cut[3 * i] * s + (cut[3 * i + 2] > 0 ? s - q : 0), y + cut[3 * i + 1] * s, q, q, WH);
}

// message, text size, picture and its scale of the "Check connection" (noData) or "Nothing to ink"
// screen: triple size on the 4.2", double on the 2.13", smaller while wider than W - 8; "Nothing to
// ink": the people (4.2" its own bottle), the narrow one where 1x does not fit (2.13" upright), as big
// as fits (whole multiples, at most as wide as the text unless 1x); "Check connection": the empty
// table (4.2" its own picture, 2.13" the half-size one), only 1x. gh = picture + gap, 0 without picture
void msgArt(bool noData, int16_t W, int16_t H, int16_t HH, bool wide, const char*& msg, uint8_t& ms,
            const uint8_t*& art, const int16_t*& red, int16_t& aw, int16_t& ah, int16_t& as, int16_t& gh) {
  msg = noData ? "Check connection" : "Nothing to ink";
  ms = wide ? 3 : 2;
  while (ms > 1 && textW(msg) * ms > W - 8) ms--;
  const bool bigArt = NOTHING_ART_W <= W - 4;
  art = noData ? (wide ? NODATA_ART : NODATA_ART_M) : wide ? NOTHING_ART : bigArt ? NOTHING_ART_M : NOTHING_ART_S;
  red = noData ? (wide ? NODATA_RED : NODATA_RED_M) : wide ? NOTHING_RED : bigArt ? NOTHING_RED_M : NOTHING_RED_S;
  aw = noData ? (wide ? NODATA_ART_W : NODATA_ART_M_W) : bigArt ? NOTHING_ART_W : NOTHING_ART_S_W;
  ah = noData ? (wide ? NODATA_ART_H : NODATA_ART_M_H) : bigArt ? NOTHING_ART_H : NOTHING_ART_S_H;
  as = 0;
  for (int16_t s = 1; aw * s <= W - 4 && ah * s + 10 * ms <= H - HH - 8 && (s == 1 || (!noData && aw * s <= textW(msg) * ms)); s++) as = s;
  gh = as ? ah * as + 3 * ms : 0;
}

void drawScreen() {
  const int16_t W = epd->width(), H = epd->height();
  epd->fillScreen(WH);
  epd->setTextSize(1);
  epd->setTextWrap(false);

  if (!dataReceived) { drawSplash(); return; }

  const bool wide = isBig(W, H);   // 4.2" in any rotation: double text size
  const bool stacked = W < H;      // upright: device | used/total, the pool in a second line
  const uint8_t hs = wide ? 2 : 1;
  const int16_t HH = headerH(W, H), hx = wide ? 4 : 2;
  drawHeader(W, wide);
  // "Check connection" (the time stays: when the last data came), or "Nothing to ink" when every
  // page is switched off (no system page, disk pages off), with its picture above it (user); both
  // screens share one block as high as the taller of the two, centred in the rest: the text at its
  // bottom and the picture standing on the text, so text and picture bottom are at the same height
  // on both screens (user)
  if (noDataShown || (!sys.on && !netCount && diskCount == 0 && head.diskPages == 0)) {
    const char* msg; const uint8_t* art; const int16_t* red; uint8_t ms; int16_t aw, ah, as, gh;
    // always below the room of a header, also when the header is off ("Check connection" brings it
    // back), so both screens match there too (user)
    const int16_t MH = isBig(W, H) ? 20 : HEADER_H;
    msgArt(!noDataShown, W, H, MH, wide, msg, ms, art, red, aw, ah, as, gh);   // the other screen: only its height
    const int16_t oh = gh + 7 * ms;
    msgArt(noDataShown, W, H, MH, wide, msg, ms, art, red, aw, ah, as, gh);
    const int16_t bh = imax(gh + 7 * ms, oh), ty = MH + (H - MH - bh) / 2 + bh - 7 * ms;
    const bool cuts = !noDataShown && wide;   // the bottle's step: only the 4.2" "Nothing to ink" picture has it
    if (as) drawArt(art, aw, ah, red, (W - aw * as) / 2, ty - gh, as, cuts ? NOTHING_CUT : nullptr, cuts ? 2 : 0);
    printAt((W - textW(msg) * ms) / 2, ty, msg, BK, ms);
    return;
  }
  if (sys.on && page == 0) { drawSystem(HH, wide, stacked); return; }
  // network pages after the disk pages
  {
    const uint8_t per = rowsPerPage(), dp = (diskCount + per - 1) / per;
    const int16_t np = (int16_t)page - (sys.on ? 1 : 0) - dp;
    if (netCount && np >= 0) { drawNetPage(np, HH, wide, stacked); return; }
  }
  if (diskCount == 0) { printAt(hx, HH + 6, "No drives", BK, hs); return; }

  const uint8_t rows = rowsPerPage();
  const int16_t rowH = rowHeight();
  Scale sc;
  if (wide) {
    const int16_t bar = rows >= 2 && rows <= 6 ? BAR_WIDE[rows - 2] : iclamp(rowH - 21 - (stacked ? 15 : 0), 10, 18);
    sc = Scale{ F5X2, F5X2, F5X2, bar, bar >= 14 ? F5X2 : F5 };
  } else {   // landscape and upright: upright uses the same sizes as landscape with as many rows
    sc = SCALE_213[iclamp(rows, 2, 5) - 2];
  }
  const int16_t icon = head.icons == 0 ? 0 : wide ? imax(21, (sc.bar + 3) | 1) : (sc.bar + 3) | 1;   // symbol box (odd)
  const int16_t ringW = wide ? (sc.bar >= 26 ? 4 : 3) : sc.bar >= 10 ? 2 : 1;
  Lay lay = rowLayout(W, rowH, sc, wide ? 4 : 2, icon, stacked, false, head.timer, ringW);
  // landscape: a pool name that does not fit beside device and used/total gets its own second line
  // (like upright), if the rows are tall enough for it (e.g. 2.13" with 2 rows)
  if (!stacked && !poolsFit(lay)) {
    Lay two = rowLayout(W, rowH, sc, wide ? 4 : 2, icon, true, false, head.timer, ringW);
    // used/total in the pool line, ending with the bar (before the timer column)
    two.capBelow = true;
    if (two.hasG) two.textEnd = two.boxX - 5;
    if (two.contentH <= rowH) lay = two;
  }
  // upright: when used/total does not fit beside a device name, it gets its own third line, so the
  // pool keeps its whole line (if the rows are tall enough for it, e.g. 2.13" with 2 or 3 rows)
  if (stacked && capTooLong(lay)) {
    const Lay three = rowLayout(W, rowH, sc, wide ? 4 : 2, icon, true, true, head.timer, ringW);
    if (three.contentH <= rowH) lay = three;
  }
  lay.ccw = head.ringDir == 1;          // progress rings counterclockwise
  lay.pctBar = head.pctBar;             // details inside the bar: 0 none, 1 percentage, 2 used capacity
  lay.driveTemp = head.driveTemp == 1;  // temperatures in the rows
  lay.stby = head.stby == 1;            // asleep hard disks "STBY" instead of "--"
  // Symbol style by panel, the same in every rotation: the 4.2" style, or on the 2.13" the style of
  // its symbol size (9 / 11 / 13 / 17 px = 5 / 4 / 3 / 2 rows in landscape; upright: 11 px)
  const bool big = wide;
  lay.deepChip = big && rows == 2;      // 4.2" with 2 rows: deeper chip notches
  lay.boldDots = big;                   // asleep ring: bold dots on the 4.2", single pixels on the 2.13"
  lay.shineTurned = !big && (icon == 11 || icon == 13);   // shine turned by 45°
  lay.greyToRim = !big && icon == 17;                     // checkerboard up to the rim
  lay.greyWider = !big && icon == 11;                     // checkerboard one pixel wider

  const uint8_t first = (page - (sys.on ? 1 : 0)) * rows;   // the system page comes first
  for (uint8_t i = 0; i < rows && first + i < diskCount; i++)
    drawDisk(disks[first + i], HH + 2 + i * rowH + lay.rowDy, lay);
}

// Full refresh (flashes, about 15 s on the colour panels), or with fast refresh a partial refresh of
// the whole screen (no flashing); full again on page turns, "Redraw now" and every FULL_REFRESH_MS
void refresh() {
  epd->setRotation(currentRotation());
  const bool fast = fastMode();
  const bool full = !fast || !refreshed || screenIsSplash || forceRedraw || page != shownPage ||
                    millis() - lastFullMs >= FULL_REFRESH_MS;
  noDataShown = noDataNow();
  if (full) epd->setFullWindow();
  else      epd->setPartialWindow(0, 0, epd->width(), epd->height());
  epd->firstPage();
  do { drawScreen(); } while (epd->nextPage());
  if (fast) epd->powerOff();   // the next partial refresh follows soon
  else      epd->hibernate();  // panel powered off, picture stays
  if (full) lastFullMs = millis();
  shownPage     = page;
  refreshed     = true;
  forceRedraw   = false;
  screenIsSplash = !dataReceived;
  lastRefreshMs = millis();
}

// -------------------------------------------------------------- receiving

void parseDisk(char* line) {
  char* f[12];
  const uint8_t n = splitFields(line, f, 12);
  if (n < 9 || rxCount >= MAX_DISKS) return;
  Disk& d = rxDisks[rxCount++];
  memset(&d, 0, sizeof(d));  // every byte must be defined for the comparison (hash)
  copyStr(d.dev,   f[1], sizeof(d.dev));
  copyStr(d.pool,  f[2], sizeof(d.pool));
  copyStr(d.used,  f[3], sizeof(d.used));
  copyStr(d.total, f[4], sizeof(d.total));
  sanitize(d.dev); sanitize(d.pool); sanitize(d.used); sanitize(d.total);
  d.pct   = constrain(atoi(f[5]), -1, 100);
  if (pctValid(f[5])) copyStr(d.pctTxt, f[5], sizeof(d.pctTxt));
  else snprintf(d.pctTxt, sizeof(d.pctTxt), "%d", d.pct);
  d.state = f[8][0] ? f[8][0] : '?';
  d.remain  = n >= 10 && f[9][0] ? iclamp(atol(f[9]), -1, 359999) : -1;
  d.timeout = n >= 11 ? iclamp(atol(f[10]), 0, 359999) : 0;
  d.hasTemp = n >= 12 && f[11][0];   // drive temperature (only with H field 21), -1 = unknown, -2 = asleep
  d.temp = d.hasTemp ? tempNum(f[11]) : -1;
}

// Percentage "35", "35.4" or "35.47", at most 100
bool pctValid(const char* f) {
  uint8_t digits = 0, dec = 0;
  bool dot = false;
  for (const char* q = f; *q; q++) {
    if (*q == '.' && !dot && digits) dot = true;
    else if (!isdigit((unsigned char)*q)) return false;
    else if (dot) dec++;
    else digits++;
  }
  return digits >= 1 && digits <= 3 && (!dot || (dec >= 1 && dec <= 2)) && atof(f) <= 100.0;
}

// "-?digits" -> value clamped to -1..hi, anything else -1 (like num() in the preview)
int32_t sysNum(const char* f, int32_t hi) {
  const char* p = f[0] == '-' ? f + 1 : f;
  if (!*p) return -1;
  for (const char* q = p; *q; q++) if (!isdigit((unsigned char)*q)) return -1;
  const long v = strtol(f, nullptr, 10);   // saturates on overflow, then clamped like the preview
  return v > hi ? hi : v < -1 ? -1 : (int32_t)v;
}
// Temperature "-2" = asleep, else like sysNum (-1 = unknown, at most 199)
int16_t tempNum(const char* f) { return strcmp(f, "-2") == 0 ? -2 : (int16_t)sysNum(f, 199); }
// Temperatures "41,38" ("-" = none) -> up to 6 values, -1 = unknown, -2 = asleep
uint8_t sysTemps(char* f, int16_t* out) {
  if (strcmp(f, "-") == 0) return 0;
  uint8_t n = 0;
  char* p = f;
  while (n < 6) {
    char* comma = strchr(p, ',');
    if (comma) *comma = '\0';
    out[n++] = tempNum(p);
    if (!comma) break;
    p = comma + 1;
  }
  return n;
}

// S line (after "S|"): rows | cpu % | cpu C | cpu W | RAM used MiB | ZFS cache MiB | RAM total MiB |
// interface | down KiB/s | up KiB/s | link Mb/s | NVMe C,... | SSD C,...
// N line (after "N|"): interface | down KiB/s | up KiB/s | link Mb/s | wireless 1/0 | state U / L / D
void parseNet(char* line) {
  char* f[6];
  if (splitFields(line, f, 6) < 6 || rxNetCount >= MAX_NETS) return;
  NetIf& ni = rxNets[rxNetCount++];
  memset(&ni, 0, sizeof(ni));   // every byte must be defined for the comparison (hash)
  uint8_t k = 0;
  for (const char* c = f[0]; *c && k < sizeof(ni.name) - 1; c++)
    if (isalnum((unsigned char)*c) || *c == '.' || *c == '_' || *c == '-') ni.name[k++] = *c;
  ni.rx = sysNum(f[1], 2147483647L);
  ni.tx = sysNum(f[2], 2147483647L);
  ni.link = sysNum(f[3], 1000000L);
  ni.wifi = strcmp(f[4], "1") == 0;
  ni.state = f[5][0] == 'D' || f[5][0] == 'L' ? f[5][0] : 'U';
}

void parseSys(char* line) {
  char* f[13];
  if (splitFields(line, f, 13) < 13) return;
  SysInfo& s = rxSys;
  memset(&s, 0, sizeof(s));
  s.on = true;
  uint8_t k = 0;
  s.netState = 'U';
  for (const char* c = f[0]; *c; c++) {
    if (strchr("CRNVSH", *c) && k < sizeof(s.parts) - 1) s.parts[k++] = *c;
    if (*c == 'I') s.icons = true;
    if (*c == 'W') s.wifiNet = true;                 // the interface is wireless
    if (*c == 'D' || *c == 'L') s.netState = *c;     // down / no link
  }
  s.cpu = sysNum(f[1], 100);
  s.temp = sysNum(f[2], 199);
  s.power = sysNum(f[3], 9999);
  s.ramUsed = sysNum(f[4], 2147483647L);
  s.ramArc = sysNum(f[5], 2147483647L);
  s.ramTotal = sysNum(f[6], 2147483647L);
  if (strcmp(f[7], "-") != 0) {
    k = 0;
    for (const char* c = f[7]; *c && k < sizeof(s.iface) - 1; c++)
      if (isalnum((unsigned char)*c) || *c == '.' || *c == '_' || *c == '-') s.iface[k++] = *c;
  }
  s.rx = sysNum(f[8], 2147483647L);
  s.tx = sysNum(f[9], 2147483647L);
  s.link = sysNum(f[10], 1000000L);
  s.nNvme = sysTemps(f[11], s.nvme);
  s.nSsd = sysTemps(f[12], s.ssd);
}

void commitFrame() {
  // settings field by field (the struct may contain padding bytes)
  const uint32_t hv[14] = { (uint32_t)rxHead.headInv << 25 | (uint32_t)rxHead.stby << 24 | (uint32_t)rxHead.driveTemp << 16 | (uint32_t)rxHead.netBar << 8 | rxHead.netIcons, rxCount, rxHead.rows, rxHead.warn, rxHead.rot, rxHead.timer, rxHead.ringDir,
                            rxHead.icons, rxHead.pctBar, rxHead.fast, rxHead.page, (uint32_t)rxHead.uptime,
                            rxHead.upMonths,
                            (uint32_t)rxHead.diskPages << 24 | (uint32_t)rxHead.layout[0] << 16 |
                            (uint32_t)rxHead.layout[1] << 8 | rxHead.layout[2] };
  const uint32_t h = fnv1a(rxNets, sizeof(NetIf) * rxNetCount,
                     fnv1a(&rxSys, sizeof(rxSys), fnv1a(rxDisks, sizeof(Disk) * rxCount, fnv1a(hv, sizeof(hv)))));
  const bool first = !dataReceived;
  const uint32_t fh = fnv1a(rxTime, strlen(rxTime), h);   // with the time: still the same frame?
  if (first || fh != freshHash) lastFreshMs = millis();
  freshHash = fh;

  memcpy(disks, rxDisks, sizeof(Disk) * rxCount);
  diskCount = rxCount;
  sys       = rxSys;
  memcpy(nets, rxNets, sizeof(NetIf) * rxNetCount);
  netCount  = rxNetCount;
  head      = rxHead;
  epd->setRotation(currentRotation());  // before pageCount(): width/height depend on it
  copyStr(hostName, rxHost, sizeof(hostName));
  copyStr(timeStr,  rxTime, sizeof(timeStr));
  dataReceived = true;

  // Only redraw when something changed (spares the panel). Pages are turned by
  // the timer in loop(), independent of how often frames arrive.
  const uint8_t pages = pageCount();
  if (first || pages == 1 || head.page == 0) { page = 0; turnPage = false; }
  if (page >= pages) page = 0;
  if (first) lastPageMs = millis();
  // also redraw when the page on the panel is no longer the right one
  // (page turn switched off on page 2, or fewer pages than before)
  // "Redraw now" from the web page: redraw even without changes, right away
  const bool changed = first || rxRedraw || h != lastHash || page != shownPage;
  lastHash = h;
  if (changed) pending = true;
  if (rxRedraw) forceRedraw = true;

  char answer[80];
  snprintf(answer, sizeof(answer), "OK disks=%u page=%u/%u refresh=%s", diskCount,
           (unsigned)((turnPage ? (page + 1) % pages : page) + 1), (unsigned)pages,
           !changed ? "no" : canRefreshNow() ? "now" : "later");
  // New pins or panel type from the web page: save them and restart, the display is set up with
  // them on boot
  const bool newPins = rxPinsGiven && pinsValid(rxPins) && panelValid(rxPins.panel) && !samePins(rxPins, pins);
  if (newPins) strncat(answer, " pins=saved restart", sizeof(answer) - strlen(answer) - 1);
  if (!fromWifi) Serial.println(answer);
#if HAS_WIFI
  lastAnswer = answer;
#endif
  if (newPins) {
    rxPins.magic = PIN_MAGIC;
    Serial.flush();
    savePinsAndRestart(rxPins);
  }
}

void handleLine(char* line) {
  if (strcmp(line, "PING") == 0) {
    if (fromWifi) return;
    Serial.print(F("PONG InkSights id="));
    Serial.print(chipId);
    Serial.print(F(" size="));
    Serial.print(epd->width());
    Serial.print('x');
    Serial.print(epd->height());
    Serial.print(hasColor ? F(" colors=3") : F(" colors=2"));
    Serial.print(F(" rows="));
    Serial.print(rowsPerPage());
    char p[40];
    snprintf(p, sizeof(p), " pins=%d,%d,%d,%d panel=%d", pins.cs, pins.dc, pins.rst, pins.busy, pins.panel);
    Serial.print(p);
    Serial.print(F(" board=" BOARD_ID " wifi="));
    Serial.print(HAS_WIFI);
    Serial.print(F(" fw="));
    Serial.print(FW_VERSION);
    if (fastPanel) Serial.print(F(" fast=1"));
#if HAS_WIFI
    Serial.print(F(" net="));
    Serial.print(netState());
    const String ip = netIp();
    if (ip.length()) { Serial.print(F(" ip=")); Serial.print(ip); }
    // the stored WiFi settings without the passwords (hex texts), for the USB setup page
    if (!net.ssid.isEmpty()) { Serial.print(F(" ssid=")); Serial.print(toHex(net.ssid)); }
    if (!net.host.isEmpty()) { Serial.print(F(" host=")); Serial.print(toHex(net.host)); }
    if (!net.server.isEmpty()) { Serial.print(F(" server=")); Serial.print(toHex(net.server)); }
    Serial.print(net.apOn ? F(" ap=1") : F(" ap=0"));
    if (!net.apSsid.isEmpty()) { Serial.print(F(" apssid=")); Serial.print(toHex(net.apSsid)); }
    Serial.print(F(" apdelay="));
    Serial.print(net.apDelay);
    Serial.print(net.pass.isEmpty() ? F(" pass=0") : F(" pass=1"));   // a WiFi password is stored (never the password)
#endif
    Serial.println();
#if HAS_WIFI
  } else if (line[0] == 'W' && line[1] == '|') {
    if (!fromWifi) applyWifiLine(line);   // WiFi settings only over USB
#endif
  } else if (strcmp(line, "#BEGIN") == 0) {
    rxActive = true;
    rxCount  = 0;
    rxHead   = HEAD_DEFAULT;
    memset(&rxSys, 0, sizeof(rxSys));   // no system page unless an S line comes
    rxNetCount = 0;                      // no network pages unless N lines come
    rxPinsGiven = false;
    rxRedraw = false;
    rxHost[0] = rxTime[0] = '\0';
  } else if (!rxActive) {
    return;
  } else if (strcmp(line, "#END") == 0) {
    rxActive = false;
    commitFrame();
  } else if (line[0] == 'H' && line[1] == '|') {
    char* f[23];
    const uint8_t n = splitFields(line, f, 23);
    if (n >= 3) {
      copyStr(rxHost, f[1], sizeof(rxHost));
      copyStr(rxTime, f[2], sizeof(rxTime));
      sanitize(rxHost); sanitize(rxTime);
      rxHead.rows    = n >= 4 ? constrain(atoi(f[3]), 0, 6) : 0;
      rxHead.warn    = n >= 5 ? constrain(atoi(f[4]), 0, 100) : WARN_PCT;
      rxHead.rot     = n >= 6 ? constrain(atoi(f[5]), 0, 3) : 0;
      rxHead.page    = n >= 7 ? (uint32_t)constrain(atol(f[6]), 0L, 86400L) : PAGE_SECS;
      rxHead.timer   = n >= 8 ? constrain(atoi(f[7]), 0, 1) : 0;
      rxHead.ringDir = n >= 9 ? constrain(atoi(f[8]), 0, 1) : 0;
      rxHead.icons   = n >= 10 ? constrain(atoi(f[9]), 0, 1) : 1;
      rxHead.pctBar  = n >= 11 ? constrain(atoi(f[10]), 0, 2) : 0;
      rxHead.fast    = n >= 12 ? constrain(atoi(f[11]), 0, 30) : 0;
      rxHead.uptime  = n >= 13 && isdigit((unsigned char)f[12][0]) ? (int32_t)min(atol(f[12]), 99999999L) : -1;
      rxHead.upMonths = n >= 14 ? (uint16_t)constrain(atol(f[13]), 0L, 9999L) : 0;
      // field 15: WiFi page (not drawn by the firmware yet); field 16: seconds until "NO DATA"
      rxHead.noData  = n >= 16 ? (uint32_t)constrain(atol(f[15]), 0L, 604800L) : 0;
      // header layout; without it (earlier version) the uptime stands where the page number would
      if (n >= 17 && layoutValid(f[16])) copyStr(rxHead.layout, f[16], sizeof(rxHead.layout));
      else if (rxHead.uptime >= 0) copyStr(rxHead.layout, "TCU", sizeof(rxHead.layout));
      rxHead.diskPages = n >= 18 && strcmp(f[17], "0") == 0 ? 0 : 1;
      rxHead.netBar   = n >= 19 ? constrain(atoi(f[18]), 0, 2) : 0;    // network pages: details in the bar
      rxHead.netIcons = n >= 20 && strcmp(f[19], "0") == 0 ? 0 : 1;   // network pages: symbols
      rxHead.driveTemp = n >= 21 && strcmp(f[20], "1") == 0 ? 1 : 0;  // temperatures in the drive rows
      rxHead.stby = n >= 22 && strcmp(f[21], "1") == 0 ? 1 : 0;       // asleep hard disks "STBY"
      rxHead.headInv = n >= 23 && strcmp(f[22], "1") == 0 ? 1 : 0;    // header inverted
    }
  } else if (line[0] == 'D' && line[1] == '|') {
    parseDisk(line);
  } else if (line[0] == 'S' && line[1] == '|') {
    parseSys(line + 2);
  } else if (line[0] == 'N' && line[1] == '|') {
    parseNet(line + 2);
  } else if (line[0] == 'T' && line[1] == '|') {
    if (rxSys.on) rxSys.nHdd = sysTemps(line + 2, rxSys.hdd);   // HDD temperatures of the system page
  } else if (strcmp(line, "R") == 0) {
    rxRedraw = true;
  } else if (line[0] == 'P' && line[1] == '|') {
    char* f[6];
    const uint8_t n = splitFields(line, f, 6);
    if (n == 5 || n == 6) {   // panel type missing: keep it
      rxPins = { PIN_MAGIC, (int8_t)atoi(f[1]), (int8_t)atoi(f[2]), (int8_t)atoi(f[3]), (int8_t)atoi(f[4]),
                 n == 6 ? (int8_t)atoi(f[5]) : pins.panel };
      rxPinsGiven = true;
    }
  }
}

// ------------------------------------------------------------------ main

void setup() {
  Serial.begin(115200);           // USB: baud rate is ignored

  loadPins();                     // pins and panel type from flash (written by the web page), otherwise the defaults
  hasColor  = panelInfo().color;
  fastPanel = panelInfo().fast;
  RD        = hasColor ? GxEPD_RED : GxEPD_BLACK;

#if defined(ARDUINO_ARCH_ESP32)
  // Hardware SPI on the board's SCLK and SDI pins without MISO, so that pin stays free as a
  // control pin. GxEPD2 calls SPI.begin() again later; on the ESP32 that keeps this setup.
  SPI.begin(PIN_SCK, -1, PIN_MOSI, -1);
#endif
  epd = newDisplay(pins.panel, pins.cs, pins.dc, pins.rst, pins.busy);
  epd->cp437(true);               // glyph codes as in the font table (arrows and degree sign of the system page)
  epd->init(0);                   // 0 = no diagnostic output (would disturb the protocol)
  // SPI.begin() inside init() claims D9 as MISO on the SAMD21; give it back if it is a control pin
  pinMode(pins.cs, OUTPUT);
  digitalWrite(pins.cs, HIGH);
  pinMode(pins.dc, OUTPUT);
  if (pins.rst >= 0) { pinMode(pins.rst, OUTPUT); digitalWrite(pins.rst, HIGH); }
  if (pins.busy >= 0) pinMode(pins.busy, INPUT);
  // Reset/Busy = -1: GxEPD2 then waits a fixed time instead of reading Busy and
  // only powers the panel off instead of putting it into deep sleep.
  epd->setRotation(ROTATION);     // first: rows per page depend on it
  readChipId();
#if HAS_WIFI
  loadNet();
  netBegin();
  web.on("/", HTTP_GET, handleRoot);
  web.on("/save", HTTP_POST, handleSave);
  web.on("/scan", HTTP_GET, handleScan);
  web.onNotFound(handleNotFound);
  web.begin();
  epd->epd2.setBusyCallback(whileBusy);   // the setup page answers while the panel draws
#endif
  pending = true;                 // draw the start screen
}

void loop() {
  while (Serial.available()) {
    const char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      lineBuf[lineLen] = '\0';
      handleLine(lineBuf);
      lineLen = 0;
    } else if (lineLen < sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = c;
    }
  }

#if HAS_WIFI
  netLoop();
  if (apActive) dns.processNextRequest();
  web.handleClient();
  pollServer();
  // Start screen: redraw when the WiFi line changes (e.g. the setup access point opened)
  if (!dataReceived && screenIsSplash && !pending) {
    char now[48];
    netLine(now, sizeof(now));
    if (strcmp(now, netShown) != 0) pending = true;
  }
#endif

  // "NO DATA" on or off again (fresh data after it: redraw even if the data are the same as before)
  if (dataReceived && noDataNow() != noDataShown) pending = true;

  // Automatic page turn (the redraw itself still waits for MIN_REFRESH_MS); not while "NO DATA"
  if (dataReceived && !noDataShown && !noDataNow() && head.page > 0 && pageCount() > 1 && !turnPage &&
      millis() - lastPageMs >= head.page * 1000UL) {
    turnPage = true;
    pending  = true;
  }

  if (pending && canRefreshNow()) {
    pending = false;
    if (turnPage) {
      page = (page + 1) % pageCount();
      turnPage = false;
      lastPageMs = millis();
    }
    refresh();
  }
}
