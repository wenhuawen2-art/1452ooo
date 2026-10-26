import test from 'node:test';import assert from 'node:assert/strict';
import sheet from './helpers/form-sheet-module.mjs';
const {sheetLayout,snapSheet,installFormSheet,formSheetMethods,disposeFormSheet}=sheet;
test('short sheets follow content while long sheets cap the body without hiding actions',()=>{
 const common={viewport:852,top:104,chrome:168};
 assert.equal(sheetLayout({...common,content:80}).height,248);
 assert.equal(sheetLayout({...common,content:200}).height,368);
 const long=sheetLayout({...common,content:1600});assert.equal(long.height,665);assert.equal(long.body,497);
 const full=sheetLayout({...common,content:1600,expanded:true});assert.equal(full.height,748);assert.equal(full.body,580);
});
test('keyboard and small screens reserve safe top and keep the body nonnegative',()=>{
 for(const viewport of [568,667,852,932])for(const keyboard of [0,250,350])for(const expanded of [false,true]){
  const l=sheetLayout({viewport,top:104,keyboard,chrome:168,content:1400,expanded});assert.ok(l.height<=viewport-104-keyboard+1);assert.ok(l.body>=0);
 }
});
test('drag snap supports expansion, collapse and returning to the original height after cancel',()=>{
 assert.equal(snapSheet({dy:-40,height:740,collapsed:665,full:748}),true);
 assert.equal(snapSheet({dy:40,height:665,collapsed:665,full:748,expanded:true}),false);
 assert.equal(snapSheet({dy:1,height:748,collapsed:665,full:748,expanded:true}),true);
 assert.equal(sheetLayout({viewport:852,top:104,content:80,chrome:168,target:2000}).height,748);
});
test('native sheets measure actual fields and reset expansion for a new form without altering its draft',()=>{
 let content=80;const p={...formSheetMethods,data:{modal:null,systemContentTop:104},setData(patch,done){Object.assign(this.data,patch);done?.();}};
 const q={in(){return this;},select(){return this;},boundingClientRect(){return this;},exec(fn){fn([{height:content},{height:28},{height:64},{height:76}]);}};
 installFormSheet(p,{getWindowInfo:()=>({windowHeight:852}),createSelectorQuery:()=>q});
 p.setData({modal:{type:'category',values:{name:'行李'}}});p.measureFormSheet();assert.equal(p.data.formPanelHeight,248);
 p.toggleFormSheet();assert.equal(p.data.formPanelHeight,748);assert.equal(p.data.modal.values.name,'行李');
 p.setData({modal:{...p.data.modal,values:{name:'新类目'}}});assert.equal(p.data.formExpanded,true);
 content=1600;p.setData({modal:{type:'trip',values:{name:'旅行'}}});p.measureFormSheet();assert.equal(p.data.formExpanded,false);assert.equal(p.data.formPanelHeight,665);
 p.startFormSheetDrag({touches:[{clientY:200}]});p.moveFormSheetDrag({touches:[{clientY:130}]});assert.ok(p.data.formPanelHeight>665);p.cancelFormSheetDrag();assert.equal(p.data.formPanelHeight,665);
 p.setData({modal:null});assert.equal(p.data.formPanelHeight,null);disposeFormSheet(p);
});
test('keyboard resize cannot subtract the keyboard twice from the native viewport',async()=>{
 let resize;const p={...formSheetMethods,data:{modal:null},setData(patch,done){Object.assign(this.data,patch);done?.();}};
 installFormSheet(p,{getWindowInfo:()=>({windowHeight:852}),onWindowResize:fn=>resize=fn});
 resize({size:{windowHeight:552}});p.setData({keyboardHeight:300});await new Promise(r=>setTimeout(r,100));assert.equal(p._sheetViewport,852);
 p.setData({keyboardHeight:0});resize({size:{windowHeight:667}});await new Promise(r=>setTimeout(r,100));assert.equal(p._sheetViewport,667);disposeFormSheet(p);
});
