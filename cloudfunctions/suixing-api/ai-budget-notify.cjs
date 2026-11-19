const {createHash,createHmac,timingSafeEqual}=require('node:crypto');
const sha=v=>createHash('sha256').update(v).digest('hex');
const hmac=(k,v,encoding)=>createHmac('sha256',k).update(v).digest(encoding);
const failure=code=>Object.assign(Error(code),{code});
function budgetMessage(alert){
 const window=alert.window==='monthly'?'本月':'今日';
 return `向野 AI 额度${alert.threshold>=100?'已用尽':'提醒'}｜${alert.period}\n${window}已接受 ${alert.used}/${alert.limit} 次请求，达到 ${alert.threshold}%。${alert.threshold>=100?'已暂停新生成，原有聊天仍可查看。':'达到上限后将自动暂停新生成。'}\n按北京时间自然日、自然月恢复。此次数限制不代表整个云账号的人民币账单上限。`;
}
function smtpOptions(env){
 const user=String(env.AI_BUDGET_SMTP_USER||'').trim(),pass=String(env.AI_BUDGET_SMTP_PASS||'');
 if(!/^[1-9][0-9]{4,14}@qq\.com$/i.test(user)||!pass||env.AI_BUDGET_ALERT_TRANSPORT!=='smtp')throw failure('AI_BUDGET_ALERT_CONFIG');
 return {host:'smtp.qq.com',port:465,secure:true,auth:{user,pass},connectionTimeout:4000,greetingTimeout:4000,socketTimeout:6000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,tls:{servername:'smtp.qq.com',minVersion:'TLSv1.2'}};
}
function createBudgetNotifier({env=process.env,createTransport,now=Date.now}={}){
 return async alert=>{
  const options=smtpOptions(env);
  const recipient=String(env.AI_BUDGET_ALERT_TO||options.auth.user).trim().toLowerCase();
  if(!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(recipient))throw failure('AI_BUDGET_ALERT_CONFIG');
  const transport=(createTransport||require('nodemailer').createTransport)(options);
  try{
   const result=await transport.sendMail({from:{name:'向野 AI 额度提醒',address:options.auth.user},to:recipient,subject:alert.test?'向野 AI 额度提醒通道测试':`向野 AI ${alert.window==='monthly'?'月度':'每日'}额度${alert.threshold>=100?'已用尽':'达到80%'}`,text:alert.test?'向野 AI 额度提醒通道测试：每日上限 200 次，每月上限 2000 次。此邮件为测试，未消耗 AI 额度。':budgetMessage(alert),messageId:`<xiangye-budget-${sha(alert.id||String(now()))}@qq.com>`});
   if(!result.accepted?.some(v=>String(v).toLowerCase()===recipient))throw failure('AI_BUDGET_EMAIL_REJECTED');
   return {requestId:String(result.messageId||'')};
  }catch(e){throw failure(e.code==='EAUTH'?'AI_BUDGET_EMAIL_AUTH':e.code==='AI_BUDGET_EMAIL_REJECTED'?e.code:'AI_BUDGET_EMAIL_SEND_FAILED');}
  finally{transport.close?.();}
 };
}
// Only an operator possessing the existing server-only dispatch secret can run
// this control-plane test. Sign the mode too; a flush cannot become a test send.
function signBudgetMaintenance(input,secret){return hmac(secret,`${input.issuedAt}.${input.nonce}.${input.mode}`,'hex');}
function verifyBudgetMaintenance(input,env,now=Date.now()){
 const secret=env.AI_WORKER_SECRET;
 if(typeof secret!=='string'||secret.length<32||!Number.isSafeInteger(input?.issuedAt)||Math.abs(now-input.issuedAt)>300000||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.nonce||'')||!['test','flush'].includes(input.mode)||!/^[a-f0-9]{64}$/.test(input.signature||''))throw failure('AI_BUDGET_MAINTENANCE_FORBIDDEN');
 if(!timingSafeEqual(Buffer.from(input.signature,'hex'),Buffer.from(signBudgetMaintenance(input,secret),'hex')))throw failure('AI_BUDGET_MAINTENANCE_FORBIDDEN');
}
async function runBudgetMaintenance({db,env=process.env,input,notify,now=Date.now}){
 verifyBudgetMaintenance(input,env,now());
 if(input.mode==='flush'){
  await require('./ai-budget.cjs').flushBudgetAlerts(db,env,now,notify);
  return {ok:true,mode:'flush'};
 }
 const id='budget_test_'+sha(input.nonce),collection=db.collection('ai_usage');
 const claimed=await db.runTransaction(async t=>{
  const ref=t.collection('ai_usage').doc(id),{data}=await ref.get(),row=Array.isArray(data)?data[0]:data;
  if(row)return false;
  await ref.set({id,kind:'budgetAlertTest',status:'sending',createdAt:now(),expiresAt:now()+86400000});return true;
 });
 if(!claimed)return {ok:true,mode:'test',duplicate:true};
 try{
  const result=await notify({test:true});
  await collection.doc(id).set({id,kind:'budgetAlertTest',createdAt:now(),expiresAt:now()+86400000,status:'sent',sentAt:now(),deliveryId:result.requestId});
  return {ok:true,mode:'test',deliveryId:result.requestId};
 }catch(e){
  const code=/^[A-Za-z0-9_.]+$/.test(e.code||'')?e.code:'AI_BUDGET_ALERT_FAILED';
  await collection.doc(id).set({id,kind:'budgetAlertTest',createdAt:now(),expiresAt:now()+86400000,status:'failed',errorCode:code});return {ok:false,code};
 }
}
module.exports={createBudgetNotifier,smtpOptions,budgetMessage,signBudgetMaintenance,verifyBudgetMaintenance,runBudgetMaintenance};
