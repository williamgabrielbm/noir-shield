// JavaScript, file: tests/live-navigation.mjs, target: isolated Edge, real YouTube network.
import fs from 'node:fs/promises';import path from 'node:path';import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'work','navigation-live');await fs.mkdir(out,{recursive:true});
const profile=await fs.mkdtemp(path.join(out,'profile-')),ext=path.join(root,'dist');
const launch={headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,'--autoplay-policy=no-user-gesture-required']};
const report={started:new Date().toISOString(),samples:[],validated:false};
let context;
async function observe(page,label){
 const s={label,snapshots:[]};report.samples.push(s);
 try{await page.waitForSelector('video',{timeout:20000});await page.evaluate(()=>{const v=document.querySelector('video');v.muted=true;v.play().catch(()=>{});});
 for(let i=0;i<15;i++){await page.waitForTimeout(1000);s.snapshots.push(await page.evaluate(()=>{const p=document.querySelector('ytd-reel-video-renderer[is-active] #movie_player')||document.querySelector('#movie_player'),v=p?.querySelector('video'),r=window.ytInitialPlayerResponse;return {path:location.pathname,videoId:new URL(location.href).searchParams.get('v'),time:v?.currentTime,ready:v?.readyState,paused:v?.paused,ad:p?.classList.contains('ad-showing'),status:r?.playabilityStatus?.status,error:v?.error?.code,anti:/ad blockers? violate|ad blockers? are not allowed|bloqueadores de an[uú]ncios.*(permitidos|termos)/i.test(document.body.innerText)};}));}
 await page.screenshot({path:path.join(out,label+'.png')});
 }catch(e){s.error={name:e.name,reason:e.message.split('\n')[0].replace(/https?:\/\/\S+/g,'[URL omitted]')};}
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(s));
}
try{
 context=await chromium.launchPersistentContext(profile,launch);report.browser=context.browser().version();
 let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
 const id=new URL(worker.url()).hostname;
 let p=await context.newPage();await p.goto('https://www.youtube.com/watch?v=aqz-KE-bpKQ',{waitUntil:'domcontentloaded'});await observe(p,'watch');
 const links=p.locator('a[href^="/watch?v="]');let link;for(const candidate of await links.all()){if(await candidate.isVisible()){link=candidate;break;}}
 if(link){await link.click();await p.waitForTimeout(2000);await observe(p,'spa-related');}else report.spa='No related-video link found; not exercised';
 await p.reload({waitUntil:'domcontentloaded'});await observe(p,'refresh');
 await p.goto('https://www.youtube.com/shorts/',{waitUntil:'domcontentloaded'});await observe(p,'shorts');
 await p.goto('https://www.youtube.com/playlist?list=PLZHQObOWTQDMsr9K-rj53DwVRMYO3t5Yr',{waitUntil:'domcontentloaded'});
 await p.waitForTimeout(3000);const playlistLink=p.locator('ytd-playlist-video-renderer a[href*="watch?v="]').first();
 if(await playlistLink.count()){await playlistLink.click();await observe(p,'playlist-first');const next=p.locator('ytd-playlist-panel-video-renderer a[href*="watch?v="]').nth(1);if(await next.count()){await next.click();await observe(p,'playlist-next');}}else report.samples.push({label:'playlist',result:'No playable playlist entry found'});
 await p.goto('https://www.youtube.com/watch?v=jKHvbJe9c_Y',{waitUntil:'domcontentloaded'});await observe(p,'live');
 await context.close();context=undefined;
 context=await chromium.launchPersistentContext(profile,launch);
 worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});p=await context.newPage();await p.goto('https://www.youtube.com/watch?v=aqz-KE-bpKQ',{waitUntil:'domcontentloaded'});await observe(p,'restart');
}finally{await context?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
