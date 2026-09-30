const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");
const source = readFileSync("wechat-miniprogram/miniprogram/pages/index/demo.js", "utf8");
const sandbox = { module: { exports: {} }, exports: {}, Date };
runInNewContext(source, sandbox);
const { createDemoExperience } = sandbox.module.exports;

test("guest experience provides a complete local read-only trip", () => {
  const first = createDemoExperience();
  const second = createDemoExperience();
  assert.equal(first.account.profileComplete, false);
  assert.equal(first.trip.id, "demo-trip");
  assert.ok(first.trip.events.length >= 3);
  assert.ok(first.trip.hotels.length >= 1);
  assert.ok(first.trip.categories.length >= 3);
  assert.ok(first.trip.items.some((item) => item.done));
  assert.ok(first.trip.outfits.length >= 3);
  assert.ok(new Set(first.trip.outfits.map((item) => item.date)).size >= 2);
  assert.ok(first.expenses.length >= 3);
  assert.equal(first.weather.available, true);
  first.trip.items[0].title = "changed";
  assert.notEqual(second.trip.items[0].title, "changed", "demo data must be recreated rather than persisted");
});
