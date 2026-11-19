/* Local WeChat DevTools QA only. Every AI RPC is intercepted; no cloud writes. */
const automator = require('miniprogram-automator');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../output');
fs.mkdirSync(output, { recursive: true });

async function box(page, selector) {
  const el = await page.$(selector);
  if (!el) return null;
  return { ...(await el.offset()), ...(await el.size()) };
}
async function run() {
  // DevTools 2.02 reports Tool.getInfo.version instead of SDKVersion. Use the
  // SDK connection/classes directly; the normal connect() version check throws.
  const Connection = require('miniprogram-automator/out/Connection').default;
  const MiniProgram = require('miniprogram-automator/out/MiniProgram').default;
  const connection = await Connection.create(process.env.WECHAT_AUTOMATION_URL || 'ws://127.0.0.1:9420');
  const app = new MiniProgram(connection);
  const report = { scope: 'WeChat DevTools, mocked AI RPC, no production writes', timestamp: new Date().toISOString(), checks: [], exceptions: [], unverified: ['Physical-device keyboard and performance', 'Live model generation and production itinerary writes are not covered by this fixture'] };
  app.on('exception', e => report.exceptions.push(e.message || String(e)));
  let installed = false;
  let page;
  let screenshotsAvailable = true;
  async function shot(filename) {
    if (!screenshotsAvailable) return;
    try { await Promise.race([app.screenshot({ path: path.join(output, filename) }), new Promise((_, reject) => setTimeout(() => reject(new Error('Native screenshot did not complete within 3 seconds')), 3000))]); }
    catch (error) { report.screenshotError = error.message; screenshotsAvailable = false; }
  }
  try {
    report.device = await app.systemInfo();
    report.startPage = (await app.currentPage()).path;
    if (report.startPage === 'subpackages/ai/pages/chat/index') await app.navigateBack();
    report.stage = 'install-mock';
    await app.evaluate(() => {
      const host = getApp();
      if (host.__aiNativeQA) throw new Error('Another AI QA fixture is active');
      const storageKey = 'xiangye-ai-session:ai-native-qa:trip:native-qa-trip';
      host.__aiNativeQA = { originalCall: wx.cloud.callFunction, originalPreview: wx.__localPreview, savedStorage: wx.getStorageSync(storageKey), savedCurrentTrip: wx.getStorageSync('xiangye-current-trip'), savedProfileTrip: wx.getStorageSync('xiangye-profile-trip'), storageKey, calls: [], messages: [], status: '', polls: 0 };
      const q = host.__aiNativeQA;
      q.trip = { id: 'native-qa-trip', name: '成都慢旅行 · 本地验收', type: '旅游', start: '2026-11-10T08:00', end: '2026-11-12T18:00', revision: 0, archived: false, events: [], items: [], members: [] };
      q.draft = { id: 'draft-native-qa', schemaVersion: 1, sourceTripId: q.trip.id, baseRevision: 0, trip: { name: '成都慢旅行', type: '旅游', start: q.trip.start, end: q.trip.end }, events: [
        { id: 'event-1', date: '2026-11-10', startTime: '09:00', endTime: '11:00', title: '在人民公园喝茶，慢慢感受成都', address: '成都市人民公园', startPlace: '', endPlace: '', transportMode: 'walking', note: '本地模拟方案，请核实营业时间。' },
        { id: 'event-2', date: '2026-11-11', startTime: '10:00', endTime: '12:00', title: '漫步宽窄巷子', address: '成都市宽窄巷子', startPlace: '', endPlace: '', transportMode: 'walking', note: '预留休息时间。' }
      ], items: [{ id: 'item-1', title: '轻便雨具', category: '随身用品', scope: '我的', key: false, linkedDate: '', remind: '' }], appliedEntryIds: [] };
      wx.removeStorageSync(storageKey);
      wx.__localPreview = true;
      wx.cloud.callFunction = options => {
        const op = options.data.operation, payload = options.data.data || {};
        q.calls.push(op);
        let data;
        if (op === 'getAiCapabilities') data = { enabled: true, allowed: true, canUse: true, remainingToday: 20, dailyLimit: 20, activeJobId: '' };
        else if (op === 'bootstrapAccount') data = { account: { id: 'ai-native-qa', nickname: '本地验收', profileComplete: true }, trips: [] };
        else if (op === 'getTrip') data = { trip: q.trip };
        else if (op === 'submitAiMessage') {
          q.messages = [{ id: 'message-user', role: 'user', text: payload.message, jobId: 'job-native-qa' }]; q.status = 'queued';
          data = { jobId: 'job-native-qa', conversationId: 'conv-native-qa', status: 'queued', remainingToday: 19, dailyLimit: 20 };
        } else if (op === 'getAiJob') {
          q.polls++;
          if (q.polls < 2) data = { jobId: 'job-native-qa', conversationId: 'conv-native-qa', status: 'running', remainingToday: 19 };
          else { q.status = 'succeeded'; q.messages[1] = { id: 'message-assistant', role: 'assistant', text: '【本地模拟】把这趟成都慢旅行整理好了。每天留一些闲逛的时间，下面的安排和清单都可以继续修改。', jobId: 'job-native-qa', draft: q.draft }; data = { jobId: 'job-native-qa', conversationId: 'conv-native-qa', status: 'succeeded', text: q.messages[1].text, draft: q.draft, remainingToday: 19 }; }
        } else if (op === 'applyAiDraft') {
          q.appliedPayload = payload;
          q.draft.appliedEntryIds = payload.selectedEntryIds;
          q.trip = { ...q.trip, revision: q.trip.revision + 1, events: payload.editedEntries.filter(entry => q.draft.events.some(event => event.id === entry.id)), items: payload.editedEntries.filter(entry => q.draft.items.some(item => item.id === entry.id)) };
          data = { trip: q.trip, appliedEntryIds: q.draft.appliedEntryIds };
        } else if (op === 'getAiConversation') data = { conversationId: 'conv-native-qa', tripId: q.trip.id, messages: q.messages, activeJobId: q.status === 'queued' ? 'job-native-qa' : '' };
        else if (op === 'deleteAiConversation') { q.messages = []; q.status = ''; data = { deleted: 'conv-native-qa' }; }
        else return Promise.resolve({ result: { ok: false, status: 403, code: 'QA_READ_ONLY', error: '原生验收禁止写入操作' } });
        return Promise.resolve({ result: { ok: true, data } });
      };
      return true;
    });
    installed = true;
    report.stage = 'navigate-subpackage'; console.log(report.stage);
    page = await app.navigateTo('/subpackages/ai/pages/chat/index?tripId=native-qa-trip');
    report.stage = 'wait-ready'; console.log(report.stage);
    await page.waitFor(async () => (await page.data()).ready);
    const initial = await page.data();
    report.stage = 'measure-welcome'; console.log(report.stage);
    report.checks.push({ name: 'normal-subpackage-load', path: page.path, passed: page.path === 'subpackages/ai/pages/chat/index' && initial.allowed && initial.isPreview, header: await box(page, '.ai-header'), composer: await box(page, '.ai-composer'), capsule: await app.evaluate(() => wx.getMenuButtonBoundingClientRect()) });
    await shot('ai-native-01-welcome.png');
    report.stage = 'input-send'; console.log(report.stage);

    const input = await page.$('.ai-composer-box textarea');
    await input.input('帮我规划 11 月 10 日到 12 日的成都三日旅行，两个人，偏好轻松散步。');
    await (await page.$('.ai-send')).tap();
    await page.waitFor(250);
    const generating = await page.data();
    report.checks.push({ name: 'native-send-and-generating-state', passed: ['queued', 'running'].includes(generating.jobStatus), status: generating.jobStatus });
    await shot('ai-native-02-generating.png');

    await page.callMethod('onHide');
    const beforeHidden = await app.evaluate(() => getApp().__aiNativeQA.polls);
    await page.waitFor(2700);
    const afterHidden = await app.evaluate(() => getApp().__aiNativeQA.polls);
    await page.callMethod('onShow');
    await page.waitFor(async () => (await page.data()).messages.some(message => message.hasDraft));
    report.checks.push({ name: 'hide-pauses-poll-show-recovers', passed: beforeHidden === afterHidden && (await page.data()).messages.some(message => message.hasDraft), pollsBeforeHide: beforeHidden, pollsAfterWait: afterHidden });
    await shot('ai-native-03-plan.png');

    await (await page.$('.ai-plan-preview')).tap();
    await page.waitFor(200);
    report.checks.push({ name: 'read-before-selection', passed: (await page.data()).planOpen && !(await page.data()).previewOpen && !!(await page.$('.ai-plan-reader-content')) });
    await shot('ai-native-04-reader.png');
    await (await page.$('.ai-plan-reader .ai-primary')).tap();
    await page.waitFor(200);
    report.checks.push({ name: 'draft-selection-default-private', passed: (await page.data()).scope === '我的' && (await page.data()).selectedCount === 3, footer: await box(page, '.ai-apply-footer') });
    await shot('ai-native-04-confirm.png');
    await (await page.$('.ai-check')).tap();
    await page.waitFor(async () => (await page.data()).selectedCount === 2);
    report.checks.push({ name: 'native-entry-toggle', passed: (await page.data()).selectedCount === 2 });
    await (await page.$('.ai-check')).tap();
    await page.waitFor(async () => (await page.data()).selectedCount === 3);
    await (await page.$('.ai-edit')).tap();
    await page.waitFor(120);
    const editor = await page.$('.ai-entry-fields input');
    await app.evaluate(() => {
      const p = getCurrentPages()[getCurrentPages().length - 1], original = p.bindEntry;
      p.bindEntry = function(event) { getApp().__aiNativeQA.editEvent = { dataset: event.currentTarget.dataset, value: event.detail.value }; return original.call(this,event); };
    });
    await editor.input('人民公园慢逛与喝茶');
    await page.waitFor(250);
    report.checks.push({ name: 'native-edit-retains-draft', passed: (await page.data()).rows[0].title === '人民公园慢逛与喝茶', inputValue: await editor.value(), rows: (await page.data()).rows.map(row => ({id:row.id,title:row.title})), event: await app.evaluate(() => getApp().__aiNativeQA.editEvent) });
    await shot('ai-native-05-edit.png');
    await app.evaluate(() => getCurrentPages()[getCurrentPages().length - 1].keyboardListener({ height: 300 }));
    await page.waitFor(200);
    const footer = await box(page, '.ai-apply-footer');
    report.checks.push({ name: 'edit-keyboard-simulated-inset', passed: footer.top + footer.height <= report.device.windowHeight - 300 + 1, keyboardHeight: 300, footer, note: 'Injected native keyboard-height callback; actual phone keyboard unverified' });
    await shot('ai-native-06-edit-keyboard-inset.png');
    await app.evaluate(() => getCurrentPages()[getCurrentPages().length - 1].keyboardListener({ height: 0 }));
    await page.callMethod('setTarget', { currentTarget: { dataset: { target: 'new' } } });
    await page.waitFor(120);
    await (await page.$('.ai-preview-scroll')).scrollTo(0, 0);
    await shot('ai-native-07-new-trip.png');
    report.checks.push({ name: 'new-trip-form', passed: (await page.data()).target === 'new' && !!(await page.$('.ai-form-card')) });

    await page.callMethod('setTarget', { currentTarget: { dataset: { target: 'current' } } });
    await app.mockWxMethod('showModal', {confirm:true,cancel:false});
    await (await page.$('.ai-preview .ai-primary')).tap();
    await page.waitFor(async () => !!(await page.data()).result);
    const applied = await app.evaluate(() => ({ events: getApp().__aiNativeQA.trip.events, ids: getApp().__aiNativeQA.draft.appliedEntryIds }));
    report.checks.push({ name: 'native-apply-to-isolated-fixture-with-simulated-confirmation', passed: (await page.data()).result.count === 3 && applied.events[0].title === '人民公园慢逛与喝茶' && applied.ids.length === 3 });
    await app.restoreWxMethod('showModal');

    await page.callMethod('closePreview');
    await page.callMethod('closePlan');
    await app.evaluate(() => getCurrentPages()[getCurrentPages().length - 1].keyboardListener({ height: 300 }));
    await page.waitFor(200);
    const composer = await box(page, '.ai-composer');
    const send = await box(page, '.ai-send');
    report.checks.push({ name: 'composer-keyboard-simulated-inset', passed: composer.top + composer.height <= report.device.windowHeight - 300 + 1 && send.height >= 44 && send.width >= 44, composer, send, keyboardHeight: 300 });
    await shot('ai-native-08-compose-keyboard-inset.png');
    report.calls = await app.evaluate(() => getApp().__aiNativeQA.calls);
    report.checks.push({ name: 'writes-intercepted-by-isolated-fixture', passed: report.calls.filter(op => op === 'applyAiDraft').length === 1, calls: report.calls });
  } catch (error) {
    report.error = error.stack || String(error);
    process.exitCode = 1;
  } finally {
    try { await app.restoreWxMethod('showModal'); } catch {}
    if (installed) {
      try {
        await app.evaluate(() => {
          const page = getCurrentPages()[getCurrentPages().length - 1];
          if (page.route === 'subpackages/ai/pages/chat/index') { page.onHide(); page.keyboardListener({ height: 0 }); }
          const q = getApp().__aiNativeQA;
          wx.cloud.callFunction = q.originalCall; wx.__localPreview = q.originalPreview;
          if (q.savedStorage) wx.setStorageSync(q.storageKey, q.savedStorage); else wx.removeStorageSync(q.storageKey);
          for (const [key, value] of [['xiangye-current-trip', q.savedCurrentTrip], ['xiangye-profile-trip', q.savedProfileTrip]]) { if (value) wx.setStorageSync(key,value); else wx.removeStorageSync(key); }
          delete getApp().__aiNativeQA;
          return true;
        });
        report.mockRestored = true;
      } catch (error) { report.restoreError = error.message; }
    }
    app.disconnect();
    report.passed = !report.error && report.checks.every(check => check.passed) && !report.exceptions.length;
    fs.writeFileSync(path.join(output, 'ai-native-verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
