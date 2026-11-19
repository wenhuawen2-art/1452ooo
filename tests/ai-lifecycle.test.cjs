const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { memoryDb } = require("./helpers/ai-memory-db.cjs");
const { createAiService } = require("../shared/ai-service.cjs");
const { purgeConversation, cleanupTripAi, cleanupExpiredAi } = require("../shared/ai-lifecycle.cjs");
const at = Date.parse("2026-11-04T09:00:00Z");
async function fixture(status = "queued") {
  const db = memoryDb();
  await db.seed("trips", "trip-a", { id: "trip-a" });
  await db.seed("trips", "trip-b", { id: "trip-b" });
  await db.seed("ai_conversations", "conversation-a", { id: "conversation-a", accountId: "account-a", tripId: "trip-a", expiresAt: at + 86400000 });
  await db.seed("ai_jobs", "job-a", { id: "job-a", accountId: "account-a", conversationId: "conversation-a", tripId: "trip-a", status, usageKey: "daily-a", activeKey: "active-a", requestHash: "request-hash", message: "private prompt", context: { secret: "private context" }, history: [], createdAt: at - 10000, deadlineAt: at + 100000, leaseUntil: at + 50000, expiresAt: at + 86400000 });
  await db.seed("ai_messages", "message-a", { id: "message-a", accountId: "account-a", conversationId: "conversation-a", text: "private reply", expiresAt: at + 86400000 });
  await db.seed("ai_drafts", "draft-a", { id: "draft-a", accountId: "account-a", conversationId: "conversation-a", sourceTripId: "trip-a", trip: { name: "private draft" }, expiresAt: at + 86400000 });
  await db.seed("ai_usage", "daily-a", { id: "daily-a", accountId: "account-a", reserved: status === "queued" ? 1 : 0, used: status === "running" ? 1 : 0, activeJobId: "job-a", expiresAt: at + 86400000 });
  await db.seed("ai_usage", "active-a", { id: "active-a", accountId: "account-a", activeJobId: "job-a", expiresAt: at + 86400000 });
  await db.seed("ai_apply_receipts", "receipt-a", { id: "receipt-a", accountId: "account-a", draftId: "draft-a", tripId: "trip-a" });
  await db.seed("ai_apply_receipts", "receipt-b", { id: "receipt-b", accountId: "account-a", draftId: "draft-a", tripId: "trip-b" });
  return db;
}
function afterFirstScan(db, name, action) {
  const collection = db.collection.bind(db); let called = false;
  db.collection = (key) => {
    const reference = collection(key);
    if (key !== name) return reference;
    return { ...reference, limit(value) {
      const query = reference.limit(value), get = query.get.bind(query);
      query.get = async () => {
        const result = await get();
        if (!called) { called = true; await action(); }
        return result;
      };
      return query;
    } };
  };
}
test("trip deletion scrubs all associated chat content, refunds queued reservation, keeps other target receipts", async () => {
  const db = await fixture(); await db.collection("trips").doc("trip-a").delete();
  await cleanupTripAi(db, "trip-a", { at });
  assert.deepEqual(db.inspect("ai_conversations"), {}); assert.deepEqual(db.inspect("ai_messages"), {}); assert.deepEqual(db.inspect("ai_drafts"), {});
  assert.equal(db.inspect("ai_jobs")["job-a"].status, "cancelled"); assert.doesNotMatch(JSON.stringify(db.inspect("ai_jobs")), /private/);
  assert.equal(db.inspect("ai_usage")["daily-a"].reserved, 0); assert.equal(db.inspect("ai_usage")["active-a"].activeJobId, "");
  assert.deepEqual(Object.keys(db.inspect("ai_apply_receipts")), ["receipt-b"]);
});
test("running cancellation retains used allowance and cannot release another task gate", async () => {
  const db = await fixture("running"); await db.seed("ai_usage", "active-a", { id: "active-a", accountId: "account-a", activeJobId: "newer-job" });
  await purgeConversation(db, "conversation-a", { accountId: "account-a", at });
  assert.equal(db.inspect("ai_usage")["daily-a"].used, 1); assert.equal(db.inspect("ai_usage")["active-a"].activeJobId, "newer-job");
  assert.equal(Object.keys(db.inspect("ai_apply_receipts")).length, 2);
});
test("conversation deletion enforces owner and leaves whole transaction unchanged on denial", async () => {
  const db = await fixture(); await assert.rejects(purgeConversation(db, "conversation-a", { accountId: "account-b", at }), { code: "AI_FORBIDDEN" });
  assert.ok(db.inspect("ai_messages")["message-a"]); assert.equal(db.inspect("ai_usage")["daily-a"].reserved, 1);
});
test("30-day cleanup purges expired conversations, orphaned trip receipts and unselected drafts", async () => {
  const db = await fixture(); await db.seed("ai_conversations", "conversation-a", { ...db.inspect("ai_conversations")["conversation-a"], expiresAt: at - 1 });
  await db.seed("ai_apply_receipts", "receipt-orphan", { id: "receipt-orphan", tripId: "deleted-trip" });
  await cleanupExpiredAi(db, { at });
  assert.equal(Object.keys(db.inspect("ai_conversations")).length, 0); assert.equal(Object.keys(db.inspect("ai_messages")).length, 0); assert.equal(Object.keys(db.inspect("ai_drafts")).length, 0);
  assert.equal(db.inspect("ai_apply_receipts")["receipt-orphan"], undefined); assert.ok(db.inspect("ai_apply_receipts")["receipt-a"]);
  assert.equal(db.inspect("ai_usage")["daily-a"].reserved, 0);
});
test("scheduled cleanup recovers expired queues and purges chat for a trip whose immediate cleanup failed", async () => {
  const db = await fixture(); await db.seed("ai_jobs", "job-a", { ...db.inspect("ai_jobs")["job-a"], deadlineAt: at - 1 });
  await cleanupExpiredAi(db, { at }); assert.equal(db.inspect("ai_jobs")["job-a"].status, "failed"); assert.equal(db.inspect("ai_usage")["daily-a"].reserved, 0);
  await db.collection("trips").doc("trip-a").delete(); await cleanupExpiredAi(db, { at: at + 1 });
  assert.deepEqual(db.inspect("ai_messages"), {}); assert.equal(db.inspect("ai_apply_receipts")["receipt-a"], undefined);
});
test("renewed conversations still purge individually expired messages and drafts, including more than one page", async () => {
  const db = await fixture("succeeded");
  for (let index = 0; index < 205; index++) await db.seed("ai_messages", `old-${index}`, { id: `old-${index}`, accountId: "account-a", conversationId: "conversation-a", text: "expired", expiresAt: at - 1 });
  await cleanupExpiredAi(db, { at }); assert.deepEqual(Object.keys(db.inspect("ai_messages")), ["message-a"]); assert.ok(db.inspect("ai_conversations")["conversation-a"]);
});

test("cleanup rechecks orphan candidates transactionally when a message is submitted between scans", async () => {
  const db = memoryDb(); let submitted;
  await db.seed("user_accounts", "account-a", { id: "account-a", profileComplete: true });
  const service = createAiService({ db, env: { AI_ENABLED: "true", AI_ALLOWLIST: "account-a" }, now: () => at, dispatch: async () => {} });
  afterFirstScan(db, "ai_conversations", async () => { submitted = await service.submit("account-a", { message: "规划杭州旅行", clientRequestId: "fresh-scan-request" }); });
  const counts = await cleanupExpiredAi(db, { at });
  assert.ok(db.inspect("ai_conversations")[submitted.conversationId]);
  assert.equal(db.inspect("ai_jobs")[submitted.jobId].status, "queued");
  assert.equal(Object.values(db.inspect("ai_usage")).find((row) => row.day).reserved, 1);
  assert.equal(counts.conversations, 0);
});

test("cleanup preserves a conversation renewed after its expiry snapshot", async () => {
  const db = await fixture();
  await db.seed("ai_conversations", "conversation-a", { ...db.inspect("ai_conversations")["conversation-a"], expiresAt: at - 1 });
  afterFirstScan(db, "ai_conversations", async () => { await db.seed("ai_conversations", "conversation-a", { ...db.inspect("ai_conversations")["conversation-a"], expiresAt: at + 86400000 }); });
  await cleanupExpiredAi(db, { at });
  assert.ok(db.inspect("ai_messages")["message-a"]);
  assert.equal(db.inspect("ai_jobs")["job-a"].status, "queued");
});

test("cleanup cannot erase an account concurrency gate renewed after the usage scan", async () => {
  const db = await fixture("succeeded");
  await db.seed("ai_usage", "active-a", { id: "active-a", accountId: "account-a", activeJobId: "", expiresAt: at - 1 });
  afterFirstScan(db, "ai_usage", async () => { await db.seed("ai_usage", "active-a", { id: "active-a", accountId: "account-a", activeJobId: "new-job", expiresAt: at + 86400000 }); });
  await cleanupExpiredAi(db, { at });
  assert.equal(db.inspect("ai_usage")["active-a"].activeJobId, "new-job");
});
test("backup excludes AI prompts, histories, drafts and user messages but preserves receipt metadata", async () => {
  const db = await fixture("succeeded"); let snapshot;
  const exports = {};
  const source = readFileSync("cloudfunctions/suixing-backup/index.js", "utf8");
  vm.runInNewContext(source, { require(name) {
    if (name === "@cloudbase/node-sdk") return { init: () => ({ database: () => db, uploadFile: async ({ fileContent }) => { snapshot = JSON.parse(fileContent.toString()); } }) };
    if (name === "./ai-lifecycle.cjs") return { cleanupExpiredAi: async () => ({ checked: true }) };
    throw Error(name);
  }, exports, Date, Intl, Buffer });
  const result = await exports.main(); assert.equal(result.ok, true);
  for (const name of ["ai_jobs", "ai_conversations", "ai_messages", "ai_drafts", "ai_usage"]) assert.equal(snapshot.collections[name], undefined);
  assert.equal(snapshot.collections.ai_apply_receipts.length, 2); assert.doesNotMatch(JSON.stringify(snapshot), /private prompt|private context|private reply|private draft/);
});
