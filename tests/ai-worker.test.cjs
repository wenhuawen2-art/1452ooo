const test = require('node:test');
const assert = require('node:assert/strict');
const { createAiWorker, verifyJobEvent } = require('../cloudfunctions/suixing-ai-worker/worker.cjs');
const { createModelGenerator, MODEL_TIMEOUT_MS } = require('../cloudfunctions/suixing-ai-worker/model.cjs');
const { signJobEvent } = require('../cloudfunctions/suixing-api/ai-dispatch.cjs');
const contract = require('../shared/ai-contract.cjs');

const SECRET = 'test-worker-signing-secret-with-32-characters';
const START = Date.parse('2026-11-04T00:00:00Z');
const JOB = 'job_1234567890';

function memoryDb(seed) {
  let records = structuredClone(seed), queue = Promise.resolve();
  const source = (state) => ({ collection(name) {
    const query = (selector, key) => ({
      limit() { return this; },
      async get() { return { data: Object.entries(state[name] || {}).filter(([id, value]) => key != null ? id === key : Object.entries(selector).every(([k, v]) => value[k] === v)).map(([id, value]) => ({ ...structuredClone(value), _id: id })) }; },
      async set(value) { (state[name] ||= {})[key] = structuredClone(value); },
    });
    return { doc: (key) => query({}, key), where: (selector) => query(selector) };
  } });
  return {
    ...source(records),
    get records() { return records; },
    runTransaction(work) {
      const next = queue.then(async () => { const staged = structuredClone(records); const result = await work(source(staged)); records = staged; return result; });
      queue = next.catch(() => {}); return next;
    },
  };
}

function fixture({ response, generate, env: override, job: jobOverride } = {}) {
  let time = START;
  const job = { id: JOB, accountId: 'account-1', conversationId: 'conversation-1', tripId: '', baseRevision: null,
    message: '帮我列出清单', history: [], context: null, status: 'queued', leaseUntil: 0,
    usageKey: 'daily-1', activeKey: 'active-1', createdAt: START, deadlineAt: START + 120000, expiresAt: START + 86400000,
    ...jobOverride };
  const db = memoryDb({
    ai_jobs: { [JOB]: job },
    ai_usage: { 'daily-1': { id: 'daily-1', accountId: 'account-1', used: 3, reserved: 1, activeJobId: JOB },
      'active-1': { id: 'active-1', accountId: 'account-1', activeJobId: JOB, expiresAt: START + 120000 } },
    user_accounts: { 'account-1': { profileComplete: true } },
    ai_conversations: { 'conversation-1': { id: 'conversation-1', accountId: 'account-1', updatedAt: START, expiresAt: START + 86400000 } },
    trips: { 'trip-1': { id: 'trip-1', archived: false, members: [{ id: 'member-1' }] } },
    trip_members: { 'member-link-1': { accountId: 'account-1', tripId: 'trip-1', memberId: 'member-1' } },
  });
  const env = { AI_ENABLED: 'true', AI_ALLOWLIST: 'account-1,account-2', AI_WORKER_SECRET: SECRET, ...override };
  const calls = [];
  const model = async (messages) => { calls.push(messages); return generate ? generate(messages) : response || { text: JSON.stringify({ text: '建议带好证件', draft: { items: [{ title: '身份证', category: '证件', scope: '我的', key: true }], events: [] } }), usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 } }; };
  const run = createAiWorker({ db, generate: model, env, now: () => time, contract, timeoutMs: 30 });
  return { db, run, calls, env, event: () => signJobEvent(JOB, time, SECRET), advance: (ms) => { time += ms; } };
}

test('public worker refuses paid-provider fallback and jobs without a global reservation',async()=>{
 const missing=fixture({env:{AI_PUBLIC_ENABLED:'true',AI_MODEL_PROVIDER:'hunyuan-v3'}});await missing.run(missing.event());assert.equal(missing.calls.length,0);
 const paid=fixture({env:{AI_PUBLIC_ENABLED:'true',AI_MODEL_PROVIDER:'cloudbase'},job:{globalBudget:{jobId:JOB}}});await paid.run(paid.event());assert.equal(paid.calls.length,0);
 const open=fixture({env:{AI_PUBLIC_ENABLED:'true',AI_ALLOWLIST:'',AI_MODEL_PROVIDER:'hunyuan-v3'},job:{globalBudget:{jobId:JOB,dayKey:'global_day_2026-11-04',monthKey:'global_month_2026-11'}}});await open.run(open.event());assert.equal(open.calls.length,1);
});

test('worker rejects missing, tampered, stale, and unsigned tasks before reading database', async () => {
  const f = fixture();
  await assert.rejects(f.run({ jobId: JOB }), { code: 'AI_WORKER_UNAUTHORIZED' });
  await assert.rejects(f.run({ ...f.event(), jobId: 'another_job_id' }), { code: 'AI_WORKER_UNAUTHORIZED' });
  await assert.rejects(f.run(signJobEvent(JOB, START - 300001, SECRET)), { code: 'AI_WORKER_UNAUTHORIZED' });
  await assert.rejects(f.run({ ...f.event(), signature: 'a'.repeat(64) }), { code: 'AI_WORKER_UNAUTHORIZED' });
  assert.equal(f.calls.length, 0);
  assert.equal(f.db.records.ai_usage['daily-1'].reserved, 1);
  assert.throws(() => verifyJobEvent(f.event(), ''), { code: 'AI_WORKER_CONFIG' });
});

test('successful worker stores normalized draft and conversation history atomically, charging once', async () => {
  const f = fixture(); f.advance(100);
  assert.equal((await f.run(f.event())).status, 'succeeded');
  const state = f.db.records;
  assert.equal(f.calls.length, 1);
  assert.equal(state.ai_usage['daily-1'].used, 4);
  assert.equal(state.ai_usage['daily-1'].reserved, 0);
  assert.equal(state.ai_usage['daily-1'].activeJobId, '');
  assert.equal(state.ai_usage['active-1'].activeJobId, '');
  assert.equal(state.ai_drafts[JOB].accountId, 'account-1');
  assert.equal(state.ai_drafts[JOB].items[0].id, 'item-1');
  assert.deepEqual(state.ai_drafts[JOB].applications, {});
  assert.deepEqual(state.ai_jobs[JOB].result.usage, { promptTokens: 100, completionTokens: 40, totalTokens: 140 });
  const message = state.ai_messages[`${JOB}_assistant`];
  assert.equal(JSON.parse(message.modelContent).draft.items[0].title, '身份证');
  assert.equal(state.ai_conversations['conversation-1'].updatedAt, START + 100);
  assert.equal((await f.run(f.event())).duplicate, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.db.records.ai_usage['daily-1'].used, 4);
});

test('concurrent async redelivery claims the job only once', async () => {
  let complete;
  const f = fixture({ generate: () => new Promise((resolve) => { complete = resolve; }) });
  const first = f.run(f.event());
  while (!complete) await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await f.run(f.event())).status, 'running');
  complete({ text: '{"text":"请告诉我日期","draft":null}', usage: {} });
  await first;
  assert.equal(f.calls.length, 1);
  assert.equal(f.db.records.ai_jobs[JOB].status, 'succeeded');
  assert.equal(f.db.records.ai_drafts, undefined);
});

test('expired running lease never starts another paid request or overwrites timeout later', async () => {
  let complete;
  const f = fixture({ generate: () => new Promise((resolve) => { complete = resolve; }) });
  const first = f.run(f.event());
  while (!complete) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.db.records.ai_jobs[JOB].leaseUntil - START, 120000);
  f.advance(65000);
  assert.equal((await f.run(f.event())).status, 'running');
  f.advance(55001);
  assert.equal((await f.run(f.event())).status, 'failed');
  complete({ text: '{"text":"迟到结果","draft":null}' }); await first;
  assert.equal(f.calls.length, 1);
  assert.equal(f.db.records.ai_jobs[JOB].status, 'failed');
  assert.equal(f.db.records.ai_messages, undefined);
  assert.equal(f.db.records.ai_usage['active-1'].activeJobId, '');
  assert.equal(f.db.records.ai_usage['daily-1'].used, 4);
});

for (const [name, env] of [['disabled', { AI_ENABLED: 'false' }], ['not allowlisted', { AI_ALLOWLIST: 'different-account' }]]) {
  test(`${name} worker releases queued reservation without inference`, async () => {
    const f = fixture({ env });
    assert.equal((await f.run(f.event())).status, 'failed');
    assert.equal(f.calls.length, 0);
    assert.equal(f.db.records.ai_usage['daily-1'].used, 3);
    assert.equal(f.db.records.ai_usage['daily-1'].reserved, 0);
    assert.equal(f.db.records.ai_usage['active-1'].activeJobId, '');
  });
}

test('removed trip membership stops generation and releases quota before model call', async () => {
  const f = fixture({ job: { tripId: 'trip-removed' } });
  await f.run(f.event());
  assert.equal(f.calls.length, 0);
  assert.equal(f.db.records.ai_jobs[JOB].error.code, 'AI_TRIP_ACCESS_CHANGED');
  assert.equal(f.db.records.ai_usage['daily-1'].reserved, 0);
});

test('archived trip and expired conversation are rejected before paid generation', async () => {
  const archived = fixture({ job: { tripId: 'trip-1' } });
  archived.db.records.trips['trip-1'].archived = true;
  await archived.run(archived.event());
  assert.equal(archived.calls.length, 0);
  assert.equal(archived.db.records.ai_jobs[JOB].error.code, 'AI_TRIP_ACCESS_CHANGED');
  const expired = fixture();
  expired.db.records.ai_conversations['conversation-1'].expiresAt = START;
  await expired.run(expired.event());
  assert.equal(expired.calls.length, 0);
  assert.equal(expired.db.records.ai_jobs[JOB].error.code, 'AI_CONVERSATION_EXPIRED');
});

const changedAccessCases = [
  ['allowlist revoked', (f) => { f.env.AI_ALLOWLIST = 'account-2'; }, 'AI_UNAVAILABLE'],
  ['AI switched off', (f) => { f.env.AI_ENABLED = 'false'; }, 'AI_UNAVAILABLE'],
  ['account removed', (f) => { delete f.db.records.user_accounts['account-1']; }, 'AI_LOGIN_REQUIRED'],
  ['membership removed', (f) => { delete f.db.records.trip_members['member-link-1']; }, 'AI_TRIP_ACCESS_CHANGED'],
  ['trip archived', (f) => { f.db.records.trips['trip-1'].archived = true; }, 'AI_TRIP_ACCESS_CHANGED'],
  ['trip deleted', (f) => { delete f.db.records.trips['trip-1']; }, 'AI_TRIP_ACCESS_CHANGED'],
  ['conversation expired', (f) => { f.db.records.ai_conversations['conversation-1'].expiresAt = START; }, 'AI_CONVERSATION_EXPIRED'],
  ['conversation deleted', (f) => { delete f.db.records.ai_conversations['conversation-1']; }, 'AI_CONVERSATION_EXPIRED'],
];
for (const [name, change, errorCode] of changedAccessCases) {
  test(`${name} during inference discards result without resurrecting data`, async () => {
    let complete;
    const f = fixture({ job: { tripId: 'trip-1' }, generate: () => new Promise((resolve) => { complete = resolve; }) });
    const running = f.run(f.event());
    while (!complete) await new Promise((resolve) => setImmediate(resolve));
    change(f);
    complete({ text: '{"text":"迟到方案","draft":{"events":[],"items":[{"title":"证件","category":"出行","scope":"我的"}]}}' });
    await running;
    assert.equal(f.db.records.ai_jobs[JOB].status, 'failed');
    assert.equal(f.db.records.ai_jobs[JOB].error.code, errorCode);
    assert.equal(f.db.records.ai_drafts, undefined);
    assert.equal(f.db.records.ai_messages, undefined);
    assert.equal(f.db.records.ai_usage['daily-1'].used, 4);
    assert.equal(f.db.records.ai_usage['active-1'].activeJobId, '');
    if (name === 'conversation deleted') assert.equal(f.db.records.ai_conversations['conversation-1'], undefined);
  });
}

test('deleteAiConversation cancellation remains final when model returns afterward', async () => {
  let complete;
  const f = fixture({ generate: () => new Promise((resolve) => { complete = resolve; }) });
  const running = f.run(f.event());
  while (!complete) await new Promise((resolve) => setImmediate(resolve));
  f.db.records.ai_jobs[JOB].status = 'cancelled';
  delete f.db.records.ai_conversations['conversation-1'];
  delete f.db.records.ai_drafts;
  delete f.db.records.ai_messages;
  complete({ text: '{"text":"迟到结果","draft":{"events":[],"items":[{"title":"证件","category":"出行","scope":"我的"}]}}' });
  assert.equal((await running).status, 'cancelled');
  assert.equal(f.db.records.ai_jobs[JOB].status, 'cancelled');
  assert.equal(f.db.records.ai_conversations['conversation-1'], undefined);
  assert.equal(f.db.records.ai_drafts, undefined);
  assert.equal(f.db.records.ai_messages, undefined);
});

test('expired queued job does not consume paid allowance', async () => {
  const f = fixture(); f.advance(120001);
  await f.run(f.event());
  assert.equal(f.calls.length, 0);
  assert.equal(f.db.records.ai_jobs[JOB].error.code, 'AI_JOB_EXPIRED');
  assert.equal(f.db.records.ai_usage['daily-1'].used, 3);
});

test('invalid model output leaves no partial draft and keeps the started request charge', async () => {
  const f = fixture({ response: { text: '{"text":"bad","draft":{"events":[{"date":"2026-02-30"}]}}' } });
  await f.run(f.event());
  assert.equal(f.db.records.ai_jobs[JOB].status, 'failed');
  assert.equal(f.db.records.ai_jobs[JOB].error.code, 'AI_INVALID_OUTPUT');
  assert.equal(f.db.records.ai_drafts, undefined);
  assert.equal(f.db.records.ai_messages, undefined);
  assert.equal(f.db.records.ai_usage['daily-1'].used, 4);
  assert.equal(f.db.records.ai_usage['active-1'].activeJobId, '');
});

test('model deadline records a safe failure and releases concurrency without refunding started call', async () => {
  const f = fixture({ generate: () => new Promise(() => {}) });
  await f.run(f.event());
  assert.equal(f.db.records.ai_jobs[JOB].error.code, 'AI_MODEL_TIMEOUT');
  assert.equal(f.db.records.ai_usage['daily-1'].used, 4);
  assert.equal(f.db.records.ai_usage['active-1'].activeJobId, '');
});

test('completion preserves a newer account gate across Beijing midnight', async () => {
  let complete;
  const f = fixture({ generate: () => new Promise((resolve) => { complete = resolve; }) });
  const first = f.run(f.event());
  while (!complete) await new Promise((resolve) => setImmediate(resolve));
  f.db.records.ai_usage['active-1'].activeJobId = 'newer-job';
  complete({ text: '{"text":"完成","draft":null}' }); await first;
  assert.equal(f.db.records.ai_usage['active-1'].activeJobId, 'newer-job');
});

test('a stale queued task cannot steal another task reservation or account gate', async () => {
  const f = fixture();
  f.db.records.ai_usage['daily-1'].activeJobId = 'newer-job';
  f.db.records.ai_usage['active-1'].activeJobId = 'newer-job';
  await f.run(f.event());
  assert.equal(f.calls.length, 0);
  assert.equal(f.db.records.ai_jobs[JOB].error.code, 'AI_QUOTA_STATE');
  assert.equal(f.db.records.ai_usage['daily-1'].reserved, 1);
  assert.equal(f.db.records.ai_usage['active-1'].activeJobId, 'newer-job');
});

test('hy3 adapter disables thinking, forbids tool loops, limits output and rejects truncation', async () => {
  let captured;
  const app = { ai: () => ({ createModel: (provider) => {
    assert.equal(provider, 'cloudbase');
    return { generateText: async (input, options) => { captured = { input, options }; return { text: 'partial', rawResponses: [{ choices: [{ finish_reason: 'length' }] }] }; } };
  } }) };
  await assert.rejects(createModelGenerator(app, {})([{ role: 'user', content: 'test' }]), { code: 'AI_OUTPUT_TRUNCATED' });
  assert.equal(captured.input.model, 'hy3');
  assert.deepEqual(captured.input.thinking, { type: 'disabled' });
  assert.equal(captured.input.maxSteps, 1);
  assert.equal(captured.input.max_tokens, 8192);
  assert.deepEqual(captured.input.response_format, { type: 'json_object' });
  assert.equal(captured.options.timeout, MODEL_TIMEOUT_MS);
  assert.equal(captured.input.tools, undefined);
});

test('unknown AI provider releases reservations and never selects a fallback model', async () => {
  let providerSelections = 0;
  const app = { ai() { providerSelections++; throw Error('unexpected model access'); } };
  for (const value of ['', 'tokenhub', 'hunyuan-v3 ', 'custom-hy3', '__proto__']) {
    const env = { AI_MODEL_PROVIDER: value };
    await assert.rejects(createModelGenerator(app, env)([]), { code: 'AI_WORKER_CONFIG' });
    const f = fixture({ env });
    assert.equal((await f.run(f.event())).status, 'failed');
    assert.equal(f.db.records.ai_jobs[JOB].error.code, 'AI_WORKER_CONFIG');
    assert.equal(f.db.records.ai_usage['daily-1'].used, 3);
    assert.equal(f.db.records.ai_usage['daily-1'].reserved, 0);
    assert.equal(f.db.records.ai_usage['active-1'].activeJobId, '');
    assert.equal(f.calls.length, 0);
  }
  assert.equal(providerSelections, 0);
});

test('installed CloudBase SDK forwards actual hy3 payload through its provider and request pipeline', async (t) => {
  const { createRequire } = require('node:module');
  const path = require('node:path');
  const sdkRequire = createRequire(path.resolve(__dirname, '../cloudfunctions/suixing-api/package.json'));
  let AI;
  try { ({ AI } = sdkRequire('@cloudbase/ai')); }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    t.skip('Install suixing-api dependencies to run the real SDK adapter check'); return;
  }
  const requests = [];
  const hidden = 'private-reasoning-test-sentinel';
  const finalAnswer = '{"text":"建议","draft":null}';
  let content = finalAnswer, finishReason = 'stop', upstreamError;
  const ai = new AI({ fetch: async (options) => {
    requests.push(options);
    if (upstreamError) throw upstreamError;
    return { data: Promise.resolve({ choices: [{ finish_reason: finishReason, message: { role: 'assistant', content, reasoning_content: hidden } }],
      usage: { prompt_tokens: 13, completion_tokens: 7, total_tokens: 20, completion_tokens_details: { reasoning_tokens: 3 } } }), header: new Headers() };
  } }, 'https://offline-sdk-test.invalid/v1', { t: (text) => text, lang: 'zh', LANG_HEADER_KEY: 'Accept-Language' });
  const app = { ai: () => ai };
  const messages = [{ role: 'user', content: '准备旅行' }];
  const cases = [
    [undefined, undefined, 'disabled'], ['cloudbase', 'unknown', 'disabled'],
    ['hunyuan-v3', 'disabled', 'disabled'], ['cloudbase', 'enabled', 'enabled'], ['hunyuan-v3', 'enabled', 'enabled'],
  ];
  for (const [provider, mode, expected] of cases) {
    const result = await createModelGenerator(app, { AI_MODEL_PROVIDER: provider, AI_THINKING_MODE: mode })(messages);
    const request = requests.at(-1);
    assert.equal(request.url, 'https://offline-sdk-test.invalid/v1/ai/' + (provider || 'cloudbase') + '/chat/completions');
    const payload = JSON.parse(request.body);
    assert.equal(payload.model, 'hy3');
    assert.equal(payload.thinking.type, expected);
    assert.equal(payload.reasoning_effort, expected === 'enabled' ? 'low' : undefined);
    assert.equal(payload.max_tokens, expected === 'enabled' ? 16384 : 8192);
    assert.deepEqual(payload.response_format, provider === 'hunyuan-v3' ? undefined : { type: 'json_object' });
    assert.equal(payload.stream, false);
    assert.equal(payload.tools, undefined);
    assert.equal(result.text, finalAnswer);
    assert.deepEqual(result.usage, { prompt_tokens: 13, completion_tokens: 7, total_tokens: 20, reasoning_tokens: 3 });
    assert.ok(!JSON.stringify(result).includes(hidden));
  }
  const generate = createModelGenerator(app, { AI_MODEL_PROVIDER: 'hunyuan-v3', AI_THINKING_MODE: 'enabled' });
  for (const [reason, code] of [['length', 'AI_OUTPUT_TRUNCATED'], ['content_filter', 'AI_INVALID_RESPONSE'], [undefined, 'AI_INVALID_RESPONSE']]) {
    finishReason = reason;
    await assert.rejects(generate(messages), { code });
  }
  finishReason = 'stop'; content = '';
  await assert.rejects(generate(messages), { code: 'AI_INVALID_RESPONSE' });
  upstreamError = Object.assign(new Error('gifted quota exhausted'), { code: 'EXCEED_TOKEN_QUOTA_LIMIT' });
  const beforeError = requests.length;
  await assert.rejects(generate(messages), { code: 'EXCEED_TOKEN_QUOTA_LIMIT' });
  assert.deepEqual(requests.slice(beforeError).map(req => req.url), ['https://offline-sdk-test.invalid/v1/ai/hunyuan-v3/chat/completions']);
});

test('worker stores final answer and numeric reasoning usage only, including in subsequent conversation history', async () => {
  const sentinel = 'private-reasoning-test-sentinel';
  const f = fixture({ response: {
    text: JSON.stringify({ text: '准备好水杯', draft: { events: [], items: [{ title: '水杯', category: '日用' }] } }),
    reasoning_content: sentinel,
    usage: { prompt_tokens: 10, completion_tokens: 30, total_tokens: 40, reasoning_tokens: 18, raw: sentinel },
  } });
  assert.equal((await f.run(f.event())).status, 'succeeded');
  assert.equal(f.db.records.ai_jobs[JOB].result.usage.reasoningTokens, 18);
  assert.match(f.db.records.ai_messages[`${JOB}_assistant`].modelContent, /水杯/);
  assert.ok(!JSON.stringify(f.db.records).includes(sentinel));
});

test('the installed SDK streams public reply phases and preserves final usage with one request', async t => {
  const { createRequire } = require('node:module');
  const { resolve } = require('node:path');
  const sdkRequire = createRequire(resolve(__dirname, '../cloudfunctions/suixing-api/package.json'));
  let AI;
  try { ({ AI } = sdkRequire('@cloudbase/ai')); }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    t.skip('Install suixing-api dependencies to exercise the SDK stream'); return;
  }
  const requests = [];
  const hidden = 'private-reasoning\n准备清单：不应触发进度';
  const ai = new AI({ fetch: async options => {
    requests.push(options);
    const frames = [
      { choices: [{ delta: { reasoning_content: hidden } }] },
      ...fragments.map(content => ({ choices: [{ delta: { content } }] })),
      { choices: [{ delta: {}, finish_reason: finishReason }] },
      { choices: [], usage: { prompt_tokens: 13, completion_tokens: 7, total_tokens: 20, completion_tokens_details: { reasoning_tokens: 3 } } },
    ];
    const body = frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n';
    return { data: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close(); } }), header: new Headers() };
  } }, 'https://offline-sdk-test.invalid/v1', { t: text => text, lang: 'zh', LANG_HEADER_KEY: 'Accept-Language' });
  const generate = createModelGenerator({ ai: () => ai }, { AI_MODEL_PROVIDER: 'hunyuan-v3', AI_THINKING_MODE: 'enabled' });
  const messages = [{ role: 'user', content: '规划旅行' }];
  let fragments = ['{"text":"建议\\n\\n### 每日', '安排\\n上午散步\\n\\n准备清单：', '带上水杯","draft":null}'];
  let finishReason = 'stop';

  const phases = [];
  const result = await generate(messages, phase => phases.push(phase));
  assert.deepEqual(phases, ['reply', 'checklist', 'checklist']);
  assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0].body).stream, true);
  assert.match(requests[0].url, /\/ai\/hunyuan-v3\/chat\/completions$/);
  assert.equal(result.text, fragments.join(''));
  assert.deepEqual(result.usage, { prompt_tokens: 13, completion_tokens: 7, total_tokens: 20, reasoning_tokens: 3 });
  assert.ok(!JSON.stringify(result).includes(hidden));

  fragments = ['{"text":"概览\\n每日安排\\n', '上午散步\\n准备清单\\n水杯","draft":null}'];
  phases.length = 0;
  await generate(messages, phase => phases.push(phase));
  assert.deepEqual(phases, ['itinerary', 'checklist']);

  fragments = ['{"text":"### 准备清单\\n水杯","draft":null}'];
  phases.length = 0;
  await generate(messages, phase => phases.push(phase));
  assert.deepEqual(phases, ['checklist']);

  finishReason = 'length';
  await assert.rejects(generate(messages, () => {}), { code: 'AI_OUTPUT_TRUNCATED' });
  assert.equal(requests.length, 4);
});
