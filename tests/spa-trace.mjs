// JavaScript, file: tests/spa-trace.mjs, target: isolated Edge, real-network schema-only SPA diagnosis.
import fs from 'node:fs/promises';import path from 'node:path';import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'work',process.env.NOIR_TRACE_LABEL||'spa-trace');await fs.mkdir(out,{recursive:true});
const profile=await fs.mkdtemp(path.join(out,'profile-')),ext=path.resolve(process.env.NOIR_EXTENSION_DIR||path.join(root,'dist'));
const protectedMode=process.env.NOIR_CONTROL!=='1';
const report={started:new Date().toISOString(),protectedMode,network:[],snapshots:[],validated:false};
function schema(v,depth=0,p='$',found=[]){if(!v||typeof v!=='object'||depth>9)return found;for(const [k,x] of Object.entries(v)){
 if(['adPlacements','playerAds','adSlots'].includes(k)&&Array.isArray(x))found.push({path:p+'.'+k,length:x.length,renderers:x.slice(0,3).map(e=>Object.keys(e||{}))});
 if(k==='videoDetails')found.push({path:p+'.videoDetails',videoId:x?.videoId,live:x?.isLiveContent===true});
 if(k==='playabilityStatus')found.push({path:p+'.playabilityStatus',status:x?.status});
 if(typeof x==='object'&&x!==null)schema(x,depth+1,p+'.'+k,found);
 }return found;}
const pending=new Set();let context;
try{
 context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.NOIR_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:[...(protectedMode?[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]:[]),'--autoplay-policy=no-user-gesture-required']});report.browser=context.browser().version();
 if(protectedMode){const w=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');report.workerLoaded=true;}
 const page=await context.newPage();
 page.on('response',res=>{const u=new URL(res.url());if(u.hostname!=='www.youtube.com'||!u.pathname.startsWith('/youtubei/v1/'))return;
 const job=(async()=>{const row={endpoint:u.pathname,status:res.status(),transport:res.request().resourceType()};report.network.push(row);try{const data=await res.json();row.schema=schema(data);row.keys=Object.keys(data).slice(0,25);}catch{row.decodeFailed=true;}})();pending.add(job);job.finally(()=>pending.delete(job));});
 async function sample(stage,seconds){for(let i=0;i<seconds*2;i++){await page.waitForTimeout(500);const s=await page.evaluate(()=>{const p=document.querySelector('#movie_player'),v=p?.querySelector('video');function short(r){return r?{videoId:r.videoDetails?.videoId,status:r.playabilityStatus?.status,adArrays:['adPlacements','playerAds','adSlots'].map(k=>({key:k,count:r[k]?.length,renderers:Array.isArray(r[k])?r[k].slice(0,2).map(e=>Object.keys(e)):[]}))}:null;}return {videoId:new URL(location.href).searchParams.get('v'),time:v?.currentTime,ready:v?.readyState,paused:v?.paused,ad:p?.classList.contains('ad-showing'),player:short(p?.getPlayerResponse?.()),initial:short(window.ytInitialPlayerResponse),nativeFetch:String(window.fetch).includes('[native code]'),hookInstalled:!!Object.getOwnPropertyDescriptor(window,'ytInitialPlayerResponse')?.get,errorScreen:!!document.querySelector('.ytp-error'),anti:/ad blockers? violate|ad blockers? are not allowed|bloqueadores de an[uú]ncios.*(permitidos|termos)/i.test(document.body.innerText)};});report.snapshots.push({stage,second:i/2,...s});if(s.ad && !report.adScreenshot){await page.screenshot({path:path.join(out,'ad-observed.png')});report.adScreenshot=true;}}
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({stage,last:report.snapshots.at(-1),endpoints:report.network.map(x=>({endpoint:x.endpoint,schema:x.schema}))}));}
 await page.goto('https://www.youtube.com/watch?v=aqz-KE-bpKQ',{waitUntil:'domcontentloaded'});await page.waitForSelector('video');await page.evaluate(()=>{const v=document.querySelector('video');v.muted=true;v.play().catch(()=>{});});await sample('initial',5);
 const visited=new Set(['aqz-KE-bpKQ']);report.targets=[];
 for(let step=1;step<=Number(process.env.NOIR_SPA_STEPS||1);step++){
  const links=page.locator('a[href^="/watch?v="]');let link,target;
  for(const c of await links.all()){
   const href=await c.getAttribute('href');const video=new URL(href,'https://www.youtube.com').searchParams.get('v');
   if(video&&!visited.has(video)&&await c.isVisible()){link=c;target=video;break;}
  }
  if(!link)throw Error('No unvisited visible related link');
  visited.add(target);report.targets.push(target);report.targetVideo??=target;
  await link.click();await sample('spa-'+step,Number(process.env.NOIR_TRACE_SECONDS||30));
 }

 await Promise.allSettled([...pending]);await page.screenshot({path:path.join(out,'final.png')});
}finally{await context?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
