import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function fixture() {
  const timers = new Map(); let id = 0;
  const module = {exports:{}};
  vm.runInNewContext(readFileSync('wechat-miniprogram/miniprogram/utils/interaction-motion.js','utf8'), {
    module, setTimeout:fn=>{timers.set(++id,fn);return id;}, clearTimeout:key=>timers.delete(key)
  });
  const page = {data:{tab:'today',selectedDate:'2026-10-10',modal:null},setData(patch,done){Object.assign(this.data,patch);done?.();}};
  module.exports.installMotion(page,{});
  return {page,timers,dispose:()=>module.exports.disposeMotion(page),finish:()=>{for(const fn of timers.values())fn();timers.clear();}};
}

test('exit presence keeps a display copy while a save commits synchronously',()=>{
  const f=fixture(),form={type:'expense',values:{amount:'123'}};
  f.page.setData({modal:form,formPanelHeight:540});
  let complete=false;
  f.page.setData({modal:null,trip:{revision:2}},()=>complete=true);
  assert.equal(f.page.data.modal,null);
  assert.equal(f.page.data.trip.revision,2);
  assert.equal(complete,true);
  assert.equal(f.page.data.motionExitModal,form);
  assert.equal(f.page.data.motionExitHeight,540);
  f.finish();assert.equal(f.page.data.motionExitModal,null);
});
test('reopening cancels the previous exit and does not remove the new draft',()=>{
  const f=fixture();f.page.setData({modal:{type:'event'}});f.page.setData({modal:null});
  const form={type:'hotel',values:{name:'new'}};f.page.setData({modal:form});
  assert.equal(f.timers.size,0);f.finish();
  assert.equal(f.page.data.modal,form);assert.equal(f.page.data.motionExitModal,null);
});
test('reduced motion and page hiding clear exit copies and cancel timers',()=>{
  for(const patch of [{reducedMotion:true},{pageHidden:true}]){
    const f=fixture();f.page.setData({detail:{id:'one'}});f.page.setData({detail:null});
    f.page.setData(patch);assert.equal(f.timers.size,0);assert.equal(f.page.data.motionExitDetail,null);
    f.page.setData({modal:{type:'trip'}});f.page.setData({modal:null});assert.equal(f.timers.size,0);
  }
});
test('navigation replays in the correct direction while data updates do not restart it',()=>{
  const f=fixture(),p=f.page;p.setData({tab:'route'});assert.equal(p.data.motionNav,'next-a');
  p.setData({busy:true});assert.equal(p.data.motionNav,'next-a');
  p.setData({tab:'today'});assert.equal(p.data.motionNav,'previous-b');
  p.setData({selectedDate:'2026-10-11'});assert.equal(p.data.motionSection,'a');
  p.setData({selectedDate:'2026-10-12'});assert.equal(p.data.motionSection,'b');
  p.setData({modal:{type:'trip'}});p.setData({modal:null});f.dispose();assert.equal(f.timers.size,0);
});
