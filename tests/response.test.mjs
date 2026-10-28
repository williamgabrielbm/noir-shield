import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/youtube/response.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {filterPlayerResponse}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const fixture={videoDetails:{videoId:'test'},playabilityStatus:{status:'OK'},streamingData:{formats:[{url:'content'}]},adPlacements:[{adPlacementRenderer:{}}]};
function response(body=JSON.stringify(fixture)){const r=new Response(body,{headers:{'content-type':'application/json','content-length':'123','content-encoding':'gzip'}});Object.defineProperty(r,'url',{value:'https://www.youtube.com/youtubei/v1/player'});return r;}
test('all fetch body readers agree, including clone streams and bytes',async()=>{
 const original=response(),r=await filterPlayerResponse(original,()=>true);
 assert.notEqual(r,original);assert.equal(original.bodyUsed,false);assert.equal(r.url,original.url);
 assert.equal(r.headers.get('content-length'),null);assert.equal(r.headers.get('content-encoding'),null);
 const clones=Array.from({length:5},()=>r.clone());
 const values=await Promise.all([r.json(),clones[0].text().then(JSON.parse),clones[1].arrayBuffer().then(b=>JSON.parse(new TextDecoder().decode(b))),clones[2].blob().then(b=>b.text()).then(JSON.parse),new Response(clones[3].body).json(),clones[4].clone().json()]);
 for(const v of values){assert.deepEqual(v.adPlacements,[]);assert.deepEqual(v.streamingData,fixture.streamingData);}
 await assert.rejects(()=>r.json(),TypeError);
});
test('inactive, invalid, unknown-schema and oversized bodies retain original identity and body',async()=>{
 for(const body of ['{invalid',JSON.stringify({...fixture,adPlacements:[{unknown:{}}]}),'x'.repeat(4_000_001)]){
  const r=response(body);assert.equal(await filterPlayerResponse(r,()=>true),r);assert.equal(r.bodyUsed,false);
 }
 const r=response();assert.equal(await filterPlayerResponse(r,()=>false),r);
});
test('turning off protection during read preserves original response',async()=>{
 let enabled=true;
 const r=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify(fixture)));enabled=false;c.close();}}),{headers:{'content-type':'application/json'}});
 assert.equal(await filterPlayerResponse(r,()=>enabled),r);assert.equal(r.bodyUsed,false);
});
