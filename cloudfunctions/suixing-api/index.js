const cloudbase = require("@cloudbase/node-sdk");
const { createHash } = require("node:crypto");
const { id, fail, createTrip, addMember, viewTrip, mutateTrip } = require("./domain.cjs");
const { avatarIds, normalizeMembers } = require("./avatars.cjs");

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
};
let collectionSetup;
async function ensureCollections() {
  if (!collectionSetup) collectionSetup = Promise.all(
    ["trips", "trip_members", "trip_invites", "recovery_codes", "delete_challenges", "weather_cache"].map(async (name) => {
      try { await db.createCollection(name); }
      catch (error) {
        if (!/exist|already|重复|存在/i.test(String(error?.message || error))) throw error;
      }
    }),
  ).catch((error) => { collectionSetup = null; throw error; });
  return collectionSetup;
}
const memberKey = (uid, tripId) => createHash("sha256").update(`${uid}:${tripId}`).digest("hex");
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
const requireUid = async (context) => {
  const auth = await app.auth().getAuthContext(context);
  if (!auth?.uid) fail(401, "请先完成匿名登录");
  return auth.uid;
};
const membership = async (source, uid, tripId) => {
  const member = await first(source.collection("trip_members").where({ uid, tripId }).limit(1));
  if (!member || member.uid !== uid || member.tripId !== tripId) fail(403, "无权访问此旅行");
  return member;
};
const inviteFor = async (source, tripId) => first(source.collection("trip_invites").where({ tripId, active: true }).limit(1));
const loadTrip = async (source, tripId) => {
  const trip = await first(source.collection("trips").where({ id: tripId }).limit(1));
  if (!trip) fail(404, "旅行不存在或已经删除");
  return trip;
};
const asView = async (source, trip, member) => {
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

async function listTrips(uid) {
  const links = (await collections.members.where({ uid }).limit(100).get()).data;
  const trips = await Promise.all(links.map((link) => first(collections.trips.doc(link.tripId))));
  return trips.filter(Boolean).map((trip) => ({ id: trip.id, name: trip.name, start: trip.start, end: trip.end, archived: trip.archived }));
}

async function create(uid, input) {
  const result = await db.runTransaction(async (transaction) => {
    let reuseTrip, reuseMember;
    if (input.reuse) {
      reuseMember = await membership(transaction, uid, input.reuse);
      reuseTrip = await loadTrip(transaction, input.reuse);
      reuseMember = reuseTrip.members.find((entry) => entry.id === reuseMember.memberId);
    }
    const created = createTrip(input, reuseTrip, reuseMember);
    const invite = id();
    await transaction.collection("trips").doc(created.trip.id).set(created.trip);
    await transaction.collection("trip_members").doc(memberKey(uid, created.trip.id)).set({
      uid, tripId: created.trip.id, memberId: created.member.id, createdAt: Date.now(),
    });
    await transaction.collection("trip_invites").doc(invite).set({
      token: invite, tripId: created.trip.id, active: true, createdAt: Date.now(),
    });
    return { trip: created.trip, memberId: created.member.id, invite };
  });
  const member = result.trip.members.find((entry) => entry.id === result.memberId);
  return { trip: await ticketView(viewTrip(result.trip, member, result.invite)) };
}

async function join(uid, input) {
  if (typeof input.invite !== "string" || !/^[a-f0-9]{48}$/.test(input.invite)) fail(404, "邀请已失效或旅行已归档");
  const result = await db.runTransaction(async (transaction) => {
    const invite = await first(transaction.collection("trip_invites").where({ token: input.invite, active: true }).limit(1));
    if (!invite?.active) fail(404, "邀请已失效或旅行已归档");
    const trip = await loadTrip(transaction, invite.tripId);
    if (trip.archived) fail(404, "邀请已失效或旅行已归档");
    let link = await first(
      transaction
        .collection("trip_members")
        .where({ uid, tripId: trip.id })
        .limit(1),
    );
    if (!link) {
      const member = addMember(trip, input.nickname, input.avatarId);
      link = { uid, tripId: trip.id, memberId: member.id, createdAt: Date.now() };
      await transaction.collection("trip_members").doc(memberKey(uid, trip.id)).set(link);
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

async function get(uid, input) {
  const link = await membership(db, uid, input.tripId);
  const trip = await loadTrip(db, input.tripId);
  return asView(db, trip, link);
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

async function uploadTicket(uid, input) {
  if (!input.tripId) fail(400, "缺少旅行标识");
  if (typeof input.imageBase64 !== "string" || input.imageBase64.length > 4200000) fail(400, "图片过大，请选择更小的图片");
  if (!/^image\/(jpeg|png|webp)$/.test(input.mime || "")) fail(400, "仅支持 JPG、PNG 或 WebP 图片");
  await membership(db, uid, input.tripId);
  const extension = input.mime === "image/png" ? "png" : input.mime === "image/webp" ? "webp" : "jpg";
  const fileContent = Buffer.from(input.imageBase64, "base64");
  if (!fileContent.length || fileContent.length > 3000000) fail(400, "图片过大，请选择更小的图片");
  const cloudPath = `tickets/${input.tripId}/${id()}.${extension}`;
  const uploaded = await app.uploadFile({ cloudPath, fileContent });
  try {
    return await mutate(uid, { ...input, action: "ticket", fileId: uploaded.fileID, imageBase64: undefined });
  } catch (error) {
    await app.deleteFile({ fileList: [uploaded.fileID] }).catch(() => {});
    throw error;
  }
}

async function mutate(uid, input) {
  if (!input.tripId) fail(400, "缺少旅行标识");
  const result = await db.runTransaction(async (transaction) => {
    const link = await membership(transaction, uid, input.tripId);
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
      if (!pending || pending.expires <= Date.now() || pending.challenge !== input.challenge || input.confirmName !== trip.name)
        fail(400, "请重新发起删除，并输入正确的旅行名称进行二次确认");
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
    const uid = await requireUid(context);
    const operation = event?.operation;
    const data = event?.data || {};
    const result = operation === "listTrips" ? await listTrips(uid)
      : operation === "createTrip" ? await create(uid, data)
      : operation === "joinTrip" ? await join(uid, data)
      : operation === "previewInvite" ? await previewInvite(data)
      : operation === "uploadTicket" ? await uploadTicket(uid, data)
      : operation === "recoverMember" ? await recover(uid, data)
      : operation === "getWeather" ? await getWeather(uid, data)
      : operation === "getTrip" ? await get(uid, data)
      : operation === "mutateTrip" ? await mutate(uid, data)
      : fail(404, "接口不存在");
    return { ok: true, data: result };
  } catch (error) {
    if (!error.status) console.error(error);
    return { ok: false, status: error.status || 500, error: error.status ? error.message : "保存失败，请稍后重试" };
  }
};
