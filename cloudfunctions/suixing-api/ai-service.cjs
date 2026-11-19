"use strict";

const { createHash } = require("node:crypto");
const { id, createTrip, mutateTrip, viewTrip } = require("./domain.cjs");
const { GENERATION_PHASES, LIMITS, aiError, normalizeDraft, normalizeTrip, contextFromTrip, selectHistory, historyContent, beijingDay } = require("./ai-contract.cjs");
const { purgeConversation } = require("./ai-lifecycle.cjs");
const {budgetStatus,reserveGlobalBudget,flushBudgetAlerts}=require('./ai-budget.cjs');
const DAILY_LIMIT = 20;
const RETENTION_MS = 30 * 86400000;
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const clean = (doc) => { if (!doc) return null; const { _id, ...value } = doc; return value; };
const getDoc = async (source, name, key) => {
  const result = await source.collection(name).doc(key).get();
  return clean(Array.isArray(result.data) ? result.data[0] : result.data);
};
const put = (source, name, key, value) => source.collection(name).doc(key).set(value);
const query = async (source, name, fields, limit = 100) => (await source.collection(name).where(fields).limit(limit).get()).data.map(clean);
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const fingerprint = (value) => hash(JSON.stringify(canonical(value)));
const fail = (status, code, message) => { throw aiError(status, code, message); };
const identifier = (value, label) => {
  if (typeof value !== "string" || !/^[\w:.-]{1,100}$/.test(value)) fail(400, "AI_INVALID_REQUEST", `${label}无效`);
  return value;
};
const requestId = (value) => { identifier(value, "请求标识"); if (value.length < 8) fail(400, "AI_INVALID_REQUEST", "请求标识过短"); return value; };
const terminal = (status) => ["succeeded", "failed", "cancelled"].includes(status);
const eventFields = ["date", "startTime", "endTime", "title", "address", "startPlace", "endPlace", "transportMode", "note"];
const itemFields = ["title", "category", "key", "linkedDate", "remind"];

function reviewedDraft(draft, edits, newTrip) {
  if (edits != null && (!Array.isArray(edits) || edits.length > LIMITS.events + LIMITS.items)) fail(400, "AI_INVALID_REQUEST", "编辑内容无效");
  const next = { trip: null, events: draft.events.map((row) => ({ ...row })), items: draft.items.map((row) => ({ ...row })) };
  const seen = new Set();
  for (const edit of edits || []) {
    if (!edit || typeof edit !== "object" || seen.has(edit.id)) fail(400, "AI_INVALID_REQUEST", "编辑项目标识重复或无效");
    seen.add(edit.id);
    const event = next.events.find((row) => row.id === edit.id), item = next.items.find((row) => row.id === edit.id);
    if (!event && !item) fail(400, "AI_INVALID_REQUEST", "只能编辑当前方案中的项目");
    const fields = event ? eventFields : itemFields;
    for (const field of Object.keys(edit)) if (field !== "id" && !fields.includes(field)) fail(400, "AI_INVALID_REQUEST", "编辑内容包含不支持的字段");
    for (const field of fields) if (Object.prototype.hasOwnProperty.call(edit, field)) (event || item)[field] = edit[field];
  }
  // Structural checks apply to the full draft, target-date checks only to selected
  // entries when mutateTrip writes them. Unselected days must not block a subset.
  const normalized = normalizeDraft(next);
  return normalized && { ...normalized, trip: normalizeTrip(newTrip || draft.trip) };
}

// Apply only reviewed, additive content. Callers persist this clone inside one DB transaction.
function applyDraftToTrip(sourceTrip, member, draft, selectedEntryIds, scope, already = {}) {
  const trip = JSON.parse(JSON.stringify(sourceTrip));
  const actor = trip.members.find((entry) => entry.id === member.id);
  if (!actor) fail(403, "AI_FORBIDDEN", "成员身份已失效");
  if (trip.archived) fail(409, "AI_ARCHIVED", "旅行已归档，无法应用方案");
  const baseline = trip.revision;
  const selected = new Set(selectedEntryIds);
  const mappings = { ...already }, appliedEntryIds = [], skippedEntryIds = [];
  const fold = (value) => String(value || "").trim().toLowerCase();
  const mutate = (values) => mutateTrip(trip, actor, { ...values, revision: trip.revision });
  for (const entry of draft.events) {
    if (!selected.has(entry.id)) continue;
    if (mappings[entry.id]) { skippedEntryIds.push(entry.id); continue; }
    const existing = trip.events.find((event) => event.date === entry.date && event.startTime === entry.startTime && event.endTime === entry.endTime && fold(event.title) === fold(entry.title) && fold(event.address) === fold(entry.address));
    if (existing) { mappings[entry.id] = existing.id; skippedEntryIds.push(entry.id); continue; }
    const { id: entryId, ...values } = entry;
    mutate({ action: "event", ...values });
    mappings[entryId] = trip.events.at(-1).id; appliedEntryIds.push(entryId);
  }
  const owner = scope === "我的" ? actor.id : null;
  for (const entry of draft.items) {
    if (!selected.has(entry.id)) continue;
    if (mappings[entry.id]) { skippedEntryIds.push(entry.id); continue; }
    let category = trip.categories.find((row) => row.owner === owner && fold(row.name) === fold(entry.category));
    const existing = category && trip.items.find((item) => item.owner === owner && item.categoryId === category.id && fold(item.title) === fold(entry.title) && (item.linkedDate || "") === entry.linkedDate);
    if (existing) { mappings[entry.id] = existing.id; skippedEntryIds.push(entry.id); continue; }
    if (!category) {
      mutate({ action: "category", name: entry.category, scope });
      category = trip.categories.at(-1);
    }
    mutate({ action: "item", categoryId: category.id, scope, title: entry.title, key: entry.key, linkedDate: entry.linkedDate, remind: entry.remind });
    mappings[entry.id] = trip.items.at(-1).id; appliedEntryIds.push(entry.id);
  }
  // A whole reviewed batch is one collaborative edit, regardless of its item count.
  trip.revision = baseline + (appliedEntryIds.length ? 1 : 0);
  return { trip, mappings, appliedEntryIds, skippedEntryIds };
}

function createAiService({ db, dispatch, notifyBudget, env = process.env, now = Date.now, toView = async (trip, member, invite) => viewTrip(trip, member, invite) }) {
  const activeKey = (accountId) => `active_${hash(accountId)}`;
  const usageKey = (accountId, timestamp = now()) => `${hash(accountId)}_${beijingDay(timestamp)}`;
  const enabled = () => env.AI_ENABLED === "true";
  const allowed = (accountId) => env.AI_PUBLIC_ENABLED === 'true' || new Set(String(env.AI_ALLOWLIST || "").split(/[\s,;]+/).filter(Boolean)).has(accountId);
  const account = async (accountId, source = db) => {
    const value = await getDoc(source, "user_accounts", accountId);
    if (!value?.profileComplete) fail(401, "AI_LOGIN_REQUIRED", "请先登录后使用旅行助手");
    return value;
  };
  async function access(accountId) {
    if (!enabled()) fail(503, "AI_DISABLED", "旅行助手尚未开放");
    if (!allowed(accountId)) fail(403, "AI_NOT_ALLOWED", "旅行助手目前仅向内测账号开放");
    return account(accountId);
  }
  async function tripFor(source, accountId, tripId) {
    const link = (await query(source, "trip_members", { accountId, tripId }, 1))[0];
    if (!link) fail(403, "AI_FORBIDDEN", "无权访问此旅行");
    const trip = await getDoc(source, "trips", tripId);
    if (!trip) fail(404, "AI_TRIP_NOT_FOUND", "旅行不存在或已经删除");
    const member = trip.members.find((row) => row.id === link.memberId);
    if (!member) fail(403, "AI_FORBIDDEN", "成员身份已经失效");
    return { trip, member };
  }
  async function clearActive(source, job) {
    if (!job.activeKey) return;
    const gate = await getDoc(source, "ai_usage", job.activeKey);
    if (gate?.activeJobId === job.id) await put(source, "ai_usage", job.activeKey, { ...gate, activeJobId: "" });
  }
  async function stopJob(source, job, code, message, status = "failed") {
    if (terminal(job.status)) return job;
    const usage = await getDoc(source, "ai_usage", job.usageKey);
    if (usage) await put(source, "ai_usage", job.usageKey, { ...usage,
      reserved: Math.max(0, Number(usage.reserved || 0) - (job.status === "queued" && usage.activeJobId === job.id ? 1 : 0)),
      activeJobId: usage.activeJobId === job.id ? "" : usage.activeJobId, updatedAt: now() });
    await clearActive(source, job);
    const { message: prompt, context, history, ...metadata } = job;
    const stopped = { ...metadata, status, error: { code, message }, updatedAt: now() };
    await put(source, "ai_jobs", job.id, stopped);
    return stopped;
  }
  async function expire(source, job) {
    if (!job || terminal(job.status)) return job;
    if ((job.status === "queued" && job.deadlineAt <= now()) || (job.status === "running" && job.leaseUntil <= now())) return stopJob(source, job, "AI_TIMEOUT", "本次生成超时，请缩短要求后重新发送");
    return job;
  }
  async function sweepActive(accountId) {
    return db.runTransaction(async (source) => {
      const gate = await getDoc(source, "ai_usage", activeKey(accountId));
      if (!gate?.activeJobId) return "";
      const job = await expire(source, await getDoc(source, "ai_jobs", gate.activeJobId));
      if (!job || terminal(job.status)) { await put(source, "ai_usage", activeKey(accountId), { ...gate, activeJobId: "" }); return ""; }
      return job.id;
    });
  }
  const remaining = (usage) => Math.max(0, DAILY_LIMIT - Number(usage?.used || 0) - Number(usage?.reserved || 0));
  async function capabilities(accountId) {
    const flags = { enabled: enabled(), allowed: allowed(accountId), canUse: false, reason: "", dailyLimit: DAILY_LIMIT, remainingToday: DAILY_LIMIT, activeJobId: "" };
    if (!flags.enabled) return { ...flags, reason: "尚未开放" };
    if (!flags.allowed) return { ...flags, reason: "仅内测账号可用" };
    const user = await getDoc(db, "user_accounts", accountId);
    if (!user?.profileComplete) return { ...flags, reason: "请先登录" };
    flags.activeJobId = await sweepActive(accountId);
    flags.remainingToday = remaining(await getDoc(db, "ai_usage", usageKey(accountId)));
    const globalBudget=await budgetStatus(db,env,now());
    await flushBudgetAlerts(db,env,now,notifyBudget);
    return { ...flags, canUse: true, globalBudget, reason: flags.remainingToday ? "" : "今日次数已用完" };
  }
  async function submit(accountId, input = {}) {
    await access(accountId);
    requestId(input.clientRequestId);
    if (typeof input.message !== "string" || !input.message.trim() || input.message.length > LIMITS.message) fail(400, "AI_INVALID_REQUEST", "请输入不超过2000字的旅行需求");
    if (input.tripId) identifier(input.tripId, "旅行标识");
    if (input.conversationId) identifier(input.conversationId, "会话标识");
    const message = input.message.trim(), jobId = `ai_${hash(`${accountId}:${input.clientRequestId}`)}`;
    const requestHash = fingerprint({ message, tripId: input.tripId || "", conversationId: input.conversationId || "" });
    const timestamp = now();
    const created = await db.runTransaction(async (source) => {
      const previous = await getDoc(source, "ai_jobs", jobId);
      if (previous) {
        if (previous.accountId !== accountId || previous.requestHash !== requestHash) fail(409, "AI_REQUEST_CONFLICT", "该请求标识已用于其他消息");
        if (previous.expiresAt <= timestamp) fail(410, "AI_JOB_EXPIRED", "这条消息已过期，请重新发送");
        return { job: await expire(source, previous), fresh: false };
      }
      let conversation = input.conversationId ? await getDoc(source, "ai_conversations", input.conversationId) : null;
      if (input.conversationId && (!conversation || conversation.accountId !== accountId || conversation.expiresAt <= timestamp)) fail(404, "AI_CONVERSATION_NOT_FOUND", "会话不存在或已过期，请新建会话");
      if (conversation && Object.hasOwn(input, "tripId") && (conversation.tripId || "") !== input.tripId) fail(409, "AI_CONVERSATION_TRIP", "当前会话属于另一趟旅行，请新建会话");
      if (Number(conversation?.turnCount || 0) >= 20) fail(400, "AI_CONVERSATION_LIMIT", "本会话已满20轮，请新建会话继续");
      const tripId = conversation?.tripId || input.tripId || "";
      const visible = tripId ? await tripFor(source, accountId, tripId) : null;
      if (visible?.trip.archived) fail(409, "AI_ARCHIVED", "旅行已归档，请新建会话规划其他旅行");
      const gateKey = activeKey(accountId), gate = await getDoc(source, "ai_usage", gateKey);
      if (gate?.activeJobId) {
        const active = await expire(source, await getDoc(source, "ai_jobs", gate.activeJobId));
        if (active && !terminal(active.status)) fail(409, "AI_BUSY", "上一条消息仍在生成，请稍候");
      }
      const key = usageKey(accountId, timestamp), usage = await getDoc(source, "ai_usage", key) || { id: key, accountId, day: beijingDay(timestamp), used: 0, reserved: 0 };
      if (remaining(usage) <= 0) fail(429, "AI_LIMIT_REACHED", "今日20次生成机会已用完，明天再来吧");
      const globalBudget=await reserveGlobalBudget(source,env,timestamp,jobId);
      conversation ||= { id: id(), accountId, tripId, createdAt: timestamp, turnCount: 0 };
      const past = selectHistory((await query(source, "ai_messages", { conversationId: conversation.id }, 50)).filter((row) => row.accountId === accountId && row.expiresAt > timestamp).sort((a, b) => a.createdAt - b.createdAt));
      const job = { id: jobId, accountId, conversationId: conversation.id, tripId, baseRevision: visible?.trip.revision ?? null,
        message, requestHash, ...(globalBudget?{globalBudget}:{}), context: visible ? contextFromTrip(visible.trip, visible.member.id) : null,
        history: past.map((row) => ({ role: row.role, content: historyContent(row) })), status: "queued", dispatchState: "pending", usageKey: key, activeKey: gateKey,
        createdAt: timestamp, updatedAt: timestamp, deadlineAt: timestamp + 120000, leaseUntil: 0, expiresAt: timestamp + RETENTION_MS };
      await put(source, "ai_jobs", jobId, job);
      await put(source, "ai_conversations", conversation.id, { ...conversation, turnCount: Number(conversation.turnCount || 0) + 1, updatedAt: timestamp, expiresAt: timestamp + RETENTION_MS });
      await put(source, "ai_messages", `${jobId}_user`, { id: `${jobId}_user`, accountId, conversationId: conversation.id, jobId, role: "user", text: message, createdAt: timestamp, expiresAt: timestamp + RETENTION_MS });
      await put(source, "ai_usage", key, { ...usage, reserved: Number(usage.reserved || 0) + 1, activeJobId: jobId, updatedAt: timestamp, expiresAt: timestamp + RETENTION_MS });
      await put(source, "ai_usage", gateKey, { id: gateKey, accountId, activeJobId: jobId, updatedAt: timestamp, expiresAt: timestamp + RETENTION_MS });
      return { job, fresh: true };
    });
    let job = created.job;
    await flushBudgetAlerts(db,env,now,notifyBudget);
    if (created.fresh || (job.status === "queued" && !job.dispatchedAt && (job.dispatchState === "uncertain" || job.createdAt + 10000 < now()))) {
      if (!created.fresh) job = await db.runTransaction(async (source) => {
        const current = await getDoc(source, "ai_jobs", job.id);
        if (!current || current.status !== "queued" || current.dispatchedAt) return current || job;
        const retrying = { ...current, dispatchState: "uncertain" }; await put(source, "ai_jobs", job.id, retrying); return retrying;
      });
      try {
        await dispatch(job.id);
        job = await db.runTransaction(async (source) => {
          const current = await getDoc(source, "ai_jobs", job.id);
          if (!current || terminal(current.status)) return current || job;
          const sent = { ...current, dispatchedAt: now(), dispatchState: "accepted" }; await put(source, "ai_jobs", job.id, sent); return sent;
        });
      }
      catch (error) {
        // An uncertain network response may already have enqueued the worker: keep the reservation and job.
        job = await db.runTransaction(async (source) => {
          const current = await getDoc(source, "ai_jobs", jobId);
          if (!current || current.status !== "queued" || current.dispatchedAt) return current || job;
          if (created.fresh && current.dispatchState === "pending" && ["AI_DISPATCH_CONFIG", "AI_DISPATCH_REJECTED"].includes(error.code))
            return stopJob(source, current, error.code, "生成服务暂不可用，请稍后再试");
          const uncertain = { ...current, dispatchState: "uncertain" }; await put(source, "ai_jobs", jobId, uncertain); return uncertain;
        });
      }
    }
    return { jobId: job.id, conversationId: job.conversationId, status: job.status, ...(job.error ? { error: job.error } : {}), dailyLimit: DAILY_LIMIT, remainingToday: remaining(await getDoc(db, "ai_usage", usageKey(accountId))) };
  }
  const draftView = (draft) => draft ? { id: draft.id, schemaVersion: draft.schemaVersion, trip: draft.trip, events: draft.events, items: draft.items,
    sourceTripId: draft.sourceTripId || "", baseRevision: draft.baseRevision ?? null, createdTripId: draft.createdTripId || "",
    appliedEntryIds: [...new Set(Object.values(draft.appliedEntries || {}).flatMap((entries) => Object.keys(entries)))] } : null;
  async function getJob(accountId, input = {}) {
    await access(accountId); identifier(input.jobId, "任务标识");
    const job = await db.runTransaction(async (source) => {
      const value = await getDoc(source, "ai_jobs", input.jobId);
      if (!value || value.accountId !== accountId) fail(404, "AI_JOB_NOT_FOUND", "生成任务不存在");
      if (value.expiresAt <= now()) fail(410, "AI_JOB_EXPIRED", "生成任务已过期，请重新发起");
      return expire(source, value);
    });
    if (job.tripId) await tripFor(db, accountId, job.tripId);
    const draft = job.result?.draftId ? await getDoc(db, "ai_drafts", job.result.draftId) : null;
    return { jobId: job.id, conversationId: job.conversationId, status: job.status,
      ...(job.status === 'running' && GENERATION_PHASES.includes(job.phase) ? { phase: job.phase } : {}),
      text: job.result?.text || "", draft: draft && draft.accountId === accountId && draft.expiresAt > now() ? draftView(draft) : null,
      ...(job.error ? { error: job.error } : {}), remainingToday: remaining(await getDoc(db, "ai_usage", usageKey(accountId))) };
  }
  async function getConversation(accountId, input = {}) {
    await access(accountId);
    const scoped = Object.hasOwn(input, "tripId");
    if (scoped && input.tripId !== "") identifier(input.tripId, "旅行标识");
    if (scoped && input.tripId) await tripFor(db, accountId, input.tripId);
    let conversation;
    if (input.conversationId) {
      identifier(input.conversationId, "会话标识");
      conversation = await getDoc(db, "ai_conversations", input.conversationId);
    } else {
      if (!scoped) fail(400, "AI_INVALID_REQUEST", "请指定旅行或会话");
      // Read all matching pages, so recovering a trip is independent of local
      // storage and database default ordering. No new ordered index is needed.
      for (let offset = 0; ; offset += 100) {
        const rows = (await db.collection("ai_conversations").where({ accountId, tripId: input.tripId }).skip(offset).limit(100).get()).data.map(clean);
        for (const row of rows) if (row.expiresAt > now() && (!conversation || (row.updatedAt || row.createdAt || 0) > (conversation.updatedAt || conversation.createdAt || 0))) conversation = row;
        if (rows.length < 100) break;
      }
      if (!conversation) return { conversationId: "", tripId: input.tripId, messages: [], activeJobId: "" };
    }
    if (!conversation || conversation.accountId !== accountId || conversation.expiresAt <= now()) fail(404, "AI_CONVERSATION_NOT_FOUND", "会话不存在或已过期");
    if (scoped && (conversation.tripId || "") !== input.tripId) fail(409, "AI_CONVERSATION_TRIP", "当前会话属于另一趟旅行");
    if (conversation.tripId) await tripFor(db, accountId, conversation.tripId);
    const messages = (await query(db, "ai_messages", { conversationId: conversation.id }, 50)).filter((row) => row.accountId === accountId && row.expiresAt > now()).sort((a, b) => a.createdAt - b.createdAt);
    const jobs = new Map((await query(db, "ai_jobs", { conversationId: conversation.id }, 25)).filter((row) => row.accountId === accountId).map((row) => [row.id, row]));
    const safe = await Promise.all(messages.map(async (row) => {
      const draft = row.draftId ? await getDoc(db, "ai_drafts", row.draftId) : null;
      const job = jobs.get(row.jobId);
      return { id: row.id, role: row.role, text: row.text, jobId: row.jobId, draftId: row.draftId || "", createdAt: row.createdAt,
        ...(job ? { status: job.status, ...(job.error ? { error: job.error } : {}) } : {}),
        draft: draft && draft.accountId === accountId && draft.expiresAt > now() ? draftView(draft) : null };
    }));
    const active = await sweepActive(accountId), job = active ? await getDoc(db, "ai_jobs", active) : null;
    return { conversationId: conversation.id, tripId: conversation.tripId, messages: safe, activeJobId: job?.conversationId === conversation.id ? active : "" };
  }
  async function apply(accountId, input = {}) {
    const user = await access(accountId); identifier(input.draftId, "方案标识"); requestId(input.clientMutationId);
    if (!["current", "new"].includes(input.target)) fail(400, "AI_INVALID_REQUEST", "请选择应用到当前旅行或新旅行");
    if (!["我的", "公共"].includes(input.scope)) fail(400, "AI_INVALID_REQUEST", "请选择清单范围");
    if (!Array.isArray(input.selectedEntryIds) || !input.selectedEntryIds.length || input.selectedEntryIds.length > LIMITS.events + LIMITS.items || input.selectedEntryIds.some((value) => typeof value !== "string")) fail(400, "AI_INVALID_REQUEST", "请至少选择一项方案内容");
    const selection = [...new Set(input.selectedEntryIds)].sort();
    const receiptId = hash(`${accountId}:${input.clientMutationId}`);
    const requestHash = fingerprint({ draftId: input.draftId, target: input.target, tripId: input.tripId || "", scope: input.scope, selection,
      editedEntries: input.editedEntries || [], newTrip: input.newTrip || null });
    const result = await db.runTransaction(async (source) => {
      const receipt = await getDoc(source, "ai_apply_receipts", receiptId);
      if (receipt) {
        if (receipt.accountId !== accountId || receipt.requestHash !== requestHash) fail(409, "AI_REQUEST_CONFLICT", "此保存标识已用于其他内容，请重新确认方案");
        const visible = await tripFor(source, accountId, receipt.tripId);
        return { ...visible, receipt, replayed: true };
      }
      const stored = await getDoc(source, "ai_drafts", input.draftId);
      if (!stored || stored.accountId !== accountId) fail(404, "AI_DRAFT_NOT_FOUND", "方案不存在");
      if (stored.expiresAt <= now()) fail(410, "AI_DRAFT_EXPIRED", "方案已过期，请重新生成");
      if (stored.sourceTripId) await tripFor(source, accountId, stored.sourceTripId);
      let visible, invite = "", created = false;
      const newSpec = input.target === "new" ? normalizeTrip(input.newTrip || stored.trip) : null;
      if (input.target === "new" && !newSpec) fail(400, "AI_TRIP_DETAILS_REQUIRED", "请补充新旅行的名称、类型及日期");
      if (input.target === "current") {
        identifier(input.tripId, "旅行标识"); visible = await tripFor(source, accountId, input.tripId);
        if (!Number.isInteger(input.baseRevision) || input.baseRevision !== visible.trip.revision) fail(409, "AI_CONFLICT", "旅行刚刚更新，请刷新后重新核对方案");
      } else if (stored.createdTripId) {
        visible = await tripFor(source, accountId, stored.createdTripId);
        if (stored.createdTripSpecHash !== fingerprint(newSpec)) fail(409, "AI_CONFLICT", "这份方案已创建旅行，请到该旅行中修改基本信息");
      } else {
        visible = createTrip({ ...newSpec, accountId, nickname: user.nickname, avatarId: user.avatarId, avatarData: user.avatarData });
        created = true; invite = id();
      }
      const normalized = reviewedDraft(stored, input.editedEntries, newSpec);
      const allIds = new Set([...normalized.events, ...normalized.items].map((entry) => entry.id));
      if (selection.some((entryId) => !allIds.has(entryId))) fail(400, "AI_INVALID_REQUEST", "所选项目不属于当前方案");
      const applied = applyDraftToTrip(visible.trip, visible.member, normalized, selection, input.scope, stored.appliedEntries?.[visible.trip.id]);
      if (created) {
        await put(source, "trip_members", hash(`${accountId}:${applied.trip.id}`), { accountId, tripId: applied.trip.id, memberId: visible.member.id, createdAt: now() });
        await put(source, "trip_invites", invite, { token: invite, tripId: applied.trip.id, active: true, createdAt: now() });
      }
      await put(source, "trips", applied.trip.id, applied.trip);
      const savedReceipt = { id: receiptId, accountId, draftId: stored.id, tripId: applied.trip.id, requestHash,
        appliedEntryIds: applied.appliedEntryIds, skippedEntryIds: applied.skippedEntryIds, createdAt: now() };
      await put(source, "ai_apply_receipts", receiptId, savedReceipt);
      await put(source, "ai_drafts", stored.id, { ...stored, appliedEntries: { ...(stored.appliedEntries || {}), [applied.trip.id]: applied.mappings },
        ...(created ? { createdTripId: applied.trip.id, createdTripSpecHash: fingerprint(newSpec) } : {}), updatedAt: now() });
      // Applying a draft to a new trip must not move the source trip's chat.
      return { trip: applied.trip, member: visible.member, receipt: savedReceipt, invite, replayed: false };
    });
    const invite = result.invite || (result.member.id === result.trip.creator ? (await query(db, "trip_invites", { tripId: result.trip.id, active: true }, 1))[0]?.token : undefined);
    return { trip: await toView(result.trip, result.member, invite), appliedEntryIds: result.receipt.appliedEntryIds, skippedEntryIds: result.receipt.skippedEntryIds, replayed: result.replayed };
  }
  async function removeConversation(accountId, input = {}) {
    await access(accountId); identifier(input.conversationId, "会话标识");
    await purgeConversation(db, input.conversationId, { accountId, at: now() });
    return { deleted: input.conversationId };
  }
  return { capabilities, submit, getJob, getConversation, apply, removeConversation };
}
module.exports = { DAILY_LIMIT, RETENTION_MS, createAiService, applyDraftToTrip, reviewedDraft };
