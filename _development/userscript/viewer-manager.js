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
