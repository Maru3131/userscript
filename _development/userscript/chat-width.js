(() => {
  "use strict";
  // Wider chat column. JanitorAI caps the messages and the textbox at a fixed
  // width, which leaves most of a large monitor empty. Instead of guessing the
  // site's hashed class names, this finds the boxes that do the capping by
  // measuring: centered elements about as wide as the textbox whose max-width
  // is a fixed pixel value. It tags them and raises their max-width.
  // Width is chosen with a live slider (script menu "Chat width...").
  const marker = "__janitorChatWidthLoaded";
  if (window[marker]) return;
  window[marker] = true;

  const KEY = "jai-chat-width";          // px, 0 = site default
  const ATTR = "data-jai-wide";
  // Room kept free at each side, measured from the name panel (left) and the
  // proxy button (right) so small screens still get a usable range.
  function sideReserve() {
    let left = 0, right = 0;
    const header = document.querySelector("#character-name-button")
      ?.closest('[class^="_headerContainer_"],[class*=" _headerContainer_"]');
    const hr = header?.getBoundingClientRect();
    if (hr && hr.width) left = hr.right;
    const api = header?.querySelector('[class^="_apiTag_"],[class*=" _apiTag_"]');
    const ar = api?.getBoundingClientRect();
    if (ar && ar.width) right = innerWidth - ar.left;
    return Math.ceil(Math.max(left, right, 24) + 16);
  }
  const maxAllowed = () => Math.max(native, innerWidth - sideReserve() * 2);
  let chosen = Number(GM_getValue(KEY, 0)) || 0;

  const style = document.createElement("style");
  style.id = "local-janitor-chat-width";
  (document.head || document.documentElement).append(style);

  const cls = name => `:is([class^="_${name}_"],[class*=" _${name}_"])`;
  const onChat = () => /\/chats\/\d+/.test(String(location.pathname || ""));

  // Selectors for the capping boxes, built from their class names so one rule
  // covers every message, including ones that arrive later.
  const selectors = new Set();
  function writeCSS() {
    if (!chosen || !selectors.size) { style.textContent = ""; return; }
    // Never narrower than the site's own width, never under the side panels.
    const width = `${Math.round(Math.max(native, Math.min(chosen, maxAllowed())))}px`;
    style.textContent = `${Array.from(selectors).join(",\n")} { max-width: ${width} !important; }`;
  }

  function referenceWidth() {
    const inner = document.querySelector(`${cls("chatInputInner")}`);
    const r = inner?.getBoundingClientRect();
    return r && r.width > 200 ? r.width : 0;
  }

  const ours = el => el.closest?.("[data-janitor-image-float],[data-jai-local-image-ui],[data-jai-copy-chat-ui],[data-jai-width-ui]");

  function selectorFor(el) {
    const tokens = Array.from(el.classList).filter(c => !/^(active|hover|open|selected)$/i.test(c));
    if (tokens.length) return el.tagName.toLowerCase() + tokens.map(c => "." + CSS.escape(c)).join("");
    el.setAttribute(ATTR, "");
    return `[${ATTR}]`;
  }

  // Elements worth checking: everything above the textbox, and above whatever
  // sits in the middle of the screen (the messages). Cheap, and immune to how
  // the site names things.
  function candidates() {
    const out = new Set();
    const starts = [document.querySelector(`${cls("chatInputInner")}`)];
    const x = innerWidth / 2;
    for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) starts.push(document.elementFromPoint(x, innerHeight * f));
    for (let el of starts) {
      for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
        if (out.has(el)) break;
        if (!ours(el)) out.add(el);
      }
    }
    return out;
  }

  // One pass: find capped, centered boxes about as wide as the column.
  function tagPass(ref) {
    let changed = false;
    const mid = innerWidth / 2;
    for (const el of candidates()) {
      const cs = getComputedStyle(el);
      if (!cs.maxWidth.endsWith("px")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < ref * 0.85 || r.width > ref * 1.25 || r.height < 30) continue;
      if (Math.abs(r.left + r.width / 2 - mid) > 60) continue;           // the column is centered
      if (Math.abs(parseFloat(cs.maxWidth) - r.width) > 4) continue;     // actually held back by max-width
      const sel = selectorFor(el);
      if (!selectors.has(sel)) { selectors.add(sel); changed = true; }
    }
    if (changed) writeCSS();
    return changed;
  }

  let native = 0;
  let scheduled = false;
  function apply() {
    scheduled = false;
    if (!chosen || !onChat()) return;
    // Measure the site's own width once, before anything is widened.
    if (!native) native = referenceWidth();
    if (!native) return;
    // Widening one box can reveal the next cap further up; repeat a few times.
    for (let i = 0; i < 6; i++) {
      if (!tagPass(referenceWidth() || native)) break;
    }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(apply, 250);
  }

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", () => { writeCSS(); schedule(); });
  document.addEventListener("scroll", schedule, { capture: true, passive: true });

  function setWidth(px, save) {
    chosen = px;
    writeCSS();
    apply();
    if (save) GM_setValue(KEY, chosen);
  }

  // ---- slider ----
  let panel = null;
  function closePanel() { panel?.remove(); panel = null; }
  function openPanel() {
    if (panel) { closePanel(); return; }
    if (!onChat()) { toast("Open a chat first."); return; }
    if (!native) native = referenceWidth();
    if (!native) { toast("Couldn't find the chat column on this page."); return; }
    const before = chosen;
    const min = Math.round(native);
    const max = Math.round(maxAllowed());
    if (max - min < 20) { toast("This window is too narrow to widen the chat. Try a smaller zoom (Ctrl + -)."); return; }
    panel = document.createElement("div");
    panel.setAttribute("data-jai-width-ui", "");
    panel.style.cssText = "position:fixed!important;top:16px!important;left:50%!important;transform:translateX(-50%)!important;z-index:2147483647!important;display:flex!important;gap:10px!important;align-items:center!important;background:rgba(36,30,26,.94)!important;color:#eee6da!important;border:1px solid rgba(211,152,123,.45)!important;border-radius:12px!important;padding:10px 14px!important;font:14px system-ui!important;";
    const label = document.createElement("span");
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = "10";
    slider.value = String(Math.min(max, Math.max(min, chosen || min)));
    slider.style.cssText = "width:260px!important;accent-color:#c78668!important;";
    const show = () => { label.textContent = `Chat width: ${slider.value}px`; };
    slider.addEventListener("input", () => { show(); setWidth(Number(slider.value) <= min ? 0 : Number(slider.value), false); });
    const btn = (text, primary, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.style.cssText = primary
        ? "background:#c78668!important;color:#241a15!important;border:0!important;border-radius:10px!important;padding:7px 12px!important;font:600 13px system-ui!important;cursor:pointer!important;"
        : "background:transparent!important;color:#c6b6a6!important;border:1px solid rgba(238,230,218,.2)!important;border-radius:10px!important;padding:7px 12px!important;font:13px system-ui!important;cursor:pointer!important;";
      b.addEventListener("click", fn);
      return b;
    };
    panel.append(
      label, slider,
      btn("Save", true, () => { setWidth(chosen, true); closePanel(); toast(chosen ? `Chat width saved: ${chosen}px` : "Chat width: site default"); }),
      btn("Default", false, () => { slider.value = String(min); show(); setWidth(0, false); }),
      btn("Cancel", false, () => { setWidth(before, false); closePanel(); }),
    );
    show();
    document.documentElement.append(panel);
    slider.focus();
    panel.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setWidth(before, false); closePanel(); }
    });
  }

  GM_registerMenuCommand("Chat width...", openPanel);
  writeCSS();
  schedule();
})();
