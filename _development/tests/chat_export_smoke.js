// Chat-export checks for the merged installer, run in jsdom against a fake
// JanitorAI API (no live site). Compares the merged export byte-for-byte with
// the original standalone "JanitorAI Copy Chat" 1.0.0 output.
//   npm install jsdom   (once, anywhere on NODE_PATH)
//   node _development/tests/chat_export_smoke.js
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..", "..");
const merged = fs.readFileSync(path.join(ROOT, "transparent-header.user.js"), "utf8");
const legacy = fs.readFileSync(path.join(__dirname, "fixtures", "janitorai-copy-chat-1.0.0.user.js"), "utf8");

const CHAT = {
  chat: { id: 4242, character_id: "char-1" },
  personas: [{ name: "Pheonix" }],
  chatMessages: [
    { id: 3, is_bot: false, is_main: true, created_at: "2026-01-01T10:02:00Z", message: "Hello {{char}}!" },
    { id: 1, is_bot: true, is_main: true, created_at: "2026-01-01T10:00:00Z", message: "  *{{char}} waves at {{user}}.*  " },
    { id: 4, is_bot: true, is_main: false, created_at: "2026-01-01T10:05:00Z", message: "REJECTED SWIPE" },
    { id: 5, is_bot: true, is_main: true, created_at: "2026-01-01T10:03:00Z", message: "Line one\n\nLine two" },
  ],
};
const CHARACTER = { name: "Christian" };
const tokenCookie = "sb-auth-auth-token=base64-" +
  Buffer.from(JSON.stringify({ access_token: "tok123" })).toString("base64url");

async function page(url, { loggedIn = true } = {}) {
  const dom = new JSDOM("<!doctype html><html><head></head><body><main>chat</main></body></html>",
    { url, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  if (loggedIn) w.document.cookie = tokenCookie;
  const calls = [];
  w.fetch = async (u, init) => {
    calls.push({ url: String(u), auth: init?.headers?.authorization });
    const p = new URL(String(u), w.location.href).pathname;
    const body = p === "/hampter/chats/4242" ? CHAT : p === "/hampter/characters/char-1" ? CHARACTER : null;
    return { ok: !!body, status: body ? 200 : 404, text: async () => JSON.stringify(body), json: async () => body };
  };
  if (!w.crypto.randomUUID) w.crypto.randomUUID = () => Math.random().toString(16).slice(2);
  if (w.document.readyState !== "complete") await new Promise((r) => w.addEventListener("load", r));
  return { dom, w, calls };
}

function gmStubs(w) {
  const store = new Map(); const menu = {}; const out = { clip: null, menu };
  Object.assign(w, {
    GM_info: { isIncognito: false },
    GM_getValue: (k, d) => (store.has(k) ? store.get(k) : d),
    GM_setValue: (k, v) => store.set(k, v),
    GM_deleteValue: (k) => store.delete(k),
    GM_addValueChangeListener: () => {},
    GM_registerMenuCommand: (name, fn) => { menu[name] = fn; },
    GM_setClipboard: (t) => { out.clip = t; },
  });
  return out;
}

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 1. Legacy 1.0.0 output (page context, navigator.clipboard)
  const L = await page("https://janitorai.com/chats/4242");
  let legacyText = null;
  Object.defineProperty(L.w.navigator, "clipboard", { value: { writeText: async (t) => { legacyText = t; } } });
  L.w.eval(legacy);
  L.w.document.getElementById("jai-copy-chat-btn").click();
  await tick();
  assert.ok(legacyText, "legacy script produced no export");

  // 2. Merged installer, with our own UI present on the page
  const M = await page("https://janitorai.com/chats/4242");
  const gm = gmStubs(M.w);
  M.w.eval(merged);
  // Simulate a floating image + label editor + notice already on screen.
  const fake = M.w.document.createElement("div");
  fake.setAttribute("data-janitor-image-float", "");
  fake.textContent = "LABEL-NAME note text";
  M.w.document.body.append(fake);
  const buttons = M.w.document.querySelectorAll("#jai-copy-chat-btn");
  assert.strictEqual(buttons.length, 1, "expected exactly one Copy chat button");
  buttons[0].click();
  await tick();
  assert.strictEqual(gm.clip, legacyText, "merged export differs from legacy 1.0.0 output");
  assert.ok(!gm.clip.includes("REJECTED SWIPE"), "rejected swipe exported");
  assert.ok(!gm.clip.includes("LABEL-NAME"), "overlay text leaked into export");
  assert.ok(M.calls.every((c) => c.auth === "Bearer tok123"), "missing auth header");
  assert.ok(M.calls.every((c) => c.url.startsWith("https://janitorai.com/hampter/")), "request left janitorai.com");
  assert.ok(M.w.document.getElementById("local-janitor-transparent-header"), "header theme missing");
  assert.ok(M.w.document.getElementById("local-janitor-warm-composer"), "composer theme missing");
  assert.ok(gm.menu["Close all floating images"] && gm.menu["Crop floating image (optional)"], "viewer menu missing");

  // 3. Menu command path (no click activation needed)
  gm.clip = null;
  gm.menu["Copy chat to clipboard"]();
  await tick();
  assert.strictEqual(gm.clip, legacyText, "menu export differs");

  // 4. SPA navigation: hidden off-chat, back on chat, still one button
  M.w.history.pushState({}, "", "/characters/abc");
  await tick(600);
  assert.strictEqual(buttons[0].style.display, "none", "button visible off-chat");
  M.w.history.pushState({}, "", "/chats/4242");
  await tick(600);
  assert.strictEqual(buttons[0].style.display, "", "button hidden on chat");
  M.w.eval(merged); // double injection must not duplicate anything
  assert.strictEqual(M.w.document.querySelectorAll("#jai-copy-chat-btn").length, 1, "duplicate button after re-run");

  // 5. Not logged in -> error shown on the button, nothing copied
  const N = await page("https://janitorai.com/chats/4242", { loggedIn: false });
  const gmN = gmStubs(N.w);
  N.w.eval(merged);
  N.w.document.getElementById("jai-copy-chat-btn").click();
  await tick();
  assert.strictEqual(gmN.clip, null);
  assert.strictEqual(N.w.document.getElementById("jai-copy-chat-btn").textContent, "Not logged in");

  // 6. Legacy script still installed and ran first -> no second button
  const B = await page("https://janitorai.com/chats/4242");
  Object.defineProperty(B.w.navigator, "clipboard", { value: { writeText: async () => {} } });
  B.w.eval(legacy);
  gmStubs(B.w);
  B.w.eval(merged);
  assert.strictEqual(B.w.document.querySelectorAll("#jai-copy-chat-btn").length, 1, "two Copy chat buttons");

  // 7. Other sites: picker transport only, no exporter, no theme
  const O = await page("https://example.com/gallery");
  const gmO = gmStubs(O.w);
  O.w.eval(merged);
  assert.strictEqual(O.w.document.getElementById("jai-copy-chat-btn"), null, "exporter ran on other site");
  assert.strictEqual(O.w.document.getElementById("local-janitor-transparent-header"), null, "theme ran on other site");
  assert.ok(gmO.menu["Choose image for JanitorAI (Alt+Shift+J)"], "picker menu missing on source site");
  assert.ok(!gmO.menu["Copy chat to clipboard"], "copy menu on other site");

  for (const p of [L, M, N, B, O]) p.w.close();
  console.log("chat_export_smoke: all checks passed");
  console.log("--- exported text ---\n" + legacyText);
})().catch((e) => { console.error(e); process.exit(1); });
