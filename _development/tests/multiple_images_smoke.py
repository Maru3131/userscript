"""Exercise multiple independent viewers on a local Firefox fixture."""
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
from selenium.webdriver.support.ui import WebDriverWait

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(b'<html><body><img id="a" width="80" height="80"><img id="b" width="80" height="80"><img id="c" width="80" height="80"></body></html>')
    def log_message(self, *_): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
options = webdriver.FirefoxOptions()
options.add_argument('-headless')
options.binary_location = os.environ.get('FIREFOX_BIN', r'C:\Program Files\Mozilla Firefox\firefox.exe')
driver = webdriver.Firefox(options=options)
js = driver.execute_script
wait = WebDriverWait(driver, 10)

def svg(w, h, color):
    return 'data:image/svg+xml;base64,' + base64.b64encode(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="{color}"/></svg>'.encode()).decode()

images = [svg(300,500,'#b8a4d8'), svg(600,300,'#a4d8b8')]
gif = bytes.fromhex('47494638396101000100800000ff00000000ff21ff0b4e45545343415045322e300301000000')
for pixel in ['4401','4c01']:
    gif += bytes.fromhex('21f904000a0000002c0000000001000100000202'+pixel+'00')
images.append('data:image/gif;base64,' + base64.b64encode(gif+b';').decode())

def node(index, selector):
    return js('return testRoots[arguments[0]].root.querySelector(arguments[1])', index, selector)

def bounds(index):
    return js('const r=testRoots[arguments[0]].root.querySelector("section").getBoundingClientRect();return [r.left,r.top,r.width,r.height]', index)

def select(index):
    js('testRoots[arguments[0]].root.querySelector("section").focus()', index)

def label(index, name):
    ActionChains(driver).double_click(node(index,'.stage')).perform()
    wait.until(lambda _: node(index, '.label-editor') is not None)
    node(index, 'input').send_keys(name)
    node(index, 'textarea').send_keys('Note for ' + name)
    node(index, 'button[type=submit]').click()

try:
    driver.set_window_size(1600,950)
    driver.get(f'http://127.0.0.1:{server.server_port}/')
    js('''window.GM_info={isIncognito:false};window.commands={};window.testRoots=[];
      window.GM_getValue=(k,d)=>{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)};
      window.GM_setValue=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
      window.GM_deleteValue=k=>localStorage.removeItem(k);
      window.GM_registerMenuCommand=(k,f)=>commands[k]=f;
      window.GM_addValueChangeListener=(k,f)=>window.receiveImage=f;
      const original=Element.prototype.attachShadow;
      Element.prototype.attachShadow=function(o){const root=original.call(this,o);testRoots.push({host:this,root});return root};
    ''')
    source = (BASE.parent / 'transparent-header.user.js').read_text(encoding='utf-8')
    js('(function(location){' + source + '\n})(arguments[0]);', dict(hostname='janitorai.com',protocol='https:',href='https://janitorai.com/chats/multi'))
    assert not js('return Object.keys(commands).some(k=>k.includes("video"))')
    for i, image in enumerate(images):
        js('document.getElementById(arguments[0]).src=arguments[1];commands["Choose image for JanitorAI (Alt+Shift+J)"]()', 'abc'[i], image)
        driver.find_element('id','abc'[i]).click()
        wait.until(lambda _: js('return testRoots[arguments[0]]?.root.querySelector("img").naturalWidth>0', i))
    assert js('return document.querySelectorAll("[data-janitor-image-float]").length') == 3
    assert [node(i,'img').get_attribute('src') for i in range(3)] == images
    assert len(set(bounds(i)[0] for i in range(3))) == 3
    label(0,'Portrait')
    label(1,'Landscape')
    before_b, before_c = bounds(1), bounds(2)
    # Last clicked/focused viewer owns the script menu, independently of creation order.
    select(0)
    assert js('return +testRoots[0].host.style.zIndex > +testRoots[1].host.style.zIndex && +testRoots[0].host.style.zIndex > +testRoots[2].host.style.zIndex')
    js('commands["Crop floating image (optional)"]()')
    assert 'cropping' in node(0,'section').get_attribute('class')
    assert 'cropping' not in node(1,'section').get_attribute('class')
    w,h = bounds(0)[2:]
    ActionChains(driver).move_to_element_with_offset(node(0,'section'), -w*.4,-h*.4).click_and_hold().move_by_offset(w*.8,h*.3).release().perform()
    assert not node(0,'.character-label').is_displayed()
    assert node(1,'.character-label').is_displayed() and node(1,'.character-label').text=='Landscape'
    cropped = bounds(0)
    assert abs(cropped[2]/cropped[3]-1.6) < .05
    assert bounds(1) == before_b and bounds(2) == before_c
    ActionChains(driver).move_to_element(node(0,'.resize')).click_and_hold().move_by_offset(-50,-20).release().perform()
    assert bounds(0)[2] < cropped[2]
    assert bounds(1) == before_b and bounds(2) == before_c
    ActionChains(driver).move_to_element(node(0,'.stage')).click_and_hold().move_by_offset(-60,45).release().perform()
    assert bounds(1) == before_b and bounds(2) == before_c
    # Re-selecting the same source raises the existing crop without creating a duplicate.
    crop_before = bounds(0)[2:]
    js('commands["Choose image for JanitorAI (Alt+Shift+J)"]()')
    driver.find_element('id','a').click()
    assert js('return document.querySelectorAll("[data-janitor-image-float]").length') == 3
    assert bounds(0)[2:] == crop_before
    node(0,'[data-action=close]').click()
    assert js('return !testRoots[0].host.isConnected && testRoots[1].host.isConnected && testRoots[2].host.isConnected')
    assert node(1,'.character-label').text == 'Landscape' and node(2,'img').get_attribute('src') == images[2]
    # Closing one must not cancel label loading or geometry in any other viewer.
    js('commands["Choose image for JanitorAI (Alt+Shift+J)"]()')
    driver.find_element('id','a').click()
    wait.until(lambda _: node(3,'.character-label') is not None)
    assert node(3,'.character-label').get_attribute('textContent') == 'Portrait' and not node(3,'.character-label').is_displayed()
    js('commands["Show whole image / remove crop"]()')
    assert node(3,'.character-label').is_displayed()
    assert bounds(1) == before_b and bounds(2) == before_c
    # Capture distinct incoming values so rapid cross-tab delivery isn't overwritten.
    js('commands["Close all floating images"]()')
    js('''const target=GM_getValue("jif-regular-target").id;
      const first={id:"first",target,time:Date.now(),src:arguments[0]},second={id:"second",target,time:Date.now(),src:arguments[1]};
      GM_setValue("jif-regular-inbox",second);
      receiveImage("jif-regular-inbox",null,first,true);
      if(GM_getValue("jif-regular-inbox",null)?.id!=="second")throw Error("Newer pending image was lost");
      receiveImage("jif-regular-inbox",first,second,true);
      receiveImage("jif-regular-inbox",null,first,true);
    ''', images[0], images[1])
    wait.until(lambda _: js('return document.querySelectorAll("[data-janitor-image-float]").length') == 2)
    assert js('return GM_getValue("jif-regular-inbox",null)') is None
    js('commands["Bring all images back on screen"]();commands["Close all floating images"]()')
    assert js('return document.querySelectorAll("[data-janitor-image-float]").length') == 0
    print('PASS: three concurrent images/GIF, independent labels/crops/resize/movement/close, focus and menu ownership, saved labels and crop reopening, duplicate-source raising, rapid cross-tab delivery and close-all.')
finally:
    driver.quit()
    server.shutdown()
