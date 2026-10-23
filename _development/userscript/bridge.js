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
  async function sendImage(src) {
    if (isJanitor) { show(src); return; }
    const target = GM_getValue(targetKey, null);
    if (!target || Date.now() - target.time > 120000) {
      toast("Visit your JanitorAI tab once, then select this image again.");
      return;
    }
    if (src.startsWith("blob:")) {
      toast("This image has a temporary URL. Open the original image and select it there.");
      return;
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
