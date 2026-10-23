/* global browser */
(() => {
  "use strict";
  if (window.__janitorImageFloatLoaded) return;
  window.__janitorImageFloatLoaded = true;
  const isJanitor = /(^|\.)janitorai\.com$/i.test(location.hostname) && location.protocol === "https:";
  let host, root, panel, picture, status, stage;
  let picking = false;
  let notice;
  let aspect = 1;
  let viewerWidth = 340;
  let selectedSource = null;
  let drag = null;
  let observer;
  const safeSource = value => {
    try {
      const url = new URL(value, location.href);
      return ["https:", "http:", "blob:"].includes(url.protocol) || /^data:image\//i.test(value) ? url.href : null;
    } catch { return null; }
  };
  function clamp() {
    if (!panel) return;
    if (!Number.isFinite(aspect) || aspect <= 0) aspect = 1;
    const width = Math.max(1, Math.min(viewerWidth, Math.max(1, innerWidth), Math.max(1, innerHeight) * aspect));
    panel.style.width = `${width}px`;
    panel.style.height = `${width / aspect}px`;
    const rect = panel.getBoundingClientRect();
    // Leave a small reachable strip, while allowing most of the image offscreen.
    panel.style.left = `${Math.max(24 - rect.width, Math.min(rect.left, innerWidth - 24))}px`;
    panel.style.top = `${Math.max(24 - rect.height, Math.min(rect.top, innerHeight - 24))}px`;
  }
  function bringBack() {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(0, Math.min(rect.left, innerWidth - rect.width))}px`;
    panel.style.top = `${Math.max(0, Math.min(rect.top, innerHeight - rect.height))}px`;
  }
  function close() {
    observer?.disconnect();
    window.removeEventListener("resize", clamp);
    host?.remove();
    host = root = panel = picture = status = stage = null;
    drag = null;
    aspect = 1;
    viewerWidth = 340;
  }
  function fit() {
    setSize(Math.min(340, innerWidth * 0.8, innerHeight * 0.8 * aspect));
  }
  function changeZoom(factor) {
    setSize(panel.getBoundingClientRect().width * factor);
  }
  function setSize(width) {
    if (!Number.isFinite(aspect) || aspect <= 0) aspect = 1;
    const max = Math.min(innerWidth, innerHeight * aspect);
    const min = Math.min(100, max);
    const size = Math.max(min, Math.min(Number.isFinite(width) ? width : 340, max));
    viewerWidth = size;
    panel.style.width = `${size}px`;
    panel.style.height = `${size / aspect}px`;
    clamp();
  }
  function create() {
    host = document.createElement("div");
    host.setAttribute("data-janitor-image-float", "");
    host.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;width:0!important;height:0!important;z-index:2147483647!important;";
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        * { box-sizing:border-box; }
        section { position:fixed; width:340px; height:340px; background:transparent; color:white; border:0; font:13px/1.4 system-ui,sans-serif; color-scheme:dark; user-select:none; touch-action:none; }
        button { font:16px/1 system-ui; color:white; background:#20202755; backdrop-filter:blur(12px); border:0; border-radius:50%; width:28px; height:28px; padding:0; cursor:pointer; text-shadow:0 1px 3px #000; }
        button:hover { background:#202027aa; }
        button:focus-visible { outline:2px solid #d1b1ff; outline-offset:2px; }
        .stage { width:100%; height:100%; background:transparent; cursor:grab; }
        .stage:active { cursor:grabbing; }
        img { display:block; width:100%; height:100%; max-width:none; max-height:none; }
        .controls { position:absolute; top:6px; right:6px; display:flex; flex-wrap:wrap; justify-content:flex-end; gap:4px; max-width:calc(100% - 12px); }
        .controls, .resize { opacity:0; transition:opacity .15s; }
        section:hover .controls, section:hover .resize, section:focus-within .controls, section:focus-within .resize { opacity:1; }
        .resize { position:absolute; right:0; bottom:0; width:24px; height:24px; border-radius:12px 0 0 0; cursor:nwse-resize; touch-action:none; }
        .resize::after { content:''; position:absolute; right:5px; bottom:5px; width:8px; height:8px; border-right:2px solid #fffc; border-bottom:2px solid #fffc; }
        .status { position:absolute; left:6px; right:6px; bottom:28px; padding:8px; border-radius:8px; background:#20202799; backdrop-filter:blur(12px); font-size:12px; pointer-events:none; }
        .status:empty { display:none; }
        @media (hover:none) { .controls,.resize { opacity:1; } }
        @media (prefers-reduced-motion:reduce) { .controls,.resize { transition:none; } }
      </style>
      <section role="region" aria-label="Floating image" tabindex="-1">
        <div class="stage"><img alt="Selected image" draggable="false"></div>
        <div class="controls"><button data-action="close" title="Close" aria-label="Close floating image">×</button></div>
        <span class="status" role="status">Loading…</span>
        <button class="resize" title="Drag to resize" aria-label="Resize image; use arrow keys"></button>
      </section>`;
    panel = root.querySelector("section");
    picture = root.querySelector("img");
    stage = root.querySelector(".stage");
    status = root.querySelector(".status");
    panel.style.left = `${Math.max(0, innerWidth - 360)}px`;
    panel.style.top = `${Math.min(80, Math.max(0, innerHeight - 410))}px`;
    root.addEventListener("click", event => {
      const action = event.target.closest("button")?.dataset.action;
      if (action === "close") close();
    });
    panel.addEventListener("pointerdown", event => {
      const resizing = event.target.closest(".resize");
      if (event.button !== 0 || (event.target.closest("button") && !resizing)) return;
      const rect = panel.getBoundingClientRect();
      drag = { x: event.clientX - rect.left, y: event.clientY - rect.top, startX:event.clientX, startY:event.clientY, width:rect.width, resizing:!!resizing };
      panel.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    panel.addEventListener("pointermove", event => {
      if (!drag) return;
      if (drag.resizing) {
        const dx = event.clientX - drag.startX;
        const dy = (event.clientY - drag.startY) * aspect;
        setSize(drag.width + (Math.abs(dx) >= Math.abs(dy) ? dx : dy));
        return;
      }
      panel.style.left = `${event.clientX - drag.x}px`;
      panel.style.top = `${event.clientY - drag.y}px`;
      clamp();
    });
    panel.addEventListener("lostpointercapture", () => { drag = null; });
    panel.addEventListener("pointerup", () => { drag = null; });
    root.querySelector(".resize").addEventListener("keydown", event => {
      if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        changeZoom(["ArrowRight", "ArrowDown"].includes(event.key) ? 1.05 : 1 / 1.05);
      }
    });
    root.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
    });
    const currentPicture = picture;
    picture.addEventListener("load", () => {
      if (picture !== currentPicture || !host?.isConnected) return;
      aspect = picture.naturalWidth / picture.naturalHeight || 1;
      fit();
      status.textContent = "";
    });
    picture.addEventListener("error", () => {
      if (picture !== currentPicture || !host?.isConnected) return;
      status.textContent = "Image host blocked loading or URL expired. Try the original image URL.";
    });
    document.documentElement.append(host);
    observer = new ResizeObserver(clamp);
    observer.observe(panel);
    window.addEventListener("resize", clamp);
  }
  function show(src) {
    const checked = safeSource(src);
    if (!checked) return;
    stopPicker();
    if (!host?.isConnected) { close(); create(); }
    selectedSource = checked;
    aspect = 1;
    fit();
    bringBack();
    status.textContent = "Loading…";
    picture.src = checked;
  }
  function sourceFrom(target) {
    const img = target.closest?.("img");
    if (img) return img.currentSrc || img.src;
    // Character portraits can be CSS backgrounds rather than <img> elements.
    for (let el = target; el && el !== document.body; el = el.parentElement) {
      const match = /^url\(["']?(.*?)["']?\)$/.exec(getComputedStyle(el).backgroundImage);
      if (match) return match[1];
    }
    return null;
  }
  async function pick(event) {
    if (event.composedPath().includes(host) || event.target === notice) return;
    const src = sourceFrom(event.target);
    if (!src || !safeSource(src)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isJanitor) {
      show(src);
    } else {
      stopPicker();
      try {
        const result = await browser.runtime.sendMessage({ type: "send-to-janitor", src });
        if (!result?.ok) window.alert(result?.error || "Could not send the image to JanitorAI.");
      } catch {
        window.alert("The extension was reloaded. Refresh this source page and try again.");
      }
    }
  }
  function escapePicker(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      stopPicker();
    }
  }
  function stopPicker() {
    picking = false;
    notice?.remove();
    notice = null;
    document.removeEventListener("click", pick, true);
    document.removeEventListener("keydown", escapePicker, true);
  }
  function startPicker() {
    if (picking) { stopPicker(); return; }
    picking = true;
    notice = document.createElement("button");
    notice.textContent = "Click an image to send to JanitorAI · Esc or click here to cancel";
    notice.style.cssText = "position:fixed!important;top:16px!important;left:50%!important;transform:translateX(-50%)!important;z-index:2147483647!important;background:#262230!important;color:#fff!important;border:1px solid #b6a0d0!important;border-radius:10px!important;padding:12px 18px!important;font:14px system-ui!important;cursor:pointer!important;";
    notice.addEventListener("click", stopPicker);
    document.documentElement.append(notice);
    document.addEventListener("click", pick, true);
    document.addEventListener("keydown", escapePicker, true);
  }
  browser.runtime.onMessage.addListener(message => {
    if (message.type === "float-image") show(message.src);
    if (message.type === "pick-image") startPicker();
  });
})();
