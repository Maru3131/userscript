// ==UserScript==
// @name         Transparent Header
// @namespace    local.janitor-transparent-header
// @version      2.13.0
// @description  Float and annotate multiple images, reveal the JanitorAI header background, style the textbox, open pasted/dropped images, and copy the open chat to the clipboard. Saved labels stay local.
// @homepageURL  https://github.com/Maru3131/userscript
// @updateURL    https://raw.githubusercontent.com/Maru3131/userscript/main/transparent-header.user.js
// @downloadURL  https://raw.githubusercontent.com/Maru3131/userscript/main/transparent-header.user.js
// @match        https://*/*
// @match        http://*/*
// @noframes
// @run-at       document-idle
// @inject-into  content
// @grant        GM_info
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// ==/UserScript==

(() => {
  "use strict";
  if (window.__janitorImageFloatUserscriptLoaded) return;
  window.__janitorImageFloatUserscriptLoaded = true;
  const isJanitor = /(^|\.)janitorai\.com$/i.test(location.hostname) && location.protocol === "https:";
  const safeSource = value => {
    try {
      const url = new URL(value, location.href);
      return ["https:", "http:", "blob:"].includes(url.protocol) || /^data:image\//i.test(value) ? url.href : null;
    } catch { return null; }
  };
  // Script-manager storage is local. Separate regular/private mailboxes.
  const prefix = GM_info.isIncognito ? "jif-private-" : "jif-regular-";
  const targetKey = prefix + "target";
  const inboxKey = prefix + "inbox";
  const tabId = crypto.randomUUID();
  const receivedMessages = new Set();
  function toast(text) {
    const box = document.createElement("div");
    box.textContent = text;
    box.style.cssText = "position:fixed!important;bottom:24px!important;left:24px!important;z-index:2147483647!important;background:#262230!important;color:white!important;border:1px solid #b6a0d0!important;border-radius:10px!important;padding:14px!important;font:14px system-ui!important;max-width:420px!important;";
    document.documentElement.append(box);
    setTimeout(() => box.remove(), 5000);
  }
  function claimTarget() {
    if (isJanitor && document.visibilityState === "visible") {
      GM_setValue(targetKey, { id: tabId, time: Date.now() });
    }
  }
  async function blobToDataURL(src) {
    try {
      const getter = typeof content !== "undefined" && content?.fetch ? content.fetch.bind(content) : fetch;
      const response = await getter(src);
      const blob = await response.blob();
      if (!/^image\//i.test(blob.type) || blob.size > 12 * 1024 * 1024) return null;
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return /^data:image\//i.test(url) ? url : null;
    } catch { return null; }
  }
  async function sendImage(src) {
    if (isJanitor) { show(src); return; }
    const target = GM_getValue(targetKey, null);
    if (!target || Date.now() - target.time > 120000) {
      toast("Visit your JanitorAI tab once, then select this image again.");
      return;
    }
    if (src.startsWith("blob:")) {
      // Temporary page-only address (ChatGPT images, previews). Send the image
      // itself instead; the same image then always gets the same saved labels.
      src = await blobToDataURL(src);
      if (!src) {
        toast("This image has a temporary address. Copy it and paste it into JanitorAI (Ctrl+V).");
        return;
      }
    }
    const message = { id: crypto.randomUUID(), target: target.id, src, time: Date.now() };
    GM_setValue(inboxKey, message);
    toast("Image sent. Switch to your JanitorAI tab to see it.");
    setTimeout(() => {
      if (GM_getValue(inboxKey, null)?.id === message.id) GM_deleteValue(inboxKey);
    }, 60000);
  }
  function receive(_name, _oldValue, incoming) {
    if (!isJanitor) return;
    const message = incoming || GM_getValue(inboxKey, null);
    if (!message) return;
    if (Date.now() - message.time > 60000) {
      if (GM_getValue(inboxKey, null)?.id === message.id) GM_deleteValue(inboxKey);
      return;
    }
    if (message.target !== tabId || receivedMessages.has(message.id)) return;
    receivedMessages.add(message.id);
    if (receivedMessages.size > 200) receivedMessages.delete(receivedMessages.values().next().value);
    if (GM_getValue(inboxKey, null)?.id === message.id) GM_deleteValue(inboxKey);
    if (typeof message.src === "string") show(message.src);
  }
  function initializeUserscript() {
    GM_registerMenuCommand("Choose image for JanitorAI (Alt+Shift+J)", startPicker);
    if (isJanitor) GM_registerMenuCommand("Add character name to floating image", () => {
      const annotationUI = activeImageViewer?.annotations;
      if (annotationUI) annotationUI.add();
      else toast("Alt-click an image first to open it in the floating viewer.");
    });
    if (isJanitor) {
      GM_registerMenuCommand("Crop floating image (optional)", () => {
        const annotationUI = activeImageViewer?.annotations;
        if (annotationUI) annotationUI.startCrop();
        else toast("Open an image in the floating viewer first.");
      });
      GM_registerMenuCommand("Show whole image / remove crop", () => activeImageViewer?.annotations?.resetCrop());
      GM_registerMenuCommand("Bring floating image back on screen", bringBack);
      GM_registerMenuCommand("Recover floating image (keep labels)", recoverViewer);
      GM_registerMenuCommand("Bring all images back on screen", bringAllBack);
      GM_registerMenuCommand("Close all floating images", closeAllViewers);
    }
    GM_registerMenuCommand("Clear pending image", () => {
      GM_deleteValue(inboxKey);
      close();
      toast("Pending image cleared.");
    });
    document.addEventListener("keydown", event => {
      if (event.altKey && event.shiftKey && event.code === "KeyJ" && !event.repeat) {
        event.preventDefault();
        startPicker();
      }
    }, true);
    document.addEventListener("click", event => {
      if (event.altKey && !picking && sourceFrom(event.target)) void pick(event);
    }, true);
    if (isJanitor) {
      GM_addValueChangeListener(inboxKey, receive);
      window.addEventListener("focus", () => { claimTarget(); receive(); });
      document.addEventListener("visibilitychange", () => { claimTarget(); receive(); });
      claimTarget();
      receive();
      setInterval(() => {
        if (GM_getValue(targetKey, null)?.id === tabId) {
          GM_setValue(targetKey, { id: tabId, time: Date.now() });
        }
        receive();
      }, 20000);
    } else {
      const pending = GM_getValue(inboxKey, null);
      if (pending && Date.now() - pending.time > 60000) GM_deleteValue(inboxKey);
    }
  }

  function setupAnnotations(shadow, viewer, image, { setAspect, fit, setSize, bringBack }) {
    let entries = [];
    let storageKey = null;
    let epoch = 0;
    let editor = null;
    let labelDrag = null;
    let crop = null;
    let cropMode = false;
    let selection = null;
    const fullArea = { x:0, y:0, w:1, h:1 };
    const area = () => crop || fullArea;
    const cropBox = document.createElement("div");
    cropBox.className = "crop-selection";
    cropBox.hidden = true;
    viewer.append(cropBox);
    const layer = document.createElement("div");
    layer.className = "annotations";
    layer.setAttribute("aria-label", "Character name labels");
    viewer.append(layer);
    const sheet = document.createElement("style");
    sheet.textContent = `
      .stage { position:relative; overflow:hidden; }
      .stage img { position:absolute; }
      .annotations { position:absolute; inset:0; pointer-events:none; overflow:hidden; }
      .crop-selection { position:absolute; pointer-events:none; border:2px solid #ffd3a1; background:#ffa56622; z-index:4; box-shadow:0 0 0 9999px #0006; }
      .crop-selection[hidden] { display:none; }
      section.cropping .stage { cursor:crosshair; }
      section.cropping { overflow:hidden; }
      section.cropping .annotations { visibility:hidden; }
      .character-label { position:absolute; transform:translate(-50%,-50%); pointer-events:auto; width:auto; height:auto; max-width:100%; padding:5px 9px; border:1px solid #e3bea644; border-radius:8px; background:#241c17c9; backdrop-filter:blur(10px); color:#fff1df; font:600 13px/1.3 system-ui,sans-serif; text-shadow:0 1px 3px #000; overflow-wrap:anywhere; white-space:normal; cursor:grab; touch-action:none; }
      .character-label:active { cursor:grabbing; }
      .character-label:hover { background:#392a20e0; }
      .label-editor { position:fixed; width:min(320px,calc(100vw - 32px)); padding:16px; border:1px solid #d3987b66; border-radius:14px; background:#281f1bf5; backdrop-filter:blur(18px); box-shadow:0 10px 35px #0008; color:#fff1df; font:13px/1.4 system-ui; z-index:10; user-select:text; touch-action:auto; max-height:calc(100vh - 32px); overflow:auto; }
      .label-editor h3 { margin:0 0 12px; font:600 15px/1.4 system-ui; }
      .label-editor label { display:block; margin:10px 0; }
      .label-editor input,.label-editor textarea { display:block; width:100%; margin-top:5px; padding:8px; border:1px solid #b8a18b66; border-radius:7px; background:#fff3; color:#fff1df; font:14px/1.4 system-ui; user-select:text; }
      .label-editor textarea { resize:vertical; min-height:70px; }
      .label-editor input:focus,.label-editor textarea:focus { outline:2px solid #d3987b; outline-offset:1px; }
      .label-editor .buttons { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
      .label-editor button { width:auto; height:auto; min-height:32px; padding:7px 11px; border-radius:8px; font:13px/1.2 system-ui; background:#fff2; }
      .label-editor button[type=submit] { background:#bd805f; color:#211811; text-shadow:none; }
      .label-editor .remove { margin-left:auto; color:#ffb9a5; }
      .label-help { margin:10px 0 0; color:#c7b5a5; font:11px/1.4 system-ui; }
    `;
    shadow.append(sheet);
    image.title = "Double-click to add a name. Shift-double-click restores the whole image. Drag names to move; double-click to edit.";

    function usableCrop(c) {
      // Repeated crops multiply fractions of the ORIGINAL image. Bound them
      // before they produce enormous CSS dimensions or an invisible viewer.
      if (!c || ![c.x,c.y,c.w,c.h].every(Number.isFinite) || c.x<0 || c.y<0 || c.w<0.02 || c.h<0.02 || c.x+c.w>1.000001 || c.y+c.h>1.000001) return false;
      if (image.complete && image.naturalWidth && image.naturalHeight) {
        const ratio = image.naturalWidth / image.naturalHeight * c.w / c.h;
        if (ratio < 1/12 || ratio > 12) return false;
      }
      return true;
    }
    function applyGeometry(resetSize = false) {
      if (crop && !usableCrop(crop)) {
        crop = null; persist(); resetSize = true;
        toast("An unsafe crop was removed. Full image restored; labels kept.");
      }
      const a = area();
      image.style.width = `${100 / a.w}%`;
      image.style.height = `${100 / a.h}%`;
      image.style.left = `${-100 * a.x / a.w}%`;
      image.style.top = `${-100 * a.y / a.h}%`;
      if (image.naturalWidth && image.naturalHeight) {
        setAspect(image.naturalWidth / image.naturalHeight * a.w / a.h);
        if (resetSize) fit();
        else setSize(viewer.getBoundingClientRect().width);
      }
      render();
    }
    function stopCrop() {
      cropMode = false;
      selection = null;
      cropBox.hidden = true;
      viewer.classList.remove("cropping");
    }
    const pointInViewer = event => {
      const r = viewer.getBoundingClientRect();
      return { x:Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)), y:Math.max(0,Math.min(1,(event.clientY-r.top)/r.height)) };
    };
    const cropDown = event => {
      if (event.button !== 0 || !cropMode || event.target.closest("button,[data-annotation-ui]")) return;
      if (!storageKey) { toast("Wait for the image to finish loading."); return; }
      event.preventDefault(); event.stopImmediatePropagation();
      dismiss();
      viewer.focus({ preventScroll:true });
      const start = pointInViewer(event);
      selection = { start, end:start, source:{ ...area() }, pointer:event.pointerId };
      viewer.classList.add("cropping");
      cropBox.hidden = false;
      cropBox.style.cssText = `left:${start.x*100}%;top:${start.y*100}%;width:0;height:0;`;
      viewer.setPointerCapture(event.pointerId);
    };
    const cropMove = event => {
      if (!selection || event.pointerId !== selection.pointer) return;
      event.preventDefault(); event.stopImmediatePropagation();
      selection.end = pointInViewer(event);
      const {start,end} = selection;
      cropBox.style.cssText = `left:${Math.min(start.x,end.x)*100}%;top:${Math.min(start.y,end.y)*100}%;width:${Math.abs(end.x-start.x)*100}%;height:${Math.abs(end.y-start.y)*100}%;`;
    };
    const cropUp = event => {
      if (!selection || event.pointerId !== selection.pointer) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const {start,source,pointer} = selection;
      const end = pointInViewer(event);
      const rect = viewer.getBoundingClientRect();
      const w = Math.abs(end.x-start.x), h = Math.abs(end.y-start.y);
      stopCrop();
      if (viewer.hasPointerCapture(pointer)) viewer.releasePointerCapture(pointer);
      if (w*rect.width >= 8 && h*rect.height >= 8) {
        const next = { x:source.x + Math.min(start.x,end.x)*source.w, y:source.y + Math.min(start.y,end.y)*source.h, w:w*source.w, h:h*source.h };
        if (!usableCrop(next)) {
          toast("That crop is too small or narrow. Shift-double-click restores the full image.");
          return;
        }
        crop = next;
        persist(); applyGeometry();
      }
    };
    const cancelCrop = event => {
      if (event.key === "Escape" && (selection || cropMode)) {
        event.preventDefault(); event.stopImmediatePropagation();
        const pointer = selection?.pointer;
        stopCrop();
        if (pointer !== undefined && viewer.hasPointerCapture(pointer)) viewer.releasePointerCapture(pointer);
      }
    };
    const lostCrop = () => { if (selection) stopCrop(); };
    viewer.addEventListener("pointerdown", cropDown, true);
    viewer.addEventListener("pointermove", cropMove, true);
    viewer.addEventListener("pointerup", cropUp, true);
    viewer.addEventListener("pointercancel", lostCrop);
    viewer.addEventListener("lostpointercapture", lostCrop);
    shadow.addEventListener("keydown", cancelCrop, true);

    function persist() {
      if (!storageKey) return;
      try {
        if (entries.length || crop) GM_setValue(storageKey, { version:2, labels:entries, crop });
        else GM_deleteValue(storageKey);
      } catch { toast("Could not save the labels locally. They remain visible until this image closes."); }
    }
    function resetCrop() {
      stopCrop(); crop = null; persist(); applyGeometry(true); bringBack();
      toast("Full image restored. Your character labels are kept.");
    }
    function bounded(entry, node) {
      const rect = viewer.getBoundingClientRect();
      const a = area();
      const x = (entry.x-a.x)/a.w, y = (entry.y-a.y)/a.h;
      node.hidden = x < 0 || x > 1 || y < 0 || y > 1;
      if (node.hidden) { node.style.display = "none"; return; }
      node.style.display = "";
      const halfX = Math.min(0.5, node.offsetWidth / Math.max(1, rect.width) / 2);
      const halfY = Math.min(0.5, node.offsetHeight / Math.max(1, rect.height) / 2);
      node.style.left = `${Math.max(halfX, Math.min(1 - halfX, x)) * 100}%`;
      node.style.top = `${Math.max(halfY, Math.min(1 - halfY, y)) * 100}%`;
    }
    function render() {
      layer.replaceChildren();
      for (const entry of entries) {
        const label = document.createElement("button");
        label.type = "button";
        label.className = "character-label";
        label.dataset.labelId = entry.id;
        label.dataset.annotationUi = "";
        label.textContent = entry.name;
        label.title = `${entry.name}${entry.note ? "\n" + entry.note : ""}\nDouble-click or Enter to edit. Drag to move.`;
        label.setAttribute("aria-label", `${entry.name}${entry.note ? ": " + entry.note : ""}. Edit name label`);
        layer.append(label);
        bounded(entry, label);
        label.addEventListener("pointerdown", event => {
          if (event.button !== 0) return;
          event.stopPropagation();
          event.preventDefault();
          label.focus({ preventScroll:true });
          label.setPointerCapture(event.pointerId);
          labelDrag = { id:entry.id, startX:event.clientX, startY:event.clientY, x:entry.x, y:entry.y };
        });
        label.addEventListener("pointermove", event => {
          if (labelDrag?.id !== entry.id) return;
          const rect = viewer.getBoundingClientRect();
          const a = area();
          entry.x = Math.max(a.x, Math.min(a.x+a.w, labelDrag.x + (event.clientX - labelDrag.startX) / rect.width * a.w));
          entry.y = Math.max(a.y, Math.min(a.y+a.h, labelDrag.y + (event.clientY - labelDrag.startY) / rect.height * a.h));
          bounded(entry, label);
        });
        const finish = () => { if (labelDrag?.id === entry.id) { labelDrag = null; persist(); } };
        label.addEventListener("pointerup", finish);
        label.addEventListener("lostpointercapture", finish);
        label.addEventListener("dblclick", event => { event.stopPropagation(); edit(entry); });
        label.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault(); event.stopPropagation(); edit(entry);
          } else if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) {
            event.preventDefault(); event.stopPropagation();
            const step = event.shiftKey ? 0.05 : 0.01, a = area();
            entry.x = Math.max(a.x, Math.min(a.x+a.w, entry.x + (event.key === "ArrowLeft" ? -step*a.w : event.key === "ArrowRight" ? step*a.w : 0)));
            entry.y = Math.max(a.y, Math.min(a.y+a.h, entry.y + (event.key === "ArrowUp" ? -step*a.h : event.key === "ArrowDown" ? step*a.h : 0)));
            bounded(entry, label); persist();
          }
        });
      }
    }
    function dismiss() {
      editor?.remove(); editor = null;
    }
    function edit(existing, point = { x:area().x+area().w/2, y:area().y+area().h/2 }) {
      if (!storageKey) { toast("Wait for the image labels to finish loading, then try again."); return; }
      dismiss();
      const keyAtOpen = storageKey;
      const form = document.createElement("form");
      editor = form;
      form.className = "label-editor";
      form.dataset.annotationUi = "";
      form.setAttribute("role", "dialog");
      form.setAttribute("aria-label", existing ? "Edit character label" : "Add character label");
      form.innerHTML = `<h3>Character label</h3><label>Name<input name="characterName" required maxlength="100" autocomplete="off"></label><label>Note (optional)<textarea name="characterNote" maxlength="500" rows="3" placeholder="White hair · healer"></textarea></label><div class="buttons"><button type="submit">Save</button><button type="button" class="cancel">Cancel</button><button type="button" class="remove">Delete</button></div><p class="label-help">Saved locally for this image and chat. Hover a label to read its note.</p>`;
      const name = form.elements.characterName;
      const note = form.elements.characterNote;
      name.value = existing?.name || "";
      note.value = existing?.note || "";
      form.querySelector(".remove").hidden = !existing;
      form.querySelector(".cancel").addEventListener("click", dismiss);
      form.querySelector(".remove").addEventListener("click", () => {
        entries = entries.filter(item => item.id !== existing.id);
        persist(); dismiss(); render();
      });
      form.addEventListener("submit", event => {
        event.preventDefault(); event.stopPropagation();
        if (storageKey !== keyAtOpen) { dismiss(); return; }
        const value = name.value.trim();
        if (!value) { name.setCustomValidity("Enter a character name."); name.reportValidity(); return; }
        const entry = existing || { id:crypto.randomUUID(), x:point.x, y:point.y };
        entry.name = value; entry.note = note.value.trim();
        if (!existing) entries.push(entry);
        persist(); dismiss(); render();
      });
      name.addEventListener("input", () => name.setCustomValidity(""));
      form.addEventListener("pointerdown", event => event.stopPropagation());
      form.addEventListener("click", event => event.stopPropagation());
      form.addEventListener("dblclick", event => event.stopPropagation());
      form.addEventListener("keydown", event => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); dismiss(); }
      });
      shadow.append(form);
      const rect = viewer.getBoundingClientRect();
      form.style.left = `${Math.max(16, Math.min(rect.left, innerWidth - form.offsetWidth - 16))}px`;
      form.style.top = `${Math.max(16, Math.min(rect.top, innerHeight - form.offsetHeight - 16))}px`;
      name.focus();
    }
    const addAtPoint = event => {
      // The viewer captures drag pointers, so a stationary double-click can
      // be retargeted to the viewer rather than the image.
      if (event.target !== image && event.target !== viewer && !event.target.classList.contains("stage")) return;
      event.preventDefault(); event.stopPropagation();
      if (event.shiftKey) { resetCrop(); return; }
      const rect = image.getBoundingClientRect();
      edit(null, { x:Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y:Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) });
    };
    viewer.addEventListener("dblclick", addAtPoint);
    const watch = new ResizeObserver(() => {
      for (const entry of entries) {
        const node = Array.from(layer.children).find(item => item.dataset.labelId === entry.id);
        if (node) bounded(entry, node);
      }
    });
    watch.observe(viewer);
    return {
      async load(src) {
        const token = ++epoch;
        dismiss(); stopCrop(); entries = []; crop = null; storageKey = null; applyGeometry();
        const chat = new URL(location.href);
        const identity = `${chat.origin}${chat.pathname}\n${src}`;
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
        if (token !== epoch) return;
        storageKey = prefix + "labels-" + Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,"0")).join("");
        const saved = GM_getValue(storageKey, []);
        const savedLabels = Array.isArray(saved) ? saved : saved?.labels;
        entries = Array.isArray(savedLabels) ? savedLabels.filter(item => item && typeof item.id === "string" && typeof item.name === "string" && Number.isFinite(item.x) && Number.isFinite(item.y)).map(item => ({ id:item.id, name:item.name.slice(0,100), note:typeof item.note === "string" ? item.note.slice(0,500) : "", x:Math.max(0,Math.min(1,item.x)), y:Math.max(0,Math.min(1,item.y)) })) : [];
        const c = saved?.crop;
        if (c) {
          if (usableCrop(c)) crop = c;
          else {
            persist();
            toast("An unsafe saved crop was removed. Your character labels are kept.");
          }
        }
        applyGeometry(true);
      },
      add() { edit(null); },
      applyGeometry,
      startCrop() { if (!storageKey) return; dismiss(); cropMode = true; viewer.classList.add("cropping"); viewer.focus(); toast("Drag a rectangle around the part to keep. Escape cancels."); },
      resetCrop,
      destroy() {
        ++epoch; dismiss(); watch.disconnect(); viewer.removeEventListener("dblclick", addAtPoint);
        viewer.removeEventListener("pointerdown", cropDown, true); viewer.removeEventListener("pointermove", cropMove, true);
        viewer.removeEventListener("pointerup", cropUp, true); viewer.removeEventListener("pointercancel", lostCrop);
        viewer.removeEventListener("lostpointercapture", lostCrop); shadow.removeEventListener("keydown", cancelCrop, true);
        sheet.remove(); layer.remove(); cropBox.remove();
      }
    };
  }

  const imageViewers = new Set();
  let activeImageViewer = null;
  let lastImageSource = null;
  function activateViewer(viewer) {
    if (!imageViewers.has(viewer)) return;
    activeImageViewer = viewer;
    imageViewers.delete(viewer);
    imageViewers.add(viewer);
    // Reserve the highest layer for the picker and notices.
    let layer = 2147483646 - imageViewers.size;
    for (const item of imageViewers) item.setLayer(++layer);
  }
  function removeViewer(viewer) {
    imageViewers.delete(viewer);
    if (activeImageViewer === viewer) activeImageViewer = Array.from(imageViewers).at(-1) || null;
  }
  function show(src) {
    const checked = safeSource(src);
    if (!checked) return;
    stopPicker();
    lastImageSource = checked;
    // Selecting an already-open image raises it without discarding its crop,
    // labels or size, and avoids two editors writing to the same saved record.
    for (const viewer of imageViewers) {
      if (viewer.source === checked && viewer.connected) {
        activateViewer(viewer); viewer.bringBack();
        return viewer.ready;
      }
    }
    const viewer = createImageViewer(imageViewers.size);
    imageViewers.add(viewer);
    viewer.ready = viewer.open(checked);
    activateViewer(viewer);
    return viewer.ready;
  }
  function close() { activeImageViewer?.close(); }
  function closeAllViewers() {
    for (const viewer of Array.from(imageViewers)) viewer.close();
  }
  function bringBack() { activeImageViewer?.bringBack(); }
  function bringAllBack() {
    for (const viewer of imageViewers) viewer.bringBack();
  }
  async function recoverViewer() {
    const viewer = activeImageViewer;
    if (!viewer) {
      if (!lastImageSource) { toast("Open an image first, then use recovery if needed."); return; }
      const loading = show(lastImageSource);
      const reopened = activeImageViewer;
      await loading;
      if (reopened?.connected) reopened.annotations.resetCrop();
      return;
    }
    await viewer.ready;
    if (!viewer.connected) return;
    viewer.annotations.resetCrop();
    viewer.fit(); viewer.bringBack();
  }

  function createImageViewer(slot) {
    let annotationUI = null;
    const api = {
      open, close, fit, bringBack,
      get source() { return selectedSource; },
      get connected() { return !!host?.isConnected; },
      get annotations() { return annotationUI; },
      setLayer(value) { host?.style.setProperty("z-index", String(value), "important"); }
    };
  let host, root, panel, picture, status, stage;
  let aspect = 1;
  let viewerWidth = 340;
  let selectedSource = null;
  let drag = null;
  let observer;
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
    annotationUI?.destroy();
    annotationUI = null;
    removeViewer(api);
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
    annotationUI = setupAnnotations(root, panel, picture, {
      setAspect(value) { aspect = value; }, fit, setSize, bringBack
    });
    root.addEventListener("pointerdown", () => activateViewer(api), true);
    root.addEventListener("focusin", () => activateViewer(api), true);
    const columns = Math.max(1, Math.floor((innerWidth - 20) / 360));
    panel.style.left = `${Math.max(0, innerWidth - 360 - (slot % columns)*360)}px`;
    panel.style.top = `${Math.min(80 + Math.floor(slot/columns)*42, Math.max(0, innerHeight - 100))}px`;
    root.addEventListener("click", event => {
      const action = event.target.closest("button")?.dataset.action;
      if (action === "close") close();
    });
    panel.addEventListener("pointerdown", event => {
      if (event.target.closest("[data-annotation-ui]")) return;
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
      annotationUI.applyGeometry(true);
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
  function open(src) {
    const checked = safeSource(src);
    if (!checked) return;
    stopPicker();
    if (!host?.isConnected) create();
    selectedSource = checked;
    aspect = 1;
    fit();
    bringBack();
    status.textContent = "Loading…";
    picture.src = checked;
    return annotationUI.load(checked).catch(() => toast("Could not load saved labels. Try reopening the image."));
  }
    return api;
  }

  let picking = false;
  let notice;
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
    if (event.composedPath().some(node => node.matches?.("[data-janitor-image-float]")) || event.target === notice) return;
    const src = sourceFrom(event.target);
    if (!src || !safeSource(src)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stopPicker();
    await sendImage(src);
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
  if (isJanitor) {
(() => {
  "use strict";
  const id = "local-janitor-transparent-header";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  // Match the supplied CSS-module class names without depending on build hashes.
  // Require the known character-name control to avoid unrelated site headers.
  const header = ':is([class^="_headerContainer_"], [class*=" _headerContainer_"]):has(#character-name-button)';
  const grid = ':is([class^="_headerGrid_"], [class*=" _headerGrid_"])';
  const divider = ':is([class^="_customDivider_"], [class*=" _customDivider_"])';
  const text = ':is([class^="_customDividerText_"], [class*=" _customDividerText_"])';
  const surfaces = [header, `${header} > ${grid}`, `${header} > ${divider}`, `${header} > ${divider} > ${text}`];
  const selectors = surfaces.flatMap(selector => [selector, `${selector}::before`, `${selector}::after`]);
  style.textContent = `${selectors.join(",\n")} {
    background: transparent !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }`;
  const cls = name => `:is([class^="_${name}_"],[class*=" _${name}_"])`;
  style.textContent += `
    @media (min-width: 0px) {
      ${header} {
        position: fixed !important;
        inset: 16px auto auto 16px !important;
        transform: none !important;
        width: clamp(160px, calc((100vw - 1060px) / 2 - 32px), 260px) !important;
        min-width: 0 !important;
        max-width: none !important;
        height: auto !important;
        margin: 0 !important;
        padding: 12px !important;
        box-sizing: border-box !important;
        border: 1px solid rgba(211,152,123,.18) !important;
        border-radius: 16px !important;
        background: rgba(43,36,31,.25) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
        z-index: 100 !important;
        overflow: visible !important;
      }
      ${header} > ${grid} {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 12px !important;
        width: 100% !important;
        min-width: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      ${header} ${cls("menuWrapper")} {
        display: flex !important;
        justify-content: space-between !important;
        flex-wrap: wrap !important;
        gap: 6px !important;
      }
      ${header} > ${divider} {
        display: block !important;
        padding: 12px 0 0 !important;
        margin: 0 !important;
        text-align: left !important;
      }
      ${header} > ${divider} > ${cls("customDividerLine")} { display: none !important; }
      ${header} > ${divider} > ${text} {
        position: static !important;
        transform: none !important;
        display: block !important;
        padding: 0 !important;
        font-size: 13px !important;
        line-height: 1.5 !important;
        color: #c6b6a6 !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
      }
      ${header} #character-name-button { text-align: left !important; }
      ${header} ${cls("accordionContainer")} {
        position: absolute !important;
        top: calc(100% + 8px) !important;
        left: 0 !important;
        width: min(480px, calc(100vw - 32px)) !important;
        max-height: calc(100vh - 220px) !important;
        overflow-y: auto !important;
        border-radius: 14px !important;
        background: rgba(36,30,26,.94) !important;
      }
      ${header}:not(:has(#character-name-button[aria-expanded="true"])) ${cls("accordionContainer")} {
        display: none !important;
      }
      ${header}:has(#character-name-button[aria-expanded="true"]) ${cls("accordionContainer")} {
        display: block !important;
        height: auto !important;
        grid-template-rows: none !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
        transform: none !important;
      }
      ${header}:has(#character-name-button[aria-expanded="true"]) #bio-accordion-panel {
        position: static !important;
        display: block !important;
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow: visible !important;
        opacity: 1 !important;
        visibility: visible !important;
        transform: none !important;
      }
    }
    @media (max-width: 1399px) {
      ${header} { width: 180px !important; max-width: calc(100vw - 32px) !important; padding: 8px 10px !important; }
      ${header} > ${grid} { display: none !important; }
      ${header}:hover > ${grid}, ${header}:focus-within > ${grid}, ${header}:has(#character-name-button[aria-expanded="true"]) > ${grid} { display: flex !important; }
      ${header} > ${divider} { padding-top: 0 !important; }
      ${header}:hover > ${divider}, ${header}:focus-within > ${divider}, ${header}:has(#character-name-button[aria-expanded="true"]) > ${divider} { padding-top: 10px !important; }
    }
  `;
  // Keep the real proxy button and its site handler. Blur on the header itself
  // would make a fixed descendant position relative to the left-hand card.
  style.textContent += `
    ${header} {
      background: transparent !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      isolation: isolate;
    }
    ${header}::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: rgba(43,36,31,.25) !important;
      backdrop-filter: blur(16px) !important;
      -webkit-backdrop-filter: blur(16px) !important;
      pointer-events: none;
      z-index: -1;
    }
    ${header} > ${grid}, ${header} ${cls("menuWrapper")} {
      transform: none !important;
      filter: none !important;
      backdrop-filter: none !important;
      contain: none !important;
      will-change: auto !important;
    }
    ${header} ${cls("apiTag")} {
      position: fixed !important;
      inset: 16px 16px auto auto !important;
      transform: none !important;
      margin: 0 !important;
      width: auto !important;
      max-width: calc(100vw - 32px) !important;
      padding: 10px 14px !important;
      border-radius: 14px !important;
      border: 1px solid rgba(230,147,87,.45) !important;
      background: rgba(194,105,57,.24) !important;
      backdrop-filter: blur(16px) !important;
      color: #ffe0c4 !important;
      visibility: visible !important;
      pointer-events: auto !important;
      z-index: 2 !important;
    }
    ${header} ${cls("apiTag")}:hover { background: rgba(194,105,57,.4) !important; }
    ${header} ${cls("apiTag")}:focus-visible {
      outline: 2px solid #d3987b !important;
      outline-offset: 3px !important;
    }
    @media (max-width: 1399px) {
      ${header} > ${grid} {
        display: flex !important;
        height: 0 !important;
        overflow: visible !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      ${header}:hover > ${grid}, ${header}:focus-within > ${grid},
      ${header}:has(#character-name-button[aria-expanded="true"]) > ${grid} {
        height: auto !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }
    }
    @media (max-width: 420px) {
      ${header} ${cls("apiTag")} { top: 76px !important; }
    }
  `;
  (document.head || document.documentElement).append(style);
})();

(() => {
  "use strict";
  const id = "local-janitor-warm-composer";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  const cls = name => `:is([class^="_${name}_"],[class*=" _${name}_"])`;
  const container = `${cls("chatInputContainer")}:has(textarea)`;
  const wrapper = `${container} > ${cls("chatInputWrapper")}`;
  const inner = `${wrapper} > ${cls("chatInputInner")}`;
  const textarea = `${inner} ${cls("chatTextarea")}`;
  const send = `${inner} ${cls("sendButton")}`;
  const switcher = `${inner} ${cls("switcher")}`;
  const sparkle = `${inner} ${cls("sparkleButton")}`;
  style.textContent = `
    ${container} {
      --jif-cream: #eee6da;
      --jif-muted: #b8ab9d;
      --jif-clay: #d3987b;
      --jif-line: rgba(211,152,123,.3);
    }
    ${wrapper} {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    ${inner} {
      background: linear-gradient(135deg, rgba(255,239,216,.065), rgba(255,239,216,.015)), rgba(43,36,31,.32) !important;
      border: 1px solid var(--jif-line) !important;
      border-radius: 18px !important;
      box-shadow: inset 0 1px 0 rgba(255,245,229,.1), 0 8px 28px rgba(0,0,0,.12) !important;
      backdrop-filter: blur(18px) saturate(115%) !important;
      -webkit-backdrop-filter: blur(18px) saturate(115%) !important;
      transition: border-color .18s, box-shadow .18s;
    }
    ${inner}:focus-within {
      border-color: rgba(211,152,123,.72) !important;
      box-shadow: 0 0 0 2px rgba(211,152,123,.1), 0 8px 28px rgba(0,0,0,.16) !important;
    }
    ${inner} > ${cls("controlsRow")} {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
    }
    ${textarea} {
      background: transparent !important;
      color: var(--jif-cream) !important;
      caret-color: var(--jif-clay) !important;
      border: none !important;
      box-shadow: none !important;
      outline: none !important;
    }
    ${textarea}::placeholder { color: var(--jif-muted) !important; opacity: 1 !important; }
    ${textarea}::selection { background: #795441; color: #fff8f0; }
    ${switcher} {
      background: rgba(238,230,218,.06) !important;
      color: var(--jif-cream) !important;
      border: 1px solid rgba(238,230,218,.14) !important;
      box-shadow: none !important;
      border-radius: 12px !important;
    }
    ${switcher}:hover { background: rgba(211,152,123,.14) !important; }
    ${sparkle} { color: var(--jif-clay) !important; background: transparent !important; }
    ${sparkle} svg path { fill: currentColor !important; }
    ${send} {
      background: #c78668 !important;
      color: #241a15 !important;
      border: 1px solid transparent !important;
      border-radius: 12px !important;
      box-shadow: none !important;
      opacity: 1 !important;
    }
    ${send}:hover:not(:disabled):not([aria-disabled="true"]) { background: #dea183 !important; }
    ${send}:disabled, ${send}[aria-disabled="true"] {
      background: rgba(238,230,218,.05) !important;
      color: #8a7c70 !important;
      border-color: rgba(238,230,218,.09) !important;
      cursor: default !important;
    }
    ${container} ${cls("scrollToBottomButton")} {
      background: rgba(43,36,31,.45) !important;
      backdrop-filter: blur(12px) !important;
      color: var(--jif-cream) !important;
      border: 1px solid var(--jif-line) !important;
    }
    ${inner} button:focus-visible, ${container} ${cls("scrollToBottomButton")}:focus-visible {
      outline: 2px solid var(--jif-clay) !important;
      outline-offset: 3px !important;
    }
    @media (prefers-reduced-motion: reduce) { ${inner} { transition: none; } }
  `;
  (document.head || document.documentElement).append(style);
})();

(() => {
  "use strict";
  // Chat export (formerly the separate "JanitorAI Copy Chat" script, v1.0.0).
  // Copies the open chat as plain text. Messages come from JanitorAI's API, not
  // the page, so long chats are complete and none of our own overlays (floating
  // images, labels, notes, notices, theme UI) can end up in the export.
  const buttonId = "jai-copy-chat-btn"; // same id as the old script: never two buttons
  if (document.getElementById(buttonId)) return;

  const chatIdFromUrl = () => (String(location.pathname || "").match(/\/chats\/(\d+)/) || [])[1];

  const cookie = (n) => {
    const m = document.cookie.match(
      new RegExp("(?:^|; )" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"),
    );
    return m ? decodeURIComponent(m[1]) : "";
  };

  // JanitorAI keeps the login in a (possibly chunked) supabase cookie.
  const getToken = () => {
    try {
      let raw = cookie("sb-auth-auth-token");
      if (!raw) {
        for (let i = 0, part; (part = cookie(`sb-auth-auth-token.${i}`)); i++) raw += part;
      }
      raw = raw.replace(/^base64-/, "").replace(/-/g, "+").replace(/_/g, "/");
      raw += "=".repeat((4 - (raw.length % 4)) % 4);
      return JSON.parse(atob(raw)).access_token || null;
    } catch {
      return null;
    }
  };

  // This script runs in Violentmonkey's content context. In Firefox a plain
  // fetch() there is made by the extension, not the page; content.fetch() makes
  // the same request as the page itself (as the old @grant none script did).
  // The body is read as text and parsed here so no page-side objects leak in.
  async function getJSON(path) {
    const token = getToken();
    if (!token) throw new Error("Not logged in");
    const url = new URL(path, location.origin || location.href).href;
    const init = {
      headers: { accept: "application/json", authorization: "Bearer " + token },
      credentials: "include",
    };
    let response;
    if (typeof content !== "undefined" && content?.fetch && typeof cloneInto === "function") {
      response = await content.fetch(url, cloneInto(init, content));
    } else {
      response = await fetch(url, init);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return JSON.parse(await response.text());
  }

  async function buildChatText() {
    const id = chatIdFromUrl();
    if (!id) throw new Error("Open a chat first");

    const data = await getJSON("/hampter/chats/" + id);

    let charName = data.character?.name || data.chat?.character?.name || "";
    if (!charName && data.chat?.character_id) {
      try {
        charName = (await getJSON("/hampter/characters/" + data.chat.character_id)).name || "";
      } catch {}
    }
    charName = charName || "Bot";
    const userName = data.personas?.[0]?.name || data.profile?.name || "User";

    const fill = (s) =>
      String(s ?? "")
        .replace(/\{\{char\}\}/gi, charName)
        .replace(/\{\{user\}\}/gi, userName)
        .trim();

    // is_main:false = a swipe you rejected; skip those
    const msgs = (data.chatMessages || [])
      .filter((m) => m.is_main !== false)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (msgs.length === 0) throw new Error("No messages found");

    const body = msgs
      .map((m) => `${m.is_bot ? charName : userName}:\n${fill(m.message)}`)
      .join("\n\n---\n\n");

    return { text: `# ${charName} (JanitorAI chat ${id})\n\n${body}\n`, count: msgs.length };
  }

  // GM_setClipboard works without a fresh click (needed in the content context
  // and from the script menu); the browser clipboard paths are fallbacks.
  async function copyText(text) {
    if (typeof GM_setClipboard === "function") {
      try {
        await GM_setClipboard(text, "text");
        return true;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    return ok;
  }

  // Last resort: show the text so it can be copied by hand
  function showManual(text) {
    const wrap = document.createElement("div");
    wrap.setAttribute("data-jai-copy-chat-ui", "");
    wrap.style.cssText =
      "position:fixed;inset:10%;z-index:2147483647;background:#241e1a;border:1px solid rgba(211,152,123,.45);" +
      "border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px;";
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "flex:1;background:#17130f;color:#eee6da;font:13px monospace;border:1px solid rgba(211,152,123,.3);border-radius:8px;";
    const close = document.createElement("button");
    close.textContent = "Close (press Ctrl+C first)";
    close.style.cssText = "background:#c78668;color:#241a15;border:0;border-radius:10px;padding:8px;font:600 13px system-ui,sans-serif;cursor:pointer;";
    close.onclick = () => wrap.remove();
    wrap.append(ta, close);
    document.body.appendChild(wrap);
    ta.focus();
    ta.select();
  }

  let busy = false;
  async function copyChat(report) {
    if (busy) return;
    busy = true;
    report("Copying...");
    try {
      const { text, count } = await buildChatText();
      if (await copyText(text)) report(`Copied ${count} messages`, true);
      else {
        showManual(text);
        report("Copy it manually", true);
      }
    } catch (e) {
      console.error("[Copy chat]", e);
      report(String(e?.message ?? e), true);
    } finally {
      busy = false;
    }
  }

  const mount = () => {
    if (document.getElementById(buttonId)) return;
    const btn = document.createElement("button");
    btn.id = buttonId;
    btn.type = "button";
    btn.setAttribute("data-jai-copy-chat-ui", "");
    btn.textContent = "Copy chat";
    // Warm glass to match the composer. Kept below the floating image layers.
    btn.style.cssText = [
      "position:fixed", "right:16px", "bottom:16px", "z-index:2147480000",
      "padding:8px 14px", "border-radius:12px", "border:1px solid rgba(230,147,87,.45)",
      "background:rgba(194,105,57,.24)", "backdrop-filter:blur(16px)", "-webkit-backdrop-filter:blur(16px)",
      "color:#ffe0c4", "font:600 13px system-ui,sans-serif",
      "cursor:pointer", "box-shadow:0 4px 14px rgba(0,0,0,.25)",
    ].join(";");

    const label = btn.textContent;
    let resetTimer;
    const report = (t, done) => {
      clearTimeout(resetTimer);
      btn.textContent = t.slice(0, 32);
      btn.disabled = !done;
      if (done) resetTimer = setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 3000);
    };
    btn.addEventListener("click", () => void copyChat(report));
    document.body.appendChild(btn);

    // JanitorAI is a single-page app: only show the button on chat pages
    setInterval(() => {
      btn.style.display = chatIdFromUrl() ? "" : "none";
    }, 500);
  };

  GM_registerMenuCommand("Copy chat to clipboard", () => {
    void copyChat((t, done) => { if (done) toast(t); });
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();

(() => {
  "use strict";
  // Open images that have no normal web address (ChatGPT images, files saved on
  // this PC, screenshots) in the floating viewer on JanitorAI:
  //   - paste an image (Ctrl+V) while not typing in a text field
  //   - drop an image file, or an image dragged from another tab
  //   - script menu "Open image from file..."
  // Files become data: URLs, so the same image always has the same address and
  // its saved labels/crop come back next time. Nothing leaves this browser.
  const marker = "__janitorLocalImagesLoaded";
  if (window[marker]) return;
  window[marker] = true;

  const MAX_BYTES = 25 * 1024 * 1024;

  const isTextField = el => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement || n.getRootNode?.().host) {
      if (n.isContentEditable) return true;
      const tag = n.tagName;
      if (tag === "TEXTAREA") return true;
      if (tag === "INPUT" && !/^(button|checkbox|radio|range|color|file|image|reset|submit)$/i.test(n.type)) return true;
    }
    return false;
  };
  const insideOurUI = event =>
    event.composedPath().some(n => n.matches?.("[data-janitor-image-float],[data-jai-local-image-ui]"));

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function openFile(file) {
    if (!file || !/^image\//i.test(file.type)) { toast("That isn't an image file."); return; }
    if (file.size > MAX_BYTES) { toast("That image is over 25 MB. Try a smaller copy."); return; }
    try {
      const url = await readAsDataURL(file);
      if (!/^data:image\//i.test(url)) throw new Error("not an image");
      await show(url);
    } catch (e) {
      console.error("[Local image]", e);
      toast("Could not open that image.");
    }
  }

  const imageFiles = list => Array.from(list || []).filter(f => /^image\//i.test(f.type));

  // ---- paste ----
  document.addEventListener("paste", event => {
    if (isTextField(event.target) || insideOurUI(event)) return;
    const files = imageFiles(event.clipboardData?.files);
    if (!files.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    files.slice(0, 8).forEach(f => void openFile(f));
  }, true);

  // ---- drag and drop ----
  const wantsDrop = dt => {
    const types = Array.from(dt?.types || []);
    return types.includes("Files") || types.includes("text/uri-list");
  };
  let dragFromThisPage = false;
  document.addEventListener("dragstart", () => { dragFromThisPage = true; }, true);
  document.addEventListener("dragend", () => { dragFromThisPage = false; }, true);
  document.addEventListener("dragover", event => {
    if (!wantsDrop(event.dataTransfer) || isTextField(event.target)) return;
    // Let our own label drags, and drags that start inside this page, behave normally.
    if (event.dataTransfer.types.includes("text/uri-list") && !event.dataTransfer.types.includes("Files") && dragFromThisPage) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, true);

  document.addEventListener("drop", event => {
    const dt = event.dataTransfer;
    if (!wantsDrop(dt) || isTextField(event.target)) return;
    const files = imageFiles(dt.files);
    if (files.length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      files.slice(0, 8).forEach(f => void openFile(f));
      return;
    }
    if (dragFromThisPage) return;
    // An image dragged from another tab arrives as a link.
    const url = (dt.getData("text/uri-list") || "").split(/\r?\n/).find(l => l && !l.startsWith("#"));
    if (url && /^https?:/i.test(url)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void show(url);
    } else if (url) {
      event.preventDefault();
      toast("That image has a temporary address. Copy the image and paste it here instead (Ctrl+V).");
    }
  }, true);

  // ---- open from file ----
  // A menu click doesn't count as a click on the page, so the file dialog is
  // opened from a small on-page button instead.
  let chooser = null;
  function closeChooser() { chooser?.remove(); chooser = null; }
  function showChooser() {
    if (chooser) { closeChooser(); return; }
    chooser = document.createElement("div");
    chooser.setAttribute("data-jai-local-image-ui", "");
    chooser.style.cssText = "position:fixed!important;top:16px!important;left:50%!important;transform:translateX(-50%)!important;z-index:2147483647!important;display:flex!important;gap:8px!important;align-items:center!important;background:rgba(36,30,26,.94)!important;color:#eee6da!important;border:1px solid rgba(211,152,123,.45)!important;border-radius:12px!important;padding:10px 12px!important;font:14px system-ui!important;";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.display = "none";
    input.addEventListener("change", () => {
      imageFiles(input.files).slice(0, 8).forEach(f => void openFile(f));
      closeChooser();
    });
    const pickBtn = document.createElement("button");
    pickBtn.type = "button";
    pickBtn.textContent = "Choose image file";
    pickBtn.style.cssText = "background:#c78668!important;color:#241a15!important;border:0!important;border-radius:10px!important;padding:8px 12px!important;font:600 13px system-ui!important;cursor:pointer!important;";
    pickBtn.addEventListener("click", () => input.click());
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.cssText = "background:transparent!important;color:#c6b6a6!important;border:1px solid rgba(238,230,218,.2)!important;border-radius:10px!important;padding:8px 12px!important;font:13px system-ui!important;cursor:pointer!important;";
    cancel.addEventListener("click", closeChooser);
    const hint = document.createElement("span");
    hint.textContent = "or paste / drop an image anywhere";
    hint.style.cssText = "color:#b8ab9d!important;font-size:12px!important;";
    chooser.append(pickBtn, cancel, hint, input);
    document.documentElement.append(chooser);
    pickBtn.focus();
  }
  document.addEventListener("keydown", event => {
    if (chooser && event.key === "Escape") { event.preventDefault(); closeChooser(); }
  }, true);

  GM_registerMenuCommand("Open image from file / paste...", showChooser);
})();

  }
  initializeUserscript();
})();
