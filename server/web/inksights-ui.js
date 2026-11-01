/*
 * inksights-ui.js - the settings page, shared by the real page (index.html, data from the
 * server) and the simulator (simulator/simulator.html, simulated data). Both call
 * InkSightsUI.start(backend) and look and behave the same; only the backend differs:
 *
 *   backend.load()        -> Promise of { state, config, interval, pagename, defaultPagename }
 *   backend.save(body)    -> Promise; body = { displays, interval, pagename }
 *   backend.refresh()     -> Promise ("Update now")
 *   backend.redraw(id)    -> Promise ("Redraw now")
 *   backend.pollMs        -> reload the state this often (0 = never)
 *   backend.latest()      -> Promise of { version, url } of the latest release, or null (optional)
 *   backend.validate(body)-> Promise; checks imported settings like a save, without saving (optional)
 *   backend.live(id)      -> Promise of { frame, age }: the latest frame of a display with fast
 *                            refresh (live preview as often as it refreshes; optional)
 *   backend.frameOverride(id) -> frame text to show instead of the settings (simulator: pasted frame)
 *   backend.serverAddress -> address of this page as a display reaches it (WiFi settings)
 *   backend.titleSuffix   -> appended to the browser tab title
 *   backend.changePassword(current, next) -> change the password of the settings page (Login card; simulator so far)
 *   backend.tabs          -> one tab per display: its preview on the left (stays in view), its cards on the right (simulator)
 *   backend.offlineNoData -> a display that is not connected previews its "Check connection" screen (simulator)
 *
 * Drawing: inksights-render.js. No description texts next to the controls (labels only).
 */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "value") e.value = v;
      else if (k === "checked" || k === "disabled" || k === "selected" || k === "open" || k === "hidden") e[k] = !!v;
      else e.setAttribute(k, v);
    }
    e.append(...kids);
    return e;
  }

  // Selects with the styled list (inksights.css, appearance: base-select) would be as wide as the
  // chosen entry, so they would change width with every choice. A hidden copy of every entry in
  // their button keeps them as wide as the widest one, like the browser's own selects. Done for
  // every select of the page (also the simulator's and the USB setup's) as it appears.
  function keepSelectWidth(sel) {
    if (sel.dataset.sized) return;
    sel.dataset.sized = "1";
    sel.prepend(el("button", { type: "button", tabindex: "-1" }, document.createElement("selectedcontent"),
      el("span", { class: "sel-sizer", "aria-hidden": "true" }, ...[...sel.options].map(o => el("span", {}, o.textContent)))));
  }
  if (window.CSS && CSS.supports("appearance: base-select")) {
    const sizeAll = root => { if (root.nodeType !== 1) return; if (root.matches("select")) keepSelectWidth(root); root.querySelectorAll("select").forEach(keepSelectWidth); };
    new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(sizeAll); }).observe(document.documentElement, { childList: true, subtree: true });
    sizeAll(document.documentElement);
  }

  // ------------------------------------------------------------ boards
  // Same table as firmware/InkSights/BoardProfile.h. Pins are the board's pin numbers:
  // D numbers on the XIAO SAMD21, GPIO numbers on the ESP32 boards (dlabel: D label on the XIAO).
  // slot: the size of one firmware slot (app0 / ota_0) in the partition table of its PlatformIO env,
  // the most a firmware update over WiFi may bring.
  const QTPY_PINS = [5, 6, 7, 8, 9, 16, 17, 18, 37, 40, 41, 42];
  const BOARDS = {
    "xiao-samd21": { name: "Seeed XIAO SAMD21", wifi: false, pins: [0, 1, 2, 3, 4, 5, 6, 7, 9], defaults: [7, 9, 6, 5], samd: true },
    "seeed-xiao-esp32-c3": { name: "Seeed XIAO ESP32-C3", wifi: true, pins: [3, 4, 5, 6, 7, 9, 20, 21], defaults: [20, 9, 21, 7], slot: 0x140000,
      dlabel: { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 21: 6, 20: 7, 8: 8, 9: 9, 10: 10 } },
    "seeed-xiao-esp32-s3": { name: "Seeed XIAO ESP32-S3", wifi: true, pins: [1, 2, 4, 5, 6, 8, 43, 44], defaults: [44, 8, 43, 6], slot: 0x330000,
      dlabel: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 43: 6, 44: 7, 7: 8, 8: 9, 9: 10 } },
    "esp32-s3-supermini": { name: "ESP32-S3 Super Mini", wifi: true, pins: [1, 2, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 21], defaults: [10, 9, 8, 7], slot: 0x1E0000 },
    "esp32-s3-zero": { name: "Waveshare ESP32-S3-Zero", wifi: true, pins: [1, 2, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 43, 44], defaults: [10, 9, 8, 7], slot: 0x1E0000 },
    "esp32-c3-supermini": { name: "ESP32-C3 Super Mini", wifi: true, pins: [0, 1, 3, 5, 7, 10, 20, 21], defaults: [7, 5, 3, 10], slot: 0x1E0000 },
    "esp32-c3-zero": { name: "Waveshare ESP32-C3-Zero", wifi: true, pins: [0, 1, 3, 5, 7, 20, 21], defaults: [7, 5, 3, 1], slot: 0x1E0000 },
    "adafruit-qtpy-esp32-s3-n4r2": { name: "Adafruit QT Py ESP32-S3 N4R2", wifi: true, pins: QTPY_PINS, defaults: [9, 8, 18, 17], slot: 0x160000 },
    "adafruit-qtpy-esp32-s3-nopsram": { name: "Adafruit QT Py ESP32-S3 No PSRAM", wifi: true, pins: QTPY_PINS, defaults: [9, 8, 18, 17], slot: 0x200000 },
  };
  const DEFAULT_BOARD = "xiao-samd21";
  // the screens with a picture: settings prefix, kind (render.js m.art), card title, the setting of its
  // case (auto: "Nothing to ink" / "Check connection", On cue), the time window of a new display
  const ARTS = [
    { p: "conv", kind: "N", key: "C", title: "The Conversation", auto: "inkNothing", from: "18:00", to: "19:00" },
    { p: "inter", kind: "D", key: "I", title: "The Intermission", auto: "inkNoData", from: "12:00", to: "13:00" },
    { p: "after", kind: "Q", key: "A", title: "The Afterhours", auto: null, from: "23:00", to: "07:00" }];
  // the order of the cards that move: the pages (S D N T W, H field 28) and the pictures (C I A, their
  // place in the page turn)
  const CARD_LETTERS = "SDNTWCIA";
  const cardOrderOk = o => typeof o === "string" && o.length === CARD_LETTERS.length && [...CARD_LETTERS].every(k => o.includes(k));
  const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const minsOf = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  // is minute m of the day in the window from..to (it may go past midnight; from = to: empty)
  const inWindow = (m, from, to) => { const f = minsOf(from), e = minsOf(to); return f < e ? m >= f && m < e : f > e && (m >= f || m < e); };   // displays with older firmware report no board: they are SAMD21
  const PIN_NONE = -1;
  const PIN_NAMES = ["CS", "D/C", "Reset", "Busy"];
  function pinLabel(board, p) {
    if (p === PIN_NONE) return "None";
    if (board.samd) return `D${p}`;
    if (board.dlabel && p in board.dlabel) return `D${board.dlabel[p]} · GPIO${p}`;
    return `GPIO${p}`;
  }

  const TYPE_LABEL = { hdd: "HDD", ssd: "SSD", nvme: "NVMe" };
  // Components of the system page (rows, in this order); NVMe and SSD = temperatures of those drives
  const SYS_PARTS = [["cpu", "CPU"], ["ram", "RAM"], ["net", "Network"], ["nvme", "NVMe"], ["ssd", "SSD"], ["hdd", "HDD"]];
  const ALL_TYPES = Object.keys(TYPE_LABEL);
  const SORTS = [["pool", "Pool"], ["uid", "UID"], ["dev", "Device"], ["manual", "Custom"]];
  const NAME_RE = /^[A-Za-z0-9 ._+\/-]{0,12}$/;
  // UTF-8 text from hex ("486f6d65" -> "Home", like the board's W line and ssid=); "" when it is not hex
  function hexText(h) {
    if (typeof h !== "string" || !/^([0-9a-fA-F]{2})+$/.test(h)) return "";
    try { return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(h.match(/../g).map(b => parseInt(b, 16)))); } catch (e) { return ""; }
  }
  const HOST_RE = /^[A-Za-z0-9-]{1,32}$/;
  const SERVER_RE = /^https?:\/\/[^\s|]{1,120}$/;
  const DEFAULT_WARN = 85;
  const DEFAULT_PAGE = 600;
  const DEFAULT_TITLE = "InkSights";   // the title of the top line when none is set (user; was the host name)
  // a new display: header with the time left, the title in the middle, the uptime right; the pages
  // time, system, drives, network, WiFi (user)
  const NEW_LAYOUT = "CTU", NEW_PAGE_ORDER = "TSDNW";
  const DEFAULT_AP_SSID = "InkSights";
  const DEFAULT_AP_PASS = "ink!1234";
  const DEFAULT_AP_DELAY = 30, MAX_AP_DELAY = 3600;   // seconds without WiFi before the access point opens
  // Refresh per display in seconds: under a minute only on panels that redraw fast without flashing
  // (black/white), as fast refresh; from a minute on a full update of this display that often
  const REFRESH = [[2, "2 s"], [5, "5 s"], [10, "10 s"], [30, "30 s"], [60, "1 min"], [180, "3 min"], [300, "5 min"], [600, "10 min"],
    [900, "15 min"], [1800, "30 min"], [3600, "1 h"], [5400, "1.5 h"], [7200, "2 h"], [10800, "3 h"], [14400, "4 h"]];
  const DEFAULT_REFRESH = 600;
  // Time page with NTP (boards with WiFi): common time zones with their POSIX rule (daylight saving
  // included) for the board; the preview takes the zone name
  const ZONES = [["UTC", "UTC0"], ["Europe/London", "GMT0BST,M3.5.0/1,M10.5.0"], ["Europe/Dublin", "GMT0IST,M3.5.0/1,M10.5.0"],
    ["Europe/Lisbon", "WET0WEST,M3.5.0/1,M10.5.0"], ["Europe/Berlin", "CET-1CEST,M3.5.0,M10.5.0/3"], ["Europe/Amsterdam", "CET-1CEST,M3.5.0,M10.5.0/3"],
    ["Europe/Brussels", "CET-1CEST,M3.5.0,M10.5.0/3"], ["Europe/Paris", "CET-1CEST,M3.5.0,M10.5.0/3"], ["Europe/Zurich", "CET-1CEST,M3.5.0,M10.5.0/3"],
    ["Europe/Vienna", "CET-1CEST,M3.5.0,M10.5.0/3"], ["Europe/Rome", "CET-1CEST,M3.5.0,M10.5.0/3"], ["Europe/Madrid", "CET-1CEST,M3.5.0,M10.5.0/3"],
    ["Europe/Copenhagen", "CET-1CEST,M3.5.0,M10.5.0/3"], ["Europe/Oslo", "CET-1CEST,M3.5.0,M10.5.0/3"], ["Europe/Stockholm", "CET-1CEST,M3.5.0,M10.5.0/3"],
    ["Europe/Warsaw", "CET-1CEST,M3.5.0,M10.5.0/3"], ["Europe/Prague", "CET-1CEST,M3.5.0,M10.5.0/3"], ["Europe/Budapest", "CET-1CEST,M3.5.0,M10.5.0/3"],
    ["Europe/Helsinki", "EET-2EEST,M3.5.0/3,M10.5.0/4"], ["Europe/Athens", "EET-2EEST,M3.5.0/3,M10.5.0/4"], ["Europe/Istanbul", "<+03>-3"],
    ["Europe/Moscow", "MSK-3"], ["Africa/Lagos", "WAT-1"], ["Africa/Johannesburg", "SAST-2"], ["Africa/Cairo", "EET-2EEST,M4.5.5/0,M10.5.4/24"],
    ["Africa/Nairobi", "EAT-3"], ["Asia/Jerusalem", "IST-2IDT,M3.4.4/26,M10.5.0"], ["Asia/Dubai", "<+04>-4"], ["Asia/Kolkata", "IST-5:30"],
    ["Asia/Bangkok", "<+07>-7"], ["Asia/Singapore", "<+08>-8"], ["Asia/Hong_Kong", "HKT-8"], ["Asia/Shanghai", "CST-8"], ["Asia/Seoul", "KST-9"],
    ["Asia/Tokyo", "JST-9"], ["Australia/Perth", "AWST-8"], ["Australia/Adelaide", "ACST-9:30ACDT,M10.1.0,M4.1.0/3"], ["Australia/Brisbane", "AEST-10"],
    ["Australia/Sydney", "AEST-10AEDT,M10.1.0,M4.1.0/3"], ["Pacific/Auckland", "NZST-12NZDT,M9.5.0,M4.1.0/3"], ["Pacific/Honolulu", "HST10"],
    ["America/Anchorage", "AKST9AKDT,M3.2.0,M11.1.0"], ["America/Los_Angeles", "PST8PDT,M3.2.0,M11.1.0"], ["America/Phoenix", "MST7"],
    ["America/Denver", "MST7MDT,M3.2.0,M11.1.0"], ["America/Chicago", "CST6CDT,M3.2.0,M11.1.0"], ["America/Mexico_City", "CST6"],
    ["America/New_York", "EST5EDT,M3.2.0,M11.1.0"], ["America/Toronto", "EST5EDT,M3.2.0,M11.1.0"], ["America/Halifax", "AST4ADT,M3.2.0,M11.1.0"],
    ["America/St_Johns", "NST3:30NDT,M3.2.0,M11.1.0"], ["America/Sao_Paulo", "<-03>3"], ["America/Argentina/Buenos_Aires", "<-03>3"]];
  const NTP_SERVERS = ["pool.ntp.org", "0.pool.ntp.org", "1.pool.ntp.org", "2.pool.ntp.org", "3.pool.ntp.org"];
  const NTP_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,39}$/;
  const DATE_FORMATS = [[0, "26 Oct 2026"], [1, "2026-10-26"], [2, "10/26/2026"], [3, "26.10.2026"]];
  // the zone of this browser when it is in the list, else UTC
  const refreshMins = s => Math.max(1, Math.floor(s.refresh / 60));   // a refresh under a minute counts as 1 minute
  const IFACE_RE = /^(?!-$)[A-Za-z0-9._-]{1,15}$/;
  const PREFS = "inksights-ui";   // folded sections; per browser only

  // "HH:MM:SS" <-> seconds; -1 = not a valid time
  function parseHms(text) {
    const m = /^\s*(\d{1,2}):([0-5]\d):([0-5]\d)\s*$/.exec(text);
    if (!m) return -1;
    const v = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    return v <= 86400 ? v : -1;
  }
  const fmtHms = v => [Math.floor(v / 3600), Math.floor(v / 60) % 60, v % 60].map(n => String(n).padStart(2, "0")).join(":");
  const hhmm = epoch => {
    if (!epoch) return "--:--";
    const d = new Date(epoch * 1000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const hhmmss = ms => { const d = new Date(ms); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, "0")).join(":"); };
  const parseSize = s => { const m = /^(\d+)x(\d+)$/.exec(s || ""); return m ? [Number(m[1]), Number(m[2])] : [212, 104]; };
  // Panel types (PANELS in the firmware): chosen on this page, saved on the board like the pins.
  // size in landscape, colors 3 = black/white/color, fast = fast partial refresh possible
  const BASE_PANELS = [
    { id: 1, name: "GDEW0213Z16", size: [212, 104], colors: 3, fast: false },
    { id: 2, name: "GDEH0213Z19", size: [212, 104], colors: 3, fast: false },
    { id: 3, name: "GDEY0213Z98", size: [250, 122], colors: 3, fast: false },
    { id: 4, name: "GDEY0213B74", size: [250, 122], colors: 2, fast: true },
    { id: 5, name: "GDEY042T81", size: [400, 300], colors: 2, fast: true },
  ];
  // 6 to 8: the colour panels with yellow as the third colour, driven like their red twins; text
  // on the third colour is black there
  const YELLOW_PANELS = BASE_PANELS.filter(p => p.colors === 3).map(p => ({ ...p, id: p.id + 5, yellow: true }));
  const PANELS = BASE_PANELS.concat(YELLOW_PANELS);
  const panels = PANELS;   // the types offered
  const panelLabel = p => `${p.size[0] >= 360 ? "4.2″" : "2.13″"} ${p.size[0]} × ${p.size[1]} · ` +
    `${p.colors === 2 ? "black/white" : p.yellow ? "black/white/yellow" : "black/white/red"} · ${p.name}`;
  // The panel of a display: chosen here, else what the board reports, else (older firmware without
  // panel=) the first type with its size and colours
  function panelOf(live, s) {
    const byId = id => panels.find(p => p.id === id);
    if (s && byId(s.panel)) return byId(s.panel);
    if (live && byId(live.panel)) return byId(live.panel);
    const [a, b] = parseSize(live && live.size), mono = !!(live && live.colors === 2);
    return PANELS.find(p => p.size[0] === Math.max(a, b) && (p.colors === 2) === mono) || PANELS[0];
  }
  // Panel size as the display draws it: landscape for 0°/180°, portrait for 90°/270°
  function panelSize(panel, rot) {
    const [wide, high] = panel.size;
    return rot === 90 || rot === 270 ? [high, wide] : [wide, high];
  }

  function start(backend) {
    const root = backend.root;
    let state = { host: "", updated: 0, disks: [], displays: [] };
    let config = {};
    let interval = 10, pageName = "", defaultPageName = "InkSights";
    let dirty = false, lastKey = "", appProblem = "", defaultLogin = false;
    const pages = {}, lastWarn = {};
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem(PREFS) || "{}") || {}; } catch (e) { prefs = {}; }
    const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch (e) { /* not essential */ } };
    const pref = (id, key, dflt) => (prefs[id] && key in prefs[id] ? prefs[id][key] : dflt);
    const setPref = (id, key, v) => { prefs[id] = { ...(prefs[id] || {}), [key]: v }; savePrefs(); };

    // ---------------------------------------------------------- page skeleton
    root.append(
      el("header", { class: "top" },
        el("div", {},
          el("span", { class: "eyebrow" }, "YOUR SYSTEM METRICS AT A GLANCE"),
          // the logo bars of the start screen in front of the instance name
          el("h1", {}, el("span", { class: "logo", "aria-hidden": "true" }, el("i"), el("i"), el("i"), el("i")), " ", el("span", { id: "pagetitle" }, "InkSights")),
          el("p", { class: "status", id: "status" }, "Loading …"),
          el("p", { class: "status versions", id: "versions" })),
        el("div", { class: "actions" },
          el("button", { class: "btn", id: "refresh", type: "button", onclick: doRefresh }, "Update now"),
          el("button", { class: "btn primary", id: "save", type: "button", disabled: true, onclick: doSave }, "Save"))),
      el("div", { class: "update", id: "update", role: "status", hidden: true }),
      el("div", { class: "update warn", id: "vercheck", role: "status", hidden: true }),
      el("p", { class: "msg", id: "msg", role: "status", "aria-live": "polite" }),
      el("div", { id: "warnings", class: "displays" }),
      el("section", { class: "displays", id: "displays", "aria-label": "Displays" }),
      el("section", { id: "login", "aria-label": "Login", hidden: true }),
      el("section", { id: "about", "aria-label": "About InkSights", hidden: true }));

    function setMsg(text, kind = "") { const m = $("msg"); m.textContent = text; m.className = `msg ${kind}`; }
    // The instance name is one setting, shown in every card: keep all boxes in step
    function syncPageName(except) {
      for (const box of document.querySelectorAll("input.pagename")) {
        box.placeholder = defaultPageName;
        if (box !== except && document.activeElement !== box) box.value = pageName;
      }
    }
    function applyPageName() {
      const n = pageName.trim() || defaultPageName;
      $("pagetitle").textContent = n;
      document.title = n + (backend.titleSuffix || "");
    }

    function settingsFor(id) {
      if (!config[id]) config[id] = {};
      return normalize(config[id]);
    }
    // the settings of a display with defaults for anything missing or unusable (changed in place)
    function normalize(s) {
      if (!Array.isArray(s.types)) s.types = [...ALL_TYPES];
      if (typeof s.boxes !== "number") s.boxes = 0;   // spindown timer off
      if (typeof s.rows !== "number") s.rows = 0;
      if (!SORTS.some(([v]) => v === s.sort)) s.sort = "pool";
      if (!Array.isArray(s.order)) s.order = [];
      if (!Array.isArray(s.hidden)) s.hidden = [];
      if (typeof s.warn !== "number") s.warn = DEFAULT_WARN;
      if (![0, 90, 180, 270].includes(s.rot)) s.rot = 0;
      if (typeof s.page !== "number") s.page = DEFAULT_PAGE;
      if (!Array.isArray(s.pins) || s.pins.length !== 4) s.pins = null;   // null = keep the pins of the display
      if (!panels.some(p => p.id === s.panel)) s.panel = null;              // null = keep the panel type of the display
      if (typeof s.name !== "string") s.name = "";
      if (typeof s.dname !== "string") s.dname = "";
      // header: left, middle, right (T title, P page number, U uptime, C time, - nothing); without
      // one (earlier version) as before: title, time, then the page number or the uptime
      if (!EPD.layoutOk(s.layout)) s.layout = s.headerUp === 1 ? "TCU" : NEW_LAYOUT;
      // a new display: header and system page (all components) on, disk and WiFi pages off
      for (const [k, d] of [["timer", 1], ["ringDir", 1], ["icons", 1], ["pctBar", 1], ["barCap", 1], ["zfs", 0], ["showSys", 1], ["showDisks", 1], ["sysIcons", 1], ["showWifi", 1], ["wifiIcons", 1], ["showHeader", 1], ["showNet", 1], ["netIcons", 1], ["driveTemp", 0], ["stby", 1], ["headInv", 0], ["headCol", 0], ["timeFmt", 0], ["ampm", 1], ["showTime", 1], ["timeDate", 1], ["timeWday", 1], ["ntp", 0], ["inkSplash", 1], ["inkNothing", 1], ["inkNoData", 1], ["convInk", 1], ["interInk", 1], ["afterInk", 1], ["lineBottom", 0], ["justTime", 0], ["timeHead", 0], ["headFill", 0], ["timeColor", 0], ["timeFrame", 0], ["ota", 1], ["convClock", 0], ["interClock", 0], ["afterClock", 0]]) if (s[k] !== 0 && s[k] !== 1) s[k] = d;
      if (![0, 1, 2].includes(s.sober)) s.sober = 2;   // Beverages: 0 House Wine, 1 Tabula Rasa, 2 Roast (default; user)
      // the pictures: header, a time window when only this picture shows (Scheduled, From, To), a page
      // in the page turn; all off for a new display
      for (const a of ARTS) {
        // a new display (user, 2026-10-27): Header, Caption, Turn candidate on, Scheduled off
        for (const [k, d] of [["Head", 1], ["Sched", 0], ["Rot", 1]]) if (s[a.p + k] !== 0 && s[a.p + k] !== 1) s[a.p + k] = d;
        // Caption (the text below the picture when its case shows it, The Afterhours: in its time window
        // "Closed until <To>"): on where it tells something ("Check connection", the end of the quiet hours)
        if (s[a.p + "Cap"] !== 0 && s[a.p + "Cap"] !== 1) s[a.p + "Cap"] = 1;
        if (!HHMM_RE.test(s[a.p + "From"] || "")) s[a.p + "From"] = a.from;
        if (!HHMM_RE.test(s[a.p + "To"] || "")) s[a.p + "To"] = a.to;
      }
      if (!EPD.orderOk(s.pageOrder)) s.pageOrder = NEW_PAGE_ORDER;   // the page order: S system, D drives, N network, T time, W WiFi
      // the card order with the pictures; its pages always in the page order (that one is saved)
      if (!cardOrderOk(s.cardOrder)) s.cardOrder = s.pageOrder + "CIA";
      { let i = 0; s.cardOrder = [...s.cardOrder].map(k => (EPD.PAGE_ORDER.includes(k) ? s.pageOrder[i++] : k)).join(""); }
      if (![0, 1, 2, 3].includes(s.dateFmt)) s.dateFmt = 1;   // time page: 26 Oct 2026, ISO, US, German
      if (typeof s.ntpServer !== "string" || !NTP_RE.test(s.ntpServer)) s.ntpServer = NTP_SERVERS[0];
      if (!ZONES.some(([n]) => n === s.tz)) s.tz = "UTC";
      s.tzPosix = ZONES.find(([n]) => n === s.tz)[1];
      if (![0, 1, 2].includes(s.pctDec)) s.pctDec = 1;   // decimals of the percentage in the drive bars
      // network pages: details in the bar 0 none / 1 percentage / 2 link speed, order by name or custom, hidden interfaces
      if (![0, 1, 2].includes(s.netBar)) s.netBar = 1;
      if (s.netSort !== "manual") s.netSort = "name";
      if (!Array.isArray(s.netOrder)) s.netOrder = [];
      if (!Array.isArray(s.netHidden)) s.netHidden = [];
      // system page components; none = no system page (1 / 0 = on / off of an earlier version)
      if (s.sys === 1 || s.sys === undefined) s.sys = SYS_PARTS.map(([p]) => p);
      if (!Array.isArray(s.sys)) s.sys = [];
      s.sys = SYS_PARTS.map(([p]) => p).filter(p => s.sys.includes(p));
      // refresh in seconds; missing (earlier version): the fast refresh, else the update interval of all displays
      if (!REFRESH.some(([v]) => v === s.refresh)) s.refresh = [2, 5, 10, 30].includes(s.fast) ? s.fast : REFRESH.some(([v]) => v === interval * 60) ? interval * 60 : DEFAULT_REFRESH;
      s.fast = s.refresh < 60 ? s.refresh : 0;   // under a minute: fast refresh
      if (typeof s.net !== "string") s.net = "";
      if (!s.wifi || typeof s.wifi !== "object") s.wifi = {};
      const w = s.wifi;
      for (const k of ["ssid", "host", "server", "apSsid"]) if (typeof w[k] !== "string") w[k] = "";
      if (typeof w.apOn !== "boolean") w.apOn = true;
      if (typeof w.apDelay !== "number") w.apDelay = DEFAULT_AP_DELAY;
      return s;
    }

    // Connected displays plus displays that only exist in the saved settings
    function displayList() {
      const live = new Map();
      for (const d of state.displays || []) if (d.id) live.set(d.id, d);
      const ids = [...new Set([...live.keys(), ...Object.keys(config)])].sort();
      return ids.map(id => ({ id, live: live.get(id) || null }));
    }
    const boardOf = live => BOARDS[live && live.board] || BOARDS[DEFAULT_BOARD];
    // minutes between full updates: the shortest refresh of the displays (as the app writes it)
    const fullMins = () => { const l = displayList(); return l.length ? Math.min(...l.map(e => refreshMins(settingsFor(e.id)))) : interval; };
    const nameOf = (id, s) => s.dname.trim() || s.name || `Display ${id}`;

    function typeCounts() {
      const c = { hdd: 0, ssd: 0, nvme: 0 };
      for (const d of state.disks || []) if (d.type in c) c[d.type]++;
      return c;
    }

    // the pictures: Ink = used at all; the rest (On cue, Header, Scheduled, Turn candidate and
    // The Afterhours) everywhere now (afterhours: once the simulator only)
    const artsShown = () => ARTS.filter(a => a.kind !== "Q" || afterhours);
    const inkKey = a => afterhours ? a.p + "Ink" : a.auto;
    // its case shows the picture: On cue on and Ink on
    const autoOn = (s, a) => s[a.auto] !== 0 && (!afterhours || s[a.p + "Ink"] !== 0);
    // the pictures with a time window in use (Ink on, Scheduled on)
    const artsTimed = s => artsShown().filter(a => s[inkKey(a)] !== 0 && s[a.p + "Sched"] === 1);
    function problems() {
      const out = [];
      for (const { id, live } of displayList()) {
        const s = settingsFor(id), who = s.dname.trim() || s.name || id, w = s.wifi;
        if (!NAME_RE.test(s.name)) out.push(`${who}: title max. 12 characters, only letters, digits, spaces and . _ - + /`);
        if (s.dname.length > 32) out.push(`${who}: name max. 32 characters.`);
        if (s.ntp && !NTP_RE.test(s.ntpServer)) out.push(`${who}: NTP server like pool.ntp.org.`);
        if (!Number.isInteger(s.warn) || s.warn < 0 || s.warn > 100) out.push(`${who}: highlight threshold must be between 1 and 100 %.`);
        if (s.page < 0) out.push(`${who}: page turn must be a time like 00:10:00 (max. 24:00:00).`);
        const timed = artsTimed(s, live);
        for (const a of timed) if (s[a.p + "From"] === s[a.p + "To"]) out.push(`${who}: ${a.title}: start and end must differ.`);
        for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length; j++) {
          const A = timed[i], B = timed[j];
          for (let m = 0; m < 1440; m++) if (inWindow(m, s[A.p + "From"], s[A.p + "To"]) && inWindow(m, s[B.p + "From"], s[B.p + "To"])) {
            out.push(`${who}: the times of ${A.title} and ${B.title} overlap.`);
            break;
          }
        }
        const used = (s.pins || []).filter(p => p !== PIN_NONE);
        if (new Set(used).size !== used.length) out.push(`${who}: CS, D/C, Reset and Busy need different pins.`);
        if (boardOf(live).wifi) {
          if (w.ssid.length > 32) out.push(`${who}: WiFi network max. 32 characters.`);
          if (typeof w.pass === "string" && w.pass && (w.pass.length < 8 || w.pass.length > 63)) out.push(`${who}: WiFi password 8 to 63 characters.`);
          if (w.host && !HOST_RE.test(w.host)) out.push(`${who}: host name only letters, digits and -, max. 32.`);
          if (w.server && !SERVER_RE.test(w.server)) out.push(`${who}: settings page address like http://hostname:8099.`);
          if (typeof w.apPass === "string" && w.apPass && (w.apPass.length < 8 || w.apPass.length > 63)) out.push(`${who}: access point password 8 to 63 characters.`);
          if (!Number.isInteger(w.apDelay) || w.apDelay < 0 || w.apDelay > MAX_AP_DELAY) out.push(`${who}: access point after 0 to ${MAX_AP_DELAY} seconds.`);
        }
      }
      return out;
    }

    function changed() {
      dirty = true;
      const p = problems();
      $("save").disabled = p.length > 0;
      setMsg(p.length ? p[0] : "Not saved.", p.length ? "warn" : "");
    }

    // ---------------------------------------------------------- preview
    // Live preview: a display with fast refresh gets the frame it was last sent, as often as it
    // refreshes; not while settings are changed and not saved (the preview then shows them)
    const liveFrames = {}, liveAsked = {}, liveBusy = {};
    const fastSecs = entry => (entry.live && entry.live.fast ? settingsFor(entry.id).fast : 0);
    function liveText(entry) {
      const f = fastSecs(entry), lf = liveFrames[entry.id];
      return !dirty && f && lf && Date.now() - lf.at <= Math.max(30, 5 * f) * 1000 ? lf.text : null;
    }
    function pollLive() {
      for (const entry of displayList()) {
        const id = entry.id, f = fastSecs(entry);
        if (!f || liveBusy[id] || Date.now() - (liveAsked[id] || 0) < f * 1000 - 200) continue;
        liveAsked[id] = Date.now();
        liveBusy[id] = true;
        backend.live(id).then(r => {
          if (!r || typeof r.frame !== "string") {   // none (any more): the preview from the settings again
            if (liveFrames[id]) { delete liveFrames[id]; if (!dirty) drawPreview(entry); }
            return;
          }
          const old = liveFrames[id];
          liveFrames[id] = { text: r.frame, at: Date.now() - Math.max(0, r.age || 0) * 1000 };
          if (!dirty && (!old || old.text !== r.frame)) drawPreview(entry);
        }).catch(() => { /* next time */ }).finally(() => { liveBusy[id] = false; });
      }
    }

    // Sync with display (Display card, frame Preview, remembered in this browser): the preview shows what the panel shows, by the
    // rules of the firmware: new data and page turns only at a redraw, at most every 3 minutes (fast refresh:
    // its seconds), the first data and "Redraw now" at once; in between the old picture stays. The board
    // reports what its panel shows (page, last redraw, next page turn): the preview follows that
    const mirror = {};
    const mirrorOn = id => !!pref(id, "mirror", 0);
    // what the panel showed at a moment: { at (s), shown (place in the page turn, 0 = start screen), drawn (s
    // since the redraw), turn (s until the next page turn, -1 = none) }; WiFi: with its last fetch, USB: its
    // answer to the last frame (a redraw right away: the page of the answer, drawn now)
    function panelNow(live) {
      if (!live) return null;
      if (live.panelNow && typeof live.panelNow === "object") return live.panelNow;
      const m = / shown=(\d+) drawn=(\d+) turn=(-?\d+)/.exec(live.answer || "");
      if (!m || !live.answerAt) return null;
      const pg = / page=(\d+)\//.exec(live.answer), now = / refresh=now/.test(live.answer);
      return now && pg ? { at: live.answerAt, shown: +pg[1], drawn: 0, turn: +m[3], fresh: true }
        : { at: live.answerAt, shown: +m[1], drawn: +m[2], turn: +m[3] };
    }
    function mirrorStep(entry, text) {
      const now = Date.now(), s = settingsFor(entry.id);
      // the firmware compares the frames without their time
      const bare = t => (t || "").replace(/^(H\|[^|\n]*\|)[^|\n]*/m, "$1");
      let v = mirror[entry.id];
      const made = !v || v.force;
      if (made) v = mirror[entry.id] = { text, page: v ? v.page : 0, drawn: now, turned: now, pc: v ? v.pc : 1, sync: v ? v.sync : "" };
      const pn = panelNow(entry.live);
      if (pn && pn.shown > 0) {   // a new report of the board: its page and times
        const key = `${pn.at}|${pn.shown}|${pn.drawn}|${pn.turn}`;
        if (key !== v.sync) {
          v.sync = key;
          const at = pn.at * 1000;
          v.page = pn.shown - 1;
          v.drawn = at - pn.drawn * 1000;
          if (pn.turn >= 0 && s.page > 0) v.turned = at + (pn.turn === 0 && pn.fresh ? s.page : pn.turn) * 1000 - s.page * 1000;
          if (pn.fresh) v.text = text;
        }
      }
      if (made) return v;
      const minMs = panelOf(entry.live, s).fast && s.fast > 0 ? s.fast * 1000 - 500 : 180000;
      const turn = s.page > 0 && v.pc > 1 && now - v.turned >= s.page * 1000;
      if ((turn || bare(text) !== bare(v.text)) && now - v.drawn >= minMs) {
        if (turn) { v.page = (v.page + 1) % v.pc; v.turned = now; }
        v.text = text;
        v.drawn = now;
      }
      return v;
    }
    function frameText(entry) {
      const s = settingsFor(entry.id);
      const override = backend.frameOverride ? backend.frameOverride(entry.id) : null;
      if (override != null) return { text: override, override: true };
      const lt = liveText(entry);
      if (lt != null) return { text: lt, override: false };
      return { text: buildFor(entry, state), override: false };
    }
    // the frame of a display from its settings and state st (state.json, or simulated live values)
    function buildFor(entry, st) {
      const s0 = settingsFor(entry.id), title = (s0.name || DEFAULT_TITLE).slice(0, 12);
      let s = boardOf(entry.live).wifi ? s0 : { ...s0, showWifi: 0 };   // a board without WiFi has no WiFi page
      // the screens bits (H field 26) of the cases: On cue and Ink of The Conversation / The Intermission
      s = { ...s, inkNothing: autoOn(s, ARTS[0]) ? 1 : 0, inkNoData: autoOn(s, ARTS[1]) ? 1 : 0 };
      return EPD.buildFrame(st.disks || [], s, title, st.timeText || hhmm(st.updated), st.system || null, panelOf(entry.live, s).fast, refreshMins(s), dataStamp(st));
    }
    // date and time of the data YYYYMMDDHHMMSS: the day of the update, the time it shows
    function dataStamp(st) {
      const d = st.updated ? new Date(st.updated * 1000) : new Date(), p = n => String(n).padStart(2, "0");
      const hm = /^(\d\d):(\d\d)$/.exec(st.timeText || "");
      return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${hm ? hm[1] + hm[2] + "00" : p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())}`;
    }
    // what the time page shows now: with NTP (a board with WiFi) the time in its zone, else the
    // time of the data counted on like the board does
    function clockNow(model, live, s) {
      if (model.clock.ntp && boardOf(live).wifi) {
        try {
          const f = new Intl.DateTimeFormat("en-US", { timeZone: s.tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23", weekday: "short" });
          const o = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
          return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday) };
        } catch (e) { /* unknown zone: the time of the data */ }
      }
      return EPD.clockParts(model.clock.dt, state.updated ? Date.now() / 1000 - state.updated : 0);
    }

    function drawPreview(entry) {
      const { id, live } = entry;
      const canvas = $(`cv-${id}`);
      if (!canvas) return;
      const s = settingsFor(id), panel = panelOf(live, s);
      const [w, h] = panelSize(panel, s.rot);
      const fresh = frameText(entry), mv = mirrorOn(id) && !fresh.override ? mirrorStep(entry, fresh.text) : null;
      const { text, override } = mv ? { text: mv.text, override: false } : fresh;
      for (const b of document.querySelectorAll(`#pager-${id} button`)) b.disabled = !!mv;   // Sync with display: the board turns the pages
      document.querySelectorAll(`.set-${id}`).forEach(f => { f.disabled = override; });
      $(`size-${id}`).textContent = `${w} × ${h} px · ${panel.colors === 2 ? "b/w" : "b/w/color"}`;
      $(`frame-${id}`).textContent = text || "";
      const c = typeCounts();
      for (const t of ALL_TYPES) { const n = $(`count-${id}-${t}`); if (n) n.textContent = `(${c[t]})`; }
      for (const t of ["nvme", "ssd", "hdd"]) { const n = $(`scount-${id}-${t}`); if (n) n.textContent = `(${c[t]})`; }
      const model = EPD.parseFrame(text || "");
      const fb = new EPD.Fb(w, h);
      const msg = $(`msg-${id}`);
      if (!model) {
        msg.textContent = "No complete frame found. Paste one block from #BEGIN to #END.";
        msg.className = "note warn";
        $(`pg-${id}`).textContent = "";
        paint(canvas, fb, w, h, panel.yellow);
        return;
      }
      // simulator "No data": connected, but nothing to show -> the "Nothing to ink" screen
      if (live && live.nothingToInk) { model.sys = null; model.nets = []; model.disks = []; model.diskPages = 0; model.wifiPage = 0; model.clock = null; }
      if (model.clock) model.now = clockNow(model, live, s);
      // every page off ("Nothing to ink"); with pictures in the page turn those are all the pages
      const nothing = !model.sys && !model.wifiPage && !model.clock && !model.nets.length && !model.netPages && model.disks.length === 0 && model.diskPages === 0;
      const counts = EPD.pageCounts(model.disks.length, h, model.rows, w, !!model.sys, !!model.wifiPage, model.layout !== "---", model.nets.length, !!model.clock, !!model.netPages, model.diskPages !== 0);
      // the pictures: the one whose time window holds the time of the frame
      // shows alone; the ones in the page turn have their place in the card order; m.artHead: with a header
      const hm = /^(\d\d):(\d\d)/.exec(model.time || ""), now = hm ? Number(hm[1]) * 60 + Number(hm[2]) : -1;
      const timed = artsTimed(s).find(a => now >= 0 && inWindow(now, s[a.p + "From"], s[a.p + "To"]));
      const extra = timed ? [] : artsShown().filter(a => s[inkKey(a)] !== 0 && s[a.p + "Rot"] === 1);
      // (the real page: header and text as the firmware draws them)
      model.artHead = afterhours ? artsShown().filter(a => s[a.p + "Head"] === 1).map(a => a.kind).join("") : "ND";
      model.artCap = afterhours ? ARTS.filter(a => a.auto && s[a.p + "Cap"] === 1).map(a => a.kind).join("") : "ND";
      model.extraPages = extra.length;
      if (afterhours && nothing && extra.length) model.extraOnly = true;
      // the page turn: the pages and the pictures in the card order (m.page: the page among the pages,
      // m.pageNo: its number in the whole turn, for the header)
      const turn = [];
      let bi = 0;
      for (const k of s.cardOrder) {
        const a = extra.find(x => x.key === k);
        if (a) turn.push({ art: a });
        else if (!model.extraOnly) for (let i = 0; i < (counts[k] || 0); i++) turn.push({ base: bi++ });
      }
      if (!turn.length) turn.push({ base: 0 });
      // the screens of the firmware with the pictures: the time page keeps its places without
      // a header, every page off without a picture shows the logo
      model.nextFw = afterhours;
      // Beverages: 0 House Wine, 1 Tabula Rasa (without the bottle and the glass), 2 Roast (a coffee cup instead)
      model.sober = afterhours ? s.sober : 0;
      const pc = timed ? 1 : turn.length;
      if (mv) { mv.pc = pc; pages[id] = mv.page; }
      pages[id] = (((pages[id] || 0) % pc) + pc) % pc;
      const at = timed ? { base: 0 } : turn[pages[id]];
      model.page = at.base ?? 0;
      model.pageNo = pages[id];
      const artPage = timed || at.art || null;
      model.mono = panel.colors === 2;
      model.yellow = !!panel.yellow;   // yellow third colour: black text on it
      // WiFi page: the board shows its own WiFi; here what the server last heard from it
      model.wifi = { net: live ? (live.transport === "wifi" ? "sta" : live.net || "off") : "off", ssid: (live && (live.ssid || hexText(live.ssidHex))) || s.wifi.ssid,
        ip: live ? live.ip || "" : "", ap: s.wifi.apSsid || DEFAULT_AP_SSID,
        online: live && Number.isInteger(live.online) && live.online >= 0 ? Math.floor(live.online / 60) : -1 };   // black/white panel: highlighted used/total inverted instead of in colour
      // no fresh data for too long; in the simulator also a display that is not connected ("Connected" off)
      model.noData = (live ? !!live.noData : !!backend.offlineNoData) && autoOn(s, ARTS[1]);   // The Intermission: On cue / Ink off
      // a picture page: its time window, or (while there is data) its page in the page turn
      if (artPage && (timed || !model.noData)) model.art = artPage.kind;
      // The Afterhours in its time window with Caption: "Closed until" its end
      if (timed && timed.kind === "Q" && s.afterCap === 1) model.until = s.afterTo;
      // Got the time? (per picture, off by default): a wall clock with the time now, the time of the data
      // counted on; with Sync with display only as often as the panel redraws (black/white every minute,
      // colour panels every Refresh)
      model.wallArts = ARTS.filter(a => s[a.p + "Clock"] === 1).map(a => a.kind).join("");
      const wallNow = model.wallArts ? EPD.clockParts(dataStamp(state), state.updated ? Date.now() / 1000 - state.updated : 0) : null;
      if (wallNow) {
        const t = wallNow;
        if (mv) {
          const every = panel.colors === 2 ? 60000 : Math.max(180, s.refresh || 600) * 1000;
          if (!mv.wall || Date.now() - mv.wallAt >= every) { mv.wall = t; mv.wallAt = Date.now(); }
          model.wallTime = mv.wall;
        } else model.wallTime = t;
      }
      if (override) { model.timer = s.timer; model.ringDir = s.ringDir; model.icons = s.icons; model.pctBar = s.pctBar ? (s.barCap ? 2 : 1) : 0; }
      for (const k of ["N", "D", "Q"]) {
        const c = $(`scr-${id}-${k}`);
        if (!c || !c.offsetParent) continue;   // folded
        // The Conversation and The Intermission as their case shows them (with the caption), The Afterhours as itself
        const sm = { ...model, screens: 7, noData: k === "D", art: k === "Q" ? "Q" : "", until: k === "Q" && s.afterCap === 1 && s.afterSched === 1 ? s.afterTo : "",
          wallTime: wallNow };
        if (k !== "D") Object.assign(sm, { sys: null, nets: [], disks: [], diskPages: 0, wifiPage: 0, clock: null });
        const sfb = new EPD.Fb(w, h);
        EPD.drawScreen(sfb, sm);
        paint(c, sfb, w, h, panel.yellow);
      }
      if (live && live.splash && s.inkSplash !== 0) {   // the board's start screen, before the first data (simulator: "Start screen"; Advanced Ink)
        const [sw, sh] = panelSize(panel, 0), sfb = new EPD.Fb(sw, sh), board = boardOf(live);
        const pins = String(live.pins || "").split(",").map(Number);
        const net = live.transport === "wifi" ? "sta" : live.net || "off";
        EPD.drawSplash(sfb, { product: "InkSights", fw: live.fw || "1.0", id, board: board.name, panel: panel.name, color: panel.colors === 3,
          pinTitle: board.samd ? "Pins D" : "GPIO", pins: pins.length === 4 ? pins : [-1, -1, -1, -1],
          wifi: !board.wifi ? null : net === "sta" ? live.ip || "" : net === "ap" ? `AP ${s.wifi.apSsid || DEFAULT_AP_SSID} 192.168.4.1` : s.wifi.ssid ? "connecting ..." : "off",
          key: board.wifi && net === "ap" ? live.apKey || "" : null });
        paint(canvas, sfb, sw, sh, panel.yellow);
        $(`pg-${id}`).textContent = "Start screen";
        msg.textContent = "";
        msg.className = "note";
        return;
      }
      EPD.drawScreen(fb, model);
      paint(canvas, fb, w, h, panel.yellow);
      const what = [model.sys ? "system" : "", model.disks.length || (model.diskPages !== 0 && !model.sys && !model.wifiPage && !model.clock && !model.nets.length) ? `${model.disks.length} drives` : "",
        model.nets.length ? `${model.nets.length} network` : model.netPages ? "no interfaces" : "", model.wifiPage ? "WiFi" : "", model.clock ? "time" : ""].filter(Boolean).join(", ");
      // what the display shows: a picture in its time window, a case, a picture page, the pages
      const caseText = model.noData ? "The Intermission · no data"
        : nothing && !model.art ? `${(model.screens ?? 7) & 2 ? "The Conversation" : afterhours ? "InkSights" : "Top line only"} · nothing to ink` : "";
      $(`pg-${id}`).textContent = model.art && timed ? `${timed.title} · ${s[timed.p + "From"]} to ${s[timed.p + "To"]}`
        : caseText || `Page ${pages[id] + 1}/${pc} · ${model.art ? artPage.title : what}`;
      if (mv) $(`pg-${id}`).textContent = `Live · ${$(`pg-${id}`).textContent} · drawn ${hhmmss(mv.drawn)}`;
      msg.textContent = "";
      msg.className = "note";
    }

    // Largest whole-number scale at which the panel fits in landscape; the same scale when it is
    // turned, so an upright display looks exactly as big as the real one, only turned. Only 1x would
    // leave it much smaller than the room (2.13" in a narrow card on a screen at 100 %): fill the
    // room instead, a few display pixels then come out one screen pixel smaller
    function paint(canvas, fb, w, h, yellow = false) {   // yellow: third colour yellow instead of red
      const dpr = window.devicePixelRatio || 1;
      const room = canvas.closest(".shot").clientWidth - 28;   // inside the black frame (padding 14 px)
      const fit = Math.min(room, 520) * dpr / Math.max(w, h);   // 520: fits the fixed stage in every rotation
      const whole = Math.max(1, Math.floor(fit));
      EPD.blit(canvas, fb, whole === 1 && fit >= 1.25 ? fit : whole, yellow);
    }

    function drawAll() { displayList().forEach(e => { drawPreview(e); renderOrder(e); renderNetOrder(e); }); }

    // Disks of the display's types in its order (hidden ones included, so they can be ticked again)
    const orderedFor = s => EPD.orderDisks(state.disks || [], s);

    function renderOrder(entry) {
      const id = entry.id, box = $(`ord-${id}`);
      if (!box) return;
      const s = settingsFor(id), list = orderedFor(s), manual = s.sort === "manual", hidden = new Set(s.hidden);
      box.replaceChildren(...list.map((d, j) => el("li", { class: hidden.has(d.uid) ? "off" : "" },
        el("span", { class: "pos" }, String(j + 1)),
        el("input", { type: "checkbox", checked: !hidden.has(d.uid), "aria-label": `Show ${d.dev}`, onchange: e => {
          s.hidden = e.target.checked ? s.hidden.filter(u => u !== d.uid) : [...new Set([...s.hidden, d.uid])];
          changed(); drawPreview(entry); renderOrder(entry);
        } }),
        el("div", {}, el("span", { class: "dev" }, d.dev), " ", el("span", { class: "sub" }, `${d.pool || "not mounted"} · ${d.uid || "?"}`)),
        manual ? el("div", { class: "mv" },
          el("button", { class: "btn", type: "button", id: `mv-${id}-${j}-up`, "aria-label": `Move ${d.dev} up`, disabled: j === 0, onclick: () => move(entry, j, -1) }, "▲"),
          el("button", { class: "btn", type: "button", id: `mv-${id}-${j}-dn`, "aria-label": `Move ${d.dev} down`, disabled: j === list.length - 1, onclick: () => move(entry, j, 1) }, "▼"))
          : el("span"))));
    }

    function move(entry, j, dir) {
      const s = settingsFor(entry.id), uids = orderedFor(s).map(d => d.uid), t = j + dir;
      if (t < 0 || t >= uids.length) return;
      [uids[j], uids[t]] = [uids[t], uids[j]];
      s.order = uids;
      changed(); drawPreview(entry); renderOrder(entry);
      const same = $(`mv-${entry.id}-${t}-${dir < 0 ? "up" : "dn"}`);
      (same && !same.disabled ? same : $(`mv-${entry.id}-${t}-${dir < 0 ? "dn" : "up"}`))?.focus();
    }

    // Network interfaces of the network pages in their order (hidden ones included), like the disks
    const netsFor = s => EPD.orderNets((state.system && state.system.ifaces) || [], s);

    function renderNetOrder(entry) {
      const id = entry.id, box = $(`nord-${id}`);
      if (!box) return;
      const s = settingsFor(id), list = netsFor(s), manual = s.netSort === "manual", hidden = new Set(s.netHidden);
      const state_ = i => (i.state === "D" ? "down" : i.state === "L" ? "no link" : "");
      box.replaceChildren(...list.map((i, j) => el("li", { class: hidden.has(i.name) ? "off" : "" },
        el("span", { class: "pos" }, String(j + 1)),
        el("input", { type: "checkbox", checked: !hidden.has(i.name), "aria-label": `Show ${i.name}`, onchange: e => {
          s.netHidden = e.target.checked ? s.netHidden.filter(n => n !== i.name) : [...new Set([...s.netHidden, i.name])];
          changed(); drawPreview(entry); renderNetOrder(entry);
        } }),
        el("div", {}, el("span", { class: "dev" }, i.name), " ",
          el("span", { class: "sub" }, [i.wireless ? "wireless" : "wired", state_(i)].filter(Boolean).join(" · "))),
        manual ? el("div", { class: "mv" },
          el("button", { class: "btn", type: "button", id: `nmv-${id}-${j}-up`, "aria-label": `Move ${i.name} up`, disabled: j === 0, onclick: () => moveNet(entry, j, -1) }, "▲"),
          el("button", { class: "btn", type: "button", id: `nmv-${id}-${j}-dn`, "aria-label": `Move ${i.name} down`, disabled: j === list.length - 1, onclick: () => moveNet(entry, j, 1) }, "▼"))
          : el("span"))));
    }

    function moveNet(entry, j, dir) {
      const s = settingsFor(entry.id), names = netsFor(s).map(i => i.name), t = j + dir;
      if (t < 0 || t >= names.length) return;
      [names[j], names[t]] = [names[t], names[j]];
      s.netOrder = names;
      changed(); drawPreview(entry); renderNetOrder(entry);
      const same = $(`nmv-${entry.id}-${t}-${dir < 0 ? "up" : "dn"}`);
      (same && !same.disabled ? same : $(`nmv-${entry.id}-${t}-${dir < 0 ? "dn" : "up"}`))?.focus();
    }

    // ---------------------------------------------------------- cards
    function card(entry) {
      const { id, live } = entry;
      const s = settingsFor(id), board = boardOf(live), w = s.wifi;
      const redraw = () => { changed(); drawPreview(entry); renderOrder(entry); renderNetOrder(entry); };
      const radios = (name, options, current, onPick) => el("div", { class: "choices" }, ...options.map(([value, label]) =>
        el("label", { class: "check" },
          el("input", { type: "radio", name: `${name}-${id}`, value: String(value), checked: value === current, onchange: () => { onPick(value); redraw(); } }),
          label)));
      const field = (label, ...kids) => el("div", { class: "field" }, el("span", { class: "label" }, label), ...kids);
      const heading = el("h2", { id: `h-${id}` }, nameOf(id, s));
      const panel = panelOf(live, s);
      const [panelW] = panelSize(panel, 0);

      const warnNum = el("input", { type: "number", min: "1", max: "100", step: "1", value: String(s.warn || lastWarn[id] || DEFAULT_WARN), disabled: !s.warn,
        "aria-label": "Highlight from percent used", oninput: e => { s.warn = Number(e.target.value); redraw(); } });
      const warnOn = el("input", { type: "checkbox", checked: s.warn > 0, onchange: e => {
        if (e.target.checked) s.warn = Number(warnNum.value) || lastWarn[id] || DEFAULT_WARN;
        else { lastWarn[id] = s.warn || DEFAULT_WARN; s.warn = 0; }
        warnNum.disabled = !s.warn;
        redraw();
      } });
      const counts = typeCounts();
      const types = ALL_TYPES.map(t => el("label", { class: "check" },
        el("input", { type: "checkbox", checked: s.types.includes(t), onchange: e => {
          s.types = e.target.checked ? ALL_TYPES.filter(x => x === t || s.types.includes(x)) : s.types.filter(x => x !== t);
          redraw();
        } }),
        TYPE_LABEL[t], el("span", { class: "count", id: `count-${id}-${t}` }, `(${counts[t]})`)));

      // Rows per page: 6 only on the 4.2" (on the 2.13" the rows would be too low)
      const rowOptions = [[0, "Auto"], [2, "2"], [3, "3"], [4, "4"], [5, "5"], ...(panelW >= 360 ? [[6, "6"]] : [])];
      if (s.rows === 6 && panelW < 360) s.rows = 0;

      // Control pins: what is set here, else what the board reports, else the board's defaults
      const devPins = (/^(-?\d+),(-?\d+),(-?\d+),(-?\d+)$/.exec((live && live.pins) || "") || []).slice(1).map(Number);
      const shownPins = s.pins || (devPins.length === 4 ? devPins : board.defaults);
      const pinSelects = PIN_NAMES.map((label, n) => {
        const choices = [...board.pins, ...(n >= 2 ? [PIN_NONE] : [])];
        if (!choices.includes(shownPins[n])) choices.unshift(shownPins[n]);   // what the board reports, even if unusual
        const sel = el("select", { id: `pin-${id}-${n}`, "aria-label": `${label} pin`,
          onchange: () => { s.pins = PIN_NAMES.map((_, m) => Number($(`pin-${id}-${m}`).value)); changed(); } },
          ...choices.map(p => el("option", { value: String(p) }, pinLabel(board, p))));
        sel.value = String(shownPins[n]);
        return el("label", { class: "check", for: sel.id }, `${label} `, sel);
      });

      // Panel type: what is set here, else what the board reports; the board saves it and restarts.
      // Size, rows, preview and fast refresh follow it, so the card is built again.
      const panelSel = el("select", { "aria-label": "Panel type", onchange: e => { s.panel = Number(e.target.value); pages[id] = 0; changed(); render(true); } },
        ...panels.map(p => el("option", { value: String(p.id), selected: p.id === panel.id }, panelLabel(p))));
      // Refresh: the seconds (fast refresh) only on panels that can redraw fast without flashing
      // (black/white); a panel that cannot gets 1 minute instead
      if (!panel.fast && s.refresh < 60) { s.refresh = 60; s.fast = 0; }
      const refreshSel = el("select", { "aria-label": "Refresh", onchange: e => {
        s.refresh = Number(e.target.value); s.fast = s.refresh < 60 ? s.refresh : 0; redraw(); } },
        ...REFRESH.filter(([v]) => panel.fast || v >= 60).map(([v, l]) => el("option", { value: String(v), selected: v === s.refresh }, l)));
      // System page: network interface, "" = the one with the default route
      const sysInfo = state.system || {};
      const ifNames = (Array.isArray(sysInfo.ifaces) ? sysInfo.ifaces : []).map(i => i.name).filter(n => IFACE_RE.test(n || ""));
      if (s.net && !ifNames.includes(s.net)) ifNames.push(s.net);   // saved, but not seen at the last update
      const netSel = el("select", { "aria-label": "Network interface", disabled: !s.sys.includes("net"), onchange: e => { s.net = e.target.value; redraw(); } },
        el("option", { value: "", selected: !s.net }, sysInfo.defaultIface ? `Default · ${sysInfo.defaultIface}` : "Default"),
        ...ifNames.map(n => el("option", { value: n, selected: n === s.net }, n)));

      // ZFS cache on the system page: shown (grey part of the RAM bar) or hidden (counted as free)
      const zfsBox = el("div", { class: "field boxed" }, el("span", { class: "label" }, "ZFS RAM cache"),
        radios("zfs", [[1, "On"], [0, "Off"]], s.zfs, v => { s.zfs = v; }));
      const setDisabled = (box, off) => box.querySelectorAll("input").forEach(i => { i.disabled = off; });
      // 12 hours: AM / PM shown or not (Time card)
      const ampmBox = field("AM/PM", radios("ampm", [[1, "On"], [0, "Off"]], s.ampm, v => { s.ampm = v; }));
      setDisabled(ampmBox, !s.timeFmt);
      setDisabled(zfsBox, !s.sys.includes("ram"));
      // Asleep hard disks: "--" or "STBY" in the drive rows and the HDD row, one setting offered in
      // the Drives and the System card, so picking it in one card ticks it in the other
      const pickStby = v => {
        s.stby = v;
        document.querySelectorAll(`input[name="stbyd-${id}"], input[name="stbys-${id}"]`).forEach(i => { i.checked = Number(i.value) === v; });
      };
      const stbySys = el("div", { class: "field boxed" }, el("span", { class: "label" }, "HDD asleep"),
        radios("stbys", [[1, "STBY"], [0, "--"]], s.stby, pickStby));
      setDisabled(stbySys, !s.sys.includes("hdd"));
      // components as checkboxes, like the disk types; the drive counts in brackets
      const sysChecks = SYS_PARTS.map(([p, label]) => el("label", { class: "check" },
        el("input", { type: "checkbox", checked: s.sys.includes(p), onchange: e => {
          s.sys = SYS_PARTS.map(([q]) => q).filter(q => (q === p ? e.target.checked : s.sys.includes(q)));
          netSel.disabled = !s.sys.includes("net");
          setDisabled(zfsBox, !s.sys.includes("ram"));
          setDisabled(stbySys, !s.sys.includes("hdd"));
          pages[id] = 0;
          redraw();
        } }),
        label, ...(p === "nvme" || p === "ssd" || p === "hdd" ? [el("span", { class: "count", id: `scount-${id}-${p}` }, `(${counts[p]})`)] : [])));

      const pageTurn = el("input", { type: "text", inputmode: "numeric", maxlength: "8", value: fmtHms(Math.max(0, s.page)),
        placeholder: "00:10:00", autocomplete: "off", style: "max-width: 7em; font-family: var(--font-mono)",
        "aria-label": "Auto page turn (HH:MM:SS)", oninput: e => { s.page = parseHms(e.target.value); redraw(); } });

      const redrawNow = live ? [el("button", { class: "btn small redraw", type: "button", onclick: async () => {
        try {
          await backend.redraw(id);
          if (mirror[id]) mirror[id].force = true;
          setMsg(`${nameOf(id, s)}: redraws within a minute (takes about 15 seconds).`, "ok");
        } catch (e) { setMsg(e.message, "warn"); }
      } }, "Redraw now")] : [];
      // Update firmware (OTA): only when it fits and is not running already
      const ota = otaCheck(live, board), otaBusy = live && live.ota && (live.ota.state === "pending" || live.ota.state === "loading");
      if (versionCheck && backend.ota && otaOn && s.ota !== 0 && ota.ok && !otaBusy)
        redrawNow.push(el("button", { class: "btn small redraw", type: "button", onclick: () => startOta(id, s, ota.fw) }, "Update firmware"));
      // a display that is not connected (any more): forget it and its settings (with Save); when it comes
      // back it shows up again with the settings of a new display (Advanced Ink, user)
      const remove = live ? [] : [el("div", { class: "field boxed" }, el("span", { class: "label" }, "Remove"),
        el("div", { class: "choices" }, el("button", { class: "btn", type: "button",
          onclick: () => { delete config[id]; changed(); render(true); } }, "Remove display")))];

      const via = live && live.transport === "wifi" ? "WiFi" : "USB";
      const meta = live
        ? [`ID ${id}`, live.transport === "wifi" ? `WiFi ${live.ip || ""}`.trim() : live.port, board.name,
          live.fw ? el("span", { class: fwOff(live.fw) ? "warn" : "" }, `Firmware ${live.fw}`) : "", live.answer ? `Answer: ${live.answer}` : "no answer to the last frame"]
        : [`ID ${id}`, "not connected at the last update"];

      // WiFi (boards with WiFi): sent to the display over USB; passwords are never shown again
      const wifiInput = (key, label, attrs = {}) => el("label", { class: "field" },
        el("span", { class: "label" }, label),
        el("input", { type: "text", autocomplete: "off", value: w[key] || "", ...attrs,
          oninput: e => { w[key] = e.target.value; changed(); } }));
      const wifiState = !live ? "Not connected at the last update"
        : live.transport === "wifi" || live.net === "sta" ? `Connected · ${live.ip || ""}`.replace(/ · $/, "")
        : live.net === "ap" ? `Setup access point open · ${w.apSsid || DEFAULT_AP_SSID}`
        : "No WiFi connection";
      // Own cards below the display card, foldable: "<title> · <display name>"
      const titles = [];
      // show: setting key of a checkbox at the top right that switches the whole page on or off
      const subCard = (key, title, openByDefault, show, ...content) => {
        const t = el("span", {}, nameOf(id, s));
        titles.push(t);
        const card = el("article", { class: `card sub-card${show && !s[show] ? " off" : ""}`, "aria-label": `${title} of display ${id}` },
          el("details", { class: "fold", open: pref(id, key, openByDefault), ontoggle: e => {
            // (also fired when a card is built open: then nothing changed)
            const opened = e.target.open && !pref(id, key, openByDefault);
            setPref(id, key, e.target.open);
            if (e.target.open && card.querySelector(".shot.mini")) drawPreview(entry);
            // Advanced Ink, Auto collapse: opening a card folds the other open cards of this display
            if (opened && pref(id, "autoFold", 1)) for (const d of card.parentElement?.querySelectorAll(".sub-card > details.fold[open]") || [])
              if (d !== e.target) d.open = false;
          } },
            el("summary", {}, `${title} · `, t), el("div", { class: "sub-body" }, ...content)));
        if (show) card.append(el("label", { class: "check page-toggle" },
          el("input", { type: "checkbox", checked: !!s[show], "aria-label": `Show the ${title.toLowerCase()} on the display`, onchange: e => {
            s[show] = e.target.checked ? 1 : 0;
            card.classList.toggle("off", !s[show]);
            pages[id] = 0;
            redraw();
          } }), "Ink"));
        return card;
      };
      // Ink: the WiFi page on the display (network and address); the WiFi settings apply either way
      const wifiCard = board.wifi ? subCard("wifiOpen", "WiFi", false, "showWifi",
        el("p", { class: "note" }, wifiState),
        // framed: the WiFi network, the setup access point, then the symbols of the WiFi page
        el("form", { class: "wifi-form", autocomplete: "off", onsubmit: e => e.preventDefault() },   // a form, so browsers handle the password fields properly
          // four frames, two by two (user): the names and passwords on the left (WiFi network, then the
          // access point), on the right what is changed rarely (settings page and host name, the setup
          // access point and its delay)
          el("div", { class: "wifi-grid" },
            el("div", { class: "wifi-box boxed" },
              wifiInput("ssid", "WiFi network", { maxlength: "32" }),
              wifiInput("pass", "Password", { type: "password", maxlength: "63", value: "", placeholder: w.passSet ? "unchanged" : "" })),
            el("div", { class: "wifi-box boxed" },
              wifiInput("server", "Settings page", { maxlength: "120", placeholder: backend.serverAddress || "http://hostname:8099" }),
              wifiInput("host", "Host name", { maxlength: "32", placeholder: `inksights-${id.toLowerCase()}` })),
            el("div", { class: "wifi-box boxed" },
              wifiInput("apSsid", "Access point name", { maxlength: "32", placeholder: DEFAULT_AP_SSID }),
              wifiInput("apPass", "Access point password", { type: "password", maxlength: "63", value: "", placeholder: w.apPassSet ? "unchanged" : DEFAULT_AP_PASS })),
            el("div", { class: "wifi-box boxed" },
              field("Setup access point", radios("apon", [[true, "On"], [false, "Off"]], w.apOn, v => { w.apOn = v; })),
              el("label", { class: "field" }, el("span", { class: "label" }, "Failover access point after (s)"),
                el("input", { type: "number", min: "0", max: String(MAX_AP_DELAY), step: "1", value: String(w.apDelay),
                  style: "max-width: 7em", oninput: e => {
                    w.apDelay = /^\d{1,4}$/.test(e.target.value) ? Number(e.target.value) : NaN; changed(); } }))))),
        // the symbols of the WiFi page, at the end (user)
        el("div", { class: "field boxed" },
          field("Icons", radios("wifiicons", [[1, "On"], [0, "Off"]], s.wifiIcons, v => { s.wifiIcons = v; })))) : null;

      // details in the bar: percentage or used capacity (only while "Details in bar" is on)
      // decimals of the percentage (only while the percentage stands in the bar)
      const decBox = field("Percentage", radios("pctdec", [[0, "35%"], [1, "35.4%"], [2, "35.47%"]], s.pctDec, v => { s.pctDec = v; }));
      const capBox = field("Details", radios("barcap", [[1, "Capacity"], [0, "Percentage"]], s.barCap, v => { s.barCap = v; setDisabled(decBox, !s.pctBar || v); }));
      setDisabled(capBox, !s.pctBar);
      setDisabled(decBox, !s.pctBar || s.barCap);
      const stbyBox = field("Asleep", radios("stbyd", [[1, "STBY"], [0, "--"]], s.stby, pickStby));
      stbyBox.classList.add("boxed");
      setDisabled(stbyBox, !s.driveTemp);
      // Drives: drive types, the frames of a drive row, color highlight, then the order and visibility of the drives
      const disksCard = subCard("disksOpen", "Drives", true, "showDisks",
        el("fieldset", { class: `set-${id}` },
          el("div", { class: "field boxed" }, el("span", { class: "label" }, "Drive types"), el("div", { class: "choices" }, ...types))),
        // framed and sorted like a drive row from left to right (user): the symbol | the temperature with
        // the asleep text, the details in the bar | the spindown timer at its right end
        el("div", { class: "form" },
          // in one row, each in its own frame (user): Icons | Temperature | Asleep
          el("div", { class: "wide trio" },
            el("div", { class: "field boxed" }, el("span", { class: "label" }, "Icons"),
              radios("icons", [[1, "On"], [0, "Off"]], s.icons, v => { s.icons = v; })),
            el("div", { class: "field boxed" }, el("span", { class: "label" }, "Temperature"),
              radios("drivetemp", [[1, "On"], [0, "Off"]], s.driveTemp, v => { s.driveTemp = v; setDisabled(stbyBox, !v); })),
            stbyBox),
          el("div", { class: "box-stack boxed" },
            field("Details in bar", radios("pctbar", [[1, "On"], [0, "Off"]], s.pctBar, v => { s.pctBar = v; setDisabled(capBox, !v); setDisabled(decBox, !v || s.barCap); })),
            capBox,
            decBox),
          el("div", { class: "box-stack boxed" },
            el("fieldset", { class: `set-${id}` },
              field("Spindown timer", radios("boxes", [[10, "On"], [0, "Off"]], s.boxes ? 10 : 0, v => { s.boxes = v; }))),
            field("Timer style", radios("timer", [[1, "Ring"], [0, "Badge"]], s.timer, v => { s.timer = v; })),   // a new display: Ring (user)
            field("Ring direction", radios("ringdir", [[1, "Counterclockwise"], [0, "Clockwise"]], s.ringDir, v => { s.ringDir = v; })))),
        el("fieldset", { class: `set-${id}` },
          el("div", { class: "field boxed" },
            el("span", { class: "label" }, "Color highlight"),
            el("div", { class: "choices" },
              el("label", { class: "check" }, warnOn, "Highlight from"),
              el("label", { class: "check" }, warnNum, "% used")))),
        el("fieldset", { class: `set-${id}` },
          el("details", { class: "fold boxed field", open: pref(id, "orderOpen", true), ontoggle: e => setPref(id, "orderOpen", e.target.open) },
            el("summary", {}, "Order and visibility by"),
            radios("sort", SORTS, s.sort, v => {
              // start the custom order from the order shown right now
              if (v === "manual" && !s.order.length) s.order = orderedFor(s).map(d => d.uid);
              s.sort = v;
            }),
            el("ol", { class: "order", id: `ord-${id}`, "aria-label": `Drive order of display ${id}` }))));

      // Network: pages with one row per interface (after the disk pages); symbols, details in the
      // bar (percentage of the link or the link speed), then the order and visibility of the interfaces
      let netKind = s.netBar || 1;
      const netKindBox = field("Details", radios("netbarkind", [[1, "Percentage"], [2, "Link speed"]], netKind, v => {
        netKind = v;
        if (s.netBar) s.netBar = v;
      }));
      netKindBox.classList.add("boxed");
      setDisabled(netKindBox, !s.netBar);
      // framed: the symbols, the details in the bar, the order
      const netCard = subCard("netOpen", "Network", true, "showNet",
        // each in its own frame, in one row (user): Icons | Details in bar | Details
        el("div", { class: "form" },
          el("div", { class: "wide trio" },
            el("div", { class: "field boxed" }, el("span", { class: "label" }, "Icons"),
              radios("neticons", [[1, "On"], [0, "Off"]], s.netIcons, v => { s.netIcons = v; })),
            el("div", { class: "field boxed" }, el("span", { class: "label" }, "Details in bar"),
              radios("netbar", [[1, "On"], [0, "Off"]], s.netBar ? 1 : 0, v => { s.netBar = v ? netKind : 0; setDisabled(netKindBox, !v); })),
            netKindBox)),
        el("fieldset", { class: `set-${id}` },
          el("details", { class: "fold boxed field", open: pref(id, "netOrderOpen", true), ontoggle: e => setPref(id, "netOrderOpen", e.target.open) },
            el("summary", {}, "Order and visibility by"),
            radios("netsort", [["name", "Name"], ["manual", "Custom"]], s.netSort, v => {
              // start the custom order from the order shown right now
              if (v === "manual" && !s.netOrder.length) s.netOrder = netsFor({ ...s, netSort: "name" }).map(i => i.name);
              s.netSort = v;
            }),
            el("ol", { class: "order", id: `nord-${id}`, "aria-label": `Network interface order of display ${id}` }))));

      // System page: components, network interface, ZFS cache
      // framed: the components, the settings of single rows, the symbols
      const sysCard = subCard("sysOpen", "System", true, "showSys",
        el("fieldset", { class: `set-${id}` },
          el("div", { class: "form" },
            el("div", { class: "field wide boxed" }, el("span", { class: "label" }, "Components"),
              el("div", { class: "choices" }, ...sysChecks)),
            // each in its own frame, two by two (user): Icons | ZFS RAM cache, Network | HDD asleep
            el("div", { class: "field boxed" }, el("span", { class: "label" }, "Icons"),
              radios("sysicons", [[1, "On"], [0, "Off"]], s.sysIcons, v => { s.sysIcons = v; })),
            zfsBox,
            el("label", { class: "field boxed" }, el("span", { class: "label" }, "Network"), netSel),
            stbySys)));

      // Header: what stands left, in the middle and right (s.layout, a lower-case letter = that place
      // highlighted). Picking what already stands in another place swaps the two, so nothing can
      // appear twice; None leaves the place empty. Highlight belongs to the place.
      const places = ["Left", "Middle", "Right"];
      const layoutSel = places.map((place, i) => el("select", { "aria-label": `Header ${place.toLowerCase()}`, onchange: e => {
        const v = e.target.value, a = [...s.layout.toUpperCase()], lit = [...s.layout].map(c => c !== c.toUpperCase()), j = a.indexOf(v);
        if (v !== "-" && j >= 0 && j !== i) a[j] = a[i];
        a[i] = v;
        s.layout = a.map((c, k) => (lit[k] ? c.toLowerCase() : c)).join("");
        syncLayout();
        redraw();
      } }, ...[["T", "Title"], ["P", "Pages"], ["U", "Uptime"], ["C", "Time"], ["-", "None"]].map(([v, l]) => el("option", { value: v }, l))));
      const litBox = places.map((place, i) => el("input", { type: "checkbox", "aria-label": `Highlight the header ${place.toLowerCase()}`, onchange: e => {
        const a = [...s.layout];
        a[i] = e.target.checked ? a[i].toLowerCase() : a[i].toUpperCase();
        s.layout = a.join("");
        redraw();
      } }));
      const syncLayout = () => places.forEach((_, i) => {
        const c = s.layout[i];
        layoutSel[i].value = c.toUpperCase();
        litBox[i].checked = c !== "-" && c !== c.toUpperCase();
        litBox[i].disabled = c === "-" || (s.headFill === 1 && s.headInv === 1 && s.headCol === 1 && panel.colors !== 2);   // Fill gaps: every place is drawn highlighted
      });
      syncLayout();
      // inverted header: the highlighted places in the third colour (only panels with one)
      const colBox = field("Color highlight", radios("headcol", [[1, "On"], [0, "Off"]], s.headCol, v => { s.headCol = v; fillOk(); }));
      colBox.classList.add("boxed");
      setDisabled(colBox, !s.headInv || panel.colors === 2);
      // Fill gaps: the whole header in the third colour; only then something new (on black/white it
      // would be the same as switching Invert colors), so only with Invert colors and Highlight color
      // on a colour panel
      const fillBox = field("Fill gaps", radios("headfill", [[1, "On"], [0, "Off"]], s.headFill, v => { s.headFill = v; syncLayout(); }));
      fillBox.classList.add("boxed");
      const fillOk = () => { setDisabled(fillBox, !(s.headInv === 1 && s.headCol === 1 && panel.colors !== 2)); syncLayout(); };
      fillOk();
      // the divider line at the bottom of the header (black header: its edge under the boxes)
      const botBox = el("div", { class: "field boxed" }, el("span", { class: "label" }, "Divider line"),
        radios("linebottom", [[1, "On"], [0, "Off"]], s.lineBottom, v => { s.lineBottom = v; }));
      const headerCard = subCard("headerOpen", "Header", true, "showHeader",
        el("fieldset", { class: `set-${id}` },
          // framed sections: Title, colors, Divider line, positions
          el("div", { class: "form" },
            el("label", { class: "field wide boxed" },
              el("span", { class: "label" }, "Title"),
              el("input", { type: "text", maxlength: "12", value: s.name, placeholder: DEFAULT_TITLE, autocomplete: "off", style: "max-width: 10em",
                oninput: e => { s.name = e.target.value; setHeading(); redraw(); } })),
            // the places Left, Middle, Right with their Highlight ticks, right below Title, each in its own
            // frame, three equal ones over the whole width (user)
            el("div", { class: "wide trio" }, ...places.map((place, i) => el("div", { class: "field boxed" },
              el("span", { class: "label" }, place), layoutSel[i],
              el("label", { class: "check" }, litBox[i], "Highlight")))),
            // each in its own frame (user): Invert colors | Color highlight, Divider line | Fill gaps
            el("div", { class: "field boxed" }, el("span", { class: "label" }, "Invert colors"),
              radios("headinv", [[1, "On"], [0, "Off"]], s.headInv, v => {
                s.headInv = v; setDisabled(colBox, !v || panel.colors === 2); fillOk(); })),
            colBox,
            botBox,
            fillBox)));

      const setHeading = () => { heading.textContent = nameOf(id, s); titles.forEach(t => { t.textContent = heading.textContent; }); };
      const main = el("article", { class: "card", "aria-labelledby": `h-${id}` },
        el("div", { class: "card-head" }, heading,
          el("span", { class: `pill ${live ? "on" : ""}` }, live ? "connected" : "not connected"),
          el("span", { class: "pill size", id: `size-${id}` }),
          ...redrawNow),
        el("div", { class: "shot" },
          el("div", { class: "glass" }, el("canvas", { id: `cv-${id}`, role: "img", "aria-label": `Preview of display ${id}` })),
          el("div", { class: "pager", id: `pager-${id}` },
            el("button", { class: "btn small", type: "button", "aria-label": "Previous page", onclick: () => { pages[id] = (pages[id] || 0) - 1; drawPreview(entry); } }, "‹"),
            el("span", { id: `pg-${id}` }),
            el("button", { class: "btn small", type: "button", "aria-label": "Next page", onclick: () => { pages[id] = (pages[id] || 0) + 1; drawPreview(entry); } }, "›"))),
        el("p", { class: "note", id: `msg-${id}`, role: "status" }),
        el("div", { class: "meta" }, ...meta.filter(Boolean).map(t => (typeof t === "string" ? el("span", {}, t) : t))));
      // Display: names, panel, rotation, rows, page turn, pins and the frame (the ID line stays in the display card)
      const displayCard = subCard("displayOpen", "Display", true, null,
        el("div", { class: "form" },
          // display name (card heading) and the instance name (page header, same for all cards), each framed
          el("label", { class: "field boxed" },
            el("span", { class: "label" }, "Display name"),
            el("input", { type: "text", maxlength: "32", value: s.dname, placeholder: `Display ${id}`, autocomplete: "off", style: "max-width: 14em",
              oninput: e => { s.dname = e.target.value; setHeading(); changed(); } })),
          el("label", { class: "field boxed" },
            el("span", { class: "label" }, "Instance name"),
            el("input", { type: "text", class: "pagename", maxlength: "32", value: pageName, placeholder: defaultPageName, autocomplete: "off", style: "max-width: 14em",
              oninput: e => { pageName = e.target.value; applyPageName(); syncPageName(e.target); changed(); } })),
          // each in its own frame (user): Panel over the full width, Rotation | Rows per page, Refresh | Auto
          // page turn, Preview over the full width
          el("div", { class: "field wide boxed" }, el("span", { class: "label" }, "Panel"),
            el("div", { class: "choices panel-pick" }, panelSel, el("span", { class: "ro" }, live ? board.name : "not connected"))),
          el("div", { class: "field boxed" }, el("span", { class: "label" }, "Rotation"),
            radios("rot", [[0, "0°"], [90, "90°"], [180, "180°"], [270, "270°"]], s.rot, v => { s.rot = v; })),
          el("fieldset", { class: `set-${id}` },
            el("div", { class: "field boxed" }, el("span", { class: "label" }, "Rows per page"),
              el("div", { class: "oneline" }, radios("rows", rowOptions, s.rows, v => { s.rows = v; pages[id] = 0; }))),
            el("div", { class: "field boxed" }, el("span", { class: "label" }, "Refresh"), refreshSel),
            // the only hint text on the page
            el("div", { class: "field boxed" }, el("span", { class: "label" }, "Auto page turn (HH:MM:SS)"),
              el("div", { class: "choices", style: "flex-wrap: nowrap; gap: 8px" }, pageTurn,
                el("span", { class: "count", style: "white-space: nowrap" }, "00:00:00 = off")))),
          // Sync with display: the preview shows what the panel shows (this browser, no need to save)
          el("div", { class: "field wide boxed" }, el("span", { class: "label" }, "Preview"),
            el("div", { class: "choices" }, el("label", { class: "check" },
              el("input", { type: "checkbox", checked: mirrorOn(id), onchange: e => { setPref(id, "mirror", e.target.checked ? 1 : 0); delete mirror[id]; drawPreview(entry); } }),
              "Sync with display"))),
          el("div", { class: "field wide boxed" },
            el("span", { class: "label" }, "Display pins"),
            el("div", { class: "choices pins" }, ...pinSelects)),
          ));
      // the frame the display gets (over USB or WiFi): at the end of the Advanced Ink card (user)
      const frameFold = el("details", { class: "fold boxed" },
        el("summary", {}, `Frame (data received via ${via})`),
        el("pre", { id: `frame-${id}` }));
      if (wifiCard) wifiCard.classList.add("keep-on");   // its settings are not dimmed when the page is off
      // Time: a page with the time in big, below it weekday and date (each when ticked); the system
      // time of the server, counted on by the board, or (boards with WiFi) NTP in a time zone.
      // The header always shows the system time.
      const ntpOk = board.wifi;
      const dateSel = el("select", { "aria-label": "Date format", disabled: !s.timeDate, onchange: e => { s.dateFmt = Number(e.target.value); redraw(); } },
        ...DATE_FORMATS.map(([v, l]) => el("option", { value: String(v), selected: v === s.dateFmt }, l)));
      // NTP server: typed in, or picked from a list that always shows every server (a datalist
      // would only show the ones matching what is in the field)
      const ntpList = el("ul", { class: "combo-list", role: "listbox", "aria-label": "NTP servers", hidden: true });
      let ntpActive = -1;
      const ntpMark = () => [...ntpList.children].forEach((li, i) => {
        li.classList.toggle("on", i === ntpActive);
        li.setAttribute("aria-selected", li.textContent === ntpIn.value.trim() ? "true" : "false");
      });
      const ntpOpen = () => { if (ntpIn.disabled) return; ntpList.hidden = false; ntpActive = NTP_SERVERS.indexOf(ntpIn.value.trim()); ntpMark(); };
      const ntpPick = n => { ntpIn.value = n; s.ntpServer = n; ntpList.hidden = true; changed(); };
      const ntpIn = el("input", { type: "text", maxlength: "40", value: s.ntpServer, autocomplete: "off", role: "combobox", "aria-expanded": "false",
        "aria-label": "NTP server", disabled: !(ntpOk && s.ntp), oninput: e => { s.ntpServer = e.target.value.trim(); ntpMark(); changed(); },
        onfocus: ntpOpen, onclick: ntpOpen, onblur: () => { ntpList.hidden = true; },
        onkeydown: e => {
          if (e.key === "Escape") { ntpList.hidden = true; return; }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (ntpList.hidden) { ntpOpen(); return; }
            const n = NTP_SERVERS.length;
            ntpActive = e.key === "ArrowDown" ? (ntpActive + 1) % n : (ntpActive + n - 1) % n;
            ntpMark();
          } else if (e.key === "Enter" && !ntpList.hidden && ntpActive >= 0) { e.preventDefault(); ntpPick(NTP_SERVERS[ntpActive]); }
        } });
      ntpList.append(...NTP_SERVERS.map(n => el("li", { role: "option", onmousedown: e => { e.preventDefault(); ntpPick(n); } }, n)));
      new MutationObserver(() => ntpIn.setAttribute("aria-expanded", String(!ntpList.hidden))).observe(ntpList, { attributes: true, attributeFilter: ["hidden"] });
      const tzSel = el("select", { "aria-label": "Time zone", disabled: !(ntpOk && s.ntp), onchange: e => {
        s.tz = e.target.value; s.tzPosix = ZONES.find(([n]) => n === s.tz)[1]; redraw(); } },
        ...ZONES.map(([n]) => el("option", { value: n, selected: n === s.tz }, n.replace(/_/g, " "))));
      const ntpBox = field("NTP", radios("ntp", [[1, "On"], [0, "Off"]], s.ntp, v => { s.ntp = v; ntpIn.disabled = tzSel.disabled = !v; ntpList.hidden = true; }));
      if (!ntpOk) setDisabled(ntpBox, true);   // no WiFi: always the system time
      const colorPanel = panel.colors !== 2;
      const timeFrameTick = el("input", { type: "checkbox", checked: s.timeFrame === 1, disabled: !colorPanel || s.timeColor !== 1,
        onchange: e => { s.timeFrame = e.target.checked ? 1 : 0; redraw(); } });
      const timeColTick = el("input", { type: "checkbox", checked: s.timeColor === 1, disabled: !colorPanel,
        onchange: e => { s.timeColor = e.target.checked ? 1 : 0; timeFrameTick.disabled = !s.timeColor; redraw(); } });
      const timeCard = subCard("timeOpen", "Time", false, "showTime",
        // framed sections: Time format (12 or 24 hours: the time in the header, on the time page and in
        // "Closed until"; so it stays usable with the time page off, keep-on), Time zone and Date format
        // side by side with Show below (what the page shows), and NTP with its server
        el("div", { class: "form" },
          el("div", { class: "field wide boxed keep-on" }, el("div", { class: "choices header-sec" },
            field("Time format", radios("timefmt", [[0, "24h"], [1, "12h"]], s.timeFmt, v => { s.timeFmt = v; setDisabled(ampmBox, !v); })),
            ampmBox)),
          el("div", { class: "field wide boxed" },
            el("div", { class: "choices header-sec" },
              el("label", { class: "field" }, el("span", { class: "label" }, "Time zone"), tzSel),
              el("div", { class: "field" }, el("span", { class: "label" }, "Date format"), dateSel)),
            el("span", { class: "label", style: "margin-top: 4px" }, "Show"),
            el("div", { class: "choices" },
              el("label", { class: "check" }, el("input", { type: "checkbox", checked: !!s.timeDate, onchange: e => {
                s.timeDate = e.target.checked ? 1 : 0; dateSel.disabled = !s.timeDate; redraw(); } }), "Date"),
              el("label", { class: "check" }, el("input", { type: "checkbox", checked: !!s.timeWday, onchange: e => {
                s.timeWday = e.target.checked ? 1 : 0; redraw(); } }), "Weekday"),
              // the time page with or without the header line (the other pages keep theirs)
              el("label", { class: "check" }, el("input", { type: "checkbox", checked: s.timeHead === 1, onchange: e => {
                s.timeHead = e.target.checked ? 1 : 0; justTime(); redraw(); } }), "Header"))),
          el("div", { class: "field wide boxed" },
            el("div", { class: "choices header-sec" },
              ntpBox,
              el("label", { class: "field" }, el("span", { class: "label" }, "NTP server"), el("div", { class: "combo" }, ntpIn, ntpList)))),
          // colour panels: the time in the third colour (the date stays black), with a black outline;
          // Just give me time: only the time page on the display, the other page cards are hidden (their
          // settings stay)
          el("div", { class: "field wide boxed" },
            el("div", { class: "choices" },
              el("label", { class: "check" }, timeColTick, "Color highlight"),
              el("label", { class: "check" }, timeFrameTick, "Time frame"),
              el("label", { class: "check" },
                el("input", { type: "checkbox", checked: s.justTime === 1, onchange: e => { s.justTime = e.target.checked ? 1 : 0; justTime(); pages[id] = 0; redraw(); } }),
                "Just give me time")))));
      // the screens with a picture, each a card named after it, inside the screen as this display would
      // show it. Ink: the picture is used at all. On cue: its case, The Conversation = "Nothing to
      // ink" (every page off), The Intermission = "Check connection" (no data); Header: the header line
      // above the picture; Scheduled: from..to only this picture (the windows of the three must not
      // overlap; it comes before the case); Turn candidate: the picture as a page after the others.
      // (saved in inksights.conf columns 62-66, sent in the A line)
      const screenCard = a => {
        const artTick = (key, label, then) => el("label", { class: "check" },
          el("input", { type: "checkbox", checked: s[key] !== 0, disabled: key === a.p + "Cap" && capOff(),
            onchange: e => { s[key] = e.target.checked ? 1 : 0; if (then) then(); pages[id] = 0; redraw(); } }), label);
        // Caption only with its case (On cue), The Afterhours only with its time window (Scheduled)
        const capOff = () => a.auto ? s[a.auto] === 0 : s[a.p + "Sched"] !== 1;
        const capTick = artTick(a.p + "Cap", "Caption"), capSync = () => { capTick.querySelector("input").disabled = capOff(); };
        const times = ["From", "To"].map(k => el("input", { type: "time", value: s[a.p + k], required: true, disabled: s[a.p + "Sched"] !== 1, "aria-label": `${a.title} ${k.toLowerCase()}`,
          onchange: e => { if (HHMM_RE.test(e.target.value)) { s[a.p + k] = e.target.value; redraw(); } } }));
        return subCard(a.p + "Open", a.title, false, inkKey(a),
          ...(afterhours ? [el("div", { class: "form" },
            el("div", { class: "field wide boxed" },
              // the order (user): Turn candidate, Header, Caption, Got the time? (a wall clock), On cue
              el("div", { class: "choices" }, artTick(a.p + "Rot", "Turn candidate"), artTick(a.p + "Head", "Header"), capTick,
                artTick(a.p + "Clock", "Got the time?"),
                ...(a.auto ? [artTick(a.auto, "On cue", capSync)] : []))),
            el("div", { class: "field wide boxed" },
              el("div", { class: "choices" }, artTick(a.p + "Sched", "Scheduled", () => { times.forEach(t => { t.disabled = s[a.p + "Sched"] !== 1; }); capSync(); }),
                field("From", times[0]), field("To", times[1]))))] : []),
          el("div", { class: "shot mini" }, el("div", { class: "glass" },
            el("canvas", { id: `scr-${id}-${a.kind}`, role: "img", "aria-label": `${a.title} on display ${id}` }))));
      };
      const screenCards = artsShown().map(screenCard);
      // Advanced Ink: the start screen shown at power-up or never (the board keeps the setting for the
      // next power-up)
      const screenTick = (key, label) => el("label", { class: "check" },
        el("input", { type: "checkbox", checked: s[key] !== 0, onchange: e => { s[key] = e.target.checked ? 1 : 0; redraw(); } }), label);
      // and the backup: the settings of this display as a JSON file, and back (also from another board)
      const advCard = subCard("advOpen", "Advanced Ink", false, null,
        el("div", { class: "form" },
          // in one row, each in its own frame (user): Screens | Bar behaviour | Pictures
          el("div", { class: "wide trio" },
            el("div", { class: "field boxed" }, el("span", { class: "label" }, "Screens"),
              el("div", { class: "choices" }, screenTick("inkSplash", "Start screen"))),
            // remembered in this browser, like which cards are folded (no need to save)
            el("div", { class: "field boxed" }, el("span", { class: "label" }, "Bar behaviour"),
              el("div", { class: "choices" }, el("label", { class: "check" },
                el("input", { type: "checkbox", checked: !!pref(id, "autoFold", 1), onchange: e => setPref(id, "autoFold", e.target.checked ? 1 : 0) }), "Auto collapse"))),
            // what stands on the table of The Conversation, The Intermission and The Afterhours: the bottle
            // and the glass, a coffee cup (the default) or nothing (inksights.conf column 66)
            el("div", { class: "field boxed" }, el("span", { class: "label" }, "Beverages"),
              radios("drink", [[0, "House Wine"], [2, "Roast"], [1, "Tabula Rasa"]], s.sober, v => { s.sober = v; }))),
          // OTA Update: the check whether the firmware of the WebUI fits this board, the button, the progress
          // switched off in the Docker settings (OTA=off): only that, nothing to click
          ...(versionCheck && backend.ota && !otaOn ? [el("div", { class: "field wide boxed" }, el("span", { class: "label" }, "OTA Update"),
            el("p", { class: "about-text" }, "Switched off on the server."))] : []),
          // OTA of this display: Off = no firmware updates from this page (saved, behind the login)
          ...(versionCheck && backend.ota && otaOn && s.ota === 0 ? [el("div", { class: "field wide boxed" }, el("span", { class: "label" }, "OTA Update"),
            radios("ota", [[1, "On"], [0, "Off"]], 0, v => { s.ota = v; render(true); }))] : []),
          ...(versionCheck && backend.ota && otaOn && s.ota !== 0 ? [el("div", { class: "field wide boxed" }, el("span", { class: "label" }, "OTA Update"),
            radios("ota", [[1, "On"], [0, "Off"]], 1, v => { s.ota = v; render(true); }),
            // the first line (Firmware up to date. / New firmware available!) right of the button (user), the rest below
            ...((ol => [el("div", { class: "choices" },
              el("button", { class: "btn", type: "button", disabled: !ota.ok || otaBusy, onclick: () => startOta(id, s, ota.fw) }, "Update firmware"), ol[0],
              // a firmware that fits: what the click does (user)
              ...(ota.ok && !otaBusy ? [el("span", { class: "ota-note plain" }, "Click initiates the update.")] : [])), ...ol.slice(1)])(otaLines(live, ota))),
            ...(otaText(live && live.ota) ? [el("p", { class: `about-text${live.ota.state === "failed" ? " warn" : ""}` }, otaText(live.ota))] : []),
            // manual update: a firmware file from this computer, checked here before it is uploaded
            ...(backend.otaFile ? [el("span", { class: "label" }, "Manual update"),
              el("div", { class: "choices" },
                el("button", { class: "btn", type: "button", disabled: otaBusy || !board.wifi, onclick: () => $(`otafile-${id}`).click() }, "Choose file"),
                el("button", { class: "btn", type: "button", disabled: !(otaFiles[id] && otaFiles[id].ok) || otaBusy, onclick: () => uploadOta(id, s) }, "Upload"),
                // a file that fits: what the click does (user)
                ...(otaFiles[id] && otaFiles[id].ok && !otaBusy ? [el("span", { class: "ota-note" }, "Upload flashes it, the board restarts.")] : []),
                el("input", { type: "file", id: `otafile-${id}`, accept: ".bin,application/octet-stream", hidden: true, onchange: e => pickOtaFile(id, e.target.files[0], live, board) })),
              // the check of the chosen file below the buttons (user)
              ...(otaFiles[id] ? [el("p", { class: `about-text${otaFiles[id].ok ? " good" : otaFiles[id].plain ? "" : " warn"}` }, otaFiles[id].why)] : [])] : []))] : []),
          // Backup half the width, Remove beside it (only for a display that is not connected; user)
          el("div", { class: "field boxed" }, el("span", { class: "label" }, "Backup"),
            el("div", { class: "choices" },
              el("button", { class: "btn", type: "button", onclick: () => doExport(id) }, "Export"),
              el("button", { class: "btn", type: "button", onclick: () => $(`import-${id}`).click() }, "Import"),
              el("input", { type: "file", id: `import-${id}`, accept: ".json,application/json", hidden: true, onchange: e => doImport(id, e.target.files[0]) }))),
          ...remove),
        frameFold);
      // System, Drives, Network, Time and WiFi move with their grip (dragged, or the arrow keys on it);
      // their order is the order of the pages on the display (H field 28). Display, Header and
      // Advanced Ink stay where they are.
      // The Conversation, The Intermission and The Afterhours move too: their
      // place is their place in the page turn (Turn candidate)
      const movable = { S: sysCard, D: disksCard, N: netCard, T: timeCard, W: wifiCard,
        ...(afterhours ? Object.fromEntries(artsShown().map((a, i) => [a.key, screenCards[i]])) : {}) };
      const takeOrder = c => {
        let o = [...c.parentElement.querySelectorAll(".sub-card[data-page]")].map(x => x.dataset.page).join("");
        // a card that is not here (WiFi on a board without WiFi, the pictures on the real page) keeps its place
        [...s.cardOrder].forEach((k, i) => { if (!o.includes(k)) o = o.slice(0, i) + k + o.slice(i); });
        if (o !== s.cardOrder) {
          s.cardOrder = o;
          s.pageOrder = [...o].filter(k => EPD.PAGE_ORDER.includes(k)).join("");
          pages[id] = 0;
          redraw();
        }
      };
      const grip = c => {
        const g = el("button", { class: "grip", type: "button", "aria-label": "Move this card",
          onkeydown: e => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            const to = e.key === "ArrowUp" ? c.previousElementSibling : c.nextElementSibling;
            if (!to?.dataset.page) return;
            if (e.key === "ArrowUp") to.before(c); else to.after(c);
            g.focus();
            evenOut();
            takeOrder(c);
          },
          // the moves and the release are taken from the whole window: moving the card in the page
          // ends a pointer capture on the grip, so the grip itself would miss the release
          onpointerdown: e => {
            if (e.button !== 0) return;
            e.preventDefault();
            const id0 = e.pointerId;
            // past the middle of a neighbour: the card takes its place
            const move = ev => {
              if (ev.pointerId !== id0) return;
              for (const o of c.parentElement.querySelectorAll(".sub-card[data-page]")) {
                if (o === c) continue;
                const r = o.getBoundingClientRect(), mid = r.top + r.height / 2;
                const below = c.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING;
                if (below ? ev.clientY > mid : ev.clientY < mid) {   // one step per move: the cards have moved
                  if (below) o.after(c); else o.before(c);
                  evenOut();
                  return;
                }
              }
            };
            const end = ev => {
              if (ev.pointerId !== id0) return;
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", end);
              window.removeEventListener("pointercancel", end);
              c.classList.remove("dragging");
              takeOrder(c);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", end);
            window.addEventListener("pointercancel", end);
            c.classList.add("dragging");
          } });
        return g;
      };
      for (const [k, c] of Object.entries(movable)) if (c) { c.dataset.page = k; c.append(grip(c)); }
      // Just give me time: the Header card and every page card but Time hidden, the time page switched on (and kept on);
      // the Header card stays while the Time card's Header is ticked (the time page then has the header)
      const justTime = () => {
        const on = s.justTime === 1, ink = timeCard.querySelector(".page-toggle input");
        for (const c of [sysCard, disksCard, netCard, wifiCard]) if (c) c.hidden = on;
        headerCard.hidden = on && s.timeHead !== 1;
        if (on) { s.showTime = 1; ink.checked = true; timeCard.classList.remove("off"); }
        ink.disabled = on;
        evenOut();
      };
      justTime();
      return { main, subs: [displayCard, headerCard, ...[...s.cardOrder].map(k => movable[k]).filter(Boolean), ...(afterhours ? [] : screenCards), advCard] };
    }

    function render(force) {
      const box = $("displays");
      updateStatus();
      updateWarnings();
      const list = displayList();
      const key = list.map(e => e.id + (e.live ? `+${e.live.board || ""}${e.live.size || ""}${e.live.colors || ""}${e.live.panel || ""}${e.live.transport || ""}` : "-")).join(",");
      const typing = box.contains(document.activeElement) && document.activeElement.matches("input[type=text], input[type=number], input[type=password]");
      if (!force && key === lastKey && (typing || dirty)) { drawAll(); return; }
      lastKey = key;
      // Each display: its card, then its own cards (System page, Disks, WiFi) right below it, as one
      // stack; two stacks side by side per row (one column on narrow screens), so a folded card
      // lets the cards below it move up
      const cards = list.map(card).map(c => [c.main, ...c.subs]);
      const rows = [];
      if (backend.tabs && list.length) {
        // one tab per display (user): the display card on the left, staying in view while the page
        // scrolls, its cards on the right in one column; the tab shown last is remembered
        box.classList.add("tabbed");
        let at = list.findIndex(e => e.id === pref("app", "tab", ""));
        if (at < 0) at = 0;
        const views = cards.map(([main, ...subs], i) => el("div", { class: "tab-view", hidden: i !== at },
          el("div", { class: "tab-preview" }, main), el("div", { class: "stack" }, ...subs)));
        const tabs = list.map((e, i) => el("button", { class: `tab${i === at ? " on" : ""}`, type: "button", role: "tab", "aria-selected": String(i === at),
          onclick: () => {
            setPref("app", "tab", e.id);
            tabs.forEach((t, j) => { t.classList.toggle("on", j === i); t.setAttribute("aria-selected", String(j === i)); });
            views.forEach((v, j) => { v.hidden = j !== i; });
            drawAll();
          } },
          el("span", { class: `dot${e.live ? " on" : ""}`, "aria-label": e.live ? "connected" : "not connected" }), nameOf(e.id, settingsFor(e.id))));
        rows.push(el("div", { class: "tabs", role: "tablist" }, ...tabs), ...views);
      } else {
        box.classList.remove("tabbed");
        for (let i = 0; i < cards.length; i += 2)
          rows.push(el("div", { class: "pair-row" }, ...cards.slice(i, i + 2).map(stack => el("div", { class: "stack" }, ...stack))));
      }
      box.replaceChildren(...(list.length ? rows
        : [el("div", { class: "empty" }, el("h2", {}, "No display reported yet"))]));
      drawAll();
      // the content of every card is watched (not the cards: their height is set below)
      evenObs.disconnect();
      for (const c of box.querySelectorAll(".stack > .card")) for (const k of c.children) evenObs.observe(k);
      evenOut();
    }

    // Two stacks side by side: cards at the same place, both open and starting at the same height,
    // get the same height, so their lower edges line up. A folded card stays short, so the cards
    // below it still move up.
    function evenOut() {
      const box = $("displays");
      for (const c of box.querySelectorAll(".stack > .card")) c.style.minHeight = "";
      const open = c => !c.classList.contains("sub-card") || c.querySelector("details.fold").open;
      for (const row of box.querySelectorAll(".pair-row")) {
        const [a, b] = [...row.children].map(st => [...st.children]);
        if (!b) continue;
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          const ra = a[i].getBoundingClientRect(), rb = b[i].getBoundingClientRect();
          // one column (narrow screen), or the cards above differ: nothing to line up
          if (ra.left === rb.left || Math.abs(ra.top - rb.top) > 0.5 || !open(a[i]) || !open(b[i])) break;
          const h = Math.max(ra.height, rb.height) + "px";
          a[i].style.minHeight = h;
          b[i].style.minHeight = h;
        }
      }
    }
    // run in the next frame: the heights set here resize the display list, which has its own observer
    let evenQueued = false;
    const evenObs = new ResizeObserver(() => {
      if (evenQueued) return;
      evenQueued = true;
      requestAnimationFrame(() => { evenQueued = false; evenOut(); });
    });

    function updateStatus() {
      const st = $("status");
      if (!state.updated) {
        st.textContent = "No data from the system yet. Is the script running?";
        st.className = "status warn";
        return;
      }
      const mins = Math.max(0, Math.round((Date.now() / 1000 - state.updated) / 60));
      const c = typeCounts();
      st.textContent = `${state.host} · data from ${state.timeText || hhmm(state.updated)} (${mins} min ago) · ${c.hdd} HDD, ${c.ssd} SSD, ${c.nvme} NVMe`;
      const stale = mins > fullMins() * 2 + 5;
      st.className = stale ? "status warn" : "status";
      if (stale) st.textContent += " · nothing new for a while";
    }

    function updateWarnings() {
      const bad = (state.displays || []).filter(d => !d.id);
      $("warnings").replaceChildren(...(appProblem ? [el("p", { class: "alert" }, appProblem)] : []),
        // still the user name and password of the defaults (Docker settings LOGIN_USER / LOGIN_PASSWORD); it
        // can be hidden in the Login card (this browser)
        ...(defaultLogin && !pref("app", "hideLoginNote", false) ? [el("p", { class: "alert" }, backend.changePassword ? "The settings page still uses the default login: change the password in the Login card at the bottom."
          : "The settings page still uses the default login: set LOGIN_PASSWORD in the Docker settings.")] : []), ...bad.map(d =>
        el("p", { class: "alert" }, `${d.port}: ${d.error || "no answer"}. Flash the current firmware onto this controller.`)));
    }

    // ---------------------------------------------------------- data
    async function load(force) {
      try {
        const data = await backend.load();
        state = Object.assign({ host: "", updated: 0, disks: [], displays: [] }, data.state || {});
        if (!dirty) { config = data.config || {}; interval = data.interval || 10; pageName = data.pagename || ""; }
        defaultPageName = data.defaultPagename || defaultPageName;
        appProblem = typeof data.problem === "string" ? data.problem : "";   // the app cannot write its data folder
        const wasDefault = defaultLogin;
        defaultLogin = data.defaultLogin === true;
        if (defaultLogin !== wasDefault) showLogin();   // Current filled in / the Hide button only with the default login
        versionCheck = data.versionCheck === true;
        firmwareCat = data.firmware && typeof data.firmware === "object" ? data.firmware : {};
        otaOn = data.otaEnabled !== false;
        const newVersion = typeof data.version === "string" && data.version !== appVersion;
        if (newVersion) appVersion = data.version;   // before render: the cards compare the firmware with it
        applyPageName();
        render(force);
        syncPageName();
        if (newVersion) checkUpdate();
        showVersions();
      } catch (e) {
        $("status").textContent = "No connection to the app. Is it running on the server?";
        $("status").className = "status warn";
      }
    }

    async function doSave() {
      const displays = {};
      for (const { id } of displayList()) {
        const s = settingsFor(id), w = s.wifi;
        displays[id] = { ...s, wifi: { ssid: w.ssid, host: w.host, server: w.server, apOn: w.apOn, apDelay: w.apDelay, apSsid: w.apSsid,
          pass: typeof w.pass === "string" ? w.pass : null, apPass: typeof w.apPass === "string" && w.apPass ? w.apPass : null } };
      }
      $("save").disabled = true;
      try {
        await backend.save({ displays, interval: fullMins(), pagename: pageName.trim() });
        dirty = false;
        setMsg("Saved. The displays pick it up within a minute.", "ok");
        await load(true);   // fresh settings (WiFi passwords now only as "set")
      } catch (e) {
        $("save").disabled = false;
        setMsg(e.message, "warn");
      }
    }

    async function doRefresh() {
      try {
        await backend.refresh();
        setMsg("Requested. The system sends fresh data to all displays within a minute.", "ok");
      } catch (e) { setMsg(e.message, "warn"); }
    }

    // ---------------------------------------------------------- new version
    // The latest release (backend.latest: GitHub), asked at most every 6 hours (kept per browser).
    // Shown when it is newer than this installation, unless muted (until the page is opened again)
    // or skipped (until a newer one is released).
    const UPDATE_KEY = "inksights-update", UPDATE_EVERY = 6 * 3600 * 1000;
    let appVersion = "", latestRel = null, muted = false;
    const verParts = v => String(v || "").replace(/^v/i, "").split(".").map(n => parseInt(n, 10) || 0);
    function newer(a, b) {   // version a after version b
      const x = verParts(a), y = verParts(b);
      for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
      return false;
    }
    // Versions: the settings page (this app), inksights.sh (state.json "version") and the firmware of
    // every display; all three belong together. Below the status line, and a notice for every one that
    // differs from the settings page
    // (the load() data carry versionCheck)
    let versionCheck = false, firmwareCat = {}, otaOn = true;   // otaOn: firmware updates allowed by the server
    // the pictures with all their settings (once the simulator only: its load() data carried afterhours); now
    // the settings page, inksights.sh and the firmware know them
    const afterhours = true;

    // OTA update (boards with WiFi): does the firmware the WebUI carries fit this board? It must have WiFi and
    // be connected to a WiFi network, the WebUI must carry a firmware built for exactly this board, and it
    // must fit the free firmware slot (board.slot)
    function otaCheck(live, board) {
      if (!live) return { ok: false, why: "Not connected." };
      if (!board.wifi) return { ok: false, plain: true, why: `${board.name} has no WiFi: update it over USB.` };   // a fact, not a problem: not in red (user)
      if (live.net !== "sta") return { ok: false, why: "Not connected to a WiFi network." };
      const fw = firmwareCat[live.board];
      if (!fw || typeof fw.version !== "string") return { ok: false, why: `The WebUI carries no firmware for ${board.name}.` };
      if (!(fw.size > 0) || !(fw.size <= board.slot)) return { ok: false, why: `Firmware ${fw.version} does not fit the firmware slot of this board.` };
      if (live.fw === fw.version) return { ok: false, same: true, fw, why: `Firmware ${fw.version} installed and matches the board.` };
      return { ok: true, fw, why: `Firmware ${fw.version} for ${board.name} matches the board (${live.fw || "?"} installed).` };
    }
    // a firmware file chosen for the manual update: an ESP32 app image for the chip of this board, with the ID
    // of this board inside (the PONG text " board=<id> wifi="), small enough for the firmware slot. A factory
    // image (a release file: bootloader, partition table and app) works too: the app is cut out of it.
    const u32 = (b, p) => (b[p] | b[p + 1] << 8 | b[p + 2] << 16 | b[p + 3] << 24) >>> 0;
    // the length of the app image at off: header, segments, checksum padded to 16 bytes, SHA-256 when
    // appended; 0 when there is none or it is cut short
    function appLength(b, off) {
      if (b.length < off + 24 || b[off] !== 0xE9) return 0;
      let p = off + 24;
      for (let i = 0; i < b[off + 1]; i++) { if (p + 8 > b.length) return 0; p += 8 + u32(b, p + 4); }
      p = Math.floor((p + 16) / 16) * 16;
      if (b[off + 23] === 1) p += 32;
      return p <= b.length ? p - off : 0;
    }
    // the app in a factory image: the first firmware slot (ota_0) of its partition table at 0x8000, else
    // the factory slot; -1 when the file has no partition table, 0 when it holds no app
    function factoryApp(b) {
      if (b.length < 0x8020 || b[0x8000] !== 0xAA || b[0x8001] !== 0x50) return -1;
      let at = 0;
      for (let p = 0x8000; p + 32 <= b.length && b[p] === 0xAA && b[p + 1] === 0x50; p += 32) {
        if (b[p + 2] !== 0) continue;
        if (b[p + 3] === 0x10) return u32(b, p + 4);
        if (b[p + 3] === 0 && !at) at = u32(b, p + 4);
      }
      return at;
    }
    const CHIPS = { 0: "ESP32", 2: "ESP32-S2", 5: "ESP32-C3", 9: "ESP32-S3", 12: "ESP32-C2", 13: "ESP32-C6" };
    const otaFiles = {};   // per display: the file chosen and its check (not saved)
    function otaFileCheck(buf, name, live, board) {
      if (!live) return { ok: false, why: "Not connected." };
      if (!board.wifi) return { ok: false, plain: true, why: `${board.name} has no WiFi: update it over USB.` };   // a fact, not a problem: not in red (user)
      if (live.net !== "sta") return { ok: false, why: "Not connected to a WiFi network." };
      let b = new Uint8Array(buf);
      if (b.length < 0x100 || b[0] !== 0xE9) return { ok: false, why: `${name}: not an ESP32 firmware file.` };
      const at = factoryApp(b), off = at < 0 ? 0 : at, len = at ? appLength(b, off) : 0;
      if (!len) return { ok: false, why: `${name}: no complete firmware in this file.` };
      b = b.slice(off, off + len);
      const chip = b[12] | b[13] << 8, want = /c3/.test(live.board) ? 5 : /s3/.test(live.board) ? 9 : -1;
      if (chip !== want) return { ok: false, why: `${name}: built for ${CHIPS[chip] || "another chip"}, not for the ${CHIPS[want] || "chip"} of this board.` };
      if (!(b.length <= board.slot)) return { ok: false, why: `${name}: too big for the firmware slot of this board.` };
      const text = new TextDecoder("latin1").decode(b), m = text.match(/ board=([a-z0-9-]{1,40}) wifi=/);
      if (!m) return { ok: false, why: `${name}: not an InkSights firmware.` };
      if (m[1] !== live.board) return { ok: false, why: `${name}: firmware for ${BOARDS[m[1]] ? BOARDS[m[1]].name : m[1]}, not for ${board.name}.` };
      return { ok: true, buf: b.buffer, why: "Firmware valid." };   // in green (user)
    }
    async function pickOtaFile(id, file, live, board) {
      $(`otafile-${id}`).value = "";   // the same file can be picked again
      if (!file) return;
      otaFiles[id] = { name: file.name, ...otaFileCheck(await file.arrayBuffer(), file.name, live, board) };
      render(true);
    }
    async function uploadOta(id, s) {
      const f = otaFiles[id];
      if (!f || !f.ok) return;
      try {
        await backend.otaFile(id, f.buf, f.name);
        delete otaFiles[id];
        setMsg(`${nameOf(id, s)}: ${f.name} uploaded; the board fetches it within 30 seconds.`, "ok");
        load(true);
      } catch (e) { setMsg(e.message, "warn"); }
    }
    // the first lines of the OTA Update frame (user): whether a newer firmware is there (the one the WebUI
    // carries for this board, else the version of the WebUI; also for boards without WiFi), then, only with a
    // newer one, why it cannot be flashed from here (no WiFi: a fact, in the normal colour; the rest in red)
    function otaLines(live, ota) {
      if (!live) return [el("p", { class: "about-text warn" }, ota.why)];
      const target = (firmwareCat[live.board] && firmwareCat[live.board].version) || appVersion;
      if (!(target && (!live.fw || newer(target, live.fw)))) return [el("p", { class: "about-text" }, "Firmware up to date.")];
      // why it cannot be flashed from here: only with a newer firmware (user)
      return [el("p", { class: "about-text good" }, "New firmware available!"),
        ...(!ota.ok && !ota.same ? [el("p", { class: `about-text${ota.plain ? "" : " warn"}` }, ota.why)] : [])];
    }
    // the state of an update the board is running (state.json displays: ota {state, pct, version, error})
    function otaText(o) {
      if (!o || !o.state) return "";
      if (o.state === "pending") return "Waiting for the board (it asks every 30 seconds) …";
      if (o.state === "loading") return `Loading firmware${o.version ? ` ${o.version}` : ""} … ${Math.round(o.pct || 0)} %`;
      if (o.state === "done") return `Updated${o.version ? ` to firmware ${o.version}` : ""}; the board has restarted.`;
      if (o.state === "failed") return `Update failed${o.error ? `: ${o.error}` : ""}. The old firmware stays.`;
      return "";
    }
    async function startOta(id, s, fw) {
      try {
        await backend.ota(id, fw.version);
        setMsg(`${nameOf(id, s)}: firmware ${fw.version} requested; the board fetches it within 30 seconds.`, "ok");
        load(true);
      } catch (e) { setMsg(e.message, "warn"); }
    }
    const fwOff = fw => versionCheck && !!appVersion && !!fw && fw !== appVersion;
    function showVersions() {
      const line = $("versions"), box = $("vercheck");
      if (!versionCheck || !appVersion) { line.replaceChildren(); box.hidden = true; return; }
      const sv = typeof state.version === "string" ? state.version : "", ran = state.updated > 0;
      const scriptOff = ran && sv !== appVersion;
      const shown = displayList().filter(e => e.live && e.live.fw);
      const fws = [...new Set(shown.map(e => e.live.fw))];
      const part = (text, off) => el("span", { class: off ? "warn" : "" }, text);
      const parts = [part(`WebUI ${appVersion}`, false),
        part(`Script ${!ran ? "-" : sv || "unknown"}`, scriptOff)];
      // the firmware always with the controllers it runs on, the same version together
      for (const fw of fws)
        parts.push(part(`Firmware ${fw} (${shown.filter(e => e.live.fw === fw).map(e => nameOf(e.id, settingsFor(e.id))).join(", ")})`, fwOff(fw)));
      line.replaceChildren(...parts.flatMap((p, i) => (i ? [" · ", p] : [p])));
      // the WebUI sets the version (it comes with the Docker app): an older part is updated to it, a newer
      // one means the WebUI is behind
      const notes = [];
      if (scriptOff) notes.push(!sv ? `The script reports no version: update it to ${appVersion} (see Update in the README).`
        : newer(sv, appVersion) ? `The script ${sv} is newer than the WebUI ${appVersion}: update the WebUI (see Update in the README).`
        : `The script ${sv} is older than the WebUI ${appVersion}: update the script (see Update in the README).`);
      for (const e of shown) if (fwOff(e.live.fw)) {
        const who = nameOf(e.id, settingsFor(e.id));
        notes.push(newer(e.live.fw, appVersion) ? `${who} runs firmware ${e.live.fw}, newer than the WebUI ${appVersion}: update the WebUI.`
          : `${who} runs firmware ${e.live.fw}, older than the WebUI ${appVersion}: upload firmware ${appVersion}.`);
      }
      showAbout(sv, ran, shown);
      box.hidden = !notes.length;
      box.replaceChildren(el("div", { class: "notes" }, ...notes.map(n => el("span", {}, n))),
        el("a", { class: "btn small", href: (latestRel && latestRel.url) || "https://github.com/Gittegatt/InkSights/releases/latest",
          target: "_blank", rel: "noopener" }, "Latest release"));
    }

    // About: a card at the bottom like the others (folded by default): versions, project links,
    // license and the libraries, support
    const REPO = "https://github.com/Gittegatt/InkSights";
    function showAbout(sv, ran, shown) {
      const sec = $("about");
      sec.hidden = !versionCheck;
      if (!versionCheck) return;
      const link = (href, text) => el("a", { class: "btn small", href, target: "_blank", rel: "noopener" }, text);
      const frame = (label, ...kids) => el("div", { class: "field wide boxed" }, el("span", { class: "label" }, label), ...kids);
      const row = (k, v, off) => [el("dt", {}, k), el("dd", { class: off ? "warn" : "" }, v)];
      const open = sec.querySelector("details") ? sec.querySelector("details").open : pref("app", "aboutOpen", false);
      sec.replaceChildren(el("article", { class: "card sub-card about" },
        el("details", { class: "fold", open, ontoggle: e => setPref("app", "aboutOpen", e.target.open) },
          el("summary", {}, `About · InkSights ${appVersion}`),
          el("div", { class: "sub-body" },
            el("div", { class: "form" },
              frame("Versions", el("dl", { class: "about-list" },
                ...row("WebUI", appVersion, false),
                ...row("Script", !ran ? "-" : sv || "unknown", ran && sv !== appVersion),
                ...shown.flatMap(e => row(`Firmware · ${nameOf(e.id, settingsFor(e.id))}`, e.live.fw, fwOff(e.live.fw))))),
              frame("Project", el("div", { class: "choices" },
                link(REPO, "GitHub"), link(`${REPO}/releases`, "Releases"), link(`${REPO}#readme`, "README"))),
              frame("License", el("p", { class: "about-text" },
                "InkSights is free software under the GNU General Public License version 3 (GPL-3.0). It uses GxEPD2 (GPL-3.0), ",
                "the Adafruit GFX Library with its 5x7 font (BSD), Adafruit BusIO (MIT) and, on the SAMD21, FlashStorage (LGPL-2.1)."),
                el("div", { class: "choices" }, link(`${REPO}/blob/main/LICENSE`, "License"))),
              frame("Support", el("div", { class: "choices" },
                link(REPO, "Star on GitHub"), link("https://ko-fi.com/gittegatt", "Ko-fi"), link("https://paypal.me/gittegatt", "PayPal"))))))));
    }

    const DEFAULT_LOGIN_PASSWORD = "ink!1234";   // the default of LOGIN_PASSWORD (docker-compose.yaml)
    let loginNote = ["", ""];   // the last feedback of the Login card
    // Login (the whole page, not one display; user): change the password of the settings page. Folded like
    // About; the current password, the new one twice; live feedback below the button
    function showLogin() {
      const sec = $("login");
      sec.hidden = !backend.changePassword;
      if (!backend.changePassword) return;
      const pw = (label, auto) => el("input", { type: "password", autocomplete: auto, maxlength: "64", "aria-label": label });
      const cur = pw("Current password", "current-password"), next = pw("New password", "new-password"), again = pw("Repeat new password", "new-password");
      // still the default login: Current already holds the default password (it is public in the README; user)
      if (defaultLogin) cur.value = DEFAULT_LOGIN_PASSWORD;
      // the red notice about the default login at the top: hide or show it again (this browser; user). The
      // button keeps its width (both labels in one grid cell, the other one invisible) and its place on the
      // screen (the page scrolls by the height the notice takes or gives back)
      const noteLabel = () => (pref("app", "hideLoginNote", false) ? "Show notice" : "Hide notice");
      const noteText = el("span", {}, noteLabel());
      const noteBtn = el("button", { class: "btn same-width", type: "button", onclick: () => {
        const before = noteBtn.getBoundingClientRect().top;
        setPref("app", "hideLoginNote", !pref("app", "hideLoginNote", false));
        noteText.textContent = noteLabel();
        updateWarnings();
        window.scrollBy(0, noteBtn.getBoundingClientRect().top - before);
      } }, noteText, el("span", { class: "sizer", "aria-hidden": "true" }, "Hide notice"), el("span", { class: "sizer", "aria-hidden": "true" }, "Show notice"));
      // the feedback right of Change password (user); Hide notice at the right edge, so it never moves
      const note = el("span", { class: "about-text login-note", role: "status" });
      // the feedback outlives a rebuild of the card (after a change the default login is gone: rebuilt)
      const say = (text, kind) => { loginNote = [text, kind]; note.textContent = text; note.className = `about-text login-note${kind ? " " + kind : ""}`; };
      say(...loginNote);
      const change = async () => {
        if (!cur.value) return say("Enter the current password.", "warn");
        if (next.value.length < 8) return say("The new password needs at least 8 characters.", "warn");
        if (next.value !== again.value) return say("The new passwords do not match.", "warn");
        if (next.value === cur.value) return say("The new password is the same as the current one.", "warn");
        try {
          await backend.changePassword(cur.value, next.value);
          cur.value = next.value = again.value = "";
          say("Password changed.", "good");
          load(true);
        } catch (e) { say(e.message, "warn"); }
      };
      // eye buttons: the one in Current shows that password as plain text, the one in New shows New and
      // Repeat (user); a second click hides them again
      const eye = (input, also = []) => {
        const svg = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
        const b = el("button", { class: "reveal", type: "button", "aria-label": "Show password", "aria-pressed": "false",
          onclick: () => {
            const show = input.type === "password";
            for (const i of [input, ...also]) i.type = show ? "text" : "password";
            b.setAttribute("aria-pressed", String(show));
            b.setAttribute("aria-label", show ? "Hide password" : "Show password");
          } });
        b.innerHTML = svg;
        return el("span", { class: "pw" }, input, b);
      };
      const field = (label, box) => el("label", { class: "field" }, el("span", { class: "label" }, label), box);
      sec.replaceChildren(el("article", { class: "card sub-card about" },
        el("details", { class: "fold", open: pref("app", "loginOpen", false), ontoggle: e => setPref("app", "loginOpen", e.target.open) },
          el("summary", {}, "Login"),
          el("div", { class: "sub-body" },
            el("div", { class: "form" },
              el("div", { class: "field wide boxed" }, el("span", { class: "label" }, "Password"),
                el("div", { class: "choices header-sec" }, field("Current", eye(cur)), field("New", eye(next, [again])), field("Repeat", el("span", { class: "pw" }, again))),
                el("div", { class: "choices login-row" }, el("button", { class: "btn", type: "button", onclick: change }, "Change password"),
                  note, ...(defaultLogin ? [noteBtn] : []))))))));
    }

    function showUpdate() {
      const box = $("update"), r = latestRel, skip = pref("app", "skipVersion", "");
      const on = !!r && !muted && !!appVersion && newer(r.version, appVersion) && (!skip || newer(r.version, skip));
      box.hidden = !on;
      if (!on) return;
      box.replaceChildren(el("span", {}, `InkSights ${r.version.replace(/^v/i, "")} is available.`),
        el("span", { class: "choices" },
          el("a", { class: "btn small primary", href: r.url, target: "_blank", rel: "noopener" }, "Download"),
          el("button", { class: "btn small", type: "button", onclick: () => { muted = true; showUpdate(); } }, "Mute"),
          el("button", { class: "btn small", type: "button", onclick: () => { setPref("app", "skipVersion", r.version); showUpdate(); } }, "Skip version")));
    }
    async function checkUpdate() {
      if (!backend.latest) return;
      let kept = null;
      try { kept = JSON.parse(localStorage.getItem(UPDATE_KEY) || "null"); } catch (e) { kept = null; }
      if (kept && Date.now() - kept.at < UPDATE_EVERY) { latestRel = kept.rel; showUpdate(); return; }
      try {
        latestRel = await backend.latest();
        try { localStorage.setItem(UPDATE_KEY, JSON.stringify({ at: Date.now(), rel: latestRel })); } catch (e) { /* not essential */ }
      } catch (e) { latestRel = kept ? kept.rel : null; }   // GitHub not reached: the last known one
      showUpdate();
    }
    // simulator: a release one step after this installation (or after the skipped one)
    function testUpdate() {
      const skip = pref("app", "skipVersion", ""), base = skip && newer(skip, appVersion) ? skip : appVersion || "1.0";
      const p = verParts(base);
      latestRel = { version: `v${p[0] || 0}.${(p[1] || 0) + 1}`, url: "https://github.com/Gittegatt/InkSights/releases" };
      muted = false;
      showUpdate();
    }

    // ---------------------------------------------------------- backup
    // Per display. Export: its settings as JSON (WiFi passwords never reach this page, so they are
    // not in it), file inksights-v<version>-<name>-<chip id>-<date>.json (the name only when one is set).
    // Import: the file is checked (format, then like a save by the app) and its settings go to this
    // display as unsaved changes, also from another board (a board that was replaced); the WiFi
    // passwords stored on the server stay.
    const slug = v => String(v || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
    function doExport(id) {
      const s = structuredClone(settingsFor(id)), w = s.wifi || {};
      delete w.pass; delete w.apPass; delete w.passSet; delete w.apPassSet;
      const data = { app: "InkSights", version: appVersion, exported: new Date().toISOString(), display: id, settings: s };
      const ver = appVersion ? `v${appVersion.replace(/^v/i, "").replace(/[^0-9.]/g, "")}` : "";   // like the release files: inksights-v1.0-...
      const name = ["inksights", ver, slug(s.dname), id.toLowerCase(), new Date().toISOString().slice(0, 10)].filter(Boolean).join("-");
      const a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" })), download: `${name}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setMsg(`${nameOf(id, s)}: exported, without WiFi passwords.`, "ok");
    }
    async function doImport(id, file) {
      $(`import-${id}`).value = "";   // the same file can be picked again
      if (!file) return;
      const who = nameOf(id, settingsFor(id));
      let data;
      try { data = JSON.parse(await file.text()); } catch (e) { setMsg(`${who}: import: not a JSON file.`, "warn"); return; }
      const obj = v => !!v && typeof v === "object" && !Array.isArray(v);
      if (!obj(data) || data.app !== "InkSights" || !obj(data.settings)) { setMsg(`${who}: import: not an InkSights backup of a display.`, "warn"); return; }
      // missing settings (a backup of an older version) get their defaults; the values given are
      // checked as they are
      const def = normalize({}), s = { ...def, ...structuredClone(data.settings) };
      const w = { ...def.wifi, ...(obj(s.wifi) ? s.wifi : {}) };
      for (const k of ["pass", "apPass", "passSet", "apPassSet"]) delete w[k];   // passwords never come from a file
      const old = (config[id] && config[id].wifi) || {};
      s.wifi = { ...w, passSet: !!old.passSet, apPassSet: !!old.apPassSet };
      try { if (backend.validate) await backend.validate({ pagename: pageName.trim(), displays: { [id]: { ...s, wifi: { ...w, pass: null, apPass: null } } } }); }
      catch (e) { setMsg(`${who}: import: ${e.message}`, "warn"); return; }
      config[id] = s;
      settingsFor(id);   // defaults for anything an older backup does not have
      pages[id] = 0;
      render(true);
      changed();
      if (!problems().length) setMsg(`${nameOf(id, s)}: imported. Check it and save.`, "ok");
    }

    window.addEventListener("beforeunload", e => { if (dirty && backend.warnOnLeave) { e.preventDefault(); e.returnValue = ""; } });
    new ResizeObserver(() => drawAll()).observe($("displays"));
    showLogin();
    load(true);
    if (backend.pollMs) setInterval(() => load(false), backend.pollMs);
    if (backend.live) setInterval(pollLive, 500);
    // Sync with display: every second the step of the panel (a redraw when the firmware would make one)
    setInterval(() => { for (const e of displayList()) if (mirrorOn(e.id)) drawPreview(e); }, 1000);
    // a time page in a preview: drawn again as the minutes go on
    setInterval(() => { if (displayList().some(e => { const s = settingsFor(e.id); return s.showTime === 1 || ARTS.some(a => s[a.p + "Clock"] === 1); })) drawAll(); }, 20000);

    // frames: what every display would get right now (simulator: "Send to display" over USB);
    // frameFor: the frame of one display from another state (simulator: live values)
    return { reload: force => load(force), redrawPreviews: drawAll, testUpdate,
      frames: () => displayList().map(e => ({ id: e.id, label: nameOf(e.id, settingsFor(e.id)), text: frameText(e).text || "" })),
      frameFor: (id, st) => { const e = displayList().find(x => x.id === id); return e ? buildFor(e, st) : null; } };
  }

  window.InkSightsUI = { start, BOARDS, DEFAULT_BOARD, PANELS, YELLOW_PANELS, panelLabel, pinLabel, PIN_NONE, PIN_NAMES, HOST_RE, SERVER_RE,
    DEFAULT_AP_SSID, DEFAULT_AP_PASS, DEFAULT_AP_DELAY, MAX_AP_DELAY, hexText };
})();
