// Node.js 20+, file: tests/youtube-lab-e2e.mjs, target: Playwright Chromium/Edge with Noir Shield built.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..');
await fs.mkdir(path.join(root,'work'),{recursive:true});
const profile=await fs.mkdtemp(path.join(root,'work','yt-lab-'));
const edge=process.env.NOIR_BROWSER==='edge';
const context=await chromium.launchPersistentContext(profile,{
  headless:true,...(edge?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{channel:'chromium'}),
  args:[`--disable-extensions-except=${path.join(root,'dist')}`,`--load-extension=${path.join(root,'dist')}`]
});
const original={network:true,player:true,skip:true,cosmetics:true,probes:true};
const fixture={videoDetails:{videoId:'fixture'},playabilityStatus:{status:'OK'},streamingData:{formats:[{url:'https://example.com/video'}]},adPlacements:[{adPlacementRenderer:{}}]};
const report=[];
try {
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const options=await context.newPage();
  await options.goto(`chrome-extension://${new URL(worker.url()).hostname}/options.html`);
  async function set(flags){await options.evaluate(async youtubeLab=>{const r=await chrome.runtime.sendMessage({type:'SET',patch:{enabled:true,youtube:true,cosmetics:true,youtubeLab}});if(!r.ok)throw Error(r.error);},flags);}
  await context.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><div id="movie_player"><video></video><button class="ytp-ad-skip-button" onclick="window.skipCount++">Skip</button></div><ytd-display-ad-renderer>Ad</ytd-display-ad-renderer><script>window.skipCount=0;window.ytInitialPlayerResponse=${JSON.stringify(fixture)};</script></body></html>`}));
  const page=await context.newPage();
  async function load(){await page.goto('https://www.youtube.com/watch?v=fixture');await page.waitForTimeout(600);}
  await set(original);await load();
  assert.equal(await page.evaluate(()=>window.ytInitialPlayerResponse.adPlacements.length),0);report.push('Player enabled');
  await page.evaluate(()=>document.querySelector('#movie_player').classList.add('ad-showing'));
  await page.waitForFunction(()=>window.skipCount>0);report.push('Skip enabled');
  assert.equal(await page.locator('#noir-shield-youtube').count(),1);report.push('Dedicated cosmetic enabled');
  await set({network:true,player:false,skip:false,cosmetics:false});await load();
  assert.equal(await page.evaluate(()=>window.ytInitialPlayerResponse.adPlacements.length),1);report.push('Player disabled');
  await page.evaluate(()=>document.querySelector('#movie_player').classList.add('ad-showing'));
  await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>window.skipCount),0);report.push('Skip disabled');
  assert.equal(await page.locator('#noir-shield-youtube').count(),0);report.push('Dedicated cosmetic disabled');
  await set({network:false,player:false,skip:false,cosmetics:false});
  const matched=await options.evaluate(async()=>chrome.declarativeNetRequest.testMatchOutcome({url:'https://googleads.g.doubleclick.net/pagead/id',initiator:'https://www.youtube.com',type:'xmlhttprequest'}));
  assert.ok(matched.matchedRules.some(({ruleId,rulesetId})=>rulesetId==='_dynamic'&&ruleId===850101),JSON.stringify(matched));report.push('Network override enabled');
  await set(original);console.log(JSON.stringify({passed:report.length,checks:report},null,2));
} finally {await context.close();}
