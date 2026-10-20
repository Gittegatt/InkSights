/*
 * inksights-render.js
 * Draws exactly what the XIAO firmware draws (firmware/InkSights) and
 * builds frames exactly like inksights.sh. When the firmware layout
 * changes, change it here too.
 */
(function () {
  "use strict";

  // 5x7 font (Adafruit GFX default font, ASCII 32..126, column bytes, LSB = top)
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
  const FONT_EXTRA = { 0x18: [0x08, 0x04, 0x7E, 0x04, 0x08], 0x19: [0x10, 0x20, 0x7E, 0x20, 0x10], 0xF8: [0x06, 0x0F, 0x09, 0x0F, 0x06] };
  const glyph = (code, col) => (FONT_EXTRA[code] ? FONT_EXTRA[code][col] : FONT[((code < 32 || code > 126 ? 63 : code) - 32) * 5 + col]);

  const WH = 0, BK = 1, RD = 2;
  // e-paper white, black, third colour (shown as red; yellow panels draw it in yellow)
  const PALETTE = [[0xe3, 0xe0, 0xd6], [0x1d, 0x1d, 0x1b], [0xad, 0x2a, 0x25]];
  const L = { HEADER_H: 11, ROW_H_AUTO: 22, ROW_H_MIN: 17, ROW_H_WIDE: 34, ROW_H_UPRIGHT: 32, ROW_H_BIG_UPRIGHT: 63, CHAR_W: 6, BAR_H: 8, BAR_H_MAX: 16, MAX_BOXES: 20, MAX_DISKS: 32, WARN_PCT: 85 };


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
  const headerH = (w, h) => (isBig(w, h) ? 20 : L.HEADER_H);
  // wanted = rows per page from the settings (2 to 6), 0 = automatic; w = panel width (0 = small panel)
  // Upright (w < h) the pool gets its own line, so the rows are taller
  const rowsArea = (h, w = 0) => h - headerH(w, h) - 1;
  const rowsPerPage = (h, wanted = 0, w = 0) => {
    const area = rowsArea(h, w);
    const tall = isBig(w, h) ? (w >= h ? L.ROW_H_WIDE : L.ROW_H_BIG_UPRIGHT) : isUpright(w) ? L.ROW_H_UPRIGHT : 0;
    if (wanted > 0 && Math.trunc(area / wanted) >= (tall || L.ROW_H_MIN)) return wanted;
    return Math.trunc(area / (tall || L.ROW_H_AUTO));
  };
  const rowHeight = (h, wanted = 0, w = 0) => Math.trunc(rowsArea(h, w) / rowsPerPage(h, wanted, w));
  // sys: the frame has a system page (S line), shown as page 1 before the disk pages; wifi: a WiFi
  // page (H field 15) after them; without disks they are the only pages
  const pageCount = (n, h, wanted = 0, w = 0, sys = false, wifi = false) =>
    (sys ? 1 : 0) + (wifi ? 1 : 0) + (n === 0 ? (sys || wifi ? 0 : 1) : Math.ceil(n / rowsPerPage(h, wanted, w)));

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
    if (uw > 0) fb.fillRect(x + 1, y + 1, uw, ih, warn && !mono ? RD : BK);
    fillRaster(fb, x + 1 + uw, y + 1, iw - uw, ih);
    if (!text) return;
    const t = text;
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
        if (on(px, py)) fb.pixel(px, py, px < usedEnd ? WH : BK);
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
  const hasTimer = d => d.state !== "N" && d.state !== "-";
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
    const cap = capText(d, lay, lay.pctBar);
    let capFont = lay.cap;
    if (!lay.stacked && lay.textEnd - fW(capFont, cap) < lay.devX + lay.devW + 4) capFont = "5x7";   // does not fit beside the name
    const capW = fW(capFont, cap), capX = lay.textEnd - capW;
    // upright: used/total beside the device; only if it does not fit there, in the pool line
    const capLow = lay.stacked && (lay.capBelow || d.pct < 0 || capX < lay.devX + fW(lay.dev, d.dev) + 4);
    // three lines (upright): used/total in its own last line, the pool keeps the whole second line
    const capBase = lay.capLine ? lastBase : capLow ? base + lay.line2 : base, capTop = capBase - fAsc(capFont);
    if (warn && mono && cap) { fb.fillRect(capX - 1, capTop - 1, capW + 2, fAsc(capFont) + 2, BK); fText(fb, capFont, capX, capTop, cap, WH); }
    else fText(fb, capFont, capX, capTop, cap, warn ? RD : BK);
    const poolX = lay.stacked ? lay.devX : lay.devX + lay.devW + lay.colGap;
    const poolBase = lay.stacked ? base + lay.line2 : base;
    // no pool and nothing mounted: nothing in the pool column, the disk size at the right and
    // "not mounted" in the place of the bar
    const pool = d.pct < 0 ? "" : fFit(lay.pool, d.pool, (lay.stacked && (!capLow || lay.capLine) ? lay.textEnd : capX - lay.colGap) - poolX);
    if (pool) fText(fb, lay.pool, poolX, poolBase - fAsc(lay.pool), pool, BK);
    const by = y + lay.barDy;
    const barText = lay.pctBar === 1 ? `${d.pct}%` : lay.pctBar === 2 ? d.used : null;   // details in the bar
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

  // Uptime of the NAS server for the header: full calendar months plus the minutes after them; the
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

  // m = { host, time, rows, warn, timer, ringDir, icons, pctBar, uptime, disks, page, mono (black/white panel) }
  function drawScreen(fb, m) {
    const W = fb.w, wanted = m.rows || 0;
    const wide = isBig(W, fb.h), hs = wide ? 2 : 1, HH = headerH(W, fb.h), hx = wide ? 4 : 2, hy = wide ? 3 : 2;
    const stacked = W < fb.h;   // upright: device | used/total, the pool in a second line
    fb.fillRect(0, 0, W, HH, BK);
    const timeX = W - hx - textW(m.time) * hs;
    fb.text(timeX, hy, m.time, WH, hs);
    const pages = pageCount(m.disks.length, fb.h, wanted, W, !!m.sys, !!m.wifiPage);
    let titleEnd = timeX - 6 * hs;   // the title is cut where it would run into the page or the time
    if (m.noData) {
      // "NO DATA" inverted in the place of the uptime or the page number (never into the time), and
      // "Check connection" in the middle of the rest; the time stays: when the last data came
      const nd = "NO DATA", ndW = textW(nd) * hs, right = timeX - 6 * hs - ndW;
      const ndX = m.uptime >= 0 ? right : Math.min(Math.trunc((W - ndW) / 2), right);
      fb.fillRect(ndX - 2 * hs, hy - hs, ndW + 4 * hs, 9 * hs, WH);
      fb.text(ndX, hy, nd, m.mono ? BK : RD, hs);
      fb.text(hx, hy, fFit(hs === 2 ? "5x7x2" : "5x7", m.host, ndX - 6 * hs - hx), WH, hs);
      const msg = "Check connection", ms = textW(msg) * 2 <= W - 8 ? 2 : 1;
      fb.text(Math.trunc((W - textW(msg) * ms) / 2), HH + Math.trunc((fb.h - HH - 7 * ms) / 2), msg, BK, ms);
      return;
    }
    if (m.uptime >= 0) {
      // uptime instead of the page number: right before the time, as long as at least 5 characters
      // of the title stay visible
      const keep = Math.min(m.host.length, 5) * 6 * hs;
      const up = uptimeText(m.upMonths || 0, m.uptime, Math.floor((timeX - 6 * hs - hx - keep + hs) / (6 * hs)));
      if (up) {
        const upX = timeX - 6 * hs - textW(up) * hs;
        fb.text(upX, hy, up, WH, hs);
        titleEnd = upX - 6 * hs;
      }
    } else if (pages > 1) {
      const pg = `${m.page + 1}/${pages}`, pgX = Math.trunc((W - textW(pg) * hs) / 2);
      fb.text(pgX, hy, pg, WH, hs);
      titleEnd = pgX - 6 * hs;
    }
    fb.text(hx, hy, fFit(hs === 2 ? "5x7x2" : "5x7", m.host, titleEnd - hx), WH, hs);
    if (m.sys && m.page === 0) { drawSystem(fb, m.sys, HH, wide, stacked); return; }
    if (m.wifiPage && m.page === pages - 1) { drawWifi(fb, m.wifi || {}, HH, wide, stacked, m.wifiIcons); return; }
    if (m.disks.length === 0) { fb.text(hx, HH + 6, "No disks", BK, hs); return; }
    const rows = rowsPerPage(fb.h, wanted, W), rowH = rowHeight(fb.h, wanted, W), first = (m.page - (m.sys ? 1 : 0)) * rows;
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
  function sysRows(sys) {
    const rows = [], on = c => sys.parts.includes(c);
    const temps = list => list.map(t => (t >= 0 ? `${t}${DEG}C` : "--")).join(" ");
    const pct = (a, b) => (b > 0 && a >= 0 ? clamp(Math.floor(a * 100 / b), 0, 100) : -1);
    const cpuInfo = [sys.temp >= 0 ? `${sys.temp}${DEG}C` : "", sys.power >= 0 ? `${sys.power}W` : ""].filter(Boolean).join(" ");
    if (on("C")) rows.push({ icon: "cpu", label: "CPU", info: cpuInfo, value: sys.cpu >= 0 ? `${sys.cpu}%` : "--", bar: sys.cpu >= 0 ? [sys.cpu, sys.cpu] : null });
    const ramOk = sys.ramTotal > 0 && sys.ramUsed >= 0;
    if (on("R")) rows.push({ icon: "ram", label: "RAM", info: ramOk && sys.ramArc > 0 ? `ZFS ${mib(sys.ramArc)}` : "",
      value: ramOk ? `${mib(sys.ramUsed)}/${mib(sys.ramTotal)}` : "--",
      bar: ramOk ? [pct(sys.ramUsed, sys.ramTotal), pct(sys.ramUsed + Math.max(0, sys.ramArc), sys.ramTotal)] : null });
    const busy = Math.max(sys.rx, sys.tx);
    const linkPct = sys.link > 0 && busy >= 0 ? clamp(Math.floor(busy * 8192 / (sys.link * 10000)), 0, 100) : -1;   // KiB/s of Mb/s
    if (on("N")) rows.push({ icon: "net", label: sys.iface || "NET", info: sys.rx >= 0 ? DOWN + kib(sys.rx) : "", value: sys.tx >= 0 ? UP + kib(sys.tx) : "--",
      bar: linkPct >= 0 ? [linkPct, linkPct] : null, pair: true });   // down and up belong together
    if (on("V") && sys.nvme.length) rows.push({ icon: "chip", label: "NVMe", info: temps(sys.nvme), value: "", bar: null, inline: true });
    if (on("S") && sys.ssd.length) rows.push({ icon: "chip", label: "SSD", info: temps(sys.ssd), value: "", bar: null, inline: true });
    return rows;
  }
  // Bar of the system page: black up to p1 %, grey up to p2 %, light after that
  function drawSysBar(fb, x, y, w, h, p1, p2) {
    fb.drawRect(x, y, w, h, BK);
    const iw = w - 2, ih = h - 2;
    let u1 = Math.trunc(iw * p1 / 100), u2 = Math.trunc(iw * p2 / 100);
    if (p1 > 0 && u1 === 0) u1 = 1;
    if (p2 > p1 && u2 <= u1) u2 = u1 + 1;
    u2 = Math.min(Math.max(u2, u1), iw);
    if (u1 > 0) fb.fillRect(x + 1, y + 1, u1, ih, BK);
    fillRaster(fb, x + 1 + u1, y + 1, u2 - u1, ih);
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
  function drawSysIcon(fb, kind, x, y, B, deep) {
    if (kind === "cpu") drawCpu(fb, x, y, B);
    else if (kind === "clock") drawClock(fb, x, y, B);
    else if (kind === "wifi") drawWifiIcon(fb, x, y, B);
    else if (kind === "ram") drawRam(fb, x, y, B);
    else if (kind === "net") drawNet(fb, x, y, B);
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

  // Rows of the system page and the WiFi page; longLabels: see drawWifi
  function drawRows(fb, rows, HH, wide, stacked, icons, longLabels = false) {
    const W = fb.w, n = rows.length;
    if (!n) { fb.text(wide ? 4 : 2, HH + 6, "No values", BK, wide ? 2 : 1); return; }
    const rowH = Math.trunc(rowsArea(fb.h, W) / n);
    const sc = wide ? scaleWide(rowH, clamp(n, 2, 6), stacked) : SCALE_213[clamp(n, 2, 5)];
    // symbols like on the disk pages: a box of bar + 3 (odd), at least 21 on the 4.2"; text and bars start after it
    const icon = icons ? (wide ? Math.max(21, (sc.bar + 3) | 1) : (sc.bar + 3) | 1) : 0;
    const ix0 = wide ? 4 : 2, x0 = icon ? ix0 + icon + (icon >= 17 ? 5 : 3) : ix0, end = W - ix0;
    const colGap = fAsc(sc.dev) >= 12 ? 8 : 6;
    const labelMax = stacked ? (longLabels ? end - x0 : Math.trunc((end - x0) / 2)) : Math.trunc(W / (longLabels ? 3 : 4));
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
      const y = HH + 2 + i * rowH + rowDy + shift, base = y + lineAsc;
      if (icon) {
        // centred on the bar (or the values in its place); temperature rows: on their text lines
        const top = r.inline ? base - fAsc(sc.dev) : y + barDy, h = r.inline ? (stacked ? line2 : 0) + fAsc(sc.dev) : sc.bar;
        drawSysIcon(fb, r.icon, ix0, top + Math.floor((h - icon) / 2), icon, wide && n === 2);
      }
      fText(fb, sc.dev, x0, base - fAsc(sc.dev), r.label, BK);
      if (r.inline) {   // NVMe: landscape the temperatures after the name (info column), upright in the second line
        const ix = stacked ? x0 : x0 + labelW + colGap;
        // a duration drops its smallest units instead of being cut
        const info = r.dur >= 0 ? uptimeText(0, r.dur, Math.trunc((end - ix + 1) / (fAsc(sc.pool) === 14 ? 12 : 6))) || "--" : r.info;
        fText(fb, sc.pool, ix, (stacked ? base + line2 : base) - fAsc(sc.pool), fFit(sc.pool, info, end - ix), BK);
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
      if (r.bar) drawSysBar(fb, x0, y + barDy, end - x0, sc.bar, r.bar[0], r.bar[1]);
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
      if (line === "#BEGIN") { rx = { host: "", time: "", rows: 0, warn: L.WARN_PCT, timer: 0, ringDir: 0, icons: 1, pctBar: 0, fast: 0, uptime: -1, upMonths: 0, wifiPage: 0, wifiIcons: true, disks: [], sys: null, page: 0 }; continue; }
      if (!rx) continue;
      if (line === "#END") { done = rx; rx = null; continue; }
      if (line.startsWith("H|")) {
        const f = splitFields(line, 16);
        if (f.length >= 3) {
          rx.host = f[1].slice(0, 16); rx.time = f[2].slice(0, 5);
          rx.rows = f.length >= 4 ? clamp(atoi(f[3]), 0, 6) : 0;
          rx.warn = f.length >= 5 ? clamp(atoi(f[4]), 0, 100) : L.WARN_PCT;
          rx.timer = f.length >= 8 ? clamp(atoi(f[7]), 0, 1) : 0;   // 0 badge, 1 ring
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
          parts: f[1].replace(/[^CRNVS]/g, ""), icons: f[1].includes("I"), cpu: num(2, 100), temp: num(3, 199), power: num(4, 9999), ramUsed: num(5, 2147483647), ramArc: num(6, 2147483647),
          ramTotal: num(7, 2147483647), iface: f[8] === "-" ? "" : f[8].replace(/[^A-Za-z0-9._-]/g, "").slice(0, 15),
          rx: num(9, 2147483647), tx: num(10, 2147483647), link: num(11, 1000000), nvme: tl(f[12]), ssd: tl(f[13]),
        };
      } else if (line.startsWith("D|")) {
        const f = splitFields(line, 11);
        if (f.length < 9 || rx.disks.length >= L.MAX_DISKS) continue;
        const steps = clamp(atoi(f[7]), 0, L.MAX_BOXES);
        rx.disks.push({
          dev: f[1].slice(0, 9), pool: f[2].slice(0, 15), used: f[3].slice(0, 7), total: f[4].slice(0, 7),
          pct: clamp(atoi(f[5]), -1, 100), idle: clamp(atoi(f[6]), 0, steps), steps, state: f[8][0] || "?",
          // seconds until spindown (-1 = unknown) and the timeout, for the MM:SS timer styles
          remain: f.length >= 10 && /^-?\d+$/.test(f[9]) ? clamp(Number(f[9]), -1, 359999) : -1,
          timeout: f.length >= 11 ? clamp(atoi(f[10]), 0, 359999) : 0,
        });
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
  function buildFrame(disks, s, title, time, system = null, fast = false, interval = 0) {
    // H fields 13 and 14: uptime (header shows it instead of the page number) as minutes after the
    // full calendar months, and the months; -1 = page number
    const up = s.headerUp && system && Number.isInteger(system.upRest) && system.upRest >= 0;
    const extra = [s.timer || 0, s.ringDir || 0, s.icons === 0 ? 0 : 1, s.pctBar ? (s.barCap ? 2 : 1) : 0, fast ? s.fast || 0 : 0,
      up ? system.upRest : -1, up ? system.upMonths || 0 : 0, s.showWifi ? (s.wifiIcons === 0 ? 2 : 1) : 0,   // H field 15: WiFi page
      interval > 0 ? noDataSecs(interval) : 0];   // H field 16: seconds until "NO DATA"
    const defaults = [0, 0, 1, 0, 0, -1, 0, 0, 0];
    while (extra.length && extra[extra.length - 1] === defaults[extra.length - 1]) extra.pop();
    const head = [`H|${title}|${time}|${s.rows || 0}|${s.warn ?? L.WARN_PCT}|${Math.trunc((s.rot || 0) / 90)}|${s.page ?? 600}`, ...extra].join("|");
    const lines = ["#BEGIN", head];
    const hidden = new Set(s.hidden || []);
    for (const d of s.showDisks === 0 ? [] : orderDisks(disks, s)) {   // disk pages switched off: no disks
      if (hidden.has(d.uid)) continue;
      let used = "-", total = "-", pct = -1;
      if (d.pool && d.total > 0) { used = hsize(d.used); total = hsize(d.total); pct = Math.floor(d.used * 100 / d.total); }
      else if (d.size > 0) total = hsize(d.size);   // not mounted: the size of the disk
      let steps = 0, idle = 0, st = d.state, remain = -1, tmo = 0;
      if (!s.boxes) { if (st !== "N") st = "-"; }   // timer off; flash drives keep N (chip symbol)
      else if ((st === "A" || st === "S") && d.timeout > 0 && d.poll > 0) {
        steps = Math.min(Math.ceil(d.timeout / d.poll), s.boxes);
        idle = Math.min(Math.floor(d.idle * steps / d.timeout), steps);
        tmo = d.timeout;
        // stale status (timer not running): last known state, but no time left
        remain = d.stale ? -1 : st === "S" ? 0 : Math.max(0, d.timeout - d.idle);
      }
      lines.push(`D|${d.dev}|${d.pool || "-"}|${used}|${total}|${pct}|${idle}|${steps}|${st}|${remain}|${tmo}`);
    }
    if (s.showSys !== 0 && Array.isArray(s.sys) && s.sys.length && system) lines.push(systemLine(system, s.sys, s.net, s.zfs !== 0, s.sysIcons !== 0));
    lines.push("#END");
    return lines.join("\n");
  }

  // S line from state.system, like system_line() in inksights.sh
  // parts: components (cpu, ram, net, nvme, ssd), letter I = symbols on; zfs = false: the ZFS cache is hidden (sent as -1,
  // the display counts it as free). At most 6 temperatures per type (the line must stay short).
  const PART_LETTER = { cpu: "C", ram: "R", net: "N", nvme: "V", ssd: "S" };
  function systemLine(y, parts, net, zfs = true, icons = true) {
    const ifs = Array.isArray(y.ifaces) ? y.ifaces : [];
    const name = net && ifs.some(i => i.name === net) ? net : y.defaultIface || (ifs[0] && ifs[0].name) || "";
    const i = ifs.find(x => x.name === name) || {};
    const v = x => (Number.isInteger(x) ? x : -1);
    const temps = list => (list || []).slice(0, 6).map(d => v(d.temp)).join(",") || "-";
    const letters = Object.keys(PART_LETTER).filter(p => parts.includes(p)).map(p => PART_LETTER[p]).join("") + (icons ? "I" : "");
    return ["S", letters, v(y.cpu), v(y.temp), v(y.power), v(y.ramUsed), zfs ? v(y.ramArc) : -1, v(y.ramTotal), name || "-", v(i.rx), v(i.tx), v(i.speed), temps(y.nvme), temps(y.ssd)].join("|");
  }

  // Paint a framebuffer. scale = screen device pixels per display pixel (whole number,
  // otherwise the browser stretches some pixel columns more than others).
  function blit(canvas, fb, scale) {
    const dpr = window.devicePixelRatio || 1;
    const off = document.createElement("canvas");
    off.width = fb.w; off.height = fb.h;
    const octx = off.getContext("2d");
    const img = octx.createImageData(fb.w, fb.h);
    for (let i = 0; i < fb.px.length; i++) {
      const [r, g, b] = PALETTE[fb.px[i]];
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    canvas.width = fb.w * scale; canvas.height = fb.h * scale;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    canvas.style.width = `${canvas.width / dpr}px`;
  }

  // Largest whole-number scale at which fbWidth display pixels fit into cssWidth
  const fitScale = (cssWidth, fbWidth) => Math.max(1, Math.floor(cssWidth * (window.devicePixelRatio || 1) / fbWidth));

  window.EPD = { WH, BK, RD, Fb, drawScreen, parseFrame, buildFrame, noDataSecs, systemLine, uptimeSplit, orderDisks, pageCount, rowsPerPage, hsize, blit, fitScale };
})();
