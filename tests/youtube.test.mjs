import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/youtube/data.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {sanitizePlayer,playerEndpoint}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const fixture=()=>({videoDetails:{videoId:'fixture'},playabilityStatus:{status:'OK'},streamingData:{formats:[{url:'https://media.example/video'}]},adPlacements:[{adPlacementRenderer:{}}],playerAds:[{playerLegacyDesktopWatchAdsRenderer:{}}],adSlots:[{adSlotRenderer:{}}],captions:{label:'keep'},playbackTracking:{keep:true}});
test('removes only recognized top-level ad arrays without mutating original',()=>{
  const before=fixture(), snapshot=structuredClone(before), after=sanitizePlayer(before);
  assert.notEqual(after,before);assert.deepEqual(before,snapshot);
  for(const key of ['adPlacements','playerAds','adSlots'])assert.deepEqual(after[key],[]);
  for(const key of ['streamingData','captions','playbackTracking','videoDetails','playabilityStatus'])assert.equal(after[key],before[key]);
});
test('normal response keeps identity and nested content fields',()=>{
  const value=fixture();delete value.adPlacements;delete value.playerAds;delete value.adSlots;
  value.streamingData.adSlots=['content'];assert.equal(sanitizePlayer(value),value);
});
test('live, restricted, malformed and incomplete responses fail open',()=>{
  for(const value of [null,[],{adSlots:[]}, {...fixture(),videoDetails:{videoId:'live',isLiveContent:true}}, {...fixture(),playabilityStatus:{status:'ERROR'}},{...fixture(),streamingData:null}])assert.equal(sanitizePlayer(value),value);
});
test('unknown ad schema is retained, repeated sanitization is idempotent',()=>{
  const value=fixture();value.adSlots=[{unknownRenderer:{}}];const next=sanitizePlayer(value);
  assert.equal(next.adSlots,value.adSlots);assert.equal(sanitizePlayer(next),next);
});
test('frozen input remains usable',()=>{const value=Object.freeze(fixture());assert.doesNotThrow(()=>sanitizePlayer(value));});
test('only exact same-origin player API is eligible',()=>{
  const base='https://www.youtube.com/watch?v=fixture';
  for(const value of ['/youtubei/v1/player?prettyPrint=false',new Request('https://www.youtube.com/youtubei/v1/player')])assert.equal(playerEndpoint(value,base),true);
  for(const value of ['/youtubei/v1/player-extra','/youtubei/v1/next','https://evil.example/youtubei/v1/player','https://www.youtube.com.evil.example/youtubei/v1/player','https://googlevideo.com/videoplayback'])assert.equal(playerEndpoint(value,base),false);
});
