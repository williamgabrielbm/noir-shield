import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNetwork,parseCosmetic,compileList} from '../scripts/compiler.mjs';

test('compiles safe anchored network rule',()=>{
  assert.deepEqual(parseNetwork('||ads.example.com^$third-party,script'),{
    priority:1,action:{type:'block'},condition:{urlFilter:'||ads.example.com^',domainType:'thirdParty',resourceTypes:['script']}
  });
});
test('supports exceptions and site scope',()=>{
  const r=parseNetwork('@@||ads.example.com^$domain=site.test|~shop.test');
  assert.equal(r.action.type,'allow');assert.deepEqual(r.condition.initiatorDomains,['site.test']);
  assert.deepEqual(r.condition.excludedInitiatorDomains,['shop.test']);
});
test('rejects unsupported syntax rather than widening it',()=>{
  assert.equal(parseNetwork('||ads.example.com^$redirect=noopjs'),null);
  assert.equal(parseNetwork('/ad[0-9]+/'),null);
  assert.equal(parseCosmetic('example.com##div:has(.ad)'),null);
});
test('deduplicates across lists',()=>{
  const seen=new Set();compileList('||ads.example.com^',{seen});
  const result=compileList('||ads.example.com^\n||other.example.com^',{seen});
  assert.equal(result.stats.duplicates,1);assert.equal(result.rules.length,1);
});
