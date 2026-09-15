import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { id, defaults, day, daysBetween } from "./lib.mjs";
import { upgradeTrip } from "./migration.mjs";
import { join } from "node:path";
import { createBackup } from "./backup.mjs";
const root = fileURLToPath(new URL(".", import.meta.url));
const readOnly = process.env.READ_ONLY === "1";
const cloudBaseSite =
  process.env.CLOUDBASE_SITE ||
  "https://zdata-d4g6l75lwebf2dbb0-1485288642.tcloudbaseapp.com/";
mkdirSync(process.env.DATA_DIR || root + "data", { recursive: true });
const db = new DatabaseSync(
  (process.env.DATA_DIR || root + "data") + "/trips.sqlite",
);
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS trips(id TEXT PRIMARY KEY, body TEXT NOT NULL);",
);
const all = () =>
  db
    .prepare("SELECT body FROM trips")
    .all()
    .map((x) => JSON.parse(x.body));
const save = (t) =>
  db
    .prepare("INSERT OR REPLACE INTO trips VALUES(?,?)")
    .run(t.id, JSON.stringify(t));
const legacyTrips = all().filter(
  (t) => !t.schemaVersion || t.schemaVersion < 2,
);
if (legacyTrips.length) {
  const backupDir = join(process.env.DATA_DIR || root + "data", "backups");
  mkdirSync(backupDir, { recursive: true });
  db.prepare("VACUUM INTO ?").run(
    join(backupDir, `before-v2-${Date.now()}.sqlite`),
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    legacyTrips.forEach((t) => save(upgradeTrip(t)));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
const deletions = new Map();
// Daily database-consistent backups; copy them off the host for disaster recovery.
const dailyBackup = () => {
  try {
    createBackup(
      db,
      process.env.BACKUP_DIR ||
        join(process.env.DATA_DIR || root + "data", "backups"),
      `daily-${new Date().toISOString().slice(0, 10)}.sqlite`,
    );
  } catch (e) {
    console.error("每日备份失败：", e.message);
  }
};
dailyBackup();
setInterval(dailyBackup, 3600000).unref();
const fail = (s, m) => {
  throw Object.assign(new Error(m), { status: s });
};
const txt = (v, n = 200) => {
  if (typeof v !== "string" || !v.trim() || v.length > n)
    fail(400, "请完整填写必填项");
  return v.trim();
};
const validDate = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !isNaN(Date.parse(v)) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const validTime = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) &&
  validDate(day(v)) &&
  +v.slice(11, 13) < 24 &&
  +v.slice(14, 16) < 60;
function dates(start, end) {
  if (
    !validTime(start) ||
    !validTime(end) ||
    start >= end ||
    daysBetween(start, end) > 365
  )
    fail(400, "归来时间须晚于出发时间，旅行不超过 365 天");
}
const clean = (t) => ({
  ...t,
  invite: undefined,
  recoveries: undefined,
  members: t.members.map(({ token, ...m }) => m),
});
const view = (t, m) => ({
  ...clean(t),
  invite: m.id === t.creator ? t.invite : undefined,
  me: m.id,
  items: t.items.filter((i) => !i.owner || i.owner === m.id),
  categories: t.categories.filter((c) => !c.owner || c.owner === m.id),
  progress: t.members.map((x) => {
    const a = t.items.filter((i) => i.owner === x.id);
    return {
      id: x.id,
      name: x.name,
      total: a.length,
      done: a.filter((i) => i.done).length,
      keys: a.filter((i) => i.key).length,
      reviewed: a.filter((i) => i.key && i.reviewed).length,
    };
  }),
});
async function body(req) {
  let b = "";
  for await (const c of req) {
    b += c;
    if (b.length > 65536) fail(413, "内容过长");
  }
  try {
    return JSON.parse(b || "{}");
  } catch {
    fail(400, "请求格式错误");
  }
}
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) {
      const files = {
        "/": "index.html",
        "/app.js": "app.js",
        "/style.css": "style.css",
        "/calendar.js": "calendar.js",
      };
      const f = files[url.pathname];
      if (!f) fail(404, "页面不存在");
      res.setHeader(
        "Content-Type",
        f.endsWith("html")
          ? "text/html; charset=utf-8"
          : f.endsWith("css")
            ? "text/css"
            : "text/javascript",
      );
      let content = readFileSync(root + "public/" + f);
      if (f === "index.html" && readOnly) {
        content = content
          .toString()
          .replace(
            "<body>",
            `<body><aside class="legacy-banner">历史只读版本 · 原旅行仅供查看　<a href="${cloudBaseSite}">打开 CloudBase 新站</a></aside><script>window.SUIXING_READ_ONLY=true;window.SUIXING_NEW_SITE=${JSON.stringify(cloudBaseSite)};</script>`,
          );
      }
      res.end(content);
      return;
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (
      req.headers.origin &&
      new URL(req.headers.origin).host !== req.headers.host
    )
      fail(403, "请求来源不符");
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    const send = (x) => res.end(JSON.stringify(x));
    if (req.method === "GET" && url.pathname === "/api/health") {
      db.prepare("SELECT 1").get();
      return send({ ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/trips")
      return send(
        all()
          .filter((t) => t.members.some((m) => m.token === token))
          .map((t) => ({
            id: t.id,
            name: t.name,
            start: t.start,
            end: t.end,
            archived: t.archived,
          })),
      );
    if (readOnly && req.method !== "GET")
      fail(403, "历史只读版本不能修改，请前往 CloudBase 新站");
    const b = req.method === "GET" ? {} : await body(req);
    if (req.method === "POST" && url.pathname === "/api/create") {
      dates(b.start, b.end);
      const mid = id(),
        auth = token.length === 48 ? token : id();
      const t = {
        id: id(),
        name: txt(b.name),
        start: b.start,
        end: b.end,
        creator: mid,
        invite: id(),
        members: [{ id: mid, name: txt(b.nickname, 40), token: auth }],
        items: defaults(mid),
        events: [],
        hotels: [],
        archived: false,
        revision: 0,
        recoveries: [],
      };
      if (b.reuse) {
        const old = all().find(
          (x) => x.id === b.reuse && x.members.some((m) => m.token === auth),
        );
        if (!old) fail(403, "无法复用此旅行");
        const om = old.members.find((m) => m.token === auth);
        const categoryMap = new Map();
        t.categories = old.categories
          .filter((c) => !c.owner || c.owner === om.id)
          .map((c) => {
            const next = { ...c, id: id(), owner: c.owner ? mid : null };
            categoryMap.set(c.id, next.id);
            return next;
          });
        t.items = old.items
          .filter((i) => !i.owner || i.owner === om.id)
          .map((i) => ({
            ...i,
            id: id(),
            owner: i.owner ? mid : null,
            categoryId: categoryMap.get(i.categoryId),
            done: false,
            reviewed: false,
            by: null,
            reviewBy: null,
            remind: "",
            linkedDate: "",
          }));
      }
      upgradeTrip(t);
      save(t);
      return send({ token: auth, trip: view(t, t.members[0]) });
    }
    if (req.method === "POST" && url.pathname === "/api/join") {
      const t = all().find((t) => t.invite === b.invite && !t.archived);
      if (!t) fail(404, "邀请已失效或旅行已归档");
      let m = t.members.find((x) => x.token === token);
      if (!m) {
        m = {
          id: id(),
          name: txt(b.nickname, 40),
          token: token.length === 48 ? token : id(),
        };
        t.members.push(m);
        t.items.push(...defaults(m.id).filter((i) => i.owner));
        upgradeTrip(t);
        t.revision++;
        save(t);
      }
      return send({ token: m.token, trip: view(t, m) });
    }
    if (req.method === "POST" && url.pathname === "/api/recover") {
      const t = all().find((t) =>
        t.recoveries?.some((r) => r.code === b.code && r.expires > Date.now()),
      );
      if (!t) fail(404, "恢复链接无效或已过期");
      const r = t.recoveries.find((r) => r.code === b.code),
        m = t.members.find((m) => m.id === r.member);
      m.token = id();
      t.recoveries = t.recoveries.filter((x) => x.member !== m.id);
      save(t);
      return send({ token: m.token, trip: view(t, m) });
    }
    const match = url.pathname.match(/^\/api\/trips\/([a-f0-9]+)$/);
    if (!match) fail(404, "接口不存在");
    const t = all().find((t) => t.id === match[1]);
    const m = t?.members.find((x) => x.token === token);
    if (!m) fail(403, "无权访问此旅行");
    if (req.method === "GET") return send(view(t, m));
    if (req.method !== "POST") fail(405, "不支持此操作");
    if (b.revision !== t.revision)
      fail(409, "同行人刚刚更新了内容，请查看最新状态后重试");
    const owner = () => {
      if (m.id !== t.creator) fail(403, "只有创建者可以操作");
    };
    if (b.action === "prepareDeletion") {
      owner();
      for (const [key, value] of deletions)
        if (value.expires < Date.now()) deletions.delete(key);
      const challenge = id();
      deletions.set(t.id + ":" + m.id, {
        challenge,
        expires: Date.now() + 300000,
      });
      return send({ challenge });
    }
    if (b.action === "deleteTrip") {
      owner();
      const key = t.id + ":" + m.id,
        confirmation = deletions.get(key);
      if (
        !confirmation ||
        confirmation.expires < Date.now() ||
        confirmation.challenge !== b.challenge ||
        b.confirmName !== t.name
      )
        fail(400, "请重新发起删除，并输入正确的旅行名称进行二次确认");
      db.prepare("DELETE FROM trips WHERE id = ?").run(t.id);
      deletions.delete(key);
      return send({ deleted: t.id });
    }
    if (t.archived) fail(400, "已归档旅行只可查看");
    let extra = {};
    switch (b.action) {
      case "trip":
        dates(b.start, b.end);
        if (
          t.events.some((e) => e.date < day(b.start) || e.date > day(b.end)) ||
          t.hotels.some(
            (h) => h.checkin < day(b.start) || h.checkout > day(b.end),
          )
        )
          fail(400, "已有行程或住宿超出新日期，请先调整对应安排");
        t.name = txt(b.name);
        t.start = b.start;
        t.end = b.end;
        break;
      case "archive":
        owner();
        t.archived = true;
        break;
      case "rotate":
        owner();
        t.invite = id();
        break;
      case "removeMember":
        owner();
        if (b.member === t.creator) fail(400, "不能移除创建者");
        t.members = t.members.filter((x) => x.id !== b.member);
        t.items = t.items.filter((i) => i.owner !== b.member);
        t.categories = t.categories.filter((c) => c.owner !== b.member);
        t.recoveries = t.recoveries.filter((x) => x.member !== b.member);
        break;
      case "recovery":
        if (!t.members.some((x) => x.id === b.member)) fail(404, "成员不存在");
        if (m.id !== t.creator && b.member !== m.id)
          fail(403, "只能生成自己的恢复链接");
        const code = id();
        t.recoveries = t.recoveries.filter((x) => x.member !== b.member);
        t.recoveries.push({
          code,
          member: b.member,
          expires: Date.now() + 86400000,
        });
        extra.code = code;
        break;
      case "category": {
        const name = txt(b.name, 40),
          categoryOwner = b.scope === "我的" ? m.id : null;
        if (
          t.categories.some((c) => c.owner === categoryOwner && c.name === name)
        )
          fail(400, "这个清单里已有同名分类");
        t.categories.push({ id: id(), name, owner: categoryOwner });
        break;
      }
      case "item": {
        let i = b.id ? t.items.find((x) => x.id === b.id) : null;
        if (b.id && !i) fail(404, "项目不存在");
        if (i?.owner && i.owner !== m.id) fail(403, "只能编辑自己的清单");
        const itemOwner = i ? i.owner : b.scope === "我的" ? m.id : null;
        const category = b.categoryId
          ? t.categories.find(
              (c) => c.id === b.categoryId && c.owner === itemOwner,
            )
          : t.categories.find(
              (c) =>
                c.owner === itemOwner &&
                c.name === (b.category || i?.category || "携带物品"),
            );
        if (!category)
          fail(400, "分类不存在或不属于这个清单，请重新选择分类入口");
        const v = {
          title: txt(b.title),
          category: category.name,
          categoryId: category.id,
          key: !!b.key,
          remind: b.remind || "",
          linkedDate: b.linkedDate || "",
        };
        if (v.remind && !validTime(v.remind)) fail(400, "提醒时间无效");
        if (
          v.linkedDate &&
          (!validDate(v.linkedDate) ||
            v.linkedDate < day(t.start) ||
            v.linkedDate > day(t.end))
        )
          fail(400, "关联日期须在旅行内");
        if (i) Object.assign(i, v, { reviewed: false, reviewBy: null });
        else
          t.items.push({
            id: id(),
            owner: b.scope === "我的" ? m.id : null,
            ...v,
            done: false,
            reviewed: false,
          });
        break;
      }
      case "toggle":
      case "review":
      case "deleteItem": {
        const i = t.items.find((x) => x.id === b.id);
        if (!i) fail(404, "项目不存在");
        if (i.owner && i.owner !== m.id) fail(403, "只能确认自己的清单");
        if (b.action === "deleteItem")
          t.items = t.items.filter((x) => x.id !== i.id);
        else if (b.action === "toggle") {
          i.done = !i.done;
          i.by = i.done ? m.name : null;
          i.reviewed = false;
          i.reviewBy = null;
        } else {
          if (!i.done || !i.key) fail(400, "请先完成关键项目的准备");
          i.reviewed = !i.reviewed;
          i.reviewBy = i.reviewed ? m.name : null;
        }
        break;
      }
      case "event": {
        if (!validDate(b.date) || b.date < day(t.start) || b.date > day(t.end))
          fail(400, "安排日期须在旅行内");
        if (!["上午", "下午", "晚上"].includes(b.period))
          fail(400, "请选择时段");
        const startTime = b.startTime,
          endTime = b.endTime;
        const clockTime = (v) =>
          typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
        if (
          !clockTime(startTime) ||
          !clockTime(endTime) ||
          endTime <= startTime
        )
          fail(400, "请填写开始与结束时间，结束须晚于开始；跨天安排请拆成两天");
        const v = {
          date: b.date,
          period: b.period,
          time: startTime,
          startTime,
          endTime,
          title: txt(b.title),
          startPlace: String(b.startPlace || "").slice(0, 500),
          endPlace: String(b.endPlace || "").slice(0, 500),
          address: String(b.address || "").slice(0, 500),
          note: String(b.note || "").slice(0, 2000),
        };
        if (b.id) {
          const e = t.events.find((x) => x.id === b.id);
          if (!e) fail(404, "安排不存在");
          Object.assign(e, v);
        } else t.events.push({ id: id(), ...v });
        break;
      }
      case "hotel": {
        if (
          !validDate(b.checkin) ||
          !validDate(b.checkout) ||
          b.checkin >= b.checkout ||
          b.checkin < day(t.start) ||
          b.checkout > day(t.end)
        )
          fail(400, "住宿日期须在旅行内，退房日期须晚于入住");
        if (
          t.hotels.some(
            (h) =>
              h.id !== b.id && h.checkin < b.checkout && b.checkin < h.checkout,
          )
        )
          fail(400, "该晚已有住宿，请编辑已有酒店");
        const v = {
          name: txt(b.name),
          city: txt(b.city),
          address: txt(b.address, 500),
          checkin: b.checkin,
          checkout: b.checkout,
          phone: String(b.phone || "").slice(0, 60),
          note: String(b.note || "").slice(0, 2000),
        };
        if (b.id) {
          const h = t.hotels.find((x) => x.id === b.id);
          if (!h) fail(404, "住宿不存在");
          Object.assign(h, v);
        } else t.hotels.push({ id: id(), ...v });
        break;
      }
      case "deleteEvent":
        t.events = t.events.filter((x) => x.id !== b.id);
        break;
      case "deleteHotel":
        t.hotels = t.hotels.filter((x) => x.id !== b.id);
        break;
      default:
        fail(400, "未知操作");
    }
    t.revision++;
    save(t);
    send({ trip: view(t, m), ...extra });
  } catch (e) {
    res.statusCode = e.status || 500;
    res.end(
      JSON.stringify({ error: e.status ? e.message : "保存失败，请稍后重试" }),
    );
    if (!e.status) console.error(e);
  }
});
server.listen(Number(process.env.PORT) || 3000, process.env.HOST || "0.0.0.0", () =>
  console.log("随行已启动：http://localhost:" + (process.env.PORT || 3000)),
);
