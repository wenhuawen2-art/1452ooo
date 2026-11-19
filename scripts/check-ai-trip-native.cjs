/* Native DevTools UI regression. Backend responses and trips are isolated fixtures.
   No production trip is created, edited or deleted. */
const fs = require('node:fs');
const path = require('node:path');
const Connection = require('miniprogram-automator/out/Connection').default;
const MiniProgram = require('miniprogram-automator/out/MiniProgram').default;
const {createTrip,viewTrip} = require('../shared/domain.cjs');
const output = path.resolve('output');
const accountId = 'native-trip-isolation-qa';
const prefix = `xiangye-ai-session:${accountId}`;
const makeTrip = (name,start,end) => {const {trip,member}=createTrip({accountId,nickname:'切换验收',avatarId:'avatar-01',name,type:'旅游',start,end});return viewTrip(trip,member);};
const a = makeTrip('杭州旧旅行 · 原生验收','2026-11-16T08:00','2026-11-18T18:00');
const b = makeTrip('成都新旅行 · 原生验收','2026-11-20T08:00','2026-11-22T18:00');
async function run(){
 const app = new MiniProgram(await Connection.create(process.env.WECHAT_AUTOMATION_URL||'ws://127.0.0.1:9420'));
 const report={scope:'WeChat DevTools native pages; isolated trip/API fixtures; no production writes',checks:[],exceptions:[],screenshots:[],timestamp:new Date().toISOString()};
 let installed=false;
 const check=(name,passed,details={})=>{report.checks.push({name,passed:!!passed,...details});console.log(name,passed);if(!passed)throw new Error(name);};
 app.on('exception',e=>report.exceptions.push(String(e.message||e)));
 async function shot(name){try{await Promise.race([app.screenshot({path:path.join(output,name)}),new Promise((_,reject)=>setTimeout(()=>reject(Error('screenshot timeout')),2500))]);report.screenshots.push(name);}catch(e){report.screenshotError=e.message;}}
 async function current(path){for(let i=0;i<60;i++){const p=await app.currentPage();if(p?.path===path)return p;await new Promise(r=>setTimeout(r,100));}throw Error('Page did not open: '+path);}
 // A 2.02 DevTools tap response can be lost when the tapped page is destroyed.
 async function navTap(element){await Promise.race([element.tap(),new Promise(resolve=>setTimeout(resolve,350))]);}
 const homePath='pages/index/index',aiPath='subpackages/ai/pages/chat/index';
 try{
  const old=await app.currentPage();if(old?.path!==homePath)await app.reLaunch('/'+homePath);
  await app.evaluate((a,b,accountId,prefix)=>{
   const host=getApp();if(host.__tripChatQA)throw Error('Trip chat fixture already installed');
   const keys=wx.getStorageInfoSync().keys.filter(k=>k.startsWith(prefix)||['xiangye-current-trip','xiangye-profile-trip'].includes(k));
   const saved=keys.map(key=>[key,wx.getStorageSync(key)]);
   host.__tripChatQA={a,b,accountId,prefix,saved,originalCall:wx.cloud.callFunction,originalPreview:wx.__localPreview,created:false,calls:[],submits:[],conversations:{'conv-native-a':{conversationId:'conv-native-a',tripId:a.id,messages:[{id:'a-user',role:'user',text:'杭州旧旅行：想逛西湖'},{id:'a-assistant',role:'assistant',text:'杭州旧旅行记录：西湖散步与茶歇。'}],activeJobId:''}}};
   const q=host.__tripChatQA;
   for(const key of keys)if(key.startsWith(prefix))wx.removeStorageSync(key);
   // Seed the old account-wide pointer to verify safe migration and rejection in B.
   wx.setStorageSync(prefix,{conversationId:'conv-native-a'});wx.setStorageSync('xiangye-current-trip',a.id);wx.removeStorageSync('xiangye-profile-trip');
   wx.__localPreview=true;
   wx.cloud.callFunction=async options=>{
    const op=options.data.operation,input=options.data.data||{};q.calls.push({op,input});let data;
    const trip=id=>id===q.a.id?q.a:id===q.b.id&&q.created?q.b:null;
    if(op==='bootstrapAccount')data={account:{id:accountId,nickname:'切换验收',avatarId:'avatar-01',profileComplete:true},trips:q.created?[q.a,q.b]:[q.a]};
    else if(op==='listTrips')data=q.created?[q.a,q.b]:[q.a];
    else if(op==='getAiCapabilities')data={enabled:true,allowed:true,canUse:true,dailyLimit:20,remainingToday:20,activeJobId:'job-in-another-trip',globalBudget:{reason:q.globalExhausted?'AI_GLOBAL_DAILY_LIMIT':''}};
    else if(op==='getTrip'){data=trip(input.tripId);if(!data)return {result:{ok:false,status:404,code:'AI_TRIP_NOT_FOUND',error:'旅行不存在'}};}
    else if(op==='createTrip'){q.b={...q.b,name:input.name,start:input.start,end:input.end,type:input.type};q.created=true;q.creation=input;data={trip:q.b};}
    else if(op==='getRouteOverview')data={available:false,points:[],segments:[],unresolved:[]};
    else if(op==='getWeather')data={available:false,reason:'out_of_range'};
    else if(op==='getAiConversation'){
     const conversation=input.conversationId?q.conversations[input.conversationId]:Object.values(q.conversations).find(c=>c.tripId===input.tripId);
     if(conversation&&conversation.tripId!==input.tripId)return {result:{ok:false,status:409,code:'AI_CONVERSATION_TRIP',error:'另一趟旅行'}};
     data=conversation||{conversationId:'',tripId:input.tripId,messages:[],activeJobId:''};
    }else if(op==='submitAiMessage'){
     const context=trip(input.tripId);if(!context)return {result:{ok:false,status:403,code:'AI_FORBIDDEN',error:'旅行无效'}};
     let conversation=input.conversationId&&q.conversations[input.conversationId];
     if(conversation&&conversation.tripId!==input.tripId)return {result:{ok:false,status:409,code:'AI_CONVERSATION_TRIP',error:'另一趟旅行'}};
     if(!conversation){conversation={conversationId:'conv-native-b',tripId:input.tripId,messages:[],activeJobId:''};q.conversations[conversation.conversationId]=conversation;}
     conversation.messages.push({id:'b-user',role:'user',text:input.message},{id:'b-assistant',role:'assistant',text:`当前规划：${context.name}，${context.start.slice(0,10)} 至 ${context.end.slice(0,10)}。`});
     q.submits.push({...input,contextName:context.name,contextStart:context.start});
     data={conversationId:conversation.conversationId,jobId:'job-native-b',status:'succeeded',remainingToday:19};
    }else return {result:{ok:false,status:403,code:'QA_UNSUPPORTED',error:'原生隔离验收未接入此操作'}};
    return {result:{ok:true,data:JSON.parse(JSON.stringify(data))}};
   };
  },a,b,accountId,prefix);
  installed=true;
  let home=await current(homePath);await home.callMethod('bootstrap');await home.waitFor(async()=>!(await home.data()).loading);
  await (await home.$('.ai-nav-entry')).tap();
  let chat=await current(aiPath);await chat.waitFor(async()=>(await chat.data()).ready);
  let data=await chat.data();check('A restores legacy account-wide history only after trip validation',data.allowed&&data.currentTrip.id===a.id&&data.messages[1]?.text.includes('杭州旧旅行记录'));
  await shot('ai-trip-native-A-restored.png');
  await navTap(await chat.$('.ai-back'));home=await current(homePath);
  await home.callMethod('openCreateTrip');
  await home.waitFor('.modal-submit');
  await (await home.$('.form-sheet input[data-field="name"]')).input(b.name);
  await home.callMethod('bindDate',{currentTarget:{dataset:{field:'startDate'}},detail:{value:'2026-11-20'}});
  await home.callMethod('bindDate',{currentTarget:{dataset:{field:'endDate'}},detail:{value:'2026-11-22'}});
  await (await home.$('.modal-submit')).tap();
  await home.waitFor(async()=>(await home.data()).trip?.id===b.id&&!(await home.data()).busy);
  await home.waitFor(async()=>!(await home.$('.form-sheet')));await home.waitFor(350);
  check('B is created through the native travel form',await app.evaluate(()=>!!getApp().__tripChatQA.creation));
  await (await home.$('.ai-nav-entry')).tap();chat=await current(aiPath);await chat.waitFor(async()=>(await chat.data()).ready);
  data=await chat.data();check('new B opens blank and ignores A active job',data.allowed&&data.currentTrip.id===b.id&&data.messages.length===0&&!data.conversationId&&!data.jobId);
  check('B displays its own dates and current-trip label',data.currentTrip.start==='2026-11-20T08:00'&&(await (await chat.$('.ai-trip-context')).text()).includes(b.name));
  await shot('ai-trip-native-B-blank.png');
  await (await chat.$('.ai-composer textarea')).input('帮我按当前旅行的日期规划行程');await (await chat.$('.ai-send')).tap();
  await chat.waitFor(async()=>(await chat.data()).messages.length===2);
  const submit=await app.evaluate(()=>getApp().__tripChatQA.submits.at(-1));
  check('B sends B trip ID without A conversation ID',submit.tripId===b.id&&!submit.conversationId&&submit.contextStart==='2026-11-20T08:00',{tripId:submit.tripId,contextStart:submit.contextStart});
  check('B reply uses the newly created trip context',(await chat.data()).messages[1].text.includes(b.name));
  await shot('ai-trip-native-B-context.png');
  await navTap(await chat.$('.ai-back'));home=await current(homePath);
  await home.callMethod('openProfilePage');let profile=await current('pages/profile/index');
  await profile.waitFor(`.pp-switch-trip[data-id="${a.id}"]`);await navTap(await profile.$(`.pp-switch-trip[data-id="${a.id}"]`));home=await current(homePath);
  await home.waitFor(async()=>(await home.data()).trip?.id===a.id);await home.waitFor(350);await home.callMethod('openAiAssistant');
  chat=await current(aiPath);await chat.waitFor(async()=>(await chat.data()).ready);data=await chat.data();
  check('profile switch back to A restores A only',data.currentTrip.id===a.id&&data.conversationId==='conv-native-a'&&data.messages.length===2&&data.messages[1].text.includes('杭州旧旅行记录'));
  await shot('ai-trip-native-A-return.png');
  await navTap(await chat.$('.ai-back'));home=await current(homePath);await home.callMethod('openProfilePage');profile=await current('pages/profile/index');
  await profile.waitFor(`.pp-switch-trip[data-id="${b.id}"]`);await navTap(await profile.$(`.pp-switch-trip[data-id="${b.id}"]`));home=await current(homePath);
  await home.waitFor(async()=>(await home.data()).trip?.id===b.id);await home.waitFor(350);await home.callMethod('openAiAssistant');chat=await current(aiPath);await chat.waitFor(async()=>(await chat.data()).ready);data=await chat.data();
  check('returning to B restores B history',data.conversationId==='conv-native-b'&&data.messages.length===2&&data.messages[1].text.includes(b.name));
  // Remove just the local pointer: the native client must recover B from the API.
  await app.evaluate(prefix=>wx.removeStorageSync(prefix+':trip:'+getApp().__tripChatQA.b.id),prefix);
  await navTap(await chat.$('.ai-back'));home=await current(homePath);await home.waitFor(350);await app.navigateTo('/'+aiPath+'?tripId='+b.id);chat=await current(aiPath);await chat.waitFor(async()=>(await chat.data()).ready);
  check('B cloud lookup restores history without a local pointer',(await chat.data()).conversationId==='conv-native-b');
  await app.evaluate(()=>getApp().__tripChatQA.globalExhausted=true);
  await navTap(await chat.$('.ai-back'));home=await current(homePath);await home.waitFor(350);await app.navigateTo('/'+aiPath+'?tripId='+b.id);chat=await current(aiPath);await chat.waitFor(async()=>(await chat.data()).ready);
  data=await chat.data();
  check('global limit keeps B history visible and shows the limit notice',data.messages.length===2&&!!data.globalLimitReason&&(await (await chat.$('.ai-budget-notice')).text()).includes('额度'));
  const count=await app.evaluate(()=>getApp().__tripChatQA.submits.length);
  await (await chat.$('.ai-composer textarea')).input('额度耗尽后的请求');await (await chat.$('.ai-send')).tap();await chat.waitFor(300);
  check('global limit blocks a new native submission',(await app.evaluate(()=>getApp().__tripChatQA.submits.length))===count);
  await shot('ai-trip-native-budget-exhausted.png');
  report.storage=await app.evaluate(prefix=>wx.getStorageInfoSync().keys.filter(k=>k.startsWith(prefix)),prefix);
 }catch(error){report.error=error.stack||String(error);try{const p=await app.currentPage(),d=await p.data();report.failureState={path:p.path,tripId:d.trip?.id,modal:d.modal,busy:d.busy,guestMode:d.guestMode,authState:d.authState,aiAvailable:d.aiAvailable,error:d.error};report.recentCalls=await app.evaluate(()=>getApp().__tripChatQA?.calls.slice(-10));}catch{}}
 finally{
  if(installed){try{
   await app.evaluate(()=>{const q=getApp().__tripChatQA;if(!q)return;for(const p of getCurrentPages())if(p.route==='subpackages/ai/pages/chat/index')p.onHide();wx.cloud.callFunction=q.originalCall;wx.__localPreview=q.originalPreview;for(const key of wx.getStorageInfoSync().keys)if(key.startsWith(q.prefix)||['xiangye-current-trip','xiangye-profile-trip'].includes(key))wx.removeStorageSync(key);for(const [key,value]of q.saved)wx.setStorageSync(key,value);delete getApp().__tripChatQA;});
   await app.reLaunch('/'+homePath);report.fixtureRestored=true;
  }catch(error){report.restoreError=error.message;}}
  app.disconnect();report.passed=!report.error&&!report.restoreError&&!report.exceptions.length&&report.checks.every(c=>c.passed);
  fs.writeFileSync(path.join(output,'ai-trip-native-verification-20261110.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
