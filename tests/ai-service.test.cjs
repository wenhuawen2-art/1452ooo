const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { memoryDb } = require("./helpers/ai-memory-db.cjs");
const { createAiService } = require("../shared/ai-service.cjs");
const { normalizeDraft } = require("../shared/ai-contract.cjs");
const { createTrip, addMember } = require("../shared/domain.cjs");
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function fixture(options = {}) {
  let timestamp = Date.parse("2026-11-04T09:00:00Z");
  const db = memoryDb(), calls = [];
  const user = { id: "account-a", nickname: "甲", avatarId: "avatar-01", avatarData: "", profileComplete: true };
  await db.seed("user_accounts", user.id, user);
  await db.seed("user_accounts", "account-b", { ...user, id: "account-b", nickname: "乙", avatarId: "avatar-02" });
  const { trip, member } = createTrip({ ...user, accountId: user.id, name: "杭州", type: "旅游", start: "2026-11-05T08:00", end: "2026-11-07T18:00" });
  const guest = addMember(trip, "乙", "avatar-02", "", "account-b");
  await db.seed("trips", trip.id, trip);
  for (const [accountId, actor] of [["account-a", member], ["account-b", guest]]) await db.seed("trip_members", hash(`${accountId}:${trip.id}`), { accountId, tripId: trip.id, memberId: actor.id });
  const env = { AI_ENABLED: "true", AI_ALLOWLIST: "account-a,account-b", ...options.env };
  const service = createAiService({ db, env, now: () => timestamp, dispatch: options.dispatch || (async (jobId) => calls.push(jobId)) });
  const body = normalizeDraft({ trip: { name: "杭州计划", type: "旅游", start: "2026-11-05T08:00", end: "2026-11-07T18:00" },
    events: [{ title: "西湖散步", date: "2026-11-05", startTime: "09:00", endTime: "10:00", address: "西湖", transportMode: "walking" }],
    items: [{ title: "充电宝", category: "电子设备", scope: "我的", key: true }] });
  const stored = { ...body, id: "draft-001", accountId: "account-a", conversationId: "conversation-001", sourceTripId: trip.id, baseRevision: trip.revision, appliedEntries: {}, createdAt: timestamp, expiresAt: timestamp + 86400000 };
  await db.seed("ai_drafts", stored.id, stored);
  const applyInput = { draftId: stored.id, target: "current", tripId: trip.id, baseRevision: trip.revision, scope: "我的", selectedEntryIds: ["event-1", "item-1"], clientMutationId: "apply-001" };
  return { db, env, service, user, trip, member, guest, calls, stored, applyInput, now: () => timestamp, advance: (ms) => { timestamp += ms; } };
}
test("AI is fail-closed and account activation plus server allowlist gate cost", async () => {
  const f = await fixture({ env: { AI_ENABLED: "false" } }); assert.equal((await f.service.capabilities("account-a")).canUse, false);
  await assert.rejects(f.service.submit("account-a", { message: "杭州", clientRequestId: "request-001" }), { code: "AI_DISABLED" });
  f.env.AI_ENABLED = "true"; f.env.AI_ALLOWLIST = "account-b";
  await assert.rejects(f.service.submit("account-a", { message: "杭州", clientRequestId: "request-001" }), { code: "AI_NOT_ALLOWED" });
  f.env.AI_ALLOWLIST = "account-a"; await f.db.seed("user_accounts", "account-a", { ...f.user, profileComplete: false });
  await assert.rejects(f.service.submit("account-a", { message: "杭州", clientRequestId: "request-001" }), { code: "AI_LOGIN_REQUIRED" }); assert.equal(f.calls.length, 0);
});

test('trip-based cloud recovery is isolated by account, membership and trip',async()=>{
  const f=await fixture();
  const second=createTrip({accountId:'account-a',nickname:'甲',avatarId:'avatar-01',name:'成都',type:'旅游',start:'2026-11-10T08:00',end:'2026-11-12T18:00'});
  await f.db.seed('trips',second.trip.id,second.trip);
  await f.db.seed('trip_members',hash('account-a:'+second.trip.id),{accountId:'account-a',tripId:second.trip.id,memberId:second.member.id});
  for(const [id,accountId,tripId,time] of [['older','account-a',f.trip.id,1],['latest','account-a',f.trip.id,3],['other-user','account-b',f.trip.id,9],['other-trip','account-a',second.trip.id,10]]) {
    await f.db.seed('ai_conversations',id,{id,accountId,tripId,updatedAt:time,expiresAt:f.now()+10000});
    await f.db.seed('ai_messages',id,{id,conversationId:id,accountId,role:'user',text:id,createdAt:time,expiresAt:f.now()+10000});
  }
  const history=await f.service.getConversation('account-a',{tripId:f.trip.id});
  assert.equal(history.conversationId,'latest');assert.equal(history.messages[0].text,'latest');
  assert.equal((await f.service.getConversation('account-a',{tripId:second.trip.id})).conversationId,'other-trip');
  await assert.rejects(f.service.getConversation('account-a',{tripId:f.trip.id,conversationId:'other-trip'}),{code:'AI_CONVERSATION_TRIP'});
  await assert.rejects(f.service.getConversation('account-b',{tripId:second.trip.id}),{code:'AI_FORBIDDEN'});
  assert.equal((await f.service.getConversation('account-a',{tripId:''})).messages.length,0);
});

test('new trip lookup stays empty while another trip has an active generation',async()=>{
  const f=await fixture();const job=await f.service.submit('account-a',{tripId:f.trip.id,message:'杭州',clientRequestId:'active-trip-a'});
  const empty=await f.service.getConversation('account-a',{tripId:''});
  assert.equal(empty.messages.length,0);assert.equal(empty.activeJobId,'');
  assert.equal((await f.service.getConversation('account-a',{tripId:f.trip.id})).activeJobId,job.jobId);
  f.advance(121000);await f.service.getJob('account-a',{jobId:job.jobId});
  await assert.rejects(f.service.submit('account-a',{tripId:'',conversationId:job.conversationId,message:'新规划',clientRequestId:'wrong-scope-001'}),{code:'AI_CONVERSATION_TRIP'});
});
test("AI submit reserves once, retry reuses job, and changed duplicate payload is rejected", async () => {
  const f = await fixture(); const payload = { message: "杭州两天", tripId: f.trip.id, clientRequestId: "request-001" };
  const a = await f.service.submit("account-a", payload), b = await f.service.submit("account-a", payload);
  assert.equal(a.jobId, b.jobId); assert.equal(a.remainingToday, 19); assert.equal(f.calls.length, 1);
  assert.equal(Object.values(f.db.inspect("ai_messages")).length, 1);
  await assert.rejects(f.service.submit("account-a", { ...payload, message: "上海" }), { code: "AI_REQUEST_CONFLICT" });
});
test("AI concurrent requests serialize user gate and do not overspend daily quota", async () => {
  const f = await fixture(); const results = await Promise.allSettled(["request-001", "request-002"].map((clientRequestId) => f.service.submit("account-a", { message: "杭州", clientRequestId })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1); assert.equal(results.find((r) => r.status === "rejected").reason.code, "AI_BUSY");
  assert.equal(f.calls.length, 1);
  const daily = Object.values(f.db.inspect("ai_usage")).find((row) => row.day);
  await f.db.seed("ai_usage", daily.id, { ...daily, used: 20, reserved: 0, activeJobId: "" });
  const active = Object.values(f.db.inspect("ai_usage")).find((row) => !row.day);
  await f.db.seed("ai_usage", active.id, { ...active, activeJobId: "" });
  await assert.rejects(f.service.submit("account-a", { message: "杭州", clientRequestId: "request-003" }), { code: "AI_LIMIT_REACHED" });
});
test("queued timeout releases reservation while uncertain dispatch preserves it", async () => {
  const f = await fixture({ dispatch: async () => { throw Object.assign(new Error("socket"), { code: "AI_DISPATCH_UNCERTAIN" }); } });
  const job = await f.service.submit("account-a", { message: "杭州", clientRequestId: "request-001" });
  assert.equal(job.status, "queued"); assert.equal(job.remainingToday, 19); f.advance(121000);
  const expired = await f.service.getJob("account-a", job); assert.equal(expired.status, "failed"); assert.equal(expired.remainingToday, 20);
  const disabled = await fixture({ dispatch: async () => { throw Object.assign(new Error("config"), { code: "AI_DISPATCH_CONFIG" }); } });
  const rejected = await disabled.service.submit("account-a", { message: "杭州", clientRequestId: "request-001" });
  assert.equal(rejected.status, "failed"); assert.equal(rejected.remainingToday, 20);
});
test("a running request remains exclusive across Beijing midnight", async () => {
  const f = await fixture(); f.advance(Date.parse("2026-11-04T15:59:59Z") - f.now());
  const result = await f.service.submit("account-a", { message: "杭州", clientRequestId: "request-001" });
  const job = f.db.inspect("ai_jobs")[result.jobId]; await f.db.seed("ai_jobs", job.id, { ...job, status: "running", leaseUntil: f.now() + 60000 });
  f.advance(2000); await assert.rejects(f.service.submit("account-a", { message: "上海", clientRequestId: "request-002" }), { code: "AI_BUSY" });
});
test("AI applies selected content atomically with one revision and private owner derived from actor", async () => {
  const f = await fixture(); const result = await f.service.apply("account-a", f.applyInput);
  assert.equal(result.trip.revision, f.trip.revision + 1); assert.equal(result.trip.events.length, 1); assert.equal(result.trip.items.length, 1);
  assert.equal(result.trip.items[0].owner, f.member.id); assert.deepEqual(result.appliedEntryIds, ["event-1", "item-1"]);
  assert.equal(Object.keys(f.db.inspect("ai_apply_receipts")).length, 1);
});
test("AI apply retry survives draft/chat deletion and does not require old revision", async () => {
  const f = await fixture(); const first = await f.service.apply("account-a", f.applyInput);
  await f.db.collection("ai_drafts").doc(f.stored.id).delete();
  const retry = await f.service.apply("account-a", { ...f.applyInput, baseRevision: -1 });
  assert.equal(retry.replayed, true); assert.equal(retry.trip.id, first.trip.id); assert.equal(retry.trip.events.length, 1);
  await assert.rejects(f.service.apply("account-a", { ...f.applyInput, selectedEntryIds: ["item-1"] }), { code: "AI_REQUEST_CONFLICT" });
});
test("AI concurrent duplicate apply returns one receipt and one copy", async () => {
  const f = await fixture(); const results = await Promise.all([f.service.apply("account-a", f.applyInput), f.service.apply("account-a", f.applyInput)]);
  assert.equal(results.filter((row) => row.replayed).length, 1); assert.equal(f.db.inspect("trips")[f.trip.id].events.length, 1);
});
test("AI reviewed edits reach domain checks, protected fields reject, invalid batch rolls back", async () => {
  const f = await fixture(); await assert.rejects(f.service.apply("account-a", { ...f.applyInput, editedEntries: [{ id: "item-1", owner: f.guest.id }] }), { code: "AI_INVALID_REQUEST" });
  await assert.rejects(f.service.apply("account-a", { ...f.applyInput, editedEntries: [{ id: "item-1", linkedDate: "2026-11-09" }] }));
  assert.equal(f.db.inspect("trips")[f.trip.id].events.length, 0); assert.equal(Object.keys(f.db.inspect("ai_apply_receipts")).length, 0);
  const edited = await f.service.apply("account-a", { ...f.applyInput, editedEntries: [{ id: "event-1", title: "修改后的西湖行程", startTime: "10:00", endTime: "11:00" }, { id: "item-1", title: "移动电源" }] });
  assert.equal(edited.trip.events[0].title, "修改后的西湖行程"); assert.equal(edited.trip.items[0].title, "移动电源");
});
test("AI rejects stale revision, archived trips, foreign drafts and revoked membership", async () => {
  const f = await fixture(); await assert.rejects(f.service.apply("account-a", { ...f.applyInput, baseRevision: -1 }), { code: "AI_CONFLICT" });
  await assert.rejects(f.service.apply("account-b", f.applyInput), { code: "AI_DRAFT_NOT_FOUND" });
  await f.db.seed("trips", f.trip.id, { ...f.trip, archived: true }); await assert.rejects(f.service.apply("account-a", f.applyInput), { code: "AI_ARCHIVED" });
  await f.db.collection("trip_members").doc(hash(`account-a:${f.trip.id}`)).delete(); await assert.rejects(f.service.apply("account-a", f.applyInput), { code: "AI_FORBIDDEN" });
});
test("AI atomically creates one new trip with owner link/invite and reuses it for later selected entries", async () => {
  const f = await fixture(); const input = { ...f.applyInput, target: "new", tripId: undefined, baseRevision: undefined, selectedEntryIds: ["event-1"] };
  const first = await f.service.apply("account-a", input); assert.notEqual(first.trip.id, f.trip.id); assert.equal(first.trip.items.length, 0);
  assert.equal(Object.values(f.db.inspect("trip_members")).filter((row) => row.tripId === first.trip.id).length, 1);
  assert.equal(Object.values(f.db.inspect("trip_invites")).filter((row) => row.tripId === first.trip.id).length, 1);
  const second = await f.service.apply("account-a", { ...input, clientMutationId: "apply-002", selectedEntryIds: ["item-1"] });
  assert.equal(second.trip.id, first.trip.id); assert.equal(second.trip.items.length, 1); assert.equal(Object.keys(f.db.inspect("trips")).length, 2);
});
test("AI semantic duplicates skip insertion without incrementing revision", async () => {
  const f = await fixture(); const first = await f.service.apply("account-a", f.applyInput);
  await f.db.seed("ai_drafts", "draft-002", { ...f.stored, id: "draft-002" });
  const repeated = await f.service.apply("account-a", { ...f.applyInput, draftId: "draft-002", clientMutationId: "apply-002", baseRevision: first.trip.revision });
  assert.deepEqual(repeated.appliedEntryIds, []); assert.deepEqual(repeated.skippedEntryIds, ["event-1", "item-1"]); assert.equal(repeated.trip.revision, first.trip.revision);
});
test("deleting conversation cancels queued job, scrubs prompt/history and preserves apply receipts", async () => {
  const f = await fixture(); await f.service.apply("account-a", f.applyInput);
  const job = await f.service.submit("account-a", { message: "个人私密需求", clientRequestId: "request-001" });
  const result = await f.service.removeConversation("account-a", { conversationId: job.conversationId });
  assert.equal(result.deleted, job.conversationId); assert.equal(Object.keys(f.db.inspect("ai_conversations")).length, 0);
  assert.equal(Object.keys(f.db.inspect("ai_messages")).length, 0); assert.equal(Object.keys(f.db.inspect("ai_apply_receipts")).length, 1);
  const tombstone = f.db.inspect("ai_jobs")[job.jobId]; assert.equal(tombstone.status, "cancelled"); assert.equal(tombstone.message, undefined);
  assert.equal((await f.service.capabilities("account-a")).remainingToday, 20);
});

test("real service and worker contracts complete submit, poll, history, apply and retry without live AI", async () => {
  const { createAiWorker } = require("../cloudfunctions/suixing-ai-worker/worker.cjs");
  const { signJobEvent } = require("../cloudfunctions/suixing-api/ai-dispatch.cjs");
  const contract = require("../shared/ai-contract.cjs");
  const f = await fixture(); f.env.AI_WORKER_SECRET = "integration-test-secret-of-32-characters";
  const submitted = await f.service.submit("account-a", { message: "杭州两天行程和个人清单", tripId: f.trip.id, clientRequestId: "integration-001" });
  let calls = 0;
  const worker = createAiWorker({ db: f.db, env: f.env, now: f.now, contract, generate: async (messages) => {
    calls += 1; assert.equal(messages.at(-1).content, "杭州两天行程和个人清单");
    return { text: JSON.stringify({ text: "请检查时间和清单后应用。", draft: f.stored }), usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 } };
  } });
  const event = signJobEvent(submitted.jobId, f.now(), f.env.AI_WORKER_SECRET);
  await worker(event); await worker(event); assert.equal(calls, 1);
  const storedJob = f.db.inspect("ai_jobs")[submitted.jobId];
  assert.equal(storedJob.message, undefined); assert.equal(storedJob.history, undefined); assert.equal(storedJob.context, undefined);
  const completed = await f.service.getJob("account-a", { jobId: submitted.jobId });
  assert.equal(completed.status, "succeeded"); assert.equal(completed.remainingToday, 19); assert.equal(completed.draft.events[0].id, "event-1");
  const conversation = await f.service.getConversation("account-a", { conversationId: submitted.conversationId });
  assert.equal(conversation.messages.length, 2); assert.equal(conversation.messages[1].modelContent, undefined); assert.equal(conversation.messages[1].draft.id, submitted.jobId);
  const applied = await f.service.apply("account-a", { ...f.applyInput, draftId: completed.draft.id });
  assert.equal(applied.trip.events.length, 1); assert.equal((await f.service.capabilities("account-a")).remainingToday, 19);
});

test("a queued job with ambiguous dispatch can be safely resubmitted using the same request id", async () => {
  let dispatches = 0;
  const f = await fixture({ dispatch: async () => { if (++dispatches === 1) throw Object.assign(new Error("ambiguous"), { code: "AI_DISPATCH_UNCERTAIN" }); } });
  const payload = { message: "杭州", clientRequestId: "retry-dispatch-001" };
  const first = await f.service.submit("account-a", payload), second = await f.service.submit("account-a", payload), third = await f.service.submit("account-a", payload);
  assert.equal(first.jobId, second.jobId); assert.equal(second.jobId, third.jobId); assert.equal(dispatches, 2); assert.equal(third.remainingToday, 19);
});

test("applying into a new trip preserves the source chat and leaves the new trip blank", async () => {
  const f = await fixture();
  await f.db.seed("ai_conversations", f.stored.conversationId, { id: f.stored.conversationId, accountId: "account-a", tripId: f.trip.id, turnCount: 1, expiresAt: f.now() + 86400000 });
  const applied = await f.service.apply("account-a", { ...f.applyInput, target: "new", tripId: undefined, baseRevision: undefined });
  await assert.rejects(f.service.submit("account-a", { message: "再加一个轻松的下午", conversationId: f.stored.conversationId, tripId: applied.trip.id, clientRequestId: "followup-001" }), {code:'AI_CONVERSATION_TRIP'});
  assert.equal((await f.service.getConversation('account-a',{tripId:applied.trip.id})).messages.length,0);
  assert.equal(f.db.inspect('ai_conversations')[f.stored.conversationId].tripId,f.trip.id);
  const next = await f.service.submit("account-a", { message: "再加一个轻松的下午", conversationId: f.stored.conversationId, tripId: f.trip.id, clientRequestId: "followup-002" });
  assert.equal(next.conversationId, f.stored.conversationId);
  assert.equal(f.db.inspect("ai_jobs")[next.jobId].tripId, f.trip.id);
});

test("restored failed conversation carries safe error status without model request data", async () => {
  const f = await fixture({ dispatch: async () => { throw Object.assign(new Error("private credential detail"), { code: "AI_DISPATCH_CONFIG" }); } });
  const submitted = await f.service.submit("account-a", { message: "杭州", clientRequestId: "request-001" });
  const history = await f.service.getConversation("account-a", { conversationId: submitted.conversationId });
  assert.equal(history.messages[0].status, "failed"); assert.equal(history.messages[0].error.code, "AI_DISPATCH_CONFIG");
  assert.doesNotMatch(JSON.stringify(history), /private credential detail|requestHash|usageKey/);
});

test("expired job content cannot be read before scheduled retention cleanup runs", async () => {
  const f = await fixture(); const submitted = await f.service.submit("account-a", { message: "杭州", clientRequestId: "request-001" });
  const job = f.db.inspect("ai_jobs")[submitted.jobId];
  await f.db.seed("ai_jobs", job.id, { ...job, status: "succeeded", result: { text: "expired private content" }, expiresAt: f.now() - 1 });
  await assert.rejects(f.service.getJob("account-a", { jobId: job.id }), { code: "AI_JOB_EXPIRED" });
});

test("a rejected ambiguous redispatch cannot cancel a worker that has already started", async () => {
  let f, dispatches = 0;
  f = await fixture({ dispatch: async (jobId) => {
    if (++dispatches === 1) throw Object.assign(new Error("ambiguous"), { code: "AI_DISPATCH_UNCERTAIN" });
    const job = f.db.inspect("ai_jobs")[jobId]; await f.db.seed("ai_jobs", jobId, { ...job, status: "running", leaseUntil: f.now() + 60000 });
    throw Object.assign(new Error("second request rejected"), { code: "AI_DISPATCH_REJECTED" });
  } });
  const payload = { message: "杭州", clientRequestId: "ambiguous-001" }; const first = await f.service.submit("account-a", payload), next = await f.service.submit("account-a", payload);
  assert.equal(next.jobId, first.jobId); assert.equal(next.status, "running"); assert.equal(f.db.inspect("ai_jobs")[first.jobId].status, "running");
});

test("a selected day can create a shorter trip without unselected days blocking it", async () => {
  const f = await fixture(); const draft = { ...f.stored, events: [...f.stored.events, { ...f.stored.events[0], id: "event-2", date: "2026-11-07" }] };
  await f.db.seed("ai_drafts", draft.id, draft);
  const result = await f.service.apply("account-a", { ...f.applyInput, target: "new", tripId: undefined, selectedEntryIds: ["event-1"], newTrip: { name: "一日杭州", type: "旅游", start: "2026-11-05T08:00", end: "2026-11-05T18:00" } });
  assert.equal(result.trip.events.length, 1); assert.equal(result.trip.end, "2026-11-05T18:00");
});

test("expired messages in renewed conversation are neither displayed nor sent back to model", async () => {
  const f = await fixture(); await f.db.seed("ai_conversations", "conversation-001", { id: "conversation-001", accountId: "account-a", tripId: f.trip.id, turnCount: 1, expiresAt: f.now() + 86400000 });
  await f.db.seed("ai_messages", "expired-message", { id: "expired-message", accountId: "account-a", conversationId: "conversation-001", role: "user", text: "expired-private", modelContent: "expired-private", expiresAt: f.now() - 1, createdAt: f.now() - 86400000 });
  assert.deepEqual((await f.service.getConversation("account-a", { conversationId: "conversation-001" })).messages, []);
  const result = await f.service.submit("account-a", { message: "继续", conversationId: "conversation-001", tripId: f.trip.id, clientRequestId: "renewed-001" });
  assert.deepEqual(f.db.inspect("ai_jobs")[result.jobId].history, []);
});

test("multi-turn job retains initial preferences and newest requests rather than only the last four rounds", async () => {
  const f = await fixture();
  await f.db.seed("ai_conversations", "conversation-001", { id: "conversation-001", accountId: "account-a", tripId: f.trip.id,
    turnCount: 12, expiresAt: f.now() + 86400000 });
  for (let i = 0; i < 24; i++) await f.db.seed("ai_messages", `history-${i}`, {
    id: `history-${i}`, accountId: "account-a", conversationId: "conversation-001", role: i % 2 ? "assistant" : "user",
    text: i === 0 ? "带老人去杭州，步行少一点" : `第${i}条消息`, createdAt: f.now() - 24000 + i * 1000, expiresAt: f.now() + 86400000 });
  const result = await f.service.submit("account-a", { message: "补充雨天计划", conversationId: "conversation-001", tripId: f.trip.id, clientRequestId: "history-025" });
  const history = f.db.inspect("ai_jobs")[result.jobId].history;
  assert.equal(history.length, 20); assert.equal(history[0].content, "带老人去杭州，步行少一点");
  assert.equal(history.at(-1).content, "第23条消息");
});
