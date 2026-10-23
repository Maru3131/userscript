"""Test local annotations on fixture pages, never the live JanitorAI site."""
import os
import base64
from pathlib import Path
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / '.test-deps'))
from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(b'<html><body><img id="source" width="150" height="150"></body></html>')
    def log_message(self, *_): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
options = webdriver.FirefoxOptions()
options.add_argument('-headless')
options.binary_location = os.environ.get('FIREFOX_BIN', r'C:\Program Files\Mozilla Firefox\firefox.exe')
driver = webdriver.Firefox(options=options)
script = (BASE.parent / 'transparent-header.user.js').read_text(encoding='utf-8')
adapter = '''
window.GM_info={isIncognito:false};window.commands={};
window.GM_getValue=(key,def)=>{const value=localStorage.getItem(key);return value===null?def:JSON.parse(value)};
window.GM_setValue=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
window.GM_deleteValue=key=>localStorage.removeItem(key);
window.GM_registerMenuCommand=(name,fn)=>commands[name]=fn;
window.GM_addValueChangeListener=()=>{};
const original=Element.prototype.attachShadow;
Element.prototype.attachShadow=function(options){const result=original.call(this,options);window.testRoot=result;return result};
'''
image = 'data:image/svg+xml;base64,' + base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="500"><rect width="300" height="500" fill="#b8a4d8"/></svg>').decode()
js = driver.execute_script
wait = WebDriverWait(driver,10)
def open_page(chat):
    driver.get(f'http://127.0.0.1:{server.server_port}/{chat}')
    js(adapter)
    js('(function(location){' + script + '\n})(arguments[0]);', {'hostname':'janitorai.com','protocol':'https:','href':f'https://janitorai.com/chats/{chat}'})
    js('document.querySelector("img").src=arguments[0];commands["Choose image for JanitorAI (Alt+Shift+J)"]()', image)
    driver.find_element(By.ID,'source').click()
    wait.until(lambda _: js('return window.testRoot?.querySelector("img").naturalHeight===500'))
def node(selector): return js('return testRoot.querySelector(arguments[0])', selector)
def add(name, note):
    ActionChains(driver).double_click(node('.stage')).perform()
    wait.until(lambda _: node('.label-editor') is not None)
    node('input').send_keys(name)
    node('textarea').send_keys(note)
    node('button[type=submit]').click()
    wait.until(lambda _: node('.character-label') is not None)

try:
    driver.set_window_size(1100,850)
    open_page('one')
    add('Nha Aldar <b>', 'Red horns · guardian')
    assert node('.character-label').text=='Nha Aldar <b>'
    assert '<b>' in js('return testRoot.querySelector(".character-label").textContent')
    assert node('.character-label b') is None
    assert 'Red horns' in node('.character-label').get_attribute('title')
    before = js('const r=testRoot.querySelector("section").getBoundingClientRect();return [r.left,r.top]')
    ActionChains(driver).move_to_element(node('.character-label')).click_and_hold().move_by_offset(-35,60).release().perform()
    assert js('const r=testRoot.querySelector("section").getBoundingClientRect();return [r.left,r.top]')==before
    position = js('const n=testRoot.querySelector(".character-label");return [n.style.left,n.style.top]')
    ActionChains(driver).move_to_element(node('.resize')).click_and_hold().move_by_offset(-45,-70).release().perform()
    assert js('const n=testRoot.querySelector(".character-label");return [n.style.left,n.style.top]')==position
    ActionChains(driver).double_click(node('.character-label')).perform()
    wait.until(lambda _: node('.label-editor') is not None)
    node('input').send_keys(Keys.CONTROL,'a')
    node('input').send_keys('Nha Aldar')
    node('textarea').send_keys(Keys.ESCAPE)
    assert node('.label-editor') is None and node('.character-label').text=='Nha Aldar <b>'
    assert node('section') is not None
    ActionChains(driver).double_click(node('.character-label')).perform()
    node('input').send_keys(Keys.CONTROL,'a')
    node('input').send_keys('Nha Aldar')
    node('button[type=submit]').click()
    assert node('.character-label').text=='Nha Aldar'
    # Existing 2.8 installations saved plain arrays; preserve that data too.
    js('const k=Object.keys(localStorage).find(k=>k.includes("labels-"));const v=JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify(v.labels))')
    node('[data-action=close]').click()
    open_page('one')
    wait.until(lambda _: node('.character-label') is not None)
    assert node('.character-label').text=='Nha Aldar'
    assert js('const n=testRoot.querySelector(".character-label");return [n.style.left,n.style.top]')==position
    # Keep the upper 40% of the image, excluding the existing lower label.
    js('commands["Crop floating image (optional)"]()')
    rect = js('const r=testRoot.querySelector("section").getBoundingClientRect();return {width:r.width,height:r.height}')
    ActionChains(driver).move_to_element_with_offset(node('section'), -rect['width']/2+2, -rect['height']/2+2).key_down(Keys.SHIFT).click_and_hold().move_by_offset(rect['width']-4,rect['height']*.4-4).release().key_up(Keys.SHIFT).perform()
    assert not node('.character-label').is_displayed()
    crop_data = js('return JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes("labels-")))).crop')
    assert crop_data and crop_data['h']<0.41
    ratio = js('const r=testRoot.querySelector("section").getBoundingClientRect();return r.width/r.height')
    assert abs(ratio-(300/500)*crop_data['w']/crop_data['h'])<0.01
    # Cropping does not change the image source, and names can be added on it.
    assert node('img').get_attribute('src')==image
    add('Upper character', 'Visible in the crop')
    labels = js('return Array.from(testRoot.querySelectorAll(".character-label"))')
    upper = next(label for label in labels if label.text=='Upper character')
    ActionChains(driver).double_click(upper).perform()
    node('.remove').click()
    open_page('one')
    wait.until(lambda _: node('.character-label') is not None)
    assert not node('.character-label').is_displayed()
    assert abs(js('const r=testRoot.querySelector("section").getBoundingClientRect();return r.width/r.height')-ratio)<0.01
    ActionChains(driver).key_down(Keys.SHIFT).double_click(node('.stage')).key_up(Keys.SHIFT).perform()
    assert node('.character-label').is_displayed()
    assert node('.label-editor') is None
    assert js('return JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes("labels-")))).crop') is None
    assert js('const n=testRoot.querySelector(".character-label");return [n.style.left,n.style.top]')==position
    assert abs(js('const r=testRoot.querySelector("section").getBoundingClientRect();return r.width/r.height')-0.6)<0.01
    # Explicit crop mode can be cancelled without closing the image.
    js('commands["Crop floating image (optional)"]()')
    node('section').send_keys(Keys.ESCAPE)
    assert node('section') is not None and 'cropping' not in node('section').get_attribute('class')
    # Shift-drag now moves the viewer, including partly offscreen, without cropping.
    ActionChains(driver).move_to_element(node('.stage')).key_down(Keys.SHIFT).click_and_hold().move_by_offset(0,-200).release().key_up(Keys.SHIFT).perform()
    rect = js('const r=testRoot.querySelector("section").getBoundingClientRect();return {top:r.top,bottom:r.bottom}')
    assert rect['top'] < 0 and rect['bottom'] >= 24
    assert js('return JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes("labels-")))).crop') is None
    js('commands["Bring floating image back on screen"]()')
    assert js('const r=testRoot.querySelector("section").getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight')
    # Repeated crops must stop before huge CSS dimensions make the image vanish.
    for _ in range(9):
        js('commands["Crop floating image (optional)"]()')
        rect = js('const r=testRoot.querySelector("section").getBoundingClientRect();return {width:r.width,height:r.height}')
        ActionChains(driver).move_to_element_with_offset(node('section'), -rect['width']/4, -rect['height']/4).click_and_hold().move_by_offset(rect['width']/2,rect['height']/2).release().perform()
        c = js('return JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes("labels-")))).crop')
        assert c and c['w'] >= 0.02 and c['h'] >= 0.02
    # A reset works even after "clear pending" has destroyed the viewer.
    js('window.retiredPicture=testRoot.querySelector("img");window.viewerErrors=[];window.addEventListener("error",e=>viewerErrors.push(e.message))')
    js('commands["Clear pending image"]();commands["Recover floating image (keep labels)"]()')
    wait.until(lambda _: node('.character-label') is not None and node('.character-label').is_displayed())
    js('retiredPicture.dispatchEvent(new Event("load"));retiredPicture.dispatchEvent(new Event("error"))')
    assert js('return viewerErrors') == []
    assert node('.status').text == ''
    assert node('img').get_attribute('src') == image
    assert js('return JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes("labels-")))).crop') is None
    # Old extreme saved crops recover automatically on reload, keeping labels.
    for bad_crop in [dict(x=.4,y=.4,w=1e-14,h=1e-14),dict(x=.4,y=0,w=.02,h=.95)]:
        js('const k=Object.keys(localStorage).find(k=>k.includes("labels-"));const v=JSON.parse(localStorage.getItem(k));v.crop=arguments[0];localStorage.setItem(k,JSON.stringify(v))', bad_crop)
        open_page('one')
        wait.until(lambda _: node('.character-label') is not None and node('.character-label').is_displayed())
        wait.until(lambda _: js('return JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes("labels-")))).crop') is None)
        assert abs(js('const r=testRoot.querySelector("section").getBoundingClientRect();return r.width/r.height')-.6)<.01
    # Replacing the image and clearing/reopening must not inherit crop geometry.
    replacement = 'data:image/svg+xml;base64,' + base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#edb"/></svg>').decode()
    js('document.querySelector("img").src=arguments[0];commands["Choose image for JanitorAI (Alt+Shift+J)"]()', replacement)
    driver.find_element(By.ID,'source').click()
    wait.until(lambda _: node('img').get_attribute('src') == replacement and js('return testRoot.querySelector("img").naturalWidth') == 400)
    assert abs(js('const r=testRoot.querySelector("section").getBoundingClientRect();return r.width/r.height')-2)<.01
    assert js('return document.querySelectorAll("[data-janitor-image-float]").length') == 2
    js('commands["Close all floating images"]();commands["Recover floating image (keep labels)"]()')
    wait.until(lambda _: js('return document.querySelector("[data-janitor-image-float]") && testRoot.querySelector("img").naturalWidth===400'))
    # Watch multiple frames: the viewer remains connected and its bounds settle.
    samples = driver.execute_async_script('''const done=arguments[0], samples=[];function sample(){const n=testRoot.querySelector("section"),r=n.getBoundingClientRect();samples.push([n.isConnected,r.width,r.height]);if(samples.length===12)done(samples);else requestAnimationFrame(sample)}requestAnimationFrame(sample)''')
    assert all(s[0] and s[1] > 24 and s[2] > 24 for s in samples)
    assert max(s[1] for s in samples)-min(s[1] for s in samples) < .05
    assert max(s[2] for s in samples)-min(s[2] for s in samples) < .05
    open_page('two')
    # Hash/load is async; wait for readiness through the menu opening an editor.
    wait.until(lambda _: js('return !!Object.keys(localStorage).find(k=>k.includes("labels-"))'))
    assert node('.character-label') is None
    open_page('one')
    wait.until(lambda _: node('.character-label') is not None)
    ActionChains(driver).double_click(node('.character-label')).perform()
    node('.remove').click()
    assert node('.character-label') is None
    open_page('one')
    assert node('.character-label') is None
    print('PASS: annotation add/edit/drag/delete and chat isolation; crop reload/reset; offscreen drag; repeated-crop limits; automatic recovery of extreme saved crops; reset after clearing pending image; new image replacement and stable geometry; labels preserved.')
finally:
    driver.quit()
    server.shutdown()
