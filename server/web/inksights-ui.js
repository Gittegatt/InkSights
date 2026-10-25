/*
 * inksights-ui.js - the settings page, shared by the real page (index.html, data from the
 * NAS server) and the simulator (simulator/simulator.html, simulated data). Both call
 * InkSightsUI.start(backend) and look and behave the same; only the backend differs:
 *
 *   backend.load()        -> Promise of { state, config, interval, pagename, defaultPagename }
 *   backend.save(body)    -> Promise; body = { displays, interval, pagename }
 *   backend.refresh()     -> Promise ("Update now")
 *   backend.redraw(id)    -> Promise ("Redraw now")
 *   backend.pollMs        -> reload the state this often (0 = never)
 *   backend.frameOverride(id) -> frame text to show instead of the settings (simulator: pasted frame)
 *   backend.serverAddress -> address of this page as a display reaches it (WiFi settings)
 *   backend.titleSuffix   -> appended to the browser tab title
 *   backend.yellowPanels  -> also offer the colour panels with yellow (simulator)
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
      else if (k === "checked" || k === "disabled" || k === "selected" || k === "open") e[k] = !!v;
      else e.setAttribute(k, v);
    }
    e.append(...kids);
    return e;
  }

  // ------------------------------------------------------------ boards
  // Same table as firmware/InkSights/BoardProfile.h. Pins are the board's pin numbers:
  // D numbers on the XIAO SAMD21, GPIO numbers on the ESP32 boards (dlabel: D label on the XIAO).
  const QTPY_PINS = [5, 6, 7, 8, 9, 16, 17, 18, 37, 40, 41, 42];
  const BOARDS = {
    "xiao-samd21": { name: "Seeed XIAO SAMD21", wifi: false, pins: [0, 1, 2, 3, 4, 5, 6, 7, 9], defaults: [7, 9, 6, 5], samd: true },
    "seeed-xiao-esp32-c3": { name: "Seeed XIAO ESP32-C3", wifi: true, pins: [3, 4, 5, 6, 7, 9, 20, 21], defaults: [20, 9, 21, 7],
      dlabel: { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 21: 6, 20: 7, 8: 8, 9: 9, 10: 10 } },
    "seeed-xiao-esp32-s3": { name: "Seeed XIAO ESP32-S3", wifi: true, pins: [1, 2, 4, 5, 6, 8, 43, 44], defaults: [44, 8, 43, 6],
      dlabel: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 43: 6, 44: 7, 7: 8, 8: 9, 9: 10 } },
    "esp32-s3-supermini": { name: "ESP32-S3 Super Mini", wifi: true, pins: [1, 2, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 21], defaults: [10, 9, 8, 7] },
    "esp32-s3-zero": { name: "Waveshare ESP32-S3-Zero", wifi: true, pins: [1, 2, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 43, 44], defaults: [10, 9, 8, 7] },
    "esp32-c3-supermini": { name: "ESP32-C3 Super Mini", wifi: true, pins: [0, 1, 3, 5, 7, 10, 20, 21], defaults: [7, 5, 3, 10] },
    "esp32-c3-zero": { name: "Waveshare ESP32-C3-Zero", wifi: true, pins: [0, 1, 3, 5, 7, 20, 21], defaults: [7, 5, 3, 1] },
    "adafruit-qtpy-esp32-s3-n4r2": { name: "Adafruit QT Py ESP32-S3 N4R2", wifi: true, pins: QTPY_PINS, defaults: [9, 8, 18, 17] },
    "adafruit-qtpy-esp32-s3-nopsram": { name: "Adafruit QT Py ESP32-S3 No PSRAM", wifi: true, pins: QTPY_PINS, defaults: [9, 8, 18, 17] },
  };
  const DEFAULT_BOARD = "xiao-samd21";   // displays with older firmware report no board: they are SAMD21
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
  const DEFAULT_AP_SSID = "InkSights";
  const DEFAULT_AP_PASS = "ink!1234";
  const DEFAULT_AP_DELAY = 30, MAX_AP_DELAY = 3600;   // seconds without WiFi before the access point opens
  const FAST = [[0, "Off"], [2, "2 s"], [5, "5 s"], [10, "10 s"], [30, "30 s"]];   // fast refresh (black/white panels)
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
  const parseSize = s => { const m = /^(\d+)x(\d+)$/.exec(s || ""); return m ? [Number(m[1]), Number(m[2])] : [212, 104]; };
  // Panel types (PANELS in the firmware): chosen on this page, saved on the board like the pins.
  // size in landscape, colors 3 = black/white/color, fast = fast partial refresh possible
  const PANELS = [
    { id: 1, name: "GDEW0213Z16", size: [212, 104], colors: 3, fast: false },
    { id: 2, name: "GDEH0213Z19", size: [212, 104], colors: 3, fast: false },
    { id: 3, name: "GDEY0213Z98", size: [250, 122], colors: 3, fast: false },
    { id: 4, name: "GDEY0213B74", size: [250, 122], colors: 2, fast: true },
    { id: 5, name: "GDEY042T81", size: [400, 300], colors: 2, fast: true },
  ];
  // The colour panels with yellow as the third colour (simulator only so far: backend.yellowPanels);
  // driven like their red twins, only the preview draws the third colour yellow
  const YELLOW_PANELS = PANELS.filter(p => p.colors === 3).map(p => ({ ...p, id: p.id + 5, yellow: true }));
  let panels = PANELS;   // the types offered: PANELS, in the simulator with the yellow ones
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
    panels = backend.yellowPanels ? PANELS.concat(YELLOW_PANELS) : PANELS;
    let state = { host: "", updated: 0, disks: [], displays: [] };
    let config = {};
    let interval = 10, pageName = "", defaultPageName = "InkSights";
    let dirty = false, lastKey = "", appProblem = "";
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
          el("h1", { id: "pagetitle" }, "InkSights"),
          el("p", { class: "status", id: "status" }, "Loading …")),
        el("div", { class: "actions" },
          el("label", { class: "interval", for: "interval" }, "Update every ",
            el("select", { id: "interval", onchange: e => { interval = Number(e.target.value); changed(); } },
              ...[[1, "1 min (redraw on change)"], [3, "3 min"], [5, "5 min"], [10, "10 min"], [15, "15 min"], [30, "30 min"], [60, "60 min"]]
                .map(([v, l]) => el("option", { value: String(v) }, l)))),
          el("button", { class: "btn", id: "refresh", type: "button", onclick: doRefresh }, "Update now"),
          el("button", { class: "btn primary", id: "save", type: "button", disabled: true, onclick: doSave }, "Save"))),
      el("p", { class: "msg", id: "msg", role: "status", "aria-live": "polite" }),
      el("div", { id: "warnings", class: "displays" }),
      el("section", { class: "displays", id: "displays", "aria-label": "Displays" }));

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
      const s = config[id];
      if (!Array.isArray(s.types)) s.types = [...ALL_TYPES];
      if (typeof s.boxes !== "number") s.boxes = 10;
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
      if (!EPD.layoutOk(s.layout)) s.layout = s.headerUp === 1 ? "TCU" : EPD.DEFAULT_LAYOUT;
      // a new display: header and system page (all components) on, disk and WiFi pages off
      for (const [k, d] of [["timer", 0], ["ringDir", 0], ["icons", 1], ["pctBar", 0], ["barCap", 0], ["zfs", 1], ["showSys", 1], ["showDisks", 0], ["sysIcons", 1], ["showWifi", 0], ["wifiIcons", 1], ["showHeader", 1], ["showNet", 0], ["netIcons", 1], ["driveTemp", 0], ["stby", 0], ["headInv", 0]]) if (s[k] !== 0 && s[k] !== 1) s[k] = d;
      if (![0, 1, 2].includes(s.pctDec)) s.pctDec = 0;   // decimals of the percentage in the drive bars
      // network pages: details in the bar 0 none / 1 percentage / 2 link speed, order by name or custom, hidden interfaces
      if (![0, 1, 2].includes(s.netBar)) s.netBar = 0;
      if (s.netSort !== "manual") s.netSort = "name";
      if (!Array.isArray(s.netOrder)) s.netOrder = [];
      if (!Array.isArray(s.netHidden)) s.netHidden = [];
      // system page components; none = no system page (1 / 0 = on / off of an earlier version)
      if (s.sys === 1 || s.sys === undefined) s.sys = SYS_PARTS.map(([p]) => p);
      if (!Array.isArray(s.sys)) s.sys = [];
      s.sys = SYS_PARTS.map(([p]) => p).filter(p => s.sys.includes(p));
      if (!FAST.some(([v]) => v === s.fast)) s.fast = 0;
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
    const nameOf = (id, s) => s.dname.trim() || s.name || `Display ${id}`;

    function typeCounts() {
      const c = { hdd: 0, ssd: 0, nvme: 0 };
      for (const d of state.disks || []) if (d.type in c) c[d.type]++;
      return c;
    }

    function problems() {
      const out = [];
      for (const { id, live } of displayList()) {
        const s = settingsFor(id), who = s.dname.trim() || s.name || id, w = s.wifi;
        if (!NAME_RE.test(s.name)) out.push(`${who}: title max. 12 characters, only letters, digits, spaces and . _ - + /`);
        if (s.dname.length > 32) out.push(`${who}: name max. 32 characters.`);
        if (!Number.isInteger(s.warn) || s.warn < 0 || s.warn > 100) out.push(`${who}: highlight threshold must be between 1 and 100 %.`);
        if (s.page < 0) out.push(`${who}: page turn must be a time like 00:10:00 (max. 24:00:00).`);
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
    function frameText(entry) {
      const s = settingsFor(entry.id);
      const override = backend.frameOverride ? backend.frameOverride(entry.id) : null;
      if (override != null) return { text: override, override: true };
      const title = (s.name || state.host || "SYSTEM").slice(0, 12);
      const fast = panelOf(entry.live, s).fast;
      return { text: EPD.buildFrame(state.disks || [], s, title, state.timeText || hhmm(state.updated), state.system || null, fast, interval), override: false };
    }

    function drawPreview(entry) {
      const { id, live } = entry;
      const canvas = $(`cv-${id}`);
      if (!canvas) return;
      const s = settingsFor(id), panel = panelOf(live, s);
      const [w, h] = panelSize(panel, s.rot);
      const { text, override } = frameText(entry);
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
      if (live && live.nothingToInk) { model.sys = null; model.nets = []; model.disks = []; model.diskPages = 0; model.wifiPage = 0; }
      const pc = EPD.pageCount(model.disks.length, h, model.rows, w, !!model.sys, !!model.wifiPage, model.layout !== "---", model.nets.length);
      pages[id] = (((pages[id] || 0) % pc) + pc) % pc;
      model.page = pages[id];
      model.mono = panel.colors === 2;
      model.yellow = !!panel.yellow;   // yellow third colour: black text on it
      // WiFi page: the board shows its own WiFi; here what the NAS server last heard from it
      model.wifi = { net: live ? (live.transport === "wifi" ? "sta" : live.net || "off") : "off", ssid: (live && (live.ssid || hexText(live.ssidHex))) || s.wifi.ssid,
        ip: live ? live.ip || "" : "", ap: s.wifi.apSsid || DEFAULT_AP_SSID,
        online: live && Number.isInteger(live.online) && live.online >= 0 ? Math.floor(live.online / 60) : -1 };   // black/white panel: highlighted used/total inverted instead of in colour
      // no fresh data for too long; in the simulator also a display that is not connected ("Connected" off)
      model.noData = live ? !!live.noData : !!backend.offlineNoData;
      if (override) { model.timer = s.timer; model.ringDir = s.ringDir; model.icons = s.icons; model.pctBar = s.pctBar ? (s.barCap ? 2 : 1) : 0; }
      if (live && live.splash) {   // the board's start screen, before the first data (simulator: "Start screen")
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
      const what = [model.sys ? "system" : "", model.disks.length || (!model.sys && !model.wifiPage && !model.nets.length) ? `${model.disks.length} drives` : "",
        model.nets.length ? `${model.nets.length} network` : "", model.wifiPage ? "WiFi" : ""].filter(Boolean).join(", ");
      $(`pg-${id}`).textContent = `Page ${model.page + 1}/${pc} · ${what}`;
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
      // Fast refresh: only panels that can redraw fast without flashing (black/white)
      const fastCap = panel.fast;
      const fastSel = el("select", { "aria-label": "Fast refresh", onchange: e => { s.fast = Number(e.target.value); redraw(); } },
        ...FAST.map(([v, l]) => el("option", { value: String(v), selected: v === s.fast }, l)));
      // System page: network interface, "" = the one with the default route
      const sysInfo = state.system || {};
      const ifNames = (Array.isArray(sysInfo.ifaces) ? sysInfo.ifaces : []).map(i => i.name).filter(n => IFACE_RE.test(n || ""));
      if (s.net && !ifNames.includes(s.net)) ifNames.push(s.net);   // saved, but not seen at the last update
      const netSel = el("select", { "aria-label": "Network interface", disabled: !s.sys.includes("net"), onchange: e => { s.net = e.target.value; redraw(); } },
        el("option", { value: "", selected: !s.net }, sysInfo.defaultIface ? `Default · ${sysInfo.defaultIface}` : "Default"),
        ...ifNames.map(n => el("option", { value: n, selected: n === s.net }, n)));

      // ZFS cache on the system page: shown (grey part of the RAM bar) or hidden (counted as free)
      const zfsBox = el("div", { class: "choices" }, el("span", { class: "check" }, "ZFS RAM cache"),
        radios("zfs", [[1, "On"], [0, "Off"]], s.zfs, v => { s.zfs = v; }));
      const setDisabled = (box, off) => box.querySelectorAll("input").forEach(i => { i.disabled = off; });
      setDisabled(zfsBox, !s.sys.includes("ram"));
      // Asleep hard disks: "--" or "STBY" in the drive rows and the HDD row, one setting offered in
      // the Drives and the System card, so picking it in one card ticks it in the other
      const pickStby = v => {
        s.stby = v;
        document.querySelectorAll(`input[name="stbyd-${id}"], input[name="stbys-${id}"]`).forEach(i => { i.checked = Number(i.value) === v; });
      };
      const stbySys = el("div", { class: "choices" }, el("span", { class: "check" }, "HDD asleep"),
        radios("stbys", [[0, "--"], [1, "STBY"]], s.stby, pickStby));
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
          setMsg(`${nameOf(id, s)}: redraws within a minute (takes about 15 seconds).`, "ok");
        } catch (e) { setMsg(e.message, "warn"); }
      } }, "Redraw now")] : [];
      const remove = live ? [] : [el("button", { class: "btn link", type: "button",
        onclick: () => { delete config[id]; changed(); render(true); } }, "Remove settings")];

      const via = live && live.transport === "wifi" ? "WiFi" : "USB";
      const meta = live
        ? [`ID ${id}`, live.transport === "wifi" ? `WiFi ${live.ip || ""}`.trim() : live.port, board.name,
          live.fw ? `Firmware ${live.fw}` : "", live.answer ? `Answer: ${live.answer}` : "no answer to the last frame"]
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
          el("details", { class: "fold", open: pref(id, key, openByDefault), ontoggle: e => setPref(id, key, e.target.open) },
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
        field("Icons", radios("wifiicons", [[1, "On"], [0, "Off"]], s.wifiIcons, v => { s.wifiIcons = v; })),
        el("form", { class: "wifi-grid", autocomplete: "off", onsubmit: e => e.preventDefault() },   // a form, so browsers handle the password fields properly
          wifiInput("ssid", "WiFi network", { maxlength: "32" }),
          wifiInput("pass", "Password", { type: "password", maxlength: "63", value: "", placeholder: w.passSet ? "unchanged" : "" }),
          wifiInput("server", "Settings page", { maxlength: "120", placeholder: backend.serverAddress || "http://hostname:8099" }),
          wifiInput("host", "Host name", { maxlength: "32", placeholder: `inksights-${id.toLowerCase()}` }),
          field("Setup access point", radios("apon", [[true, "On"], [false, "Off"]], w.apOn, v => { w.apOn = v; })),
          el("label", { class: "field" }, el("span", { class: "label" }, "Access point after (s)"),
            el("input", { type: "number", min: "0", max: String(MAX_AP_DELAY), step: "1", value: String(w.apDelay),
              style: "max-width: 7em", oninput: e => {
                w.apDelay = /^\d{1,4}$/.test(e.target.value) ? Number(e.target.value) : NaN; changed(); } })),
          wifiInput("apSsid", "Access point name", { maxlength: "32", placeholder: DEFAULT_AP_SSID }),
          wifiInput("apPass", "Access point password", { type: "password", maxlength: "63", value: "", placeholder: w.apPassSet ? "unchanged" : DEFAULT_AP_PASS }))) : null;

      // details in the bar: percentage or used capacity (only while "Details in bar" is on)
      // decimals of the percentage (only while the percentage stands in the bar)
      const decBox = field("Percentage", radios("pctdec", [[0, "35%"], [1, "35.4%"], [2, "35.47%"]], s.pctDec, v => { s.pctDec = v; }));
      const capBox = field("Details", radios("barcap", [[0, "Percentage"], [1, "Capacity"]], s.barCap, v => { s.barCap = v; setDisabled(decBox, !s.pctBar || v); }));
      setDisabled(capBox, !s.pctBar);
      setDisabled(decBox, !s.pctBar || s.barCap);
      const stbyBox = field("Asleep", radios("stbyd", [[0, "--"], [1, "STBY"]], s.stby, pickStby));
      setDisabled(stbyBox, !s.driveTemp);
      // Disks: disk types | spindown timer, color highlight, then the order and visibility of the disks
      const disksCard = subCard("disksOpen", "Drives", true, "showDisks",
        el("div", { class: "pair" },
          el("div", { class: "col group-col" },
            el("fieldset", { class: `set-${id}` },
              field("Drive types", el("div", { class: "choices" }, ...types))),
            field("Icons", radios("icons", [[1, "On"], [0, "Off"]], s.icons, v => { s.icons = v; })),
            field("Details in bar", radios("pctbar", [[1, "On"], [0, "Off"]], s.pctBar, v => { s.pctBar = v; setDisabled(capBox, !v); setDisabled(decBox, !v || s.barCap); })),
            capBox,
            decBox),
          el("div", { class: "col plain-col" },
            el("fieldset", { class: `set-${id}` },
              field("Spindown timer", radios("boxes", [[0, "Off"], [10, "On"]], s.boxes ? 10 : 0, v => { s.boxes = v; }))),
            field("Timer style", radios("timer", [[0, "Badge"], [1, "Ring"]], s.timer, v => { s.timer = v; })),
            field("Ring direction", radios("ringdir", [[0, "Clockwise"], [1, "Counterclockwise"]], s.ringDir, v => { s.ringDir = v; })),
            field("Temperature", radios("drivetemp", [[1, "On"], [0, "Off"]], s.driveTemp, v => { s.driveTemp = v; setDisabled(stbyBox, !v); })),
            stbyBox)),
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
      setDisabled(netKindBox, !s.netBar);
      const netCard = subCard("netOpen", "Network", true, "showNet",
        el("div", { class: "pair" },
          field("Icons", radios("neticons", [[1, "On"], [0, "Off"]], s.netIcons, v => { s.netIcons = v; })),
          el("div", { class: "col" },
            field("Details in bar", radios("netbar", [[1, "On"], [0, "Off"]], s.netBar ? 1 : 0, v => { s.netBar = v ? netKind : 0; setDisabled(netKindBox, !v); })),
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
      const sysCard = subCard("sysOpen", "System", true, "showSys",
        el("fieldset", { class: `set-${id}` },
          el("div", { class: "field" },
            el("span", { class: "label" }, "Components"),
            el("div", { class: "choices" }, ...sysChecks),
            el("div", { class: "choices" },
              el("label", { class: "check" }, "Network ", netSel),
              zfsBox,
              stbySys)),
          field("Icons", radios("sysicons", [[1, "On"], [0, "Off"]], s.sysIcons, v => { s.sysIcons = v; }))));

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
        litBox[i].disabled = c === "-";
      });
      syncLayout();
      const headerCard = subCard("headerOpen", "Header", true, "showHeader",
        el("fieldset", { class: `set-${id}` },
          el("div", { class: "form" },
            el("label", { class: "field wide" },
              el("span", { class: "label" }, "Title"),
              el("input", { type: "text", maxlength: "12", value: s.name, placeholder: state.host || "SYSTEM", autocomplete: "off", style: "max-width: 10em",
                oninput: e => { s.name = e.target.value; setHeading(); redraw(); } })),
            field("Invert colors", radios("headinv", [[1, "On"], [0, "Off"]], s.headInv, v => { s.headInv = v; })),
            el("div", { class: "field wide" },
              el("div", { class: "choices header-places" }, ...places.map((place, i) => el("div", { class: "field" },
                el("span", { class: "label" }, place), layoutSel[i],
                el("label", { class: "check" }, litBox[i], "Highlight"))))))));

      const setHeading = () => { heading.textContent = nameOf(id, s); titles.forEach(t => { t.textContent = heading.textContent; }); };
      const main = el("article", { class: "card", "aria-labelledby": `h-${id}` },
        el("div", { class: "card-head" }, heading,
          el("span", { class: `pill ${live ? "on" : ""}` }, live ? "connected" : "not connected"),
          el("span", { class: "pill size", id: `size-${id}` }),
          ...redrawNow),
        el("div", { class: "shot" },
          el("div", { class: "glass" }, el("canvas", { id: `cv-${id}`, role: "img", "aria-label": `Preview of display ${id}` })),
          el("div", { class: "pager" },
            el("button", { class: "btn small", type: "button", "aria-label": "Previous page", onclick: () => { pages[id] = (pages[id] || 0) - 1; drawPreview(entry); } }, "‹"),
            el("span", { id: `pg-${id}` }),
            el("button", { class: "btn small", type: "button", "aria-label": "Next page", onclick: () => { pages[id] = (pages[id] || 0) + 1; drawPreview(entry); } }, "›"))),
        el("p", { class: "note", id: `msg-${id}`, role: "status" }),
        el("div", { class: "meta" }, ...meta.filter(Boolean).map(t => el("span", {}, t))));
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
          // framed: Panel over the full width, then Rotation | Title, Rows per page | Auto page turn
          el("div", { class: "group wide" },
            el("div", { class: "field wide" }, el("span", { class: "label" }, "Panel"),
              el("div", { class: "choices panel-pick" }, panelSel, el("span", { class: "ro" }, live ? board.name : "not connected"))),
            field("Rotation", radios("rot", [[0, "0°"], [90, "90°"], [180, "180°"], [270, "270°"]], s.rot, v => { s.rot = v; })),
            el("fieldset", { class: `set-${id}` },
              el("div", { class: "field" }, el("span", { class: "label" }, "Rows per page"),
                el("div", { class: "oneline" }, radios("rows", rowOptions, s.rows, v => { s.rows = v; pages[id] = 0; }))),
              // the only hint text on the page
              field("Auto page turn (HH:MM:SS)", el("div", { class: "choices", style: "flex-wrap: nowrap; gap: 8px" }, pageTurn,
                el("span", { class: "count", style: "white-space: nowrap" }, "00:00:00 = off"))),
              ...(fastCap ? [field("Fast refresh", fastSel)] : []))),
          el("div", { class: "field wide boxed" },
            el("span", { class: "label" }, "Display pins"),
            el("div", { class: "choices pins" }, ...pinSelects)),
          ...remove.map(b => el("div", { class: "wide" }, b))),
        el("details", { class: "fold boxed" },
          el("summary", {}, `Frame (data received via ${via})`),
          el("pre", { id: `frame-${id}` })));
      if (wifiCard) wifiCard.classList.add("keep-on");   // its settings are not dimmed when the page is off
      return { main, subs: [displayCard, headerCard, sysCard, disksCard, netCard, ...(wifiCard ? [wifiCard] : [])] };
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
      $("interval").value = String(interval);
      // Each display: its card, then its own cards (System page, Disks, WiFi) right below it, as one
      // stack; two stacks side by side per row (one column on narrow screens), so a folded card
      // lets the cards below it move up
      const cards = list.map(card).map(c => [c.main, ...c.subs]);
      const rows = [];
      for (let i = 0; i < cards.length; i += 2)
        rows.push(el("div", { class: "pair-row" }, ...cards.slice(i, i + 2).map(stack => el("div", { class: "stack" }, ...stack))));
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
        st.textContent = "No data from the NAS server yet. Is the cron job running?";
        st.className = "status warn";
        return;
      }
      const mins = Math.max(0, Math.round((Date.now() / 1000 - state.updated) / 60));
      const c = typeCounts();
      st.textContent = `${state.host} · data from ${state.timeText || hhmm(state.updated)} (${mins} min ago) · ${c.hdd} HDD, ${c.ssd} SSD, ${c.nvme} NVMe`;
      const stale = mins > interval * 2 + 5;
      st.className = stale ? "status warn" : "status";
      if (stale) st.textContent += " · nothing new for a while";
    }

    function updateWarnings() {
      const bad = (state.displays || []).filter(d => !d.id);
      $("warnings").replaceChildren(...(appProblem ? [el("p", { class: "alert" }, appProblem)] : []), ...bad.map(d =>
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
        applyPageName();
        render(force);
        syncPageName();
      } catch (e) {
        $("status").textContent = "No connection to the app. Is it running on the NAS server?";
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
        await backend.save({ displays, interval, pagename: pageName.trim() });
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
        setMsg("Requested. The NAS server sends fresh data to all displays within a minute.", "ok");
      } catch (e) { setMsg(e.message, "warn"); }
    }

    window.addEventListener("beforeunload", e => { if (dirty && backend.warnOnLeave) { e.preventDefault(); e.returnValue = ""; } });
    new ResizeObserver(() => drawAll()).observe($("displays"));
    load(true);
    if (backend.pollMs) setInterval(() => load(false), backend.pollMs);

    // frames: what every display would get right now (simulator: "Send to display" over USB)
    return { reload: force => load(force), redrawPreviews: drawAll,
      frames: () => displayList().map(e => ({ id: e.id, label: nameOf(e.id, settingsFor(e.id)), text: frameText(e).text || "" })) };
  }

  window.InkSightsUI = { start, BOARDS, DEFAULT_BOARD, PANELS, YELLOW_PANELS, panelLabel, pinLabel, PIN_NONE, PIN_NAMES, HOST_RE, SERVER_RE,
    DEFAULT_AP_SSID, DEFAULT_AP_PASS, DEFAULT_AP_DELAY, MAX_AP_DELAY, hexText };
})();
