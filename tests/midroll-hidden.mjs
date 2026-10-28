// JavaScript, file: tests/midroll-hidden.mjs, target: real YouTube, isolated hidden browser with audio disabled.
import fs from 'node:fs/promises';import path from 'node:path';import {nativeBrowser,noirWorker,closeNative} from './native-browser.mjs';
import {installedChrome} from './chrome-installed.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'work',process.env.NOIR_LABEL||'midroll-hidden');await fs.mkdir(out,{recursive:true});
const protect=process.env.NOIR_CONTROL!=='1',mode=process.env.NOIR_ENTRY||'playlist',target=process.env.NOIR_VIDEO||'9vKqVkMQHKk';
const seconds=Number(process.env.NOIR_SECONDS||1100),report={started:new Date().toISOString(),headless:true,muted:true,protect,mode,target,network:[],snapshots:[],adEpisodes:[],validated:false};let c,interrupted=false;process.on('SIGINT',()=>interrupted=true);const jobs=new Set();
function short(r){if(!r||typeof r!=='object')return null;return {videoId:r.videoDetails?.videoId,status:r.playabilityStatus?.status,streamingData:!!r.streamingData,serverAbr:typeof r.streamingData?.serverAbrStreamingUrl==='string',formats:r.streamingData?.formats?.length??0,adaptiveFormats:r.streamingData?.adaptiveFormats?.length??0,adArrays:['adPlacements','playerAds','adSlots'].map(k=>({key:k,count:Array.isArray(r[k])?r[k].length:null})),placements:r.adPlacements?.map(x=>{const cfg=x.adPlacementRenderer?.config?.adPlacementConfig;return {kind:/^[A-Z_]+$/.test(cfg?.kind||'')?cfg.kind:null,offsetMilliseconds:/^\d+$/.test(cfg?.adTimeOffset?.offsetStartMilliseconds||'')?Number(cfg.adTimeOffset.offsetStartMilliseconds):null};})};}
try{
 const profile=await fs.mkdtemp(path.join(out,'profile-'));
 const extension=process.env.NOIR_EXTENSION_DIR||path.join(root,'dist');
 c=process.env.NOIR_INSTALLED_CHROME==='1'?await installedChrome(profile,extension,protect):await nativeBrowser(profile,extension,protect,process.env.NOIR_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
 if(c.chromeTestMetadata){report.installedChrome=c.chromeTestMetadata;report.headless=c.chromeTestMetadata.headless;report.hiddenFromUserDesktop=c.chromeTestMetadata.headless||c.chromeTestMetadata.privateDesktop;}report.browser=c.browser().version();if(protect){await noirWorker(c);report.noirConfirmed=true;}
 const mute=()=>{const enforce=()=>{for(const v of document.querySelectorAll('video,audio')){if(!v.muted)v.muted=true;if(v.volume!==0)v.volume=0;}};enforce();new MutationObserver(enforce).observe(document,{childList:true,subtree:true});document.addEventListener('volumechange',enforce,true);};
 await c.addInitScript(mute);
 const p=await c.newPage();
 if(process.env.NOIR_DIAGNOSTICS==='1'){
  report.media={errors:[],events:[],properties:[]};const media=await c.newCDPSession(p);await media.send('Media.enable');
  media.on('Media.playerErrorsRaised',e=>{for(const x of e.errors)report.media.errors.push({errorType:x.errorType,code:x.code,hasCause:!!x.cause?.length});});
  media.on('Media.playerEventsAdded',e=>{for(const x of e.events){try{const v=JSON.parse(x.value);const filtered={};for(const k of ['event','pipeline_state','pipeline_error','error','status'])if(typeof v[k]==='string'&&!/https?:|[A-Za-z0-9_-]{50}/.test(v[k]))filtered[k]=v[k];if(Object.keys(filtered).length)report.media.events.push(filtered);}catch{}}});
  media.on('Media.playerPropertiesChanged',e=>{for(const x of e.properties)if(['kVideoDecoderName','kAudioDecoderName','kIsPlatformVideoDecoder','kIsPlatformAudioDecoder','kRendererName','kResolution'].includes(x.name))report.media.properties.push(x);});
 }
 p.on('response',res=>{const u=new URL(res.url());if(!['/youtubei/v1/get_watch','/youtubei/v1/player'].includes(u.pathname))return;const job=(async()=>{const item={at:new Date().toISOString(),endpoint:u.pathname,http:res.status()};report.network.push(item);try{const v=await res.json();item.players=Array.isArray(v)?v.map(x=>short(x.playerResponse)).filter(Boolean):[short(v.playerResponse||v)];}catch{item.decodeFailed=true;}})();jobs.add(job);job.finally(()=>jobs.delete(job));});
 p.on('pageerror',()=>report.pageErrorCount=(report.pageErrorCount||0)+1);
 p.on('requestfailed',r=>{if((report.failures?.length||0)>=100)return;const u=new URL(r.url());(report.failures??=[]).push({host:u.hostname,path:u.pathname==='/videoplayback'?u.pathname:u.pathname.startsWith('/youtubei/v1/')?u.pathname:'[omitted]',error:r.failure()?.errorText});});
 if(mode==='playlist'){
  await p.goto('https://www.youtube.com/watch?v=WUvTyaaNkzM&list=PLZHQObOWTQDMsr9K-rj53DwVRMYO3t5Yr',{waitUntil:'domcontentloaded',timeout:45000});
  await p.waitForSelector('video');await p.evaluate(()=>{const v=document.querySelector('video');v.muted=true;v.play().catch(()=>{});});await p.waitForTimeout(8000);
  await p.locator('.ytp-next-button').first().click();
 }else if(mode==='search'){
  await p.goto('https://www.youtube.com/results?search_query='+encodeURIComponent(process.env.NOIR_QUERY||'$456,000 Squid Game In Real Life MrBeast'),{waitUntil:'domcontentloaded',timeout:45000});
  const a=p.locator('a[href^="/watch?v='+target+'"]').filter({visible:true}).first();await a.click({timeout:20000});
 }else await p.goto('https://www.youtube.com/watch?v='+target,{waitUntil:'domcontentloaded',timeout:45000});
 await p.waitForSelector('video');await p.evaluate(()=>{const v=document.querySelector('video');v.muted=true;v.play().catch(()=>{});});
 if(process.env.NOIR_DIAGNOSTICS==='1')report.environment=await p.evaluate(()=>({webdriver:navigator.webdriver,headlessUserAgent:navigator.userAgent.includes('HeadlessChrome'),visibility:document.visibilityState,focus:document.hasFocus()}));
 const start=Date.now();let last,lastProgress=Date.now(),content=0,lastContentTime=0,inAd=false;let episode;
 while(!interrupted && Date.now()-start<seconds*1000){
  await p.waitForTimeout(1000);
  const s=await p.evaluate(()=>{const player=document.querySelector('#movie_player'),v=player?.querySelector('video'),r=player?.getPlayerResponse?.();return {muted:v?.muted,volume:v?.volume,time:v?.currentTime,paused:v?.paused,ready:v?.readyState,rate:v?.playbackRate,duration:Number.isFinite(v?.duration)?v.duration:null,videoId:r?.videoDetails?.videoId,status:r?.playabilityStatus?.status,ad:player?.classList.contains('ad-showing')===true||player?.classList.contains('ad-interrupting')===true,error:!!document.querySelector('.ytp-error'),mediaError:v?.error?.code||null,hook:!!Object.getOwnPropertyDescriptor(window,'ytInitialPlayerResponse')?.get,adCounts:['adPlacements','playerAds','adSlots'].map(k=>r?.[k]?.length??null),anti:/ad blockers? violate|ad blockers? are not allowed|bloqueadores de an[uú]ncios.*(permitidos|termos)/i.test(document.body.innerText)};});s.elapsed=(Date.now()-start)/1000;s.at=new Date().toISOString();report.snapshots.push(s);
  if(s.videoId&&s.videoId!==target){report.stop='unexpected-video';break;}
  if(s.ad&&!inAd){episode={at:s.at,elapsed:s.elapsed,type:content>=60?'mid-roll':'pre-roll',priorContentSeconds:content,priorContentTime:lastContentTime,target:s.videoId};report.adEpisodes.push(episode);await p.screenshot({path:path.join(out,'ad-'+report.adEpisodes.length+'.png')});}
  if(!s.ad&&inAd){episode.endedAt=s.at;episode.resumedTime=s.time;episode.resumedVideoId=s.videoId;episode.resumed=false;}
  if(last&&!last.ad&&!s.ad&&!s.paused&&s.rate===1&&s.videoId===last.videoId){const delta=s.time-last.time;if(delta>0&&delta<3){content+=delta;lastContentTime=s.time;lastProgress=Date.now();if(episode?.endedAt&&s.videoId===target&&s.time>episode.resumedTime+5)episode.resumed=true;}}
  if(!protect&&s.ad){const buttons=p.locator('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');for(const button of await buttons.all()){if(await button.isVisible()&&await button.isEnabled()){await button.click();report.nativeSkips=(report.nativeSkips||0)+1;break;}}}
  inAd=s.ad;last=s;report.contentSeconds=content;
  if(report.snapshots.length%15===0){await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({label:process.env.NOIR_LABEL,elapsed:Math.round(s.elapsed),content:Math.round(content),time:s.time,ad:s.ad,error:s.error,episodes:report.adEpisodes.map(x=>x.type)}));}
  if((s.error||s.mediaError)&&s.elapsed>45){report.stop='player-error';break;}
  if(!s.ad&&Date.now()-lastProgress>65000){report.stop='no-progress';break;}
  if(protect&&Number(process.env.NOIR_CONTENT_TARGET||0)>0&&content>=Number(process.env.NOIR_CONTENT_TARGET)){report.contentTargetMet=true;break;}
  if(report.adEpisodes.some(x=>x.type==='mid-roll'&&x.resumed)){report.actualMidrollWithResume=true;break;}
 }
 await Promise.allSettled([...jobs]);await p.screenshot({path:path.join(out,'final.png')});if(interrupted)report.stop='interrupted';
}catch(e){report.failure={name:e.name,message:e.message.split('\n')[0].replace(/https?:\/\/\S+/g,'[URL omitted]')};}
finally{report.finished=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(c)await closeNative(c);}
console.log(JSON.stringify({label:process.env.NOIR_LABEL,content:report.contentSeconds,actualMidroll:report.actualMidrollWithResume,stop:report.stop,failure:report.failure}));
