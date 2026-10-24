"""Build independent image viewers with the local userscript transport."""
from pathlib import Path
base = Path(__file__).resolve().parent
source = (base.parent / 'janitor-image-float/content.js').read_text(encoding='utf-8')
source = source.replace('/* global browser */\n', '')
source = source.replace('__janitorImageFloatLoaded', '__janitorImageFloatUserscriptLoaded')

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f'Expected one viewer hook: {old!r}')
    return text.replace(old, new, 1)

start = source.index('  let host,')
end = source.index('  function sourceFrom')
bootstrap, viewer, picker = source[:start], source[start:end], source[end:]
safe_start = viewer.index('  const safeSource')
safe_end = viewer.index('  function clamp')
safe_source = viewer[safe_start:safe_end]
viewer = viewer[:safe_start] + viewer[safe_end:]
viewer = replace_once(viewer, '  let picking = false;\n  let notice;\n', '')
viewer = replace_once(viewer, '    host?.remove();', '    annotationUI?.destroy();\n    annotationUI = null;\n    removeViewer(api);\n    host?.remove();')
viewer = replace_once(viewer, '    status = root.querySelector(".status");', '''    status = root.querySelector(".status");
    annotationUI = setupAnnotations(root, panel, picture, {
      setAspect(value) { aspect = value; }, fit, setSize, bringBack
    });
    root.addEventListener("pointerdown", () => activateViewer(api), true);
    root.addEventListener("focusin", () => activateViewer(api), true);''')
viewer = replace_once(viewer, '      const resizing = event.target.closest(".resize");', '      if (event.target.closest("[data-annotation-ui]")) return;\n      const resizing = event.target.closest(".resize");')
viewer = replace_once(viewer, '    picture.src = checked;', '    picture.src = checked;\n    return annotationUI.load(checked).catch(() => toast("Could not load saved labels. Try reopening the image."));')
viewer = replace_once(viewer, '      aspect = picture.naturalWidth / picture.naturalHeight || 1;\n      fit();', '      annotationUI.applyGeometry(true);')
viewer = replace_once(viewer, '    if (!host?.isConnected) { close(); create(); }', '    if (!host?.isConnected) create();')
viewer = replace_once(viewer, '  function show(src)', '  function open(src)')
viewer = replace_once(viewer, '    panel.style.left = `${Math.max(0, innerWidth - 360)}px`;\n    panel.style.top = `${Math.min(80, Math.max(0, innerHeight - 410))}px`;', '''    const columns = Math.max(1, Math.floor((innerWidth - 20) / 360));
    panel.style.left = `${Math.max(0, innerWidth - 360 - (slot % columns)*360)}px`;
    panel.style.top = `${Math.min(80 + Math.floor(slot/columns)*42, Math.max(0, innerHeight - 100))}px`;''')
viewer = '''  function createImageViewer(slot) {
    let annotationUI = null;
    const api = {
      open, close, fit, bringBack,
      get source() { return selectedSource; },
      get connected() { return !!host?.isConnected; },
      get annotations() { return annotationUI; },
      setLayer(value) { host?.style.setProperty("z-index", String(value), "important"); }
    };
''' + viewer + '    return api;\n  }\n'
picker = replace_once(picker, '    if (event.composedPath().includes(host) || event.target === notice) return;', '    if (event.composedPath().some(node => node.matches?.("[data-janitor-image-float]")) || event.target === notice) return;')
start = picker.index('    if (isJanitor) {\n      show(src);')
end = picker.index('\n  function escapePicker', start)
picker = picker[:start] + '    stopPicker();\n    await sendImage(src);\n  }\n' + picker[end:]
picker = picker[:picker.index('  browser.runtime.onMessage.addListener')]
header = (base / 'header-theme.js').read_text(encoding='utf-8')
composer = (base / 'composer-theme.js').read_text(encoding='utf-8')
chat_export = (base / 'chat-export.js').read_text(encoding='utf-8')
local_images = (base / 'local-images.js').read_text(encoding='utf-8')
chat_width = (base / 'chat-width.js').read_text(encoding='utf-8')
modules = '\n'.join((base / name).read_text(encoding='utf-8') for name in ['bridge.js', 'annotations.js', 'viewer-manager.js'])
source = bootstrap + safe_source + modules + '\n' + viewer + '\n  let picking = false;\n  let notice;\n' + picker
source += '  if (isJanitor) {\n' + header + '\n' + composer + '\n' + chat_export + '\n' + local_images + '\n' + chat_width + '\n  }\n  initializeUserscript();\n})();\n'
VERSION = '2.14.0'  # bump on every release so Violentmonkey sees the update
REPO_RAW = 'https://raw.githubusercontent.com/Maru3131/userscript/main/'
INSTALLER = 'transparent-header.user.js'
metadata = f'''// ==UserScript==
// @name         Transparent Header
// @namespace    local.janitor-transparent-header
// @version      {VERSION}
// @description  Float and annotate multiple images, reveal the JanitorAI header background, style the textbox, open pasted/dropped images, widen the chat column, and copy the open chat to the clipboard. Saved labels stay local.
// @homepageURL  https://github.com/Maru3131/userscript
// @updateURL    {REPO_RAW}{INSTALLER}
// @downloadURL  {REPO_RAW}{INSTALLER}
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

'''
output = base.parent.parent / INSTALLER
output.write_text(metadata + source, encoding='utf-8', newline='\n')
print(f'Built {output}')
