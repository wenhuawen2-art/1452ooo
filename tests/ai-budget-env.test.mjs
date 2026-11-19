import test from 'node:test';import assert from 'node:assert/strict';
import {mergeAiBudgetEnvironment} from '../scripts/ai-budget-cloudbase-env.mjs';
test('AI budget configuration preserves model, weather, map and dispatch credentials',()=>{
 const original=[{Key:'QWEATHER_PRIVATE_KEY',Value:'private-weather'},{Key:'TENCENT_LBS_KEY',Value:'private-map'},{Key:'AI_WORKER_SECRET',Value:'private-dispatch'},{Key:'AI_MODEL_PROVIDER',Value:'hunyuan-v3'}];
 const actual=mergeAiBudgetEnvironment(original,{AI_PUBLIC_ENABLED:'true',AI_GLOBAL_DAILY_LIMIT:'200',AI_GLOBAL_MONTHLY_LIMIT:'2000'});
 assert.ok(original.every(v=>actual.some(a=>a.Key===v.Key&&a.Value===v.Value)));
 assert.throws(()=>mergeAiBudgetEnvironment(original,{AI_MODEL_PROVIDER:'cloudbase'}),/UNRELATED_ENV_REJECTED/);
});
