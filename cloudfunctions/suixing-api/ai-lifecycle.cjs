"use strict";

const RETENTION_MS = 30 * 86400000;
const terminal = (status) => ["succeeded", "failed", "cancelled"].includes(status);
const clean = (value) => { if (!value) return null; const { _id, ...record } = value; return record; };
const first = async (reference) => { const result = await reference.get(); return clean(Array.isArray(result.data) ? result.data[0] : result.data); };
async function all(db, name) {
  const rows = [];
  try {
    for (let offset = 0; ; offset += 100) {
      const page = (await db.collection(name).limit(100).skip(offset).get()).data || [];
      rows.push(...page.map((row) => ({ ...clean(row), id: row.id || row._id })));
      if (page.length < 100) break;
    }
  } catch (error) {
    if (!/COLLECTION_NOT_EXIST|collection.*not.?exist|集合不存在/i.test(`${error?.code || ""} ${error?.message || ""}`)) throw error;
  }
  return rows;
}
async function stopJob(source, job, at, cancelled = false) {
  if (!job || terminal(job.status)) return job;
  const usage = job.usageKey ? await first(source.collection("ai_usage").doc(job.usageKey)) : null;
  const gate = job.activeKey ? await first(source.collection("ai_usage").doc(job.activeKey)) : null;
  if (usage?.activeJobId === job.id) {
    await source.collection("ai_usage").doc(job.usageKey).set({ ...usage,
      reserved: Math.max(0, Number(usage.reserved || 0) - (job.status === "queued" ? 1 : 0)), activeJobId: "", updatedAt: at });
  }
  if (gate?.activeJobId === job.id) await source.collection("ai_usage").doc(job.activeKey).set({ ...gate, activeJobId: "", updatedAt: at });
  const { message, context, history, ...metadata } = job;
  const updated = { ...metadata, status: cancelled ? "cancelled" : "failed", updatedAt: at, leaseUntil: 0,
    error: { code: cancelled ? "AI_CANCELLED" : "AI_TIMEOUT", message: cancelled ? "会话已删除" : "生成已超时，请重新发起" } };
  await source.collection("ai_jobs").doc(job.id).set(updated);
  return updated;
}
async function purgeConversation(db, conversationId, { accountId, at = Date.now(), onlyIfInvalid = false } = {}) {
  return db.runTransaction(async (source) => {
    const conversation = await first(source.collection("ai_conversations").doc(conversationId));
    if (accountId && conversation && conversation.accountId !== accountId) throw Object.assign(new Error("无权删除此会话"), { status: 403, code: "AI_FORBIDDEN" });
    const filter = accountId ? { conversationId, accountId } : { conversationId };
    const jobs = (await source.collection("ai_jobs").where(filter).limit(25).get()).data.map(clean);
    if (onlyIfInvalid && conversation && Number(conversation.expiresAt) > at) {
      // A scan is only a candidate list: a conversation may have been created or
      // renewed between collection reads. Recheck every deletion reason under
      // the same transaction that removes its content.
      const drafts = (await source.collection("ai_drafts").where(filter).limit(25).get()).data.map(clean);
      const tripIds = new Set([conversation.tripId, ...jobs.filter((row) => row.status !== "cancelled").map((row) => row.tripId), ...drafts.map((row) => row.sourceTripId)].filter(Boolean));
      let missingTrip = false;
      for (const tripId of tripIds) if (!await first(source.collection("trips").doc(tripId))) { missingTrip = true; break; }
      if (!missingTrip) return { deleted: "", jobs: 0 };
    }
    for (const job of jobs) {
      await stopJob(source, job, at, true);
      // Keep only a content-free idempotency tombstone, never prompts or results.
      await source.collection("ai_jobs").doc(job.id).set({ id: job.id, accountId: job.accountId, conversationId,
        requestHash: job.requestHash || "", status: "cancelled", error: { code: "AI_CANCELLED", message: "会话已删除" },
        createdAt: job.createdAt, updatedAt: at, expiresAt: Math.max(Number(job.expiresAt || 0), at + RETENTION_MS) });
    }
    await source.collection("ai_messages").where(filter).remove();
    await source.collection("ai_drafts").where(filter).remove();
    if (conversation) await source.collection("ai_conversations").doc(conversationId).delete();
    return { deleted: conversationId, jobs: jobs.length };
  });
}
async function cleanupTripAi(db, tripId, { at = Date.now() } = {}) {
  const conversations = await all(db, "ai_conversations"), jobs = await all(db, "ai_jobs"), drafts = await all(db, "ai_drafts");
  const ids = new Set([
    ...conversations.filter((row) => row.tripId === tripId).map((row) => row.id),
    ...jobs.filter((row) => row.tripId === tripId).map((row) => row.conversationId),
    ...drafts.filter((row) => row.sourceTripId === tripId).map((row) => row.conversationId),
  ].filter(Boolean));
  for (const conversationId of ids) await purgeConversation(db, conversationId, { at });
  const receipts = (await all(db, "ai_apply_receipts")).filter((row) => row.tripId === tripId);
  for (const receipt of receipts) await db.collection("ai_apply_receipts").doc(receipt.id).delete();
  return { conversations: ids.size, receipts: receipts.length };
}
async function cleanupExpiredAi(db, { at = Date.now() } = {}) {
  const conversations = await all(db, "ai_conversations"), jobs = await all(db, "ai_jobs"), drafts = await all(db, "ai_drafts");
  const knownConversations = new Set(conversations.map((row) => row.id)), tripExists = new Map();
  const hasTrip = async (tripId) => {
    if (!tripExists.has(tripId)) tripExists.set(tripId, !!await first(db.collection("trips").doc(tripId)));
    return tripExists.get(tripId);
  };
  const purgeIds = new Set(conversations.filter((row) => Number(row.expiresAt) <= at).map((row) => row.id));
  for (const row of conversations) if (row.tripId && !await hasTrip(row.tripId)) purgeIds.add(row.id);
  for (const row of jobs) {
    if (!terminal(row.status) && ((row.status === "queued" && row.deadlineAt <= at) || (row.status === "running" && row.leaseUntil <= at))) {
      await db.runTransaction(async (source) => {
        const current = await first(source.collection("ai_jobs").doc(row.id));
        if (current && !terminal(current.status) && ((current.status === "queued" && current.deadlineAt <= at) || (current.status === "running" && current.leaseUntil <= at))) await stopJob(source, current, at);
      });
    }
    if (row.status !== "cancelled" && row.conversationId && (!knownConversations.has(row.conversationId) || (row.tripId && !await hasTrip(row.tripId)))) purgeIds.add(row.conversationId);
  }
  for (const row of drafts) if (row.conversationId && (!knownConversations.has(row.conversationId) || (row.sourceTripId && !await hasTrip(row.sourceTripId)))) purgeIds.add(row.conversationId);
  let purged = 0;
  for (const conversationId of purgeIds) if ((await purgeConversation(db, conversationId, { at, onlyIfInvalid: true })).deleted) purged++;
  const counts = { conversations: purged, messages: 0, drafts: 0, jobs: 0, usage: 0, receipts: 0 };
  for (const [name, key] of [["ai_messages", "messages"], ["ai_drafts", "drafts"], ["ai_jobs", "jobs"], ["ai_usage", "usage"]]) {
    for (const row of await all(db, name)) {
      if (Number(row.expiresAt) <= at) {
        const deleted = await db.runTransaction(async (source) => {
          const current = await first(source.collection(name).doc(row.id));
          if (!current || !(Number(current.expiresAt) <= at)) return false;
          // A renewed account gate must never be erased from a stale scan: that
          // would allow a second request while its worker is still running.
          if (name === "ai_usage" && current.activeJobId) return false;
          if (name === "ai_jobs" && !terminal(current.status)) return false;
          await source.collection(name).doc(row.id).delete(); return true;
        });
        if (deleted) counts[key]++;
      }
    }
  }
  for (const receipt of await all(db, "ai_apply_receipts")) {
    if (receipt.tripId && !await hasTrip(receipt.tripId)) { await db.collection("ai_apply_receipts").doc(receipt.id).delete(); counts.receipts++; }
  }
  return counts;
}
module.exports = { RETENTION_MS, purgeConversation, cleanupTripAi, cleanupExpiredAi };
