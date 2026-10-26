// Local-only native-template preview. All mutations are confined to memory.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const root = path.resolve('wechat-miniprogram/miniprogram');
const req = createRequire(import.meta.url);
const domain = req('../shared/domain.cjs');
const { checklistTemplates } = req('../shared/templates.cjs');
const { weatherStops, cityWeathers, demoCityWeather } = req('../shared/weather-cities.cjs');
const weatherFixture = req('./weather-design-fixture.cjs');
const sessions = new Map();
const read = f => fs.readFileSync(f,'utf8');
const esc = s => String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function expand(file) { return read(file).replace(/<include src="([^"]+)"\s*\/>/g,(_,p)=>expand(path.resolve(path.dirname(file),p))); }
function css(file) { return read(file).replace(/@import\s+["'](.+?)["'];/g,(_,p)=>css(path.resolve(path.dirname(file),p))).replace(/(-?[\d.]+)rpx/g,'calc(var(--unit) * $1)').replace(/(?<![.\w-])page\s*\{/g,'body{').replace(/\b(image|view|text)(?=[^{}]*\{)/g,tag=>({image:'img',view:'div',text:'span'}[tag])); }
function parse(source) {
 const ast={tag:'root',a:{},children:[]}, stack=[ast];
 const tokens=source.replace(/{{[\s\S]*?}}/g,x=>x.replaceAll('<','\uE000')).match(/<!--[\s\S]*?-->|<\/?[\w-]+(?:"[^"]*"|'[^']*'|[^'">])*\/?\s*>|[^<]+/g)||[];
 for(const token of tokens){const t=token.replaceAll("\uE000","<");if(t.startsWith('<!--'))continue;if(t.startsWith('</')){stack.pop();continue}if(t.startsWith('<')){const tag=t.match(/^<([\w-]+)/)[1],a={};for(const m of t.slice(tag.length+1).matchAll(/([\w:-]+)(?:="([^"]*)")?/g))a[m[1]]=m[2]??'';const n={tag,a,children:[]};stack.at(-1).children.push(n);if(!/\/\s*>$/.test(t))stack.push(n)}else stack.at(-1).children.push(t)}return ast.children;
}
const evaluate=(s,d)=>{try{return Function('d',`with(d){return (${s})}`)(d)}catch{return undefined}};
const value=(s,d)=>/^{{[\s\S]*}}$/.test(s||'')?evaluate(s.slice(2,-2),d):s;
const interpolate=(s,d)=>String(s??'').replace(/{{([\s\S]*?)}}/g,(_,e)=>evaluate(e,d)??'');
function render(nodes,d,session){let result='',matched=false;for(const n of nodes){if(typeof n==='string'){result+=esc(interpolate(n,d));continue}const a=n.a;
 if(a['wx:for']){const arr=value(a['wx:for'],d)||[];result+=arr.map((item,index)=>render([{...n,a:{...a,'wx:for':null}}],{...d,[a['wx:for-item']||'item']:item,[a['wx:for-index']||'index']:index},session)).join('');continue}
 if(a['wx:if']!==undefined){matched=!!value(a['wx:if'],d);if(!matched)continue}else if(a['wx:elif']!==undefined){if(matched)continue;matched=!!value(a['wx:elif'],d);if(!matched)continue}else if('wx:else' in a){if(matched)continue;matched=true}else matched=false;
 if(n.tag==='block'){result+=render(n.children,d,session);continue}
 const tags={view:'div',text:'span','scroll-view':'div',image:'img',picker:'label',map:'div',switch:'input'};const tag=tags[n.tag]||n.tag;
 let attrs='';for(const k of ['class','style','src','placeholder','maxlength','aria-label','aria-hidden','role','id'])if(a[k]!=null)attrs+=` ${k}="${esc(k === "style" ? interpolate(a[k],d).replace(/(-?[\d.]+)rpx/g,"calc(var(--unit) * $1)") : interpolate(a[k],d))}"`;
 if(a['hover-class']==='motion-pressed'||(n.tag==='button'&&a['hover-class']!=='none'))attrs+=' data-press="true"';
 if(n.tag==='scroll-view')attrs+=' data-scroll="'+(a['scroll-x']!==undefined?'x':'y')+'"';
 if(n.tag==='image')attrs+=' style="object-fit:'+(a.mode==='aspectFit'?'contain':'cover')+'"';
 if(value(a.disabled,d))attrs+=' disabled';
 if(value(a.loading,d))attrs+=' aria-busy="true"';
 const dataset={};for(const [k,v] of Object.entries(a))if(k.startsWith('data-'))dataset[k.slice(5)]=value(v,d)??interpolate(v,d);
 const methods=Object.entries(a).filter(([k])=>/^(bind|catch)/.test(k));let eid='';if(methods.length){eid=String(session.events.length);session.events.push({methods:Object.fromEntries(methods),dataset});attrs+=` data-event="${eid}" data-binding="${esc(JSON.stringify({methods:Object.fromEntries(methods),dataset}))}"`;}
 if(n.tag==='picker'){attrs=attrs.replace(/ class="([^"]*)"/,(_,c)=>' class="browser-picker '+c+'"');if(!attrs.includes('class='))attrs+=' class="browser-picker"';const kind=a.mode||'selector';let input='';if(kind==='date'||kind==='time')input=`<input type="${kind}" value="${esc(value(a.value,d))}" data-picker="${eid}">`;else {const list=value(a.range,d)||[];input=`<select data-picker="${eid}">${list.map((x,i)=>`<option value="${i}" ${i===Number(value(a.value,d))?'selected':''}>${esc(a['range-key']?x[a['range-key']]:x)}</option>`).join('')}</select>`}result+=`<label${attrs}>${render(n.children,d,session)}${input}</label>`;continue}
 if(n.tag==='input'){attrs+=` value="${esc(value(a.value,d)||'')}" type="${a.type==='digit'?'number':a.type==='number'?'number':'text'}"`;}
 if(n.tag==='switch')attrs+=` type="checkbox" ${value(a.checked,d)?'checked':''}`;
 if(n.tag==='map'){result+=`<div${attrs}><div class="preview-map"><svg viewBox="0 0 400 220"><path d="M-10 150 Q80 80 180 130 T420 35 M30 -10 Q90 70 35 240 M245 -10 Q180 50 300 230" fill="none" stroke="#d0dddb" stroke-width="20"/><path d="M55 160 Q155 145 195 95 T345 60" fill="none" stroke="#438fe8" stroke-width="4" stroke-dasharray="6 3"/><circle cx="55" cy="160" r="9" fill="#17212c"/><circle cx="345" cy="60" r="9" fill="#438fe8"/></svg><small>路线示意 · 小程序内显示腾讯地图</small></div></div>`;continue}
 result+=`<${tag}${attrs}>${n.tag==='textarea'?esc(value(a.value,d)||''):render(n.children,d,session)}${['img','input'].includes(tag)?'':`</${tag}>`}`;
 }return result;}
function sessionFor(mode='member'){
 const latestId=mode.startsWith('latest-')?mode.slice(7):'';const latestModes={'166-13576':'home-design','166-14296':'home-design-alt','166-17027':'route-design','166-14643':'expense-design','166-11432':'expense-design-split','166-11762':'expense-design-stats','166-13015':'list-design','166-15378':'list-design-personal','166-16574':'outfit-design','166-13989':'outfit-design-empty','166-12639':'route-design','166-12361':'route-design-empty','166-15849':'profile-design','166-16165':'profile-design'};mode=latestModes[latestId]||mode;
 let def;const s={events:[],toast:'',confirm:null,decision:undefined};
 const wx={__localPreview:true,showLoading(){},hideLoading(){},showToast(o){s.toast=o.title},getStorageSync(){},setStorageSync(){},pageScrollTo(options){s.scrollTop=options.scrollTop;},previewImage:async(options)=>{s.previewImage=options;},getSystemInfoSync(){return {statusBarHeight:24,windowWidth:390}},getMenuButtonBoundingClientRect(){return {top:28,height:32,left:290}},showModal(o){if(s.decision===undefined){s.confirm=o;o.success?.({confirm:false});}else o.success?.({confirm:s.decision});},cloud:{deleteFile:async()=>({})}};
 const loadMini=file=>{if(!path.extname(file))file+='.js';const module={exports:{}};vm.runInNewContext(read(file),{module,exports:module.exports,require:p=>p.startsWith('.')?loadMini(path.resolve(path.dirname(file),p)):req(p),Date,setTimeout,clearTimeout});return module.exports};
 vm.runInNewContext(read(path.join(root,'pages/index/index.js')),{Page:x=>def=x,wx,setTimeout,clearTimeout,require:p=>loadMini(path.join(root,'pages/index',p))});
 const p={...def,data:structuredClone(def.data),setData(patch,done){for(const [key,val]of Object.entries(patch)){const keys=key.replace(/\[(\d+)\]/g,'.$1').split('.');let obj=this.data;keys.slice(0,-1).forEach(k=>obj=obj[k]??=(/^\d+$/.test(k)?[]:{}));obj[keys.at(-1)]=val}done?.();}};
 p.installPresentation?.();p.loadGuestExperience();p.data.guestMode=mode==='guest';p.data.authState=mode==='guest'?'guest':'authenticated';p.data.statusBarHeight=24;p.data.headerHeight=68;
 if(mode!=='guest')p.data.account.nickname='林一';
 if(mode==='stress'){
   p.data.trip.name='川西高原与山野之间的一段很长很长的秋日旅行计划';
   const first=p.data.trip.outfits[0];if(first){first.title='清晨徒步到傍晚观景的多层穿搭与替换衣物';first.items=Array.from({length:8},(_,i)=>({...first.items[i%first.items.length],id:'stress-piece-'+i,name:'应对高原昼夜温差的备用衣物 '+(i+1),photoFileId:'',photoUrl:'',photoSrc:''}));}
   const item=p.data.trip.items[0];if(item)p.data.trip.items.push(...Array.from({length:24},(_,i)=>({...item,id:'stress-item-'+i,title:'长列表测试：出发之前再次确认的重要随身物品 '+(i+1)})));
   if(p.data.expenses[0])Object.assign(p.data.expenses[0],{title:'包含多位同行者的全程交通住宿大额费用',amountMinor:1234567890,baseAmountMinor:1234567890});
   p.derive();p.deriveExpenseView();
 }
 s.p=p;s.expenses=structuredClone(p.data.expenses);s.trips=[structuredClone(p.data.trip)];
 if(mode==='route-design'||mode==='route-design-empty'){req('./route-design-fixture.cjs')(p,mode==='route-design-empty');s.trips=[structuredClone(p.data.trip)];}
 if(['list-design','list-design-personal','outfit-design','outfit-design-empty'].includes(mode)){req('./list-design-fixture.cjs')(p,mode);s.trips=[structuredClone(p.data.trip)];}
 if(mode.startsWith('home-design')){req('./home-design-fixture.cjs')(p,mode==='home-design-alt');s.trips=[structuredClone(p.data.trip)];}
 if(mode.startsWith('weather-design')){weatherFixture.apply(p,mode);s.trips=[structuredClone(p.data.trip)];}
 if(mode.startsWith('expense-design')){req('./expense-design-fixture.cjs')(p,mode);s.trips=[structuredClone(p.data.trip)];}
 if(['loading','loading-v1','loading-v2','loading-static'].includes(mode)){p.data.loading=true;p.data.loadingVersion=mode==='loading-v1'?'v1':mode==='loading-v2'?'v2':'v3';if(mode==='loading-static')p.data.reducedMotion=true;} if(mode==='empty'||mode==='onboarding-guest'){p.data.trip=null;p.data.trips=[];s.emptyTripSeed=structuredClone(s.trips[0]);s.trips=[];if(mode==='onboarding-guest')p.loadGuestLanding();}if(mode==='archived')p.data.trip.archived=true;
 p.call=async(operation,input={})=>{if(s.failNext){s.failNext=false;throw Error('模拟网络失败，请重试；草稿已保留')}const t=p.data.trip;
  if(operation==='mutateTrip'){const updated=structuredClone(t);domain.mutateTrip(updated,updated.members.find(m=>m.id===updated.me),input);s.trips=s.trips.map(x=>x.id===updated.id?updated:x);return {trip:updated};}
  if(operation==='listTrips')return s.trips;
  if(operation==='listChecklistTemplates')return structuredClone(checklistTemplates);
  if(operation==='getTrip')return s.trips.find(x=>x.id===input.tripId)||t;
  if(operation==='listExpenses')return {expenses:s.expenses,settlements:s.settlements||[],members:t?.members||[],settings:p.data.expenseSettings};
  if(operation==='saveSettlement'){s.settlements=[...(s.settlements||[]),{...input,id:'settlement-'+Date.now()}];return {revision:t.revision+1};}
  if(operation==='deleteSettlement'){s.settlements=(s.settlements||[]).filter(x=>x.id!==input.id);return {revision:t.revision+1};}
  if(operation==='saveExpense'){const id=input.id||'preview-'+Date.now();const amountMinor=Math.round(Number(input.amount)*100);const entry={...input,id,amountMinor,baseAmountMinor:amountMinor,participants:(input.participants||[]).map(x=>typeof x==='string'?{memberId:x,amountMinor:Math.floor(amountMinor/input.participants.length)}:x)};s.expenses=[...s.expenses.filter(x=>x.id!==id),entry];return {revision:t.revision+1};}
  if(operation==='deleteExpense'){s.expenses=s.expenses.filter(x=>x.id!==input.id);return {revision:t.revision+1};}
  if(operation==='createTrip'){const created=structuredClone(s.trips[0]||s.emptyTripSeed);Object.assign(created,{id:'preview-'+Date.now(),name:input.name,type:input.type,start:input.start,end:input.end,items:[],events:[],hotels:[],categories:[],outfits:[],tickets:[]});s.trips.push(created);return {trip:created};}
  if(operation==='activateAccount')return {account:p.data.account||{nickname:'微信用户',avatarId:'avatar-01-alpaca',profileComplete:true},trips:s.trips};
  if(operation==='updateAccountProfile')return {account:{...p.data.account,...input}};
  if(operation==='getRouteOverview')return p.data.routeOverview;
  if(operation==='getWeather')return weatherFixture.forecasts[input.place]||demoCityWeather(input.place);
  throw Error('此预览不连接外部服务；请在小程序中使用此操作');
 };
 p.loadRouteOverview=async()=>{};
 s.loadWeatherCities=async()=>{s.weatherCities=await cityWeathers(weatherStops(p.data.trip,p.data.routeOverview),stop=>p.data.guestMode?demoCityWeather(stop.place):p.call('getWeather',{tripId:p.data.trip.id,...stop,current:true}));};
 p.showWeatherDetails=async()=>{s.weatherScroll=p.currentScroll||0;s.weatherOpen=true;s.scrollTop=0;await s.loadWeatherCities();};
 p.previewWeatherBack=()=>{s.weatherOpen=false;s.scrollTop=s.weatherScroll||0;};
 p.previewWeatherRetry=async()=>{await s.loadWeatherCities();};
 // Browser equivalent of the native profile page; reuse its WXML and existing actions.
 p.openProfilePage=()=>{if(!p.requireLogin('profilePage'))return;s.profileScroll=p.currentScroll||0;s.profileOpen=true;s.expandedTripId=p.data.trip?.id||'';s.expandedTripIds=s.expandedTripIds||(p.data.trip?.id?[p.data.trip.id]:[]);s.profileTripDetails=s.profileTripDetails||{};s.scrollTop=0;};
 p.previewProfileToggle=async(event)=>{const id=event.currentTarget.dataset.id;s.expandedTripId=id;const ids=s.expandedTripIds||[],opening=!ids.includes(id);s.expandedTripIds=opening?[...ids,id]:ids.filter(value=>value!==id);if(opening&&id!==p.data.trip?.id){const r=await p.call('getTrip',{tripId:id});s.profileTripDetails={...s.profileTripDetails,[id]:r.trip||r};}};
 p.previewProfileSettings=()=>{s.profileSettingsOpen=!s.profileSettingsOpen;};
 p.previewProfileBack=()=>{s.profileOpen=false;s.scrollTop=s.profileScroll||0;};
 p.previewProfileCommand=async(event)=>{const {method,id,member}=event.currentTarget.dataset;if(['editProfile','createTrip','editTrip','cloneTrip'].includes(method)){if(id&&id!==p.data.trip?.id)await p.loadTrip(id);const actions={editProfile:()=>p.openProfile(false),createTrip:()=>p.openCreateTrip(),editTrip:()=>p.openEditTrip(),cloneTrip:()=>p.openCloneTrip()};return actions[method]();}p.previewProfileBack();if(id&&id!==p.data.trip?.id&&method!=='deleteTrip')await p.loadTrip(id);if(method==='removeMember')return p.confirmDelete({currentTarget:{dataset:{action:'removeMember',id:member}}});if(method==='copyInvite'){s.toast='本地预览：邀请链接已准备，小程序内可复制分享';return;}const action={editProfile:'openProfile',createTrip:'openCreateTrip',editTrip:'openEditTrip',cloneTrip:'openCloneTrip',exportCalendar:'exportCalendar',exportTrip:'exportTrip',switchTrip:'switchTrip',deleteTrip:'deleteTrip'}[method];if(method==='archiveTrip')return p.confirmDelete({currentTarget:{dataset:{action:'archive',id:p.data.trip?.id}}});if(action)return p[action](method==='editProfile'?false:{currentTarget:{dataset:{id}}});};
 if(mode==='profile-design'){
 const names=['profile-first','profile-current','profile-last'];const members=Array.from({length:3},(_,i)=>({id:'profile-member-'+i,name:'用户昵称',avatarSrc:'/assets/mastergo-expenses/avatar-orb.png',avatarData:'/assets/mastergo-expenses/avatar-orb.png'}));
 p.data.account={...p.data.account,nickname:'啦啦啦',avatarSrc:'/assets/mastergo-profile/avatar.webp'};p.data.trips=names.map((id,i)=>({id,name:'川西秋日自驾',type:i===2?'露营':'自驾游',start:'2026-10-10T08:00',end:'2026-10-10T08:00',creator:members[0].id,me:members[0].id,members,revision:1}));p.data.trip=p.data.trips[1];s.trips=structuredClone(p.data.trips);p.data.isOwner=true;p.openProfilePage();
 }
 if(latestId==='166-12639')p.data.routeSection='lodging';if(latestId==='166-17027')p.data.routeMenu={kind:'event',id:'design-event-0'};if(latestId==='166-16165')s.expandedTripIds=['profile-first','profile-current'];
 s.wx=wx;s.id=crypto.randomUUID();sessions.set(s.id,s);return s;
}
function applyPreset(s,preset=''){
 if(preset==='weather-cities')return s.p.showWeatherDetails();
 const p=s.p, event=(dataset={})=>({currentTarget:{dataset}}), first=(list)=>list?.[0];
 const trip=p.data.trip, firstEvent=first(trip?.events), firstHotel=first(trip?.hotels), firstOutfit=first(trip?.outfits), firstGarment=firstOutfit&&first(firstOutfit.items), firstItem=first(trip?.items), firstCategory=first(trip?.categories), firstExpense=first(p.data.expenses);
 const template={id:'preview-template',name:'自驾出发清单',description:'适合三到五天自驾旅行的基础准备清单',iconSrc:'/assets/icons/template-road-trip-comfort.svg',groups:[{name:'证件与票据',items:['身份证','驾驶证','预订凭证']},{name:'车载用品',items:['充电线','纸巾','饮用水']}]};
 if(preset==='scope-personal'){p.setData({scope:'我的'});p.derive?.();}
 else if(preset==='expense-split')p.setData({expenseSegment:'split'});
 else if(preset==='expense-statistics')p.setData({expenseSegment:'stats'});
 else if(preset==='people-expanded')p.setData({tripManagementOpen:true});
 else if(preset==='route-map')p.setData({routeMapOpen:true,routeEditing:false});
 else if(preset==='route-edit'){p.setData({routeMapOpen:true});p.startRouteEdit?.();}
 else if(preset==='route-search'){p.setData({routeMapOpen:true});p.startRouteEdit?.();if(p.data.routeEditorPoints?.length)p.setData({routeSearchIndex:0,routeSearchKeyword:p.data.routeEditorPoints[0].address||p.data.routeEditorPoints[0].label||'四姑娘山镇',routeSearchResults:[{id:'poi-1',title:'四姑娘山景区',address:'四川省阿坝藏族羌族自治州小金县',latitude:31.09,longitude:102.85},{id:'poi-2',title:'双桥沟游客中心',address:'四姑娘山镇双桥沟入口',latitude:31.12,longitude:102.83}]});}
 else if(preset==='login-prompt')p.setData({loginPrompt:true,pendingIntent:'createTrip'});
 else if(preset==='profile')p.openProfile?.(false);
 else if(preset==='profile-required')p.openProfile?.(true);
 else if(preset==='trip-new')p.openCreateTrip?.();
 else if(preset==='trip-edit')p.openEditTrip?.();
 else if(preset==='clone-trip')p.openCloneTrip?.();
 else if(preset==='event-new')p.openEvent?.(event({date:p.data.selectedDate}));
 else if(preset==='event-edit'&&firstEvent)p.openEvent?.(event({id:firstEvent.id,date:firstEvent.date}));
 else if(preset==='hotel-new')p.openHotel?.(event({}));
 else if(preset==='hotel-edit'&&firstHotel)p.openHotel?.(event({id:firstHotel.id}));
 else if(preset==='item-new')p.openItem?.(event({category:firstCategory?.id||''}));
 else if(preset==='item-edit'&&firstItem)p.openItem?.(event({id:firstItem.id}));
 else if(preset==='category-new')p.openCategory?.(event({}));
 else if(preset==='category-edit'&&firstCategory)p.openCategory?.(event({id:firstCategory.id}));
 else if(preset==='category-menu'&&firstCategory)p.setData({categoryMenuId:firstCategory.id});
 else if(preset==='templates')p.setData({templates:[template],modal:{type:'templates',title:'导入清单模板',values:{}}});
 else if(preset==='template-detail')p.setData({templates:[template],modal:{type:'templateDetail',title:template.name,template,values:{}}});
 else if(preset==='ticket-new')p.setData({modal:{type:'ticket',title:'添加票据',values:{type:'门票',useDate:p.data.selectedDate,useClock:'09:00'}}});
 else if(preset==='ticket-edit')p.setData({modal:{type:'ticketMeta',title:'编辑票据',id:'preview-ticket',values:{type:'火车票',useDate:p.data.selectedDate,useClock:'08:36'}}});
 else if(preset==='outfit-new')p.openOutfit?.(event({}));
 else if(preset==='outfit-edit'&&firstOutfit)p.openOutfit?.(event({id:firstOutfit.id}));
 else if(preset==='garment-new'&&firstOutfit)p.openNewOutfitItem?.(event({outfit:firstOutfit.id}));
 else if(preset==='garment-edit'&&firstOutfit&&firstGarment)p.openOutfitItem?.(event({outfit:firstOutfit.id,item:firstGarment.id}));
 else if(preset==='outfit-types')p.openOutfitTypeManager?.();
 else if(preset==='expense-new')p.openExpense?.(event({}));
 else if(preset==='expense-edit'&&firstExpense)p.openExpense?.(event({id:firstExpense.id}));
 else if(preset==='expense-settings')p.openExpenseSettings?.();
 else if(preset==='join-trip')p.setData({modal:{type:'join',title:'加入 · 川西秋日自驾',invite:'WILD-2026',values:{}}});
 else if(preset==='guest-invite')p.setData({modal:{type:'guestInvite',title:'旅行邀请 · 川西秋日自驾',invite:'WILD-2026',values:{}}});
 else if(preset==='detail-event'&&firstEvent)p.openDetail?.(event({kind:'event',id:firstEvent.id}));
 else if(preset==='detail-hotel'&&firstHotel)p.openDetail?.(event({kind:'hotel',id:firstHotel.id}));
 else if(preset==='detail-expense'&&firstExpense)p.openDetail?.(event({kind:'expense',id:firstExpense.id}));
 else if(preset==='confirm-delete')s.confirm={title:'删除费用？',content:'删除后分账和统计会同步更新，确认删除？',cancelText:'取消',confirmText:'删除'};
 else if(preset==='confirm-discard')s.confirm={title:'放弃未保存的修改？',content:'修改尚未保存，你可以继续编辑。',cancelText:'继续编辑',confirmText:'放弃修改'};
 else if(preset==='validation-error'){p.openCreateTrip?.();p.setData({fieldErrors:{name:'请填写此项'},saveError:'请检查标记的字段'});}
 else if(preset==='save-error'){p.openExpense?.(event({}));p.setData({saveError:'模拟网络失败，请重试；草稿已保留'});}
 else if(preset==='page-error')p.setData({loading:false,error:'旅行数据暂时加载失败，请稍后重试'});
}
const shim=`html{scrollbar-width:none}html::-webkit-scrollbar{display:none}body.overlay-open{overflow:hidden}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif;font-size:15px}*{box-sizing:border-box}button,input,textarea,select{font:inherit}button{border:0;cursor:pointer}button::after{border:0}span{white-space:inherit}img{max-width:100%}input,textarea{outline:0}div[data-scroll=x]{overflow-x:auto}div[data-scroll=y]{overflow-y:auto}div[data-scroll]::-webkit-scrollbar{display:none}.browser-picker{display:block;position:relative}.browser-picker select,.browser-picker>input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}.preview-map{height:100%;background:#e8eeeb;position:relative;overflow:hidden}.preview-map svg{height:100%;width:100%}.preview-map small{position:absolute;bottom:8px;left:12px;color:#607b75;font-size:11px}#toast{position:fixed;bottom:110px;left:10%;right:10%;background:#17212ce8;color:white;padding:14px;border-radius:20px;z-index:999;text-align:center}.browser-confirm{position:fixed;inset:0;background:#15213566;display:grid;place-items:center;z-index:1000;padding:24px}.browser-confirm>div{background:white;border-radius:28px;padding:28px;width:100%;max-width:360px}.browser-confirm button{padding:14px;margin:12px 4px 0;background:#e9f1fc;border-radius:18px}`;
const client="const sheetRules=(()=>{const module={exports:{}};"+read(path.join(root,'utils/form-sheet.js'))+";return module.exports;})();\n"+read(path.resolve('scripts/preview-motion.js'))+'\n'+read(path.resolve('scripts/preview-client.js'));
const shell=read(path.resolve('scripts/preview-shell.html'));
http.createServer(async(request,response)=>{try{const url=new URL(request.url,'http://127.0.0.1');if(url.pathname.startsWith('/design-review')){const relative=decodeURIComponent(url.pathname.slice('/design-review'.length)).replace(/^\/$/, '/index.html')||'/index.html';const dir=path.resolve('docs/design-review');const f=path.resolve(dir,'.'+relative);if(!f.startsWith(dir+path.sep))throw Error('Invalid review path');response.setHeader('Content-Type',f.endsWith('.json')?'application/json; charset=utf-8':f.endsWith('.png')?'image/png':'text/html; charset=utf-8');response.end(fs.readFileSync(f));return;}if(url.pathname==='/favicon.ico'){response.writeHead(204);response.end();return}if(url.pathname==='/'){response.setHeader('Content-Type','text/html; charset=utf-8');response.end(shell);return}if(url.pathname==='/app'){response.setHeader('Content-Type','text/html; charset=utf-8');response.end(`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${shim}</style><style id="theme"></style><div id="app"></div><script>${client}</script>`);return}if(url.pathname==='/api'&&request.method==='POST'){let input='';for await(const b of request)input+=b;const payload=JSON.parse(input);let s=payload.mode?sessionFor(payload.mode):sessions.get(payload.sid)||sessionFor();s.toast='';s.confirm=null;s.previewImage=null;s.scrollTop=undefined;s.p.currentScroll=Number(payload.scrollTop)||0;s.decision=payload.confirm;if(payload.preset)await applyPreset(s,payload.preset);if(payload.fail)s.failNext=true;const binding=payload.binding||s.events[Number(payload.event)];if(binding){const method=binding.methods['catch'+payload.type]||binding.methods['bind'+payload.type];if(method&&typeof s.p[method]==='function')await s.p[method]({currentTarget:{dataset:binding.dataset},detail:{value:payload.value}});if(s.p.checklistQueue)await s.p.checklistQueue;}
 if(payload.tab && !payload.mode?.startsWith('latest-') && payload.tab!==s.p.data.tab)s.p.setTab({currentTarget:{dataset:{tab:payload.tab}}}); if(payload.device==='iphone'){s.p.setSafeArea(54,98,34);}else if(payload.device==='android'){s.p.setSafeArea(24,68,0);} if(payload.mode&&!s.p.data.loading&&s.p.data.tab==='today')await s.p.loadWeather();s.events=[];const profileData={...s.p.data,expandedTripId:s.expandedTripId,expandedTripIds:s.expandedTripIds,profileTripDetails:s.profileTripDetails,settingsOpen:s.profileSettingsOpen};const template=s.weatherOpen?expand(path.join(root,'pages/weather/index.wxml')).replaceAll('bindtap="back"','bindtap="previewWeatherBack"').replaceAll('bindtap="retryCity"','bindtap="previewWeatherRetry"'):s.profileOpen?expand(path.join(root,'pages/profile/index.wxml')).replaceAll('bindtap="command"','bindtap="previewProfileCommand"').replaceAll('bindtap="back"','bindtap="previewProfileBack"').replaceAll('bindtap="toggleTrip"','bindtap="previewProfileToggle"').replaceAll('bindtap="toggleSettings"','bindtap="previewProfileSettings"').replaceAll('bindchange="toggleMotion"','bindchange="toggleReducedMotion"'):expand(path.join(root,'pages/index/index.wxml'));if(s.profileOpen){const helperModule={exports:{}};vm.runInNewContext(read(path.join(root,'utils/profile-presentation.js')),{module:helperModule});profileData.profileTrips=helperModule.exports.buildProfileView(profileData,s.profileLoadedTrip);if(s.p.data.trip?.id==='profile-current')profileData.profileTrips.forEach(t=>t.memberCount=2);}const html=render(parse(template),s.weatherOpen?{...s.p.data,cities:s.weatherCities||[],loading:false}:s.profileOpen?profileData:s.p.data,s);response.setHeader('Content-Type','application/json');response.end(JSON.stringify({sid:s.id,scrollTop:s.scrollTop,previewImage:s.previewImage,html,css:css(path.join(root,'app.wxss'))+css(path.join(root,'pages/index/index.wxss'))+(s.weatherOpen?css(path.join(root,'pages/weather/index.wxss')):'')+(s.profileOpen?css(path.join(root,'pages/profile/index.wxss'))+'.preview-profile-nav{display:flex;align-items:center;gap:16px;padding:16px;background:#edf4fb}.preview-profile-nav button{background:white;border-radius:22px;min-height:44px;padding:0 16px}.preview-profile-nav>span{font-size:20px;font-weight:600}':'')+(payload.device==='iphone'?'.theme-route.route-planning .rg-page{padding-bottom:226px}.modal{padding-bottom:42px}':''),toast:s.toast,confirm:s.confirm&&{title:s.confirm.title,content:s.confirm.content,cancelText:s.confirm.cancelText,confirmText:s.confirm.confirmText}}));return}
 if(url.pathname.startsWith('/assets/')){const f=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!f.startsWith(root+path.sep))throw Error('Invalid path');response.setHeader('Content-Type',f.endsWith('.svg')?'image/svg+xml':f.endsWith('.png')?'image/png':f.endsWith('.jpg')?'image/jpeg':'application/octet-stream');response.end(fs.readFileSync(f));return}response.writeHead(404);response.end();}catch(error){response.writeHead(500,{'Content-Type':'application/json'});response.end(JSON.stringify({error:error.message}));}}).listen(Number(process.env.PREVIEW_PORT||4191),'127.0.0.1',()=>console.log(`Interactive preview http://127.0.0.1:${process.env.PREVIEW_PORT||4191}`));

