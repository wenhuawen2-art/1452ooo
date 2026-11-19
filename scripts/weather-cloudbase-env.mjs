import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const WEATHER_KEYS=['WEATHER_PROVIDER','QWEATHER_API_HOST','QWEATHER_DEVELOPER_ID','QWEATHER_PROJECT_ID','QWEATHER_KEY_ID','QWEATHER_PRIVATE_KEY','QWEATHER_API_KEY'];
export function mergedWeatherEnvironment(existing,patch){
  for(const key of Object.keys(patch))if(!WEATHER_KEYS.includes(key))throw new Error('NON_WEATHER_VARIABLE_REJECTED');
  const merged=new Map(existing.map(({Key,Value})=>[Key,Value]));
  for(const [key,value] of Object.entries(patch)){if(value===null)merged.delete(key);else if(typeof value==='string')merged.set(key,value);else throw new Error('WEATHER_VARIABLE_MUST_BE_STRING_OR_NULL');}
  return [...merged].map(([Key,Value])=>({Key,Value}));
}
export function cliCredential(){
  // Never inherit verbose signing output or allow the CLI to launch an authorization page.
  const result=spawnSync(process.execPath,['node_modules/@cloudbase/cli/bin/tcb','secrets','get','--json'],{encoding:'utf8',timeout:30000,env:{...process.env,CI:'1',DEBUG:''}});
  if(result.status!==0)throw new Error('CLOUDBASE_LOGIN_REQUIRED');
  let parsed;try{const out=result.stdout||'';parsed=JSON.parse(out.slice(out.indexOf('{')));}catch{throw new Error('CLOUDBASE_CREDENTIAL_RESPONSE_INVALID');}
  const value=parsed.data||parsed;
  if(!value.secretId||!value.secretKey||!value.token)throw new Error('CLOUDBASE_TEMPORARY_CREDENTIAL_REQUIRED');
  return value;
}
async function scfRequest(action,body,credential){
  process.env.DEBUG='';
  const {sign}=await import('@cloudbase/signature-nodejs');
  const url='https://scf.tencentcloudapi.com/';
  const headers={'content-type':'application/json; charset=utf-8',host:'scf.tencentcloudapi.com'};
  const signature=sign({secretId:credential.secretId,secretKey:credential.secretKey,method:'POST',url,service:'scf',headers,params:body,isCloudApi:true});
  const response=await fetch(url,{method:'POST',headers:{...headers,Authorization:signature.authorization,'X-TC-Action':action,'X-TC-Version':'2018-04-16','X-TC-Region':'ap-shanghai','X-TC-Timestamp':String(signature.timestamp),'X-TC-Token':credential.token},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const result=(await response.json()).Response;
  if(!response.ok||!result||result.Error)throw new Error('SCF_'+String(result?.Error?.Code||response.status));
  return result;
}
export async function main(args=process.argv.slice(2)){
  const apply=args.includes('--apply'),configIndex=args.indexOf('--config');
  if(apply&&configIndex<0)throw new Error('PRIVATE_CONFIG_FILE_REQUIRED');
  const patch=configIndex>=0?JSON.parse(readFileSync(args[configIndex+1],'utf8')):{};
  // Validate allowlist even during read-only preparation.
  mergedWeatherEnvironment([],patch);
  const target={Namespace:'zdata-d4g6l75lwebf2dbb0',FunctionName:'suixing-api'};
  const credential=cliCredential();
  const current=await scfRequest('GetFunction',{...target,ShowCode:'FALSE'},credential);
  const original=current.Environment?.Variables||[];
  const merged=mergedWeatherEnvironment(original,patch);
  const env=Object.fromEntries(merged.map(({Key,Value})=>[Key,Value]));
  if(apply){
    if(env.WEATHER_PROVIDER!=='qweather')throw new Error('QWEATHER_PROVIDER_REQUIRED');
    const {default:provider}=await import('../shared/weather-provider.cjs');
    provider.qweatherHeaders(env);
    if(!/^[a-z0-9-]+\.(?:re\.)?qweatherapi\.com$/i.test(String(env.QWEATHER_API_HOST||'').replace(/^https:\/\//,'').replace(/\/$/,'')))throw new Error('QWEATHER_API_HOST_INVALID');
    // This is the only mutation: update the selected function's merged environment.
    await scfRequest('UpdateFunctionConfiguration',{...target,Environment:{Variables:merged}},credential);
    let after;
    for(let attempt=0;attempt<12;attempt++){
      after=await scfRequest('GetFunction',{...target,ShowCode:'FALSE'},credential);
      const actual=new Map((after.Environment?.Variables||[]).map(({Key,Value})=>[Key,Value]));
      if(merged.every(({Key,Value})=>actual.get(Key)===Value))break;
      if(attempt===11)throw new Error('SCF_ENV_VERIFICATION_PENDING');
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    const actual=new Map((after.Environment?.Variables||[]).map(({Key,Value})=>[Key,Value]));
    if(original.some(({Key,Value})=>!WEATHER_KEYS.includes(Key)&&actual.get(Key)!==Value))throw new Error('UNRELATED_ENV_VERIFICATION_FAILED');
  }
  const present=key=>original.some(entry=>entry.Key===key&&Boolean(entry.Value));
  console.log(JSON.stringify({authenticated:true,functionName:target.FunctionName,applied:apply,existingTencentKey:present('TENCENT_LBS_KEY'),existingQweatherHost:present('QWEATHER_API_HOST'),existingQweatherCredential:present('QWEATHER_API_KEY')||present('QWEATHER_PRIVATE_KEY'),preservedOtherVariables:true,changedKeys:apply?Object.keys(patch):[]}));
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^[A-Z0-9_.]+$/.test(error.message)?error.message:'WEATHER_CONFIGURATION_FAILED'}));process.exitCode=1;});
