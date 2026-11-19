'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createTrip, viewTrip } = require('../shared/domain.cjs');
const { installAiPreview } = require('../scripts/preview-ai.cjs');
async function fixture(mode = 'ai-design', empty = false) {
  const { trip, member } = createTrip({ name: '成都旅行', type: '旅游', start: '2026-11-10T08:00', end: '2026-11-12T18:00', nickname: '林一', avatarId: 'avatar-01', accountId: 'old-preview' });
  const p = { data: { trip: empty ? null : viewTrip(trip, member), account: { nickname: '林一' }, guestMode: false, authState: 'authenticated' }, setData(patch) { Object.assign(this.data, patch); } };
  const session = { trips: p.data.trip ? [p.data.trip] : [] };
  const wx = { getSystemInfoSync: () => ({}), getMenuButtonBoundingClientRect: () => ({ bottom: 87 }), showModal(options) { options.success({ confirm: true }); } };
  const bridge = installAiPreview({ session, page: p, wx, root: path.resolve('wechat-miniprogram/miniprogram'), mode });
  await bridge.open();
  return { p, session, wx, bridge, get page() { return session.aiPage; } };
}
async function generate(f, input = '帮我规划三天成都慢旅行') {
  f.page.setData({ input }); await f.page.send(); await f.bridge.waitForJobs(); await f.page.poll();
  return f.page.data.messages.findLast(message => message.draft);
}
test('native preview uses real draft validation and additive application, then resumes on reopen', async t => {
  const f = await fixture(); t.after(() => f.bridge.close());
  assert.equal(f.page.data.isPreview, true);
  assert.equal(f.p.data.account.profileComplete, true, 'authenticated fixtures must pass the actual dock login guard');
  const message = await generate(f);
  assert.match(message.text, /本地模拟/);
  assert.equal(message.draft.events.length, 9);
  assert.match(message.text, /推荐理由[\s\S]*准备清单[\s\S]*行程与清单应用/);
  assert.match(message.text, /### 第 3 天[\s\S]*14:30—16:00/);
  await f.page.openPreview({ currentTarget: { dataset: { id: message.id } } });
  f.page.bindEntry({ currentTarget: { dataset: { id: 'event-1', field: 'title' } }, detail: { value: '自行修改后的散步安排' } });
  await f.page.apply();
  assert.equal(f.p.data.trip.events[0].title, '自行修改后的散步安排');
  assert.equal(f.p.data.trip.items.length, 12);
  assert.ok(f.p.data.trip.items.every(item => item.owner === f.p.data.trip.me));
  const conversationId = f.page.data.conversationId;
  f.bridge.close(); await f.bridge.open();
  assert.equal(f.page.data.conversationId, conversationId);
  assert.equal(f.page.data.messages.findLast(message => message.draft).draft.appliedEntryIds.length, 21);
});
test('preview asks for dates, supports follow-up and creates a new trip atomically', async t => {
  const f = await fixture('ai-design', true); t.after(() => f.bridge.close());
  assert.equal(await generate(f, '想去杭州旅行'), undefined);
  assert.match(f.page.data.messages.at(-1).text, /补充出发与归来日期/);
  const message = await generate(f, '2026-11-10 至 2026-11-12，两个人，步行，节奏轻松');
  await f.page.openPreview({ currentTarget: { dataset: { id: message.id } } });
  assert.equal(f.page.data.target, 'new');
  await f.page.apply();
  assert.equal(f.session.trips.length, 1);
  assert.equal(f.p.data.trip.events.length, 9);
  const next = await generate(f, '只准备一份衣物清单');
  assert.ok(next?.draft);
  assert.equal(next.draft.events.length, 0);
  assert.ok(next.draft.items.every(item => ['衣物准备', '行前确认'].includes(item.category)));
  assert.equal(f.page.data.error, '');
});

test('preview follow-up uses the latest destination and carries the relaxed pace', async t => {
  const f = await fixture(); t.after(() => f.bridge.close());
  await generate(f, '帮我规划成都慢旅行');
  const changed = await generate(f, '目的地改成杭州，2026-11-20 至 2026-11-22');
  assert.equal(changed.draft.trip.name, '杭州慢旅行');
  assert.equal(changed.draft.trip.start, '2026-11-20T08:00');
  assert.equal(changed.draft.events[0].startTime, '10:00');
  assert.match(changed.draft.events[0].title, /西湖/);
});
test('preview timeout and exhausted quota are real service states with no trip mutation', async t => {
  const timeout = await fixture('ai-timeout'); t.after(() => timeout.bridge.close());
  const before = timeout.p.data.trip.events.length;
  await generate(timeout);
  assert.match(timeout.page.data.error, /超时/);
  assert.equal(timeout.p.data.trip.events.length, before);
  const quota = await fixture('ai-quota'); t.after(() => quota.bridge.close());
  quota.page.setData({ input: '帮我安排杭州三日游' }); await quota.page.send();
  assert.match(quota.page.data.error, /次数已用完/);
  assert.equal(Object.keys(quota.bridge.inspect().jobs).length, 0);
});

test('generation progress can recover a finished reply without sending another job', async t => {
  const f = await fixture(); t.after(() => f.bridge.close());
  f.page.setData({ input: '帮我规划三天成都慢旅行' });
  await f.page.send();
  const { jobId, jobReceivedAt, jobElapsed, scrollTarget } = f.page.data;
  assert.ok(jobId && jobReceivedAt > 0);
  assert.match(jobElapsed, /秒$/);
  assert.equal(scrollTarget, 'generation-progress');
  await f.bridge.waitForJobs();

  const call = f.page.call.bind(f.page);
  let failOnce = true;
  f.page.call = async (operation, data) => {
    if (operation === 'getAiConversation' && failOnce) {
      failOnce = false;
      throw new Error('读取回复时连接断开');
    }
    return call(operation, data);
  };
  await f.page.poll();
  assert.equal(f.page.data.jobId, jobId);
  assert.equal(f.page.data.pollPaused, true);
  await f.page.retry();
  assert.equal(f.page.data.jobId, '');
  assert.equal(f.page.data.jobElapsed, '');
  assert.equal(f.page.data.pollPaused, false);
  assert.equal(f.page.data.scrollTarget, 'conversation-bottom');
  assert.ok(f.page.data.messages.at(-1).draft);
  assert.equal(Object.keys(f.bridge.inspect().jobs).length, 1);
});
