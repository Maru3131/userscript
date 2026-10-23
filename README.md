# userscript

Personal Violentmonkey userscripts (Firefox).

## Transparent Header (JanitorAI)

One script that does all of this:

- **Floating images/GIFs.** Alt-click any image, or press Alt+Shift+J to pick one. You can also send an image from another website to your last JanitorAI tab. Each image gets its own popout with resizing, optional cropping, and character labels.
- **Theme.** A transparent header, a compact name panel on the left, the proxy button at top-right, and a warm glass textbox.
- **Copy chat.** A "Copy chat" button at the bottom right, also available in the script menu, copies the open chat to your clipboard as plain text.

**Install / update link:**
https://raw.githubusercontent.com/Maru3131/userscript/main/transparent-header.user.js

Violentmonkey checks that link for new versions on its own. To get one immediately, open the Violentmonkey dashboard, click "Check for updates", then refresh your JanitorAI tabs. Already open tabs keep running the old code until you refresh them.

Saved labels and crops stay in Violentmonkey's local storage on your PC. Nothing is uploaded, and none of it is stored in this repo.

### Switching from the old setup (once)

Do this if you had **Transparent Header 2.11.0** installed from a local file and **JanitorAI Copy Chat** installed separately.

1. **Back up first (optional, but safe).** In the Violentmonkey dashboard, open Settings, then Backup, turn on exporting script values, and click Export.
2. If you used "Track external edits" for Transparent Header, close that tracking tab first. Otherwise the local 2.11.0 file can overwrite the update.
3. Open the install link above. Violentmonkey recognizes the same script (same name and namespace) and offers to **update 2.11.0 to 2.12.0**. Confirm. The script's stored labels and crops stay attached to it.
   - **Don't uninstall Transparent Header and then install fresh.** Uninstalling deletes its saved labels.
4. Delete **JanitorAI Copy Chat** in Violentmonkey. It never stored anything. If you forget, its next update turns it into an empty stub that does nothing.
5. Also disable any older copies (Private Image Float or Janitor Transparent Header) if they are still around.
6. Refresh JanitorAI and any image-source tabs. Alt-click an image you labeled before, and the labels should be there.

## Development

The installer is generated. Edit the files in `_development/`, then rebuild:

```
python _development/userscript/build.py
```

Bump `VERSION` in `build.py` for every release so Violentmonkey detects it.

- `_development/userscript/`: the modules (transport, annotations, viewer manager, themes, chat export) and `build.py`.
- `_development/janitor-image-float/content.js`: the base viewer used as build input. Don't install it directly.
- `_development/tests/`
  - Three Selenium + Firefox suites (`*_smoke.py`). Set `FIREFOX_BIN` if Firefox isn't at the default Windows path.
  - `chat_export_smoke.js`, a Node + jsdom check that the merged export matches Copy Chat 1.0.0 exactly. Run it with `npm install jsdom` first.

`janitorai-copy-chat.user.js` is the retired standalone exporter, kept only so old installs switch themselves off.
