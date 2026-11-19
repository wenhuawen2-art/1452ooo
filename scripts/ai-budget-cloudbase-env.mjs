import {pathToFileURL} from 'node:url';
import {cloudApi,cliCredential} from './cloud-api.mjs';
const KEYS=['AI_PUBLIC_ENABLED','AI_GLOBAL_DAILY_LIMIT','AI_GLOBAL_MONTHLY_LIMIT','AI_BUDGET_ALERT_POLICY_ID'];
export function mergeAiBudgetEnvironment(existing,patch){
 if(Object.keys(patch).some(k=>!KEYS.includes(k)))throw Error('UNRELATED_ENV_REJECTED');
 const m=new Map(existing.map(v=>[v.Key,v.Value]));
 for(const [k,v]of Object.entries(patch)){if(typeof v!=='string')throw Error('ENV_VALUE_INVALID');m.set(k,v);}
 return [...m].map(([Key,Value])=>({Key,Value}));
}
export async function main(args=process.argv.slice(2)){
 const apply=args.includes('--apply'),policy=args.find(a=>a.startsWith('--policy='))?.slice(9);
 if(policy&&!/^cm-[a-zA-Z0-9]+$/.test(policy))throw Error('POLICY_ID_INVALID');
 const credential=cliCredential(),namespace='zdata-d4g6l75lwebf2dbb0';
 for(const FunctionName of ['suixing-ai-worker','suixing-api']){
  const target={Namespace:namespace,FunctionName};
  const before=await cloudApi('scf','2018-04-16','GetFunction',{...target,ShowCode:'FALSE'},credential);
  const original=before.Environment?.Variables||[],values=Object.fromEntries(original.map(v=>[v.Key,v.Value]));
  if(values.AI_ENABLED!=='true'||values.AI_MODEL_PROVIDER!=='hunyuan-v3')throw Error('EXISTING_FREE_AI_REQUIRED');
  const patch={AI_PUBLIC_ENABLED:'true',AI_GLOBAL_DAILY_LIMIT:'200',AI_GLOBAL_MONTHLY_LIMIT:'2000',...(policy&&FunctionName==='suixing-api'?{AI_BUDGET_ALERT_POLICY_ID:policy}:{})};
  const merged=mergeAiBudgetEnvironment(original,patch);
  if(apply){
   await cloudApi('scf','2018-04-16','UpdateFunctionConfiguration',{...target,Environment:{Variables:merged}},credential);
   let verified=false;
   for(let i=0;i<15;i++){
    const after=await cloudApi('scf','2018-04-16','GetFunction',{...target,ShowCode:'FALSE'},credential);
    const actual=new Map((after.Environment?.Variables||[]).map(v=>[v.Key,v.Value]));
    if(after.Status==='Active'&&merged.every(v=>actual.get(v.Key)===v.Value)){verified=true;break;}
    await new Promise(r=>setTimeout(r,1000));
   }
   if(!verified)throw Error('ENV_VERIFY_PENDING');
  }
  console.log(JSON.stringify({functionName:FunctionName,applied:apply,publicEnabled:apply||values.AI_PUBLIC_ENABLED==='true',daily:apply?200:Number(values.AI_GLOBAL_DAILY_LIMIT||0),monthly:apply?2000:Number(values.AI_GLOBAL_MONTHLY_LIMIT||0),provider:values.AI_MODEL_PROVIDER,otherVariablesPreserved:true,alertPolicyConfigured:!!(policy||values.AI_BUDGET_ALERT_POLICY_ID)}));
 }
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main().catch(e=>{console.error(JSON.stringify({ok:false,code:/^[A-Za-z0-9_.]+$/.test(e.message)?e.message:'AI_ENV_FAILED'}));process.exitCode=1;});
