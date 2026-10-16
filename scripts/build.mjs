import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import https from 'node:https';
import {build} from 'esbuild';
import {compileList} from './compiler.mjs';
import {makeIcons} from './icon.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const cache=path.join(root,'.cache');
const refresh=process.argv.includes('--refresh');
function download(url,redirects=0){
  if(redirects>5)throw new Error('Too many redirects');
  return new Promise((resolve,reject)=>{
    https.get(url,{headers:{'accept-encoding':'identity'},timeout:30000},response=>{
      if(response.statusCode>=300&&response.statusCode<400&&response.headers.location){response.resume();download(new URL(response.headers.location,url).href,redirects+1).then(resolve,reject);return;}
      if(response.statusCode!==200){response.resume();reject(new Error(`HTTP ${response.statusCode}`));return;}
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{bytes+=chunk.length;if(bytes>20_000_000){response.destroy(new Error('List too large'));return;}chunks.push(chunk);});
      response.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
      response.on('error',reject);
    }).on('error',reject);
  });
}
const LISTS=[
  ['easylist','https://easylist.to/easylist/easylist.txt'],
  ['easyprivacy','https://easylist.to/easylist/easyprivacy.txt'],
  ['adguard_base','https://filters.adtidy.org/extension/chromium/filters/2.txt'],
  ['adguard_tracking','https://filters.adtidy.org/extension/chromium/filters/3.txt'],
  ['adguard_pt','https://filters.adtidy.org/extension/chromium/filters/9.txt']
];
await fs.mkdir(path.join(dist,'rules'),{recursive:true});
await makeIcons(path.join(dist,'icons'));
await fs.mkdir(cache,{recursive:true});
const seen=new Set();
const metadata={builtAt:new Date().toISOString(),lists:{}};
const allowIds={};
for(const [id,url] of LISTS){
  const cachePath=path.join(cache,`${id}.txt`);
  let text;
  try {
    if(refresh) throw new Error('refresh');
    text=await fs.readFile(cachePath,'utf8');
  } catch {
    text=await download(url);
    if(text.length<10000) throw new Error(`${id}: source too small`);
    await fs.writeFile(cachePath,text);
  }
  const compiled=compileList(text,{maxRules:4500,maxCosmetics:3000,seen});
  await fs.writeFile(path.join(dist,'rules',`${id}.json`),JSON.stringify(compiled.rules));
  allowIds[id]=compiled.rules.filter(r=>r.action.type==='allow').map(r=>r.id);
  const cosmetic={global:[],domains:{},exceptions:{}};
  for(const c of compiled.cosmetic)for(const domain of c.domains){
    if(c.exception){(cosmetic.exceptions[domain]??=[]).push(c.selector);continue;}
    if(domain==='*')cosmetic.global.push(c.selector);
    else(cosmetic.domains[domain]??=[]).push(c.selector);
  }
  await fs.writeFile(path.join(dist,'rules',`${id}-cosmetic.json`),JSON.stringify(cosmetic));
  metadata.lists[id]={source:url,networkRules:compiled.rules.length,cosmeticRules:compiled.cosmetic.length,...compiled.stats};
  console.log(`${id}: ${compiled.rules.length} network, ${compiled.cosmetic.length} cosmetic, ${compiled.stats.duplicates} duplicates`);
}
const youtubeRules=[
  '||youtube.com/pagead/',
  '||youtube.com/api/stats/ads',
  '||youtube.com/ptracking',
  '||googleads.g.doubleclick.net/pagead/',
  '||youtube.com/get_midroll_info'
].map((line,i)=>({...compileList(line).rules[0],id:i+1,condition:{...compileList(line).rules[0].condition,initiatorDomains:['youtube.com']}}));
await fs.writeFile(path.join(dist,'rules','youtube.json'),JSON.stringify(youtubeRules));
await fs.writeFile(path.join(dist,'rules','allow-ids.json'),JSON.stringify(allowIds));
await fs.writeFile(path.join(dist,'rules','metadata.json'),JSON.stringify(metadata,null,2));
for(const name of ['manifest.json','popup.html','options.html','ui.css'])await fs.copyFile(path.join(root,'src',name),path.join(dist,name));
for(const name of ['README.md','PRIVACY.md','LICENSE'])await fs.copyFile(path.join(root,name),path.join(dist,name));
for(const [name,entry] of [['background','background.ts'],['content','content.ts'],['popup','popup.ts'],['options','options.ts']]){
  await build({entryPoints:[path.join(root,'src',entry)],outfile:path.join(dist,`${name}.js`),bundle:true,format:'iife',target:'chrome121',minify:false,logLevel:'warning'});
}
console.log(`Built ${dist}`);
