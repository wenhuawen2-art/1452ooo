import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { staying, stage } from "../legacy-server/lib.mjs";
import { calendar } from "../legacy-server/public/calendar.js";
import { upgradeTrip } from "../legacy-server/migration.mjs";
const dir = mkdtempSync(join(tmpdir(), "suixing-test-"));
let server, owner, guest, t;
async function req(path, data, token = owner) {
  const r = await fetch("http://localhost:3107/api/" + path, {
    method: data ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (token || ""),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  return { status: r.status, ...(await r.json()) };
}
async function action(data, token = owner) {
  const snap = await req("trips/" + t.id, null, token);
  return req("trips/" + t.id, { revision: snap.revision, ...data }, token);
}
before(async () => {
  const legacy = new DatabaseSync(join(dir, "trips.sqlite"));
  legacy.exec("CREATE TABLE trips(id TEXT PRIMARY KEY, body TEXT NOT NULL)");
  legacy.prepare("INSERT INTO trips VALUES(?,?)").run(
    "legacy-fixture",
    JSON.stringify({
      id: "legacy-fixture",
      name: "旧旅行",
      creator: "legacy-owner",
      start: "2026-10-01T08:00",
      end: "2026-10-05T18:00",
      members: [{ id: "legacy-owner", name: "旧成员", token: "l".repeat(48) }],
      items: [
        {
          id: "old-item",
          owner: null,
          category: "携带物品",
          title: "已准备的帐篷",
          done: true,
          reviewed: true,
          key: true,
        },
      ],
      events: [
        {
          id: "old-event",
          title: "旧安排",
          date: "2026-10-01",
          period: "上午",
          time: "09:00",
        },
      ],
      hotels: [],
      recoveries: [],
      revision: 3,
      invite: "old-invite",
      archived: false,
    }),
  );
  legacy.close();
  server = spawn(process.execPath, ["legacy-server/server.mjs"], {
    env: { ...process.env, PORT: "3107", DATA_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    server.stdout.once("data", resolve);
    server.once("error", reject);
    server.once("exit", () => reject(Error("server exited")));
  });
});
after(async () => {
  server.kill();
  await new Promise((resolve) => server.once("exit", resolve));
  rmSync(dir, { recursive: true, force: true });
});
test("住宿按夜判断，7/3/1 节点，日历北京时间转 UTC", () => {
  const h = { checkin: "2026-10-01", checkout: "2026-10-04" };
  assert.equal(staying(h, "2026-10-03"), true);
  assert.equal(staying(h, "2026-10-04"), false);
  const trip = { start: "2026-10-10T08:00", end: "2026-10-15T18:00" };
  assert.equal(stage(trip, "2026-10-03"), "出发前 7 天");
  assert.equal(stage(trip, "2026-10-07"), "出发前 3 天");
  assert.match(stage(trip, "2026-10-09"), /复核/);
  assert.match(
    calendar("买票", "2026-10-01T09:00", "ticket"),
    /DTSTART:20261001T010000Z/,
  );
  assert.match(calendar("买票", "2026-10-01T09:00", "ticket"), /METHOD:PUBLISH/);
  assert.match(calendar("买票", "2026-10-01T09:00", "ticket"), /TRIGGER:PT0M/);
  const long = calendar(
    "很长的中文旅行提醒".repeat(12),
    "2026-10-01T09:00",
    "long",
  );
  assert.ok(long.split("\r\n").every((line) => Buffer.byteLength(line) <= 75));
});
test("旧数据迁移前备份，保留勾选及旧开始时间，迁移幂等", () => {
  const migratedDb = new DatabaseSync(join(dir, "trips.sqlite"));
  const migrated = JSON.parse(
    migratedDb
      .prepare("SELECT body FROM trips WHERE id=?")
      .get("legacy-fixture").body,
  );
  migratedDb.close();
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.items[0].id, "old-item");
  assert.equal(migrated.items[0].done, true);
  assert.equal(migrated.items[0].reviewed, true);
  assert.equal(migrated.events[0].startTime, "09:00");
  assert.equal(migrated.events[0].endTime, "");
  assert.equal(migrated.categories.length, 4);
  assert.deepEqual(upgradeTrip(structuredClone(migrated)), migrated);
  const backupName = readdirSync(join(dir, "backups")).find((n) =>
    n.startsWith("before-v2-"),
  );
  assert.ok(backupName);
  const backupDb = new DatabaseSync(join(dir, "backups", backupName), {
    readOnly: true,
  });
  assert.equal(
    Object.values(backupDb.prepare("PRAGMA quick_check").get())[0],
    "ok",
  );
  const old = JSON.parse(
    backupDb.prepare("SELECT body FROM trips WHERE id=?").get("legacy-fixture")
      .body,
  );
  assert.equal(old.schemaVersion, undefined);
  backupDb.close();
});
test("旅行、共享与归档端到端", async () => {
  let r = await req("create", {
    name: "川西自驾",
    nickname: "小林",
    start: "2026-10-01T08:00",
    end: "2026-10-05T18:00",
  });
  assert.equal(r.status, 200);
  owner = r.token;
  t = r.trip;
  assert.equal(t.items.length, 10);
  const originalInvite = t.invite;
  r = await req("join", { nickname: "小陈", invite: t.invite }, "");
  assert.equal(r.status, 200);
  guest = r.token;
  const guestId = r.trip.me,
    guestItem = r.trip.items.find((i) => i.owner);
  const guestView = r.trip;
  r = await action({ action: "category", name: "露营装备", scope: "公共" });
  assert.equal(r.status, 200);
  const sharedCategory = r.trip.categories.find((c) => c.name === "露营装备");
  r = await action(
    { action: "category", name: "露营装备", scope: "公共" },
    guest,
  );
  assert.equal(r.status, 400);
  r = await action({ action: "category", name: "相机装备", scope: "我的" });
  const privateCategory = r.trip.categories.find((c) => c.name === "相机装备");
  r = await req("trips/" + t.id, null, guest);
  assert.ok(r.categories.some((c) => c.id === sharedCategory.id));
  assert.equal(
    r.categories.some((c) => c.id === privateCategory.id),
    false,
  );
  assert.equal(
    (
      await action(
        {
          action: "item",
          title: "越权物品",
          scope: "我的",
          categoryId: privateCategory.id,
        },
        guest,
      )
    ).status,
    400,
  );
  r = await action(
    {
      action: "item",
      title: "折叠桌",
      scope: "公共",
      categoryId: sharedCategory.id,
    },
    guest,
  );
  assert.equal(r.status, 200);
  assert.equal(r.trip.items.at(-1).categoryId, sharedCategory.id);
  assert.equal(r.trip.items.at(-1).category, "露营装备");
  assert.equal(
    (await action({ action: "prepareDeletion" }, guest)).status,
    403,
  );
  assert.equal(guestView.invite, undefined);
  assert.equal(
    guestView.members.some((m) => m.token),
    false,
  );
  assert.equal(
    guestView.items.some((i) => i.owner && i.owner !== guestId),
    false,
  );
  const publicItem = t.items.find((i) => !i.owner && i.key),
    personal = t.items.find((i) => i.owner);
  r = await action({ action: "toggle", id: personal.id }, guest);
  assert.equal(r.status, 403);
  r = await action({ action: "toggle", id: publicItem.id }, guest);
  assert.equal(r.status, 200);
  assert.equal(r.trip.items.find((i) => i.id === publicItem.id).by, "小陈");
  r = await req("trips/" + t.id);
  assert.equal(r.items.find((i) => i.id === publicItem.id).done, true);
  r = await action({ action: "review", id: publicItem.id });
  assert.equal(r.trip.items.find((i) => i.id === publicItem.id).reviewed, true);
  r = await action({
    action: "item",
    id: publicItem.id,
    title: "应急工具与三角牌",
    key: true,
    category: "携带物品",
  });
  assert.equal(
    r.trip.items.find((i) => i.id === publicItem.id).reviewed,
    false,
  );
  r = await action({ action: "review", id: publicItem.id });
  assert.equal(r.status, 200);
  r = await action({ action: "toggle", id: publicItem.id });
  assert.equal(
    r.trip.items.find((i) => i.id === publicItem.id).reviewed,
    false,
  );
  r = await action({ action: "toggle", id: guestItem.id }, guest);
  assert.equal(r.status, 200);
  assert.equal(
    (await req("trips/" + t.id)).items.find((i) => i.id === personal.id).done,
    false,
  );
  r = await req("trips/" + t.id, {
    action: "toggle",
    id: publicItem.id,
    revision: 0,
  });
  assert.equal(r.status, 409);
  r = await action({
    action: "hotel",
    name: "山间小住",
    city: "康定",
    address: "康定市新都桥镇",
    checkin: "2026-10-01",
    checkout: "2026-10-04",
  });
  assert.equal(r.status, 200);
  r = await action({
    action: "hotel",
    name: "重复",
    city: "康定",
    address: "地址",
    checkin: "2026-10-03",
    checkout: "2026-10-05",
  });
  assert.equal(r.status, 400);
  r = await action({
    action: "event",
    title: "鱼子西看日落",
    date: "2026-10-02",
    period: "下午",
    startTime: "16:30",
    endTime: "18:00",
    startPlace: "成都",
    endPlace: "鱼子西",
    address: "鱼子西",
  });
  assert.equal(r.status, 200);
  const eventId = r.trip.events[0].id;
  r = await action({
    action: "event",
    id: eventId,
    title: "鱼子西日落",
    date: "2026-10-02",
    period: "下午",
    startTime: "16:00",
    endTime: "18:30",
  });
  assert.equal(r.trip.events[0].time, "16:00");
  assert.equal(r.trip.events[0].endTime, "18:30");
  assert.equal(r.trip.events[0].startPlace, "");
  assert.equal(r.trip.events[0].endPlace, "");
  for (const [startTime, endTime] of [
    ["16:00", ""],
    ["18:00", "16:00"],
    ["16:00", "16:00"],
    ["25:00", "26:00"],
  ]) {
    assert.equal(
      (
        await action({
          action: "event",
          title: "无效时段",
          date: "2026-10-02",
          period: "下午",
          startTime,
          endTime,
        })
      ).status,
      400,
    );
  }
  r = await action({
    action: "trip",
    name: "川西",
    start: "2026-10-03T08:00",
    end: "2026-10-05T18:00",
  });
  assert.equal(r.status, 400);
  r = await action({
    action: "item",
    title: "景区买票",
    category: "准备事项",
    remind: "2026-09-25T09:00",
    linkedDate: "2026-10-02",
  });
  assert.equal(r.status, 200);
  assert.equal(r.trip.items.at(-1).remind, "2026-09-25T09:00");
  r = await action({ action: "archive" }, guest);
  assert.equal(r.status, 403);
  r = await action({ action: "rotate" });
  assert.notEqual(r.trip.invite, originalInvite);
  assert.equal(
    (await req("join", { nickname: "第三人", invite: originalInvite }, ""))
      .status,
    404,
  );
  r = await action({ action: "recovery", member: guestId }, guest);
  assert.equal(r.status, 200);
  assert.ok(r.code);
  r = await action({ action: "recovery", member: t.creator }, guest);
  assert.equal(r.status, 403);
  r = await action({ action: "recovery", member: guestId });
  const code = r.code;
  r = await req("recover", { code }, "");
  assert.equal(r.trip.me, guestId);
  const restored = r.token;
  assert.equal((await req("trips/" + t.id, null, guest)).status, 403);
  assert.equal((await req("recover", { code }, "")).status, 404);
  r = await action({ action: "removeMember", member: guestId });
  assert.equal((await req("trips/" + t.id, null, restored)).status, 403);
  r = await action({ action: "archive" });
  assert.equal(r.trip.archived, true);
  assert.equal(
    (await action({ action: "toggle", id: publicItem.id })).status,
    400,
  );
  r = await req("create", {
    name: "下一程",
    nickname: "小林",
    start: "2026-11-01T08:00",
    end: "2026-11-04T18:00",
    reuse: t.id,
  });
  assert.equal(r.status, 200);
  assert.equal(
    r.trip.items.some((i) => i.done || i.reviewed || i.remind),
    false,
  );
  assert.equal(r.trip.events.length, 0);
  assert.ok(r.trip.categories.some((c) => c.name === "露营装备"));
  assert.ok(r.trip.categories.some((c) => c.name === "相机装备"));
  assert.equal(
    r.trip.items.find((i) => i.title === "折叠桌").categoryId,
    r.trip.categories.find((c) => c.name === "露营装备").id,
  );
  assert.equal(
    Object.keys(await req("trips")).filter((k) => k !== "status").length,
    2,
  );
  // The source is archived; deleting it must still work, without touching its clone.
  assert.equal(
    (await action({ action: "deleteTrip", confirmName: t.name })).status,
    400,
  );
  r = await action({ action: "prepareDeletion" });
  assert.equal(r.status, 200);
  const challenge = r.challenge;
  assert.equal((await req("trips/" + t.id)).name, t.name); // first confirmation does not delete
  assert.equal(
    (await action({ action: "deleteTrip", challenge, confirmName: "错误名称" }))
      .status,
    400,
  );
  assert.equal((await req("trips/" + t.id)).name, t.name);
  assert.equal(
    (await action({ action: "deleteTrip", challenge, confirmName: t.name }))
      .status,
    200,
  );
  assert.equal((await req("trips/" + t.id)).status, 403);
  assert.equal(
    (await req("join", { nickname: "新人", invite: originalInvite }, ""))
      .status,
    404,
  );
  assert.equal(
    Object.keys(await req("trips")).filter((k) => k !== "status").length,
    1,
  );
});
