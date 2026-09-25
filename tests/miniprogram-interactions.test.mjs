import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile("wechat-miniprogram/miniprogram/pages/index/index.js", "utf8");

function pageFor(trip, call) {
  let definition;
  const wx = {
    showLoading() {}, hideLoading() {}, showToast() {}, setStorageSync() {}, removeStorageSync() {}, getStorageSync() { return ""; },
    cloud: { callFunction() {} },
  };
  runInNewContext(source, { Page: (value) => { definition = value; }, wx, setTimeout });
  const page = {
    ...definition,
    data: { ...definition.data, trip, me: { name: "测试成员" }, selectedDate: "2026-09-20" },
    call,
    derive() {},
    setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        if (key.startsWith("modal.values.")) this.data.modal.values[key.slice(13)] = value;
        else this.data[key] = value;
      }
    },
  };
  return page;
}

test("an incomplete first-time account stays on the empty five-tab shell", async () => {
  const page = pageFor(null, async (operation) => {
    assert.equal(operation, "bootstrapAccount");
    return { account: { id: "new-user", profileComplete: false }, trips: [{ id: "must-not-load", archived: false }] };
  });
  page.data.tab = "route";
  await page.bootstrap();
  assert.equal(page.data.loading, false);
  assert.equal(page.data.account.profileComplete, false);
  assert.equal(page.data.trip, null);
  assert.equal(page.data.trips.length, 0);
  assert.equal(page.data.tab, "route");
  assert.equal(page.data.loginProfile, null);
});

test("rapid checklist taps on distinct rows are serialized and duplicate taps do not undo a confirmation", async () => {
  const trip = {
    id: "trip-1", revision: 0, me: "member-1", start: "2026-09-20T08:00", end: "2026-09-22T18:00",
    items: [{ id: "a", done: false }, { id: "b", done: false }], members: [],
  };
  const revisions = [];
  const page = pageFor(trip, async (_operation, input) => {
    assert.equal(input.action, "toggle");
    revisions.push(input.revision);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const next = { ...page.data.trip, revision: input.revision + 1, items: page.data.trip.items.map((item) => item.id === input.id ? { ...item, done: true } : item) };
    return { trip: next };
  });
  const tap = (id) => ({ currentTarget: { dataset: { action: "toggle", id } } });
  page.mutateAction(tap("a"));
  page.mutateAction(tap("a"));
  page.mutateAction(tap("b"));
  await page.checklistQueue;
  assert.deepEqual(revisions, [0, 1]);
  assert.equal(page.data.trip.items.find((item) => item.id === "a").done, true);
  assert.equal(page.data.trip.items.find((item) => item.id === "b").done, true);
});

test("editing an existing itinerary sends its id and returns to the edited day", async () => {
  const trip = {
    id: "trip-1", revision: 4, me: "member-1", start: "2026-09-20T08:00", end: "2026-09-22T18:00",
    events: [{ id: "event-1", date: "2026-09-20", title: "旧行程", startTime: "09:00", endTime: "10:00" }],
    items: [], members: [],
  };
  let submitted;
  const page = pageFor(trip, async (_operation, input) => {
    submitted = input;
    return { trip: { ...trip, revision: 5, events: [{ ...trip.events[0], title: input.title, date: input.date }] } };
  });
  page.openEvent({ currentTarget: { dataset: { id: "event-1" } } });
  page.bindInput({ currentTarget: { dataset: { field: "title" } }, detail: { value: "新行程" } });
  page.bindDate({ currentTarget: { dataset: { field: "date" } }, detail: { value: "2026-09-21" } });
  await page.submitModal();
  assert.equal(submitted.action, "event");
  assert.equal(submitted.id, "event-1");
  assert.equal(submitted.title, "新行程");
  assert.equal(page.data.selectedDate, "2026-09-21");
  assert.equal(page.data.trip.events[0].title, "新行程");
});

test("creating a trip duplicate selects the new trip and leaves the source untouched", async () => {
  const sourceTrip = {
    id: "source", name: "原旅行", revision: 3, me: "member-1",
    start: "2026-09-20T08:00", end: "2026-09-22T18:00", members: [], items: [], tickets: [],
  };
  const copy = { ...sourceTrip, id: "duplicate", name: "原旅行（副本）", revision: 0 };
  let request;
  const page = pageFor(sourceTrip, async (operation, input) => {
    if (operation === "cloneTrip") { request = input; return { trip: copy }; }
    throw Error(`Unexpected operation: ${operation}`);
  });
  page.reloadTrips = async () => { page.data.trips = [sourceTrip, copy]; };
  page.openCloneTrip();
  assert.equal(page.data.modal.values.name, "原旅行（副本）");
  await page.submitModal();
  assert.equal(request.tripId, sourceTrip.id);
  assert.equal(page.data.trip.id, copy.id);
  assert.equal(page.data.tab, "people");
  assert.equal(sourceTrip.name, "原旅行");
});
