const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,verify}=require('node:crypto');
const {weatherCoordinates,qweatherHeaders,normalizeQweather,fetchQweather}=require('../shared/weather-provider.cjs');
test('weather converts Tencent coordinates to GPS while preserving GPS inputs',()=>{
  const input={latitude:39.910226,longitude:116.403714,coordinateSystem:'gcj02'},gps=weatherCoordinates(input);
  assert.ok(Math.abs(gps.latitude-39.908823)<0.0001);
  assert.ok(Math.abs(gps.longitude-116.39747)<0.0001);
  assert.deepEqual(weatherCoordinates({...input,coordinateSystem:'wgs84'}),{latitude:input.latitude,longitude:input.longitude});
});
test('QWeather JWT uses Ed25519, correct credential IDs and a short expiry',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const headers=qweatherHeaders({QWEATHER_DEVELOPER_ID:'QTEST12345',QWEATHER_PROJECT_ID:'test-project',QWEATHER_KEY_ID:'test-key',QWEATHER_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})});
  const token=headers.Authorization.slice(7),parts=token.split('.');
  assert.equal(JSON.parse(Buffer.from(parts[0],'base64url')).kid,'test-key');
  const payload=JSON.parse(Buffer.from(parts[1],'base64url'));assert.equal(payload.iss,'QTEST12345');assert.equal(payload.sub,'test-project');assert.ok(payload.exp-payload.iat<=1200);
  assert.ok(verify(null,Buffer.from(parts.slice(0,2).join('.')),publicKey,Buffer.from(parts[2],'base64url')));
});
test('QWeather JWT credentials require the developer issuer before signing',()=>{
  const {privateKey}=generateKeyPairSync('ed25519');
  assert.throws(()=>qweatherHeaders({QWEATHER_PROJECT_ID:'test-project',QWEATHER_KEY_ID:'test-key',QWEATHER_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})}),/开发者ID待配置/);
});
test('QWeather v1 normalizes the requested day without borrowing live temperature',()=>{
  const value=normalizeQweather({days:[{forecastStartTime:'2026-11-10T00:00+08:00',temperatureMax:{value:20},temperatureMin:{value:8},uvIndexMax:3,daytime:{condition:{text:'小雨',code:'305'},humidity:0.6,precipitation:{probability:0.7}}}]},'2026-11-10');
  assert.equal(value.date,'2026-11-10');assert.equal(value.high,20);assert.equal(value.current,null);assert.equal(value.rainProbability,70);assert.equal(value.humidity,60);
  assert.equal(normalizeQweather({days:[]},'2026-12-01').reason,'out_of_range');
});
test('QWeather needs a dedicated official host and credentials before any request',async()=>{
  let calls=0;const fetcher=()=>{calls++;throw Error('must not request');};
  await assert.rejects(fetchQweather({latitude:34,longitude:108},'2026-11-10',{env:{},fetcher}),/Host 待配置/);
  await assert.rejects(fetchQweather({latitude:34,longitude:108},'2026-11-10',{env:{QWEATHER_API_HOST:'abc.re.qweatherapi.com'},fetcher}),/凭据待配置/);
  assert.equal(calls,0);
});
