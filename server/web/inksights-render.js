/*
 * inksights-render.js
 * Draws exactly what the XIAO firmware draws (firmware/InkSights) and
 * builds frames exactly like inksights.sh. When the firmware layout
 * changes, change it here too.
 */
(function () {
  "use strict";

  // 5x7 font (Adafruit GFX default font, ASCII 32..126, column bytes, LSB = top).
  // Copyright (c) 2012 Adafruit Industries. All rights reserved. BSD license: licenses/adafruit-gfx-bsd.txt
  const FONT = [
    0x00,0x00,0x00,0x00,0x00, 0x00,0x00,0x5F,0x00,0x00, 0x00,0x07,0x00,0x07,0x00, 0x14,0x7F,0x14,0x7F,0x14,
    0x24,0x2A,0x7F,0x2A,0x12, 0x23,0x13,0x08,0x64,0x62, 0x36,0x49,0x56,0x20,0x50, 0x00,0x08,0x07,0x03,0x00,
    0x00,0x1C,0x22,0x41,0x00, 0x00,0x41,0x22,0x1C,0x00, 0x2A,0x1C,0x7F,0x1C,0x2A, 0x08,0x08,0x3E,0x08,0x08,
    0x00,0x80,0x70,0x30,0x00, 0x08,0x08,0x08,0x08,0x08, 0x00,0x00,0x60,0x60,0x00, 0x20,0x10,0x08,0x04,0x02,
    0x3E,0x51,0x49,0x45,0x3E, 0x00,0x42,0x7F,0x40,0x00, 0x72,0x49,0x49,0x49,0x46, 0x21,0x41,0x49,0x4D,0x33,
    0x18,0x14,0x12,0x7F,0x10, 0x27,0x45,0x45,0x45,0x39, 0x3C,0x4A,0x49,0x49,0x31, 0x41,0x21,0x11,0x09,0x07,
    0x36,0x49,0x49,0x49,0x36, 0x46,0x49,0x49,0x29,0x1E, 0x00,0x00,0x14,0x00,0x00, 0x00,0x40,0x34,0x00,0x00,
    0x00,0x08,0x14,0x22,0x41, 0x14,0x14,0x14,0x14,0x14, 0x00,0x41,0x22,0x14,0x08, 0x02,0x01,0x59,0x09,0x06,
    0x3E,0x41,0x5D,0x59,0x4E, 0x7C,0x12,0x11,0x12,0x7C, 0x7F,0x49,0x49,0x49,0x36, 0x3E,0x41,0x41,0x41,0x22,
    0x7F,0x41,0x41,0x41,0x3E, 0x7F,0x49,0x49,0x49,0x41, 0x7F,0x09,0x09,0x09,0x01, 0x3E,0x41,0x41,0x51,0x73,
    0x7F,0x08,0x08,0x08,0x7F, 0x00,0x41,0x7F,0x41,0x00, 0x20,0x40,0x41,0x3F,0x01, 0x7F,0x08,0x14,0x22,0x41,
    0x7F,0x40,0x40,0x40,0x40, 0x7F,0x02,0x1C,0x02,0x7F, 0x7F,0x04,0x08,0x10,0x7F, 0x3E,0x41,0x41,0x41,0x3E,
    0x7F,0x09,0x09,0x09,0x06, 0x3E,0x41,0x51,0x21,0x5E, 0x7F,0x09,0x19,0x29,0x46, 0x26,0x49,0x49,0x49,0x32,
    0x03,0x01,0x7F,0x01,0x03, 0x3F,0x40,0x40,0x40,0x3F, 0x1F,0x20,0x40,0x20,0x1F, 0x3F,0x40,0x38,0x40,0x3F,
    0x63,0x14,0x08,0x14,0x63, 0x03,0x04,0x78,0x04,0x03, 0x61,0x59,0x49,0x4D,0x43, 0x00,0x7F,0x41,0x41,0x41,
    0x02,0x04,0x08,0x10,0x20, 0x00,0x41,0x41,0x41,0x7F, 0x04,0x02,0x01,0x02,0x04, 0x40,0x40,0x40,0x40,0x40,
    0x00,0x03,0x07,0x08,0x00, 0x20,0x54,0x54,0x78,0x40, 0x7F,0x28,0x44,0x44,0x38, 0x38,0x44,0x44,0x44,0x28,
    0x38,0x44,0x44,0x28,0x7F, 0x38,0x54,0x54,0x54,0x18, 0x00,0x08,0x7E,0x09,0x02, 0x18,0xA4,0xA4,0x9C,0x78,
    0x7F,0x08,0x04,0x04,0x78, 0x00,0x44,0x7D,0x40,0x00, 0x20,0x40,0x40,0x3D,0x00, 0x7F,0x10,0x28,0x44,0x00,
    0x00,0x41,0x7F,0x40,0x00, 0x7C,0x04,0x78,0x04,0x78, 0x7C,0x08,0x04,0x04,0x78, 0x38,0x44,0x44,0x44,0x38,
    0xFC,0x18,0x24,0x24,0x18, 0x18,0x24,0x24,0x18,0xFC, 0x7C,0x08,0x04,0x04,0x08, 0x48,0x54,0x54,0x54,0x24,
    0x04,0x04,0x3F,0x44,0x24, 0x3C,0x40,0x40,0x20,0x7C, 0x1C,0x20,0x40,0x20,0x1C, 0x3C,0x40,0x30,0x40,0x3C,
    0x44,0x28,0x10,0x28,0x44, 0x4C,0x90,0x90,0x90,0x7C, 0x44,0x64,0x54,0x4C,0x44, 0x00,0x08,0x36,0x41,0x00,
    0x00,0x00,0x77,0x00,0x00, 0x00,0x41,0x36,0x08,0x00, 0x02,0x01,0x02,0x04,0x02
  ];

  // Three more glyphs of the same font (Adafruit GFX glcdfont, code page 437): arrow up, arrow down
  // and the degree sign, for the system page. The firmware prints these codes with cp437(true).
  const UP = "\x18", DOWN = "\x19", DEG = "\xF8";
  // Drive temperature text: °C, asleep (-2) "STBY" when wanted (H field 22), else "--"
  const tempText = (t, stby) => (t >= 0 ? `${t}${DEG}C` : t === -2 && stby ? "STBY" : "--");
  const FONT_EXTRA = { 0x18: [0x08, 0x04, 0x7E, 0x04, 0x08], 0x19: [0x10, 0x20, 0x7E, 0x20, 0x10], 0xF8: [0x06, 0x0F, 0x09, 0x0F, 0x06] };
  const glyph = (code, col) => (FONT_EXTRA[code] ? FONT_EXTRA[code][col] : FONT[((code < 32 || code > 126 ? 63 : code) - 32) * 5 + col]);

  const WH = 0, BK = 1, RD = 2;
  // e-paper white, black, third colour (shown as red; yellow panels draw it in yellow)
  const PALETTE = [[0xe3, 0xe0, 0xd6], [0x1d, 0x1d, 0x1b], [0xad, 0x2a, 0x25]];
  const YELLOW = [0xdc, 0xae, 0x1d];   // the third colour of the yellow panels
  // text on the third colour: white, black on the yellow panels (white on yellow is hard to read;
  // user); set per screen from m.yellow in drawScreen()
  let onThird = WH;
  const L = { HEADER_H: 11, ROW_H_AUTO: 22, ROW_H_MIN: 17, ROW_H_WIDE: 34, ROW_H_UPRIGHT: 32, ROW_H_BIG_UPRIGHT: 63, CHAR_W: 6, BAR_H: 8, BAR_H_MAX: 16, MAX_BOXES: 20, MAX_DISKS: 32, MAX_NETS: 8, MAX_CONTAINERS: 24, WARN_PCT: 85 };


  class Fb {
    constructor(w, h, fill = WH) { this.w = w; this.h = h; this.px = new Uint8Array(w * h).fill(fill); }
    pixel(x, y, c) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.px[y * this.w + x] = c; }
    fillRect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.pixel(i, j, c); }
    drawRect(x, y, w, h, c) {
      for (let i = x; i < x + w; i++) { this.pixel(i, y, c); this.pixel(i, y + h - 1, c); }
      for (let j = y; j < y + h; j++) { this.pixel(x, j, c); this.pixel(x + w - 1, j, c); }
    }
    // size = text size like setTextSize() of Adafruit GFX: every font pixel becomes size x size
    text(x, y, s, c, size = 1) {
      for (const ch of s) {
        const code = ch.charCodeAt(0);
        for (let col = 0; col < 5; col++) {
          const bits = glyph(code, col);
          for (let row = 0; row < 8; row++)
            if ((bits >> row) & 1) this.fillRect(x + col * size, y + row * size, size, size, c);
        }
        x += L.CHAR_W * size;
      }
    }
  }

  const textW = s => (s.length ? s.length * L.CHAR_W - 1 : 0);
  // Big panels (4.2", 400 x 300 in any rotation): "wide" layout, everything in double text size
  const isBig = (w, h) => w > 0 && Math.max(w, h) >= 360;
  // Small panels turned upright (about 100 px wide)
  const isUpright = w => w > 0 && w < 150;
  // head = false: no header line (switched off on the settings page, header layout "---"); the rows get its room
  const headerH = (w, h, head = true) => (!head ? 0 : isBig(w, h) ? 20 : L.HEADER_H);
  // wanted = rows per page from the settings (2 to 6), 0 = automatic; w = panel width (0 = small panel)
  // Upright (w < h) the pool gets its own line, so the rows are taller
  const rowsArea = (h, w = 0, head = true) => h - headerH(w, h, head) - 1;
  const rowsPerPage = (h, wanted = 0, w = 0, head = true) => {
    const area = rowsArea(h, w, head);
    const tall = isBig(w, h) ? (w >= h ? L.ROW_H_WIDE : L.ROW_H_BIG_UPRIGHT) : isUpright(w) ? L.ROW_H_UPRIGHT : 0;
    if (wanted > 0 && Math.trunc(area / wanted) >= (tall || L.ROW_H_MIN)) return wanted;
    return Math.trunc(area / (tall || L.ROW_H_AUTO));
  };
  const rowHeight = (h, wanted = 0, w = 0, head = true) => Math.trunc(rowsArea(h, w, head) / rowsPerPage(h, wanted, w, head));
  // Pages: the system page (S line), the disk pages, the network pages (nets = N lines, as many rows
  // per page as the disk pages), the time page (C line) and the WiFi page (H field 15), in the order
  // of H field 28; without disks the others are the only pages
  // netOn: the network pages switched on (H field 31) also without interfaces: then one page "No
  // interfaces" when nothing else is there (user), and no "No drives" page while the drive pages are off
  // docker: the Docker pages (H field 32) with this many containers (K lines), -1 = off; switched on they
  // always have a page, also with none to show ("No errors", "All up to date")
  const pageCounts = (n, h, wanted = 0, w = 0, sys = false, wifi = false, head = true, nets = 0, clock = false, netOn = false, diskOn = true, docker = -1) => {
    const per = rowsPerPage(h, wanted, w, head);
    const c = { S: sys ? 1 : 0, N: nets ? Math.ceil(nets / per) : netOn && !sys && !wifi && !clock && n === 0 && docker < 0 ? 1 : 0, T: clock ? 1 : 0, W: wifi ? 1 : 0,
      K: docker < 0 ? 0 : Math.max(1, Math.ceil(docker / per)) };
    c.D = n === 0 ? (sys || wifi || nets || clock || docker >= 0 || (netOn && !diskOn) ? 0 : 1) : Math.ceil(n / per);
    return c;
  };
  const pageCount = (...a) => Object.values(pageCounts(...a)).reduce((x, y) => x + y, 0);
  // the page order (H field 28): S system, D drives, N network, T time, W WiFi, each once
  const PAGE_ORDER = "SDNTW";
  // the pictures (A line): The Conversation, The Intermission, The Afterhours: settings prefix, default time window,
  // caption on by default; the card order holds the pages and the pictures C I A each once
  const PICS = [["conv", "18:00", "19:00", 0], ["inter", "12:00", "13:00", 1], ["after", "23:00", "07:00", 1]];
  const PIC_FLAGS = "011", PIC_WIN = "1800-1900,1200-1300,2300-0700";
  // K: the Docker pages, in the order when their card has a place, else right after N
  const cardOrderOk = o => typeof o === "string" && (o.length === 8 || (o.length === 9 && o.includes("K"))) && [..."SDNTWCIA"].every(k => o.includes(k));
  const orderOk = o => typeof o === "string" && (o.length === 5 || (o.length === 6 && o.includes("K"))) && [...PAGE_ORDER].every(k => o.includes(k));
  // page p in that order: [kind, index within its kind]
  function pageAt(p, order, counts) {
    const o = orderOk(order) ? order : PAGE_ORDER;
    for (const k of o.includes("K") ? o : o.replace("N", "NK")) { if (p < (counts[k] || 0)) return [k, p]; p -= counts[k] || 0; }
    return ["D", 0];
  }

  // ------------------------------------------------------------ time
  // 12 or 24 hours (H field 25); the time page (C line) with date and weekday in one of four formats
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const two = n => String(n).padStart(2, "0");
  // hours and minutes as the main text and AM/PM ("" for 24 hours)
  const clockText = (h, mi, h12) => (h12 ? { main: `${two(h % 12 || 12)}:${two(mi)}`, ampm: h < 12 ? "AM" : "PM" } : { main: `${two(h)}:${two(mi)}`, ampm: "" });
  // the header time "HH:MM" of the frame in the chosen format: fmt 0 24 hours, 1 12 hours with AM/PM
  // ("1:37PM"), 2 12 hours without ("1:37")
  function headTime(hhmm, fmt) {
    const m = /^(\d\d):(\d\d)$/.exec(hhmm || "");
    if (!m || !fmt) return hhmm;
    const c = clockText(Number(m[1]), Number(m[2]), true);
    return c.main + (fmt === 1 ? c.ampm : "");
  }
  // 0: 26 Oct 2026, 1: 2026-10-26, 2: 10/26/2026, 3: 26.10.2026
  const dateText = (t, fmt) => [`${t.d} ${MONTHS[t.mo - 1]} ${t.y}`, `${t.y}-${two(t.mo)}-${two(t.d)}`, `${two(t.mo)}/${two(t.d)}/${t.y}`, `${two(t.d)}.${two(t.mo)}.${t.y}`][fmt] || "";
  // "YYYYMMDDHHMMSS" (+ seconds) -> { y, mo, d, h, mi, wd }; weekday 0 = Sunday
  function clockParts(dt, plus = 0) {
    const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/.exec(dt || "");
    if (!m) return null;
    const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + Math.max(0, plus) * 1000);
    return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), wd: t.getUTCDay() };
  }
  // The time page: the time as big as fits, in the middle; below it the weekday and the date
  // (each when ticked) in a third of its size; t = { y, mo, d, h, mi, wd }
  // third = the third colour of the panel (BK on black/white): with Color highlight (C line) the
  // time in it, the date stays black; Time frame: a black outline around its digits (user)
  function drawClockPage(fb, c, t, fmt, HH, third = BK) {
    const W = fb.w, H = fb.h;
    if (!t) { const z = 2; fb.text(Math.trunc((W - textW("--:--") * z) / 2), HH + Math.trunc((H - HH - 7 * z) / 2), "--:--", BK, z); return; }
    const { main, ampm: ap } = clockText(t.h, t.mi, fmt > 0), ampm = fmt === 1 ? ap : "";
    const sub = [c.wday ? WDAYS[t.wd] : "", c.date ? dateText(t, c.dfmt) : ""].filter(Boolean).join(" ");
    // the date at about a third of the time (212x104: 2, 4.2": 4; user), smaller below while too wide
    const parts = z => { const az = Math.max(1, Math.trunc(z / 3)), dz = Math.max(1, Math.trunc((z + 1) / 3));
      return { az, dz, w: textW(main) * z + (ampm ? z + textW(ampm) * az : 0), h: 7 * z + (sub ? 3 * dz + 7 * dz : 0) }; };
    let z = 1;
    while (z < 40) { const p = parts(z + 1); if (p.w > W - 8 || p.h > H - HH - 8) break; z++; }
    let { az, dz, w, h } = parts(z);
    while (sub && dz > 1 && textW(sub) * dz > W - 8) { dz--; h = 7 * z + 3 * dz + 7 * dz; }
    const top = HH + Math.trunc((H - HH - h) / 2), x = Math.trunc((W - w) / 2);
    const col = c.color && third !== BK ? third : BK, o = c.color && c.frame && third !== BK ? Math.max(1, Math.trunc(z / 6)) : 0;
    const time = ink => {
      fb.text(x, top, main, ink, z);
      if (ampm) fb.text(x + textW(main) * z + z, top + 7 * z - 7 * az, ampm, ink, az);   // AM / PM on the baseline
    };
    // the outline: the time in black, moved by up to o pixels in every direction, under the coloured one
    if (o) for (let dy = -o; dy <= o; dy++) for (let dx = -o; dx <= o; dx++) {
      if (!dx && !dy) continue;
      fb.text(x + dx, top + dy, main, BK, z);
      if (ampm) fb.text(x + textW(main) * z + z + dx, top + 7 * z - 7 * az + dy, ampm, BK, az);
    }
    time(col);
    if (sub) fb.text(Math.trunc((W - textW(sub) * dz) / 2), top + 7 * z + 3 * dz, sub, BK, dz);
  }

  function fillRaster(fb, x, y, w, h) {
    for (let py = y; py < y + h; py++)
      for (let px = x; px < x + w; px++)
        if (((px + py) & 1) === 0) fb.pixel(px, py, BK);
  }

  // text: details centred in the bar (percentage "35%" or the used capacity "3.18T"; null = none),
  // white over the used part, black on a light rectangle over the grey part; in the size of the
  // row text (pctSize 1 or 2), but only as big as fits inside the frame (5x7: bar at least 9 px,
  // double: at least 18 px), else nothing
  function drawBar(fb, x, y, w, h, pct, warn, mono, text, pctSize = 1) {
    fb.drawRect(x, y, w, h, BK);
    const iw = w - 2, ih = h - 2;
    let uw = Math.trunc(iw * pct / 100);
    if (pct > 0 && uw === 0) uw = 1;
    const fill = warn && !mono ? RD : BK;
    if (uw > 0) fb.fillRect(x + 1, y + 1, uw, ih, fill);
    fillRaster(fb, x + 1 + uw, y + 1, iw - uw, ih);
    barText(fb, x, y, w, h, uw, text, pctSize, fill === RD ? onThird : WH);
  }
  // Text centred in a bar of w x h with uw px used (see drawBar); also the network bars
  function barText(fb, x, y, w, h, uw, text, pctSize, onUsed = WH) {   // onUsed: text colour over the used part
    if (!text) return;
    const iw = w - 2, ih = h - 2, t = text;
    let z = pctSize;
    while (z > 1 && (ih < 7 * z + 2 || textW(t) * z > iw - 2)) z--;   // double size: 1 px air above and below
    if (ih < 7 * z || textW(t) * z > iw - 2) return;
    const tw = textW(t) * z, th = 7 * z;
    const usedEnd = x + 1 + uw;   // first pixel of the grey part
    const tx = x + 1 + Math.trunc((iw - tw) / 2);
    const ty = y + 1 + Math.ceil((ih - th) / 2);   // odd space: the extra pixel above
    const on = (cx, cy) => {   // is (cx, cy) a pixel of the text?
      if (cx < tx || cy < ty) return false;
      const fx = Math.floor((cx - tx) / z), row = Math.floor((cy - ty) / z);
      const i = Math.floor(fx / L.CHAR_W), col = fx - i * L.CHAR_W;
      if (i >= t.length || col > 4 || row > 6) return false;
      return (FONT[(t.charCodeAt(i) - 32) * 5 + col] >> row) & 1;
    };
    // over the grey part a light rectangle behind the digits (margin 1 px, 2 px at double size),
    // never over the frame or the used part
    const rx = Math.max(tx - z, usedEnd), ry = Math.max(ty - z, y + 1);
    const rx2 = Math.min(tx + tw - 1 + z, x + w - 2), ry2 = Math.min(ty + th - 1 + z, y + h - 2);
    if (rx <= rx2) fb.fillRect(rx, ry, rx2 - rx + 1, ry2 - ry + 1, WH);
    for (let py = ty; py < ty + th; py++)
      for (let px = tx; px < tx + tw; px++)
        if (on(px, py)) fb.pixel(px, py, px < usedEnd ? onUsed : BK);
  }

  // ------------------------------------------------------------ fonts
  // "5x7" = the built-in font, "5x7b" = bold (drawn twice, 1 px wider), "5x7x2" = double size
  // Height of the capitals and digits
  function fAsc(name) { return name === "5x7x2" ? 14 : 7; }
  function fW(name, s) {
    if (!s.length) return 0;
    if (name === "5x7x2") return textW(s) * 2;
    if (name === "5x7b") return textW(s) + 1;
    return textW(s);
  }
  // Text with its capitals starting at top
  function fText(fb, name, x, top, s, c) {
    if (name === "5x7x2") return fb.text(x, top, s, c, 2);
    if (name === "5x7b") { fb.text(x, top, s, c); fb.text(x + 1, top, s, c); return; }
    fb.text(x, top, s, c);
  }
  // Longest start of s that fits into w px
  function fFit(name, s, w) { while (s && fW(name, s) > w) s = s.slice(0, -1); return s; }

  // Fonts, bar height and symbol per layout (fewer rows = bigger):
  //   2.13" landscape, by rows per page
  const SCALE_213 = {
    5: { dev: "5x7b", pool: "5x7", cap: "5x7", bar: 6, time: "5x7" },
    4: { dev: "5x7b", pool: "5x7", cap: "5x7", bar: 8, time: "5x7" },
    3: { dev: "5x7b", pool: "5x7", cap: "5x7", bar: 10, time: "5x7" },
    2: { dev: "5x7b", pool: "5x7", cap: "5x7", bar: 14, time: "5x7" },   // double-size time made the badge too big (user)
  };
  //   4.2" landscape: all text in double size (wider does not fit the line); bar, symbol and timer
  //   grow with fewer rows per page like on the 2.13" (6 rows: 18 px, enough for the double
  //   percentage); automatic (8 rows of 34 px, 9 were too many; user) keeps a thin bar
  const BAR_WIDE = { 2: 32, 3: 26, 4: 22, 5: 20, 6: 18 };
  //   (upright the same sizes; automatic leaves room for the pool line)
  const scaleWide = (rowH, rows, stacked) => {
    const bar = BAR_WIDE[rows] || clamp(rowH - 21 - (stacked ? 15 : 0), 10, 18);
    return { dev: "5x7x2", pool: "5x7x2", cap: "5x7x2", bar, time: bar >= 14 ? "5x7x2" : "5x7" };
  };

  // ------------------------------------------------------------ symbol and spindown timer
  // Left of the bar a symbol for type and state (no timer there):
  //   flash (SSD / NVMe)          : chip
  //   hard disk spinning          : checkerboard-grey disc with a dot in the middle
  //   hard disk asleep (standby)  : light disc with a dot in the middle
  //   state unknown               : like spinning (the timer's status file is the only source,
  //                                 asking the disk itself could wake it)
  // At the right of the bar the spindown timer (H field 8 of the frame, 0 / missing = badge):
  //   0 badge: MM:SS left in a rounded frame; asleep "SLEEP" on grey; timer not running "--:--"
  //   1 ring : no text, no frame. A ring as high as the badge for the time left (full right after
  //            an access, it shrinks back to 12 o'clock); asleep a dotted circle; timer not running
  //            a circle with a dash
  // Timer not running = no fresh status (remain < 0). SSDs and NVMe have no timer: nothing at the
  // right. Symbols, badge and ring always sit centred on the height of the bar. Integer maths
  // except atan2 / sin / cos for ring angles, so the firmware can draw the same pixels.
  const TIMER = { BADGE: 0, RING: 1 };

  // 7x7 chip for small symbols (9 / 11 px)
  const ICON_CHIP = [".#.#.#.", ".#####.", "##...##", ".#...#.", "##...##", ".#####.", ".#.#.#."];   // hollow body
  function drawBitmap(fb, x, y, rows, z) {
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "#") fb.fillRect(x + i * z, y + j * z, z, z, BK); });
  }

  // Inside a rectangle with corners rounded by radius r. r is limited so that the corner centres
  // never cross (otherwise the top and bottom corners of an even-height frame differ).
  function inRound(x, y, w, h, r, px, py) {
    if (px < x || py < y || px >= x + w || py >= y + h) return false;
    r = Math.min(r, Math.trunc((Math.min(w, h) - 1) / 2));
    const dx = px - clamp(px, x + r, x + w - 1 - r), dy = py - clamp(py, y + r, y + h - 1 - r);
    return dx * dx + dy * dy <= r * r + r;
  }
  function strokeRound(fb, x, y, w, h, r, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++)
      if (inRound(x, y, w, h, r, i, j) && !inRound(x + 1, y + 1, w - 2, h - 2, Math.max(0, r - 1), i, j)) fb.pixel(i, j, c);
  }
  // Grey (raster) inside a rounded frame
  function rasterRound(fb, x, y, w, h, r) {
    for (let j = y + 1; j < y + h - 1; j++) for (let i = x + 1; i < x + w - 1; i++)
      if (((i + j) & 1) === 0 && inRound(x + 1, y + 1, w - 2, h - 2, Math.max(0, r - 1), i, j)) fb.pixel(i, j, BK);
  }
  const inDisc = (dx, dy, r) => dx * dx + dy * dy <= r * r + r;
  // Ring of radius r, lw px thick, from 12 o'clock over frac of the circle, clockwise or (ccw)
  // counterclockwise. frac = time left: a quarter (12 to 3 o'clock clockwise) at 7:30 of 30:00.
  function drawRing(fb, cx, cy, r, frac, lw, ccw) {
    if (frac <= 0) return;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!inDisc(dx, dy, r) || inDisc(dx, dy, r - lw)) continue;
      let a = Math.atan2(ccw ? -dx : dx, -dy); if (a < 0) a += 2 * Math.PI;
      if (a <= frac * 2 * Math.PI) fb.pixel(cx + dx, cy + dy, BK);
    }
  }
  // Asleep (ring style): bold dots on the circle, as thick as the progress ring (at least 2 px),
  // with a gap of about one dot between them; dots from 4 px on with cut corners
  // bold = false (2.13"): single pixels about every 3 px as before
  function dottedCircle(fb, cx, cy, r, lw = 1, bold = true) {
    if (!bold) {
      const n = Math.max(8, Math.round(2 * Math.PI * r / 3));
      for (let k = 0; k < n; k++) {
        const a = 2 * Math.PI * k / n;
        fb.pixel(cx + Math.round(r * Math.sin(a)), cy - Math.round(r * Math.cos(a)), BK);
      }
      return;
    }
    const d = Math.max(2, lw), rc = r - (d - 1) / 2;   // dot size, radius of the dot centres
    const n = Math.max(8, Math.round(2 * Math.PI * rc / (d * 2)));
    for (let k = 0; k < n; k++) {
      const a = 2 * Math.PI * k / n;
      const x0 = Math.round(cx + rc * Math.sin(a) - (d - 1) / 2), y0 = Math.round(cy - rc * Math.cos(a) - (d - 1) / 2);
      for (let j = 0; j < d; j++) for (let i = 0; i < d; i++)
        if (d < 4 || !((i === 0 || i === d - 1) && (j === 0 || j === d - 1))) fb.pixel(x0 + i, y0 + j, BK);
    }
  }
  // Timer not running (ring style): thin circle with a dash in the middle
  function dashCircle(fb, cx, cy, r) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      if (inDisc(dx, dy, r) && !inDisc(dx, dy, r - 1)) fb.pixel(cx + dx, cy + dy, BK);
    const k = Math.trunc(r / 2);
    fb.fillRect(cx - k, cy, 2 * k + 1, 1, BK);
  }
  // Disc symbol of radius r: 1 px rim, grey (checkerboard, with a 1 px light ring inside the rim so
  // the rim stays thin) or light inside, and a plus in the middle (arms 1 px, from radius 8 on 2 px).
  // The checkerboard is aligned to the disc centre, so every grey disc looks the same in every row;
  // its parity puts the short plus arms on checkerboard pixels and leaves the pixels diagonal to the
  // middle light, so there is no black blob around the plus; bigger discs also get
  // a light X (shine) like a schematic CD.
  // Shine of a spinning disc: light wedges along both diagonals, a quarter of the distance wide
  // (|dx| - |dy| at most dist / 4, integer maths); small discs keep their plain checkerboard
  const shine = (dx, dy) => { const d = Math.abs(dx) - Math.abs(dy); return 16 * d * d <= dx * dx + dy * dy; };
  // The same turned by 45 degrees (2.13" with 3 or 4 rows; 2 rows use the 4.2" look): light wedges along the axes,
  // the grey forms an X, and a light middle keeps the plus free
  const shineAxes = (dx, dy) => { const m = Math.min(Math.abs(dx), Math.abs(dy)); return 32 * m * m <= dx * dx + dy * dy; };
  // toRim: the checkerboard reaches the rim, no light ring inside it (2.13" with 2 rows);
  // wider: the checkerboard reaches one pixel further than usual, dist² up to (r-2)² + r - 1 (2.13" with 4 rows)
  function drawDiscIcon(fb, cx, cy, r, grey, turned = false, toRim = false, wider = false) {
    const arm = r >= 8 ? Math.max(2, Math.trunc(r / 5)) : 1;   // plus grows with big symbols
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!inDisc(dx, dy, r)) continue;
      const black = !inDisc(dx, dy, r - 1)                                      // rim
        || ((dx === 0 && Math.abs(dy) <= arm) || (dy === 0 && Math.abs(dx) <= arm))   // plus
        || (grey && (wider ? dx * dx + dy * dy <= (r - 2) * (r - 2) + r - 1 : inDisc(dx, dy, toRim ? r - 1 : r - 2))
            && ((dx + dy) & 1) === 1                                              // checkerboard,
            && !(turned ? shineAxes(dx, dy) || dx * dx + dy * dy <= (arm + 1) * (arm + 1)
                        : shine(dx, dy)));                                        // light X like a CD
      if (black) fb.pixel(cx + dx, cy + dy, BK);
    }
  }
  // Chip filling a box of B px (odd), lined up with the discs: same size, same middle.
  // Up to 11 px the 7x7 bitmap; from 13 px a body with pins (3 at the top and bottom,
  // 2 at each side, 3 px wide), all symmetric to the middle. The body is hollow: a light square
  // inside, the black border a quarter of the body minus 1 px (at least 1 px).
  // deep: the notches between the pins reach 1 px into the body (4.2" with 2 rows)
  function drawChip(fb, x, y, B, deep = false) {
    if (B <= 11) { drawBitmap(fb, x + Math.trunc((B - 7) / 2), y + Math.trunc((B - 7) / 2), ICON_CHIP, 1); return; }
    const p = B >= 17 ? 3 : 2, s = Math.max(4, Math.trunc(B * 0.28)), h = Math.trunc(s * 0.6), mid = (B - 1) / 2;
    const body = B - 2 * p, edge = Math.max(2, Math.trunc(body / 4)) - 1;
    fb.fillRect(x + p, y + p, body, body, BK);
    fb.fillRect(x + p + edge, y + p + edge, body - 2 * edge, body - 2 * edge, WH);
    for (const c of [mid - s, mid, mid + s]) {
      fb.fillRect(x + c - 1, y, 3, p, BK);
      fb.fillRect(x + c - 1, y + B - p, 3, p, BK);
    }
    for (const c of [mid - h, mid + h]) {
      fb.fillRect(x, y + c - 1, p, 3, BK);
      fb.fillRect(x + B - p, y + c - 1, p, 3, BK);
    }
    if (!deep) return;
    const top = [mid - s, mid, mid + s], side = [mid - h, mid + h];
    for (let i = p; i < B - p; i++) {
      if (!top.some(c => Math.abs(i - c) <= 1)) { fb.pixel(x + i, y + p, WH); fb.pixel(x + i, y + B - p - 1, WH); }
      if (!side.some(c => Math.abs(i - c) <= 1)) { fb.pixel(x + p, y + i, WH); fb.pixel(x + B - p - 1, y + i, WH); }
    }
  }
  // Row symbol in a box of B px (odd)
  function drawIcon(fb, d, x, y, B, turned, toRim, wider, deepChip) {
    if (d.state === "N") { drawChip(fb, x, y, B, deepChip); return; }
    const r = (B - 1) / 2;
    drawDiscIcon(fb, x + r, y + r, r, d.state !== "S", turned, toRim, wider);   // asleep light, otherwise grey
  }

  const pad2 = n => String(n).padStart(2, "0");
  // Time left until spindown: MM:SS, from 100 minutes on 1h40
  const timerText = s => (s >= 6000 ? `${Math.floor(s / 3600)}h${pad2(Math.floor(s / 60) % 60)}` : `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`);
  // noTimer: H field 8 = 2 (spindown timer off), the state still decides the symbol; "-" = the same from older scripts
  const hasTimer = d => !d.noTimer && d.state !== "N" && d.state !== "-";
  const timerRunning = d => (d.state === "A" || d.state === "S") && d.remain >= 0 && d.timeout > 0;
  const timerLeft = d => (d.state === "A" && timerRunning(d) ? clamp(d.remain / d.timeout, 0, 1) : 0);

  // Badge and ring size from the bar height and the time font: the badge is 4 px (small bars) or
  // 6 px higher than the bar, its text exactly in the middle; the ring is as high as the badge.
  // small: 2.13" panel; there the badge of the tall bars (2 and 3 rows) is a little smaller (user):
  // 4 px higher than the bar instead of 6, less air at the sides. The ring keeps its size.
  function widgetGeo(style, bar, font, small = false) {
    const asc = fAsc(font);
    const slim = small && bar > 8 && style !== TIMER.RING;
    let h = bar + (bar <= 8 || slim ? 4 : 6);
    if ((h - asc) % 2) h += 1;                             // same gap above and below the text
    if (style === TIMER.RING) { const dd = h % 2 ? h : h - 1; return { w: dd, h: dd, r: (dd - 1) / 2 }; }
    const tw = fW(font, "00:00");
    let w = tw + 2 * clamp(Math.trunc(h / (slim ? 4 : 3)), 3, 6);   // side air, at most 6 px (tall 4.2" badges)
    if ((w - tw) % 2) w += 1;                              // same gap left and right
    return { w, h, r: Math.min(5, Math.trunc(h / 3)) };
  }
  // Badge or ring for one disk at x, y (size from widgetGeo)
  function drawTimer(fb, d, x, y, g, lay) {
    if (!hasTimer(d)) return;
    if (lay.timer === TIMER.RING) {
      const cx = x + g.r, cy = y + g.r;
      if (!timerRunning(d)) dashCircle(fb, cx, cy, g.r);
      else if (d.state === "S") dottedCircle(fb, cx, cy, g.r, lay.ringW, lay.boldDots);
      else drawRing(fb, cx, cy, g.r, timerLeft(d), lay.ringW, lay.ccw);
      return;
    }
    const font = lay.time, asc = fAsc(font);
    const t = !timerRunning(d) ? "--:--" : d.state === "S" ? "SLEEP" : timerText(d.remain);
    const tw = fW(font, t), tx = x + Math.trunc((g.w - tw) / 2), ty = y + Math.trunc((g.h - asc) / 2);
    if (timerRunning(d) && d.state === "S") {
      // grey like the bar's free part; the text on a white field so it stays readable
      rasterRound(fb, x, y, g.w, g.h, g.r);
      const my = Math.min(2, Math.trunc((g.h - 2 - asc) / 2));
      fb.fillRect(tx - 2, ty - my, tw + 3, asc + 2 * my, WH);
    }
    strokeRound(fb, x, y, g.w, g.h, g.r, BK);
    fText(fb, font, tx, ty, t, BK);
  }

  // mono = black/white panel: highlighted used/total is shown inverted instead of in colour
  // Row: symbol | device | pool | used/total, the bar below (starting under the device name), the
  // timer at the right end of the bar. Upright: device | used/total, the pool in its own second line.
  function drawDisk(fb, d, y, lay, warnPct, mono) {
    const warn = warnPct > 0 && d.pct >= warnPct;
    if (lay.iconBox) drawIcon(fb, d, lay.x0, y + lay.iconDy, lay.iconBox, lay.shineTurned, lay.greyToRim, lay.greyWider, lay.deepChip);
    const base = y + lay.lineAsc;                       // baseline of the first text line
    // rows of several lines without a pool: the device name moves down into the last text line, right
    // above "not mounted"
    const lastBase = base + lay.line2 + lay.line3;
    const devBase = lay.stacked && d.pct < 0 ? lastBase : base;
    fText(fb, lay.dev, lay.devX, devBase - fAsc(lay.dev), d.dev, BK);
    // Drive temperature (H field 21; "--" = unknown, asleep "--" or "STBY" by H field 22), ending at the right edge: landscape
    // in the first text line above the timer column (two-line rows: beside the device name); without
    // a timer column used/total moves left before it. Upright in the pool line (the pool gets
    // shorter), in the first line when used/total stands in the pool line. In the row font, else
    // 5x7, else without the "C"; nothing when that does not fit either.
    const temp = lay.driveTemp && d.temp != null ? tempText(d.temp, lay.stby) : null;
    const tEnd = fb.w - lay.x0;
    const tPick = room => {
      for (const s of d.temp < 0 ? [temp] : [temp, temp.slice(0, -1)])
        for (const f of [lay.pool, "5x7"]) if (fW(f, s) <= room) return { f, s };
      return null;
    };
    let capEnd = lay.textEnd, tp = null, tLine = 0;   // tLine: 0 first text line, 1 pool line
    if (temp && !lay.stacked && !lay.g && !lay.capBelow) {   // no timer column: used/total gives way
      tp = { f: lay.pool, s: temp };
      capEnd = tEnd - fW(tp.f, tp.s) - lay.colGap;
    } else if (temp && !lay.stacked && lay.g && !lay.capBelow && !tPick(tEnd - (lay.textEnd + 4))) {
      // too wide for the room above the timer column (ring: "STBY", "31°C"): used/total gives way here too (user)
      tp = { f: lay.pool, s: temp };
      capEnd = tEnd - fW(tp.f, tp.s) - lay.colGap;
    }
    const cap = capText(d, lay, lay.pctBar);
    let capFont = lay.cap;
    if (!lay.stacked && capEnd - fW(capFont, cap) < lay.devX + lay.devW + 4) capFont = "5x7";   // does not fit beside the name
    const capW = fW(capFont, cap), capX = capEnd - capW;
    // upright: used/total beside the device; only if it does not fit there, in the pool line
    const capLow = lay.stacked && (lay.capBelow || d.pct < 0 || capX < lay.devX + fW(lay.dev, d.dev) + 4);
    // three lines (upright): used/total in its own last line, the pool keeps the whole second line
    const capBase = lay.capLine ? lastBase : capLow ? base + lay.line2 : base, capTop = capBase - fAsc(capFont);
    if (warn && mono && cap) { fb.fillRect(capX - 1, capTop - 1, capW + 2, fAsc(capFont) + 2, BK); fText(fb, capFont, capX, capTop, cap, WH); }
    else {
      // colour panels: only the used part (before the slash) in the third colour, "/" and the total black
      // (user); the total alone (used capacity in the bar) stays black
      fText(fb, capFont, capX, capTop, cap, BK);
      const slash = cap.indexOf("/");
      if (warn && slash > 0) fText(fb, capFont, capX, capTop, cap.slice(0, slash), RD);   // the same glyphs again, in colour
    }
    const poolX = lay.stacked ? lay.devX : lay.devX + lay.devW + lay.colGap;
    const poolBase = lay.stacked ? base + lay.line2 : base;
    if (temp && !tp) {
      if (lay.stacked && !(capLow && !lay.capLine)) { tLine = 1; tp = tPick(tEnd - poolX); }   // pool line
      else if (lay.stacked || lay.capBelow) tp = tPick(tEnd - (d.pct < 0 && lay.stacked ? lay.devX : lay.devX + fW(lay.dev, d.dev) + 4));
      else tp = tPick(tEnd - (capEnd + 4));   // above the timer column, after used/total
    }
    const tX = tp ? tEnd - fW(tp.f, tp.s) : tEnd;
    // no pool and nothing mounted: nothing in the pool column, the disk size at the right and
    // "not mounted" in the place of the bar
    const poolEnd = lay.stacked && (!capLow || lay.capLine) ? (tp && tLine === 1 ? tX - lay.colGap : lay.textEnd) : capX - lay.colGap;
    const pool = d.pct < 0 ? "" : fFit(lay.pool, d.pool, poolEnd - poolX);
    if (pool) fText(fb, lay.pool, poolX, poolBase - fAsc(lay.pool), pool, BK);
    if (tp) fText(fb, tp.f, tX, (tLine === 1 ? base + lay.line2 : base) - fAsc(tp.f), tp.s, BK);
    const by = y + lay.barDy;
    const barText = lay.pctBar === 1 ? pctLabel(d, lay) : lay.pctBar === 2 ? d.used : null;   // details in the bar
    if (d.pct >= 0) drawBar(fb, lay.devX, by, lay.barW, lay.barH, d.pct, warn, mono, barText, lay.cap === "5x7x2" ? 2 : 1);
    else {   // in the size of the row text (5x7 when that is much taller than the bar), centred on the bar
      // the longest text that fits (row font, else 5x7): up to the timer, or up to the right edge
      // when this disk has no timer (SSD)
      const room = hasTimer(d) || !lay.g ? lay.barW : lay.boxX + lay.g.w - lay.devX;
      let f = fAsc(lay.pool) <= lay.barH + 4 ? lay.pool : "5x7", t = "";
      for (const font of f === "5x7" ? ["5x7"] : [f, "5x7"]) {
        t = ["not mounted", "unmounted", "none"].find(x => fW(font, x) <= room) || "";
        if (t) { f = font; break; }
      }
      fText(fb, f, lay.devX, by + Math.floor((lay.barH - fAsc(f)) / 2), t, BK);
    }
    if (lay.g) drawTimer(fb, d, lay.boxX, y + lay.timerDy, lay.g, lay);
  }

  // Uptime of the server for the header: full calendar months plus the minutes after them; the
  // three biggest units from the first one that is not 0 ("1Y 2M 3W", "2M 1W 3d", "1W 5d 4h"),
  // fewer when room is short ("2M 1W", "2M"); Y year, M month, W week, d day, h hour, m minute
  const UP_UNITS = "YMWdhm";
  function uptimeText(months, min, maxChars) {
    const v = [Math.floor(months / 12), months % 12, Math.floor(min / 10080), Math.floor(min % 10080 / 1440),
      Math.floor(min % 1440 / 60), min % 60];
    let i = 0;
    while (i < 5 && v[i] === 0) i++;
    const parts = v.slice(i, i + 3).map((n, k) => `${n}${UP_UNITS[i + k]}`);
    for (let n = parts.length; n > 0; n--) {
      const t = parts.slice(0, n).join(" ");
      if (t.length <= maxChars) return t;
    }
    return "";
  }

  // Uptime split into full calendar months and the minutes after them (local time, like
  // inksights.sh): a month after 31 Jan is 28/29 Feb, a month after 15 Mar is 15 Apr
  function uptimeSplit(bootMs, nowMs) {
    const b = new Date(bootMs), t = new Date(nowMs);
    let n = (t.getFullYear() - b.getFullYear()) * 12 + t.getMonth() - b.getMonth(), from = bootMs;
    for (; n > 0; n--) {
      const y = b.getFullYear(), m = b.getMonth() + n, last = new Date(y, m + 1, 0).getDate();
      from = new Date(y, m, Math.min(b.getDate(), last), b.getHours(), b.getMinutes(), b.getSeconds()).getTime();
      if (from <= nowMs) break;
    }
    if (n <= 0) { n = 0; from = bootMs; }
    return { months: n, min: Math.max(0, Math.floor((nowMs - from) / 60000)) };
  }

  // Header: three places (left, middle, right) as in m.layout: T title, P page number, U uptime of
  // the server, C time, - nothing (default TCP; "---" = no header line, the rows get its room).
  // Left and right stand at the edges, the middle one centred but never into its neighbours; only
  // the title is cut, and where there is room the others leave 5 of its characters. "NO DATA"
  // stands in the place of the page number, else of the uptime, else in a free place (the middle
  // first), else in the middle; it brings the header line back when it is switched off.
  // A lower-case letter highlights its place: black text on a white box instead of white on black.
  const DEFAULT_LAYOUT = "TCP";
  const layoutOk = s => typeof s === "string" && /^[TPUCtpuc-]{3}$/.test(s) && [..."TPUC"].every(c => s.toUpperCase().split(c).length <= 2);
  const headerOn = m => m.noData || !(layoutOk(m.layout) && m.layout === "---");
  function drawHeader(fb, m, pages, wide) {
    const W = fb.w, hs = wide ? 2 : 1, hx = wide ? 4 : 2, hy = wide ? 3 : 2, gap = 6 * hs;
    if (!headerOn(m)) return;
    // inverted (H field 23): white with black text and a black line at the bottom
    const inv = m.headInv === 1, bg = inv ? WH : BK, fg = inv ? BK : WH, HH = headerH(W, fb.h);
    fb.fillRect(0, 0, W, HH, bg);
    // inverted: the divider line at the bottom of the header (H field 27: 1 on, default / 0 off);
    // on the 4.2" 2 px thick, downwards (user: like 1 px on the 2.13" with its half-size text)
    if (inv && m.headLine !== 0) fb.fillRect(0, HH - 1, W, wide ? 2 : 1, BK);
    // black header: its bottom edge under the boxes is the divider line, on the 4.2" 2 px too (one
    // row below it; user); off: the boxes reach down to the bottom edge
    if (!inv && wide && m.headLine !== 0) fb.fillRect(0, HH, W, 1, BK);
    const given = layoutOk(m.layout) ? m.layout : DEFAULT_LAYOUT;
    const lay = [...given.toUpperCase()], hi = [...given].map(c => c >= "a" && c <= "z");
    // highlighted: a box in the text colour 2 px (4 px on the 4.2") wider than the text on each
    // side, the text in the header colour; "NO DATA": white box, text in the third colour (inverted
    // header: a box in the third colour, white text; there the boxes reach up to the top edge, so no
    // white line stays above them, user). Inverted header with H field 24 = 1: the highlighted boxes
    // in the third colour too (text white, black on yellow; user)
    const third = m.mono ? BK : RD, boxY = inv ? 0 : hy - hs, lit = inv && m.headCol === 1;
    const onBox = third === RD ? onThird : WH;
    // "NO DATA" on a yellow panel: a yellow box with black text in the black header too (yellow
    // text on white is hard to read; user)
    const ndBox = inv || m.yellow;
    const put = (i, px, s) => {
      const nd = lay[i] === "N";
      if (hi[i] || nd) fb.fillRect(px - 2 * hs, boxY, textW(s) * hs + 4 * hs, (!inv && m.headLine === 0 ? HH : hy - hs + 9 * hs) - boxY, nd ? (ndBox ? third : WH) : lit ? third : fg);
      fb.text(px, hy, s, nd ? (ndBox ? onBox : third) : hi[i] ? (lit ? onBox : bg) : fg, hs);
    };
    // Fill gaps (H field 30): the whole line in the colour of the boxes, every place drawn like a
    // highlighted one (user)
    if (m.headFill === 1) {
      hi.fill(true);
      fb.fillRect(0, boxY, W, (!inv && m.headLine === 0 ? HH : hy - hs + 9 * hs) - boxY, lit ? third : fg);
    }
    if (m.noData) {
      const at = [lay.indexOf("P"), lay.indexOf("U")].find(i => i >= 0) ?? [1, 2, 0].find(i => lay[i] === "-") ?? 1;
      lay[at] = "N";
    }
    const hasT = lay.includes("T"), keep = hasT ? Math.min(m.host.length, 5) * 6 * hs : 0;
    // (m.pageNo: the number in a page turn with pictures)
    const text = { C: headTime(m.time, m.timeFmt), P: pages > 1 ? `${(m.pageNo ?? m.page) + 1}/${pages}` : "", N: "NO DATA", U: "" };
    if (lay.includes("U") && m.uptime >= 0) {   // as many units as fit beside the others and 5 characters of the title
      let room = W - 2 * hx - (hasT ? keep - hs + gap : 0);
      for (const k of lay) if ("CPN".includes(k) && k !== "-" && text[k]) room -= textW(text[k]) * hs + gap;
      text.U = uptimeText(m.upMonths || 0, m.uptime, Math.floor((room + hs) / (6 * hs)));
    }
    const item = lay.map(k => (k !== "T" && k !== "-" && !text[k] ? "-" : k));
    const fixed = k => k !== "T" && k !== "-";
    const wOf = k => (fixed(k) ? textW(text[k]) * hs : 0);
    const x = [0, 0, 0];
    if (fixed(item[0])) x[0] = hx;
    if (fixed(item[2])) x[2] = W - hx - wOf(item[2]);
    if (fixed(item[1])) {
      const w = wOf(item[1]);
      const lo = item[0] === "T" ? hx + keep + 5 * hs : item[0] === "-" ? hx : x[0] + wOf(item[0]) + gap;
      const up = item[2] === "T" ? W - hx - (keep - hs) - gap - w : item[2] === "-" ? W - hx - w : x[2] - gap - w;
      x[1] = Math.min(up, Math.max(lo, Math.trunc((W - w) / 2)));
    }
    const ti = item.indexOf("T");
    if (ti >= 0) {   // the title gets the room between its neighbours
      let start = hx, end = W - hx;
      for (let i = ti - 1; i >= 0; i--) if (item[i] !== "-") { start = x[i] + wOf(item[i]) + gap; break; }
      for (let i = ti + 1; i < 3; i++) if (item[i] !== "-") { end = x[i] - gap; break; }
      const t = fFit(hs === 2 ? "5x7x2" : "5x7", m.host, end - start), tw = textW(t) * hs;
      if (t) put(ti, ti === 0 ? start : ti === 2 ? end - tw : Math.min(end - tw, Math.max(start, Math.trunc((W - tw) / 2))), t);
    }
    item.forEach((k, i) => { if (fixed(k)) put(i, x[i], text[k]); });   // "NO DATA": inverted, in the third colour
  }

  // Start screen of the firmware (drawSplash), shown until the first data arrive (simulator:
  // "Start screen"). s = { product, fw, id, board, panel (name), color, pinTitle, pins [cs, dc, rst, busy]
  // (-1 = none), wifi: null (board without WiFi) or the WiFi line, key: access point password or null }
  // Below the header the product name big and centred, then the lines ID, board, panel, pins (and
  // WiFi, key), both together in the middle of the room above "Waiting for data ..." at the bottom.
  // Everything in u = 1 (2.13") or 2 (4.2", like its header and rows): the name as big as fits
  // (at most 3u x), the lines 11u px apart (down to 9 on the 2.13" when room is short).
  // Logo bars in front of the product name on the start screen (as in examples/example_00_inksights.png):
  // four bars in units of the name's pixel size z, 1.4 z wide and z apart, 1.5 / 3.2 / 5.3 / 2.5 z high,
  // standing on the baseline of the name, then z of air before the name. Like drawLogo() in the firmware.
  const LOGO_BARS = [15, 32, 53, 25];   // heights in tenths of z
  const logoBarW = z => Math.trunc((14 * z + 5) / 10);
  const logoW = z => 4 * logoBarW(z) + 4 * z;   // incl. the air before the name
  function drawLogo(fb, x, base, z) {
    const bw = logoBarW(z);
    LOGO_BARS.forEach((t, i) => { const h = Math.trunc((t * z + 5) / 10); fb.fillRect(x + i * (bw + z), base - h, bw, h, BK); });
  }

  function drawSplash(fb, s) {
    const W = fb.w, H = fb.h, u = isBig(W, H) ? 2 : 1, CW = L.CHAR_W * u, HH = headerH(W, H), hx = 2 * u, hy = u === 2 ? 3 : 2;
    // like printClipped(): at most maxChars characters (and at most 39, its buffer)
    const clip = (x, y, t, maxChars, c) => { if (maxChars > 0) fb.text(x, y, t.slice(0, Math.min(39, maxChars)), c, u); };
    fb.fillRect(0, 0, W, HH, BK);
    const ver = `v${s.fw}`, verX = W - hx - textW(ver) * u;
    fb.text(verX, hy, ver, WH, u);
    clip(hx, hy, s.product, Math.trunc((verX - CW - hx) / CW), WH);   // cut before the version
    const lh = 7 * u, avail = H - 6 * u - lh - HH;   // room for the name and the lines (their sizes)
    const lines = 4 + (s.wifi != null ? 1 : 0) + (s.wifi != null && s.key ? 1 : 0);
    let pitch = 11 * u;
    while (pitch > 9 * u && 7 * 2 * u + 6 * u + (lines - 1) * pitch + lh > avail) pitch--;
    const blockH = (lines - 1) * pitch + lh;
    let z = 3 * u;
    while (z > 1 && (7 * z + 6 * u + blockH > avail || textW(s.product) * z + logoW(z) > W - 2 * hx)) z--;
    const gap = clamp(avail - 7 * z - blockH - 4 * u, 2 * u, 12 * u), group = 7 * z + gap + blockH;
    // the texts of the lines (the last one decides how far the text reaches down)
    const x = hx + 7 * CW, maxC = Math.trunc((W - x) / CW);   // value column
    const pin = p => (p < 0 ? "-" : String(p));
    const pinLine = `CS${pin(s.pins[0])} DC${pin(s.pins[1])} RST${pin(s.pins[2])} BUSY${pin(s.pins[3])}`;
    const last = s.wifi == null ? pinLine : s.key ? `Key ${s.key}` : s.wifi;
    // g, j, p, q, y , ; reach one font pixel below the line (the waiting line always has them)
    const down = /[gjpqy,;]/.test(last.slice(0, Math.min(39, maxC))) ? u : 0;
    // the waiting line as far from the last line above it as from the bottom edge, as seen (user);
    // the rest of the room goes above the name
    const free = H - HH - (group + down) - (lh + u), g = Math.trunc(free / 3), ty = HH + free - 2 * g, waitY = H - g - u - lh;
    const nx = Math.trunc((W - textW(s.product) * z - logoW(z)) / 2);   // logo bars + name, centred together
    drawLogo(fb, nx, ty + 7 * z, z);
    fb.text(nx + logoW(z), ty, s.product, BK, z);
    let y = ty + 7 * z + gap;
    fb.text(hx, y, "ID", BK, u);
    fb.text(x, y, s.id, BK, u);
    fb.text(x + u, y, s.id, BK, u);   // bold
    y += pitch;
    fb.text(hx, y, "Board", BK, u);
    clip(x, y, s.board, Math.trunc((W - x) / CW), BK);
    y += pitch;
    fb.text(hx, y, "Panel", BK, u);
    fb.text(x, y, `${s.panel} ${s.color ? "b/w/color" : "b/w"}`, BK, u);
    y += pitch;
    fb.text(hx, y, s.pinTitle, BK, u);
    clip(x, y, pinLine, maxC, BK);
    if (s.wifi != null) {
      y += pitch;
      fb.text(hx, y, "WiFi", BK, u);
      clip(x, y, s.wifi, maxC, BK);
      if (s.key) clip(x, y + pitch, `Key ${s.key}`, maxC, BK);   // how to set it up: the access point password
    }
    fb.text(hx, waitY, "Waiting for data from system ...", BK, u);
  }

  // m = { host, time, rows, warn, timer, ringDir, icons, pctBar, uptime, layout, disks, page, mono (black/white panel) }
  // The Conversation: the pictures of the "Nothing to ink" screen, three people sitting about, one
  // hex string per row (MSB = left pixel), the same tables as in the firmware: NOTHING_ART 118 x 60
  // (4.2"), NOTHING_ART_M the same
  // with the 2.13" bottle (longer neck, one row higher, like on the "Check connection" picture; user),
  // NOTHING_ART_S 96 x 49 for narrow panels (2.13" upright), all sampled from the same drawing.
  // red = x0, y0, x1, y1 of the bottle's content, in the third colour on colour panels (user)
  const NOTHING_ART = { w: 118, h: 60, red: [70, 14, 73, 27], bottle: [70, 14, 73, 25], cut: [[70, 18, -1], [73, 18, 1]], cup: [71, 25], rows: [
    "0000f8000000001fc00000000c0000",
    "0001fc000000003fa0000001fe0000",
    "0003fe00000000ff90000003ff8000",
    "0007cf00000000ff90000007ffc000",
    "00078700000001fff0000007ffc000",
    "00078700000001fff000000fcfe000",
    "000703c0000003e0f800000f8fe000",
    "0005fe80000003063000000f07c000",
    "00047f2000000306600000063be000",
    "000066d000000180e0000005b96000",
    "00020548000007c040000007984000",
    "00020d8800000461c000000381c000",
    "0005104800001fd380000001210000",
    "0004882e00001fd900000000030000",
    "003a703600003ffe01800000058000",
    "007f301700007ffe01800000418000",
    "00ff9f1f8000ffff018000003a7800",
    "01ffdf8f8000ffff81800000e7ff00",
    "07ffdfcf8001ffff83c00001cfff80",
    "1fffe7f78001ffff83c00003dfff80",
    "78fff7ffc003ffffc3c00007dffff0",
    "ff8ff7ffc003ffffc0c0000fbffff0",
    "ff87fbffc003fff7e0c0000fbffff8",
    "ffc7fbffc003fff7f0c0007f3fc07c",
    "ffe3fbbfc007fffff0c001ff7f8ffc",
    "7c71fd878074fffcfcc7ffff7f1ffc",
    "0335fd800046fffcffe7fff97e37fc",
    "012dfd81fc468004fff87ff9fe3678",
    "013ffd83fc3e8004fff03f82fed400",
    "01bffe8ffe427ffc78080002fe9400",
    "019fff7ffe7f7ffcbff80005ffe400",
    "019ffdffff1f7ffcffe0f80bffec00",
    "00dff3ffcf034004e000ff9bffe800",
    "00cfdfffbf834004f801ffe7ffe800",
    "00cfbffffb817ffcfe01fff3ffc800",
    "00c77ffffb813ffcfe01fffdffc800",
    "00c7fffdfbc13ffcff03fffe7fd800",
    "0067fffbfbc33ffcff07ffff9f9000",
    "0060ffcffbe33ffcff0fe7ffe79000",
    "007f0033fbe0bffcf71fdbfffb1000",
    "007ffff1fbe0efef8e3fbcffff3000",
    "007ffff0fbf0a004be7fbf00002000",
    "00320320f9f0bffcfc7fbeffffe000",
    "00320320f9f8bffcfc3fbcffffe000",
    "00320320f9c8a3e4f83fbc4c046000",
    "00320320789da3e4f81e3c4c046000",
    "0032032078ffa3e6f81e3c4c046000",
    "003fffe0787f23e6f07e3e4c046000",
    "003203e0787f31e6f0fc3e6fffe000",
    "00320320787f39eef1fc3e7c042000",
    "00320320787379fee7fc3c4c042000",
    "007fffe0782160e6cfec046c042000",
    "00640320780160e6cfcc1c7ffff000",
    "00640320780160e6cf8c1c4c023000",
    "006403207c0161f6c0003e4c021000",
    "006403207c0261f6e0007e4c021000",
    "00c003007e0263fef000fe0c001800",
    "00c003006f8243fef003f604001800",
    "0000000067c2c1f26007e600000000",
    "0000000000078003c0000000000000"] };
  const NOTHING_ART_M = { w: 118, h: 60, red: [70, 13, 73, 26], bottle: [70, 13, 73, 24], cup: [71, 24], rows: [
    "0000f8000000001fc00000000c0000",
    "0001fc000000003fa0000001fe0000",
    "0003fe00000000ff90000003ff8000",
    "0007cf00000000ff90000007ffc000",
    "00078700000001fff0000007ffc000",
    "00078700000001fff000000fcfe000",
    "000703c0000003e0f800000f8fe000",
    "0005fe80000003063000000f07c000",
    "00047f2000000306600000063be000",
    "000066d000000180e0000005b96000",
    "00020548000007c040000007984000",
    "00020d8800000461c000000381c000",
    "0005104800001fd380000001210000",
    "0004882e00001fd901800000030000",
    "003a703600003ffe01800000058000",
    "007f301700007ffe01800000418000",
    "00ff9f1f8000ffff018000003a7800",
    "01ffdf8f8000ffff83c00000e7ff00",
    "07ffdfcf8001ffff83c00001cfff80",
    "1fffe7f78001ffff83c00003dfff80",
    "78fff7ffc003ffffc0c00007dffff0",
    "ff8ff7ffc003ffffc0c0000fbffff0",
    "ff87fbffc003fff7e0c0000fbffff8",
    "ffc7fbffc003fff7f0c0007f3fc07c",
    "ffe3fbbfc007fffff0c001ff7f8ffc",
    "7c71fd878074fffcffc7ffff7f1ffc",
    "0335fd800046fffcffe7fff97e37fc",
    "012dfd81fc468004fff87ff9fe3678",
    "013ffd83fc3e8004fff03f82fed400",
    "01bffe8ffe427ffc78080002fe9400",
    "019fff7ffe7f7ffcbff80005ffe400",
    "019ffdffff1f7ffcffe0f80bffec00",
    "00dff3ffcf034004e000ff9bffe800",
    "00cfdfffbf834004f801ffe7ffe800",
    "00cfbffffb817ffcfe01fff3ffc800",
    "00c77ffffb813ffcfe01fffdffc800",
    "00c7fffdfbc13ffcff03fffe7fd800",
    "0067fffbfbc33ffcff07ffff9f9000",
    "0060ffcffbe33ffcff0fe7ffe79000",
    "007f0033fbe0bffcf71fdbfffb1000",
    "007ffff1fbe0efef8e3fbcffff3000",
    "007ffff0fbf0a004be7fbf00002000",
    "00320320f9f0bffcfc7fbeffffe000",
    "00320320f9f8bffcfc3fbcffffe000",
    "00320320f9c8a3e4f83fbc4c046000",
    "00320320789da3e4f81e3c4c046000",
    "0032032078ffa3e6f81e3c4c046000",
    "003fffe0787f23e6f07e3e4c046000",
    "003203e0787f31e6f0fc3e6fffe000",
    "00320320787f39eef1fc3e7c042000",
    "00320320787379fee7fc3c4c042000",
    "007fffe0782160e6cfec046c042000",
    "00640320780160e6cfcc1c7ffff000",
    "00640320780160e6cf8c1c4c023000",
    "006403207c0161f6c0003e4c021000",
    "006403207c0261f6e0007e4c021000",
    "00c003007e0263fef000fe0c001800",
    "00c003006f8243fef003f604001800",
    "0000000067c2c1f26007e600000000",
    "0000000000078003c0000000000000"] };
  const NOTHING_ART_S = { w: 96, h: 49, red: [57, 12, 59, 22], bottle: [57, 12, 59, 20], cup: [58, 20], rows: [
    "000780000000fc0000006000",
    "000fc0000001f8000007f000",
    "001fe0000007fa00000ff800",
    "003c6000000ff200001ffc00",
    "00382000000f3f00003f7e00",
    "002a7800000d2700003c3c00",
    "0023e400000834000018de00",
    "00237a00000c2c000015d600",
    "00104900001e0000001ec400",
    "0010510000312800000e0c00",
    "002c8900007e900000059000",
    "00d7868000ffe00000003800",
    "01f902c001ffe03000000800",
    "03fde3c001fff03000009fc0",
    "0ffef9c003fff87000073fe0",
    "1fff7de003fff87000067ff0",
    "71ff7fe003fffc30000efffc",
    "fe7f7ff007ff7c30001ffffe",
    "fe3ffff007ffbc30007ffffe",
    "ff9ff7f007ffbe3001fdf8ff",
    "798ff1e071ffdfb1fffdf1ff",
    "04aff00055ffcffbfff5e37f",
    "00eff07e55000ffc7fe7e35e",
    "00ffd1ff44ffcf043f0be940",
    "02ffefff7cffc7fc000fea40",
    "02ffdfff3effcff8781ffec0",
    "037f7ff706800e007f2ffe80",
    "037fffef82ffcf80ffeffe80",
    "033bffff82ffdfc0fff7fc80",
    "013fffffc2ffdfc1fff9fd80",
    "01bfffffc6ffdfc1fffef900",
    "0187f9ffe2ffdf47e7ff3900",
    "01fffe7de1fffccffffff300",
    "01fffe7df18033dfbe000200",
    "00d0247df1ffef9fbefffe00",
    "00d0247cf1ffef8fbcfffe00",
    "0090243cca8f2f07bc901600",
    "0090243c7e8f2f073c901600",
    "00fffc3c7e8f2e1f3c901600",
    "0090343c7eef2e1e3cdffe00",
    "0090243c7eefee7e3cf01200",
    "01fffc3c62876cfa18901200",
    "0190241c028729f61cffff00",
    "01a0241c028728e61c901300",
    "01a0243e0087ac003c901100",
    "0100243f048fac007c900900",
    "0300203f848fae01f4100980",
    "00000033c50f2c03e4000000",
    "000000000700180000000000"] };
  // The Intermission: the pictures of the "Check connection" screen (NO DATA), the same table and
  // chairs without the people and the bottle of the "Nothing to ink" picture (red = the bottle, third
  // colour; user): 172 x 93 in the pixels of the 4.2" (drawn 1x), the same tables as in the firmware
  const NODATA_ART = { w: 172, h: 93, red: [108, 5, 115, 32], bottle: [108, 5, 115, 32], glass: [117, 24, 123, 32], cup: [116, 32], rows: [
    "fff00000000000000000000000000000000000000000",
    "fff00000000000000000000000000000000000000000",
    "fff00000000000000000000000000000000000000000",
    "fff00000000000000000000000000000000000000000",
    "f0c0000000000000000000000000000000000000fff0",
    "f0c0000000000000000000000003c00000000000fff0",
    "3cc0000000000000000000000003c00000000000fff0",
    "3cc0000000000000000000000003c00000000000fff0",
    "3cc0000000000000000000000003c0000000000030f0",
    "3cc0000000000000000000000003c0000000000030f0",
    "3c30000000000000000000000003c0000000000033c0",
    "3c30000000000000000000000003c0000000000033c0",
    "3c30000000000000000000000003c0000000000033c0",
    "3c30000000000000000000000007e0000000000033c0",
    "0f3000000000000000000000000ff00000000000c3c0",
    "0f3000000000000000000000000ff00000000000c3c0",
    "0f3000000000000000000000000ff00000000000c3c0",
    "0f3000000000000000000000000ff00000000000c3c0",
    "0f3000000000000000000000000ff00000000000cf00",
    "0f30000000000000000000000000f00000000000cf00",
    "0f0c000000000000000000000000f00000000000cf00",
    "0f0c00000000000ff000000ff000f00000000000cf00",
    "03fc000000000fcff000000ff000f00000000000cf00",
    "03fc000000000fcc3000000c3000f00000000000cf00",
    "03cc000000000c0c3000000c3000f7f0000000030f00",
    "03cc000000000c0f3ffffffc3000f7f0000000030f00",
    "03cc000000000c0f3ffffffc3000f63000000003fc00",
    "03cc000000000c0f3000000c3000f63000000003fc00",
    "03c30000000003ff3000000c3000f3e0000000033c00",
    "03c30000000003ff3000000c3c0ff1c0000000033c00",
    "00f3000000000c033000000c3c0ff080000000033c00",
    "00f3000000000c030ffffffc0c0ff080000000033c00",
    "00f3000000000fff0ffffffc0c0ff3e00000000c3c00",
    "00f3000000000fffcc00000c3ffffff00000000c3c00",
    "00f3000000000fffcffffffc3ffffff00000000cf000",
    "00f3000000000fffcffffffc3ffffff00000000cf000",
    "00f30000000000ffcffffffc3fffff000000000cf000",
    "00f30000000000ffcc00000c3fffff000000000cf000",
    "003cc00000000000cc00000c300000000000000cf000",
    "003cc00000000000cc00000c300000000000000cf000",
    "003cc00000000000cc00000c300000000000000cf000",
    "003cc00000000000cffffffc300000000000000cf000",
    "003cc00000000000cffffffc3000000000000033c000",
    "003cc00000000000c3000f0c3000000000000033c000",
    "003fffffffffc000c3000f0c3000000000000033c000",
    "003fffffffffc000c3000f0c3000000000000033c000",
    "003fffffffffc000c3000f0c3000000000000033c000",
    "003fffffffffc000c3000f0c3000000000000033c000",
    "0003e00003c30000c3000f0c3000003fffffffffc000",
    "0003e00003c30000c30ffffc3ff0003fffffffffc000",
    "0003e00003c30000c30ffffc7ff0003fffffffffc000",
    "0003e00003c30000f3fc000c6070003fffffffffc000",
    "0003e00003c30000f3fc000c60f0000c3c00007c0000",
    "0003e00003c300003380000c61f0000c3c00007c0000",
    "0003e00003c300003380000c67b0000c3c00007c0000",
    "0003e00003c300003f00000fef30000c3c00007c0000",
    "0003e00003c300003f00000fff30000c3c00007c0000",
    "0003e00003c3000033fffffc7330000c3c00007c0000",
    "0003ffffffff000033fffffc7330000c3c00007c0000",
    "0003ffffffff0000330fcf0c7330000c3c00007c0000",
    "0003e00003c30000330ccf0c7330000ffffffffc0000",
    "0003e00003c30000330ccf0c7330000ffffffffc0000",
    "0003e00003c30000330ccf0c7330000c3c00007c0000",
    "0003e00003c30000330ccf0c3330000c3c00007c0000",
    "0003e00003c30000330ccf0c3330000c3c00007c0000",
    "0003e00003c30000f30ccf0f3330000c3c00007c0000",
    "000fffffffff0000f30ccf0f3330000c3c00006f0000",
    "000fffffffff0000c30ccf033330000c3c00006f0000",
    "000f600003c30000c30ccf033330000fffffffff0000",
    "000f600003c30000c30ccf033330000fffffffff0000",
    "000f600003c30000c30cfff33330000c3c00006f0000",
    "000f600003c30000c30cfff33330000c3c00006f0000",
    "000f600003c30000c30cffff3330000c3c00006f0000",
    "000f600003c30000cf0cffff3330000c3c00006f0000",
    "000f000003c30000cf0cc0033330000c3c00000f0000",
    "000f000003c00000cc0cc003333000003c00000f0000",
    "003c000003c00000cc0cc003333000003c000003c000",
    "003c000003c00000cc0cc003333000003c000003c000",
    "003c000003c00000cc0cc003333000003c000003c000",
    "003c000003c00000cc0cc003333000003c000003c000",
    "0000000000000000cc0cc00333300000000000000000",
    "0000000000000001cc0cc00333300000000000000000",
    "0000000000000001cc0cc00333300000000000000000",
    "00000000000000018c0cc00333300000000000000000",
    "00000000000000018c0cc00333300000000000000000",
    "00000000000000018c0fc00333f00000000000000000",
    "00000000000000018c0fc00333f00000000000000000",
    "00000000000000018c00000338000000000000000000",
    "00000000000000030c00000338000000000000000000",
    "00000000000000033c00000318000000000000000000",
    "00000000000000033c00000318000000000000000000",
    "0000000000000003f000000318000000000000000000",
    "0000000000000003f0000003f8000000000000000000"] };
  // the same at half size for the 2.13" (landscape and upright)
  const NODATA_ART_M = { w: 86, h: 47, red: [54, 2, 57, 15], bottle: [54, 2, 57, 15], glass: [59, 12, 61, 15], cup: [58, 15], rows: [
    "fc00000000000000000000",
    "fc00000000000000000000",
    "c8000000000001800000fc",
    "68000000000001800000fc",
    "680000000000018000004c",
    "6400000000000180000058",
    "64000000000003c0000058",
    "34000000000003c0000098",
    "34000000000003c0000098",
    "34000000000000c00000b0",
    "32000003c00000c00000b0",
    "1e00003a4003c0c00000b0",
    "1a0000237ffe40dc000130",
    "1a000023400240d40001e0",
    "1900001f7ffe43c8000160",
    "0d000021600223dc000160",
    "0d00003fbffe7ffc000260",
    "0d00003fa0027ffc0002c0",
    "0d00000fa0027ff00002c0",
    "06800000bffe40000002c0",
    "06800000903240000002c0",
    "0680000090324000000580",
    "07ffff8090324000000580",
    "07ffff8090324000000580",
    "01c0190093fe7c07ffff80",
    "01c01900dffefc07ffff80",
    "01c01900de02dc02600e00",
    "01c019007803fc02600e00",
    "01c019007ffff402600e00",
    "01ffff005ffed402600e00",
    "01c0190052b2d403fffe00",
    "01c0190052b2d402600e00",
    "01c01900d2b35402600e00",
    "03ffff00d2b35402600f00",
    "03c0190092b15403ffff00",
    "03c0190092fd5402600f00",
    "03c01900b2ff5402600f00",
    "03001900b2815402600300",
    "06001800a2815400600180",
    "06001800a2815400600180",
    "00000001a2815400000000",
    "00000001a2815400000000",
    "00000001a3815c00000000",
    "00000001a3817c00000000",
    "0000000160016000000000",
    "00000001e0016000000000",
    "00000001c001e000000000"] };
  // The Afterhours: the table of The Intermission with one column and a wide foot, both chairs upside down
  // on it, the bottle on the floor (red = the bottle; user); the quiet hours screen. 172 x 80 for the 4.2",
  // the same at half size (86 x 40) for the 2.13"; the floor on the row of the chairs of The Intermission
  const AFTER_ART = { w: 172, h: 80, red: [103, 52, 110, 79], bottle: [103, 52, 110, 79], cup: [82, 32], cold: true, clock: [40, -36], rows: [
    "0000000000f000000f0000000f000000f00000000000",
    "0000000000f000000f0000000f000000f00000000000",
    "0000000000f000000f0000000f000000f00000000000",
    "0000000000f000000f0000000f000000f00000000000",
    "00000000003c00000f0000000f000003c00000000000",
    "00000000003c00000f0c00030f000003c00000000000",
    "00000000003d80000f0c00030f00001bc00000000000",
    "00000000003d80000f0c00030f00001bc00000000000",
    "00000000003d80000f0c00030f00001bc00000000000",
    "00000000003d80000f0c00030f00001bc00000000000",
    "00000000003d80000f0c00030f00001bc00000000000",
    "00000000003d80000f0c00030f00001bc00000000000",
    "00000000003ffffffffc0003ffffffffc00000000000",
    "00000000003ffffffffc0003ffffffffc00000000000",
    "00000000000f80000f0c00030f00001f000000000000",
    "00000000000f80000f0c00030f00001f000000000000",
    "00000000000f80000f0c00030f00001f000000000000",
    "00000000000f80000f0c00030f00001f000000000000",
    "00000000000f80000f0c00030f00001f000000000000",
    "00000000000f80000f0c00030f00001f000000000000",
    "00000000000ffffffffc0003ffffffff000000000000",
    "00000000000ffffffffc0003ffffffff000000000000",
    "00000000000f80000f0c00030f00001f000000000000",
    "00000000000f80000f0c00030f00001f000000000000",
    "00000000000f80000f0c00030f00001f000000000000",
    "00000000000f80000f0c00030f00001f000000000000",
    "00000000000f80000f0c00030f00001f000000000000",
    "00000000000f80000f0c00030f00001f000000000000",
    "00000000000f80000f0c00030f00001f000000000000",
    "0000000000ffffffffff000ffffffffff00000000000",
    "0000000000ffffffffff000ffffffffff00000000000",
    "0000000000ffffffffff000ffffffffff00000000000",
    "0000000000ffffffffff000ffffffffff00000000000",
    "0000000000f3fffffffffffffffffffcf00000000000",
    "0000000000f3fffffffffffffffffffcf00000000000",
    "0000000000f3fffffffffffffffffffcf00000000000",
    "0000000000f300000003fffc0000000cf00000000000",
    "0000000000f300000003fffc0000000cf00000000000",
    "0000000000f3000000000f000000000cf00000000000",
    "0000000003cc000000000f00000000033c0000000000",
    "0000000003cc000000000f00000000033c0000000000",
    "0000000003cc000000000f00000000033c0000000000",
    "0000000003cc000000000f00000000033c0000000000",
    "0000000003cc000000000f00000000033c0000000000",
    "0000000003cc000000000f00000000033c0000000000",
    "0000000003cc000000000f00000000033c0000000000",
    "0000000003cc000000000f00000000033c0000000000",
    "000000000f0c000000000f00000000030f0000000000",
    "000000000f0c000000000f00000000030f0000000000",
    "000000000f30000000000f0000000000cf0000000000",
    "000000000f30000000000f0000000000cf0000000000",
    "000000000f30000000000f0000000000cf0000000000",
    "000000000f30000000000f0000780000cf0000000000",
    "000000000ff0000000000f0000780000ff0000000000",
    "000000000ff0000000000f0000780000ff0000000000",
    "000000003c30000000000f0000780000c3c000000000",
    "000000003c30000000000f0000780000c3c000000000",
    "000000003cc0000000000f000078000033c000000000",
    "000000003cc0000000000f000078000033c000000000",
    "000000003cc0000000000f000078000033c000000000",
    "000000003cc0000000000f0000fc000033c000000000",
    "000000003cc0000000000f0001fe000033c000000000",
    "000000003cc0000000000f0001fe000033c000000000",
    "00000000f0c0000000000f0001fe000030f000000000",
    "00000000f0c0000000000f0001fe000030f000000000",
    "00000000f0c0000000000f0001fe000030f000000000",
    "00000000f0c0000000000f00001e000030f000000000",
    "00000000f300000000000f00001e00000cf000000000",
    "00000000f300000000000f00001e00000cf000000000",
    "00000000f300000000000f00001e00000cf000000000",
    "00000000f300000000000f00001e00000cf000000000",
    "00000003c300000000000f00001e00000c3c00000000",
    "00000003c300000000000f00001e00000c3c00000000",
    "00000003ffc0000000000f00001e00003ffc00000000",
    "00000003ffc000000000fff0001e00003ffc00000000",
    "00000003ffc000000000fff0001e00003ffc00000000",
    "00000003ffc00000000fffff01fe00003ffc00000000",
    "0000000000000000000fffff01fe0000000000000000",
    "000000000000000000fffffff1fe0000000000000000",
    "000000000000000000fffffff1fe0000000000000000"] };
  const AFTER_ART_M = { w: 86, h: 40, red: [52, 26, 55, 39], bottle: [52, 26, 55, 39], cup: [41, 15], cold: true, clock: [20, -18], rows: [
    "00000c0030003000c00000",
    "00000c0030003000c00000",
    "0000060033033001800000",
    "0000078033033007800000",
    "0000078033033007800000",
    "0000078033033007800000",
    "000007ffff03ffff800000",
    "0000038033033007000000",
    "0000038033033007000000",
    "0000038033033007000000",
    "000003ffff03ffff000000",
    "0000038033033007000000",
    "0000038033033007000000",
    "0000038033033007000000",
    "00000fffff03ffffc00000",
    "00000fffff03ffffc00000",
    "00000dfffffffffec00000",
    "00000dfffffffffec00000",
    "00000d0001fe0002c00000",
    "00001a0000300001600000",
    "00001a0000300001600000",
    "00001a0000300001600000",
    "00001a0000300001600000",
    "0000320000300001300000",
    "0000340000300000b00000",
    "0000340000300000b00000",
    "00003c0000300600f00000",
    "0000640000300600980000",
    "0000680000300600580000",
    "0000680000300600580000",
    "0000680000300f00580000",
    "0000c80000300f004c0000",
    "0000c80000300f004c0000",
    "0000d000003003002c0000",
    "0000d000003003002c0000",
    "0001900000300300260000",
    "0001f800003003007e0000",
    "0001f80000fc03007e0000",
    "0000000003ff0f00000000",
    "000000000fffcf00000000"] };
  // draws picture a at x, y with every picture pixel s x s; third = colour of the bottle's content.
  // cut: [x, y, side] pixels that lose their upper outer quarter when drawn 2x or bigger (side -1 left,
  // 1 right): the bottle's step from the neck to the shoulder, half a picture pixel high (user)
  // drink (Advanced Ink, Beverages): 0 House Wine (bottle and glass), 1 Tabula Rasa (without them; a.bottle,
  // a.glass: the regions they take), 2 Roast (a coffee cup instead, see drawCup); cup = its pixel size
  function drawArt(fb, a, x, y, s, third, drink, cup = 1) {
    const sober = drink === 1 || drink === 2;
    const [rx0, ry0, rx1, ry1] = a.red, gone = sober ? [a.bottle, a.glass].filter(Boolean) : [];
    const off = (c, r) => gone.some(([x0, y0, x1, y1]) => c >= x0 && c <= x1 && r >= y0 && r <= y1);
    a.rows.forEach((hex, r) => {
      for (let c = 0; c < a.w; c++)
        if ((parseInt(hex.substr((c >> 3) * 2, 2), 16) >> (7 - (c & 7))) & 1 && !off(c, r))
          fb.fillRect(x + c * s, y + r * s, s, s, !sober && c >= rx0 && c <= rx1 && r >= ry0 && r <= ry1 ? third : BK);   // sober: what is left of its foot black, like the table
    });
    const q = s >> 1;
    if (q && !sober) for (const [c, r, side] of a.cut || []) fb.fillRect(x + c * s + (side > 0 ? s - q : 0), y + r * s, q, q, WH);
    if (drink === 2 && a.cup) drawCup(fb, x + a.cup[0] * s, y + (a.cup[1] + 1) * s - 1, cup, third, !a.cold);
  }
  // Roast (Beverages): a coffee cup in display pixels of size z (1 on the 2.13", 2 on the 4.2", the same in
  // every picture; user), its bottom left pixel at x, y; the cup in the third colour, the steam black
  // (none on The Afterhours: a cold cup left at closing time)
  // The Afterhours, Got the time?: a wall clock 19 x 19 in pixels of size z (1 on the 2.13", 2 on the 4.2", like
  // the cup), centred on x, y, black: ring, a tick for every hour, hands for h:mi (the time now; user). The
  // ticks and the hand tips come from tables (the same in the firmware), so both draw the same pixels:
  // x, y from the middle; the tips per 6 degrees (minute hand 7 px, hour hand 5 px, its place = hour * 5 +
  // minutes / 12)
  const CLOCK_TICKS = [0, -7, 3, -6, 6, -4, 7, 0, 6, 3, 3, 6, 0, 7, -4, 6, -6, 4, -7, 0, -6, -4, -4, -6];
  const CLOCK_MIN = [0, -7, 1, -7, 1, -7, 2, -7, 3, -6, 3, -6, 4, -6, 5, -5, 5, -5, 6, -4, 6, -4, 6, -3, 7, -2, 7, -1, 7, -1, 7, 0, 7, 1, 7, 1, 7, 2, 6, 3, 6, 3, 6, 4, 5, 5, 5, 5, 4, 6, 3, 6, 3, 6, 2, 7, 1, 7, 1, 7, 0, 7, -1, 7, -1, 7, -2, 7, -3, 6, -4, 6, -4, 6, -5, 5, -5, 5, -6, 4, -6, 4, -6, 3, -7, 2, -7, 1, -7, 1, -7, 0, -7, -1, -7, -1, -7, -2, -6, -3, -6, -4, -6, -4, -5, -5, -5, -5, -4, -6, -4, -6, -3, -6, -2, -7, -1, -7, -1, -7];
  const CLOCK_HOUR = [0, -5, 1, -5, 1, -5, 2, -5, 2, -5, 2, -4, 3, -4, 3, -4, 4, -3, 4, -3, 4, -3, 5, -2, 5, -2, 5, -1, 5, -1, 5, 0, 5, 1, 5, 1, 5, 2, 5, 2, 4, 2, 4, 3, 4, 3, 3, 4, 3, 4, 2, 4, 2, 5, 2, 5, 1, 5, 1, 5, 0, 5, -1, 5, -1, 5, -2, 5, -2, 5, -3, 4, -3, 4, -3, 4, -4, 3, -4, 3, -4, 3, -5, 2, -5, 2, -5, 1, -5, 1, -5, 0, -5, -1, -5, -1, -5, -2, -5, -2, -4, -3, -4, -3, -4, -3, -3, -4, -3, -4, -3, -4, -2, -5, -2, -5, -1, -5, -1, -5];
  function lineTo(x1, y1) {   // the pixels from 0, 0 to x1, y1 (Bresenham)
    const pts = [], dx = Math.abs(x1), dy = -Math.abs(y1), sx = x1 > 0 ? 1 : -1, sy = y1 > 0 ? 1 : -1;
    let x = 0, y = 0, err = dx + dy;
    for (;;) {
      pts.push([x, y]);
      if (x === x1 && y === y1) return pts;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  function drawWallClock(fb, x, y, z, h, mi) {
    const c = 9, pts = [];
    for (let dy = -c; dy <= c; dy++)
      for (let dx = -c; dx <= c; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > c * c - c && d2 <= c * c + c) pts.push([dx, dy]);
      }
    for (let k = 0; k < 12; k++) pts.push([CLOCK_TICKS[2 * k], CLOCK_TICKS[2 * k + 1]]);
    const hi = (h % 12) * 5 + Math.floor(mi / 12);
    pts.push(...lineTo(CLOCK_HOUR[2 * hi], CLOCK_HOUR[2 * hi + 1]), ...lineTo(CLOCK_MIN[2 * mi], CLOCK_MIN[2 * mi + 1]));
    for (const [dx, dy] of pts) fb.fillRect(x + dx * z, y + dy * z, z, z, BK);
  }
  const CUP = ["###..", "####.", "####.", "###.."];
  const STEAM = [".s..s", "s..s.", ".s..s", "....."];
  function drawCup(fb, x, y, z, third, steam) {
    const shape = (steam ? STEAM : []).concat(CUP), top = y + 1 - shape.length * z;
    shape.forEach((row, r) => [...row].forEach((c, k) => {
      if (c !== ".") fb.fillRect(x + k * z, top + r * z, z, z, c === "#" ? third : BK);
    }));
  }

  // message, text size, picture and its scale of the "Check connection" (noData) or "Nothing to ink"
  // screen: triple size on the 4.2", double on the 2.13", smaller while wider than W - 8; "Nothing to
  // ink": the people (4.2" its own bottle), the narrow one where 1x does not fit (2.13" upright), as big
  // as fits (whole multiples, at most as wide as the text unless 1x); "Check connection": the empty
  // table (4.2" its own picture, 2.13" the half-size one), only 1x; the quiet hours screen like
  // "Check connection" with The Afterhours (kind D = Check connection, N = Nothing to ink, Q = quiet hours).
  // The texts only with Caption (user); they always set how big the pictures are
  function msgArt(kind, W, H, HH, wide, text) {
    const msg = text || (kind === "D" ? "Check connection" : kind === "Q" ? "Closed" : "Nothing to ink");
    let ms = wide ? 3 : 2;
    while (ms > 1 && textW(msg) * ms > W - 8) ms--;
    const A = kind === "D" ? (wide ? NODATA_ART : NODATA_ART_M) : kind === "Q" ? (wide ? AFTER_ART : AFTER_ART_M)
      : wide ? NOTHING_ART : NOTHING_ART_M.w <= W - 4 ? NOTHING_ART_M : NOTHING_ART_S;
    let as = 0;
    for (let s = 1; A.w * s <= W - 4 && A.h * s + 10 * ms <= H - HH - 8 && (s === 1 || (kind === "N" && A.w * s <= textW(msg) * ms)); s++) as = s;
    return { msg, ms, A, as, gh: as ? A.h * as + 3 * ms : 0 };
  }

  function drawScreen(fb, m) {
    onThird = m.yellow ? BK : WH;
    const W = fb.w, wanted = m.rows || 0, head = headerOn(m);
    const wide = isBig(W, fb.h), hs = wide ? 2 : 1, hx = wide ? 4 : 2;
    const stacked = W < fb.h;   // upright: device | used/total, the pool in a second line
    const nets = m.nets || [];
    const counts = pageCounts(m.disks.length, fb.h, wanted, W, !!m.sys, !!m.wifiPage, head, nets.length, !!m.clock, !!m.netPages, m.diskPages !== 0,
      m.dockerPage ? (m.containers || []).length : -1);
    // pages with a picture in the page turn (m.extraPages)
    // (m.extraOnly: every page off, the pictures in the page turn are all there is)
    const pages = (m.extraOnly ? 0 : Object.values(counts).reduce((x, y) => x + y, 0)) + (m.extraPages || 0);
    // a screen with only a picture, no text (user): The Intermission on no data ("Check connection"),
    // The Conversation when every page is switched off (no system page, no network or WiFi page, disk
    // pages off: "Nothing to ink"), or m.art (N The Conversation, D The Intermission, Q The Afterhours:
    // its time window, or its page in the page turn). The header only when
    // switched on for that picture (m.artHead: the letters with a header). All pictures share one block
    // as high as the tallest, centred in the rest, every picture standing on its bottom, so the
    // pictures stand at the same height (user); always below the room of a header, also when the
    // header is off, so they match there too (user). Caption (m.artCap: the letters with one; only when
    // the case shows the picture, not for m.art): "Nothing to ink" / "Check connection" below it as
    // before: the block as high as the taller picture with its text, the text at its bottom
    const nothing = !m.sys && !m.wifiPage && !m.clock && !nets.length && !m.netPages && !m.dockerPage && m.disks.length === 0 && m.diskPages === 0;
    // Advanced Ink: "Nothing to ink" switched off = only the top line ("Check connection" off: the
    // pages go on, m.noData stays false)
    const art = m.art || (m.noData ? "D" : nothing && ((m.screens ?? 7) & 2) ? "N" : "");
    if (art) {
      if ((m.artHead || "").includes(art)) drawHeader(fb, m, pages, wide);
      // fixed places per display (user): one block below the room of a header, as high as the tallest
      // picture plus the room of one caption line (3 + 7 times the caption size), centred; every picture
      // stands on its bottom line and every caption starts 3 font pixels below it, with or without
      // header, caption or a second caption line (the pictures never move)
      const MH = headerH(W, fb.h);
      const K = ["D", "N", "Q"].map(k => msgArt(k, W, fb.h, MH, wide)), S = Math.max(K[0].ms, K[1].ms);
      // one caption size C per display for every caption (user): m.nextFw (the firmware with the pictures) plain
      // 5x7 on every 2.13" (the same on both resolutions), on the 4.2" the size of "Check connection";
      // else S, as the firmware draws it now
      const C = m.nextFw && !wide ? 1 : S;
      const pic = Math.max(...K.map(o => o.A.h * o.as)), bh = pic + 10 * C;
      const top = MH + Math.trunc((fb.h - MH - bh) / 2), base = top + pic + 3 * C;
      // The Afterhours in its time window with Caption (m.until = its end): "Closed until 07:00" in the
      // time format of the display ("07:00AM"); too wide for 4 font pixels to each edge: the time in a
      // second line below (user: the time is never left out)
      let msg, msg2;
      if (m.art === "Q" && m.until) {
        const until = headTime(m.until, m.timeFmt);
        msg = `Closed until ${until}`;
        if (textW(msg) * C > W - 8 * C) { msg = "Closed until"; msg2 = until; }
      }
      const L = msgArt(art, W, fb.h, MH, wide, msg);
      const ax = Math.trunc((W - L.A.w * L.as) / 2), ay = top + pic - L.A.h * L.as;
      if (L.as) drawArt(fb, L.A, ax, ay, L.as, m.mono ? BK : RD, m.sober ?? 1, wide ? 2 : 1);
      // Got the time? (m.wallArts: the pictures with it, m.wallTime: the time now): a wall clock, in every
      // picture at the same place of the display, the one above the left chair of The Afterhours (user)
      const Q = K[2];
      if (L.as && Q.as && m.wallTime && (m.wallArts || "").includes(art))
        drawWallClock(fb, Math.trunc((W - Q.A.w * Q.as) / 2) + Q.A.clock[0] * Q.as, top + pic - Q.A.h * Q.as + Q.A.clock[1] * Q.as,
          wide ? 2 : 1, m.wallTime.h, m.wallTime.mi);
      if (msg || (!m.art && (m.artCap || "").includes(art))) fb.text(Math.trunc((W - textW(L.msg) * C) / 2), base, L.msg, BK, C);
      if (msg2) fb.text(Math.trunc((W - textW(msg2) * C) / 2), base + 9 * C, msg2, BK, C);
      return;
    }
    const [kind, idx] = pageAt(m.page, m.order, counts);
    // the time page without the header line (H field 29: Show header off)
    const bare = kind === "T" && m.clockHead === 0 && !m.noData;
    const HH = bare ? 0 : headerH(W, fb.h, head);
    if (!bare) drawHeader(fb, m, pages, wide);
    // every page off and no picture for it: the top line only; m.nextFw (the firmware with the pictures): the
    // product name with its logo bars below it, as on the start screen without its lines, centred in the
    // room below a header (also without one, so it stays in its place; user)
    if (nothing) {
      if (m.nextFw) {
        const u = wide ? 2 : 1, MH = headerH(W, fb.h), name = "InkSights";
        let z = 3 * u;
        while (z > 1 && (textW(name) * z + logoW(z) > W - 4 * u || 7 * z > fb.h - MH - 8)) z--;
        const nx = Math.trunc((W - textW(name) * z - logoW(z)) / 2), ty = MH + Math.trunc((fb.h - MH - 7 * z) / 2);
        drawLogo(fb, nx, ty + 7 * z, z);
        fb.text(nx + logoW(z), ty, name, BK, z);
      }
      return;
    }
    if (kind === "S") { m.sys.stby = m.stby === 1; drawSystem(fb, m.sys, HH, wide, stacked); return; }
    if (kind === "W") { drawWifi(fb, m.wifi || {}, HH, wide, stacked, m.wifiIcons); return; }
    // the time page (m.now: the time to show, else the time of the frame)
    // m.nextFw (the firmware with the pictures): time and date in the place they have with a header, also
    // without one, so switching the header moves nothing (user)
    if (kind === "T") { drawClockPage(fb, m.clock, m.now || clockParts(m.clock.dt), m.timeFmt, m.nextFw ? headerH(W, fb.h) : HH, m.mono ? BK : RD); return; }
    const rows = rowsPerPage(fb.h, wanted, W, head), rowH = rowHeight(fb.h, wanted, W, head), first = idx * rows;
    // network pages, every page sized for as many rows as the fullest one
    if (kind === "N") {
      if (!nets.length) { fb.text(hx, HH + 6, "No interfaces", BK, hs); return; }   // network pages on, no interface
      const part = nets.slice(idx * rows, idx * rows + rows).map(n => netRow(n, m.netBar || 0));
      drawRows(fb, part, HH, wide, stacked, m.netIcons !== 0, false, Math.min(nets.length, rows));
      return;
    }
    // Docker pages: one row per container, sized like the network pages; none to show: what the filter
    // looked for (H field 33)
    if (kind === "K") {
      const cs = m.containers || [];
      if (!cs.length) {   // none to show: no Docker at all, or what the filter looked for (H field 33)
        const none = m.dockerNone ? "Docker not found" : ["No Docker containers", "No Docker errors", "Docker up to date", "No Docker errors or updates"][m.dockerFilter || 0];
        wrapped(fb, hx, HH + 6, none, hs);
        return;
      }
      const part = cs.slice(idx * rows, idx * rows + rows).map(c => dockerRow(c, m.mono || m.dockerColor === 0 ? BK : RD, m.dockerHi === 1));
      drawRows(fb, part, HH, wide, stacked, m.dockerPage === 1, 2, rows);   // a list: always from the top
      return;
    }
    if (m.disks.length === 0) { fb.text(hx, HH + 6, "No drives", BK, hs); return; }
    // upright: the same fonts, bar, symbol and timer sizes as in landscape with as many rows
    const sc = wide ? scaleWide(rowH, rows, stacked) : SCALE_213[clamp(rows, 2, 5)];
    const o = {
      small: !wide,
      x0: wide ? 4 : 2,
      icon: m.icons === 0 ? 0 : wide ? Math.max(21, (sc.bar + 3) | 1) : (sc.bar + 3) | 1,   // symbol box (odd), 0 = symbols off
      stacked,
      timer: clamp(m.timer || 0, 0, 1),
      ringW: wide ? (sc.bar >= 26 ? 4 : 3) : sc.bar >= 10 ? 2 : 1,
    };
    let lay = rowLayout(W, rowH, sc, m.disks, o);
    // landscape: a pool name that does not fit beside device and used/total gets its own second line
    // (like upright), if the rows are tall enough for it (e.g. 2.13" with 2 rows)
    if (!stacked && !poolsFit(lay, m.disks, m.pctBar)) {
      const two = rowLayout(W, rowH, sc, m.disks, { ...o, stacked: true });
      // used/total in the pool line, ending with the bar (before the timer column)
      two.capBelow = true;
      if (two.g) two.textEnd = two.boxX - 5;
      if (two.contentH <= rowH) lay = two;
    }
    // upright: when used/total does not fit beside a device name, it gets its own third line, so the
    // pool keeps its whole line (if the rows are tall enough for it, e.g. 2.13" with 2 or 3 rows)
    if (stacked && m.disks.some(d => d.pct >= 0 && lay.textEnd - fW(lay.cap, capText(d, lay, m.pctBar)) < lay.devX + fW(lay.dev, d.dev) + 4)) {
      const three = rowLayout(W, rowH, sc, m.disks, { ...o, capLine: true });
      if (three.contentH <= rowH) lay = three;
    }
    lay.ccw = m.ringDir === 1;   // progress rings counterclockwise
    lay.pctBar = m.pctBar;   // details inside the bar: 0 none, 1 percentage, 2 used capacity
    lay.driveTemp = m.driveTemp === 1;   // temperatures in the rows (H field 21)
    lay.stby = m.stby === 1;             // asleep hard disks "STBY" instead of "--" (H field 22)
    // Symbol style by panel, the same in every rotation: the 4.2" style, or on the 2.13" the style of
    // its symbol size (9 / 11 / 13 / 17 px = 5 / 4 / 3 / 2 rows in landscape; upright: 11 px)
    const big = wide, B = lay.iconBox;
    lay.deepChip = big && rows === 2;    // 4.2" with 2 rows: deeper chip notches
    lay.boldDots = big;                  // asleep ring: bold dots on the 4.2", single pixels on the 2.13"
    lay.shineTurned = !big && (B === 11 || B === 13);   // shine turned by 45°
    lay.greyToRim = !big && B === 17;    // checkerboard up to the rim
    lay.greyWider = !big && B === 11;    // checkerboard one pixel wider
    for (let i = 0; i < rows && first + i < m.disks.length; i++)
      drawDisk(fb, m.disks[first + i], HH + 2 + i * rowH + lay.rowDy, lay, m.warn ?? L.WARN_PCT, !!m.mono);
  }

  // ------------------------------------------------------------ system page
  // Rows, each one chosen on the settings page (components in the S line: C R N V S; I = symbols
  // left of the rows, like on the disk pages):
  //   C  CPU     load | temperature, power | bar = load
  //   R  RAM     used by programs / total | ZFS cache | bar: black programs, grey ZFS cache, light free
  //   N  network interface | down | up | bar = the busier direction of the link speed; without a link
  //              speed the values below the name instead
  //   V  NVMe    temperatures (no bar)
  //   S  SSD     temperatures of the SATA / SAS SSDs (no bar)
  // A temperature row without drives is left out. Like a disk row: name | info | value, the bar
  // below; upright the info gets its own second line (network: down and up together in it,
  // temperatures below the name). Sizes like a disk page with as many rows.
  const kib = v => (v > 0 ? hsize(v * 1024) : "0K"), mib = v => hsize(v * 1048576);   // KiB/s (0 = "0K"), MiB
  // Link speed in Mb/s -> "100M", "1G", "2.5G"
  const linkText = mbs => (mbs >= 1000 ? `${Math.trunc(mbs / 100) / 10}G` : `${mbs}M`);
  // A network row (system page and network pages): name | down | up, the bar = the busier
  // direction of the link speed (none without a link speed, e.g. bridges: the values below the
  // name instead). Symbol: WiFi for a wireless interface, else the network one. Down (switched off)
  // or without a link (no cable, not connected to a WiFi network): "down" / "no link" in the bar's
  // place instead of the values. barMode (network pages): details in the bar 1 percentage / 2 link speed.
  function netRow(n, barMode) {
    const icon = n.wifi ? "wifi" : "net";
    if (n.state === "D" || n.state === "L") return { icon, label: n.name, info: n.state === "D" ? "down" : "no link", value: "", bar: null, pair: true };
    const busy = Math.max(n.rx, n.tx);
    const pct = n.link > 0 && busy >= 0 ? clamp(Math.floor(busy * 8192 / (n.link * 10000)), 0, 100) : -1;   // KiB/s of Mb/s
    return { icon, label: n.name, info: n.rx >= 0 ? DOWN + kib(n.rx) : "", value: n.tx >= 0 ? UP + kib(n.tx) : "--",
      bar: pct >= 0 ? [pct, pct] : null, pair: true,   // down and up belong together
      barText: pct < 0 ? null : barMode === 1 ? `${pct}%` : barMode === 2 ? linkText(n.link) : null };
  }
  // A text at x, y in size z, on two lines when it is wider than the screen (upright): broken at the
  // last space that lets the first line fit
  function wrapped(fb, x, y, s, z) {
    const max = Math.trunc((fb.w - 2 * x + z) / (L.CHAR_W * z));
    let lines = [s];
    if (s.length > max) { const i = s.lastIndexOf(" ", max); if (i > 0) lines = [s.slice(0, i), s.slice(i + 1)]; }
    lines.forEach((t, i) => fb.text(x, y + i * 10 * z, t, BK, z));
  }
  // A container of the Docker pages: its name, its state (running / error / stopped; error in the third
  // colour) and "update" at the right when a newer image is out (third colour). Text rows like the
  // temperature rows; upright the state below the name.
  // Highlight (H field 35): "error" and "update" white in a box of that colour instead (black on a yellow box)
  const DOCKER_STATES = { R: "running", E: "error", S: "stopped" };
  function dockerRow(c, third, hi) {
    const on = third === BK ? WH : onThird;
    return { icon: "docker", label: c.name, info: DOCKER_STATES[c.st] || "--", infoC: c.st === "E" ? (hi ? on : third) : BK, infoBox: c.st === "E" && hi ? third : null,
      value: c.upd ? "update" : "", valueC: hi ? on : third, valueBox: hi ? third : null, inline: true };
  }

  function sysRows(sys) {
    const rows = [], on = c => sys.parts.includes(c);
    const temps = list => list.map(t => tempText(t, sys.stby)).join(" ");
    const pct = (a, b) => (b > 0 && a >= 0 ? clamp(Math.floor(a * 100 / b), 0, 100) : -1);
    const cpuInfo = [sys.temp >= 0 ? `${sys.temp}${DEG}C` : "", sys.power >= 0 ? `${sys.power}W` : ""].filter(Boolean).join(" ");
    if (on("C")) rows.push({ icon: "cpu", label: "CPU", info: cpuInfo, value: sys.cpu >= 0 ? `${sys.cpu}%` : "--", bar: sys.cpu >= 0 ? [sys.cpu, sys.cpu] : null });
    const ramOk = sys.ramTotal > 0 && sys.ramUsed >= 0;
    if (on("R")) rows.push({ icon: "ram", label: "RAM", info: ramOk && sys.ramArc > 0 ? `ZFS ${mib(sys.ramArc)}` : "",
      value: ramOk ? `${mib(sys.ramUsed)}/${mib(sys.ramTotal)}` : "--",
      bar: ramOk ? [pct(sys.ramUsed, sys.ramTotal), pct(sys.ramUsed + Math.max(0, sys.ramArc), sys.ramTotal)] : null });
    if (on("N")) rows.push(netRow({ name: sys.iface || "NET", rx: sys.rx, tx: sys.tx, link: sys.link, wifi: sys.wifiNet, state: sys.netState }, 0));
    if (on("V") && sys.nvme.length) rows.push({ icon: "chip", label: "NVMe", info: temps(sys.nvme), value: "", bar: null, inline: true });
    if (on("S") && sys.ssd.length) rows.push({ icon: "chip", label: "SSD", info: temps(sys.ssd), value: "", bar: null, inline: true });
    // HDD temperatures (T line, from drive-temp-export; asleep = "--" or "STBY")
    // the symbol shows the state: asleep when all hard disks are asleep (-2), spinning as soon as one runs (user)
    if (on("H") && sys.hdd && sys.hdd.length) rows.push({ icon: sys.hdd.every(t => t === -2) ? "hddAsleep" : "hdd", label: "HDD", info: temps(sys.hdd), value: "", bar: null, inline: true });
    return rows;
  }
  // Bar of the system page: black up to p1 %, grey up to p2 %, light after that
  // text: details in the bar (network pages), like on the disk bars
  function drawSysBar(fb, x, y, w, h, p1, p2, text = null, size = 1) {
    fb.drawRect(x, y, w, h, BK);
    const iw = w - 2, ih = h - 2;
    let u1 = Math.trunc(iw * p1 / 100), u2 = Math.trunc(iw * p2 / 100);
    if (p1 > 0 && u1 === 0) u1 = 1;
    if (p2 > p1 && u2 <= u1) u2 = u1 + 1;
    u2 = Math.min(Math.max(u2, u1), iw);
    if (u1 > 0) fb.fillRect(x + 1, y + 1, u1, ih, BK);
    fillRaster(fb, x + 1 + u1, y + 1, u2 - u1, ih);
    barText(fb, x, y, w, h, u1, text, size);
  }
  // Symbols of the system page in a box of B px (odd), integer maths only (the firmware draws the same):
  //   CPU: square body with a 1 px outline, 1 px pins every 2 px on all four sides, a black die in the
  //        middle (the storage chip of NVMe / SSD has a thick hollow body instead)
  //   RAM: memory module: a wide frame, black memory chips in its upper half, contacts below it
  //   network: three boxes joined by lines (one at the top, two at the bottom)
  function drawCpu(fb, x, y, B) {
    const p = B >= 17 ? 3 : B >= 11 ? 2 : 1, L = B - 2 * p - 2, m = Math.max(1, Math.trunc(L / 4)), d = L - 2 * m;
    fb.drawRect(x + p, y + p, B - 2 * p, B - 2 * p, BK);
    for (let c = p + 1; c <= p + L; c += 2) {
      fb.fillRect(x + c, y, 1, p, BK); fb.fillRect(x + c, y + B - p, 1, p, BK);
      fb.fillRect(x, y + c, p, 1, BK); fb.fillRect(x + B - p, y + c, p, 1, BK);
    }
    fb.fillRect(x + p + 1 + m, y + p + 1 + m, d, d, BK);
  }
  function drawRam(fb, x, y, B) {
    const q = Math.trunc(B / 4), h = B - 2 * q, y0 = y + q;
    fb.drawRect(x, y0, B, h, BK);
    for (let i = 1; i < B - 1; i += 2) fb.pixel(x + i, y0 + h, BK);   // contacts below the module
    // memory chips in the upper half, a gap of 2 px between them
    const n = B >= 17 ? 4 : 3, g = B >= 13 ? 2 : 1, iw = B - 4, cw = Math.max(1, Math.trunc((iw - (n - 1) * g) / n));
    const used = n * cw + (n - 1) * g, left = x + 2 + Math.trunc((iw - used) / 2), ch = Math.max(1, Math.trunc((h - 3) / 2));
    for (let k = 0; k < n; k++) fb.fillRect(left + k * (cw + g), y0 + 2, cw, ch, BK);
  }
  function drawNet(fb, x, y, B) {
    const s = Math.trunc(B / 3) | 1, mid = Math.trunc(B / 2), cx = (B - 1) / 2, c = (s - 1) / 2;
    const box = (bx, by) => (s >= 5 ? fb.drawRect(bx, by, s, s, BK) : fb.fillRect(bx, by, s, s, BK));
    box(x + (B - s) / 2, y);
    box(x, y + B - s);
    box(x + B - s, y + B - s);
    fb.fillRect(x + cx, y + s, 1, mid - s + 1, BK);                   // down from the top box
    fb.fillRect(x + c, y + mid, B - 2 * c, 1, BK);                     // across
    fb.fillRect(x + c, y + mid, 1, B - s - mid, BK);                   // down to the bottom boxes
    fb.fillRect(x + B - 1 - c, y + mid, 1, B - s - mid, BK);
  }
  // WiFi: a dot at the bottom and three arcs above it (a quarter circle each, opening upwards)
  function drawWifiIcon(fb, x, y, B) {
    const t = B >= 27 ? 3 : B >= 15 ? 2 : 1, cx = (B - 1) / 2, cy = B - 1 - t, R = B - 1 - t;
    fb.fillRect(x + cx - (t - 1), y + cy, 2 * t - 1, t, BK);   // the dot
    for (let k = 1; k <= 3; k++) {
      const r = Math.trunc(k * R / 3), r0 = r - t;
      for (let dy = -r; dy < 0; dy++)
        for (let dx = -cx; dx <= cx; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > r0 * r0 && d2 <= r * r && Math.abs(dx) <= -dy) fb.pixel(x + cx + dx, y + cy + dy, BK);
        }
    }
  }
  // Clock: a ring with two hands (up and to the right)
  function drawClock(fb, x, y, B) {
    const t = B >= 27 ? 3 : B >= 15 ? 2 : 1, c = (B - 1) / 2, ri = c - t;
    for (let dy = -c; dy <= c; dy++)
      for (let dx = -c; dx <= c; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= c * c + c && d2 > ri * ri + ri) fb.pixel(x + c + dx, y + c + dy, BK);
      }
    const hand = Math.max(1, ri - 1), w = t > 1 ? t - 1 : 1;
    fb.fillRect(x + c - Math.trunc((w - 1) / 2), y + c - hand + 1, w, hand, BK);   // up
    fb.fillRect(x + c, y + c - Math.trunc((w - 1) / 2), Math.max(1, hand - 1), w, BK);   // to the right
  }
  // Docker: cubes in pixels, edges two pixels across per pixel down. A cube of m is 4m + 1 wide: the top
  // face a flat diamond, the side faces hgt high, a 1 px outline, top and left face light, right face black.
  // One cube as big as fits, on every panel (user)
  function drawCube(fb, ox, oy, m, hgt) {
    const w = 4 * m + 1;
    for (let x = 0; x < w; x++) {
      // the outline flat at the top and the bottom, the front edges of the top face meeting in one pixel
      const d = Math.trunc((Math.abs(x - 2 * m) + 1) / 2), e = Math.max(d, 1), t = e, b = 2 * m + hgt - e, mid = 2 * m - d;
      for (let y = t; y <= b; y++) {
        const black = (x > 2 * m && y > mid) || y === t || y === b || x === 0 || x === w - 1 || (x === 2 * m && y >= mid) || y === mid;
        fb.pixel(ox + x, oy + y, black ? BK : WH);
      }
    }
  }
  function drawContainer(fb, x, y, B) {
    const m = Math.trunc((B - 1) / 4), hgt = B === 13 ? 4 : B - 2 * m - 2;   // 13 px: a little flatter, it looks better
    drawCube(fb, x + Math.trunc((B - 4 * m - 1) / 2), y + Math.trunc((B - 2 * m - hgt - 1) / 2), m, hgt);
  }
  // hdd / hddAsleep: the spinning / asleep disc of the drive pages, in the style of its size (like
  // there; wide = 4.2")
  function drawSysIcon(fb, kind, x, y, B, deep, wide = false) {
    if (kind === "hdd" || kind === "hddAsleep")
      drawIcon(fb, { state: kind === "hdd" ? "A" : "S" }, x, y, B, !wide && (B === 11 || B === 13), !wide && B === 17, !wide && B === 11, false);
    else if (kind === "cpu") drawCpu(fb, x, y, B);
    else if (kind === "clock") drawClock(fb, x, y, B);
    else if (kind === "wifi") drawWifiIcon(fb, x, y, B);
    else if (kind === "ram") drawRam(fb, x, y, B);
    else if (kind === "net") drawNet(fb, x, y, B);
    else if (kind === "docker") drawContainer(fb, x, y, B);
    else drawChip(fb, x, y, B, deep);
  }

  function drawSystem(fb, sys, HH, wide, stacked) { drawRows(fb, sysRows(sys), HH, wide, stacked, sys.icons); }

  // ------------------------------------------------------------ WiFi page
  // The board's own WiFi (the firmware knows it itself): the network it is connected to, its
  // address and for how long it has been connected without a break; with the setup access point
  // open its name and 192.168.4.1. Rows like the temperature rows of the system page (text only,
  // the value after the name; upright below it).
  //   wifi = { net: "sta" | "ap" | "off", ssid, ip, ap, online: minutes connected (-1 = unknown) }
  function wifiRows(wifi) {
    const sta = wifi.net === "sta", ap = wifi.net === "ap";
    return [
      { icon: "wifi", label: "WiFi", info: sta ? wifi.ssid || "--" : ap ? `AP ${wifi.ap || ""}`.trim() : "not connected", value: "", bar: null, inline: true },
      { icon: "net", label: "IP", info: sta ? wifi.ip || "--" : ap ? "192.168.4.1" : "--", value: "", bar: null, inline: true },
      // duration in the units of the header uptime, as many as fit
      { icon: "clock", label: "Connected", info: "--", dur: sta && wifi.online >= 0 ? wifi.online : -1, value: "", bar: null, inline: true },
    ];
  }
  // labels: nothing stands beside them on the WiFi page, so they may take a third of the width
  // (upright the whole first line) and "Connected" is not cut
  function drawWifi(fb, wifi, HH, wide, stacked, icons) { drawRows(fb, wifiRows(wifi), HH, wide, stacked, icons, true); }

  // Rows of the system page, the network pages and the WiFi page; longLabels: see drawWifi;
  // slots: sized for this many rows (network pages: the last page keeps the size), 0 = as many as given
  function drawRows(fb, rows, HH, wide, stacked, icons, longLabels = false, slots = 0) {
    const W = fb.w, n = slots || rows.length;
    if (!n) { fb.text(wide ? 4 : 2, HH + 6, "No values", BK, wide ? 2 : 1); return; }
    const rowH = Math.trunc(rowsArea(fb.h, W, HH > 0) / n);
    const sc = wide ? scaleWide(rowH, clamp(n, 2, 6), stacked) : SCALE_213[clamp(n, 2, 5)];
    // symbols like on the disk pages: a box of bar + 3 (odd), at least 21 on the 4.2"; text and bars start after it
    const icon = icons ? (wide ? Math.max(21, (sc.bar + 3) | 1) : (sc.bar + 3) | 1) : 0;
    const ix0 = wide ? 4 : 2, x0 = icon ? ix0 + icon + (icon >= 17 ? 5 : 3) : ix0, end = W - ix0;
    const colGap = fAsc(sc.dev) >= 12 ? 8 : 6;
    // longLabels 2 (Docker): the name is what matters, it may take all the room "running" and "update" leave
    const labelMax = stacked ? (longLabels ? end - x0 : Math.trunc((end - x0) / 2))
      : longLabels === 2 ? end - x0 - 2 * colGap - fW(sc.pool, "running") - fW(sc.pool, "update") : Math.trunc(W / (longLabels ? 3 : 4));
    for (const r of rows) r.label = fFit(sc.dev, r.label, labelMax);
    const labelW = Math.max(...rows.map(r => fW(sc.dev, r.label)));
    const lineAsc = stacked ? Math.max(fAsc(sc.dev), fAsc(sc.cap)) : Math.max(fAsc(sc.dev), fAsc(sc.pool), fAsc(sc.cap));
    const line2 = stacked ? fAsc(sc.pool) + 3 : 0;
    const barDy = lineAsc + line2 + 3;
    const rowDy = Math.max(0, Math.trunc((rowH - (barDy + sc.bar)) / 2));
    rows.forEach((r, i) => {
      // temperature rows have no bar: their text sits in the middle of the space a bar row takes,
      // so the gaps above and below them look even
      const shift = r.inline ? Math.floor((barDy + sc.bar - lineAsc - (stacked ? line2 : 0)) / 2) : 0;
      // 2.13" landscape with bar rows taller than the row (6 rows on 212x104): their text line 2 px
      // lower, so it does not touch the bar of the row above (user)
      const drop = !wide && !stacked && !r.inline && barDy + sc.bar > rowH ? 2 : 0;
      const y = HH + 2 + i * rowH + rowDy + shift, base = y + lineAsc + drop;
      if (icon) {
        // centred on the bar (or the values in its place); temperature rows: on their text lines
        const top = r.inline ? base - fAsc(sc.dev) : y + barDy, h = r.inline ? (stacked ? line2 : 0) + fAsc(sc.dev) : sc.bar;
        drawSysIcon(fb, r.icon, ix0, top + Math.floor((h - icon) / 2), icon, wide && n === 2, wide);
      }
      fText(fb, sc.dev, x0, base - fAsc(sc.dev), r.label, BK);
      if (r.inline) {   // NVMe: landscape the temperatures after the name (info column), upright in the second line
        let ix = stacked ? x0 : x0 + labelW + colGap;
        // Docker: the three columns over the whole width (user): the state as far from the names as from
        // "update" at the right edge, the same place in every row
        if (longLabels === 2 && !stacked) {
          const last = end - fW(sc.pool, "update") - colGap - fW(sc.pool, "running");
          if (last > ix) ix += Math.trunc((last - ix) / 2);
        }
        // a duration drops its smallest units instead of being cut
        const info = r.dur >= 0 ? uptimeText(0, r.dur, Math.trunc((end - ix + 1) / (fAsc(sc.pool) === 14 ? 12 : 6))) || "--" : r.info;
        const iy = (stacked ? base + line2 : base) - fAsc(sc.pool);
        // a value at the right end of the same line (Docker: "update"); the info is cut before it
        const pad = fAsc(sc.pool) >= 12 ? 2 : 1;   // a highlight box reaches this far around its text
        const vX = r.value ? end - fW(sc.pool, r.value) - (r.valueBox != null ? pad : 0) : end + colGap;
        const boxed = (x, s, c) => { if (c != null) fb.fillRect(x - pad, iy - pad, fW(sc.pool, s) + 2 * pad, fAsc(sc.pool) + 2 * pad, c); };
        if (r.value) { boxed(vX, r.value, r.valueBox); fText(fb, sc.pool, vX, iy, r.value, r.valueC ?? BK); }
        const shown = fFit(sc.pool, info, vX - colGap - ix);
        boxed(ix + (r.infoBox != null ? pad : 0), shown, r.infoBox);
        fText(fb, sc.pool, ix + (r.infoBox != null ? pad : 0), iy, shown, r.infoC ?? BK);
        return;
      }
      if (!r.bar) {   // no bar: the values below the name, where the bar would be (upright: in the second line)
        const vX = end - fW(sc.cap, r.value);
        const top = f => (stacked ? base + line2 - fAsc(f) : y + barDy + Math.floor((sc.bar - fAsc(f)) / 2));
        fText(fb, sc.cap, vX, top(sc.cap), r.value, BK);
        fText(fb, sc.pool, x0, top(sc.pool), fFit(sc.pool, r.info, (r.value ? vX - colGap : end) - x0), BK);
        return;
      }
      // upright, a pair (network: down | up) shares the second line, so both values line up
      const low = stacked && r.pair;
      const vW = fW(sc.cap, r.value), vX = end - vW;
      fText(fb, sc.cap, vX, (low ? base + line2 : base) - fAsc(sc.cap), r.value, BK);
      const infoX = stacked ? x0 : x0 + labelW + colGap;
      const info = fFit(sc.pool, r.info, (stacked && !low ? end : vX - colGap) - infoX);
      fText(fb, sc.pool, infoX, (stacked ? base + line2 : base) - fAsc(sc.pool), info, BK);
      if (r.bar) drawSysBar(fb, x0, y + barDy, end - x0, sc.bar, r.bar[0], r.bar[1], r.barText || null, sc.cap === "5x7x2" ? 2 : 1);
    });
  }

  // Positions inside a row (the same for every row of a screen). The bar starts under the device
  // name; symbol, badge and ring are centred on the bar's height; the row content is centred in the row.
  function rowLayout(W, rowH, sc, disks, o) {
    const devX = o.icon ? o.x0 + o.icon + (o.icon >= 17 ? 5 : 3) : o.x0;
    const devW = Math.max(...disks.map(d => fW(sc.dev, d.dev)));
    const lineAsc = o.stacked ? fAsc(sc.dev) : Math.max(fAsc(sc.dev), fAsc(sc.pool), fAsc(sc.cap));
    const line2 = o.stacked ? fAsc(sc.pool) + 3 : 0;   // second text line with the pool (upright)
    const line3 = o.capLine ? fAsc(sc.cap) + 3 : 0;    // third line with used/total (upright, too long beside the device)
    const timerOn = disks.some(hasTimer);
    const g = timerOn ? widgetGeo(o.timer, sc.bar, sc.time, o.small) : null;
    // gap between text and bar: the widget reaches (h - bar) / 2 above the bar, plus 1 px air
    const gap = g ? Math.ceil((g.h - sc.bar) / 2) + 1 : 3;
    const barDy = lineAsc + line2 + line3 + gap;
    const boxX = W - o.x0 - (g ? g.w : 0);
    const lay = {
      ...sc, x0: o.x0, devX, devW, lineAsc, line2, line3, capLine: !!o.capLine, stacked: o.stacked, timer: o.timer, ringW: o.ringW,
      colGap: fAsc(sc.dev) >= 12 ? 8 : 6, barDy, barH: sc.bar, g, boxX,
      textEnd: g && !o.stacked ? boxX - 5 : W - o.x0,   // text ends before the timer column
      barW: (g ? boxX - 5 : W - o.x0) - devX,
      iconBox: o.icon,
      iconDy: o.icon ? barDy + Math.floor((sc.bar - o.icon) / 2) : 0,
      timerDy: g ? barDy + Math.floor((sc.bar - g.h) / 2) : 0,
    };
    const top = Math.min(0, lay.iconDy, lay.timerDy);
    const bottom = Math.max(barDy + sc.bar, g ? lay.timerDy + g.h : 0);
    lay.contentH = bottom - top;
    lay.rowDy = Math.max(-top, Math.trunc((rowH - (bottom - top)) / 2) - top);
    return lay;
  }

  // Does every pool name fit between device and used/total (one-line layout)?
  // Text at the top right of a disk row: used/total; only the total when the used capacity stands in
  // the bar (saves room). The bar shows it only if it fits (like drawBar, at least in 5x7).
  const barTextFits = (w, h, t) => h - 2 >= 7 && textW(t) <= w - 4;
  // Percentage in the bar: as sent ("35.47"), with fewer decimals when that is too wide
  function pctLabel(d, lay) {
    const t = d.pctText || String(d.pct), dot = t.indexOf(".");
    const tries = dot < 0 ? [t] : [t, t.slice(0, dot + 2), t.slice(0, dot)].filter((v, i, a) => a.indexOf(v) === i);
    return `${tries.find(v => barTextFits(lay.barW, lay.barH, `${v}%`)) || tries[tries.length - 1]}%`;
  }
  function capText(d, lay, pctBar) {
    if (d.pct < 0) return d.total === "-" ? "" : d.total.slice(0, 19);   // not mounted: the disk size
    if (pctBar === 2 && barTextFits(lay.barW, lay.barH, d.used)) return d.total.slice(0, 19);
    return `${d.used}/${d.total}`.slice(0, 19);
  }
  function poolsFit(lay, disks, pctBar) {
    for (const d of disks) {
      if (d.pct < 0) continue;
      const cap = capText(d, lay, pctBar);
      const capFont = lay.textEnd - fW(lay.cap, cap) < lay.devX + lay.devW + 4 ? "5x7" : lay.cap;
      const capX = lay.textEnd - fW(capFont, cap), poolX = lay.devX + lay.devW + lay.colGap;
      if (fW(lay.pool, d.pool) > capX - lay.colGap - poolX) return false;
    }
    return true;
  }

  // Protocol parser: mirrors handleLine()/parseDisk() of the firmware
  function splitFields(s, max) {
    const out = []; let start = 0;
    for (let i = 0; i < s.length && out.length < max - 1; i++)
      if (s[i] === "|") { out.push(s.slice(start, i)); start = i + 1; }
    out.push(s.slice(start));
    return out;
  }
  const atoi = s => parseInt(s, 10) || 0;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function parseFrame(text) {
    let rx = null, done = null;
    for (const raw of text.split("\n")) {
      const line = raw.replace(/\r/g, "").slice(0, 127);
      if (line === "#BEGIN") { rx = { host: "", time: "", rows: 0, warn: L.WARN_PCT, timer: 0, ringDir: 0, icons: 1, pctBar: 0, fast: 0, uptime: -1, upMonths: 0, wifiPage: 0, wifiIcons: true, netBar: 0, netIcons: 1, driveTemp: 0, stby: 0, headInv: 0, headCol: 0, timeFmt: 0, screens: 7, headLine: 1, order: PAGE_ORDER, clockHead: 0, headFill: 0, clock: null, disks: [], nets: [], containers: [], dockerPage: 0, dockerFilter: 0, dockerColor: 1, dockerHi: 0, dockerCue: 0, sys: null, page: 0 }; continue; }
      if (!rx) continue;
      if (line === "#END") {
        // Docker On cue: nothing the filter found, no Docker page at all
        if (rx.dockerCue && !rx.containers.length) rx.dockerPage = 0;
        done = rx; rx = null; continue;
      }
      if (line.startsWith("H|")) {
        const f = splitFields(line, 37);
        if (f.length >= 3) {
          rx.host = f[1].slice(0, 16); rx.time = f[2].slice(0, 5);
          rx.rows = f.length >= 4 ? clamp(atoi(f[3]), 0, 6) : 0;
          rx.warn = f.length >= 5 ? clamp(atoi(f[4]), 0, 100) : L.WARN_PCT;
          const tm = f.length >= 8 ? atoi(f[7]) : 0;
          rx.noTimer = tm === 2;   // 2: no timer at the right (spindown timer off)
          rx.timer = tm === 2 ? 0 : clamp(tm, 0, 1);   // 0 badge, 1 ring
          rx.ringDir = f.length >= 9 ? clamp(atoi(f[8]), 0, 1) : 0;   // 0 clockwise, 1 counterclockwise
          rx.icons = f.length >= 10 ? clamp(atoi(f[9]), 0, 1) : 1;    // symbols left of the bar, 0 = off
          rx.pctBar = f.length >= 11 ? clamp(atoi(f[10]), 0, 2) : 0;  // details in the bar: 0 none, 1 percentage, 2 used capacity
          rx.fast = f.length >= 12 ? clamp(atoi(f[11]), 0, 30) : 0;   // seconds between fast refreshes, 0 = off
          rx.uptime = f.length >= 13 && /^\d+$/.test(f[12]) ? Math.min(Number(f[12]), 99999999) : -1;   // header: uptime, minutes after the full months, -1 = page number
          rx.upMonths = f.length >= 14 ? clamp(atoi(f[13]), 0, 9999) : 0;   // full calendar months of the uptime
          const wp = f.length >= 15 ? clamp(atoi(f[14]), 0, 2) : 0;       // WiFi page after the disk pages:
          rx.wifiPage = wp > 0 ? 1 : 0;                                       // 0 off, 1 with symbols, 2 without
          rx.wifiIcons = wp === 1;
          rx.noDataSecs = f.length >= 16 ? clamp(atoi(f[15]), 0, 604800) : 0;   // seconds until "NO DATA", 0 = never
          // header: left, middle, right; without it (earlier version) the uptime stands where the page number would
          rx.layout = f.length >= 17 && layoutOk(f[16]) ? f[16] : rx.uptime >= 0 ? "TCU" : DEFAULT_LAYOUT;
          rx.diskPages = f.length >= 18 && f[17] === "0" ? 0 : 1;   // 0 = disk pages off
          rx.netBar = f.length >= 19 ? clamp(atoi(f[18]), 0, 2) : 0;     // network pages: details in the bar 0 none / 1 percentage / 2 link speed
          rx.netIcons = f.length >= 20 && f[19] === "0" ? 0 : 1;        // network pages: symbols
          rx.driveTemp = f.length >= 21 && f[20] === "1" ? 1 : 0;      // temperatures in the drive rows
          rx.stby = f.length >= 22 && f[21] === "1" ? 1 : 0;          // asleep hard disks: 1 "STBY", 0 "--"
          rx.headInv = f.length >= 23 && f[22] === "1" ? 1 : 0;       // header inverted: white with black text
          rx.headCol = f.length >= 24 && f[23] === "1" ? 1 : 0;       // inverted header: highlighted boxes in the third colour
          rx.timeFmt = f.length >= 25 && (f[24] === "1" || f[24] === "2") ? Number(f[24]) : 0;   // 12 hours: 1 with AM/PM, 2 without
          rx.screens = f.length >= 26 && /^[0-7]$/.test(f[25]) ? Number(f[25]) : 7;   // shown: 1 start screen, 2 "Nothing to ink", 4 "Check connection"
          rx.headLine = f.length >= 27 && f[26] === "0" ? 0 : 1;   // inverted header: the divider line at its bottom
          rx.order = f.length >= 28 && orderOk(f[27]) ? f[27] : PAGE_ORDER;   // the page order
          rx.clockHead = f.length >= 29 && f[28] === "1" ? 1 : 0;   // the time page with the header line 1 / without 0 (default)
          rx.headFill = f.length >= 30 && f[29] === "1" ? 1 : 0;    // header: the gaps between the boxes filled
          rx.netPages = f.length >= 31 && f[30] === "1" ? 1 : 0;    // network pages on (also without interfaces)
          rx.dockerPage = f.length >= 32 ? clamp(atoi(f[31]), 0, 2) : 0;   // Docker pages: 0 off, 1 with symbols, 2 without
          rx.dockerFilter = f.length >= 33 ? clamp(atoi(f[32]), 0, 3) : 0;   // shown: 0 all, 1 errors, 2 updates, 3 both
          rx.dockerColor = f.length >= 34 && f[33] === "0" ? 0 : 1;   // errors and updates in the third colour (colour panels)
          rx.dockerHi = f.length >= 35 && f[34] === "1" ? 1 : 0;     // errors and updates highlighted: in a box
          rx.dockerCue = f.length >= 36 && f[35] === "1" ? 1 : 0;    // On cue: the page only when the filter finds a container
          rx.dockerNone = f.length >= 37 && f[36] === "0" ? 1 : 0;   // no Docker on the system: "Docker not found"
        }
      } else if (line.startsWith("S|")) {
        // system page: components (C R N V S) | cpu % | cpu °C | cpu W | RAM used MiB | ZFS cache MiB |
        // RAM total MiB | interface | down KiB/s | up KiB/s | link Mb/s | NVMe °C,... | SSD °C,...
        // ("-" = none); -1 = unknown
        const f = splitFields(line.slice(2), 13);
        if (f.length < 13) continue;
        f.unshift("S");
        const num = (i, hi) => (/^-?\d+$/.test(f[i]) ? clamp(Number(f[i]), -1, hi) : -1);
        const tl = t => (t === "-" ? [] : t.split(",").slice(0, 6).map(x => (/^-?\d+$/.test(x) ? clamp(Number(x), -1, 199) : -1)));
        rx.sys = {
          // W: the interface is wireless; D down / L no link
          parts: f[1].replace(/[^CRNVSH]/g, ""), icons: f[1].includes("I"), wifiNet: f[1].includes("W"), hdd: [],
          netState: f[1].includes("D") ? "D" : f[1].includes("L") ? "L" : "U", cpu: num(2, 100), temp: num(3, 199), power: num(4, 9999), ramUsed: num(5, 2147483647), ramArc: num(6, 2147483647),
          ramTotal: num(7, 2147483647), iface: f[8] === "-" ? "" : f[8].replace(/[^A-Za-z0-9._-]/g, "").slice(0, 15),
          rx: num(9, 2147483647), tx: num(10, 2147483647), link: num(11, 1000000), nvme: tl(f[12]), ssd: tl(f[13]),
        };
      } else if (line.startsWith("A|")) {
        // the pictures: A|<flags C I A, hex>|<drinks 0 House Wine / 1 Tabula Rasa / 2 Roast>|<card order>|<windows HHMM-HHMM,...>
        // [|<Got the time? per picture C I A, 1/0>|<the Refresh of the display in s>]
        const f = splitFields(line, 7);
        if (f.length >= 5 && /^[0-9a-f]{3}$/.test(f[1]) && cardOrderOk(f[3]) && /^(\d{4}-\d{4},){2}\d{4}-\d{4}$/.test(f[4]))
          rx.pics = { flags: [...f[1]].map(c => parseInt(c, 16)), sober: f[2] === "0" ? 0 : f[2] === "2" ? 2 : 1, card: f[3],
            win: f[4].split(",").map(w => [w.slice(0, 2) + ":" + w.slice(2, 4), w.slice(5, 7) + ":" + w.slice(7, 9)]),
            clocks: f.length >= 7 && /^[01]{3}$/.test(f[5]) ? f[5] : "000", clock: f.length >= 7 ? clamp(atoi(f[6]), 0, 86400) : 0 };
      } else if (line.startsWith("C|")) {
        // time page: C|<local date and time YYYYMMDDHHMMSS>|<date 1/0>|<weekday 1/0>|<date format 0-3>|<NTP 1/0>|<NTP server>|<POSIX time zone>
        //   [|<time in the third colour 1/0>|<black outline around it 1/0>]
        const f = splitFields(line, 10);
        if (f.length >= 5) rx.clock = { dt: /^\d{14}$/.test(f[1]) ? f[1] : "", date: f[2] === "1" ? 1 : 0, wday: f[3] === "1" ? 1 : 0,
          dfmt: clamp(atoi(f[4]), 0, 3), ntp: f[5] === "1" ? 1 : 0, server: f[6] && f[6] !== "-" ? f[6] : "", tz: f[7] && f[7] !== "-" ? f[7] : "",
          color: f[8] === "1" ? 1 : 0, frame: f[8] === "1" && f[9] === "1" ? 1 : 0 };
      } else if (line.startsWith("K|")) {
        // Docker pages: container | state R running / E error / S stopped | update 1 / 0
        const f = splitFields(line, 4);
        if (f.length < 4 || rx.containers.length >= L.MAX_CONTAINERS) continue;
        rx.containers.push({ name: f[1].replace(/[^A-Za-z0-9._-]/g, "").slice(0, 24), st: f[2] === "E" || f[2] === "S" ? f[2] : "R", upd: f[3] === "1" });
      } else if (line.startsWith("N|")) {
        // network pages: interface | down KiB/s | up KiB/s | link Mb/s | wireless 1/0 | state U up / L no link / D down
        const f = splitFields(line, 7);
        if (f.length < 7 || rx.nets.length >= L.MAX_NETS) continue;
        const num = (i, hi) => (/^-?\d+$/.test(f[i]) ? clamp(Number(f[i]), -1, hi) : -1);
        rx.nets.push({ name: f[1].replace(/[^A-Za-z0-9._-]/g, "").slice(0, 15), rx: num(2, 2147483647), tx: num(3, 2147483647),
          link: num(4, 1000000), wifi: f[5] === "1", state: f[6] === "D" || f[6] === "L" ? f[6] : "U" });
      } else if (line.startsWith("D|")) {
        const f = splitFields(line, 12);
        if (f.length < 9 || rx.disks.length >= L.MAX_DISKS) continue;
        const steps = clamp(atoi(f[7]), 0, L.MAX_BOXES);
        rx.disks.push({
          dev: f[1].slice(0, 9), pool: f[2].slice(0, 15), used: f[3].slice(0, 7), total: f[4].slice(0, 7),
          pct: clamp(atoi(f[5]), -1, 100),
          // the percentage with up to 2 decimals as sent (cut, not rounded), else the whole one
          pctText: /^\d{1,3}(\.\d{1,2})?$/.test(f[5]) && Number(f[5]) <= 100 ? f[5] : String(clamp(atoi(f[5]), -1, 100)), idle: clamp(atoi(f[6]), 0, steps), steps, state: f[8][0] || "?", noTimer: !!rx.noTimer,
          // seconds until spindown (-1 = unknown) and the timeout, for the MM:SS timer styles
          remain: f.length >= 10 && /^-?\d+$/.test(f[9]) ? clamp(Number(f[9]), -1, 359999) : -1,
          timeout: f.length >= 11 ? clamp(atoi(f[10]), 0, 359999) : 0,
          // drive temperature °C (only with H field 21), -1 = unknown, -2 = asleep, null = not sent
          temp: f.length >= 12 && /^-?\d+$/.test(f[11]) ? clamp(Number(f[11]), -2, 199) : null,   // -2 = asleep
        });
      } else if (line.startsWith("T|") && rx.sys) {
        // HDD temperatures of the system page (after the S line), -1 = asleep
        const t = line.slice(2);
        rx.sys.hdd = t === "-" ? [] : t.split(",").slice(0, 6).map(x => (/^-?\d+$/.test(x) ? clamp(Number(x), -2, 199) : -1));   // -2 = asleep
      }
    }
    return done;
  }

  // Seconds without a fresh frame before a display shows "NO DATA": two full updates missed plus
  // 2 minutes, at least 10 minutes (like NODATA_SECS in inksights.sh); interval in minutes
  const noDataSecs = interval => Math.max(600, interval * 120 + 120);

  // Bytes -> 3.62T / 219G, like hsize() in inksights.sh
  function hsize(b) {
    const u = ["B", "K", "M", "G", "T", "P"]; let i = 0;
    while (b >= 1024 && i < 5) { b /= 1024; i++; }
    return (b < 10 ? b.toFixed(2) : b < 100 ? b.toFixed(1) : b.toFixed(0)) + u[i];
  }

  // Disk order for one display, like order_disks() in inksights.sh. Never by sda/sdb
  // (those can swap after a reboot). s = { types, sort: "pool"|"uid"|"manual", order: [uid, ...] }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);   // byte order like LC_ALL=C sort
  const byPool = (a, b) => (a.pool ? 0 : 1) - (b.pool ? 0 : 1) || cmp(a.pool || "~", b.pool || "~") || cmp(a.uid, b.uid);

  // "dev": by device name, shorter names first (sda .. sdz, sdaa .., nvme0n1); note that Linux may
  // hand out sda/sdb differently after a reboot, so this order can change (simulator only so far)
  function orderDisks(disks, s) {
    const types = new Set(s.types);
    const list = disks.filter(d => types.has(d.type));
    const pool = [...list].sort(byPool);
    if (s.sort === "uid") return [...list].sort((a, b) => cmp(a.uid, b.uid));
    if (s.sort === "dev") return [...list].sort((a, b) => a.dev.length - b.dev.length || cmp(a.dev, b.dev));
    if (s.sort === "manual") {
      const byUid = new Map(list.map(d => [d.uid, d]));
      const first = [];
      for (const u of s.order || []) { const d = byUid.get(u); if (d && !first.includes(d)) first.push(d); }
      return [...first, ...pool.filter(d => !first.includes(d))];
    }
    return pool;
  }

  // Frame for one display, like build_frame() in inksights.sh
  // disks: entries of state.json; s = { types, boxes, rows, sort, order, hidden, warn, rot, page, timer, ringDir, icons }
  // hidden: UIDs of disks not shown on this display (simulator only so far).
  // Optional H fields 8-10, only sent as far as needed: timer (0 badge, 1 ring),
  // ringDir (0 clockwise, 1 counterclockwise), icons (1 on = default, 0 off). boxes: 0 = timer off.
  // system: state.system (inksights.sh), for the system page (s.sys = components: cpu, ram, net,
  // nvme, ssd; none = no system page; s.net = interface,
  // "" = the one with the default route; s.zfs = 0: ZFS cache hidden). fast: the panel can do fast refreshes (s.fast seconds).
  // dt: local date and time of the data YYYYMMDDHHMMSS for the time page (missing: today at time)
  // the page order of the frame: K (the Docker pages) only while they are on, so a display without them gets
  // the frame it got before (also from an older firmware)
  const pageOrderOf = s => { const o = orderOk(s.pageOrder) ? s.pageOrder : PAGE_ORDER; return s.showDocker === 1 ? o : o.replace("K", ""); };
  function buildFrame(disks, s, title, time, system = null, fast = false, interval = 0, dt = "", docker = null) {
    // Advanced Ink, Just give me time: only the time page, the header line as the Time card's Show
    // header says (the other settings stay)
    if (s.justTime === 1) s = { ...s, showSys: 0, showDisks: 0, showNet: 0, showDocker: 0, showWifi: 0, showTime: 1, showHeader: s.timeHead === 1 ? 1 : 0 };
    // H field 17: header layout, "---" = header switched off (s.showHeader 0, the layout stays);
    // H fields 13 and 14: uptime (when the header shows it) as minutes after the full calendar
    // months, and the months; -1 = none
    const layout = s.showHeader === 0 ? "---" : layoutOk(s.layout) ? s.layout : DEFAULT_LAYOUT;
    const up = layout.toUpperCase().includes("U") && system && Number.isInteger(system.upRest) && system.upRest >= 0;
    // H field 8: 0 badge, 1 ring, 2 no timer (spindown timer off)
    const extra = [s.boxes ? s.timer || 0 : 2, s.ringDir || 0, s.icons === 0 ? 0 : 1, s.pctBar ? (s.barCap ? 2 : 1) : 0, fast ? s.fast || 0 : 0,
      up ? system.upRest : -1, up ? system.upMonths || 0 : 0, s.showWifi ? (s.wifiIcons === 0 ? 2 : 1) : 0,   // H field 15: WiFi page
      interval > 0 ? noDataSecs(interval) : 0,   // H field 16: seconds until "NO DATA"
      layout, s.showDisks === 0 || !(s.types || []).length ? 0 : 1,   // H field 18: disk pages on
      s.netBar || 0, s.netIcons === 0 ? 0 : 1,   // H fields 19, 20: network pages, details in the bar and symbols
      s.driveTemp === 1 ? 1 : 0,   // H field 21: temperatures in the drive rows
      s.stby === 1 ? 1 : 0,   // H field 22: asleep hard disks "STBY" instead of "--"
      s.headInv === 1 ? 1 : 0,   // H field 23: header inverted
      s.headInv === 1 && s.headCol === 1 ? 1 : 0,   // H field 24: inverted header, highlighted boxes in the third colour
      s.timeFmt === 1 ? (s.ampm === 0 ? 2 : 1) : 0,   // H field 25: 0 24 hours, 12 hours 1 with AM/PM, 2 without
      (s.inkSplash === 0 ? 0 : 1) | (s.inkNothing === 0 ? 0 : 2) | (s.inkNoData === 0 ? 0 : 4),   // H field 26: screens shown (Advanced Ink)
      s.lineBottom === 0 ? 0 : 1,   // H field 27: inverted header, the divider line at its bottom
      pageOrderOf(s),   // H field 28: the page order
      s.timeHead === 1 ? 1 : 0,   // H field 29: the time page with the header line (default without)
      s.headFill === 1 && s.headInv === 1 && s.headCol === 1 ? 1 : 0,  // H field 30: header filled in the third colour (with Highlight color only)
      s.showNet === 1 ? 1 : 0,   // H field 31: network pages on (without interfaces: "No interfaces")
      s.showDocker === 1 ? (s.dockerIcons === 0 ? 2 : 1) : 0,   // H field 32: Docker pages, 1 with symbols, 2 without
      s.showDocker === 1 ? s.dockerFilter || 0 : 0,   // H field 33: the containers shown: 0 all, 1 errors, 2 updates, 3 both
      s.showDocker === 1 && s.dockerColor === 0 ? 0 : 1,   // H field 34: errors and updates in the third colour (Color highlight)
      s.showDocker === 1 && s.dockerHi === 1 ? 1 : 0,   // H field 35: errors and updates highlighted, in a box
      s.showDocker === 1 && s.dockerCue === 1 && s.dockerFilter ? 1 : 0,   // H field 36: On cue (only with a filter)
      s.showDocker === 1 && docker === null ? 0 : 1];   // H field 37: Docker found (null: no Docker on the system)
    const defaults = [0, 0, 1, 0, 0, -1, 0, 0, 0, DEFAULT_LAYOUT, 1, 0, 1, 0, 0, 0, 0, 0, 7, 1, PAGE_ORDER, 0, 0, 0, 0, 0, 1, 0, 0, 1];
    while (extra.length && extra[extra.length - 1] === defaults[extra.length - 1]) extra.pop();
    const head = [`H|${title}|${time}|${s.rows || 0}|${s.warn ?? L.WARN_PCT}|${Math.trunc((s.rot || 0) / 90)}|${s.page ?? 600}`, ...extra].join("|");
    const lines = ["#BEGIN", head];
    // A line, the pictures (only when not the defaults): per picture C I A one hex digit (1 caption, 2 header,
    // 4 in the page turn, 8 scheduled; 0 when its Ink is off), Beverages, the card order (the pages and the
    // pictures: their place in the page turn), the time windows HHMM-HHMM
    const po = pageOrderOf(s), card0 = cardOrderOk(s.cardOrder) ? s.cardOrder : po + "CIA", card = s.showDocker === 1 ? card0 : card0.replace("K", "");
    const flags = PICS.map(([p, , , cap]) => (s[p + "Ink"] === 0 ? 0 : ((s[p + "Cap"] ?? cap) === 1 ? 1 : 0) | (s[p + "Head"] === 1 ? 2 : 0)
      | (s[p + "Rot"] === 1 ? 4 : 0) | (s[p + "Sched"] === 1 ? 8 : 0)).toString(16)).join("");
    const win = PICS.map(([p, f, t]) => `${(s[p + "From"] || f).replace(":", "")}-${(s[p + "To"] || t).replace(":", "")}`).join(",");
    const sober = s.sober === 0 || s.sober === 2 ? s.sober : 1;   // Beverages: 0 House Wine, 1 Tabula Rasa, 2 Roast
    // Got the time?: the wall clock per picture; the board redraws it every minute (black/white) or every Refresh
    const clocks = PICS.map(([p]) => (s[p + "Clock"] === 1 ? 1 : 0)).join(""), clock = clocks !== "000";
    if (flags !== PIC_FLAGS || sober !== 1 || card !== po + "CIA" || win !== PIC_WIN || clock)
      lines.push(`A|${flags}|${sober}|${card}|${win}${clock ? `|${clocks}|${Math.max(1, s.refresh || 600)}` : ""}`);
    if (s.showTime === 1) {   // the time page: date and time of the data, what it shows, NTP (WiFi boards)
      let when = /^\d{14}$/.test(dt) ? dt : "";
      if (!when) { const n = new Date(), hm = /^(\d\d):(\d\d)$/.exec(time || ""); when = `${n.getFullYear()}${two(n.getMonth() + 1)}${two(n.getDate())}${hm ? hm[1] + hm[2] : two(n.getHours()) + two(n.getMinutes())}00`; }
      const ntp = s.ntp === 1 && s.ntpServer && s.tzPosix;
      const tcol = s.timeColor === 1 ? 1 : 0;   // Color highlight: the time in the third colour, Time frame: outlined
      lines.push(["C", when, s.timeDate === 0 ? 0 : 1, s.timeWday === 0 ? 0 : 1, s.dateFmt || 0, ntp ? 1 : 0, ntp ? s.ntpServer : "-", ntp ? s.tzPosix : "-",
        tcol, tcol && s.timeFrame === 1 ? 1 : 0].join("|"));
    }
    const hidden = new Set(s.hidden || []);
    const dec = s.pctBar && !s.barCap ? s.pctDec || 0 : 0;   // decimals, only while the percentage stands in the bar
    for (const d of s.showDisks === 0 ? [] : orderDisks(disks, s)) {   // disk pages switched off: no disks
      if (hidden.has(d.uid)) continue;
      let used = "-", total = "-", pct = -1;
      if (d.pool && d.total > 0) { used = hsize(d.used); total = hsize(d.total); pct = Math.floor(d.used * 100 / d.total); }
      if (pct >= 0 && dec > 0) {   // 1 or 2 decimals, cut like inksights.sh (BigInt: bytes x 10000 is too big for a double)
        const u = Math.min(10000, Number(BigInt(Math.round(d.used)) * 10000n / BigInt(Math.round(d.total))));
        pct = dec === 1 ? `${Math.trunc(u / 100)}.${Math.trunc(u / 10) % 10}` : `${Math.trunc(u / 100)}.${String(u % 100).padStart(2, "0")}`;
      }
      else if (d.size > 0) total = hsize(d.size);   // not mounted: the size of the disk
      let steps = 0, idle = 0, st = d.state, remain = -1, tmo = 0;
      // timer off (H field 8 = 2): no timer values; the state still decides the symbol
      if (s.boxes && (st === "A" || st === "S") && d.timeout > 0 && d.poll > 0) {
        steps = Math.min(Math.ceil(d.timeout / d.poll), s.boxes);
        idle = Math.min(Math.floor(d.idle * steps / d.timeout), steps);
        tmo = d.timeout;
        // stale status (timer not running): last known state, but no time left
        remain = d.stale ? -1 : st === "S" ? 0 : Math.max(0, d.timeout - d.idle);
      }
      // with temperatures: °C, -1 = unknown, -2 = asleep HDD (like build_frame in inksights.sh)
      const dt = s.driveTemp === 1 ? `|${d.type === "hdd" && (d.state === "S" || d.temp === -2) ? -2 : Number.isInteger(d.temp) && d.temp >= 0 ? d.temp : -1}` : "";
      lines.push(`D|${d.dev}|${d.pool || "-"}|${used}|${total}|${pct}|${idle}|${steps}|${st}|${remain}|${tmo}${dt}`);
    }
    if (s.showSys !== 0 && Array.isArray(s.sys) && s.sys.length && system) {
      lines.push(systemLine(system, s.sys, s.net, s.zfs !== 0, s.sysIcons !== 0));
      // T line: HDD temperatures (only when inksights.sh has them: drive-temp-export runs)
      if (s.sys.includes("hdd") && Array.isArray(system.hdd) && system.hdd.length) lines.push("T|" + system.hdd.slice(0, 6).map(x => (Number.isInteger(x.temp) ? x.temp : -1)).join(","));
    }
    if (s.showNet === 1 && system) lines.push(...netLines(system, s));   // network pages
    if (s.showDocker === 1 && Array.isArray(docker)) lines.push(...dockerLines(docker, s));   // Docker pages
    lines.push("#END");
    return lines.join("\n");
  }

  // The rows of the Docker pages: the containers, or (dockerStacks 1) one per stack (Compose project; a
  // container without one is its own): error when one of its containers has one, else running when one
  // runs, else stopped; update when one has a newer image; count = its containers
  function dockerItems(list, s) {
    if (s.dockerStacks !== 1) return list || [];
    const by = new Map();
    for (const c of list || []) {
      const k = c.stack || c.name, g = by.get(k) || { name: k, states: [], update: false, count: 0 };
      g.states.push(c.state); g.update = g.update || !!c.update; g.count++;
      by.set(k, g);
    }
    return [...by.values()].map(g => ({ name: g.name, update: g.update, count: g.count,
      state: g.states.includes("E") ? "E" : g.states.includes("R") ? "R" : "S" }));
  }
  // The containers in their order (hidden ones included, the settings list ticks them): dockerSort "state"
  // errors first, then the ones with an update, then the rest, each by name (default); "name"; "manual" the
  // ones in s.dockerOrder first, the rest by name (like the network interfaces)
  function orderContainers(list, s) {
    const byName = [...(list || [])].sort((a, b) => cmp(a.name, b.name));
    if (s.dockerSort === "name") return byName;
    if (s.dockerSort === "manual") {
      const first = (s.dockerOrder || []).map(n => byName.find(c => c.name === n)).filter(Boolean);
      return [...first, ...byName.filter(c => !first.includes(c))];
    }
    const rank = c => (c.state === "E" ? 0 : c.update ? 1 : 2);
    return byName.sort((a, b) => rank(a) - rank(b));
  }
  // K lines: the containers shown (not hidden) that the filter lets through (1 errors, 2 updates, 3 both,
  // 0 all), in their order; at most L.MAX_CONTAINERS
  function dockerLines(list, s) {
    const filter = s.dockerFilter || 0, hidden = new Set(s.dockerHidden || []);
    const err = c => c.state === "E", upd = c => !!c.update;
    const keep = c => !hidden.has(c.name) && (filter === 1 ? err(c) : filter === 2 ? upd(c) : filter === 3 ? err(c) || upd(c) : true);
    return orderContainers(dockerItems(list, s), s).filter(keep).slice(0, L.MAX_CONTAINERS)
      .map(c => ["K", String(c.name).replace(/[^A-Za-z0-9._-]/g, "").slice(0, 24) || "?", c.state === "E" || c.state === "S" ? c.state : "R", upd(c) ? 1 : 0].join("|"));
  }

  // Interfaces of the network pages in their order, like net_lines() in inksights.sh: by name, or
  // (netSort "manual") the ones in s.netOrder first; hidden ones included (the settings list ticks them)
  function orderNets(ifaces, s) {
    const byName = [...(ifaces || [])].sort((a, b) => cmp(a.name, b.name));
    if (s.netSort !== "manual") return byName;
    const first = (s.netOrder || []).map(n => byName.find(i => i.name === n)).filter(Boolean);
    return [...first, ...byName.filter(i => !first.includes(i))];
  }
  // N lines: interface | down KiB/s | up KiB/s | link Mb/s | wireless 1/0 | state, at most L.MAX_NETS
  function netLines(y, s) {
    const hidden = new Set(s.netHidden || []), v = x => (Number.isInteger(x) ? x : -1);
    return orderNets(y.ifaces, s).filter(i => !hidden.has(i.name)).slice(0, L.MAX_NETS)
      .map(i => ["N", i.name, v(i.rx), v(i.tx), v(i.speed), i.wireless ? 1 : 0, i.state === "D" || i.state === "L" ? i.state : "U"].join("|"));
  }

  // S line from state.system, like system_line() in inksights.sh
  // parts: components (cpu, ram, net, nvme, ssd), letter I = symbols on; zfs = false: the ZFS cache is hidden (sent as -1,
  // the display counts it as free). At most 6 temperatures per type (the line must stay short).
  const PART_LETTER = { cpu: "C", ram: "R", net: "N", nvme: "V", ssd: "S", hdd: "H" };
  function systemLine(y, parts, net, zfs = true, icons = true) {
    const ifs = Array.isArray(y.ifaces) ? y.ifaces : [];
    const name = net && ifs.some(i => i.name === net) ? net : y.defaultIface || (ifs[0] && ifs[0].name) || "";
    const i = ifs.find(x => x.name === name) || {};
    const v = x => (Number.isInteger(x) ? x : -1);
    const temps = list => (list || []).slice(0, 6).map(d => v(d.temp)).join(",") || "-";
    const letters = Object.keys(PART_LETTER).filter(p => parts.includes(p)).map(p => PART_LETTER[p]).join("") + (icons ? "I" : "") +
      (name && i.wireless ? "W" : "") + (name && (i.state === "D" || i.state === "L") ? i.state : "");   // wireless, down / no link
    return ["S", letters, v(y.cpu), v(y.temp), v(y.power), v(y.ramUsed), zfs ? v(y.ramArc) : -1, v(y.ramTotal), name || "-", v(i.rx), v(i.tx), v(i.speed), temps(y.nvme), temps(y.ssd)].join("|");
  }

  // Paint a framebuffer. scale = screen device pixels per display pixel (a whole number keeps every
  // pixel equally big; otherwise some pixel columns come out one screen pixel narrower).
  function blit(canvas, fb, scale, yellow = false) {   // yellow: third colour yellow instead of red
    const dpr = window.devicePixelRatio || 1;
    const off = document.createElement("canvas");
    off.width = fb.w; off.height = fb.h;
    const octx = off.getContext("2d");
    const img = octx.createImageData(fb.w, fb.h);
    for (let i = 0; i < fb.px.length; i++) {
      const [r, g, b] = yellow && fb.px[i] === RD ? YELLOW : PALETTE[fb.px[i]];
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    canvas.width = Math.round(fb.w * scale); canvas.height = Math.round(fb.h * scale);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    canvas.style.width = `${canvas.width / dpr}px`;
  }


  window.EPD = { WH, BK, RD, Fb, clockParts, DEFAULT_LAYOUT, PAGE_ORDER, orderOk, layoutOk, orderNets, orderContainers, dockerItems, drawScreen, drawSplash, parseFrame, buildFrame, noDataSecs, systemLine, uptimeSplit, orderDisks, pageCount, pageCounts, rowsPerPage, hsize, blit };
})();
