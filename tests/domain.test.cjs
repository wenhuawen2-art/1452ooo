const test = require("node:test");
const assert = require("node:assert/strict");
const { createTrip, addMember, viewTrip, mutateTrip } = require("../shared/domain.cjs");
const { checklistTemplates } = require("../shared/templates.cjs");

test("CloudBase shared domain keeps public and personal checklist data isolated", () => {
  const { trip, member: owner } = createTrip({
    name: "川西小环线", nickname: "文华",
    start: "2026-10-01T08:00", end: "2026-10-05T18:00",
  });
  const guest = addMember(trip, "同行人");
  const ownerView = viewTrip(trip, owner, "invite-token");
  const guestView = viewTrip(trip, guest);
  assert.equal(ownerView.invite, "invite-token");
  assert.equal(guestView.invite, undefined);
  assert.ok(ownerView.items.every((item) => !item.owner || item.owner === owner.id));
  assert.ok(guestView.items.every((item) => !item.owner || item.owner === guest.id));
});

test("CloudBase shared domain validates full schedule period and revision", () => {
  const { trip, member } = createTrip({
    name: "测试旅行", nickname: "创建者",
    start: "2026-10-01T08:00", end: "2026-10-03T18:00",
  });
  mutateTrip(trip, member, {
    action: "event", revision: 0, date: "2026-10-01", period: "上午",
    startTime: "09:00", endTime: "11:30", title: "出发去景区",
  });
  assert.equal(trip.events[0].endTime, "11:30");
  assert.throws(() => mutateTrip(trip, member, { action: "archive", revision: 0 }), /同行人刚刚更新/);
});

test("CloudBase shared domain resets review after a checklist toggle", () => {
  const { trip, member } = createTrip({
    name: "测试旅行", nickname: "创建者",
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
  assert.equal(checklistTemplates.length, 5);
  const { trip, member: owner } = createTrip({
    name: "模板测试", nickname: "创建者",
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
  const guest = addMember(trip, "同行人");
  const guestView = viewTrip(trip, guest);
  assert.ok(guestView.categories.some((entry) => entry.templateId === "vehicle-check"));
  assert.ok(!guestView.categories.some((entry) => entry.templateId === "travel-documents"));
});
