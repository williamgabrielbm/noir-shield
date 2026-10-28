// JavaScript, file: tests/long-session.mjs, target: isolated Edge real YouTube, no mocks or seeks.
import fs from 'node:fs/promises';import path from 'node:path';import {chromium} from 'playwright';import {nativeBrowser,noirWorker} from './native-browser.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'work',process.env.NOIR_LABEL||'long-session');await fs.mkdir(out,{recursive:true});
const protect=process.env.NOIR_CONTROL!=='1',videoId=process.env.NOIR_VIDEO||'rfscVS0vtbw',seconds=Number(process.env.NOIR_PLAY_SECONDS||900);
const report={started:new Date().toISOString(),protect,videoId,targetContentSeconds:seconds,playedSeconds:0,longestContinuousSeconds:0,midrollObserved:false,advertisementObserved:false,snapshots:[],networkFailures:[],responses:[],consoleErrorCount:0,pageErrorCount:0,validated:false};
let context;let continuous=0;let interrupted=false;process.on('SIGINT',()=>{interrupted=true;});
try{
 const profile=await fs.mkdtemp(path.join(out,'profile-')),ext=path.join(root,'dist');
 if(process.env.NOIR_NATIVE==='1'){
  context=await nativeBrowser(profile,ext,protect,process.env.NOIR_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
  report.launchMode='native headless browser + local CDP; audio disabled';
 }else context=await chromium.launchPersistentContext(profile,{headless:process.env.NOIR_HEADED!=='1',executablePath:process.env.NOIR_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:[...(protect?[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]:[]),'--autoplay-policy=no-user-gesture-required']});report.browser=context.browser().version();
 if(protect){await noirWorker(context);report.noirWorkerConfirmed=true;}
 const page=await context.newPage();
 page.on('console',m=>{if(m.type()==='error')report.consoleErrorCount++;});page.on('pageerror',()=>report.pageErrorCount++);
 page.on('requestfailed',r=>{const u=new URL(r.url());if(report.networkFailures.length<300)report.networkFailures.push({at:new Date().toISOString(),host:u.hostname,path:u.pathname==='/videoplayback'?u.pathname:u.pathname.startsWith('/youtubei/v1/')?u.pathname:'[omitted]',error:r.failure()?.errorText});});
 page.on('response',async r=>{const u=new URL(r.url());if(u.pathname==='/videoplayback'){if(report.responses.length<500)report.responses.push({at:new Date().toISOString(),host:u.hostname,status:r.status()});}});
 await page.goto('https://www.youtube.com/watch?v='+videoId+(process.env.NOIR_PLAYLIST_NEXT==='1'?'&list=PLZHQObOWTQDMsr9K-rj53DwVRMYO3t5Yr':''),{waitUntil:'domcontentloaded',timeout:45000});await page.waitForSelector('video',{timeout:20000});if(process.env.NOIR_PLAYLIST_NEXT==='1'){
 await page.waitForTimeout(10000);const next=page.locator('.ytp-next-button').first();if(!await next.isVisible())throw Error('playlist next unavailable');await next.click();await page.waitForTimeout(3000);report.actualVideoId=new URL(page.url()).searchParams.get('v');
 }
 await page.evaluate(()=>{const v=document.querySelector('video');v.muted=true;v.play().catch(()=>{});});
 const start=Date.now();let last;let lastProgress=Date.now();let contentBeforeAd=0;
 while(!interrupted&&Date.now()-start<(seconds+180)*1000){
  await page.waitForTimeout(1000);
  const s=await page.evaluate(()=>{const p=document.querySelector('#movie_player'),v=p?.querySelector('video'),r=p?.getPlayerResponse?.();const msg=document.querySelector('.ytp-error')?.textContent||'';return {hookInstalled:!!Object.getOwnPropertyDescriptor(window,'ytInitialPlayerResponse')?.get,time:v?.currentTime,duration:Number.isFinite(v?.duration)?v.duration:null,paused:v?.paused,ready:v?.readyState,rate:v?.playbackRate,ad:p?.classList.contains('ad-showing')===true,videoId:r?.videoDetails?.videoId,status:r?.playabilityStatus?.status,mediaError:v?.error?.code||null,errorScreen:!!document.querySelector('.ytp-error'),errorCategory:/bloqueador|ad.block/i.test(msg)?'adblock':/erro|error/i.test(msg)?'playback':msg?'other':null,anti:/ad blockers? violate|ad blockers? are not allowed|bloqueadores de an[uú]ncios.*(permitidos|termos)/i.test(document.body.innerText),adArrays:['adPlacements','playerAds','adSlots'].map(k=>({key:k,count:r?.[k]?.length??null}))};});
  s.at=new Date().toISOString();s.elapsedSeconds=(Date.now()-start)/1000;report.snapshots.push(s);
  if(s.ad){report.advertisementObserved=true;if(contentBeforeAd>=60)report.midrollObserved=true;if(!report.adScreenshot){await page.screenshot({path:path.join(out,'ad.png')});report.adScreenshot=true;}}
  if(!protect && s.ad && s.elapsedSeconds>8){
   const skips=page.locator('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
   for(const button of await skips.all()){if(await button.isVisible()&&await button.isEnabled()){await button.click();report.nativeSkips=(report.nativeSkips||0)+1;break;}}
  }
  if(last&&!last.ad&&!s.ad&&last.videoId===s.videoId&&!s.paused&&s.rate===1){const delta=s.time-last.time;if(delta>0&&delta<3){report.playedSeconds+=delta;continuous+=delta;lastProgress=Date.now();contentBeforeAd+=delta;}else if(delta<0)continuous=0;}
  if(s.ad||s.errorScreen||s.mediaError)continuous=0;
  report.longestContinuousSeconds=Math.max(report.longestContinuousSeconds,continuous);last=s;
  if(report.snapshots.length%15===0){await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({protect,videoId,elapsed:s.elapsedSeconds,played:report.playedSeconds,continuous:report.longestContinuousSeconds,ad:s.ad,error:s.errorScreen,midroll:report.midrollObserved}));}
  if(report.longestContinuousSeconds>=seconds){report.durationMet=true;break;}
  if((s.errorScreen||s.mediaError)&&s.elapsedSeconds>45){report.stopped='player-error';break;}
  if(!s.ad && Date.now()-lastProgress>60000){report.stopped='no-content-progress-60s';break;}
 }
 if(interrupted)report.stopped='interrupted-by-operator';
 await page.screenshot({path:path.join(out,'final.png')});
}catch(e){report.failure={name:e.name,message:e.message.split('\n')[0].replace(/https?:\/\/\S+/g,'[URL omitted]')};}
finally{report.finished=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(process.env.NOIR_NATIVE==='1'&&context){try{const session=await context.browser().newBrowserCDPSession();await session.send('Browser.close');}catch{}}else await context?.close();}
console.log(JSON.stringify({protect,played:report.playedSeconds,longest:report.longestContinuousSeconds,midroll:report.midrollObserved,ads:report.advertisementObserved,stop:report.stopped,failure:report.failure}));
