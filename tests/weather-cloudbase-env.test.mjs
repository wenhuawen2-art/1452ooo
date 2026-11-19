import test from 'node:test';
import assert from 'node:assert/strict';
import {mergedWeatherEnvironment} from '../scripts/weather-cloudbase-env.mjs';
test('weather environment merge preserves all existing AI and map variables',()=>{
 const existing=[{Key:'AI_ENABLED',Value:'true'},{Key:'AI_ALLOWLIST',Value:'account-a'},{Key:'AI_WORKER_SECRET',Value:'opaque-secret'},{Key:'TENCENT_LBS_KEY',Value:'opaque-map-key'}];
 const merged=mergedWeatherEnvironment(existing,{WEATHER_PROVIDER:'qweather',QWEATHER_API_HOST:'test.re.qweatherapi.com',QWEATHER_DEVELOPER_ID:'QTEST12345'});
 assert.deepEqual(merged.slice(0,4),existing);assert.equal(merged.length,7);assert.equal(existing.length,4);
 assert.throws(()=>mergedWeatherEnvironment(existing,{AI_ENABLED:'false'}),/NON_WEATHER_VARIABLE_REJECTED/);
});
