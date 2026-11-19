const test = require('node:test');
const assert = require('node:assert/strict');
const { createDispatcher, signJobEvent } = require('../cloudfunctions/suixing-api/ai-dispatch.cjs');
const { verifyJobEvent } = require('../cloudfunctions/suixing-ai-worker/worker.cjs');

const now = Date.parse('2026-11-04T00:00:00Z');
const env = { AI_ENABLED: 'true', AI_WORKER_SECRET: 'test-worker-secret-at-least-thirty-two-characters',
  TENCENTCLOUD_SECRETID: 'test-role-id', TENCENTCLOUD_SECRETKEY: 'test-role-key', TENCENTCLOUD_SESSIONTOKEN: 'test-session-token',
  AI_SCF_REGION: 'ap-shanghai', AI_SCF_NAMESPACE: 'test-cloudbase-env' };
const jobId = 'job_1234567890';

test('SCF dispatcher sends a signed Event invocation containing only the job reference', async () => {
  let captured;
  const dispatch = createDispatcher({ env, now: () => now, fetchImpl: async (url, request) => {
    captured = { url, request };
    return { ok: true, json: async () => ({ Response: { RequestId: 'accepted-request', Result: { FunctionRequestId: 'worker-request' } } }) };
  } });
  assert.deepEqual(await dispatch(jobId), { requestId: 'accepted-request', functionRequestId: 'worker-request' });
  const { url, request } = captured;
  assert.equal(url, 'https://scf.tencentcloudapi.com');
  assert.equal(request.method, 'POST');
  const body = JSON.parse(request.body);
  assert.equal(body.InvocationType, 'Event');
  assert.equal(body.FunctionName, 'suixing-ai-worker');
  assert.equal(body.Namespace, 'test-cloudbase-env');
  const event = JSON.parse(body.ClientContext);
  assert.deepEqual(Object.keys(event).sort(), ['issuedAt', 'jobId', 'signature']);
  assert.equal(verifyJobEvent(event, env.AI_WORKER_SECRET, now), jobId);
  assert.match(request.headers.Authorization, /^TC3-HMAC-SHA256 Credential=test-role-id\/2026-11-04\/scf\/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=[0-9a-f]{64}$/);
  assert.equal(request.headers['X-TC-Token'], 'test-session-token');
  assert.equal(request.headers['X-TC-Timestamp'], String(Math.floor(now / 1000)));
  assert.equal(request.headers['X-TC-Action'], 'Invoke');
  assert.equal(request.headers['X-TC-Version'], '2018-04-16');
  assert.equal(request.headers['X-TC-Region'], 'ap-shanghai');
  assert.ok(request.signal instanceof AbortSignal);
});

test('disabled or incomplete dispatcher configuration never sends a request', async () => {
  for (const change of [{ AI_ENABLED: 'false' }, { AI_WORKER_SECRET: '' }, { TENCENTCLOUD_SESSIONTOKEN: '' }, { AI_SCF_NAMESPACE: '' }, { AI_SCF_REGION: 'evil.example/path' }]) {
    let called = false;
    const dispatch = createDispatcher({ env: { ...env, ...change }, fetchImpl: async () => { called = true; } });
    await assert.rejects(dispatch(jobId), { code: 'AI_DISPATCH_CONFIG' });
    assert.equal(called, false);
  }
});

test('definite rejection and ambiguous network delivery remain distinguishable for quota recovery', async () => {
  const rejected = createDispatcher({ env, now: () => now, fetchImpl: async () => ({ ok: true, json: async () => ({ Response: { Error: { Code: 'UnauthorizedOperation', Message: 'private provider detail' } } }) }) });
  await assert.rejects(rejected(jobId), (error) => error.code === 'AI_DISPATCH_REJECTED' && !error.message.includes('private'));
  const uncertain = createDispatcher({ env, now: () => now, fetchImpl: async () => { throw Error('socket lost after upload'); } });
  await assert.rejects(uncertain(jobId), { code: 'AI_DISPATCH_UNCERTAIN' });
  const malformed = createDispatcher({ env, now: () => now, fetchImpl: async () => ({ ok: true, json: async () => ({ unexpected: true }) }) });
  await assert.rejects(malformed(jobId), { code: 'AI_DISPATCH_UNCERTAIN' });
});

test('dispatch event validation rejects unsafe or missing task identity', () => {
  assert.throws(() => signJobEvent('../task', now, env.AI_WORKER_SECRET), { code: 'AI_DISPATCH_CONFIG' });
  assert.throws(() => signJobEvent(jobId, NaN, env.AI_WORKER_SECRET), { code: 'AI_DISPATCH_CONFIG' });
});

test('dispatcher resolves rotating credentials separately for each invocation context', async () => {
  const seenContexts = [], sent = [];
  const dispatch = createDispatcher({ env: { ...env, TENCENTCLOUD_SECRETID: '', TENCENTCLOUD_SECRETKEY: '', TENCENTCLOUD_SESSIONTOKEN: '' },
    now: () => now,
    getCredentials: async (context) => {
      seenContexts.push(context);
      return { TENCENTCLOUD_SECRETID: `role-${context.requestId}`, TENCENTCLOUD_SECRETKEY: `secret-${context.requestId}`, TENCENTCLOUD_SESSIONTOKEN: `token-${context.requestId}` };
    },
    fetchImpl: async (_, request) => { sent.push(request); return { ok: true, json: async () => ({ Response: { RequestId: 'accepted' } }) }; },
  });
  const a = { requestId: 'a' }, b = { requestId: 'b' };
  await Promise.all([dispatch(jobId, a), dispatch(jobId, b)]);
  assert.deepEqual(seenContexts, [a, b]);
  assert.match(sent[0].headers.Authorization, /Credential=role-a\//);
  assert.equal(sent[0].headers['X-TC-Token'], 'token-a');
  assert.match(sent[1].headers.Authorization, /Credential=role-b\//);
  assert.equal(sent[1].headers['X-TC-Token'], 'token-b');
});

test('failed dynamic credential lookup is a definite pre-dispatch failure', async () => {
  let fetched = false;
  const dispatch = createDispatcher({ env, getCredentials: () => { throw Error('private credential error'); }, fetchImpl: async () => { fetched = true; } });
  await assert.rejects(dispatch(jobId), (error) => error.code === 'AI_DISPATCH_CONFIG' && !error.message.includes('private'));
  assert.equal(fetched, false);
});
