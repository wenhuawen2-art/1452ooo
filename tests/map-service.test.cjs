const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('cloudfunctions/suixing-api/index.js','utf8');
test('Tencent suggestions use the top-level data array returned by the official endpoint',async()=>{
  const code=source.slice(source.indexOf('async function tencentLbs('),source.indexOf('async function geocodeTencent('));
  const entries=[{id:'poi',title:'景区',location:{lat:31,lng:102}}];
  const call=vm.runInNewContext(code+'\ntencentLbs',{tencentLbsKey:()=> 'test-key',URLSearchParams,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>({status:0,data:entries})})});
  assert.equal((await call('/ws/place/v1/suggestion',{keyword:'景区'}))[0].id,'poi');
});
test('map place resolution cannot silently fall back to GPS coordinates',async()=>{
  const code=source.slice(source.indexOf('async function geocodeRoutePlace('),source.indexOf('\nconst routeMode ='));
  let fallback=false;
  const resolve=vm.runInNewContext(code+'\ngeocodeRoutePlace',{hash:()=> 'cache-id',routePlaceKey:v=>v,first:async()=>null,collections:{routeGeocodes:{doc:()=>({set:async()=>{}})}},geocodeTencent:async()=>{throw Error('provider unavailable');},geocodePlace:async()=>{fallback=true;return {latitude:31,longitude:102};},validCoordinatePair:()=>true});
  await assert.rejects(resolve('景区','小金县'),/provider unavailable/);assert.equal(fallback,false);
});
