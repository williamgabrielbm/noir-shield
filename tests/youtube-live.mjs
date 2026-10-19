// Opt-in real network observation; never uses the personal browser profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),work=path.join(root,'work');
await fs.mkdir(work,{recursive:true});
const profile=await fs.mkdtemp(path.join(work,'live-profile-'));
const extension=path.join(root,'dist');
const context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--autoplay-policy=no-user-gesture-required']});
const report={date:new Date().toISOString(),browser:context.browser().version(),samples:[]};
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const options=await context.newPage();await options.goto(`chrome-extension://${new URL(worker.url()).hostname}/options.html`);
 for(const enabled of [false,true]){
  await options.evaluate(async enabled=>{const result=await chrome.runtime.sendMessage({type:'SET',patch:{enabled}});if(!result.ok)throw Error(result.error);},enabled);
  const page=await context.newPage();const requests=new Map(),failures=new Map(),errors=[];
  page.on('request',r=>{const u=new URL(r.url());if(/youtube|doubleclick|googlevideo/.test(u.hostname)){const value={host:u.hostname,path:u.pathname,type:r.resourceType()};requests.set(JSON.stringify(value),value);}});
  page.on('requestfailed',r=>{const u=new URL(r.url());failures.set(u.hostname+u.pathname,{host:u.hostname,path:u.pathname,error:r.failure()?.errorText});});
  page.on('pageerror',e=>errors.push(e.message));
  const sample={enabled,snapshots:[],errors};
  try{
   await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForSelector('video',{timeout:20000});
   await page.evaluate(()=>{const video=document.querySelector('video');video.muted=true;return video.play().catch(()=>{});});
   for(let i=0;i<8;i++){
    await page.waitForTimeout(1000);
    sample.snapshots.push(await page.evaluate(()=>{const v=document.querySelector('video'),r=window.ytInitialPlayerResponse;return {time:v?.currentTime,paused:v?.paused,readyState:v?.readyState,error:v?.error?.code||null,ad:document.querySelector('#movie_player')?.classList.contains('ad-showing'),status:r?.playabilityStatus?.status,adKeys:['adPlacements','playerAds','adSlots'].filter(k=>Array.isArray(r?.[k])&&r[k].length)};}));
   }
  }catch(e){sample.failure=e.message;}
  sample.requests=[...requests.values()];sample.networkFailures=[...failures.values()];
  sample.dnr=await options.evaluate(async()=>{const tab=(await chrome.tabs.query({})).find(t=>t.url?.includes('youtube.com/watch'));return tab?(await chrome.declarativeNetRequest.getMatchedRules({tabId:tab.id})).rulesMatchedInfo.map(x=>x.rule):[];});
  report.samples.push(sample);await page.close();
 }
 await fs.writeFile(path.join(work,'youtube-live.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({browser:report.browser,samples:report.samples.map(({enabled,snapshots,dnr,errors,failure})=>({enabled,snapshots,matchedRules:dnr.length,errors,failure}))},null,2));
}finally{await context.close();}
