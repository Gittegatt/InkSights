/* InkSights - USB setup in the browser (Web Serial: Chrome, Edge)
 *
 * Talks to a board with the InkSights firmware over its USB port the way inksights.sh does:
 *   PING   -> PONG with ID, board, panel, pins, firmware and on WiFi boards the stored WiFi
 *             settings (texts hex encoded, never the passwords)
 *   W line -> WiFi settings (boards with WiFi); no answer, so PING again shows what was stored
 *   frame with a P line -> pins and panel type; the board answers "OK ... pins=saved restart",
 *             saves them and restarts
 * The simulator also sends the frame of a simulated display to the board ("Send to display").
 *
 * Used by usb-setup.html and simulator/simulator.html: InkSightsUSB.mount(element, options),
 * options.frames = () => [{ id, label, text }] adds "Send to display". Needs inksights-ui.js
 * (board and panel tables). Web Serial only works on pages opened from disk or over https.
 */
(function () {
  "use strict";
  const UI = window.InkSightsUI;
  const BAUD = 115200;   // USB ignores it, but opening at 1200 baud would put a SAMD21 into its bootloader
  const LOG_LINES = 200;
  const FIRMWARE_HELP = "https://github.com/Gittegatt/InkSights#2-upload-the-firmware";

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "value") e.value = v;
      else if (k === "checked" || k === "disabled" || k === "selected" || k === "open" || k === "hidden") e[k] = !!v;
      else e.setAttribute(k, v);
    }
    e.append(...kids.filter(k => k != null && k !== false));
    return e;
  }

  // Text -> UTF-8 hex for the W line ("" = "-")
  const toHex = s => [...new TextEncoder().encode(s)].map(b => b.toString(16).padStart(2, "0")).join("") || "-";
  const bytes = s => new TextEncoder().encode(s).length;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // "PONG InkSights id=1A2B3C4D size=212x104 colors=3 ... ssid=<hex> ..." -> what the board reports
  function parsePong(line) {
    const m = /^PONG InkSights id=([0-9A-F]{8}) size=(\d+)x(\d+)/.exec(line);
    if (!m) return null;
    const kv = {};
    for (const part of line.split(" ").slice(2)) {
      const i = part.indexOf("=");
      if (i > 0) kv[part.slice(0, i)] = part.slice(i + 1);
    }
    const pins = (kv.pins || "").split(",").map(Number);
    return {
      id: m[1], size: [Number(m[2]), Number(m[3])], colors: kv.colors === "2" ? 2 : 3,
      panel: /^[1-5]$/.test(kv.panel || "") ? Number(kv.panel) : 0,
      pins: pins.length === 4 && pins.every(Number.isInteger) ? pins : null,
      board: UI.BOARDS[kv.board] ? kv.board : UI.DEFAULT_BOARD, fw: kv.fw || "", wifi: kv.wifi === "1",
      net: kv.net || "", ip: kv.ip || "",
      // stored WiFi settings; settings = this firmware reports them (older ones do not)
      settings: "apdelay" in kv,
      ssid: UI.hexText(kv.ssid || ""), host: UI.hexText(kv.host || ""), server: UI.hexText(kv.server || ""),
      apOn: kv.ap !== "0", apSsid: UI.hexText(kv.apssid || ""), passSet: kv.pass === "1",
      apDelay: /^\d{1,4}$/.test(kv.apdelay || "") ? Number(kv.apdelay) : UI.DEFAULT_AP_DELAY,
    };
  }

  // ---------------------------------------------------------------- the serial link
  class Link {
    constructor(onLine, onEnd) { this.onLine = onLine; this.onEnd = onEnd; this.port = null; this.waiters = new Set(); }

    async open(port) {
      await port.open({ baudRate: BAUD });
      // DTR on (the SAMD21 only sends while it is set), RTS on with it: on the ESP32 boards DTR on
      // with RTS off would hold the boot pin low, so pressing RESET would start the ROM loader
      try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch (e) { /* not all drivers */ }
      this.port = port;
      this.closing = false;
      this.writer = port.writable.getWriter();
      this.reading = this.read();
    }

    async read() {
      const dec = new TextDecoder();
      let buf = "";
      const reader = this.port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).replace(/\r$/, "");
            buf = buf.slice(i + 1);
            this.onLine(line);
            for (const w of [...this.waiters]) w(line);
          }
          if (buf.length > 4096) buf = buf.slice(-512);   // no line end for long: keep the end only
        }
      } catch (e) { /* unplugged, restarted or closed */ }
      try { reader.releaseLock(); } catch (e) { /* already released */ }
      this.dead = true;   // nothing comes in any more
      if (!this.closing) this.onEnd();
    }

    async send(text) { await this.writer.write(new TextEncoder().encode(text)); }

    // Send text and return the first line after it for which test() is true, or null after ms
    // (listening starts before sending, so a quick answer is never missed)
    async ask(text, test, ms) {
      const answer = this.wait(test, ms);
      await this.send(text);
      return answer;
    }

    // The first line for which test() is true, or null after ms
    wait(test, ms) {
      return new Promise(resolve => {
        const w = line => { if (test(line)) { clearTimeout(t); this.waiters.delete(w); resolve(line); } };
        const t = setTimeout(() => { this.waiters.delete(w); resolve(null); }, ms);
        this.waiters.add(w);
      });
    }

    // PING until the board answers; a board that is drawing (up to a minute without a panel) answers late
    async ping(totalMs) {
      const end = Date.now() + totalMs;
      while (this.port && !this.dead && Date.now() < end) {
        let line;
        try { line = await this.ask("PING\n", l => l.startsWith("PONG InkSights "), 3000); } catch (e) { return null; }
        if (line) return parsePong(line);
      }
      return null;
    }

    async close() {
      const port = this.port;
      this.closing = true;
      this.port = null;
      try { await this.reader.cancel(); } catch (e) { /* gone */ }
      try { await this.reading; } catch (e) { /* gone */ }
      try { this.writer.releaseLock(); } catch (e) { /* gone */ }
      try { if (port) await port.close(); } catch (e) { /* gone */ }
    }
  }

  // ---------------------------------------------------------------- the card
  function mount(root, options = {}) {
    const supported = "serial" in navigator;
    let link = null, port = null, pong = null, busy = false;
    const log = [];

    const pill = el("span", { class: "pill" }, "not connected");
    const connectBtn = el("button", { class: "btn", type: "button", disabled: !supported, onclick: () => (link ? disconnect() : connect()) }, "Connect");
    const note = el("p", { class: "note", role: "status" },
      supported ? "" : "This browser cannot use USB. Use Chrome or Edge, with the page opened from disk or over https.");
    const meta = el("div", { class: "meta" });
    const body = el("div", { class: "form", hidden: true });
    const saveBtn = el("button", { class: "btn primary", type: "button", onclick: () => save() }, "Save");
    const msg = el("span", { class: "msg", role: "status" });
    const actions = el("div", { class: "actions", hidden: true }, saveBtn, msg);
    const logPre = el("pre");
    const logBox = el("details", { class: "fold boxed" }, el("summary", {}, "Log"), logPre);

    // Send to display (simulator): the frame of a simulated display
    let sendBox = null, sendSel = null, sendBtn = null, sendMsg = null;
    if (options.frames) {
      sendSel = el("select", { "aria-label": "Simulated display to send" });
      sendBtn = el("button", { class: "btn", type: "button", onclick: () => sendFrame() }, "Send to display");
      sendMsg = el("span", { class: "msg", role: "status" });
      sendBox = el("div", { class: "field boxed", hidden: true }, el("span", { class: "label" }, "Send to display"),
        el("div", { class: "choices" }, sendSel, sendBtn, sendMsg));
    }

    root.replaceChildren(el("section", { class: "card", "aria-label": "USB" },
      el("div", { class: "card-head" }, el("h2", {}, "USB"), pill, el("span", { style: "margin-left: auto" }), connectBtn),
      note, meta, body, actions, sendBox, logBox));

    const addLog = line => {
      log.push(line);
      if (log.length > LOG_LINES) log.splice(0, log.length - LOG_LINES);
      logPre.textContent = log.join("\n");
    };
    const setNote = (text, warn = false) => { note.textContent = text; note.className = warn ? "note warn" : "note"; };
    const setMsg = (text, kind = "") => { msg.textContent = text; msg.className = kind ? `msg ${kind}` : "msg"; };
    const setBusy = on => {
      busy = on;
      saveBtn.disabled = on;
      connectBtn.disabled = on || !supported;
      if (sendBtn) sendBtn.disabled = on;
    };

    // ---------------------------------------------------- connect / disconnect
    async function openPort(p) {
      link = new Link(addLog, () => lost());
      await link.open(p);
      port = p;
      pill.textContent = "connected";
      pill.className = "pill on";
      connectBtn.textContent = "Disconnect";
    }

    async function connect() {
      let p;
      try { p = await navigator.serial.requestPort(); } catch (e) { return; }   // no port chosen
      setBusy(true);
      try {
        await openPort(p);
      } catch (e) {
        setBusy(false);
        link = null;
        setNote(`The port cannot be opened (${e.message}). Close other programs that use it, e.g. a serial monitor.`, true);
        return;
      }
      await identify();
      setBusy(false);
    }

    async function identify() {
      setNote("Waiting for the board ...");
      pong = await link.ping(60000);
      if (!pong) {
        setNote("", true);
        note.append("No answer from an InkSights board. Upload the InkSights firmware first: ",
          el("a", { href: FIRMWARE_HELP, target: "_blank", rel: "noopener" }, "Upload the firmware"), ".");
        body.hidden = actions.hidden = true;
        if (sendBox) sendBox.hidden = true;
        return false;
      }
      setNote("");
      render();
      return true;
    }

    async function disconnect() {
      const l = link;
      link = null;
      port = null;
      pong = null;
      if (l) await l.close();
      pill.textContent = "not connected";
      pill.className = "pill";
      connectBtn.textContent = "Connect";
      meta.replaceChildren();
      body.hidden = actions.hidden = true;
      if (sendBox) sendBox.hidden = true;
      setMsg("");
    }

    // the port went away: unplugged, or the board restarted
    function lost() {
      if (expectRestart) return;
      disconnect();
      setNote("The board is gone (unplugged?). Connect again.", true);
    }

    // After saving pins / panel type the board restarts; its USB port may come back as a new one
    let expectRestart = false;
    async function afterRestart() {
      const info = port && port.getInfo ? port.getInfo() : {};
      await sleep(3000);
      if (link && link.port && !link.dead) {   // the port stayed (ESP32: the USB part may keep running)
        if (await identify()) return true;
      }
      if (link) { const l = link; link = null; await l.close(); }
      const end = Date.now() + 20000;
      while (Date.now() < end) {
        const ports = await navigator.serial.getPorts();
        const p = ports.find(x => x === port) ||
          ports.find(x => { const i = x.getInfo(); return i.usbVendorId === info.usbVendorId && i.usbProductId === info.usbProductId; });
        if (p) {
          try { await openPort(p); return await identify(); } catch (e) { link = null; }
        }
        await sleep(1000);
      }
      return false;
    }

    // ---------------------------------------------------- the settings
    const pinSel = [], wifi = {};
    let panelSel = null, apOnBox = null;

    function render() {
      const board = UI.BOARDS[pong.board], panel = UI.PANELS.find(p => p.id === pong.panel);
      const net = !pong.wifi ? "" : pong.net === "sta" ? `WiFi ${pong.ip}` : pong.net === "ap" ? "Setup access point open" : "WiFi off";
      meta.replaceChildren(...[`ID ${pong.id}`, board.name, `Firmware ${pong.fw || "?"}`,
        panel ? UI.panelLabel(panel) : "panel type not reported", net, pong.wifi && pong.ssid ? `Network ${pong.ssid}` : ""]
        .filter(Boolean).map(t => el("span", {}, t)));

      panelSel = el("select", { "aria-label": "Panel" }, ...UI.PANELS.map(p => el("option", { value: String(p.id) }, UI.panelLabel(p))));
      panelSel.value = String(pong.panel || 1);
      const shown = pong.pins || board.defaults;
      pinSel.length = 0;
      const pinBoxes = UI.PIN_NAMES.map((label, n) => {
        const choices = [...board.pins, ...(n >= 2 ? [UI.PIN_NONE] : [])];
        if (!choices.includes(shown[n])) choices.unshift(shown[n]);   // what the board reports, even if unusual
        const sel = el("select", { "aria-label": `${label} pin`, onchange: () => setMsg("") },
          ...choices.map(p => el("option", { value: String(p) }, UI.pinLabel(board, p))));
        sel.value = String(shown[n]);
        pinSel.push(sel);
        return el("label", { class: "check" }, `${label} `, sel);
      });
      const kids = [
        el("div", { class: "field wide" }, el("span", { class: "label" }, "Panel"), el("div", { class: "choices panel-pick" }, panelSel)),
        el("div", { class: "field wide boxed" }, el("span", { class: "label" }, "Display pins"), el("div", { class: "choices pins" }, ...pinBoxes)),
      ];
      if (pong.wifi) kids.push(wifiForm());
      body.replaceChildren(...kids);
      body.hidden = false;
      actions.hidden = false;
      if (sendBox) { sendBox.hidden = false; fillFrames(); }
    }

    function wifiForm() {
      const input = (key, label, attrs = {}) => {
        wifi[key] = el("input", { type: "text", autocomplete: "off", ...attrs });
        return el("label", { class: "field" }, el("span", { class: "label" }, label), wifi[key]);
      };
      apOnBox = { on: el("input", { type: "radio", name: "usb-apon", checked: pong.apOn }), off: el("input", { type: "radio", name: "usb-apon", checked: !pong.apOn }) };
      const box = el("form", { class: "wifi-grid field wide boxed", autocomplete: "off", onsubmit: e => e.preventDefault() },   // a form, so browsers handle the password fields properly
        input("ssid", "WiFi network", { maxlength: "32", value: pong.ssid }),
        input("pass", "Password", { type: "password", maxlength: "63", value: "", placeholder: pong.passSet ? "unchanged" : "" }),
        input("server", "Settings page", { maxlength: "120", value: pong.server, placeholder: "http://hostname:8099" }),
        input("host", "Host name", { maxlength: "32", value: pong.host, placeholder: `inksights-${pong.id.toLowerCase()}` }),
        el("div", { class: "field" }, el("span", { class: "label" }, "Setup access point"),
          el("div", { class: "choices" }, el("label", { class: "check" }, apOnBox.on, "On"), el("label", { class: "check" }, apOnBox.off, "Off"))),
        input("apDelay", "Failover access point after (s)", { type: "number", min: "0", max: String(UI.MAX_AP_DELAY), step: "1", value: String(pong.apDelay), style: "max-width: 7em" }),
        input("apSsid", "Access point name", { maxlength: "32", value: pong.apSsid, placeholder: UI.DEFAULT_AP_SSID }),
        input("apPass", "Access point password", { type: "password", maxlength: "63", value: "", placeholder: "unchanged" }));
      if (!pong.settings) {   // older firmware: it does not report its WiFi settings, so saving would overwrite them
        box.querySelectorAll("input").forEach(i => { i.disabled = true; });
        box.prepend(el("p", { class: "note warn wide" }, "This firmware does not report its WiFi settings. Upload the new firmware to set the WiFi here."));
      }
      return box;
    }

    // What the form asks for, or a problem (text)
    function wanted() {
      const board = UI.BOARDS[pong.board];
      const pins = pinSel.map(s => Number(s.value)), panel = Number(panelSel.value);
      const used = pins.filter(p => p !== UI.PIN_NONE);
      if (new Set(used).size !== used.length) return "CS, D/C, Reset and Busy need different pins.";
      if (!pins.slice(0, 2).every(p => board.pins.includes(p)) || !pins.slice(2).every(p => p === UI.PIN_NONE || board.pins.includes(p)))
        return "Choose pins this board allows.";
      const out = { pins, panel, pinsChanged: !pong.pins || panel !== pong.panel || pins.some((p, i) => p !== pong.pins[i]), wifi: null };
      if (pong.wifi && pong.settings) {
        const w = {
          ssid: wifi.ssid.value.trim(), pass: wifi.pass.value, server: wifi.server.value.trim(), host: wifi.host.value.trim(),
          apOn: apOnBox.on.checked, apDelay: wifi.apDelay.value.trim(), apSsid: wifi.apSsid.value.trim(), apPass: wifi.apPass.value,
        };
        const ctrl = s => /[\x00-\x1f\x7f]/.test(s);
        if (bytes(w.ssid) > 32 || ctrl(w.ssid)) return "WiFi network max. 32 characters, no control characters.";
        if (w.pass && (w.pass.length < 8 || w.pass.length > 63 || ctrl(w.pass))) return "WiFi password 8 to 63 characters.";
        if (w.server && !UI.SERVER_RE.test(w.server)) return "Settings page address like http://hostname:8099.";
        if (w.host && !UI.HOST_RE.test(w.host)) return "Host name only letters, digits and -, max. 32.";
        if (!/^\d{1,4}$/.test(w.apDelay) || Number(w.apDelay) > UI.MAX_AP_DELAY) return `Access point after 0 to ${UI.MAX_AP_DELAY} seconds.`;
        if (bytes(w.apSsid) > 32 || ctrl(w.apSsid)) return "Access point name max. 32 characters, no control characters.";
        if (w.apPass && (w.apPass.length < 8 || w.apPass.length > 63 || ctrl(w.apPass))) return "Access point password 8 to 63 characters.";
        w.apDelay = Number(w.apDelay);
        const changed = w.ssid !== pong.ssid || w.pass !== "" || w.server !== pong.server || (w.host !== "" && w.host !== pong.host) ||
          w.apOn !== pong.apOn || w.apDelay !== pong.apDelay || (w.apSsid !== "" && w.apSsid !== pong.apSsid) || w.apPass !== "";
        if (changed) out.wifi = w;
      }
      return out;
    }

    async function save() {
      if (!link || !pong || busy) return;
      const want = wanted();
      if (typeof want === "string") { setMsg(want, "warn"); return; }
      if (!want.wifi && !want.pinsChanged) { setMsg("Nothing changed.", ""); return; }
      setBusy(true);
      setMsg("Saving ...");
      try {
        if (want.wifi) {
          const w = want.wifi;
          // empty password fields keep the stored passwords; empty host and access point name keep theirs
          const line = ["W", toHex(w.ssid), w.pass ? toHex(w.pass) : "*", toHex(w.host), toHex(w.server), w.apOn ? "1" : "0",
            toHex(w.apSsid), w.apPass ? toHex(w.apPass) : "*", String(w.apDelay)].join("|");
          addLog("> W|(WiFi settings)");
          await link.send(line + "\n");
          await sleep(1500);
          setMsg("WiFi settings sent ...");
        }
        if (want.pinsChanged) {
          const p = want.pins;
          addLog(`> P|${p.join("|")}|${want.panel}`);
          const answer = await link.ask(`#BEGIN\nH|InkSights|--:--\nP|${p.join("|")}|${want.panel}\n#END\n`, l => l.startsWith("OK "), 30000);
          if (!answer) { setMsg("No answer from the board.", "warn"); return; }
          if (!/pins=saved/.test(answer)) { setMsg("The board did not take the pins.", "warn"); return; }
          setMsg("Saved. The board restarts ...");
          expectRestart = true;
          const back = await afterRestart();
          expectRestart = false;
          if (!back) { await disconnect(); setNote("The board restarted. Connect again to check it.", true); return; }
        } else {
          const before = pong;
          pong = await link.ping(30000);
          if (!pong) { pong = before; setMsg("No answer from the board.", "warn"); return; }
          render();
        }
        // what the board reports now
        const w = want.wifi;
        if (w && pong.settings && (pong.ssid !== w.ssid || pong.server !== w.server || pong.apOn !== w.apOn || pong.apDelay !== w.apDelay))
          setMsg("The board did not take the WiFi settings.", "warn");
        else setMsg("Saved.", "ok");
      } catch (e) {
        setMsg(`Sending failed (${e.message}).`, "warn");
      } finally {
        expectRestart = false;
        setBusy(false);
      }
    }

    // ---------------------------------------------------- send to display (simulator)
    function fillFrames() {
      const keep = sendSel.value;
      const list = options.frames();
      sendSel.replaceChildren(...list.map(f => el("option", { value: f.id }, f.label === `Display ${f.id}` ? f.label : `${f.label} · ${f.id}`)));
      if (list.some(f => f.id === keep)) sendSel.value = keep;
    }

    async function sendFrame() {
      if (!link || busy) return;
      const f = options.frames().find(x => x.id === sendSel.value);
      if (!f || !f.text.includes("#END")) { sendMsg.textContent = "No frame for this display."; sendMsg.className = "msg warn"; return; }
      // no "NO DATA" (the simulated time does not move), and drawn right away ("R")
      const lines = f.text.split("\n").filter(l => l !== "").map(l => {
        if (!l.startsWith("H|")) return l;
        const h = l.split("|");
        if (h.length >= 16) h[15] = "0";
        return h.join("|");
      }).filter(l => l !== "R");
      lines.splice(lines.lastIndexOf("#END"), 0, "R");
      setBusy(true);
      sendMsg.textContent = "Sending ...";
      sendMsg.className = "msg";
      try {
        addLog(`> frame of ${f.id} (${lines.length} lines)`);
        const answer = await link.ask(lines.join("\n") + "\n", l => l.startsWith("OK "), 30000);
        sendMsg.textContent = answer || "No answer from the board.";
        sendMsg.className = answer ? "msg ok" : "msg warn";
      } catch (e) {
        sendMsg.textContent = `Sending failed (${e.message}).`;
        sendMsg.className = "msg warn";
      } finally {
        setBusy(false);
      }
    }

    if (supported) navigator.serial.addEventListener("disconnect", e => { if (port && e.target === port && !expectRestart) lost(); });
    return { refreshFrames: () => { if (sendBox && !sendBox.hidden) fillFrames(); } };
  }

  window.InkSightsUSB = { mount, parsePong };
})();
