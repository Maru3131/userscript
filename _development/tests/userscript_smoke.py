"""Browser test with two fixture tabs and a local GM API/storage adapter."""
import os
import base64
import json
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
        self.wfile.write(b'<html><body><h1>Image fixture</h1><img id="source" width="150" height="150"></body></html>')
    def log_message(self, *_): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
options = webdriver.FirefoxOptions()
options.add_argument('-headless')
options.binary_location = os.environ.get('FIREFOX_BIN', r'C:\Program Files\Mozilla Firefox\firefox.exe')
driver = webdriver.Firefox(options=options)
source = (BASE.parent / 'transparent-header.user.js').read_text(encoding='utf-8')
adapter = '''
window.GM_info={isIncognito:false};window.commands={};
window.GM_getValue=(key,def)=>{const value=localStorage.getItem(key);return value===null?def:JSON.parse(value)};
window.GM_setValue=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
window.GM_deleteValue=key=>localStorage.removeItem(key);
window.GM_registerMenuCommand=(name,fn)=>commands[name]=fn;
window.GM_addValueChangeListener=(key,fn)=>window.addEventListener('storage',event=>{if(event.key===key)fn()});
const original=Element.prototype.attachShadow;
Element.prototype.attachShadow=function(options){const result=original.call(this,options);window.testRoot=result;return result};
'''
def install(janitor):
    driver.execute_script(adapter)
    driver.execute_script('(function(location){' + source + '\n})(arguments[0]);',
        {'hostname': 'janitorai.com' if janitor else 'example.com', 'protocol':'https:', 'href':'https://example.com/'})

try:
    url = f'http://127.0.0.1:{server.server_port}/'
    driver.get(url)
    install(True)
    target = driver.current_window_handle
    driver.switch_to.new_window('tab')
    driver.get(url)
    install(False)
    external = driver.current_window_handle
    gif = bytes.fromhex('47494638396101000100800000ff00000000ff21ff0b4e45545343415045322e300301000000')
    for pixel in ['4401','4c01']:
        gif += bytes.fromhex('21f904000a0000002c0000000001000100000202'+pixel+'00')
    gif += b';'
    image = 'data:image/gif;base64,' + base64.b64encode(gif).decode()
    driver.execute_script('document.querySelector("img").src=arguments[0]',image)
    ActionChains(driver).key_down(Keys.ALT).click(driver.find_element(By.ID,'source')).key_up(Keys.ALT).perform()
    assert driver.execute_script('return document.querySelector("[data-janitor-image-float]")') is None
    driver.switch_to.window(target)
    WebDriverWait(driver,10).until(lambda d:d.execute_script('return window.testRoot?.querySelector("img").naturalWidth===1'))
    assert driver.execute_script('return testRoot.querySelector("img").src') == image
    assert driver.execute_script('return GM_getValue("jif-regular-inbox",null)') is None
    assert driver.execute_script('return getComputedStyle(testRoot.querySelector("section")).borderWidth') == '0px'
    assert driver.execute_script('return getComputedStyle(testRoot.querySelector("section")).backgroundColor') == 'rgba(0, 0, 0, 0)'
    assert driver.execute_script('return testRoot.querySelector("header,[data-action=pick]")') is None
    grip = driver.execute_script('return testRoot.querySelector(".resize")')
    width = driver.execute_script('return testRoot.querySelector("section").getBoundingClientRect().width')
    ActionChains(driver).move_to_element(grip).click_and_hold().move_by_offset(-50,-50).release().perform()
    assert driver.execute_script('return testRoot.querySelector("section").getBoundingClientRect().width') < width
    assert driver.execute_script('const r=testRoot.querySelector("section").getBoundingClientRect();return Math.abs(r.width-r.height)<1')
    img = driver.execute_script('return testRoot.querySelector("img")')
    old_top = driver.execute_script('return testRoot.querySelector("section").getBoundingClientRect().top')
    ActionChains(driver).move_to_element(img).click_and_hold().move_by_offset(-60,35).release().perform()
    assert driver.execute_script('return testRoot.querySelector("section").getBoundingClientRect().top') > old_top
    driver.execute_script('testRoot.querySelector("[data-action=close]").click()')
    driver.switch_to.window(external)
    portrait = 'data:image/svg+xml;base64,' + base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="400"><rect width="200" height="400" fill="#b8a4d8"/></svg>').decode()
    driver.execute_script('document.querySelector("img").src=arguments[0]',portrait)
    driver.execute_script('commands["Choose image for JanitorAI (Alt+Shift+J)"]()')
    driver.find_element(By.ID,'source').click()
    driver.switch_to.window(target)
    WebDriverWait(driver,10).until(lambda d:d.execute_script('return !!document.querySelector("[data-janitor-image-float]")'))
    WebDriverWait(driver,10).until(lambda d:d.execute_script('return testRoot.querySelector("img").naturalHeight===400'))
    assert driver.execute_script('const r=testRoot.querySelector("section").getBoundingClientRect();return Math.abs(r.width/r.height-0.5)<0.01')
    assert driver.execute_script('const p=testRoot.querySelector("section").getBoundingClientRect(),i=testRoot.querySelector("img").getBoundingClientRect();return Math.abs(p.width-i.width)<1 && Math.abs(p.height-i.height)<1')
    driver.execute_script('commands["Clear pending image"]()')
    assert driver.execute_script('return document.querySelector("[data-janitor-image-float]")') is None
    print(json.dumps({'passed':['Cross-tab delivery and GIF load','Transparent borderless image, no title bar or picker arrow','Size controls resize actual image','Corner resize preserves proportions','Drag the image to move','Portrait replacement fits exact image proportions without bars','Mailbox cleanup and close']},indent=2))
finally:
    driver.quit()
    server.shutdown()
