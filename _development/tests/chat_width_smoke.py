"""Chat-width slider on a mock JanitorAI chat page, in headless Chromium.

pip install playwright ; set CHROMIUM_BIN if Chromium isn't found automatically.
Uses a local fixture (served as janitorai.com via request routing), never the live site.
"""
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = (ROOT / 'transparent-header.user.js').read_text(encoding='utf-8')

FIXTURE = """<!doctype html><html><head><style>
  body { margin:0; background:#1d1814; color:#ddd; font:16px serif; }
  ._chatLayout_a1 { max-width:none; }
  ._outerColumn_b2 { max-width:640px; margin:0 auto; }
  ._messageList_c3 { max-width:600px; margin:0 auto; padding-bottom:160px; }
  ._message_d4 { max-width:600px; margin:0 auto 20px; min-height:60px; }
  ._chatInputContainer_e5 { position:fixed; left:0; right:0; bottom:0; }
  ._chatInputWrapper_f6 { max-width:600px; margin:0 auto 16px; }
  ._chatInputInner_g7 { padding:8px; border:1px solid #555; }
  ._chatTextarea_h8 { width:100%; box-sizing:border-box; }
  ._side_i9 { position:fixed; left:16px; top:16px; width:180px; max-width:180px; height:80px; }
  ._apiTag_k2 { position:fixed; right:16px; top:16px; width:120px; height:36px; }
  ._dialog_j0 { max-width:500px; margin:40px auto; height:100px; }
</style></head><body>
  <div class="_headerContainer_k1 _side_i9"><button id="character-name-button">Elara</button>
    <span class="_apiTag_k2">using proxy</span></div>
  <div class="_chatLayout_a1"><div class="_outerColumn_b2"><div class="_messageList_c3" id="list">
    MSGS
  </div></div></div>
  <div class="_dialog_j0" id="dialog">unrelated centered box</div>
  <div class="_chatInputContainer_e5"><div class="_chatInputWrapper_f6"><div class="_chatInputInner_g7">
    <textarea class="_chatTextarea_h8"></textarea></div></div></div>
</body></html>""".replace("MSGS", "".join(f'<div class="_message_d4">message {i} ' + 'lorem ipsum ' * 30 + '</div>' for i in range(30)))

GM = """window.__store = JSON.parse(localStorage.getItem('__gm') || '{}');
window.GM_info = {isIncognito:false}; window.__menu = {};
window.GM_getValue = (k,d) => (k in __store ? __store[k] : d);
window.GM_setValue = (k,v) => { __store[k]=v; localStorage.setItem('__gm', JSON.stringify(__store)); };
window.GM_deleteValue = k => { delete __store[k]; localStorage.setItem('__gm', JSON.stringify(__store)); };
window.GM_addValueChangeListener = () => {};
window.GM_registerMenuCommand = (n,f) => { __menu[n]=f; };
window.GM_setClipboard = () => {};"""

RESERVE_JS = """() => { const h = document.querySelector('._side_i9').getBoundingClientRect();
  const a = document.querySelector('._apiTag_k2').getBoundingClientRect();
  return Math.ceil(Math.max(h.right, innerWidth - a.left, 24) + 16); }"""

def expected(page, chosen):
    r = page.evaluate(RESERVE_JS)
    vw = page.evaluate('innerWidth')
    return round(max(600, min(chosen, vw - 2 * r)))

def width(page, sel):
    return page.eval_on_selector(sel, 'e => Math.round(e.getBoundingClientRect().width)')

def main():
    exe = os.environ.get('CHROMIUM_BIN') or next((str(p) for p in Path('/opt/pw-browsers').glob('chromium-*/chrome-linux64/chrome')), None)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=exe) if exe else pw.chromium.launch()
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        page.route('https://janitorai.com/**', lambda r: r.fulfill(status=200, content_type='text/html', body=FIXTURE))

        def load(url='https://janitorai.com/chats/4242'):
            page.goto(url)
            page.evaluate(GM)
            page.evaluate(SCRIPT)
            page.wait_for_timeout(400)

        load()
        side_before = width(page, '._side_i9')
        assert width(page, '._chatInputInner_g7') == 600, 'default width changed without a setting'
        assert width(page, '._message_d4') == 600

        # Open the slider, drag to 1100px
        page.evaluate('__menu["Chat width..."]()')
        page.wait_for_selector('[data-jai-width-ui] input[type=range]')
        page.eval_on_selector('[data-jai-width-ui] input[type=range]',
                              'e => { e.value = "1100"; e.dispatchEvent(new Event("input", {bubbles:true})); }')
        page.wait_for_timeout(500)
        assert width(page, '._chatInputWrapper_f6') == expected(page, 1100)
        assert width(page, '._messageList_c3') == expected(page, 1100), f"messages not widened (nested cap): {width(page, '._messageList_c3')}"
        assert width(page, '._message_d4') == expected(page, 1100)
        assert width(page, '._side_i9') == side_before, 'side panel touched'
        assert width(page, '#dialog') == 500, 'unrelated box touched'

        # Messages arriving later are wide too, including offscreen ones
        page.evaluate('''() => { const m = document.createElement("div"); m.className = "_message_d4"; m.id = "late";
                          m.textContent = "late ".repeat(200); document.getElementById("list").prepend(m); }''')
        page.wait_for_timeout(400)
        assert width(page, '#late') == expected(page, 1100), 'new message not widened'

        # Cancel restores, Save persists
        page.click('[data-jai-width-ui] >> text=Cancel')
        page.wait_for_timeout(300)
        assert width(page, '._chatInputWrapper_f6') == 600, 'cancel did not restore'
        page.evaluate('__menu["Chat width..."]()')
        page.eval_on_selector('[data-jai-width-ui] input[type=range]',
                              'e => { e.value = "1000"; e.dispatchEvent(new Event("input", {bubbles:true})); }')
        page.click('[data-jai-width-ui] >> text=Save')
        page.wait_for_timeout(300)
        assert page.evaluate('GM_getValue("jai-chat-width")') == 1000

        # Reload: saved width comes back on its own
        load()
        page.wait_for_timeout(400)
        assert width(page, '._messageList_c3') == 1000, f"saved width not restored: {width(page, '._messageList_c3')}"

        # Never wider than the screen minus the name panel (196px + 16px each side)
        page.set_viewport_size({'width': 1400, 'height': 900})
        page.wait_for_timeout(400)
        assert width(page, '._messageList_c3') == expected(page, 1000), f"not capped on small window: {width(page, '._messageList_c3')}"
        page.set_viewport_size({'width': 1000, 'height': 900})
        page.wait_for_timeout(400)
        assert width(page, '._messageList_c3') == 600, 'went narrower than the site default'

        # ThinkPad-sized window (1080p at 150%): slider must still have range
        page.set_viewport_size({'width': 1280, 'height': 720})
        page.wait_for_timeout(400)
        page.evaluate('__menu["Chat width..."]()')
        page.wait_for_selector('[data-jai-width-ui] input[type=range]')
        rng = page.eval_on_selector('[data-jai-width-ui] input[type=range]', 'e => [Number(e.min), Number(e.max)]')
        assert rng == [600, expected(page, 9999)] and rng[1] - rng[0] >= 200, f"slider range on laptop: {rng}"
        page.eval_on_selector('[data-jai-width-ui] input[type=range]',
                              'e => { e.value = e.max; e.dispatchEvent(new Event("input", {bubbles:true})); }')
        page.wait_for_timeout(400)
        assert rng[1] - 10 < width(page, '._messageList_c3') <= rng[1], f"laptop widen failed: {width(page, '._messageList_c3')}"
        hdr = page.eval_on_selector('._side_i9', 'e => e.getBoundingClientRect().right')
        col = page.eval_on_selector('._messageList_c3', 'e => e.getBoundingClientRect().left')
        assert col > hdr, 'column runs under the name panel'
        page.click('[data-jai-width-ui] >> text=Cancel')

        # Not on a chat page -> nothing changes
        page.set_viewport_size({'width': 1920, 'height': 1080})
        load('https://janitorai.com/characters/abc')
        assert width(page, '._messageList_c3') == 600, 'widened off-chat'

        page.set_viewport_size({'width': 1920, 'height': 1080})
        load()
        if os.environ.get('SHOT'): page.screenshot(path=os.environ['SHOT'])
        browser.close()
    print('chat_width_smoke: all checks passed')

if __name__ == '__main__':
    main()
