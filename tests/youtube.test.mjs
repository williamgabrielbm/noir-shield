import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/youtube/data.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {sanitizePlayer,sanitizePlayerPayload,playerEndpoint}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
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
test('endpoint input brand checks do not execute arbitrary url/href getters',()=>{
 const base='https://www.youtube.com/watch?v=fixture';let reads=0;
 const spoof={get url(){reads++;return 'https://www.youtube.com/youtubei/v1/player';},get href(){reads++;return this.url;}};
 for(const input of [spoof,{},null,undefined,42])assert.equal(playerEndpoint(input,base),false);
 assert.equal(reads,0);assert.equal(playerEndpoint(new URL('/youtubei/v1/player',base),base),true);
});
test('frame base URL cannot broaden the allowed player origin',()=>{
 const allowed='https://www.youtube.com',foreign='https://example.com/frame';
 assert.equal(playerEndpoint('/youtubei/v1/player',foreign,allowed),false);
 assert.equal(playerEndpoint(allowed+'/youtubei/v1/player',foreign,allowed),true);
 assert.equal(playerEndpoint('https://example.com/youtubei/v1/player',allowed,allowed),false);
});

test('get_watch array filters only explicit playerResponse envelopes',()=>{
 const player=fixture(),watchNextResponse={adSlots:['ordinary nested content'],keep:true};
 const value=[{playerResponse:player,responseContext:{keep:true}},{watchNextResponse}];
 const snapshot=structuredClone(value),next=sanitizePlayerPayload(value);
 assert.notEqual(next,value);assert.deepEqual(value,snapshot);
 assert.deepEqual(next[0].playerResponse.adSlots,[]);
 assert.equal(next[0].playerResponse.streamingData,player.streamingData);
 assert.equal(next[0].responseContext,value[0].responseContext);
 assert.equal(next[1],value[1]);assert.equal(next[1].watchNextResponse,watchNextResponse);
 assert.equal(sanitizePlayerPayload(next),next);
});
test('payload preserves nested live, restricted, unknown and unrelated envelopes',()=>{
 for(const value of [
  [{playerResponse:{...fixture(),videoDetails:{videoId:'live',isLiveContent:true}}}],
  {playerResponse:{...fixture(),playabilityStatus:{status:'ERROR'}}},
  [{watchNextResponse:{playerResponse:fixture()}}],
  [null,42,{playerResponse:{adSlots:[{adSlotRenderer:{}}]}}]
 ])assert.equal(sanitizePlayerPayload(value),value);
 const value={playerResponse:fixture(),keep:{}};assert.notEqual(sanitizePlayerPayload(value),value);
});
test('get_watch endpoint is exact and same origin, including Request inputs',()=>{
 const base='https://www.youtube.com/watch?v=test';
 for(const input of ['/youtubei/v1/get_watch?prettyPrint=false',new Request('https://www.youtube.com/youtubei/v1/get_watch')])assert.equal(playerEndpoint(input,base),true);
 for(const input of ['/youtubei/v1/get_watch_extra','/youtubei/v1/get_watch/drm','https://evil.example/youtubei/v1/get_watch','/youtubei/v1/next'])assert.equal(playerEndpoint(input,base),false);
});

test('observed reel sequence drops only entries explicitly marked isAd true',()=>{
 const content={command:{reelWatchEndpoint:{videoId:'content'}}};
 const ad={command:{reelWatchEndpoint:{adClientParams:{isAd:true}}}};
 const ordinary={command:{reelWatchEndpoint:{adClientParams:{isAd:false}}}};
 const unknown={command:{reelWatchEndpoint:{adClientParams:{isAd:'true'}}}};
 const value={entries:[content,ad,ordinary,unknown,null],continuationEndpoint:{keep:true}};
 const next=sanitizePlayerPayload(value);
 assert.deepEqual(next.entries,[content,ordinary,unknown,null]);
 assert.equal(next.entries[0],content);assert.equal(next.continuationEndpoint,value.continuationEndpoint);
 assert.equal(value.entries.length,5);assert.equal(sanitizePlayerPayload(next),next);
 assert.equal(playerEndpoint('/youtubei/v1/reel/reel_watch_sequence?prettyPrint=false','https://www.youtube.com/shorts/id'),true);
 assert.equal(playerEndpoint('/youtubei/v1/reel/reel_watch_sequence_extra','https://www.youtube.com'),false);
});
