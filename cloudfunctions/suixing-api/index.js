const cloudbase = require("@cloudbase/node-sdk");
const { createHash, randomBytes } = require("node:crypto");
const { id, fail, createTrip, duplicateTrip, addMember, viewTrip, mutateTrip } = require("./domain.cjs");
const { avatarIds, normalizeMembers } = require("./avatars.cjs");
const { checklistTemplates } = require("./templates.cjs");
const expensePackage = require("./expenses.cjs");
const { DEFAULT_EXPENSE_CATEGORIES, normalizeExpense, buildExpenseSummary, buildSettlementPlan } = expensePackage;

const app = cloudbase.init({});
const db = app.database();
const ticketUrlCache = new Map();
const collections = {
  trips: db.collection("trips"),
  members: db.collection("trip_members"),
  invites: db.collection("trip_invites"),
  recoveries: db.collection("recovery_codes"),
  challenges: db.collection("delete_challenges"),
  weather: db.collection("weather_cache"),
  users: db.collection("user_accounts"),
  webLogins: db.collection("web_login_sessions"),
  expenses: db.collection("trip_expenses"),
  settlements: db.collection("trip_settlements"),
  expenseSettings: db.collection("trip_expense_settings"),
};
let collectionSetup;
async function ensureCollections() {
  if (!collectionSetup) collectionSetup = Promise.all(
    ["trips", "trip_members", "trip_invites", "recovery_codes", "delete_challenges", "weather_cache", "user_accounts", "web_login_sessions", "trip_expenses", "trip_settlements", "trip_expense_settings"].map(async (name) => {
      try { await db.createCollection(name); }
      catch (error) {
        if (!/exist|already|重复|存在/i.test(String(error?.message || error))) throw error;
      }
    }),
  ).catch((error) => { collectionSetup = null; throw error; });
  return collectionSetup;
}
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const memberKey = (accountId, tripId) => hash(`${accountId}:${tripId}`);
const accountKeyForOpenId = (appId, openId) => `wx_${hash(`${appId || "wechat"}:${openId}`).slice(0, 48)}`;
const cleanDocument = (value) => {
  if (!value) return value;
  const { _id, ...clean } = value;
  return clean;
};
const weatherCodeText = (code) => {
  const map = { 0: "晴", 1: "大部晴朗", 2: "局部多云", 3: "阴", 45: "雾", 48: "雾凇", 51: "小毛毛雨", 53: "毛毛雨", 55: "较强毛毛雨", 61: "小雨", 63: "中雨", 65: "大雨", 71: "小雪", 73: "中雪", 75: "大雪", 80: "阵雨", 81: "较强阵雨", 82: "强阵雨", 95: "雷雨", 96: "雷雨伴冰雹", 99: "雷雨伴强冰雹" };
  return map[Number(code)] || "天气变化";
};
const weatherKey = (place, date) => createHash("sha256").update(`${place}|${date}`).digest("hex").slice(0, 32);
async function geocodePlace(place) {
  const openUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=zh&format=json`;
  const openResponse = await fetch(openUrl);
  if (openResponse.ok) {
    const openData = await openResponse.json();
    if (openData?.results?.[0]) return { ...openData.results[0], geoSource: "Open-Meteo" };
  }
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&accept-language=zh-CN&limit=1&q=${encodeURIComponent(place)}`;
  const nominatimResponse = await fetch(nominatimUrl, { headers: { "User-Agent": "suixing-roadtrip-weather/1.0" } });
  if (!nominatimResponse.ok) return null;
  const result = (await nominatimResponse.json())?.[0];
  if (!result) return null;
  return { name: result.display_name?.split(",")[0] || place, latitude: Number(result.lat), longitude: Number(result.lon), geoSource: "OpenStreetMap" };
}
async function getWeather(uid, input) {
  if (!input.tripId || !/^\d{4}-\d{2}-\d{2}$/.test(String(input.date || ""))) fail(400, "缺少天气日期");
  const link = await membership(db, uid, input.tripId);
  const trip = await loadTrip(db, input.tripId);
  const date = input.date;
  if (date < String(trip.start).slice(0, 10) || date > String(trip.end).slice(0, 10)) fail(400, "天气日期不在旅行范围内");
  const hotel = (trip.hotels || []).find((entry) => entry.checkin <= date && date < entry.checkout);
  const event = (trip.events || []).filter((entry) => entry.date === date && (entry.address || "")).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))[0];
  const place = String(input.place || hotel?.city || event?.address || "").trim().slice(0, 120);
  if (!place) return { available: false, reason: "missing_place", date };
  const key = weatherKey(place, date);
  let cached;
  try { cached = await first(collections.weather.doc(key)); } catch { cached = undefined; }
  if (cached && cached.expiresAt > Date.now()) return cached.weather;
  const location = await geocodePlace(place);
  if (!location) return { available: false, reason: "place_not_found", date, place };
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(location.latitude)}&longitude=${encodeURIComponent(location.longitude)}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`;
  const forecastResponse = await fetch(forecastUrl);
  if (!forecastResponse.ok) fail(502, "天气服务暂时不可用");
  const forecast = await forecastResponse.json();
  const index = (forecast.daily?.time || []).indexOf(date);
  if (index < 0) return { available: false, reason: "out_of_range", date, place, location: location.name };
  const weather = {
    available: true, date, place, location: location.name || place,
    latitude: location.latitude, longitude: location.longitude, geoSource: location.geoSource || "Open-Meteo",
    condition: weatherCodeText(forecast.daily.weather_code[index]),
    code: forecast.daily.weather_code[index],
    high: forecast.daily.temperature_2m_max[index], low: forecast.daily.temperature_2m_min[index],
    rainProbability: forecast.daily.precipitation_probability_max?.[index] ?? null,
    current: forecast.current?.temperature_2m ?? null,
    wind: forecast.current?.wind_speed_10m ?? null,
    updatedAt: new Date().toISOString(), source: "Open-Meteo",
  };
  await collections.weather.doc(key).set({ id: key, place, date, weather, expiresAt: Date.now() + 3600000, updatedAt: Date.now() }).catch(() => {});
  return weather;
}
const first = async (reference) => cleanDocument((await reference.get()).data[0]);
const defaultProfile = { nickname: "旅行者", avatarId: "avatar-01", avatarData: "" };
const profileInput = (input = {}) => {
  const nickname = String(input.nickname || input.name || "").trim();
  const avatarId = avatarIds.includes(input.avatarId) ? input.avatarId : "";
  const avatarData = typeof input.avatarData === "string" && /^data:image\/(?:jpeg|png|webp);base64,/.test(input.avatarData) && input.avatarData.length <= 220000
    ? input.avatarData : "";
  if (!nickname || nickname.length > 40) fail(400, "昵称须为 1 至 40 个字符");
  if (!avatarId && !avatarData) fail(400, "请选择头像");
  return { nickname, avatarId: avatarData ? "" : avatarId, avatarData };
};
async function ensureAccount(principal) {
  let account = await first(collections.users.doc(principal.accountId));
  if (!account) {
    const now = Date.now();
    account = {
      id: principal.accountId,
      ...defaultProfile,
      provider: principal.provider,
      appId: principal.appId || "",
      openIdHash: principal.openId ? hash(principal.openId) : "",
      profileComplete: false,
      createdAt: now,
      updatedAt: now,
    };
    await collections.users.doc(principal.accountId).set(account);
  }
  return account;
}
async function hydrateTripProfiles(source, trip) {
  const links = (await source.collection("trip_members").where({ tripId: trip.id }).limit(100).get()).data || [];
  const accounts = await Promise.all(links.map((link) => link.accountId ? first(source.collection("user_accounts").doc(link.accountId)) : null));
  const profiles = new Map();
  links.forEach((link, index) => {
    if (accounts[index]) profiles.set(link.memberId, accounts[index]);
  });
  for (const member of trip.members || []) {
    const profile = profiles.get(member.id);
    if (!profile) continue;
    member.accountId = profile.id;
    member.name = profile.nickname;
    member.avatarId = profile.avatarId;
    member.avatarData = profile.avatarData || "";
  }
  return trip;
}
const authContext = async (context) => app.auth().getAuthContext(context);
const resolvePrincipal = async (context, event, { optional = false } = {}) => {
  const auth = await authContext(context);
  const loginType = String(auth?.loginType || auth?.login_type || "").toUpperCase();
  // wx.cloud.callFunction injects userInfo server-side. It is trusted runtime
  // context and cannot be supplied or forged by the mini-program payload.
  const miniUser = event?.userInfo || {};
  const openId = miniUser.openId || miniUser.openid || auth?.openId || auth?.openid;
  const appId = miniUser.appId || miniUser.appid || auth?.appId || auth?.appid || "";
  if (openId) {
    return {
      accountId: accountKeyForOpenId(appId, openId),
      provider: "wechat",
      openId,
      appId,
    };
  }
  if (auth?.uid && loginType !== "ANONYMOUS") return { accountId: auth.uid, provider: "custom" };
  if (optional) return null;
  fail(401, "请使用微信账号登录");
};
const requireUid = async (context) => {
  const auth = await app.auth().getAuthContext(context);
  if (!auth?.uid) fail(401, "请先完成匿名登录");
  return auth.uid;
};
const membership = async (source, accountId, tripId) => {
  const member = await first(source.collection("trip_members").where({ accountId, tripId }).limit(1));
  if (!member || member.accountId !== accountId || member.tripId !== tripId) fail(403, "无权访问此旅行");
  return member;
};
const inviteFor = async (source, tripId) => first(source.collection("trip_invites").where({ tripId, active: true }).limit(1));
const loadTrip = async (source, tripId) => {
  const trip = await first(source.collection("trips").where({ id: tripId }).limit(1));
  if (!trip) fail(404, "旅行不存在或已经删除");
  return trip;
};
const asView = async (source, trip, member) => {
  await hydrateTripProfiles(source, trip);
  const invite = member.memberId === trip.creator ? (await inviteFor(source, trip.id))?.token : undefined;
  return ticketView(viewTrip(trip, trip.members.find((entry) => entry.id === member.memberId), invite));
};
async function ticketView(view) {
  const fileIds = [...new Set((view.tickets || []).map((ticket) => ticket.fileId).filter(Boolean))];
  if (!fileIds.length) return view;
  const now = Date.now();
  const urls = new Map();
  const missing = [];
  for (const fileId of fileIds) {
    const cached = ticketUrlCache.get(fileId);
    if (cached?.expires > now) urls.set(fileId, cached.url);
    else missing.push(fileId);
  }
  for (let index = 0; index < missing.length; index += 50) {
    const result = await app.getTempFileURL({ fileList: missing.slice(index, index + 50).map((fileID) => ({ fileID, maxAge: 3600 })) });
    for (const entry of result.fileList || []) {
      const url = entry.tempFileURL || entry.download_url || "";
      urls.set(entry.fileID, url);
      if (url) ticketUrlCache.set(entry.fileID, { url, expires: now + 3000000 });
    }
  }
  return { ...view, tickets: view.tickets.map((ticket) => ({ ...ticket, imageUrl: urls.get(ticket.fileId) || "" })) };
}

async function listTrips(accountId) {
  const links = (await collections.members.where({ accountId }).limit(100).get()).data;
  const entries = await Promise.all(links.map(async (link) => ({ link, trip: await first(collections.trips.doc(link.tripId)) })));
  return entries.filter((entry) => entry.trip).map(({ link, trip }) => ({ id: trip.id, name: trip.name, start: trip.start, end: trip.end, archived: trip.archived, revision: trip.revision, canDelete: link.memberId === trip.creator }));
}

async function bootstrapAccount(principal) {
  const account = await ensureAccount(principal);
  return { account, trips: await listTrips(principal.accountId) };
}

async function updateAccountProfile(principal, input) {
  const current = await ensureAccount(principal);
  const profile = profileInput(input);
  const account = { ...current, ...profile, profileComplete: true, updatedAt: Date.now() };
  await collections.users.doc(principal.accountId).set(account);
  const links = (await collections.members.where({ accountId: principal.accountId }).limit(100).get()).data || [];
  for (const link of links) {
    await db.runTransaction(async (transaction) => {
      const trip = await loadTrip(transaction, link.tripId);
      const member = trip.members.find((entry) => entry.id === link.memberId);
      if (!member) return;
      const previousName = member.name;
      Object.assign(member, { accountId: principal.accountId, name: profile.nickname, avatarId: profile.avatarId, avatarData: profile.avatarData });
      for (const item of trip.items || []) {
        if (item.byMemberId === member.id || (!item.byMemberId && item.by === previousName)) item.by = profile.nickname;
        if (item.reviewByMemberId === member.id || (!item.reviewByMemberId && item.reviewBy === previousName)) item.reviewBy = profile.nickname;
      }
      trip.revision = Number(trip.revision || 0) + 1;
      trip.updatedAt = Date.now();
      await transaction.collection("trips").doc(trip.id).set(trip);
    });
  }
  return { account };
}

const webLoginPayload = (sessionId, secret) => `xiangye-login:${sessionId}:${secret}`;
async function createWebLoginSession() {
  const sessionId = randomBytes(16).toString("hex");
  const secret = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + 5 * 60 * 1000;
  await collections.webLogins.doc(sessionId).set({
    id: sessionId, secretHash: hash(secret), status: "pending", expiresAt, createdAt: Date.now(),
  });
  return { sessionId, secret, payload: webLoginPayload(sessionId, secret), expiresAt };
}

async function loadWebLogin(input) {
  const sessionId = String(input.sessionId || "");
  const secret = String(input.secret || "");
  if (!/^[a-f0-9]{32}$/.test(sessionId) || !/^[a-f0-9]{32}$/.test(secret)) fail(400, "登录码无效");
  const session = await first(collections.webLogins.doc(sessionId));
  if (!session || session.secretHash !== hash(secret) || session.expiresAt <= Date.now()) fail(410, "登录码已过期");
  return session;
}

async function confirmWebLogin(principal, input) {
  const session = await loadWebLogin(input);
  if (session.status !== "pending") fail(409, "登录码已被处理");
  await ensureAccount(principal);
  await collections.webLogins.doc(session.id).update({
    status: "confirmed", accountId: principal.accountId, confirmedAt: Date.now(),
  });
  return { confirmed: true };
}

async function pollWebLogin(input) {
  const session = await loadWebLogin(input);
  return { status: session.status, expiresAt: session.expiresAt };
}

async function exchangeWebLogin(input) {
  const session = await loadWebLogin(input);
  if (session.status !== "confirmed" || !session.accountId) fail(409, "请先在小程序确认登录");
  const claimed = await db.runTransaction(async (transaction) => {
    const current = await first(transaction.collection("web_login_sessions").doc(session.id));
    if (!current || current.status !== "confirmed" || current.expiresAt <= Date.now()) fail(409, "登录码已被使用");
    await transaction.collection("web_login_sessions").doc(session.id).update({ status: "used", usedAt: Date.now() });
    return current.accountId;
  });
  const ticket = await app.auth().createTicket(claimed);
  return { ticket };
}

async function resolveLocation(accountId, input) {
  await membership(db, accountId, input.tripId);
  const place = String(input.place || "").trim().slice(0, 120);
  if (!place) fail(400, "缺少地址");
  const location = await geocodePlace(place);
  if (!location) fail(404, "没有找到这个地址");
  return { name: location.name || place, address: place, latitude: Number(location.latitude), longitude: Number(location.longitude) };
}

async function create(accountId, input) {
  const account = await first(collections.users.doc(accountId));
  if (!account?.profileComplete) fail(400, "请先设置昵称和头像");
  const result = await db.runTransaction(async (transaction) => {
    let reuseTrip, reuseMember;
    if (input.reuse) {
      reuseMember = await membership(transaction, accountId, input.reuse);
      reuseTrip = await loadTrip(transaction, input.reuse);
      reuseMember = reuseTrip.members.find((entry) => entry.id === reuseMember.memberId);
    }
    const created = createTrip({ ...input, accountId, nickname: account.nickname, avatarId: account.avatarId, avatarData: account.avatarData }, reuseTrip, reuseMember);
    const invite = id();
    await transaction.collection("trips").doc(created.trip.id).set(created.trip);
    if (input.reuse) {
      const sourceExpenses = (await transaction.collection("trip_expenses").where({ tripId: input.reuse }).limit(1000).get()).data || [];
      for (const source of sourceExpenses) {
        const copied = { ...cleanDocument(source), id: id(), tripId: created.trip.id, createdByMemberId: source.createdByMemberId === reuseMember.id ? created.member.id : source.createdByMemberId, payerMemberId: source.payerMemberId === reuseMember.id ? created.member.id : source.payerMemberId, participants: (source.participants || []).map((part) => ({ ...part, memberId: part.memberId === reuseMember.id ? created.member.id : part.memberId })) };
        await transaction.collection("trip_expenses").doc(copied.id).set(copied);
      }
      const sourceSettings = await first(transaction.collection("trip_expense_settings").where({ tripId: input.reuse }).limit(1));
      if (sourceSettings) await transaction.collection("trip_expense_settings").doc(created.trip.id).set({ ...sourceSettings, tripId: created.trip.id, updatedAt: Date.now() });
      const sourceSettlements = (await transaction.collection("trip_settlements").where({ tripId: input.reuse }).limit(1000).get()).data || [];
      for (const source of sourceSettlements) { const settlementId = id(); await transaction.collection("trip_settlements").doc(settlementId).set({ ...cleanDocument(source), id: settlementId, tripId: created.trip.id, fromMemberId: source.fromMemberId === reuseMember.id ? created.member.id : source.fromMemberId, toMemberId: source.toMemberId === reuseMember.id ? created.member.id : source.toMemberId, createdByMemberId: source.createdByMemberId === reuseMember.id ? created.member.id : source.createdByMemberId }); }
    }
    await transaction.collection("trip_members").doc(memberKey(accountId, created.trip.id)).set({
      accountId, tripId: created.trip.id, memberId: created.member.id, createdAt: Date.now(),
    });
    await transaction.collection("trip_invites").doc(invite).set({
      token: invite, tripId: created.trip.id, active: true, createdAt: Date.now(),
    });
    return { trip: created.trip, memberId: created.member.id, invite };
  });
  const member = result.trip.members.find((entry) => entry.id === result.memberId);
  return { trip: await ticketView(viewTrip(result.trip, member, result.invite)) };
}

async function clone(accountId, input) {
  if (!input.tripId) fail(400, "请选择要复制的旅行");
  const account = await first(collections.users.doc(accountId));
  if (!account?.profileComplete) fail(400, "请先设置昵称和头像");
  const link = await membership(db, accountId, input.tripId);
  const source = await loadTrip(db, input.tripId);
  const sourceMember = source.members.find((entry) => entry.id === link.memberId);
  if (!sourceMember) fail(403, "成员身份已经失效");
  const created = duplicateTrip(source, sourceMember, { ...account, accountId }, input.name);
  const copiedFiles = [];
  let committed = false;
  try {
    for (const ticket of created.trip.tickets) {
      if (!ticket.fileId) continue;
      const downloaded = await app.downloadFile({ fileID: ticket.fileId });
      if (!Buffer.isBuffer(downloaded.fileContent)) fail(502, "票据图片复制失败，请稍后重试");
      const extension = ticket.mime === "image/png" ? "png" : ticket.mime === "image/webp" ? "webp" : "jpg";
      const uploaded = await app.uploadFile({
        cloudPath: `tickets/${created.trip.id}/${ticket.id}.${extension}`,
        fileContent: downloaded.fileContent,
      });
      if (!uploaded.fileID) fail(502, "票据图片复制失败，请稍后重试");
      copiedFiles.push(uploaded.fileID);
      ticket.fileId = uploaded.fileID;
    }
    const invite = id();
    await db.runTransaction(async (transaction) => {
      await membership(transaction, accountId, input.tripId);
      const current = await loadTrip(transaction, input.tripId);
      if (current.revision !== source.revision) fail(409, "原旅行刚刚更新，请重新创建副本");
      await transaction.collection("trips").doc(created.trip.id).set(created.trip);
      await transaction.collection("trip_members").doc(memberKey(accountId, created.trip.id)).set({
        accountId, tripId: created.trip.id, memberId: created.member.id, createdAt: Date.now(),
      });
      await transaction.collection("trip_invites").doc(invite).set({
        token: invite, tripId: created.trip.id, active: true, createdAt: Date.now(),
      });
    });
    committed = true;
    return { trip: await ticketView(viewTrip(created.trip, created.member, invite)) };
  } catch (error) {
    if (!committed)
      for (let index = 0; index < copiedFiles.length; index += 50)
        await app.deleteFile({ fileList: copiedFiles.slice(index, index + 50) }).catch(() => {});
    throw error;
  }
}

async function join(accountId, input) {
  const account = await first(collections.users.doc(accountId));
  if (!account?.profileComplete) fail(400, "请先设置昵称和头像");
  if (typeof input.invite !== "string" || !/^[a-f0-9]{48}$/.test(input.invite)) fail(404, "邀请已失效或旅行已归档");
  const result = await db.runTransaction(async (transaction) => {
    const invite = await first(transaction.collection("trip_invites").where({ token: input.invite, active: true }).limit(1));
    if (!invite?.active) fail(404, "邀请已失效或旅行已归档");
    const trip = await loadTrip(transaction, invite.tripId);
    if (trip.archived) fail(404, "邀请已失效或旅行已归档");
    let link = await first(
      transaction
        .collection("trip_members")
        .where({ accountId, tripId: trip.id })
        .limit(1),
    );
    if (!link) {
      const member = addMember(trip, account.nickname, account.avatarId, account.avatarData, accountId);
      link = { accountId, tripId: trip.id, memberId: member.id, createdAt: Date.now() };
      await transaction.collection("trip_members").doc(memberKey(accountId, trip.id)).set(link);
      await transaction.collection("trips").doc(trip.id).set(trip);
    }
    return { trip, memberId: link.memberId };
  });
  const member = result.trip.members.find((entry) => entry.id === result.memberId);
  return { trip: await ticketView(viewTrip(result.trip, member, input.invite)) };
}

async function previewInvite(input) {
  if (typeof input.invite !== "string" || !/^[a-f0-9]{48}$/.test(input.invite)) fail(404, "邀请已失效或旅行已归档");
  const invite = await first(collections.invites.where({ token: input.invite, active: true }).limit(1));
  if (!invite?.active) fail(404, "邀请已失效或旅行已归档");
  const trip = normalizeMembers(await loadTrip(db, invite.tripId));
  if (trip.archived) fail(404, "邀请已失效或旅行已归档");
  const usedAvatarIds = [...new Set(trip.members.map((member) => member.avatarId))];
  return { tripName: trip.name, usedAvatarIds, allowDuplicates: avatarIds.every((id) => usedAvatarIds.includes(id)) };
}

async function get(accountId, input) {
  const link = await membership(db, accountId, input.tripId);
  const trip = await loadTrip(db, input.tripId);
  const view = await asView(db, trip, link);
  view.expenseSummary = await getExpenseSummaryData(db, trip, link.memberId);
  return view;
}

async function expenseSettings(tripId, source = db) {
  const record = await first(source.collection("trip_expense_settings").where({ tripId }).limit(1));
  return record || { tripId, baseCurrency: "CNY", budgetMinor: null, expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES], updatedAt: Date.now() };
}
async function expenseDocs(tripId, source = db) {
  const result = await source.collection("trip_expenses").where({ tripId }).limit(1000).get();
  return (result.data || []).map(cleanDocument).sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.createdAt || 0) - Number(b.createdAt || 0));
}
async function settlementDocs(tripId, source = db) {
  const result = await source.collection("trip_settlements").where({ tripId }).limit(1000).get();
  return (result.data || []).map(cleanDocument).sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.createdAt || 0) - Number(b.createdAt || 0));
}
async function getExpenseSummaryData(source, trip, memberId) {
  const settings = await expenseSettings(trip.id, source);
  const expenses = await expenseDocs(trip.id, source);
  const settlements = await settlementDocs(trip.id, source);
  const summary = buildExpenseSummary(expenses, settlements, trip.members || [], settings);
  summary.me = summary.balances.find((entry) => entry.memberId === memberId) || null;
  summary.plan = buildSettlementPlan(summary);
  return summary;
}
async function listExpenses(accountId, input) {
  const link = await membership(db, accountId, input.tripId);
  const trip = await loadTrip(db, input.tripId);
  const [expenses, settlements, settings] = await Promise.all([expenseDocs(trip.id), settlementDocs(trip.id), expenseSettings(trip.id)]);
  const summary = buildExpenseSummary(expenses, settlements, trip.members || [], settings);
  summary.me = summary.balances.find((entry) => entry.memberId === link.memberId) || null;
  summary.plan = buildSettlementPlan(summary);
  return { expenses, settlements, settings, summary, members: trip.members };
}
async function saveExpense(accountId, input) {
  const result = await db.runTransaction(async (transaction) => {
    const link = await membership(transaction, accountId, input.tripId);
    const trip = await loadTrip(transaction, input.tripId);
    if (trip.archived) fail(409, "旅行已归档，内容仅供查看");
    if (input.revision != null && Number(input.revision) !== Number(trip.revision)) fail(409, "同行人刚刚更新了内容，请查看最新状态后重试");
    const member = trip.members.find((entry) => entry.id === link.memberId);
    let existing;
    if (input.id) existing = await first(transaction.collection("trip_expenses").where({ id: input.id, tripId: trip.id }).limit(1));
    if (existing && existing.createdByMemberId !== member.id && member.id !== trip.creator) fail(403, "只能编辑自己创建的费用");
    const expense = normalizeExpense(input, trip, trip.members, member.id, existing);
    await transaction.collection("trip_expenses").doc(expense.id).set(expense);
    trip.revision = Number(trip.revision || 0) + 1; trip.updatedAt = Date.now();
    await transaction.collection("trips").doc(trip.id).set(trip);
    return { trip, memberId: member.id, expense };
  });
  return { expense: result.expense, summary: await getExpenseSummaryData(db, result.trip, result.memberId), revision: result.trip.revision };
}
async function deleteExpense(accountId, input) {
  const result = await db.runTransaction(async (transaction) => {
    const link = await membership(transaction, accountId, input.tripId); const trip = await loadTrip(transaction, input.tripId);
    if (trip.archived) fail(409, "旅行已归档，内容仅供查看");
    if (input.revision != null && Number(input.revision) !== Number(trip.revision)) fail(409, "同行人刚刚更新了内容，请查看最新状态后重试");
    const member = trip.members.find((entry) => entry.id === link.memberId); const expense = await first(transaction.collection("trip_expenses").where({ id: input.id, tripId: trip.id }).limit(1));
    if (!expense) fail(404, "费用不存在");
    if (expense.createdByMemberId !== member.id && member.id !== trip.creator) fail(403, "只能删除自己创建的费用");
    await transaction.collection("trip_expenses").doc(expense.id).delete(); trip.revision = Number(trip.revision || 0) + 1; trip.updatedAt = Date.now(); await transaction.collection("trips").doc(trip.id).set(trip);
    return { trip, memberId: member.id, fileId: expense.receiptFileId };
  });
  if (result.fileId) await app.deleteFile({ fileList: [result.fileId] }).catch(() => {});
  return { summary: await getExpenseSummaryData(db, result.trip, result.memberId), revision: result.trip.revision };
}
async function saveSettlement(accountId, input) {
  const result = await db.runTransaction(async (transaction) => {
    const link = await membership(transaction, accountId, input.tripId); const trip = await loadTrip(transaction, input.tripId);
    if (trip.archived) fail(409, "旅行已归档，内容仅供查看");
    if (input.revision != null && Number(input.revision) !== Number(trip.revision)) fail(409, "同行人刚刚更新了内容，请查看最新状态后重试");
    const member = trip.members.find((entry) => entry.id === link.memberId); const settings = await expenseSettings(trip.id, transaction);
    if (!trip.members.some((entry) => entry.id === input.fromMemberId) || !trip.members.some((entry) => entry.id === input.toMemberId) || input.fromMemberId === input.toMemberId) fail(400, "结算成员无效");
    const amountMinor = Number(input.amountMinor); if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) fail(400, "结算金额必须大于 0");
    let existing = input.id ? await first(transaction.collection("trip_settlements").where({ id: input.id, tripId: trip.id }).limit(1)) : null;
    if (existing && existing.createdByMemberId !== member.id && member.id !== trip.creator) fail(403, "无权修改此结算记录");
    const settlementDate = String(input.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(settlementDate) || settlementDate < String(trip.start).slice(0, 10) || settlementDate > String(trip.end).slice(0, 10)) fail(400, "结算日期必须在旅行日期范围内");
    const settlement = { ...existing, id: existing?.id || input.id || id(), tripId: trip.id, date: settlementDate, fromMemberId: input.fromMemberId, toMemberId: input.toMemberId, amountMinor, currency: String(input.currency || settings.baseCurrency || "CNY").toUpperCase(), note: String(input.note || "").trim().slice(0, 500), createdByMemberId: existing?.createdByMemberId || member.id, createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now() };
    await transaction.collection("trip_settlements").doc(settlement.id).set(settlement); trip.revision = Number(trip.revision || 0) + 1; trip.updatedAt = Date.now(); await transaction.collection("trips").doc(trip.id).set(trip); return { trip, memberId: member.id };
  });
  return { summary: await getExpenseSummaryData(db, result.trip, result.memberId), revision: result.trip.revision };
}
async function deleteSettlement(accountId, input) {
  const result = await db.runTransaction(async (transaction) => {
    const link = await membership(transaction, accountId, input.tripId); const trip = await loadTrip(transaction, input.tripId); const member = trip.members.find((entry) => entry.id === link.memberId); const settlement = await first(transaction.collection("trip_settlements").where({ id: input.id, tripId: trip.id }).limit(1));
    if (!settlement) fail(404, "结算记录不存在"); if (settlement.createdByMemberId !== member.id && member.id !== trip.creator) fail(403, "无权删除此结算记录");
    await transaction.collection("trip_settlements").doc(settlement.id).delete(); trip.revision = Number(trip.revision || 0) + 1; trip.updatedAt = Date.now(); await transaction.collection("trips").doc(trip.id).set(trip); return { trip, memberId: member.id };
  });
  return { summary: await getExpenseSummaryData(db, result.trip, result.memberId), revision: result.trip.revision };
}
async function updateExpenseSettings(accountId, input) {
  const result = await db.runTransaction(async (transaction) => {
    const link = await membership(transaction, accountId, input.tripId); const trip = await loadTrip(transaction, input.tripId); if (link.memberId !== trip.creator) fail(403, "只有创建者可以管理记账设置");
    const budgetMinor = input.budgetMinor == null || input.budgetMinor === "" ? null : Number(input.budgetMinor); if (budgetMinor != null && (!Number.isSafeInteger(budgetMinor) || budgetMinor < 0)) fail(400, "预算金额无效");
    const categories = [...new Set((Array.isArray(input.expenseCategories) ? input.expenseCategories : DEFAULT_EXPENSE_CATEGORIES).map((value) => String(value).trim().slice(0, 40)).filter(Boolean))];
    const settings = { tripId: trip.id, baseCurrency: String(input.baseCurrency || "CNY").toUpperCase(), budgetMinor, expenseCategories: categories.length ? categories : [...DEFAULT_EXPENSE_CATEGORIES], updatedAt: Date.now() };
    await transaction.collection("trip_expense_settings").doc(trip.id).set(settings); trip.revision = Number(trip.revision || 0) + 1; trip.updatedAt = Date.now(); await transaction.collection("trips").doc(trip.id).set(trip); return { trip, memberId: link.memberId, settings };
  });
  return { settings: result.settings, summary: await getExpenseSummaryData(db, result.trip, result.memberId), revision: result.trip.revision };
}
async function uploadExpenseReceipt(accountId, input) {
  if (!input.tripId || typeof input.imageBase64 !== "string" || input.imageBase64.length > 4200000) fail(400, "图片过大，请选择更小的图片");
  if (!/^image\/(jpeg|png|webp)$/.test(input.mime || "")) fail(400, "仅支持 JPG、PNG 或 WebP 图片");
  await membership(db, accountId, input.tripId); const extension = input.mime === "image/png" ? "png" : input.mime === "image/webp" ? "webp" : "jpg"; const fileContent = Buffer.from(input.imageBase64, "base64"); if (!fileContent.length || fileContent.length > 3000000) fail(400, "图片过大，请选择更小的图片");
  const uploaded = await app.uploadFile({ cloudPath: `expenses/${input.tripId}/${id()}.${extension}`, fileContent }); return { fileId: uploaded.fileID };
}

async function recover(uid, input) {
  if (typeof input.code !== "string" || !/^[a-f0-9]{48}$/.test(input.code)) fail(404, "恢复链接无效或已过期");
  const result = await db.runTransaction(async (transaction) => {
    const recovery = await first(transaction.collection("recovery_codes").where({ code: input.code }).limit(1));
    if (!recovery || recovery.expires <= Date.now()) fail(404, "恢复链接无效或已过期");
    const trip = await loadTrip(transaction, recovery.tripId);
    const member = trip.members.find((entry) => entry.id === recovery.memberId);
    if (!member) fail(404, "成员不存在");
    await transaction.collection("trip_members").where({ tripId: trip.id, memberId: member.id }).remove();
    await transaction.collection("trip_members").doc(memberKey(uid, trip.id)).set({
      uid, tripId: trip.id, memberId: member.id, createdAt: Date.now(),
    });
    await transaction.collection("recovery_codes").doc(input.code).delete();
    const invite = member.id === trip.creator ? (await inviteFor(transaction, trip.id))?.token : undefined;
    return { trip, memberId: member.id, invite };
  });
  const member = result.trip.members.find((entry) => entry.id === result.memberId);
  return { trip: await ticketView(viewTrip(result.trip, member, result.invite)) };
}

async function recover(uid, input) {
  if (typeof input.code !== "string" || !/^[a-f0-9]{48}$/.test(input.code)) fail(404, "恢复链接无效或已过期");
  const result = await db.runTransaction(async (transaction) => {
    const recovery = await first(transaction.collection("recovery_codes").where({ code: input.code }).limit(1));
    if (!recovery || recovery.expires <= Date.now()) fail(404, "恢复链接无效或已过期");
    const trip = await loadTrip(transaction, recovery.tripId);
    const member = trip.members.find((entry) => entry.id === recovery.memberId);
    if (!member) fail(404, "成员不存在");
    await transaction.collection("trip_members").where({ tripId: trip.id, memberId: member.id }).remove();
    await transaction.collection("trip_members").doc(memberKey(uid, trip.id)).set({
      uid, tripId: trip.id, memberId: member.id, createdAt: Date.now(),
    });
    await transaction.collection("recovery_codes").doc(input.code).delete();
    const invite = member.id === trip.creator ? (await inviteFor(transaction, trip.id))?.token : undefined;
    return { trip, memberId: member.id, invite };
  });
  const member = result.trip.members.find((entry) => entry.id === result.memberId);
  return { trip: await ticketView(viewTrip(result.trip, member, result.invite)) };
}

async function uploadTicket(accountId, input) {
  if (!input.tripId) fail(400, "缺少旅行标识");
  if (typeof input.imageBase64 !== "string" || input.imageBase64.length > 4200000) fail(400, "图片过大，请选择更小的图片");
  if (!/^image\/(jpeg|png|webp)$/.test(input.mime || "")) fail(400, "仅支持 JPG、PNG 或 WebP 图片");
  await membership(db, accountId, input.tripId);
  const extension = input.mime === "image/png" ? "png" : input.mime === "image/webp" ? "webp" : "jpg";
  const fileContent = Buffer.from(input.imageBase64, "base64");
  if (!fileContent.length || fileContent.length > 3000000) fail(400, "图片过大，请选择更小的图片");
  const cloudPath = `tickets/${input.tripId}/${id()}.${extension}`;
  const uploaded = await app.uploadFile({ cloudPath, fileContent });
  try {
    return await mutate(accountId, { ...input, action: "ticket", fileId: uploaded.fileID, imageBase64: undefined });
  } catch (error) {
    await app.deleteFile({ fileList: [uploaded.fileID] }).catch(() => {});
    throw error;
  }
}

async function mutate(accountId, input) {
  if (!input.tripId) fail(400, "缺少旅行标识");
  const result = await db.runTransaction(async (transaction) => {
    const link = await membership(transaction, accountId, input.tripId);
    const trip = await loadTrip(transaction, input.tripId);
    const member = trip.members.find((entry) => entry.id === link.memberId);
    if (!member) fail(403, "成员身份已经失效");
    const challengeKey = memberKey(member.id, trip.id);
    if (input.action === "prepareDeletion") {
      if (member.id !== trip.creator) fail(403, "只有创建者可以操作");
      if (input.revision !== trip.revision) fail(409, "同行人刚刚更新了内容，请查看最新状态后重试");
      const challenge = id();
      await transaction.collection("delete_challenges").doc(challengeKey).set({
        tripId: trip.id, memberId: member.id, challenge, expires: Date.now() + 300000,
      });
      return { direct: { challenge } };
    }
    if (input.action === "deleteTrip") {
      if (member.id !== trip.creator) fail(403, "只有创建者可以操作");
      const pending = await first(transaction.collection("delete_challenges").where({ tripId: trip.id, memberId: member.id }).limit(1));
      if (!pending || pending.expires <= Date.now() || pending.challenge !== input.challenge)
        fail(400, "删除确认已失效，请重新操作");
      const ticketFiles = (trip.tickets || []).map((ticket) => ticket.fileId).filter(Boolean);
      await transaction.collection("trip_members").where({ tripId: trip.id }).remove();
      await transaction.collection("trip_invites").where({ tripId: trip.id }).remove();
      await transaction.collection("recovery_codes").where({ tripId: trip.id }).remove();
      await transaction.collection("delete_challenges").where({ tripId: trip.id }).remove();
      await transaction.collection("trips").doc(trip.id).delete();
      return { direct: { deleted: trip.id }, filesToDelete: ticketFiles };
    }
    if (input.action === "exportTrip") {
      if (member.id !== trip.creator) fail(403, "只有创建者可以操作");
      return { direct: { exportData: { format: "suixing-cloudbase-v1", exportedAt: new Date().toISOString(), trip } } };
    }
    const effects = mutateTrip(trip, member, input);
    const extra = {};
    if (effects.rotateInvite) {
      await transaction.collection("trip_invites").where({ tripId: trip.id }).remove();
      const token = id();
      await transaction.collection("trip_invites").doc(token).set({ token, tripId: trip.id, active: true, createdAt: Date.now() });
      extra.invite = token;
    }
    if (effects.recoveryMember) {
      await transaction.collection("recovery_codes").where({ tripId: trip.id, memberId: effects.recoveryMember }).remove();
      const code = id();
      await transaction.collection("recovery_codes").doc(code).set({
        code, tripId: trip.id, memberId: effects.recoveryMember, expires: Date.now() + 86400000,
      });
      extra.code = code;
    }
    if (effects.removedMember) {
      await transaction.collection("trip_members").where({ tripId: trip.id, memberId: effects.removedMember }).remove();
      await transaction.collection("recovery_codes").where({ tripId: trip.id, memberId: effects.removedMember }).remove();
    }
    await transaction.collection("trips").doc(trip.id).set(trip);
    const invite = member.id === trip.creator ? (extra.invite || (await inviteFor(transaction, trip.id))?.token) : undefined;
    return {
      trip,
      memberId: member.id,
      invite,
      extra,
      filesToDelete: effects.deletedFileId ? [effects.deletedFileId] : [],
    };
  });
  if (result.filesToDelete?.length) await app.deleteFile({ fileList: result.filesToDelete }).catch(() => {});
  if (result.direct) return result.direct;
  const member = result.trip.members.find((entry) => entry.id === result.memberId);
  return { trip: await ticketView(viewTrip(result.trip, member, result.invite)), ...result.extra };
}

exports.main = async (event, context) => {
  try {
    await ensureCollections();
    const operation = event?.operation;
    const data = event?.data || {};
    if (operation === "createWebLoginSession") return { ok: true, data: await createWebLoginSession() };
    if (operation === "pollWebLogin") return { ok: true, data: await pollWebLogin(data) };
    if (operation === "exchangeWebLogin") return { ok: true, data: await exchangeWebLogin(data) };
    const principal = await resolvePrincipal(context, event);
    const accountId = principal.accountId;
    const result = operation === "bootstrapAccount" ? await bootstrapAccount(principal)
      : operation === "updateAccountProfile" ? await updateAccountProfile(principal, data)
      : operation === "confirmWebLogin" ? await confirmWebLogin(principal, data)
      : operation === "listChecklistTemplates" ? checklistTemplates
      : operation === "listTrips" ? await listTrips(accountId)
      : operation === "createTrip" ? await create(accountId, data)
      : operation === "cloneTrip" ? await clone(accountId, data)
      : operation === "joinTrip" ? await join(accountId, data)
      : operation === "previewInvite" ? await previewInvite(data)
      : operation === "uploadTicket" ? await uploadTicket(accountId, data)
      : operation === "listExpenses" ? await listExpenses(accountId, data)
      : operation === "saveExpense" ? await saveExpense(accountId, data)
      : operation === "deleteExpense" ? await deleteExpense(accountId, data)
      : operation === "saveSettlement" ? await saveSettlement(accountId, data)
      : operation === "deleteSettlement" ? await deleteSettlement(accountId, data)
      : operation === "updateExpenseSettings" ? await updateExpenseSettings(accountId, data)
      : operation === "uploadExpenseReceipt" ? await uploadExpenseReceipt(accountId, data)
      : operation === "getExpenseSummary" ? await (async () => { const link = await membership(db, accountId, data.tripId); const trip = await loadTrip(db, data.tripId); return getExpenseSummaryData(db, trip, link.memberId); })()
      : operation === "getWeather" ? await getWeather(accountId, data)
      : operation === "resolveLocation" ? await resolveLocation(accountId, data)
      : operation === "getTrip" ? await get(accountId, data)
      : operation === "mutateTrip" ? await mutate(accountId, data)
      : fail(404, "接口不存在");
    return { ok: true, data: result };
  } catch (error) {
    if (!error.status) console.error(error);
    return { ok: false, status: error.status || 500, error: error.status ? error.message : "保存失败，请稍后重试" };
  }
};
