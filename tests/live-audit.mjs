// JavaScript, real YouTube observation, isolated browser profiles. No credentials or raw responses recorded.
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'work',process.env.NOIR_RUN_LABEL||'live');await fs.mkdir(out,{recursive:true});
const executablePath=process.env.NOIR_EXECUTABLE|| (process.env.NOIR_BROWSER==='chrome'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
const report={started:new Date().toISOString(),browserPath:executablePath,scope:'Real network; no route/fulfill/mock. Fresh anonymous profiles, no personal account.',samples:[],validated:false};
const ids=(process.env.NOIR_VIDEOS||'dQw4w9WgXcQ,9bZkp7q19f0,aqz-KE-bpKQ').split(',');
for(const protectedMode of (process.env.NOIR_ONLY_PROTECTED==='1'?[true]:[false,true])){
 let context;
 const sample={protectedMode,snapshots:[],failures:[],consoleErrors:0,pageErrors:0,advertisementObserved:false,antiAdblockObserved:false};report.samples.push(sample);
 try{
  const profile=await fs.mkdtemp(path.join(out,'profile-'));
  const ext=path.resolve(process.env.NOIR_EXTENSION_DIR||path.join(root,'dist'));
  context=await chromium.launchPersistentContext(profile,{headless:process.env.NOIR_HEADED!=='1',executablePath,args:[...(protectedMode?[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]:[]),'--autoplay-policy=no-user-gesture-required'],timeout:30000});
  report.browser=context.browser().version();
  let options;
  if(protectedMode){
   const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
   options=await context.newPage();await options.goto(`chrome-extension://${new URL(worker.url()).hostname}/options.html`);
   sample.settings=await options.evaluate(async()=>{const r=await chrome.runtime.sendMessage({type:'SETTINGS'});return {enabled:r.data.enabled,youtube:r.data.youtube,youtubeLab:r.data.youtubeLab};});
  }
  const page=await context.newPage();
  sample.wirePlayer=[];
  page.on('response',async response=>{
   try{const u=new URL(response.url());if(u.hostname!=='www.youtube.com'||!['/watch','/youtubei/v1/player'].includes(u.pathname))return;
    let r;if(u.pathname==='/watch'){
     const html=await response.text();const match=html.match(/(?:var |window\.)?ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);if(!match)return;r=JSON.parse(match[1]);
    }else r=await response.json();sample.wirePlayer.push({source:u.pathname,videoId:r.videoDetails?.videoId,status:r.playabilityStatus?.status,adArrays:['adPlacements','playerAds','adSlots'].filter(k=>Array.isArray(r[k])&&r[k].length>0)});
   }catch{}
  });
  page.on('console',m=>{if(m.type()==='error')sample.consoleErrors++;});page.on('pageerror',()=>sample.pageErrors++);
  page.on('requestfailed',r=>{const u=new URL(r.url());if(sample.failures.length<100)sample.failures.push({host:u.hostname,path:/^\/(watch|youtubei\/v1\/player|pagead\/id|instream\/ad_status.js|videoplayback)$/.test(u.pathname)?u.pathname:'[other path omitted]',error:r.failure()?.errorText});});
  for(const id of ids){
   try{
    await page.goto('https://www.youtube.com/watch?v='+id,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForSelector('video',{timeout:20000});
    await page.evaluate(()=>{const v=document.querySelector('video');v.muted=true;v.play().catch(()=>{});});
    for(let i=0;i<Number(process.env.NOIR_SECONDS||20);i++){
     await page.waitForTimeout(1000);
     const snap=await page.evaluate(()=>{const p=document.querySelector('#movie_player'),v=p?.querySelector('video'),r=window.ytInitialPlayerResponse;return {time:v?.currentTime,paused:v?.paused,readyState:v?.readyState,error:v?.error?.code||null,ad:p?.classList.contains('ad-showing')===true,status:r?.playabilityStatus?.status,adArrays:['adPlacements','playerAds','adSlots'].filter(k=>r?.[k]?.length>0),antiAdblock:/ad blockers? violate|ad blockers? are not allowed|bloqueadores de an[uú]ncios.*(permitidos|termos)|bloqueador de an[uú]ncios.*(permitido|termos)/i.test(document.body.innerText),errorScreen:!!document.querySelector('.ytp-error'),errorCategory:(()=>{const t=document.querySelector('.ytp-error')?.textContent||'';return /ad.block|bloqueador/i.test(t)?'adblock':/erro|error/i.test(t)?'playback-error':t?'other':null;})()};});
     sample.snapshots.push({videoId:id,at:new Date().toISOString(),...snap});if(i%30===0){await fs.writeFile(path.join(out,`report-${process.env.NOIR_BROWSER||'edge'}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify({protectedMode,videoId:id,second:i,time:snap.time,ad:snap.ad,anti:snap.antiAdblock}));}sample.advertisementObserved ||= snap.ad;sample.antiAdblockObserved ||= snap.antiAdblock;if(snap.errorScreen && i>45){sample.stoppedForPlayerError=true;break;}
    }
    await page.screenshot({path:path.join(out,`${protectedMode?'protected':'control'}-${id}.png`)});
   }catch(e){sample.failures.push({videoId:id,errorName:e.name,reason:String(e.message).split('\n')[0].replace(/https?:\/\/\S+/g,'[URL omitted]')});}
  }
  if(options)sample.dnr=await options.evaluate(async()=>{const tabs=await chrome.tabs.query({url:'https://www.youtube.com/*'});const matches=[];for(const t of tabs)matches.push(...(await chrome.declarativeNetRequest.getMatchedRules({tabId:t.id})).rulesMatchedInfo.map(x=>x.rule));return matches;});
 }catch(e){sample.launchFailure={name:e.name,reason:String(e.message).split('\n')[0]};}
 finally{await context?.close();await fs.writeFile(path.join(out,`report-${process.env.NOIR_BROWSER||'edge'}.json`),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({protectedMode,browser:report.browser,observations:sample.snapshots.length,ads:sample.advertisementObserved,antiAdblock:sample.antiAdblockObserved,failure:sample.launchFailure,failures:sample.failures.slice(-3)}));
}
