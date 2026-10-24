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
