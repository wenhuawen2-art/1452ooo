import assert from 'node:assert/strict';
const url='http://127.0.0.1:4191/api';
let sid;
async function request(data={}) { const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sid,...data})});const r=await response.json();assert.ok(!r.error,r.error);sid=r.sid;return r; }
const command=(method,dataset={},value)=>request({binding:{methods:{bindtap:method},dataset},type:'tap',value});
const input=(field,value)=>command('bindInput',{field},value);
let r=await request({mode:'member'});
for(const tab of ['today','route','list','expenses']) {r=await command('setTab',{tab});assert.ok(r.html.includes('theme-'+tab));}
r=await command('setTab',{tab:'route'});
const bindings=[...r.html.matchAll(/data-binding="([^"]+)"/g)].map(m=>JSON.parse(m[1].replaceAll('&quot;','"').replaceAll('&amp;','&')));
const detail=bindings.find(x=>x.methods.bindtap==='openDetail'&&x.dataset.kind==='event');assert.ok(detail);
await command('openDetail',detail.dataset);r=await command('editDetail');assert.ok(r.html.includes('编辑行程安排'));
await input('title','仅在本地 · 重新安排');r=await command('closeModal');assert.equal(r.confirm.title,'放弃未保存的修改？');
await request({fail:true});r=await command('submitModal');assert.ok(r.html.includes('模拟网络失败'));assert.ok(r.html.includes('仅在本地 · 重新安排'));
r=await command('submitModal');assert.ok(!r.html.includes('editor-fallback'));assert.ok(r.html.includes('仅在本地 · 重新安排'));
for (const mode of ['guest','empty','archived']) {r=await request({mode});for(const tab of ['today','route','list','expenses']){r=await command('setTab',{tab});assert.ok(r.html.includes('theme-'+tab));}r=await command('openEvent');if(mode==='guest')assert.ok(r.html.includes('微信一键登录'));if(mode==='empty')assert.ok(r.html.includes('创建旅行'));if(mode==='archived')assert.ok(!r.html.includes('editor-fallback'));}
r=await request({mode:'route-design',tab:'route'});assert.ok(r.html.includes('狮子沟牧场游玩'));assert.ok(r.html.includes('139.5公里'));r=await command('openRouteMenu',{kind:'event',id:'design-event-0'});assert.equal((r.html.match(/class="rg-menu"/g)||[]).length,1);r=await command('setRouteSection',{section:'lodging'});assert.ok(!r.html.includes('class="rg-menu"'));assert.ok(r.html.includes('2晚'));assert.ok(r.html.includes('rg-ticket-preview'));r=await command('setTab',{tab:'list'});r=await command('setTab',{tab:'route'});assert.ok(r.html.includes('月白屋上民宿'));r=await command('selectDate',{date:'2026-10-13'});assert.ok(r.html.includes('添加住宿'));assert.ok(!r.html.includes('月白屋上民宿'));
r=await request({mode:'route-design-empty',tab:'route'});assert.ok(r.html.includes('添加住宿'));assert.ok(r.html.includes('添加票据'));assert.ok(!r.html.includes('rg-ticket-card'));
r=await request({mode:'list-design',tab:'list'});assert.ok(r.html.includes('团队行囊准备'));assert.equal((r.html.match(/class="xy-item-row"/g)||[]).length,12);assert.ok(r.css.includes('.page.theme-route,.page.mastergo-home,.page.theme-list'));assert.ok(!r.css.includes('100% 950px'));
r=await command('toggleCategoryMenu',{id:'design-public-0'});assert.ok(r.html.includes('编辑分类'));r=await command('openCategory',{id:'design-public-0'});await input('name','仅在本地更改分类');r=await command('submitModal');assert.ok(r.html.includes('仅在本地更改分类'));
r=await command('toggleListItemMenu',{id:'design-public-0-0',category:'design-public-0'});assert.ok(r.html.includes('xy-item-menu'));r=await command('openDetail',{kind:'item',id:'design-public-0-0'});assert.ok(r.html.includes('detail-actions'));r=await command('editDetail');await input('title','仅在本地更改物品');r=await command('submitModal');assert.ok(r.html.includes('仅在本地更改物品'));
r=await request({mode:'outfit-design',tab:'list'});assert.equal((r.html.match(/class="xy-piece-media"/g)||[]).length,6);assert.ok(!r.html.includes('garment-.svg'));r=await command('previewOutfitItem',{outfit:'design-outfit-0',item:'design-piece-0-0'});assert.equal(r.previewImage.current,'/assets/mastergo-list/outfit/demo-look.jpg');
r=await command('toggleOutfitMenu',{id:'design-outfit-0',outfit:'design-outfit-0',kind:'outfit'});assert.ok(r.html.includes('编辑整套'));r=await command('openOutfit',{id:'design-outfit-0'});assert.equal((r.html.match(/class="outfit-item-editor"/g)||[]).length,4);assert.ok(!r.html.includes('class="outline full outfit-add-item"'));r=await command('closeModal');
r=await command('openOutfitItem',{outfit:'design-outfit-0',item:'design-piece-0-0'});await command('bindOutfitItemName',{index:0},'只修改这一件');r=await command('submitModal');assert.equal((r.html.match(/只修改这一件/g)||[]).length,1);assert.equal((r.html.match(/class="xy-piece-media"/g)||[]).length,6);
r=await request({mode:'outfit-design-empty',tab:'list',device:'iphone'});assert.ok(r.html.includes('xy-outfit-empty'));assert.ok(r.html.includes('添加穿搭'));assert.ok(r.html.includes('bottom-nav master-nav'));assert.ok(r.html.includes('--safe-bottom:34px'));r=await command('openOutfit');assert.ok(r.html.includes('穿搭标题'));
console.log('Preview QA passed: five-entry navigation, route and list design states, menus, detail/edit/save, outfit set/garment isolation, image preview, dirty guard, no-trip and archive guards.');

