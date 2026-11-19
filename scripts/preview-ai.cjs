/* Local-only bridge: executes the native page and real AI service with an in-memory model. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, createHmac } = require('node:crypto');
const { memoryDb } = require('../tests/helpers/ai-memory-db.cjs');
const { createAiService } = require('../shared/ai-service.cjs');
const { createAiWorker } = require('../cloudfunctions/suixing-ai-worker/worker.cjs');
const { publicReplyPhase } = require('../cloudfunctions/suixing-ai-worker/model.cjs');
const contract = require('../shared/ai-contract.cjs');
const domain = require('../shared/domain.cjs');
const clone = value => value == null ? value : structuredClone(value);
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const currentDay = value => String(value || '').slice(0, 10);
const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });

function mockPlan(messages) {
  const contextMessage = messages.find(message => message.role === 'system' && message.content.startsWith('当前旅行参考数据'));
  let context = null;
  try { context = contextMessage && JSON.parse(contextMessage.content.slice(contextMessage.content.indexOf('：') + 1)); } catch {}
  const userMessages = messages.filter(message => message.role === 'user').map(message => message.content);
  const input = userMessages.at(-1) || '';
  const text = userMessages.join('\n');
  const dates = text.match(/20\d{2}-\d{2}-\d{2}/g) || [];
  let previous = null;
  for (const message of messages.filter(message => message.role === 'assistant').reverse()) {
    try { const parsed = JSON.parse(message.content); if (parsed.draft?.trip) { previous = parsed.draft.trip; break; } } catch {}
  }
  const start = dates.length > 1 ? dates.at(-2) + 'T08:00' : dates[0] ? dates[0] + 'T08:00' : previous?.start || context?.start;
  const end = dates.length > 1 ? dates.at(-1) + 'T18:00' : previous?.end || context?.end;
  if (!start || !end) return { text: '【本地模拟 · 未调用真实模型】\n\n可以，我们先把旅行的轮廓整理清楚。\n\n### 先确定出行日期\n请补充出发与归来日期（例如 2026-11-10 至 2026-11-12）。人数、交通方式和偏好也可以一起告诉我；暂时没想好的部分可以之后再改。\n\n### 我会帮你整理什么\n- 每天的上午、下午与傍晚安排，以及为什么这样走。\n- 出发前要预约的事项、随身物品和衣物清单。\n- 交通衔接、休息时间和雨天替代建议。\n\n### 方案如何用到旅行里\n生成后先阅读完整方案，再勾选行程和清单；可以追加到当前旅行，也可以创建新旅行。', draft: null };
  const cities = ['成都', '杭州', '西安', '北京', '上海', '厦门', '重庆', '南京', '苏州', '广州'];
  const cityText = text + '\n' + (context?.name || '');
  const mentioned = cities.filter(city => text.includes(city)).sort((a, b) => text.lastIndexOf(b) - text.lastIndexOf(a));
  const city = mentioned[0] || cities.find(city => cityText.includes(city)) || '目的地';
  const days = Math.max(1, Math.min(7, Math.floor((Date.parse(currentDay(end)) - Date.parse(currentDay(start))) / 86400000) + 1));
  const relaxed = /紧凑|多安排|充实/.test(input) ? false : /轻松|慢|少|休息/.test(text);
  const checklistOnly = /只.*清单|准备一份.*清单|仅.*清单/.test(input);
  const trip = { name: city === '目的地' ? context?.name || '我的新旅行' : `${city}${relaxed ? '慢' : ''}旅行`, type: /自驾/.test(text) ? '自驾游' : context?.type || '旅游', start, end };
  const citySpots = {
    成都: [['人民公园与茶馆', '宽窄巷子慢行', '市区用餐与休息'], ['武侯祠周边文化漫步', '锦里街区与茶歇', '酒店周边轻松用餐'], ['望平街沿河散步', '市区自由活动与伴手礼', '整理行李与返程准备']],
    杭州: [['西湖北侧慢行', '湖滨街区与茶歇', '酒店周边用餐'], ['灵隐周边文化漫步', '龙井茶园周边休息', '返回市区轻松用餐'], ['京杭大运河沿岸漫步', '桥西街区与返程准备', '整理行李与交通衔接']],
  };
  const spots = citySpots[city] || [['抵达与酒店周边散步', '城市地标与老街', '周边用餐与休息'], ['当地文化体验', '公园漫步与茶歇', '当地餐食与自由活动'], ['自然风景与休息', '伴手礼与返程准备', '整理行李与交通衔接']];
  const events = checklistOnly ? [] : Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.parse(currentDay(start)) + index * 86400000).toISOString().slice(0, 10);
    const schedule = [[relaxed ? '10:00' : '09:00', '11:30'], [relaxed ? '14:30' : '14:00', '16:00'], ['17:00', '18:00']];
    const reasons = ['上午以一处主要地点为中心，预留入场、拍照和休息时间。', '午后安排较短活动，途中留出用餐、转场与茶歇时间；下雨时可改为室内展馆或休息。', '傍晚留给用餐与整理，避免把最后一段交通安排得过紧。'];
    return schedule.map(([startTime, endTime], slot) => ({ date, startTime, endTime, title: spots[index % spots.length][slot], address: city === '目的地' ? '' : city, startPlace: '', endPlace: '', transportMode: trip.type === '自驾游' ? 'driving' : 'walking', note: reasons[slot] + '本地模拟未查询实时开放时间、里程和天气，地点需在行程中校准。' }));
  }).flat();
  const clothingOnly = /衣物|穿搭/.test(input) && checklistOnly;
  const itemSeeds = clothingOnly ? [
    { title: '按天数准备贴身换洗衣物', category: '衣物准备', key: true }, { title: '便于叠穿的外套', category: '衣物准备', key: false },
    { title: '适合步行的鞋子与备用袜子', category: '衣物准备', key: true }, { title: '雨天替换衣物与防水收纳袋', category: '衣物准备', key: false },
    { title: '睡衣与个人洗护用品', category: '衣物准备', key: false }, { title: '出发前按实际天气复核厚薄', category: '行前确认', key: true },
  ] : [
    { title: '身份证件', category: '证件与资料', key: true }, { title: '交通与住宿预订确认', category: '证件与资料', key: true },
    { title: '充电器与充电宝', category: '随身用品', key: false }, { title: '轻便雨具', category: '随身用品', key: false },
    { title: '适合步行的鞋子', category: '衣物准备', key: false }, { title: '根据实际天气准备替换衣物', category: '衣物准备', key: false },
    { title: '水杯与途中补给', category: '随身用品', key: false }, { title: '个人常用药与创可贴', category: '随身用品', key: false },
    { title: '景点开放与预约要求核对', category: '行前确认', key: true }, { title: '行程地点与导航落点校准', category: '行前确认', key: true },
    { title: '出发前查看目的地天气', category: '行前确认', key: true }, { title: '返程交通与出发时间确认', category: '行前确认', key: true },
  ];
  const items = itemSeeds.map(item => ({ ...item, scope: '我的', linkedDate: '', remind: '' }));
  const daily = events.length ? Array.from({ length: days }, (_, index) => {
    const dayEvents = events.slice(index * 3, index * 3 + 3);
    return `### 第 ${index + 1} 天 · ${dayEvents[0].date}\n${dayEvents.map(event => `- **${event.startTime}—${event.endTime} ${event.title}**\n${event.note}`).join('\n')}`;
  }).join('\n\n') : '';
  const categories = [...new Set(items.map(item => item.category))];
  const checklist = categories.map(category => `**${category}**\n${items.filter(item => item.category === category).map(item => '- ' + item.title + (item.key ? '（出发前重点确认）' : '')).join('\n')}`).join('\n\n');
  const advice = [
    '【本地模拟 · 未调用真实模型，未查询实时资料】',
    `行程概览\n${trip.name}，${currentDay(start)} 至 ${currentDay(end)}，以${trip.type === '自驾游' ? '自驾衔接、到点后步行' : '步行结合当地交通'}为参考。${relaxed ? '延后上午出发时间，午后保留休息与自由探索。' : '把主要活动分配到上午、下午与傍晚，转场之间预留缓冲。'}${/调整|轻松|慢|只|换|改/.test(input) ? '这轮已结合你刚才的要求更新方案，可继续指定要保留或替换的安排。' : ''}`,
    ...(daily ? [`每日安排\n${daily}`] : []),
    `推荐理由\n${relaxed ? '每天聚焦一处主要地点，方便休息和临时调整；' : '每天以一个主要地点为中心，减少跨区域折返；'}交通方式和具体路线需结合出发地再核实。`,
    `准备清单\n${checklist}`,
    '交通建议\n- 每天出发前先校准活动地点，再查询实际路线。市区活动可优先减少折返，跨区时给堵车、找车位或换乘留出时间。\n- 自驾请把停车点与景点入口分别确认；步行不便、同行有老人或孩子时，可以减少一个活动。',
    '预算建议\n按往返交通、住宿、餐饮、门票与市内交通分别列支，再留出临时调整的余量。这里没有查询实时票价与房价，具体金额请以实际预订为准。',
    `注意事项\n- 出发前核实景点开放时间、预约要求、天气和路况。\n- 日期较远时，等进入天气预报范围后再调整衣物和户外活动；雨天可用室内展馆或休息替换户外安排。\n- 本地模拟没有查询实时票价、里程或营业信息。${days === 7 && currentDay(end) > events.at(-1)?.date ? '\n- 本轮仅覆盖前七天，其余日期请继续规划。' : ''}`,
    `行程与清单应用\n这份方案包含 ${events.length} 项行程和 ${items.length} 项清单。先点下方卡片阅读，再选择要应用的内容；可修改时间、地点、清单分类，追加到当前旅行或创建新旅行。应用后可在行程与清单页面继续调整。`,
  ].join('\n\n');
  return { text: advice, draft: { trip, events, items } };
}

function installAiPreview({ session: s, page: p, wx, root, mode = '' }) {
  const db = memoryDb(), accountId = 'preview-ai-account';
  const secret = 'local-preview-only-no-cloud-access-0123456789';
  const env = { AI_ENABLED: 'true', AI_ALLOWLIST: accountId, AI_WORKER_SECRET: secret };
  const storage = new Map(), jobs = new Set(), listeners = new Map();
  const originalCall = p.call?.bind(p), originalCloud = wx.cloud?.callFunction, originalNavigate = wx.navigateTo, originalBack = wx.navigateBack;
  let scenario = mode === 'ai-timeout' ? 'timeout' : mode === 'ai-quota' ? 'quota' : 'normal';
  const progressDemo = mode === 'ai-progress';
  let nativePage = null, ready;
  const isAuthenticated = () => !p.data.guestMode && p.data.authState !== 'guest';
  const account = () => ({ ...clone(p.data.account || {}), id: accountId, nickname: p.data.account?.nickname || '林一', avatarId: 'avatar-01', profileComplete: isAuthenticated() });
  // Local fixtures use guest data as their seed; reflect the selected preview's login state.
  if (isAuthenticated()) p.setData({ account: account() });
  const normalizeLocalTrip = source => {
    const trip = clone(source);
    if (!trip?.id || !trip.members?.length) return null;
    let member = trip.members.find(member => member.id === trip.me) || trip.members[0];
    member.accountId = accountId; member.avatarId = /^avatar-\d{2}$/.test(member.avatarId) ? member.avatarId : 'avatar-01';
    trip.me = member.id; trip.creator ||= trip.members[0].id; trip.revision ||= 0;
    for (const field of ['items', 'categories', 'events', 'hotels', 'tickets', 'outfits']) trip[field] ||= [];
    return { trip, member };
  };
  async function syncTripsToDb() {
    await db.seed('user_accounts', accountId, account());
    const trips = [...(s.trips || [])];
    if (p.data.trip?.id) { const index = trips.findIndex(trip => trip.id === p.data.trip.id); if (index < 0) trips.push(p.data.trip); else if (Number(p.data.trip.revision || 0) >= Number(trips[index].revision || 0)) trips[index] = p.data.trip; }
    for (const source of trips) {
      const result = normalizeLocalTrip(source); if (!result) continue;
      await db.seed('trips', result.trip.id, result.trip);
      await db.seed('trip_members', hash(`${accountId}:${result.trip.id}`), { accountId, tripId: result.trip.id, memberId: result.member.id });
    }
  }
  const worker = createAiWorker({ db, env, contract, timeoutMs: progressDemo ? 18000 : 2200, generate: async (messages, reportPhase) => {
    await pause(progressDemo ? 3100 : 650);
    if (scenario === 'timeout') throw fail('AI_MODEL_TIMEOUT', '本地模拟模型超时', 504);
    const text = JSON.stringify(mockPlan(messages));
    if (progressDemo) {
      let visibleText = '';
      for (const chunk of text.split(/(?=(?:每日安排|准备清单)\\n)/)) {
        visibleText += chunk;
        reportPhase(publicReplyPhase(visibleText));
        await pause(3000);
      }
    }
    return { text, usage: { prompt_tokens: 420, completion_tokens: 720, total_tokens: 1140 } };
  } });
  const service = createAiService({ db, env, dispatch: async jobId => {
    const issuedAt = Date.now();
    const task = pause(25).then(() => worker({ jobId, issuedAt, signature: createHmac('sha256', secret).update(`${issuedAt}.${jobId}`).digest('hex') })).catch(error => { s.aiWorkerError = { code: error.code, message: error.message }; }).finally(() => { jobs.delete(task); s.aiVersion = (s.aiVersion || 0) + 1; });
    jobs.add(task);
  } });
  const operations = { getAiCapabilities: 'capabilities', submitAiMessage: 'submit', getAiJob: 'getJob', getAiConversation: 'getConversation', deleteAiConversation: 'removeConversation', applyAiDraft: 'apply' };
  function displayTrip(source) {
    const member = source.members.find(member => member.accountId === accountId) || source.members.find(member => member.id === source.me) || source.members[0];
    return domain.viewTrip(clone(source), member, 'LOCAL-PREVIEW');
  }
  async function call(operation, input = {}) {
    await ready;
    if (s.failNext) { s.failNext = false; throw new Error('模拟网络失败，请重试；草稿已保留'); }
    if (operations[operation] || operation === 'bootstrapAccount' || operation === 'getTrip') {
      await syncTripsToDb();
      if (operation === 'bootstrapAccount') return { account: account(), trips: clone(s.trips || []) };
      if (operation === 'getTrip') {
        const trip = db.inspect('trips')[input.tripId];
        if (!trip) throw fail('AI_TRIP_NOT_FOUND', '旅行不存在', 404);
        return { trip: displayTrip(trip) };
      }
      const result = await service[operations[operation]](accountId, input);
      if (operation === 'applyAiDraft') {
        const trip = result.trip.trip || result.trip;
        const index = (s.trips || []).findIndex(item => item.id === trip.id);
        if (index < 0) s.trips.push(clone(trip)); else s.trips[index] = clone(trip);
        p.setData({ trip: clone(trip), trips: clone(s.trips), guestMode: false, authState: 'authenticated' });
        p.derive?.(); p.deriveExpenseView?.();
      }
      return result;
    }
    return originalCall ? originalCall(operation, input) : Promise.reject(fail('PREVIEW_UNSUPPORTED', '此操作未接入本地预览'));
  }
  async function setScenario(name) {
    scenario = name;
    const day = contract.beijingDay(Date.now()), id = `${hash(accountId)}_${day}`;
    const previous = db.inspect('ai_usage')[id];
    await db.seed('ai_usage', id, { ...(previous || {}), id, accountId, day, used: name === 'quota' ? 20 : 0, reserved: 0, activeJobId: '' });
    env.AI_ENABLED = name === 'disabled' ? 'false' : 'true';
    env.AI_ALLOWLIST = name === 'denied' ? '' : accountId;
  }
  const channel = { on(name, handler) { listeners.set(name, handler); }, emit(name, value) { listeners.get(name)?.(value); } };
  function loadNativePage() {
    const moduleCache = new Map();
    const loadModule = file => {
      if (!path.extname(file)) file += '.js';
      if (moduleCache.has(file)) return moduleCache.get(file).exports;
      const module = { exports: {} }; moduleCache.set(file, module);
      vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require: name => name.startsWith('.') ? loadModule(path.resolve(path.dirname(file), name)) : require(name), Date, setTimeout, clearTimeout, console }, { filename: file });
      return module.exports;
    };
    const file = path.join(root, 'subpackages/ai/pages/chat/index.js');
    let definition;
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page: value => { definition = value; }, wx, Date, setTimeout, clearTimeout, console, require: name => loadModule(path.resolve(path.dirname(file), name)) }, { filename: file });
    const instance = { ...definition, data: clone(definition.data), getOpenerEventChannel: () => channel, setData(patch, complete) {
      for (const [key, value] of Object.entries(patch)) {
        const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let owner = this.data;
        keys.slice(0, -1).forEach((key, index) => { owner = owner[key] ||= /^\d+$/.test(keys[index + 1]) ? [] : {}; });
        owner[keys.at(-1)] = value;
      }
      s.aiVersion = (s.aiVersion || 0) + 1; complete?.();
    } };
    const initialize = instance.initialize;
    instance.initialize = function () { const pending = initialize.call(this); s.aiReady = pending; return pending; };
    return instance;
  }
  function open(options = {}) {
    nativePage?.onUnload?.(); nativePage = loadNativePage();
    s.aiPage = nativePage; s.aiOpen = true; s.scrollTop = 0;
    nativePage.onLoad({ tripId: options.tripId || p.data.trip?.id || '' });
    nativePage.onShow();
    return s.aiReady;
  }
  function close() {
    nativePage?.onHide?.(); nativePage?.onUnload?.(); nativePage = null;
    s.aiOpen = false; s.aiPage = null; s.aiVersion = (s.aiVersion || 0) + 1; s.scrollTop = 0;
  }
  wx.__localPreview = true;
  const originalStorage = wx.getStorageSync?.bind(wx);
  wx.getStorageSync = key => storage.has(key) ? clone(storage.get(key)) : originalStorage?.(key);
  wx.setStorageSync = (key, value) => { storage.set(key, clone(value)); };
  wx.removeStorageSync = key => { storage.delete(key); };
  wx.getWindowInfo = () => ({ windowWidth: 393, windowHeight: 852, screenHeight: 852, statusBarHeight: 47, safeArea: { top: 47, bottom: 818, height: 771 } });
  wx.hideKeyboard ||= () => {};
  wx.cloud ||= {};
  wx.cloud.callFunction = async options => {
    if (options.name !== 'suixing-api') return originalCloud ? originalCloud(options) : { result: { ok: false, code: 'PREVIEW_UNSUPPORTED', error: '本地模拟不调用其他云函数' } };
    try { return { result: { ok: true, data: await call(options.data.operation, options.data.data || {}) } }; }
    catch (error) { return { result: { ok: false, status: error.status || 500, code: error.code || '', error: error.message } }; }
  };
  wx.navigateTo = options => {
    if (!options.url?.startsWith('/subpackages/ai/')) return originalNavigate?.(options);
    const query = new URL(options.url, 'http://preview.local').searchParams;
    open({ tripId: query.get('tripId') || '' }); options.success?.({ eventChannel: channel });
  };
  wx.navigateBack = options => { if (s.aiOpen) { close(); options?.success?.(); } else originalBack?.(options); };
  p.call = call;
  ready = syncTripsToDb().then(() => setScenario(scenario));
  s.aiReady = ready;
  ready.then(() => p.refreshAiCapabilities?.()).catch(error => { s.aiWorkerError = { code: error.code, message: error.message }; });
  return { call, open, close, ready, scenarios: { set: setScenario }, waitForJobs: async () => { await Promise.all([...jobs]); }, inspect: () => ({ jobs: db.inspect('ai_jobs'), drafts: db.inspect('ai_drafts'), usage: db.inspect('ai_usage'), trips: db.inspect('trips') }) };
}
module.exports = { installAiPreview, mockPlan };
