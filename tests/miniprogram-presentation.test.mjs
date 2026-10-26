import formSheet from './helpers/form-sheet-module.mjs';
import interactionMotion from './helpers/motion-module.mjs';
import weatherCities from '../shared/weather-cities.cjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const expenseModule = {exports:{}};
vm.runInNewContext(await readFile('wechat-miniprogram/miniprogram/utils/expense-presentation.js','utf8'),{module:expenseModule});
const expensePresentation=expenseModule.exports;
import test from 'node:test';
const source = await readFile('wechat-miniprogram/miniprogram/pages/index/index.js', 'utf8');
const editorSource = await readFile('wechat-miniprogram/miniprogram/pages/editor/index.js', 'utf8');
const demoSource = await readFile('wechat-miniprogram/miniprogram/pages/index/demo.js', 'utf8');
const demo = { exports: {} }; vm.runInNewContext(demoSource, { module: demo, Date });
function fixture() {
  let definition, dialog, navigate;
  const events = new Map(), sent = [], scrolls = [];
  const channel = { on: (name, fn) => events.set(name, fn), emit: (name, data) => sent.push({name, data}) };
  const wx = { getSystemInfoSync: () => ({statusBarHeight:24}), getMenuButtonBoundingClientRect: () => ({bottom:58}), getStorageSync() {}, setStorageSync() {}, showToast() {}, showLoading() {}, hideLoading() {}, pageScrollTo: e => scrolls.push(e), showModal: e => {dialog = e;}, navigateTo: e => {navigate = e;e.success({eventChannel:channel});}, cloud: {deleteFile: async()=>({})} };
  vm.runInNewContext(source, {Page: p=>definition=p, wx, require: name => name.includes('weather-cities') ? weatherCities : name.includes('interaction-motion') ? interactionMotion : name.includes('form-sheet') ? formSheet : name.includes("expense-presentation") ? expensePresentation : name.includes("loading-") ? [] : demo.exports, setTimeout, clearTimeout});
  const page = {...definition, data:structuredClone(definition.data), setData(patch,done) { for (const [key,value] of Object.entries(patch)) { const keys=key.replace(/\[(\d+)\]/g,'.$1').split('.'); let target=this.data; for(const k of keys.slice(0,-1)) target=target[k]??={}; target[keys.at(-1)]=value; } done?.(); }};
  page.installPresentation(); page.loadGuestExperience(); page.data.guestMode=false;
  page.loadWeather=()=>{};page.loadRouteOverview=()=>{};page.reloadTrips=async()=>{};page.loadExpenses=async()=>{};
  return {page,wx,events,sent,scrolls,nativeWeather:definition.loadWeather,get dialog(){return dialog;},get navigate(){return navigate;}};
}
const event = dataset=>({currentTarget:{dataset}});

test('home weather stays on the first itinerary city without changing the selected route date',async()=>{
 const f=fixture(),p=f.page,requests=[];
 p.data.trip={...p.data.trip,id:'first-weather-native',start:'2026-10-01T08:00',end:'2026-10-07T18:00',hotels:[],events:[{id:'w2',date:'2026-10-07',startTime:'09:00',address:'西安市'},{id:'w1',date:'2026-10-01',startTime:'09:00',address:'咸阳市'}]};
 p.data.tab='today';p.data.selectedDate='2026-10-07';
 p.call=async(operation,input)=>{requests.push(input);return {available:true,cityName:'咸阳市',current:12};};
 await f.nativeWeather.call(p);
 assert.equal(requests[0].place,'咸阳市');assert.equal(requests[0].date,'2026-10-01');assert.equal(requests[0].current,true);
 assert.equal(p.data.weather.location,'咸阳市');assert.equal(p.data.selectedDate,'2026-10-07');
 p.data.tab='list';p.data.listSection='outfit';await f.nativeWeather.call(p);
 assert.equal(requests[1].date,'2026-10-07');assert.equal(requests[1].current,false);
});
test('root floating actions close old content menus before opening their original editors',()=>{
 const {page:p}=fixture();p.openRouteMenu(event({kind:'event',id:p.data.trip.events[0].id}));p.openEvent(event({date:p.data.selectedDate}));assert.equal(p.data.routeMenu,null);assert.equal(p.data.modal.type,'event');
 p.setData({modal:null,listItemMenuId:'item',listMenuCategoryId:'group',outfitMenu:{id:'set'}});p.openCategory(event({}));assert.equal(p.data.listItemMenuId,'');assert.equal(p.data.outfitMenu,null);assert.equal(p.data.modal.type,'category');
});

test('checklist sections retain position and clear all menu state on navigation',()=>{
 const f=fixture(),p=f.page;p.setTab(event({tab:'list'}));p.onPageScroll({scrollTop:420});
 p.toggleCategoryMenu(event({id:p.data.trip.categories[0].id}));assert.ok(p.data.categoryMenuId);
 p.setListSection(event({section:'personal'}));assert.equal(p.data.categoryMenuId,'');assert.equal(f.scrolls.at(-1).scrollTop,0);
 p.onPageScroll({scrollTop:130});p.setListSection(event({section:'outfit'}));
 p.toggleOutfitMenu(event({id:'piece',kind:'piece',outfit:'set'}));assert.equal(p.data.outfitMenu.outfitId,'set');
 p.setListSection(event({section:'public'}));assert.equal(p.data.listSection,'personal');assert.equal(p.data.outfitMenu,null);assert.equal(f.scrolls.at(-1).scrollTop,130);
 p.setListSection(event({section:'public'}));assert.equal(f.scrolls.at(-1).scrollTop,420);
 p.toggleListItemMenu(event({id:'item',category:'cat'}));assert.equal(p.data.listMenuCategoryId,'cat');
 p.selectDate(event({date:p.data.dates[1].value}));assert.equal(p.data.listItemMenuId,'');assert.equal(p.data.listMenuCategoryId,'');
 p.toggleListItemMenu(event({id:'item',category:'cat'}));p.setTab(event({tab:'route'}));assert.equal(p.data.listMenuCategoryId,'');
});

test('safe area metrics are shared by native layout and the phone preview',()=>{
 const {page:p}=fixture();p.setSafeArea(54,98,34);assert.equal(p.data.listSafeInset,88);assert.equal(p.data.safeBottomInset,34);assert.equal(p.data.systemContentTop,104);assert.equal(p.data.systemHeaderHeight,160);assert.equal(p.editorSnapshot().systemContentTop,104);
 p.setSafeArea(24,68,0,true);assert.equal(p.data.listSafeInset,0);assert.equal(p.data.safeBottomInset,0);
 p.data.trip.archived=true;p.toggleCategoryMenu(event({id:'cat'}));p.toggleListItemMenu(event({id:'item'}));p.toggleOutfitMenu(event({id:'outfit',kind:'outfit'}));
 assert.equal(p.data.categoryMenuId,'');assert.equal(p.data.listItemMenuId,'');assert.equal(p.data.outfitMenu,null);
});
test('route sections preserve positions and close stale menus on date and navigation changes',()=>{
 const f=fixture(),p=f.page;p.setTab(event({tab:'route'}));p.onPageScroll({scrollTop:420});p.openRouteMenu(event({kind:'event',id:p.data.trip.events[0].id}));assert.ok(p.data.routeMenu);
 p.setRouteSection(event({section:'lodging'}));assert.equal(p.data.routeMenu,null);assert.equal(p.data.routeSection,'lodging');p.onPageScroll({scrollTop:120});p.setRouteSection(event({section:'planning'}));assert.equal(f.scrolls.at(-1).scrollTop,420);
 p.openRouteMenu(event({kind:'event',id:p.data.trip.events[0].id}));p.selectDate(event({date:p.data.dates[1].value}));assert.equal(p.data.routeMenu,null);p.setTab(event({tab:'list'}));p.setTab(event({tab:'route'}));assert.equal(p.data.routeSection,'planning');
});
test('route display keeps continuous event numbers, checkout exclusivity and real transport metrics',()=>{
 const {page:p}=fixture();const date=p.data.selectedDate;p.data.trip.events=[{id:'a',date,startTime:'09:00',endTime:'10:00',title:'上午',startPlace:'甲',endPlace:'乙',transportMode:'driving'},{id:'b',date,startTime:'14:00',endTime:'15:00',title:'下午'},{id:'c',date,startTime:'20:00',endTime:'21:00',title:'晚上'}];p.data.trip.hotels=[{id:'h',name:'民宿',checkin:date,checkout:p.data.dates[2].value}];p.data.routeOverview={points:[{id:'a:start',sourceEventId:'a',sourceRole:'start'},{id:'a:end',sourceEventId:'a',sourceRole:'end'}],segments:[{fromId:'a:start',toId:'a:end',distance:139500,duration:113,dottedLine:false}]};p.derive();assert.deepEqual(Array.from(p.data.routePeriods,period=>period.events[0].number),[1,2,3]);assert.equal(p.data.routePeriods[0].events[0].distanceLabel,'139.5公里');assert.equal(p.data.routePeriods[0].events[0].durationLabel,'1小时53分钟');assert.equal(p.data.routePeriods[1].events[0].distanceLabel,'');assert.equal(p.data.routeHotel.nights,2);
 p.data.routeOverview.segments[0].dottedLine=true;p.derive();assert.equal(p.data.routePeriods[0].events[0].distanceLabel,'');p.selectDate(event({date:p.data.trip.hotels[0].checkout}));assert.equal(p.data.routeHotel,null);
});
test('route menu dispatches edits and deletion to the precise existing record',()=>{
 const {page:p}=fixture();let edited,deleted;p.openHotel=e=>edited=e.currentTarget.dataset.id;p.confirmDelete=e=>deleted=e.currentTarget.dataset;p.openRouteMenu(event({kind:'hotel',id:'hotel-1'}));p.editRouteEntry();assert.equal(edited,'hotel-1');assert.equal(p.data.routeMenu,null);p.openRouteMenu(event({kind:'ticket',id:'ticket-1'}));p.deleteRouteEntry();assert.equal(deleted.id,'ticket-1');assert.equal(deleted.action,'deleteTicket');p.data.trip.archived=true;p.openRouteMenu(event({kind:'event',id:'a'}));assert.equal(p.data.routeMenu,null);
});
test('route date strip crosses months and retains long titles, many tickets and missing transport',()=>{
 const {page:p}=fixture();p.data.trip.start='2026-10-30T08:00';p.data.trip.end='2026-11-03T18:00';p.data.selectedDate='2026-11-01';const title='一段很长的行程标题与集合地点说明'.repeat(5);p.data.trip.events=[{id:'long',date:'2026-11-01',startTime:'10:00',endTime:'12:00',title,note:'多行备注\n第二行说明',transportMode:'walking'}];p.data.trip.hotels=[];p.data.trip.tickets=Array.from({length:8},(_,index)=>({id:'ticket-'+index,date:'2026-11-01',type:'火车票'}));p.data.routeOverview=null;p.derive();assert.deepEqual(Array.from(p.data.dates,date=>date.month),[10,10,11,11,11]);assert.equal(p.data.dates[2].hasContent,true);assert.equal(p.data.dates[0].hasContent,false);assert.equal(p.data.routePeriods[0].events[0].title,title);assert.equal(p.data.routePeriods[0].events[0].distanceLabel,'');assert.equal(p.data.selectedTickets.length,8);assert.equal(p.data.routeHotel,null);
});
test('shared sheet reuses original draft and rejects unconfirmed discard',()=>{
 const f=fixture(),p=f.page;p.openEvent(event({id:p.data.trip.events[0].id}));assert.equal(p.data.editorActive,false);assert.equal(p.data.modal.fullPage,false);
 p.bindInput({...event({field:'title'}),detail:{value:'本地草稿'}});assert.equal(p.isDraftDirty(),true);p.closeModal();assert.ok(p.data.modal);f.dialog.success({confirm:false});assert.equal(p.data.modal.values.title,'本地草稿');p.closeModal();f.dialog.success({confirm:true});assert.equal(p.data.modal,null);
});

test('failed save retains the complete draft and exposes inline feedback',async()=>{
 const {page:p}=fixture();p.openEvent(event({id:p.data.trip.events[0].id}));p.bindInput({...event({field:'title'}),detail:{value:'网络恢复后再保存'}});
 p.call=async()=>{throw Error('连接暂不可用');};await p.submitModal();assert.equal(p.data.busy,false);assert.equal(p.data.modal.values.title,'网络恢复后再保存');assert.equal(p.data.saveError,'连接暂不可用');
});
test('save guard rejects invalid fields without making network requests',async()=>{
 const {page:p}=fixture();p.openCreateTrip();p.call=async()=>assert.fail('invalid draft reached network');await p.submitModal();assert.equal(p.data.fieldErrors.name,'请填写此项');assert.equal(p.data.busy,false);
});
test('tab switching restores scroll and selected dates without resetting expense filters',()=>{
 const f=fixture(),p=f.page;p.setTab(event({tab:'route'}));const first=p.data.selectedDate;p.onPageScroll({scrollTop:480});p.data.expenseFilters={date:'all',category:'餐饮',payer:'all'};
 p.setTab(event({tab:'expenses'}));p.data.selectedDate=p.data.dates[1].value;p.onPageScroll({scrollTop:160});p.setTab(event({tab:'route'}));assert.equal(p.data.selectedDate,first);assert.equal(f.scrolls.at(-1).scrollTop,480);assert.equal(p.data.expenseFilters.category,'餐饮');assert.equal(p.data.expenseFilters.date,'all');
});
test('successful native save closes editor only after mutation completes',async()=>{
 const f=fixture(),p=f.page;p.openEvent(event({id:p.data.trip.events[0].id}));let resolve;p.call=()=>new Promise(r=>resolve=r);const saved=p.submitModal();assert.equal(p.data.busy,true);assert.ok(p.data.modal);resolve({trip:p.data.trip});await saved;assert.equal(p.data.modal,null);assert.equal(p.data.busy,false);assert.equal(p.data.editorActive,false);
});
test('editor page forwards shared input and releases keyboard listener on return',()=>{
 let definition,receive,listener;const sent=[];let returned=0,alerts=0;
 const channel={on:(name,fn)=>{receive=fn;},emit:(name,data)=>sent.push({name,data})};
 const wx={onKeyboardHeightChange:fn=>{listener=fn;},offKeyboardHeightChange:fn=>assert.equal(fn,listener),enableAlertBeforeUnload:()=>alerts++,disableAlertBeforeUnload(){},navigateBack:()=>returned++};
 vm.runInNewContext(editorSource,{Page:p=>definition=p,wx});const p={...definition,data:{},setData(patch){Object.assign(this.data,patch);},getOpenerEventChannel:()=>channel};p.onLoad();receive({modal:{type:'event'},dirty:true});assert.equal(alerts,1);listener({height:300});assert.equal(p.data.keyboardHeight,300);p.bindEventTransport({detail:{value:2}});assert.equal(sent.at(-1).data.method,'bindEventTransport');receive({modal:null});receive({modal:null});assert.equal(returned,1);p.onUnload();assert.equal(sent.at(-1).name,'closed');
});
