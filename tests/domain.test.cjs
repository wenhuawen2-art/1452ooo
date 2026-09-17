const test = require("node:test");
const assert = require("node:assert/strict");
const { createTrip, addMember, viewTrip, mutateTrip } = require("../shared/domain.cjs");
const { checklistTemplates } = require("../shared/templates.cjs");
const { periodForStart, splitEventByPeriods } = require("../shared/schedule.cjs");
const { avatars, normalizeMembers } = require("../shared/avatars.cjs");

test("CloudBase shared domain keeps public and personal checklist data isolated", () => {
  const { trip, member: owner } = createTrip({
    name: "川西小环线", nickname: "文华", avatarId: "avatar-01",
    start: "2026-10-01T08:00", end: "2026-10-05T18:00",
  });
  const guest = addMember(trip, "同行人", "avatar-02");
  const ownerView = viewTrip(trip, owner, "invite-token");
  const guestView = viewTrip(trip, guest);
  assert.equal(ownerView.invite, "invite-token");
  assert.equal(guestView.invite, undefined);
  assert.ok(ownerView.items.every((item) => !item.owner || item.owner === owner.id));
  assert.ok(guestView.items.every((item) => !item.owner || item.owner === guest.id));
});

test("CloudBase shared domain validates full schedule period and revision", () => {
  const { trip, member } = createTrip({
    name: "测试旅行", nickname: "创建者", avatarId: "avatar-01",
    start: "2026-10-01T08:00", end: "2026-10-03T18:00",
  });
  mutateTrip(trip, member, {
    action: "event", revision: 0, date: "2026-10-01",
    startTime: "09:00", endTime: "11:30", title: "出发去景区",
    startPlace: "成都", endPlace: "鱼子西",
  });
  assert.equal(trip.events[0].period, "上午");
  assert.equal(trip.events[0].endTime, "11:30");
  assert.equal(trip.events[0].startPlace, "成都");
  assert.equal(trip.events[0].endPlace, "鱼子西");
  assert.throws(() => mutateTrip(trip, member, { action: "archive", revision: 0 }), /同行人刚刚更新/);
});

test("schedule periods derive from start time and split spanning events", () => {
  assert.equal(periodForStart("08:00"), "上午");
  assert.equal(periodForStart("13:00"), "下午");
  assert.equal(periodForStart("18:00"), "晚上");
  const segments = splitEventByPeriods({
    id: "drive", title: "长途驾驶", startTime: "08:00", endTime: "18:00",
  });
  assert.deepEqual(segments.map((entry) => [entry.periodName, entry.segmentStart, entry.segmentEnd]), [
    ["上午", "08:00", "13:00"],
    ["下午", "13:00", "18:00"],
  ]);
  assert.equal(segments[0].continuesToNext, true);
  assert.equal(segments[1].continuedFromPrevious, true);
});

test("CloudBase shared domain resets review after a checklist toggle", () => {
  const { trip, member } = createTrip({
    name: "测试旅行", nickname: "创建者", avatarId: "avatar-01",
    start: "2026-10-01T08:00", end: "2026-10-03T18:00",
  });
  const item = trip.items.find((entry) => entry.key && entry.owner === member.id);
  mutateTrip(trip, member, { action: "toggle", revision: trip.revision, id: item.id });
  mutateTrip(trip, member, { action: "review", revision: trip.revision, id: item.id });
  assert.equal(item.reviewed, true);
  mutateTrip(trip, member, { action: "toggle", revision: trip.revision, id: item.id });
  assert.equal(item.reviewed, false);
});

test("CloudBase shared domain imports editable templates into the selected checklist once", () => {
  assert.equal(checklistTemplates.length, 13);
  assert.deepEqual(
    ["road-trip-comfort", "electronics-navigation", "clothing-toiletries", "lodging-checkin", "camping-outdoor", "family-travel", "pet-travel", "long-drive-safety"].every((id) => checklistTemplates.some((template) => template.id === id)),
    true,
  );
  const { trip, member: owner } = createTrip({
    name: "模板测试", nickname: "创建者", avatarId: "avatar-01",
    start: "2026-10-01T08:00", end: "2026-10-03T18:00",
  });
  mutateTrip(trip, owner, {
    action: "importTemplate", revision: trip.revision,
    templateId: "travel-documents", scope: "我的",
  });
  const category = trip.categories.find((entry) => entry.templateId === "travel-documents");
  assert.equal(category.owner, owner.id);
  const imported = trip.items.filter((entry) => entry.categoryId === category.id);
  assert.equal(imported.length, 6);
  assert.ok(imported.every((entry) => !entry.done && !entry.reviewed));

  mutateTrip(trip, owner, {
    action: "item", revision: trip.revision, id: imported[0].id,
    categoryId: category.id, scope: "我的", title: "身份证与护照", key: true,
  });
  assert.equal(imported[0].title, "身份证与护照");
  assert.throws(() => mutateTrip(trip, owner, {
    action: "importTemplate", revision: trip.revision,
    templateId: "travel-documents", scope: "我的",
  }), /已经导入/);

  mutateTrip(trip, owner, {
    action: "importTemplate", revision: trip.revision,
    templateId: "vehicle-check", scope: "公共",
  });
  const guest = addMember(trip, "同行人", "avatar-02");
  const guestView = viewTrip(trip, guest);
  assert.ok(guestView.categories.some((entry) => entry.templateId === "vehicle-check"));
  assert.ok(!guestView.categories.some((entry) => entry.templateId === "travel-documents"));
});

test("avatar choice is required and global account avatars may repeat between members", () => {
  assert.equal(avatars.length, 16);
  assert.throws(() => createTrip({ name: "无头像", nickname: "甲", start: "2026-10-01T08:00", end: "2026-10-02T18:00" }), /请选择头像/);
  const { trip } = createTrip({ name: "头像规则", nickname: "甲", avatarId: "avatar-01", start: "2026-10-01T08:00", end: "2026-10-02T18:00" });
  assert.equal(addMember(trip, "乙", "avatar-01", "", "account-b").avatarId, "avatar-01");
  assert.equal(trip.members[1].accountId, "account-b");
});

test("trip type is saved, editable and safely falls back to other", () => {
  const { trip, member } = createTrip({
    name: "类型测试", nickname: "创建者", avatarId: "avatar-01", type: "露营",
    start: "2026-10-01T08:00", end: "2026-10-03T18:00",
  });
  assert.equal(trip.type, "露营");
  mutateTrip(trip, member, {
    action: "trip", revision: 0, name: trip.name, type: "骑行",
    start: trip.start, end: trip.end,
  });
  assert.equal(trip.type, "骑行");
  assert.throws(() => mutateTrip(trip, member, {
    action: "trip", revision: trip.revision, name: trip.name, type: "未知类型",
    start: trip.start, end: trip.end,
  }), /请选择旅行类型/);
  const fallback = createTrip({
    name: "其他类型", nickname: "创建者", avatarId: "avatar-02",
    start: "2026-10-01T08:00", end: "2026-10-03T18:00",
  }).trip;
  assert.equal(fallback.type, "其他");
});

test("custom avatar can be created, joined and updated without consuming a system avatar", () => {
  const firstImage = "data:image/jpeg;base64,aGVsbG8=";
  const secondImage = "data:image/webp;base64,d29ybGQ=";
  const { trip, member } = createTrip({
    name: "自定义头像",
    nickname: "甲",
    avatarData: firstImage,
    start: "2026-10-01T08:00",
    end: "2026-10-02T18:00",
  });
  assert.equal(member.avatarId, "");
  assert.equal(member.avatarData, firstImage);
  const guest = addMember(trip, "乙", "avatar-01");
  assert.equal(guest.avatarId, "avatar-01");
  mutateTrip(trip, member, {
    action: "profile",
    revision: trip.revision,
    name: "新名字",
    avatarData: secondImage,
  });
  assert.equal(member.avatarData, secondImage);
  assert.equal(member.avatarId, "");
  assert.throws(
    () => addMember(trip, "异常图片", "", "data:image/svg+xml;base64,PHN2Zz4="),
    /请选择头像/,
  );
});

test("profile changes update member references and legacy confirmations are matched safely", () => {
  const { trip, member } = createTrip({ name: "资料测试", nickname: "旧名字", avatarId: "avatar-01", start: "2026-10-01T08:00", end: "2026-10-02T18:00" });
  const item = trip.items.find((entry) => !entry.owner);
  item.done = true; item.by = "旧名字"; delete item.byMemberId;
  normalizeMembers(trip);
  assert.equal(item.byMemberId, member.id);
  mutateTrip(trip, member, { action: "profile", revision: trip.revision, name: "新名字", avatarId: "avatar-03" });
  assert.equal(member.avatarId, "avatar-03");
  assert.equal(item.by, "新名字");
  const guest = addMember(trip, "同名", "avatar-02");
  addMember(trip, "同名", "avatar-04");
  const ambiguous = trip.items.find((entry) => entry.owner === guest.id);
  ambiguous.by = "同名"; delete ambiguous.byMemberId;
  normalizeMembers(trip);
  assert.equal(ambiguous.byMemberId, undefined);
});

test("ticket images are attached to a travel day and remain editable", () => {
  const { trip, member } = createTrip({ name: "票务测试", nickname: "甲", avatarId: "avatar-01", start: "2026-10-01T08:00", end: "2026-10-03T18:00" });
  mutateTrip(trip, member, {
    action: "ticket", revision: trip.revision, type: "门票", startTime: "2026-10-02T09:30",
    fileId: "cloud://example.tcb.qcloud.la/tickets/example.jpg", mime: "image/jpeg", size: 1234,
  });
  const ticket = trip.tickets[0];
  assert.equal(ticket.uploadedByMemberId, member.id);
  assert.equal(ticket.date, "2026-10-02");
  assert.equal(ticket.type, "门票");
  mutateTrip(trip, member, { action: "ticketMeta", revision: trip.revision, id: ticket.id, type: "车票", startTime: "2026-10-03T15:20" });
  assert.equal(ticket.title, "车票");
  assert.equal(ticket.startTime, "2026-10-03T15:20");
  assert.equal(ticket.date, "2026-10-03");
  const effects = mutateTrip(trip, member, { action: "deleteTicket", revision: trip.revision, id: ticket.id });
  assert.equal(effects.deletedFileId, ticket.fileId);
  assert.equal(trip.tickets.length, 0);
});
