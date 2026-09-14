const { randomBytes } = require("node:crypto");
const { getChecklistTemplate } = require("./templates.cjs");
const { periodForStart } = require("./schedule.cjs");
const { isAvatarId, normalizeMembers, avatarSelection } = require("./avatars.cjs");

const id = () => randomBytes(24).toString("hex");
const day = (value) => String(value || "").slice(0, 10);
const dateNumber = (value) => Date.parse(`${day(value)}T00:00:00Z`);
const daysBetween = (a, b) => Math.round((dateNumber(b) - dateNumber(a)) / 86400000);
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const text = (value, max = 200) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) fail(400, "请完整填写必填项");
  return value.trim();
};
const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const validTime = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
  validDate(day(value)) &&
  Number(value.slice(11, 13)) < 24 &&
  Number(value.slice(14, 16)) < 60;
const validateDates = (start, end) => {
  if (!validTime(start) || !validTime(end) || start >= end || daysBetween(start, end) > 365)
    fail(400, "归来时间须晚于出发时间，旅行不超过 365 天");
};

function defaultItems(owner) {
  return [
    ["公共", "携带物品", "车载应急工具", true],
    ["公共", "携带物品", "饮用水与纸巾", false],
    ["公共", "准备事项", "检查轮胎、胎压和油量", true],
    ["公共", "准备事项", "下载离线地图", false],
    ["公共", "准备事项", "检查门窗与水电", true],
    ["我的", "携带物品", "身份证", true],
    ["我的", "携带物品", "驾驶证（驾驶人）", true],
    ["我的", "携带物品", "常用药品", true],
    ["我的", "携带物品", "手机、充电线与充电宝", false],
    ["我的", "携带物品", "换洗衣物与洗漱用品", false],
  ].map(([scope, category, title, key]) => ({
    id: id(), owner: scope === "我的" ? owner : null, category, title, key,
    done: false, reviewed: false, by: null, byMemberId: null,
    reviewBy: null, reviewByMemberId: null, remind: "", linkedDate: "",
  }));
}

function ensureCategories(trip) {
  trip.categories ||= [];
  trip.tickets ||= [];
  const ensure = (name, owner) => {
    let category = trip.categories.find((entry) => entry.name === name && entry.owner === owner);
    if (!category) {
      category = { id: id(), name, owner };
      trip.categories.push(category);
    }
    return category;
  };
  for (const owner of [null, ...trip.members.map((member) => member.id)])
    for (const name of ["携带物品", "准备事项"]) ensure(name, owner);
  for (const item of trip.items) {
    const category = trip.categories.find((entry) => entry.id === item.categoryId && entry.owner === item.owner)
      || ensure(item.category || "携带物品", item.owner);
    item.categoryId = category.id;
    item.category = category.name;
  }
  trip.schemaVersion = Math.max(Number(trip.schemaVersion) || 0, 4);
  return trip;
}

function createTrip(input, reuseTrip, reuseMember) {
  validateDates(input.start, input.end);
  if (!isAvatarId(input.avatarId)) fail(400, "请选择头像");
  const member = { id: id(), name: text(input.nickname, 40), avatarId: input.avatarId };
  const trip = ensureCategories({
    id: id(), name: text(input.name), start: input.start, end: input.end,
    creator: member.id, members: [member], items: defaultItems(member.id),
    categories: [], events: [], hotels: [], tickets: [], archived: false, revision: 0,
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  if (reuseTrip && reuseMember) {
    const categoryMap = new Map();
    trip.categories = reuseTrip.categories
      .filter((category) => !category.owner || category.owner === reuseMember.id)
      .map((category) => {
        const next = { ...category, id: id(), owner: category.owner ? member.id : null };
        categoryMap.set(category.id, next.id);
        return next;
      });
    trip.items = reuseTrip.items
      .filter((item) => !item.owner || item.owner === reuseMember.id)
      .map((item) => ({ ...item, id: id(), owner: item.owner ? member.id : null,
        categoryId: categoryMap.get(item.categoryId), done: false, reviewed: false,
        by: null, byMemberId: null, reviewBy: null, reviewByMemberId: null, remind: "", linkedDate: "" }));
    ensureCategories(trip);
  }
  return { trip, member };
}

function addMember(trip, nickname, avatarId) {
  normalizeMembers(trip);
  const choice = avatarSelection(trip, null, avatarId);
  if (!choice.valid) fail(400, "请选择头像");
  if (!choice.available) fail(409, "这个头像刚被同行人选走，请换一个");
  const member = { id: id(), name: text(nickname, 40), avatarId };
  trip.members.push(member);
  trip.items.push(...defaultItems(member.id).filter((item) => item.owner));
  ensureCategories(trip);
  trip.revision += 1;
  trip.updatedAt = Date.now();
  return member;
}

function viewTrip(trip, member, invite) {
  normalizeMembers(trip);
  return {
    ...trip,
    invite: member.id === trip.creator ? invite : undefined,
    me: member.id,
    items: trip.items.filter((item) => !item.owner || item.owner === member.id),
    categories: trip.categories.filter((category) => !category.owner || category.owner === member.id),
    progress: trip.members.map((entry) => {
      const items = trip.items.filter((item) => item.owner === entry.id);
      return { id: entry.id, name: entry.name, avatarId: entry.avatarId, total: items.length,
        done: items.filter((item) => item.done).length,
        keys: items.filter((item) => item.key).length,
        reviewed: items.filter((item) => item.key && item.reviewed).length };
    }),
  };
}

function mutateTrip(trip, member, input) {
  normalizeMembers(trip);
  if (input.revision !== trip.revision) fail(409, "同行人刚刚更新了内容，请查看最新状态后重试");
  const owner = () => { if (member.id !== trip.creator) fail(403, "只有创建者可以操作"); };
  if (trip.archived) fail(400, "已归档旅行只可查看");
  const effects = {};
  switch (input.action) {
    case "profile": {
      const nextName = text(input.name, 40);
      const choice = avatarSelection(trip, member.id, input.avatarId);
      if (!choice.valid) fail(400, "请选择头像");
      if (!choice.available) fail(409, "这个头像刚被同行人选走，请换一个");
      member.name = nextName;
      member.avatarId = input.avatarId;
      for (const item of trip.items) {
        if (item.byMemberId === member.id) item.by = nextName;
        if (item.reviewByMemberId === member.id) item.reviewBy = nextName;
      }
      break;
    }
    case "trip":
      validateDates(input.start, input.end);
      if (trip.events.some((event) => event.date < day(input.start) || event.date > day(input.end)) ||
          trip.hotels.some((hotel) => hotel.checkin < day(input.start) || hotel.checkout > day(input.end)))
        fail(400, "已有行程或住宿超出新日期，请先调整对应安排");
      trip.name = text(input.name); trip.start = input.start; trip.end = input.end;
      break;
    case "archive": owner(); trip.archived = true; break;
    case "rotate": owner(); effects.rotateInvite = true; break;
    case "removeMember":
      owner();
      if (input.member === trip.creator) fail(400, "不能移除创建者");
      if (!trip.members.some((entry) => entry.id === input.member)) fail(404, "成员不存在");
      trip.members = trip.members.filter((entry) => entry.id !== input.member);
      trip.items = trip.items.filter((item) => item.owner !== input.member);
      trip.categories = trip.categories.filter((category) => category.owner !== input.member);
      effects.removedMember = input.member;
      break;
    case "recovery":
      if (!trip.members.some((entry) => entry.id === input.member)) fail(404, "成员不存在");
      if (member.id !== trip.creator && input.member !== member.id)
        fail(403, "只能生成自己的恢复链接");
      effects.recoveryMember = input.member;
      break;
    case "category": {
      const name = text(input.name, 40), categoryOwner = input.scope === "我的" ? member.id : null;
      if (trip.categories.some((category) => category.owner === categoryOwner && category.name === name))
        fail(400, "这个清单里已有同名分类");
      trip.categories.push({ id: id(), name, owner: categoryOwner });
      break;
    }
    case "importTemplate": {
      if (!["公共", "我的"].includes(input.scope)) fail(400, "请选择要导入的清单");
      const template = getChecklistTemplate(input.templateId);
      if (!template) fail(404, "清单模板不存在");
      const categoryOwner = input.scope === "我的" ? member.id : null;
      if (trip.categories.some((category) => category.owner === categoryOwner && category.templateId === template.id))
        fail(400, "这个模板已经导入到当前清单");
      let categoryName = template.name;
      if (trip.categories.some((category) => category.owner === categoryOwner && category.name === categoryName)) {
        categoryName = `${template.name}（模板）`;
        let suffix = 2;
        while (trip.categories.some((category) => category.owner === categoryOwner && category.name === categoryName))
          categoryName = `${template.name}（模板 ${suffix++}）`;
      }
      const category = { id: id(), name: categoryName, owner: categoryOwner, templateId: template.id };
      trip.categories.push(category);
      trip.items.push(...template.items.map((entry) => ({
        id: id(), owner: categoryOwner, category: category.name, categoryId: category.id,
        title: entry.title, key: !!entry.key, done: false, reviewed: false,
        by: null, byMemberId: null, reviewBy: null, reviewByMemberId: null, remind: "", linkedDate: "",
      })));
      effects.importedCategoryId = category.id;
      break;
    }
    case "item": {
      const existing = input.id ? trip.items.find((item) => item.id === input.id) : null;
      if (input.id && !existing) fail(404, "项目不存在");
      if (existing?.owner && existing.owner !== member.id) fail(403, "只能编辑自己的清单");
      const itemOwner = existing ? existing.owner : input.scope === "我的" ? member.id : null;
      const category = trip.categories.find((entry) => entry.id === input.categoryId && entry.owner === itemOwner);
      if (!category) fail(400, "分类不存在或不属于这个清单，请重新选择分类入口");
      const values = { title: text(input.title), category: category.name, categoryId: category.id,
        key: !!input.key, remind: input.remind || "", linkedDate: input.linkedDate || "" };
      if (values.remind && !validTime(values.remind)) fail(400, "提醒时间无效");
      if (values.linkedDate && (!validDate(values.linkedDate) || values.linkedDate < day(trip.start) || values.linkedDate > day(trip.end)))
        fail(400, "关联日期须在旅行内");
      if (existing) Object.assign(existing, values, { reviewed: false, reviewBy: null, reviewByMemberId: null });
      else trip.items.push({ id: id(), owner: itemOwner, ...values, done: false, reviewed: false, by: null, byMemberId: null, reviewBy: null, reviewByMemberId: null });
      break;
    }
    case "toggle": case "review": case "deleteItem": {
      const item = trip.items.find((entry) => entry.id === input.id);
      if (!item) fail(404, "项目不存在");
      if (item.owner && item.owner !== member.id) fail(403, "只能确认自己的清单");
      if (input.action === "deleteItem") trip.items = trip.items.filter((entry) => entry.id !== item.id);
      else if (input.action === "toggle") {
        item.done = !item.done; item.by = item.done ? member.name : null; item.byMemberId = item.done ? member.id : null;
        item.reviewed = false; item.reviewBy = null; item.reviewByMemberId = null;
      } else {
        if (!item.done || !item.key) fail(400, "请先完成关键项目的准备");
        item.reviewed = !item.reviewed; item.reviewBy = item.reviewed ? member.name : null; item.reviewByMemberId = item.reviewed ? member.id : null;
      }
      break;
    }
    case "event": {
      if (!validDate(input.date) || input.date < day(trip.start) || input.date > day(trip.end)) fail(400, "安排日期须在旅行内");
      const clock = (value) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
      if (!clock(input.startTime) || !clock(input.endTime) || input.endTime <= input.startTime)
        fail(400, "请填写开始与结束时间，结束须晚于开始；跨天安排请拆成两天");
      const values = { date: input.date, period: periodForStart(input.startTime), time: input.startTime,
        startTime: input.startTime, endTime: input.endTime, title: text(input.title),
        address: String(input.address || "").slice(0, 500), note: String(input.note || "").slice(0, 2000) };
      if (input.id) {
        const event = trip.events.find((entry) => entry.id === input.id);
        if (!event) fail(404, "安排不存在");
        Object.assign(event, values);
      } else trip.events.push({ id: id(), ...values });
      break;
    }
    case "hotel": {
      if (!validDate(input.checkin) || !validDate(input.checkout) || input.checkin >= input.checkout ||
          input.checkin < day(trip.start) || input.checkout > day(trip.end)) fail(400, "住宿日期须在旅行内，退房日期须晚于入住");
      if (trip.hotels.some((hotel) => hotel.id !== input.id && hotel.checkin < input.checkout && input.checkin < hotel.checkout))
        fail(400, "该晚已有住宿，请编辑已有酒店");
      const values = { name: text(input.name), city: text(input.city), address: text(input.address, 500),
        checkin: input.checkin, checkout: input.checkout, phone: String(input.phone || "").slice(0, 60),
        note: String(input.note || "").slice(0, 2000) };
      if (input.id) {
        const hotel = trip.hotels.find((entry) => entry.id === input.id);
        if (!hotel) fail(404, "住宿不存在");
        Object.assign(hotel, values);
      } else trip.hotels.push({ id: id(), ...values });
      break;
    }
    case "ticket": {
      if (!validDate(input.date) || input.date < day(trip.start) || input.date > day(trip.end)) fail(400, "票务日期须在旅行内");
      if (typeof input.fileId !== "string" || !input.fileId.startsWith("cloud://")) fail(400, "票据图片无效");
      trip.tickets.push({
        id: id(), date: input.date, title: text(input.title, 80), fileId: input.fileId,
        mime: String(input.mime || "image/jpeg").slice(0, 40), size: Number(input.size) || 0,
        uploadedByMemberId: member.id, createdAt: Date.now(),
      });
      break;
    }
    case "ticketMeta": {
      const ticket = trip.tickets.find((entry) => entry.id === input.id);
      if (!ticket) fail(404, "票据不存在");
      if (!validDate(input.date) || input.date < day(trip.start) || input.date > day(trip.end)) fail(400, "票务日期须在旅行内");
      ticket.title = text(input.title, 80);
      ticket.date = input.date;
      break;
    }
    case "deleteTicket": {
      const ticket = trip.tickets.find((entry) => entry.id === input.id);
      if (!ticket) fail(404, "票据不存在");
      trip.tickets = trip.tickets.filter((entry) => entry.id !== ticket.id);
      effects.deletedFileId = ticket.fileId;
      break;
    }
    case "deleteEvent": trip.events = trip.events.filter((event) => event.id !== input.id); break;
    case "deleteHotel": trip.hotels = trip.hotels.filter((hotel) => hotel.id !== input.id); break;
    default: fail(400, "未知操作");
  }
  trip.revision += 1;
  trip.updatedAt = Date.now();
  return effects;
}

module.exports = { id, day, fail, createTrip, addMember, viewTrip, mutateTrip, ensureCategories };
