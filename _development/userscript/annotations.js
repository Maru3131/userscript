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
