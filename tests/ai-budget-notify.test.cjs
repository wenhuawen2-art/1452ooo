const test=require('node:test'),assert=require('node:assert/strict');
const {createBudgetNotifier,budgetMessage,signBudgetMaintenance,verifyBudgetMaintenance,runBudgetMaintenance}=require('../cloudfunctions/suixing-api/ai-budget-notify.cjs');
const {memoryDb}=require('./helpers/ai-memory-db.cjs');
test('mail transport uses verified TLS and sends only aggregate usage to the fixed recipient',async()=>{
 let seen,config,closed=false;const notify=createBudgetNotifier({env:{AI_BUDGET_ALERT_TRANSPORT:'smtp',AI_BUDGET_SMTP_USER:'123456@qq.com',AI_BUDGET_SMTP_PASS:'temporary-secret',AI_BUDGET_ALERT_TO:'alerts@example.test'},createTransport:options=>{config=options;return {sendMail:async mail=>{seen=mail;return {accepted:['alerts@example.test'],messageId:'delivery-1'};},close:()=>closed=true};}});
 assert.deepEqual(await notify({window:'daily',period:'2026-11-10',threshold:80,used:160,limit:200}),{requestId:'delivery-1'});
 assert.equal(config.host,'smtp.qq.com');assert.equal(config.secure,true);assert.notEqual(config.tls.rejectUnauthorized,false);assert.equal(closed,true);
 assert.equal(seen.to,'alerts@example.test');assert.match(seen.text,/160\/200/);assert.doesNotMatch(JSON.stringify(seen),/temporary-secret/);
});
test('mail failure is sanitized and missing configuration sends nothing',async()=>{
 let calls=0;const base={createTransport:()=>{calls++;return {sendMail:async()=>{throw Object.assign(Error('sensitive upstream diagnostic'),{code:'EAUTH'});}};}};
 await assert.rejects(createBudgetNotifier(base)({}),{code:'AI_BUDGET_ALERT_CONFIG'});assert.equal(calls,0);
 await assert.rejects(createBudgetNotifier({...base,env:{AI_BUDGET_ALERT_TRANSPORT:'smtp',AI_BUDGET_SMTP_USER:'123456@qq.com',AI_BUDGET_SMTP_PASS:'secret'}})({}),{code:'AI_BUDGET_EMAIL_AUTH'});
});
test('only a fresh server-signed maintenance request can trigger mail and its replay is idempotent',async()=>{
 const at=Date.now(),env={AI_WORKER_SECRET:'server-only-secret-'.repeat(3)};
 const input={issuedAt:at,nonce:'unique-maintenance-0001',mode:'test'};input.signature=signBudgetMaintenance(input,env.AI_WORKER_SECRET);
 assert.doesNotThrow(()=>verifyBudgetMaintenance(input,env,at));
 assert.throws(()=>verifyBudgetMaintenance({...input,mode:'flush'},env,at));assert.throws(()=>verifyBudgetMaintenance(input,env,at+300001));
 const db=memoryDb();let count=0;const options={db,env,input,now:()=>at,notify:async()=>{count++;return {requestId:'delivery-test'};}};
 assert.equal((await runBudgetMaintenance(options)).deliveryId,'delivery-test');assert.equal((await runBudgetMaintenance(options)).duplicate,true);assert.equal(count,1);
 await assert.rejects(runBudgetMaintenance({...options,input:{...input,signature:'0'.repeat(64)}}));assert.equal(count,1);
});
test('limit email explains enforcement and contains only aggregate usage',()=>{
 const message=budgetMessage({window:'monthly',period:'2026-11',threshold:100,used:2000,limit:2000,accountId:'private-account',message:'private-prompt'});
 assert.match(message,/已暂停新生成/);assert.match(message,/2000\/2000/);assert.doesNotMatch(message,/private-/);
});
