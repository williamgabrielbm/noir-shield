import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/shared.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const shared=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
test('YouTube lab defaults preserve the former behavior',()=>{
  assert.deepEqual(shared.DEFAULT_SETTINGS.youtubeLab,{network:true,player:true,skip:true,cosmetics:true,probes:true});
});
test('reading old and partially migrated settings preserves all controls',async()=>{
  globalThis.chrome={storage:{local:{get:async()=>({settings:{enabled:true,youtubeLab:{skip:false}}})}}};
  const result=await shared.getSettings();
  assert.deepEqual(result.youtubeLab,{network:true,player:true,skip:false,cosmetics:true,probes:true});
});
