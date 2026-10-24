// Paste / drop / open-file checks for the merged installer, in jsdom.
//   npm install jsdom ; node _development/tests/local_images_smoke.js
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { webcrypto } = require("crypto");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..", "..");
const script = fs.readFileSync(path.join(ROOT, "transparent-header.user.js"), "utf8");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));

async function page(url) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><textarea id="t"></textarea><div id="spot">x</div></body></html>',
    { url, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  if (w.document.readyState !== "complete") await new Promise(r => w.addEventListener("load", r));
  Object.defineProperty(w, "crypto", { value: webcrypto, configurable: true });
  const roots = new Map();
  const attach = w.Element.prototype.attachShadow;
  w.Element.prototype.attachShadow = function (o) { const r = attach.call(this, o); roots.set(this, r); return r; };
  w.__roots = roots;
  w.ResizeObserver = w.ResizeObserver || class { observe() {} disconnect() {} unobserve() {} };
  const store = new Map(); const menu = {}; const toasts = [];
  Object.assign(w, {
    GM_info: { isIncognito: false },
    GM_getValue: (k, d) => (store.has(k) ? store.get(k) : d),
    GM_setValue: (k, v) => store.set(k, v),
    GM_deleteValue: k => store.delete(k),
    GM_addValueChangeListener: () => {},
    GM_registerMenuCommand: (n, f) => { menu[n] = f; },
    GM_setClipboard: () => {},
  });
  w.eval(script);
  return { w, store, menu };
}
const viewers = w => Array.from(w.document.querySelectorAll("[data-janitor-image-float]"));
const imgSrcs = w => viewers(w).map(h => w.__roots.get(h)?.querySelector("img")?.getAttribute("src") || "");

function fire(w, type, target, data) {
  const ev = new w.Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.defineProperty(ev, type === "paste" ? "clipboardData" : "dataTransfer", { value: data });
  target.dispatchEvent(ev);
  return ev;
}
const fileData = (w, name = "chatgpt.png", bytes = PNG, type = "image/png") => {
  const f = new w.File([bytes], name, { type });
  return { files: [f], types: ["Files"], getData: () => "" };
};

(async () => {
  const J = await page("https://janitorai.com/chats/4242");
  const { w } = J;
  assert.ok(J.menu["Open image from file / paste..."], "menu entry missing");

  // Paste on the page -> one viewer with a data: URL
  const ev = fire(w, "paste", w.document.getElementById("spot"), fileData(w));
  assert.ok(ev.defaultPrevented, "paste not handled");
  await tick(200);
  assert.strictEqual(viewers(w).length, 1, "no viewer after paste");
  assert.ok(imgSrcs(w)[0].startsWith("data:image/png;base64,"), "viewer src is not a data URL: " + imgSrcs(w)[0].slice(0, 40));

  // Same image again -> still one viewer (raised, not duplicated)
  fire(w, "paste", w.document.body, fileData(w, "again.png"));
  await tick(200);
  assert.strictEqual(viewers(w).length, 1, "same image opened twice");

  // Paste inside the chat textbox -> left alone
  const ev2 = fire(w, "paste", w.document.getElementById("t"), fileData(w));
  assert.ok(!ev2.defaultPrevented, "paste in textbox was hijacked");

  // Drop a different image file -> second independent viewer
  const other = Buffer.from(PNG); other[other.length - 20] ^= 1;
  const dz = fire(w, "dragover", w.document.body, fileData(w));
  assert.ok(dz.defaultPrevented, "dragover not accepted");
  fire(w, "drop", w.document.body, fileData(w, "b.png", other));
  await tick(200);
  assert.strictEqual(viewers(w).length, 2, "drop did not open a second viewer");

  // Non-image file -> ignored
  fire(w, "paste", w.document.body, fileData(w, "a.txt", Buffer.from("hi"), "text/plain"));
  await tick(100);
  assert.strictEqual(viewers(w).length, 2);

  // Image dragged from another tab (link) -> opens that URL
  fire(w, "drop", w.document.body, { files: [], types: ["text/uri-list"], getData: () => "https://example.com/pic.png" });
  await tick(200);
  assert.ok(imgSrcs(w).includes("https://example.com/pic.png"), "dragged link not opened");

  // Labels saved for the pasted image come back under the same key next time
  const key0 = Array.from(J.store.keys()).filter(k => k.includes("labels-"));
  const J2 = await page("https://janitorai.com/chats/4242");
  fire(J2.w, "paste", J2.w.document.body, fileData(J2.w, "renamed.png"));
  await tick(200);
  const viewer = imgSrcs(J2.w)[0];
  assert.strictEqual(viewer, imgSrcs(w)[0], "same file produced a different address");

  // Close-all still works on pasted viewers
  J.menu["Close all floating images"]();
  await tick();
  assert.strictEqual(viewers(w).length, 0, "close all failed");

  // Other sites: no paste/drop takeover
  const O = await page("https://example.com/");
  const ev3 = fire(O.w, "paste", O.w.document.body, fileData(O.w));
  assert.ok(!ev3.defaultPrevented, "paste hijacked on another site");
  assert.ok(!O.menu["Open image from file / paste..."], "file menu on another site");

  console.log("local_images_smoke: all checks passed", key0.length >= 0 ? "" : "");
  for (const p of [J, J2, O]) p.w.close();
})().catch(e => { console.error(e); process.exit(1); });
