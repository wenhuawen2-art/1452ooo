// A one-hour loopback-only credential entry page. Never logs or persists SMTP
// credentials on disk; the user submits directly to the existing cloud function.
import http from 'node:http';import {randomBytes,randomUUID} from 'node:crypto';import {createRequire} from 'node:module';
import {cloudApi,cliCredential} from './cloud-api.mjs';
const require=createRequire(import.meta.url),{smtpOptions,signBudgetMaintenance}=require('../cloudfunctions/suixing-api/ai-budget-notify.cjs');
const nodemailer=require('../cloudfunctions/suixing-api/node_modules/nodemailer');
const token=randomBytes(24).toString('hex'),route='/setup/'+token,target={Namespace:'zdata-d4g6l75lwebf2dbb0',FunctionName:'suixing-api'};
let status={stage:'等待填写',configured:false,testSent:false},busy=false,port;
const html=()=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>向野 · 邮件提醒配置</title><style>body{font:16px system-ui;background:#eef4ff;color:#18345b;margin:0;padding:30px}main{max-width:540px;margin:36px auto;background:white;border-radius:24px;padding:32px;box-shadow:0 18px 60px #2d5e9a15}h1{font-size:25px}p{line-height:1.8;color:#60718a}label{display:block;margin:20px 0 8px}input{box-sizing:border-box;width:100%;padding:14px;border:1px solid #cfdaed;border-radius:12px;font-size:16px}button{border:0;border-radius:12px;background:#397af5;color:white;padding:15px;margin-top:24px;width:100%;font-size:16px}output{display:block;margin-top:20px;line-height:1.8;color:#2763bd}.note{font-size:14px}</style><main><h1>向野 AI · 额度邮件提醒</h1><p>每日 200 次、每月 2000 次。达到 80% 和 100% 时，发送邮件到已配置的收件邮箱，未单独配置时发给下方的发件邮箱。</p><p class="note">请在 QQ 邮箱的「设置 → 账号与安全 → POP3/IMAP/SMTP」开启 SMTP，按网页提示生成授权码。请填写授权码，不要填写 QQ 登录密码。</p><form id="form"><label for="user">发件 QQ 邮箱</label><input id="user" name="user" type="email" required autocomplete="off"><label for="pass">QQ 邮箱授权码</label><input id="pass" name="pass" type="password" required autocomplete="new-password"><p class="note">点击后会验证 SMTP 登录，将此授权码保存到腾讯云 suixing-api 的服务端环境变量，并发送一封测试邮件。此页面仅在本机开放，不会将授权码写入项目文件或聊天记录。</p><button id="submit">验证、保存到云函数并发送测试邮件</button></form><output id="status">等待填写</output></main><script>const form=document.getElementById('form'),out=document.getElementById('status'),button=document.getElementById('submit');form.onsubmit=async e=>{e.preventDefault();button.disabled=true;const pass=document.getElementById('pass');const body=JSON.stringify({user:document.getElementById('user').value,pass:pass.value,token:'${token}'});pass.value='';out.textContent='正在验证并配置，请稍候…';try{const r=await fetch(location.pathname+'/configure',{method:'POST',headers:{'Content-Type':'application/json'},body});const result=await r.json();out.textContent=result.stage;}catch{out.textContent='连接失败，请检查配置服务是否仍在运行。';}button.disabled=false;};setInterval(async()=>{try{const r=await fetch(location.pathname+'/status');const s=await r.json();if(s.configured||s.stage!=='等待填写')out.textContent=s.stage;}catch{}},1500);</script></html>`;
const server=http.createServer(async(req,res)=>{
 const reply=(code,data,type='application/json')=>{res.writeHead(code,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"});res.end(type==='application/json'?JSON.stringify(data):data);};
 if(req.headers.host!==`127.0.0.1:${port}`)return reply(403,{stage:'访问被拒绝'});
 if(req.method==='GET'&&req.url===route)return reply(200,html(),'text/html');
 if(req.method==='GET'&&req.url===route+'/status')return reply(200,status);
 if(req.method!=='POST'||req.url!==route+'/configure'||req.headers.origin!==`http://127.0.0.1:${port}`)return reply(404,{stage:'页面不存在'});
 if(busy)return reply(409,{stage:'正在配置，请稍候'});
 let input,raw='';try{for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('INPUT_TOO_LONG');}input=JSON.parse(raw);}catch{return reply(400,{stage:'填写内容无效'});}
 if(input.token!==token||typeof input.pass!=='string'||!/^[a-zA-Z]{16,64}$/.test(input.pass.trim()))return reply(400,{stage:'请填写 QQ 邮箱生成的授权码，不是 QQ 登录密码'});
 const patch={AI_BUDGET_ALERT_TRANSPORT:'smtp',AI_BUDGET_SMTP_USER:String(input.user||'').trim(),AI_BUDGET_SMTP_PASS:input.pass.trim()};
 busy=true;
 try{
  status={...status,stage:'正在验证 SMTP 登录…'};
  const transport=nodemailer.createTransport(smtpOptions(patch));try{await transport.verify();}finally{transport.close();}
  status={...status,stage:'SMTP 已通过，正在保存云函数配置…'};
  const credential=cliCredential(),before=await cloudApi('scf','2018-04-16','GetFunction',{...target,ShowCode:'FALSE'},credential);
  const original=before.Environment?.Variables||[],values=Object.fromEntries(original.map(v=>[v.Key,v.Value]));
  const merged=new Map(original.map(v=>[v.Key,v.Value]));for(const [key,value]of Object.entries(patch))merged.set(key,value);merged.delete('AI_BUDGET_ALERT_POLICY_ID');
  await cloudApi('scf','2018-04-16','UpdateFunctionConfiguration',{...target,Environment:{Variables:[...merged].map(([Key,Value])=>({Key,Value}))}},credential);
  let verified=false;for(let i=0;i<20;i++){
   const after=await cloudApi('scf','2018-04-16','GetFunction',{...target,ShowCode:'FALSE'},credential),actual=new Map((after.Environment?.Variables||[]).map(v=>[v.Key,v.Value]));
   if(after.Status==='Active'&&[...merged].every(([k,v])=>actual.get(k)===v)){verified=true;break;}await new Promise(r=>setTimeout(r,800));
  }
  if(!verified)throw Error('ENV_VERIFY_PENDING');
  status={...status,configured:true,stage:'配置已保存，正在从云端发送测试邮件…'};
  const data={issuedAt:Date.now(),nonce:randomUUID(),mode:'test'};data.signature=signBudgetMaintenance(data,values.AI_WORKER_SECRET);
  const invoked=await cloudApi('scf','2018-04-16','Invoke',{...target,InvocationType:'RequestResponse',ClientContext:JSON.stringify({operation:'aiBudgetMaintenance',data})},credential);
  const result=JSON.parse(invoked.Result?.RetMsg||'{}');if(!result.ok)throw Error(result.code||'CLOUD_EMAIL_TEST_FAILED');
  status={configured:true,testSent:true,stage:'配置完成：云端已发送测试邮件，请到 QQ 邮箱查收。',deliveryId:result.deliveryId};
 }catch(e){const code=/^[A-Za-z0-9_.]+$/.test(e.code||e.message||'')?e.code||e.message:'MAIL_CONFIG_FAILED';status={...status,stage:`配置未完成（${code}）。请检查授权码或稍后重试。`};}
 finally{busy=false;input.pass='';patch.AI_BUDGET_SMTP_PASS='';raw='';}
 reply(200,status);
});
server.listen(0,'127.0.0.1',()=>{port=server.address().port;console.log(`本机邮件配置页：http://127.0.0.1:${port}${route}`);});
setTimeout(()=>server.close(),3600000).unref();
