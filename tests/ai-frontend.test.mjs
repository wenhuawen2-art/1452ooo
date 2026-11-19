import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const base = 'wechat-miniprogram/miniprogram/subpackages/ai/pages/chat/';
const helperModule = { exports: {} };
vm.runInNewContext(await readFile(base + 'presentation.js', 'utf8'), { module: helperModule });
const helper = helperModule.exports;
const source = await readFile(base + 'index.js', 'utf8');
const fixtureDraft = () => ({ id: 'draft-1', sourceTripId: 'trip-1', baseRevision: 4, trip: { name: '跨月旅行', type: '自驾游', start: '2026-10-31T08:00', end: '2026-11-02T18:00' }, events: [{ id: 'event-1', date: '2026-11-01', startTime: '09:00', endTime: '10:00', title: '公园散步', transportMode: 'walking' }], items: [{ id: 'item-1', title: '水杯', category: '随身物品', key: true }], appliedEntryIds: [] });
const tap = dataset => ({ currentTarget: { dataset } });
function fixture() {
  let definition; const timers = new Map(), storage = new Map(); let timerId = 0;
  const wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, structuredClone(value)), removeStorageSync: key => storage.delete(key), showModal: options => options.success({ confirm: true }), hideKeyboard() {}, navigateBack() {} };
  vm.runInNewContext(source, { Page: value => definition = value, require: () => helper, wx, setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id), Date, Math });
  const page = { ...definition, visible: true, destroyed: false, sequence: 0, storageKey: 'private-account-session', data: structuredClone(definition.data), setData(patch) { for (const [key, value] of Object.entries(patch)) { const parts = key.split('.'); let target = this.data; for (const part of parts.slice(0, -1)) target = target[part] ||= {}; target[parts.at(-1)] = value; } } };
  page.setData({ ready: true, allowed: true, currentTrip: { id: 'trip-1', name: '原来的旅行', revision: 4 }, messages: [{ id: 'message-1', role: 'assistant', text: '安排好了', draft: fixtureDraft() }] });
  return { page, wx, timers, storage };
}

function scopedPage(tripId, storage = new Map(), conversations = {}, extra = {}) {
  const f = fixture();
  f.page.tripId = tripId;
  f.page.storageKey = '';
  f.page.setData({messages:[],conversationId:'',jobId:'',currentTrip:null,ready:false,allowed:false});
  f.wx.getStorageSync = key => storage.get(key);
  f.wx.setStorageSync = (key,value) => storage.set(key,structuredClone(value));
  f.wx.removeStorageSync = key => storage.delete(key);
  const requests=[];
  f.page.call = async (operation,input={}) => {
    requests.push({operation,input});
    if(extra[operation])return extra[operation](input);
    if(operation==='getAiCapabilities')return {canUse:true,remainingToday:20,dailyLimit:20,activeJobId:'job-for-another-trip'};
    if(operation==='bootstrapAccount')return {account:{id:'account-a',profileComplete:true}};
    if(operation==='getTrip')return {trip:{id:input.tripId,name:input.tripId+'旅行',revision:2}};
    if(operation==='getAiConversation')return Object.values(conversations).find(c=>input.conversationId?c.conversationId===input.conversationId:c.tripId===input.tripId)||{conversationId:'',tripId:input.tripId,messages:[],activeJobId:''};
    throw new Error('Unexpected RPC '+operation);
  };
  return {...f,storage,requests};
}

test('trip A, new trip B, and returning to A each restore only their own conversation',async()=>{
  const storage=new Map();const conversations={a:{conversationId:'conv-a',tripId:'trip-a',messages:[{id:'a-1',role:'user',text:'杭州慢游'}]}};
  const a=scopedPage('trip-a',storage,conversations);await a.page.initialize();
  assert.equal(a.page.data.messages[0].text,'杭州慢游');
  const b=scopedPage('trip-b',storage,conversations);await b.page.initialize();
  assert.equal(b.page.data.ready,true);assert.equal(b.page.data.allowed,true);
  assert.equal(b.page.data.messages.length,0);assert.equal(b.page.data.jobId,'');
  assert.notEqual(a.page.storageKey,b.page.storageKey);
  const returned=scopedPage('trip-a',storage,conversations);await returned.page.initialize();
  assert.equal(returned.page.data.conversationId,'conv-a');
  assert.equal(returned.page.data.currentTrip.id,'trip-a');
  assert.equal(b.requests.some(r=>r.operation==='getAiJob'),false);
});

test('legacy account-wide storage migrates only to its verified owner trip',async()=>{
  const legacy={conversationId:'conv-a',pending:{tripId:'trip-a',message:'杭州',clientRequestId:'pending-legacy'}};
  const storage=new Map([['xiangye-ai-session:account-a',legacy]]);
  const conversations={a:{conversationId:'conv-a',tripId:'trip-a',messages:[{id:'a-1',role:'user',text:'杭州'}]}};
  const b=scopedPage('trip-b',storage,conversations);await b.page.initialize();
  assert.equal(b.page.data.messages.length,0);assert.equal(b.page.data.input,'');assert.equal(b.page.pendingRequest,undefined);
  assert.equal(storage.get('xiangye-ai-session:account-a').conversationId,'conv-a');
  const a=scopedPage('trip-a',storage,conversations);await a.page.initialize();
  assert.equal(a.page.data.conversationId,'conv-a');assert.equal(a.page.data.input,'杭州');
});

test('a mismatched cloud history is rejected and trip load errors cannot send without context',async()=>{
  const mismatched=scopedPage('trip-b',new Map(),{}, {getAiConversation:()=>({conversationId:'wrong',tripId:'trip-a',messages:[{text:'private A'}]})});
  await mismatched.page.initialize();assert.equal(mismatched.page.data.allowed,false);assert.equal(mismatched.page.data.messages.length,0);
  const failed=scopedPage('trip-a',new Map(),{}, {getTrip:()=>{throw new Error('旅行加载失败');}});
  await failed.page.initialize();failed.page.data.input='规划';await failed.page.send();
  assert.equal(failed.page.data.allowed,false);assert.equal(failed.requests.some(r=>r.operation==='submitAiMessage'),false);
});

test('new-trip application does not change the source chat context for the next prompt',async()=>{
  const f=fixture();f.page.scopeTripId='trip-1';f.page.openPreview(tap({id:'message-1'}));f.page.data.target='new';
  f.page.call=async operation=>operation==='applyAiDraft'?{trip:{id:'trip-2',name:'新旅行'},appliedEntryIds:['event-1']}:{conversationId:'conv-a',tripId:'trip-1',messages:[]};
  await f.page.apply();assert.equal(f.page.data.currentTrip.id,'trip-1');assert.equal(f.page.data.result.tripId,'trip-2');
  let sent;f.page.data.input='继续';f.page.call=async(operation,input)=>{sent=input;throw new Error('offline');};await f.page.send();
  assert.equal(sent.tripId,'trip-1');
});

test('AI preview defaults to personal checklist and excludes already-applied rows', () => {
  const { page } = fixture(); page.data.messages[0].draft.appliedEntryIds = ['item-1']; page.openPreview(tap({ id: 'message-1' }));
  assert.equal(page.data.scope, '我的'); assert.equal(page.data.target, 'current'); assert.equal(page.baseRevision, 4); assert.equal(page.data.selectedCount, 1);
  page.toggleEntry(tap({ id: 'item-1' })); assert.equal(page.data.rows[1].selected, false);
});

test('AI plan is read before entering selection and back returns to the plan', () => {
  const { page } = fixture();
  page.data.messages[0].text = '行程概览\n每日安排\n推荐理由\n准备清单\n注意事项';
  page.openPlan(tap({ id: 'message-1' }));
  assert.equal(page.data.planOpen, true);
  assert.equal(page.data.previewOpen, false);
  assert.match(page.data.planText, /推荐理由/);
  assert.ok(page.data.planBlocks.some(block => block.kind === 'heading' && block.text === '推荐理由'));
  page.continueToPreview();
  assert.equal(page.data.planOpen, false);
  assert.equal(page.data.previewOpen, true);
  page.back();
  assert.equal(page.data.previewOpen, false);
  assert.equal(page.data.planOpen, true);
  page.back();
  assert.equal(page.data.planOpen, false);
});

test('AI response typography preserves content and renders markup as native text', () => {
  const malicious = '<img src=x onerror=alert(1)>';
  const blocks = helper.textBlocks(`## 每日安排\r\n\r\n### 第 1 天 · 2026-11-10\n- **09:00 出发**：带上水杯\n1. 查看预约\n> 出发前确认天气\n${malicious}`);
  assert.equal(blocks[0].kind, 'heading');
  assert.equal(blocks[1].kind, 'heading');
  assert.equal(blocks[0].level, 2);
  assert.equal(blocks[1].level, 3);
  assert.equal(blocks[2].kind, 'list');
  assert.equal(blocks[2].runs[0].text, '09:00 出发');
  assert.equal(blocks[2].runs[0].bold, true);
  assert.equal(blocks[3].marker, '1');
  assert.equal(blocks[4].kind, 'note');
  assert.equal(blocks[5].text, malicious);
  const message = helper.messageRows([{ text: '准备清单\n- 雨伞', role: 'assistant' }])[0];
  assert.equal(message.blocks.length, 2);
  assert.equal(helper.textBlocks('').length, 0);
});

test('AI header diffusion follows each scroll view and skips unchanged frames', () => {
  const { page } = fixture();
  const update = page.setData.bind(page), patches = [];
  page.setData = patch => { patches.push(patch); update(patch); };
  page.onChatScroll({ detail: { scrollTop: 32 } });
  page.onChatScroll({ detail: { scrollTop: 32.1 } });
  assert.equal(page.data.chatHeaderProgress, .5);
  assert.equal(patches.length, 1);
  page.onReaderScroll({ detail: { scrollTop: 100 } });
  assert.equal(page.data.readerHeaderProgress, 1);
  assert.equal(page.data.chatHeaderProgress, .5);
  page.onPreviewScroll({ detail: { scrollTop: -20 } });
  assert.equal(page.data.previewHeaderProgress, 0);
  page.onChatScroll({ detail: { scrollTop: -10 } });
  assert.equal(page.data.chatHeaderProgress, 0);
  page.onChatScroll({ detail: { scrollTop: 'invalid' } });
  assert.equal(page.data.chatHeaderProgress, 0);
  const previous = patches.length;
  page.destroyed = true;
  page.onChatScroll({ detail: { scrollTop: 500 } });
  assert.equal(patches.length, previous);
});

test('AI overlays restore reading position and reset diffusion for a new plan', async () => {
  const { page } = fixture();
  page.openPlan(tap({ id: 'message-1' }));
  page.onReaderScroll({ detail: { scrollTop: 640 } });
  page.continueToPreview();
  assert.equal(page.data.previewHeaderProgress, 0);
  page.onPreviewScroll({ detail: { scrollTop: 96 } });
  page.applyRequest = { clientMutationId: 'uncertain-apply' };
  page.closePreview();
  assert.equal(page.data.readerScrollTop, 640);
  assert.equal(page.data.readerHeaderProgress, 1);
  page.openPreview(tap({ id: 'message-1' }));
  assert.equal(page.data.previewScrollTop, 96);
  assert.equal(page.data.previewHeaderProgress, 1);
  page.applyRequest = null;
  page.closePreview();
  page.openPlan(tap({ id: 'message-1' }));
  assert.equal(page.data.readerScrollTop, 0);
  assert.equal(page.data.readerHeaderProgress, 0);
  page.onChatScroll({ detail: { scrollTop: 400 } });
  await page.newConversation();
  assert.equal(page.data.chatHeaderProgress, 0);
  assert.equal(page.data.previewHeaderProgress, 0);
  assert.equal(page.data.previewScrollTop, 0);
});

test('AI editable entries preserve cross-month dates and omit owner and UI fields', () => {
  const rows = helper.entryRows(fixtureDraft()); rows[0].ownerId = 'secret'; rows[0].title = '新的安排'; rows[1].selected = false;
  const edits = helper.buildEdits(rows); assert.equal(edits.length, 1); assert.equal(edits[0].date, '2026-11-01'); assert.equal(edits[0].title, '新的安排'); assert.equal(edits[0].ownerId, undefined); assert.equal(edits[0].selected, undefined);
  assert.equal(helper.validatePreview(rows, 'new', fixtureDraft().trip), '');
});

test('AI polling pauses on hide and resumes on show without resubmitting generation', async () => {
  const { page, timers } = fixture(); let polls = 0; page.data.jobId = 'job-1'; page.data.jobStatus = 'running';
  page.call = async operation => { assert.equal(operation, 'getAiJob'); polls++; return { status: 'running', remainingToday: 19 }; };
  await page.poll(); assert.equal(polls, 1); assert.equal(timers.size, 1);
  page.onHide(); assert.equal(timers.size, 0); await page.poll(); assert.equal(polls, 1);
  page.onShow(); await Promise.resolve(); await Promise.resolve(); assert.equal(polls, 2);
});

test('AI uncertain send retries the same request id and retains the message', async () => {
  const { page, storage } = fixture(); const requests = []; page.data.input = '十一月去成都三天';
  page.call = async (operation, payload) => { assert.equal(operation, 'submitAiMessage'); requests.push(payload); throw new Error('网络暂不可用'); };
  await page.send(); assert.equal(page.data.requestPending, true); assert.equal(page.data.input, '十一月去成都三天');
  await page.retry(); assert.equal(requests.length, 2); assert.equal(requests[0].clientRequestId, requests[1].clientRequestId); assert.equal(storage.get(page.storageKey).pending.clientRequestId, requests[0].clientRequestId);
});

test('AI dispatcher rejection and restored failures are visible without polling', async () => {
  const { page, timers } = fixture(); page.data.input = '规划旅行';
  page.call = async operation => operation === 'submitAiMessage' ? { jobId: 'job-1', conversationId: 'conv-1', status: 'failed', error: { code: 'AI_TIMEOUT' }, remainingToday: 19 } : { conversationId: 'conv-1', tripId: 'trip-1', messages: [{ id: 'u1', role: 'user', text: '规划旅行', status: 'failed', error: { code: 'AI_TIMEOUT' } }] };
  await page.send(); assert.match(page.data.error, /超时/); assert.equal(page.data.jobId, ''); assert.equal(page.data.submitting, false); assert.equal(timers.size, 0);
});

test('AI changed trip requires explicit review before a new apply attempt', async () => {
  const { page } = fixture(); page.openPreview(tap({ id: 'message-1' })); let writes = 0;
  page.call = async operation => { if (operation === 'applyAiDraft') { writes++; throw Object.assign(new Error('changed'), { code: 'AI_CONFLICT', status: 409 }); } return { trip: { id: 'trip-1', name: '最新旅行', revision: 5, events: [], items: [] } }; };
  await page.apply(); assert.equal(page.data.conflict, true); assert.equal(writes, 1);
  await page.apply(); assert.equal(writes, 1); await page.reviewConflict(); assert.equal(page.baseRevision, 5); assert.equal(page.data.conflict, false); assert.equal(writes, 1);
});

test('AI uncertain application stays frozen across close, reopen and retry', async () => {
  const { page, storage } = fixture(); page.openPreview(tap({ id: 'message-1' })); const requests = [];
  page.call = async (operation, payload) => { assert.equal(operation, 'applyAiDraft'); requests.push(payload); throw new Error('连接中断'); };
  await page.apply(); page.closePreview(); page.openPreview(tap({ id: 'message-1' })); page.toggleEntry(tap({ id: 'item-1' }));
  assert.equal(page.data.selectedCount, 2); await page.apply(); assert.equal(requests[0].clientMutationId, requests[1].clientMutationId);
  assert.equal(storage.get(page.storageKey).pendingApply.payload.clientMutationId, requests[0].clientMutationId);
  const recovered = fixture().page; recovered.resumeApplication(storage.get(page.storageKey).pendingApply); assert.equal(recovered.data.applicationPending, true); assert.equal(recovered.applyRequest.clientMutationId, requests[0].clientMutationId);
});

test('AI rapid apply clicks share one confirmation and one write', async () => {
  const { page } = fixture(); page.openPreview(tap({ id: 'message-1' })); let confirmResolve, writes = 0;
  page.confirm = () => new Promise(resolve => { confirmResolve = resolve; });
  page.call = async operation => { if (operation === 'applyAiDraft') { writes++; return { trip: { id: 'trip-1', name: '旅行' }, appliedEntryIds: ['event-1', 'item-1'] }; } return { conversationId: 'conv-1', tripId: 'trip-1', messages: [] }; };
  const first = page.apply(); await page.apply(); confirmResolve(true); await first;
  assert.equal(writes, 1); assert.equal(page.data.result.count, 2); assert.equal(page.data.previewOpen, false);
});
