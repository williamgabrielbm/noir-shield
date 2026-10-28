// JavaScript ES2022, file: youtube-probe-e2e.mjs, target: Chromium/Edge with extension loaded.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),work=path.join(root,'work');
await fs.mkdir(work,{recursive:true});
const profile=await fs.mkdtemp(path.join(work,'probe-test-'));
const edge=process.env.NOIR_BROWSER==='edge';
const options={headless:true,...(edge?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{channel:'chromium'}),args:[`--disable-extensions-except=${path.join(root,'dist')}`,`--load-extension=${path.join(root,'dist')}`]};
const context=await chromium.launchPersistentContext(profile,options);
try{
 const sw=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const page=await context.newPage();await page.goto(`chrome-extension://${new URL(sw.url()).hostname}/youtube-lab.html`);
 const probe=async()=>page.evaluate(async()=>{
  const samples=[
   {url:'https://googleads.g.doubleclick.net/pagead/id',initiator:'https://www.youtube.com',type:'xmlhttprequest'},
   {url:'https://static.doubleclick.net/instream/ad_status.js',initiator:'https://www.youtube.com',type:'script'}
  ];
  return Promise.all(samples.map(s=>chrome.declarativeNetRequest.testMatchOutcome(s).then(x=>x.matchedRules)));
 });
 const set=async probes=>page.evaluate(async probes=>{
  const r=await chrome.runtime.sendMessage({type:'SET',patch:{enabled:true,youtube:true,youtubeLab:{network:true,player:true,skip:false,cosmetics:true,probes}}});
  if(!r.ok)throw Error(r.error);
 },probes);
 await set(true);
 const positive=await probe();
 assert.ok(positive[0].some(x=>x.ruleId===850110&&x.rulesetId==='_dynamic'),'pagead/id must be allowed by a narrow dynamic rule');
 assert.ok(positive[1].some(x=>x.ruleId===850111&&x.rulesetId==='_dynamic'),'ad_status.js must be allowed by a narrow dynamic rule');
 const media=await page.evaluate(()=>chrome.declarativeNetRequest.testMatchOutcome({url:'https://r1---sn-a5mekn7s.googlevideo.com/videoplayback',initiator:'https://www.youtube.com',type:'media'}));
 assert.ok(!media.matchedRules.some(x=>x.ruleId===850110||x.ruleId===850111),'allow rule must not touch video media');
 await set(false);
 const negative=await probe();
 assert.ok(!negative.flat().some(x=>x.ruleId===850110||x.ruleId===850111),'probe overrides must be removable');
 await page.evaluate(async()=>chrome.runtime.sendMessage({type:'SET',patch:{youtube:false}}));
 const disabled=await probe();assert.ok(disabled.flat().every(x=>x.rulesetId==='_dynamic'&&x.ruleId===850101),'module off must override all lists');
 const other=await page.evaluate(()=>chrome.declarativeNetRequest.testMatchOutcome({url:'https://googleads.g.doubleclick.net/pagead/id',initiator:'https://example.org',type:'xmlhttprequest'}));
 assert.ok(other.matchedRules.some(x=>x.rulesetId!=='_dynamic'),'other sites must remain protected');
 console.log(JSON.stringify({ok:true,checks:6,browser:context.browser().version(),scope:'DNR matching only; does not prove real YouTube anti-adblock avoidance.'},null,2));
}finally{await context.close();}
