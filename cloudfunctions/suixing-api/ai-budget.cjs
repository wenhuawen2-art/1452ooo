'use strict';
const {beijingDay,aiError}=require('./ai-contract.cjs');
const clean=d=>{if(!d)return null;const {_id,...value}=d;return value;};
const read=async(source,id)=>{const {data}=await source.collection('ai_usage').doc(id).get();return clean(Array.isArray(data)?data[0]:data);};
const write=(source,id,value)=>source.collection('ai_usage').doc(id).set(value);
const lifetime=93*86400000;
function budgetConfig(env){
 const enabled=env.AI_PUBLIC_ENABLED==='true'||env.AI_GLOBAL_DAILY_LIMIT!==undefined||env.AI_GLOBAL_MONTHLY_LIMIT!==undefined;
 const number=(value,fallback)=>{const n=value===undefined?fallback:Number(value);if(!Number.isSafeInteger(n)||n<1||n>100000)throw aiError(503,'AI_BUDGET_CONFIG','AI 总额度配置待确认');return n;};
 return {enabled,daily:number(env.AI_GLOBAL_DAILY_LIMIT,200),monthly:number(env.AI_GLOBAL_MONTHLY_LIMIT,2000)};
}
function windows(env,at){const config=budgetConfig(env),day=beijingDay(at);return config.enabled?[{kind:'daily',period:day,id:'global_day_'+day,limit:config.daily},{kind:'monthly',period:day.slice(0,7),id:'global_month_'+day.slice(0,7),limit:config.monthly}]:[];}
async function budgetStatus(db,env,at){
 const entries=await Promise.all(windows(env,at).map(async window=>{const record=await read(db,window.id);return {...window,used:Number(record?.used||0),remaining:Math.max(0,window.limit-Number(record?.used||0))};}));
 if(!entries.length)return null;
 const [daily,monthly]=entries;const reason=monthly.remaining===0?'AI_GLOBAL_MONTHLY_LIMIT':daily.remaining===0?'AI_GLOBAL_DAILY_LIMIT':'';
 return {daily,monthly,reason};
}
async function reserveGlobalBudget(source,env,at,jobId){
 const entries=await Promise.all(windows(env,at).map(async window=>({...window,record:await read(source,window.id)})));
 for(const entry of entries)if(Number(entry.record?.used||0)>=entry.limit)throw aiError(429,entry.kind==='daily'?'AI_GLOBAL_DAILY_LIMIT':'AI_GLOBAL_MONTHLY_LIMIT',entry.kind==='daily'?'今日全站 AI 额度已用完，明天再来':'本月全站 AI 额度已用完，下月恢复');
 for(const entry of entries){
  const before=Number(entry.record?.used||0),used=before+1;
  await write(source,entry.id,{id:entry.id,kind:'globalBudget',period:entry.period,window:entry.kind,used,limit:entry.limit,updatedAt:at,expiresAt:at+lifetime});
  for(const threshold of [80,100])if(before<Math.ceil(entry.limit*threshold/100)&&used>=Math.ceil(entry.limit*threshold/100)){
   const id=`budget_alert_${entry.id}_${threshold}`;
   await write(source,id,{id,kind:'budgetAlert',period:entry.period,window:entry.kind,threshold,used,limit:entry.limit,status:'pending',attempts:0,nextAttemptAt:at,createdAt:at,expiresAt:at+lifetime});
  }
 }
 // Accepted attempts consume the global allowance even if model generation fails.
 // Failed output must never let repeated retries run the model without a bound.
 return entries.length?{jobId,dayKey:entries[0].id,monthKey:entries[1].id}:null;
}
async function flushBudgetAlerts(db,env,now,notify){
 if(typeof notify!=='function')return;
 const pending=[];
 for(let offset=0; ;offset+=100){
  const rows=(await db.collection('ai_usage').where({kind:'budgetAlert'}).skip(offset).limit(100).get()).data.map(clean);
  pending.push(...rows.filter(a=>a.status!=='sent'&&a.expiresAt>now()&&Number(a.nextAttemptAt||0)<=now()));
  if(rows.length<100||pending.length>=4)break;
 }
 // Retry older windows too: a midnight rollover must not lose queued emails.
 for(const candidate of pending.slice(0,4)){
  const id=candidate.id,at=now();
  const claimed=await db.runTransaction(async source=>{
   const alert=await read(source,id);
   if(!alert||alert.status==='sent'||Number(alert.nextAttemptAt||0)>at)return null;
   const leased={...alert,status:'sending',attempts:Number(alert.attempts||0)+1,nextAttemptAt:at+60000};await write(source,id,leased);return leased;
  });
  if(!claimed)continue;
  let result,error;
  try{result=await notify({id,window:claimed.window,period:claimed.period,threshold:claimed.threshold,used:claimed.used,limit:claimed.limit});}catch(e){error=e;}
  await db.runTransaction(async source=>{
   const current=await read(source,id);if(!current||current.attempts!==claimed.attempts)return;
   await write(source,id,{...current,status:error?'pending':'sent',nextAttemptAt:error?now()+300000:0,...(!error?{sentAt:now(),deliveryId:String(result?.requestId||'')}: {errorCode:/^[A-Za-z0-9_.]+$/.test(String(error.code||''))?error.code:'AI_BUDGET_ALERT_FAILED'})});
  });
 }
}
module.exports={budgetConfig,budgetStatus,reserveGlobalBudget,flushBudgetAlerts};
