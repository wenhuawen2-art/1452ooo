const test=require('node:test');
const assert=require('node:assert/strict');
const {memoryDb}=require('./helpers/ai-memory-db.cjs');
const {createAiService}=require('../shared/ai-service.cjs');
const {budgetStatus,flushBudgetAlerts}=require('../shared/ai-budget.cjs');
async function fixture(options={}){
 let at=Date.parse('2026-11-10T15:59:00Z');const db=memoryDb();
 for(let i=0;i<12;i++)await db.seed('user_accounts','user-'+i,{id:'user-'+i,profileComplete:true});
 const env={AI_ENABLED:'true',AI_PUBLIC_ENABLED:'true',AI_GLOBAL_DAILY_LIMIT:'5',AI_GLOBAL_MONTHLY_LIMIT:'50',...options.env};
 const service=createAiService({db,env,now:()=>at,dispatch:options.dispatch|| (async()=>{}),notifyBudget:options.notify});
 return{db,env,service,now:()=>at,advance:ms=>at+=ms,submit:(i)=>service.submit('user-'+i,{message:'旅行建议',tripId:'',clientRequestId:'request-'+i+'-unique'})};
}
test('public AI is open to profiled accounts but never to unauthenticated identities',async()=>{
 const f=await fixture();assert.equal((await f.service.capabilities('user-0')).canUse,true);
 await f.db.seed('user_accounts','user-0',{id:'user-0',profileComplete:false});
 await assert.rejects(f.submit(0),{code:'AI_LOGIN_REQUIRED'});assert.equal(Object.keys(f.db.inspect('ai_jobs')).length,0);
 assert.equal((await budgetStatus(f.db,f.env,f.now())).daily.used,0);
});
test('daily site budget is atomic across different users and rolls back rejected work',async()=>{
 const f=await fixture({env:{AI_GLOBAL_DAILY_LIMIT:'3'}});
 const results=await Promise.allSettled(Array.from({length:10},(_,i)=>f.submit(i)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
 assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='AI_GLOBAL_DAILY_LIMIT'));
 assert.equal(Object.keys(f.db.inspect('ai_jobs')).length,3);assert.equal((await budgetStatus(f.db,f.env,f.now())).daily.used,3);
});
test('monthly allowance survives daily reset, using Beijing midnight and calendar month',async()=>{
 const f=await fixture({env:{AI_GLOBAL_DAILY_LIMIT:'2',AI_GLOBAL_MONTHLY_LIMIT:'3'}});
 await f.submit(0);await f.submit(1);await assert.rejects(f.submit(2),{code:'AI_GLOBAL_DAILY_LIMIT'});
 f.advance(61000);await f.submit(2);await assert.rejects(f.submit(3),{code:'AI_GLOBAL_MONTHLY_LIMIT'});
 const status=await budgetStatus(f.db,f.env,f.now());assert.equal(status.daily.period,'2026-11-11');assert.equal(status.daily.used,1);assert.equal(status.monthly.used,3);
 f.advance(Date.parse('2026-11-30T16:00:00Z')-f.now());await f.submit(3);
 assert.equal((await budgetStatus(f.db,f.env,f.now())).monthly.period,'2026-12');
});
test('failed accepted requests consume a global attempt, idempotent retries do not consume again',async()=>{
 const f=await fixture({dispatch:async()=>{throw Object.assign(Error('not dispatched'),{code:'AI_DISPATCH_REJECTED'});}});
 const first=await f.submit(0);const again=await f.submit(0);assert.equal(first.jobId,again.jobId);
 assert.equal((await budgetStatus(f.db,f.env,f.now())).daily.used,1);
 assert.equal((await f.service.capabilities('user-0')).remainingToday,20);
});
test('80% and 100% alerts are persisted and claimed once despite concurrent flushes',async()=>{
 const sent=[];const f=await fixture();for(let i=0;i<5;i++)await f.submit(i);
 const notify=async alert=>{sent.push(alert);return {requestId:alert.id};};
 await Promise.all([flushBudgetAlerts(f.db,f.env,f.now,notify),flushBudgetAlerts(f.db,f.env,f.now,notify)]);
 assert.equal(sent.length,2);assert.deepEqual(sent.map(a=>a.threshold).sort((a,b)=>a-b),[80,100]);
 assert.ok(sent.every(a=>!('accountId'in a)&&!('message'in a)));
 await flushBudgetAlerts(f.db,f.env,f.now,notify);assert.equal(sent.length,2);
});
test('email transport failure preserves retryable outbox without weakening the hard limit',async()=>{
 const f=await fixture();for(let i=0;i<5;i++)await f.submit(i);
 let failures=0;await flushBudgetAlerts(f.db,f.env,f.now,async()=>{failures++;throw Error('SMTP secret must not leak');});
 assert.equal(failures,2);await assert.rejects(f.submit(5),{code:'AI_GLOBAL_DAILY_LIMIT'});
 await flushBudgetAlerts(f.db,f.env,f.now,async()=>{failures++;});assert.equal(failures,2);
 f.advance(300001);let successes=0;await flushBudgetAlerts(f.db,f.env,f.now,async()=>{successes++;});assert.equal(successes,2);
 assert.doesNotMatch(JSON.stringify(f.db.inspect('ai_usage')),/SMTP secret/);
});
test('invalid public budget configuration fails closed',async()=>{
 const f=await fixture({env:{AI_GLOBAL_DAILY_LIMIT:'invalid'}});await assert.rejects(f.submit(0),{code:'AI_BUDGET_CONFIG'});
 assert.equal(Object.keys(f.db.inspect('ai_jobs')).length,0);
});
