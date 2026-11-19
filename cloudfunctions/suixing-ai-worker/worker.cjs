const { createHmac, timingSafeEqual } = require('node:crypto');
const { modelProvider, MODEL_TIMEOUT_MS } = require('./model.cjs');
const RUNNING_LEASE_MS = MODEL_TIMEOUT_MS + 30000;

const fail = (code, message, status = 400) => { throw Object.assign(new Error(message), { code, status }); };
const clean = (value) => { if (!value) return null; const { _id, ...record } = value; return record; };
const first = async (reference) => { const { data } = await reference.get(); return clean(Array.isArray(data) ? data[0] : data); };
const terminal = (status) => ['succeeded', 'failed', 'cancelled'].includes(status);
const withoutPrompt = (job) => { const { message, context, history, ...metadata } = job; return metadata; };
const allowed = (env, accountId) => env.AI_ENABLED === 'true' && (env.AI_PUBLIC_ENABLED === 'true' || String(env.AI_ALLOWLIST || '').split(/[\s,;]+/).filter(Boolean).includes(accountId));

function verifyJobEvent(event, secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32) fail('AI_WORKER_CONFIG', 'AI 服务尚未配置', 503);
  if (!event || typeof event.jobId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(event.jobId) ||
      !Number.isSafeInteger(event.issuedAt) || Math.abs(now - event.issuedAt) > 300000 ||
      typeof event.signature !== 'string' || !/^[a-f0-9]{64}$/.test(event.signature))
    fail('AI_WORKER_UNAUTHORIZED', '无权执行 AI 任务', 403);
  const expected = createHmac('sha256', secret).update(`${event.issuedAt}.${event.jobId}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(event.signature, 'hex')))
    fail('AI_WORKER_UNAUTHORIZED', '无权执行 AI 任务', 403);
  return event.jobId;
}

function safeUsage(value) {
  const count = (n) => Number.isSafeInteger(n) && n >= 0 ? n : 0;
  const usage = { promptTokens: count(value?.prompt_tokens), completionTokens: count(value?.completion_tokens), totalTokens: count(value?.total_tokens) };
  if (Number.isSafeInteger(value?.reasoning_tokens) && value.reasoning_tokens >= 0) usage.reasoningTokens = value.reasoning_tokens;
  return usage;
}

function safeFailure(error) {
  if (error?.code === 'AI_OUTPUT_TRUNCATED') return { code: error.code, message: '内容较长，请缩小日期或清单范围后重试' };
  if (error?.code === 'AI_MODEL_TIMEOUT' || /timeout|timed out|ETIMEDOUT/i.test(String(error?.code || '') + String(error?.message || '')))
    return { code: 'AI_MODEL_TIMEOUT', message: '生成超时，请缩小范围后重试' };
  if (['AI_INVALID_RESPONSE', 'AI_INVALID_DRAFT', 'AI_INVALID_OUTPUT'].includes(error?.code))
    return { code: error.code, message: '生成内容格式不完整，请重新描述需求' };
  return { code: 'AI_MODEL_FAILED', message: '暂时无法生成，请稍后重试' };
}

function createAiWorker({ db, generate, env = process.env, now = Date.now, contract, timeoutMs = MODEL_TIMEOUT_MS } = {}) {
  if (!db || typeof generate !== 'function') throw new TypeError('AI worker requires database and model generator');
  const { GENERATION_PHASES, parseModelResponse, buildModelMessages } = contract || require('./ai-contract.cjs');

  const finishQueued = async (transaction, job, usage, gate, error, at) => {
    if (usage?.activeJobId === job.id) {
      usage.reserved = Math.max(0, Number(usage.reserved || 0) - 1);
      if (usage.activeJobId === job.id) usage.activeJobId = '';
      usage.updatedAt = at;
      await transaction.collection('ai_usage').doc(job.usageKey).set(usage);
    }
    if (gate?.activeJobId === job.id) {
      gate.activeJobId = ''; gate.updatedAt = at;
      await transaction.collection('ai_usage').doc(job.activeKey).set(gate);
    }
    const result = { ...withoutPrompt(job), status: 'failed', error, updatedAt: at, finishedAt: at, leaseUntil: 0 };
    await transaction.collection('ai_jobs').doc(job.id).set(result);
    return { run: false, job: result };
  };

  return async function runAiJob(event) {
    const jobId = verifyJobEvent(event, String(env.AI_WORKER_SECRET || ''), now());
    const claim = await db.runTransaction(async (transaction) => {
      const job = await first(transaction.collection('ai_jobs').doc(jobId));
      if (!job) fail('AI_JOB_NOT_FOUND', 'AI 任务不存在', 404);
      if (terminal(job.status)) return { run: false, job };
      const at = now();
      const usage = job.usageKey ? await first(transaction.collection('ai_usage').doc(job.usageKey)) : null;
      const gate = job.activeKey ? await first(transaction.collection('ai_usage').doc(job.activeKey)) : null;
      if (job.status === 'running') {
        if (Number(job.leaseUntil) > at) return { run: false, job };
        // A crashed invocation may already have reached the paid model. Never
        // re-run inference on lease expiry or an asynchronous queue retry.
        if (usage?.activeJobId === job.id) {
          usage.activeJobId = ''; usage.updatedAt = at;
          await transaction.collection('ai_usage').doc(job.usageKey).set(usage);
        }
        if (gate?.activeJobId === job.id) {
          gate.activeJobId = ''; gate.updatedAt = at;
          await transaction.collection('ai_usage').doc(job.activeKey).set(gate);
        }
        const failed = { ...withoutPrompt(job), status: 'failed', error: { code: 'AI_MODEL_TIMEOUT', message: '任务执行已超时，请重新发起' }, updatedAt: at, finishedAt: at, leaseUntil: 0 };
        await transaction.collection('ai_jobs').doc(jobId).set(failed);
        return { run: false, job: failed };
      }
      if (job.status !== 'queued') fail('AI_JOB_STATE', 'AI 任务状态无效', 409);
      if (!allowed(env, job.accountId)) return finishQueued(transaction, job, usage, gate, { code: 'AI_UNAVAILABLE', message: 'AI 内测暂未开放' }, at);
      if (!modelProvider(env)) return finishQueued(transaction, job, usage, gate, { code: 'AI_WORKER_CONFIG', message: 'AI 服务尚未配置' }, at);
      if (env.AI_PUBLIC_ENABLED === 'true' && (modelProvider(env) !== 'hunyuan-v3' || !job.globalBudget || job.globalBudget.jobId !== job.id))
        return finishQueued(transaction, job, usage, gate, { code: 'AI_BUDGET_CONFIG', message: '全站额度与免费模型保护配置待确认' }, at);
      if (Number(job.expiresAt) <= at || (job.deadlineAt && Number(job.deadlineAt) <= at))
        return finishQueued(transaction, job, usage, gate, { code: 'AI_JOB_EXPIRED', message: '任务已过期，请重新发起' }, at);
      if (!usage || Number(usage.reserved || 0) < 1 || usage.activeJobId !== job.id || gate?.activeJobId !== job.id)
        return finishQueued(transaction, job, usage, gate, { code: 'AI_QUOTA_STATE', message: '任务额度状态已失效，请重新发起' }, at);
      const account = await first(transaction.collection('user_accounts').doc(job.accountId));
      if (!account?.profileComplete) return finishQueued(transaction, job, usage, gate, { code: 'AI_LOGIN_REQUIRED', message: '请先完成登录' }, at);
      const conversation = await first(transaction.collection('ai_conversations').doc(job.conversationId));
      if (!conversation || conversation.accountId !== job.accountId || Number(conversation.expiresAt) <= at)
        return finishQueued(transaction, job, usage, gate, { code: 'AI_CONVERSATION_EXPIRED', message: '会话已过期，请重新发起' }, at);
      if (job.tripId) {
        const link = await first(transaction.collection('trip_members').where({ accountId: job.accountId, tripId: job.tripId }).limit(1));
        const trip = await first(transaction.collection('trips').doc(job.tripId));
        if (!link || !trip || trip.archived || !trip.members?.some((member) => member.id === link.memberId))
          return finishQueued(transaction, job, usage, gate, { code: 'AI_TRIP_ACCESS_CHANGED', message: '旅行已归档或访问权限已变化，请重新选择旅行' }, at);
      }
      const running = { ...job, status: 'running', phase: 'analysis', startedAt: at, updatedAt: at, leaseUntil: at + RUNNING_LEASE_MS };
      usage.reserved = Math.max(0, Number(usage.reserved || 0) - 1);
      usage.used = Number(usage.used || 0) + 1; usage.updatedAt = at;
      await transaction.collection('ai_usage').doc(job.usageKey).set(usage);
      await transaction.collection('ai_jobs').doc(jobId).set(running);
      return { run: true, job: running };
    });
    if (!claim.run) return { ok: true, jobId, status: claim.job.status, duplicate: true };

    let phaseIndex = 0, phaseWrites = Promise.resolve(), tracking = true;
    const reportPhase = phase => {
      const next = GENERATION_PHASES.indexOf(phase);
      if (!tracking || next <= phaseIndex) return;
      phaseIndex = next;
      phaseWrites = phaseWrites.then(() => db.runTransaction(async transaction => {
        const ref = transaction.collection('ai_jobs').doc(jobId);
        const current = await first(ref);
        const at = now();
        if (current?.status !== 'running' || current.startedAt !== claim.job.startedAt || at >= current.leaseUntil) return;
        await ref.set({ ...current, phase, updatedAt: at });
      })).catch(() => {}); // A missed progress update should never fail a reply.
    };
    let parsed, usage, failure, timer;
    try {
      const response = await Promise.race([
        generate(buildModelMessages(claim.job), reportPhase),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('AI model timeout'), { code: 'AI_MODEL_TIMEOUT' })), Math.min(MODEL_TIMEOUT_MS, Math.max(1, timeoutMs))); }),
      ]);
      if (typeof response?.text !== 'string' || response.text.length > 65536)
        fail('AI_INVALID_RESPONSE', '生成内容格式无效');
      parsed = parseModelResponse(response.text);
      usage = safeUsage(response.usage);
      reportPhase('finalizing');
    } catch (error) { failure = safeFailure(error); }
    finally { clearTimeout(timer); }
    tracking = false;
    await phaseWrites;

    const completed = await db.runTransaction(async (transaction) => {
      const current = await first(transaction.collection('ai_jobs').doc(jobId));
      if (!current || current.status !== 'running' || current.startedAt !== claim.job.startedAt)
        return current?.status || 'failed';
      const daily = await first(transaction.collection('ai_usage').doc(current.usageKey));
      const gate = current.activeKey ? await first(transaction.collection('ai_usage').doc(current.activeKey)) : null;
      const conversation = await first(transaction.collection('ai_conversations').doc(current.conversationId));
      const account = await first(transaction.collection('user_accounts').doc(current.accountId));
      let tripAccessChanged = false;
      if (current.tripId) {
        const link = await first(transaction.collection('trip_members').where({ accountId: current.accountId, tripId: current.tripId }).limit(1));
        const trip = await first(transaction.collection('trips').doc(current.tripId));
        tripAccessChanged = !link || !trip || trip.archived || !trip.members?.some((member) => member.id === link.memberId);
      }
      const at = now();
      const finalFailure = !allowed(env, current.accountId)
        ? { code: 'AI_UNAVAILABLE', message: 'AI 内测暂未开放' }
        : !account?.profileComplete ? { code: 'AI_LOGIN_REQUIRED', message: '请先完成登录' }
        : !conversation || conversation.accountId !== current.accountId || Number(conversation.expiresAt) <= at
          ? { code: 'AI_CONVERSATION_EXPIRED', message: '会话已过期，请重新发起' }
        : tripAccessChanged ? { code: 'AI_TRIP_ACCESS_CHANGED', message: '旅行已归档或访问权限已变化，请重新选择旅行' }
        : failure || (Number(current.leaseUntil) <= at || Number(current.expiresAt) <= at
        ? { code: 'AI_MODEL_TIMEOUT', message: '任务执行已超时，请重新发起' }
        : null);
      if (daily?.activeJobId === jobId) {
        daily.activeJobId = ''; daily.updatedAt = at;
        await transaction.collection('ai_usage').doc(current.usageKey).set(daily);
      }
      if (gate?.activeJobId === jobId) {
        gate.activeJobId = ''; gate.updatedAt = at;
        await transaction.collection('ai_usage').doc(current.activeKey).set(gate);
      }
      if (finalFailure) {
        await transaction.collection('ai_jobs').doc(jobId).set({ ...withoutPrompt(current), status: 'failed', error: finalFailure, updatedAt: at, finishedAt: at, leaseUntil: 0 });
        return 'failed';
      }
      const draftId = parsed.draft ? jobId : null;
      if (parsed.draft) await transaction.collection('ai_drafts').doc(draftId).set({
        ...parsed.draft, id: draftId, accountId: current.accountId, conversationId: current.conversationId,
        sourceTripId: current.tripId || '', baseRevision: current.baseRevision ?? null,
        createdAt: at, expiresAt: current.expiresAt, appliedEntries: {}, applications: {},
      });
      await transaction.collection('ai_messages').doc(`${jobId}_assistant`).set({
        id: `${jobId}_assistant`, jobId, accountId: current.accountId, conversationId: current.conversationId,
        role: 'assistant', text: parsed.text, draftId, modelContent: JSON.stringify(parsed), createdAt: at, expiresAt: current.expiresAt,
      });
      if (conversation?.accountId === current.accountId)
        await transaction.collection('ai_conversations').doc(current.conversationId).set({ ...conversation, updatedAt: at });
      await transaction.collection('ai_jobs').doc(jobId).set({ ...withoutPrompt(current), status: 'succeeded',
        result: { text: parsed.text, draftId, usage }, updatedAt: at, finishedAt: at, leaseUntil: 0 });
      return 'succeeded';
    });
    return { ok: true, jobId, status: completed };
  };
}

module.exports = { createAiWorker, verifyJobEvent, safeUsage };
