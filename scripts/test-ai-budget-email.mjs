import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';import {writeFileSync} from 'node:fs';
import {cloudApi,cliCredential} from './cloud-api.mjs';
const {signBudgetMaintenance}=createRequire(import.meta.url)('../cloudfunctions/suixing-api/ai-budget-notify.cjs');
try{
 const credential=cliCredential(),target={Namespace:'zdata-d4g6l75lwebf2dbb0',FunctionName:'suixing-api'};
 const info=await cloudApi('scf','2018-04-16','GetFunction',{...target,ShowCode:'FALSE'},credential);
 const env=Object.fromEntries((info.Environment?.Variables||[]).map(v=>[v.Key,v.Value]));
 const data={issuedAt:Date.now(),nonce:randomUUID(),mode:process.argv.includes('--flush')?'flush':'test'};
 data.signature=signBudgetMaintenance(data,env.AI_WORKER_SECRET);
 const result=await cloudApi('scf','2018-04-16','Invoke',{...target,InvocationType:'RequestResponse',ClientContext:JSON.stringify({operation:'aiBudgetMaintenance',data})},credential);
 let payload;try{payload=JSON.parse(result.Result?.RetMsg);}catch{throw Error('INVOKE_RESULT_INVALID');}
 const audit={timestamp:new Date().toISOString(),cloudRequestId:result.RequestId,invokeResult:result.Result?.InvokeResult,result:payload};
 writeFileSync('output/ai-budget-email-test-20261110.json',JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));
 if(!payload.ok)process.exitCode=1;
}catch(e){console.error(JSON.stringify({ok:false,code:/^[A-Za-z0-9_.]+$/.test(e.message)?e.message:'EMAIL_TEST_FAILED'}));process.exitCode=1;}
