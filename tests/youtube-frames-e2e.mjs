// JavaScript, file: tests/youtube-frames-e2e.mjs, target: installed Chrome, synthetic iframe transport contracts.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {installedChrome} from './chrome-installed.mjs';
import {noirWorker,closeNative} from './native-browser.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'work',process.env.NOIR_LABEL||'frame-contracts');await fs.mkdir(out,{recursive:true});
const profile=await fs.mkdtemp(path.join(out,'profile-'));let context;const checks=[],errors=[];
const report={started:new Date().toISOString(),scope:'Synthetic browser contracts; not proof that the reported live anti-adblock warning is fixed.'};
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log(JSON.stringify({passed:checks.length,check:name}));};
const fixture={videoDetails:{videoId:'fixture'},playabilityStatus:{status:'OK'},streamingData:{formats:[{url:'https://example.com/content'}]},adSlots:[{adSlotRenderer:{}}],captions:{keep:true}};
try{
 context=await installedChrome(profile,process.env.NOIR_EXTENSION_DIR||path.join(root,'dist'),true);await noirWorker(context);report.browser=context.chromeTestMetadata;
 const worker=await noirWorker(context),id=new URL(worker.url()).hostname,options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);
 const send=(type,extra={})=>options.evaluate(async({type,extra})=>{const r=await chrome.runtime.sendMessage({type,...extra});if(!r.ok)throw Error(r.error);return r.data;},{type,extra});
 await send('SET',{patch:{enabled:false}});
 await context.route('https://www.youtube.com/**',route=>{const url=new URL(route.request().url());return route.fulfill(url.pathname.startsWith('/youtubei/')?{contentType:'application/json',body:JSON.stringify({...fixture,observedMethod:route.request().method()})}:{contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"></head><body><p id="warning">Bloqueadores de anúncios violam os Termos de Serviço do YouTube</p><div id="movie_player"><video muted></video></div><script>window.ytInitialPlayerResponse=${JSON.stringify(fixture)}</script></body></html>`});});
 await context.route('https://example.com/**',route=>route.fulfill(route.request().url().includes('/youtubei/')?{contentType:'application/json',body:JSON.stringify(fixture)}:{contentType:'text/html',body:'<!doctype html><p>Cross origin fixture</p>'}));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.name));await page.goto('https://www.youtube.com/watch?v=fixture');
 await page.evaluate(async()=>{
  const frame=document.createElement('iframe');document.body.appendChild(frame);window.contractFrame=frame;
  const w=frame.contentWindow;
  window.contractNative={fetch:window.fetch,append:Node.prototype.appendChild,windowGetter:Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentWindow').get,documentGetter:Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentDocument').get,htmlSetter:Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML').set,childFetch:w.fetch,childPrototype:w.HTMLIFrameElement.prototype,childWindowGetter:Object.getOwnPropertyDescriptor(w.HTMLIFrameElement.prototype,'contentWindow').get};
  const detached=document.createElement('iframe');document.body.appendChild(detached);window.contractDetachedFrame=detached;window.contractNative.detachedFetch=detached.contentWindow.fetch.bind(window);
 });
 await send('SET',{patch:{enabled:true,youtube:true}});await page.waitForFunction(()=>window.ytInitialPlayerResponse.adSlots.length===0);
 const transport=await page.evaluate(async()=>{
  const w=window.contractFrame.contentWindow,url=location.origin+'/youtubei/v1/player';window.contractCapturedFetch=w.fetch;
  const rows=[];
  for(const[name,fetcher]of [['iframe-native-fetch',()=>w.fetch(url)],['top-cross-realm-request',()=>fetch(new w.Request(url,{method:'POST',body:'{}'}))],['top-cross-realm-url',()=>fetch(new w.URL(url))]]){
   const response=await fetcher(),clone=response.clone(),stream=response.clone(),body=await response.json(),text=JSON.parse(await clone.text()),streamBody=await new Response(stream.body).json();
   rows.push({name,slots:body.adSlots.length,textSlots:text.adSlots.length,streamSlots:streamBody.adSlots.length,realm:name==='iframe-native-fetch'?response instanceof w.Response:response instanceof Response,captions:body.captions.keep,method:body.observedMethod,bodyUsed:response.bodyUsed});
  }
  const unrelated=await(await w.fetch(location.origin+'/youtubei/v1/next')).json();
  const external=await(await w.fetch('https://example.com/youtubei/v1/player')).json();
  const controller=new w.AbortController();controller.abort();let abort;
  try{await w.fetch(url,{signal:controller.signal});}catch(e){abort=e.name;}
  return{rows,unrelatedSlots:unrelated.adSlots.length,externalSlots:external.adSlots.length,abort};
 });
 for(const r of transport.rows){check(r.name+' filters all readers and preserves Response realm',r.slots===0&&r.textSlots===0&&r.streamSlots===0&&r.realm&&r.captions&&r.bodyUsed);if(r.name==='top-cross-realm-request')check('cross-realm Request retains POST',r.method==='POST');}
 check('frame unrelated endpoint untouched',transport.unrelatedSlots===1);check('foreign origin player path untouched',transport.externalSlots===1);check('frame abort preserves AbortError',transport.abort==='AbortError');
 const insertion=await page.evaluate(async()=>{
  const rows=[];for(const method of ['appendChild','insertBefore','replaceChild','append','prepend','replaceChildren','before','after','replaceWith','fragment','innerHTML','outerHTML','insertAdjacentHTML','insertAdjacentElement']){
   const box=document.createElement('section'),anchor=document.createElement('span');box.appendChild(anchor);document.body.appendChild(box);const index=window.frames.length;let frame=document.createElement('iframe');
   if(method==='appendChild')box.appendChild(frame);else if(method==='insertBefore')box.insertBefore(frame,anchor);else if(method==='replaceChild')box.replaceChild(frame,anchor);else if(['append','prepend','replaceChildren'].includes(method))box[method](frame);else if(['before','after','replaceWith'].includes(method))anchor[method](frame);else if(method==='fragment'){const fragment=document.createDocumentFragment();fragment.appendChild(frame);box.appendChild(fragment);}else if(method==='innerHTML')box.innerHTML='<iframe></iframe>';else if(method==='outerHTML')anchor.outerHTML='<iframe></iframe>';else if(method==='insertAdjacentHTML')anchor.insertAdjacentHTML('afterend','<iframe></iframe>');else box.insertAdjacentElement('beforeend',frame);
   const w=window.frames[index];const body=await(await w.fetch(location.origin+'/youtubei/v1/player')).json();rows.push({method,slots:body.adSlots.length});box.remove();
  }return rows;
 });for(const row of insertion)check('synchronous window.frames via '+row.method,row.slots===0);
 check('contentDocument defaultView path filtered',await page.evaluate(async()=>{const frame=document.createElement('iframe');document.body.appendChild(frame);const body=await(await frame.contentDocument.defaultView.fetch(location.origin+'/youtubei/v1/player')).json();frame.remove();return body.adSlots.length===0;}));
 check('nested blank realm filtered',await page.evaluate(async()=>{const first=document.createElement('iframe');document.body.appendChild(first);const w=first.contentWindow,second=w.document.createElement('iframe');w.document.body.appendChild(second);const child=second.contentWindow,body=await(await child.fetch(location.origin+'/youtubei/v1/player')).json();first.remove();return body.adSlots.length===0;}));
 check('sandbox same-origin blank frame filtered',await page.evaluate(async()=>{const frame=document.createElement('iframe');frame.sandbox='allow-same-origin';document.body.appendChild(frame);const body=await(await frame.contentWindow.fetch(location.origin+'/youtubei/v1/player')).json();frame.remove();return body.adSlots.length===0;}));
 report.detached=await page.evaluate(async()=>{const frame=window.contractDetachedFrame,run=frame.contentWindow.fetch.bind(window),native=window.contractNative.detachedFetch,FrameResponse=frame.contentWindow.Response;frame.remove();const attempt=async fn=>{try{return await Promise.race([(async()=>{const response=await fn(location.origin+'/youtubei/v1/player');return{error:null,rootResponse:response instanceof Response,frameResponse:response instanceof FrameResponse,slots:(await response.json()).adSlots.length};})(),new Promise(resolve=>setTimeout(()=>resolve({error:'timeout'}),2500))]);}catch(e){return {error:e.name,message:e.message,stack:e.stack?.split('\n').slice(0,4)};}};const [before,after]=await Promise.all([attempt(native),attempt(run)]);return{before,after};});
 check('parent-bound captured iframe fetch filters after factory removal',report.detached.before.error===null&&report.detached.before.slots===1&&report.detached.after.error===null&&report.detached.after.slots===0);
 check('navigation rearms stored WindowProxy before onload consumer',await page.evaluate(async()=>{const frame=window.contractFrame,w=frame.contentWindow;await new Promise(resolve=>{frame.onload=resolve;frame.src='about:blank?next-generation';});return(await(await w.fetch(location.origin+'/youtubei/v1/player')).json()).adSlots.length===0;}));
 check('srcdoc navigation rearms stored WindowProxy before onload consumer',await page.evaluate(async()=>{const frame=document.createElement('iframe');document.body.appendChild(frame);const w=frame.contentWindow;frame.srcdoc='<p>Blank srcdoc fixture</p>';await new Promise(resolve=>frame.onload=resolve);const body=await(await w.fetch(location.origin+'/youtubei/v1/player')).json();frame.remove();return body.adSlots.length===0;}));
 check('ordinary same-origin HTTPS frame untouched after navigation',await page.evaluate(async()=>{const frame=document.createElement('iframe');document.body.appendChild(frame);const w=frame.contentWindow;await new Promise(resolve=>{frame.onload=resolve;frame.src=location.origin+'/normal-frame';});const body=await(await w.fetch(location.origin+'/youtubei/v1/player')).json();frame.remove();return body.adSlots.length===1;}));
 check('opaque cross-origin frame retains native access errors',await page.evaluate(async()=>{const frame=document.createElement('iframe');const ready=new Promise(resolve=>frame.onload=resolve);frame.src='https://example.com/normal-frame';document.body.appendChild(frame);await ready;let error;try{void frame.contentWindow.document;}catch(e){error=e.name;}const absent=frame.contentDocument===null;frame.remove();return error==='SecurityError'&&absent;}));
 check('native DOM errors and coercions preserved',await page.evaluate(()=>{let invalid=false;try{Node.prototype.appendChild.call({},document.createElement('i'));}catch(e){invalid=e.name==='TypeError';}let calls=0;const box=document.createElement('div');box.append({toString(){calls++;return'ordinary text';}});return invalid&&calls===1&&box.textContent==='ordinary text';}));
 check('warning text remains visible and unchanged',await page.locator('#warning').innerText()==='Bloqueadores de anúncios violam os Termos de Serviço do YouTube');
 const gc=await context.newCDPSession(page);console.log('Collecting old frame generations');await Promise.race([gc.send('HeapProfiler.collectGarbage'),new Promise((_,reject)=>setTimeout(()=>reject(Error('GC observation timed out')),10000))]);await gc.detach();console.log('GC completed');
 await send('SET',{patch:{enabled:false}});await page.waitForFunction(()=>window.fetch===window.contractNative.fetch);
 check('pause restores root DOM/getter descriptors',await page.evaluate(()=>{const n=window.contractNative;return Node.prototype.appendChild===n.append&&Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentWindow').get===n.windowGetter&&Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentDocument').get===n.documentGetter&&Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML').set===n.htmlSetter;}));
 check('pause restores retained old-generation prototype after GC',await page.evaluate(()=>Object.getOwnPropertyDescriptor(window.contractNative.childPrototype,'contentWindow').get===window.contractNative.childWindowGetter));
 check('captured iframe alias respects pause',await page.evaluate(async()=>(await(await window.contractCapturedFetch(location.origin+'/youtubei/v1/player')).json()).adSlots.length===1));
 await send('SET',{patch:{enabled:true}});await page.waitForFunction(()=>window.fetch!==window.contractNative.fetch);
 check('captured iframe alias resumes after re-enable',await page.evaluate(async()=>(await(await window.contractCapturedFetch(location.origin+'/youtubei/v1/player')).json()).adSlots.length===0));
 await send('TOGGLE_SITE',{domain:'youtube.com'});await page.waitForFunction(()=>window.fetch===window.contractNative.fetch);
 check('allowlist disables captured iframe alias',await page.evaluate(async()=>(await(await window.contractCapturedFetch(location.origin+'/youtubei/v1/player')).json()).adSlots.length===1));
 await send('TOGGLE_SITE',{domain:'youtube.com'});await page.waitForFunction(()=>window.fetch!==window.contractNative.fetch);
 check('reenable after allowlist filters new frames',await page.evaluate(async()=>{const f=document.createElement('iframe');document.body.appendChild(f);const body=await(await f.contentWindow.fetch(location.origin+'/youtubei/v1/player')).json();f.remove();return body.adSlots.length===0;}));
 await page.evaluate(()=>{const f=document.createElement('iframe');document.body.appendChild(f);const w=f.contentWindow;window.foreignFrame=f;window.foreignFetch=w.fetch.bind(w);w.fetch=window.foreignFetch;});
 await send('SET',{patch:{enabled:false}});await page.waitForFunction(()=>window.fetch===window.contractNative.fetch);
 check('pause preserves later third-party frame fetch replacement',await page.evaluate(()=>window.foreignFrame.contentWindow.fetch===window.foreignFetch));
 check('no uncaught page errors',errors.length===0);
}catch(e){report.failure={name:e.name,message:e.message.split('\n')[0]};process.exitCode=1;}
finally{report.finished=new Date().toISOString();report.passed=checks.length;report.results=checks;report.errors=errors;await fs.writeFile(path.join(out,'frame-contracts.json'),JSON.stringify(report,null,2));if(context)await closeNative(context);}
console.log(JSON.stringify(report,null,2));
