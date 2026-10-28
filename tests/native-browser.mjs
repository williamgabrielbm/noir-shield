// JavaScript, file: tests/native-browser.mjs, target: isolated Edge/Chromium via local CDP.
import {spawn} from 'node:child_process';import net from 'node:net';import {chromium} from 'playwright';
export async function nativeBrowser(profile,extension,protect,executable='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'){
 const server=net.createServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const port=server.address().port;await new Promise(ok=>server.close(ok));
 const proc=spawn(executable,['--headless=new','--mute-audio','--user-data-dir='+profile,'--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,...(protect?['--disable-extensions-except='+extension,'--load-extension='+extension]:[]),'--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:'ignore'});proc.unref();
 for(let i=0;i<30;i++){try{const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);return browser.contexts()[0];}catch{await new Promise(ok=>setTimeout(ok,500));}}
 throw Error('isolated native browser unavailable');
}
export async function closeNative(context){try{const session=await context.browser().newBrowserCDPSession();await session.send('Browser.close');}catch{}}
export async function noirWorker(context){
 for(let n=0;n<40;n++){
  for(const w of context.serviceWorkers()){
   try{if((await w.evaluate(()=>chrome.runtime.getManifest().name)).startsWith('Noir Shield'))return w;}catch{}
  }
  await new Promise(ok=>setTimeout(ok,250));
 }
 throw Error('Noir Shield worker not found');
}
