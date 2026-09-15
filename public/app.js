import cloudbase from "@cloudbase/js-sdk";
import { calendarEvent, calendarFile } from "./calendar.js";
import { isWeatherCacheFresh, stampWeatherResult } from "./weather-cache.js";
import templatePackage from "../shared/templates.cjs";
import schedulePackage from "../shared/schedule.cjs";
import avatarPackage from "../shared/avatars.cjs";
import tripTypePackage from "../shared/trip-types.cjs";

const { checklistTemplates } = templatePackage;
const { schedulePeriods, splitEventByPeriods } = schedulePackage;
const { avatars } = avatarPackage;
const { tripTypes } = tripTypePackage;

const cloud = cloudbase.init({ env: "zdata-d4g6l75lwebf2dbb0" });
const auth = cloud.auth({ persistence: "local" });
let authReady;
async function ensureAuth() {
  if (!authReady) authReady = (async () => {
    const state = await auth.getLoginState();
    if (!state) {
      const result = await auth.signInAnonymously();
      if (result?.error) throw Error(result.error.message || "匿名登录失败");
    }
  })().catch((error) => { authReady = null; throw error; });
  return authReady;
}
const $ = (s) => document.querySelector(s),
  app = $("#app"),
  modal = $("#modal"),
  picker = $("#picker");
const paths = {
  road: "M4 20 9 4m6 0 5 16M12 5v3m0 4v3m0 4v1",
  sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  map: "m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5m6-2v16m6-14v16",
  check: "m5 12 4 4L19 6",
  list: "M9 6h12M9 12h12M9 18h12M3 6h1m-1 6h1m-1 6h1",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m12-18a4 4 0 0 1 0 8m8 10v-2a4 4 0 0 0-3-3.9M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plus: "M12 5v14M5 12h14",
  hotel: "M3 21V3h12v18M15 9h6v12M7 7h4M7 11h4M7 15h4M8 21v-3h2v3",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  close: "m6 6 12 12M6 18 18 6",
  edit: "m16 3 5 5-12 12-6 1 1-6L16 3m-2 2 5 5",
  trash: "M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6",
  calendar: "M4 5h16v16H4V5m3-3v6m10-6v6M4 11h16",
  mapPin: "M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  template: "M4 4h7v7H4V4m9 0h7v7h-7V4M4 13h7v7H4v-7m9 0h7v7h-7v-7",
};
const icon = (n) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.road}"/></svg>`;
const filledIconPaths = {
  template: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
  category: "M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8z",
};
const filledIcon = (n) =>
  `<svg class="icon filled-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${filledIconPaths[n]}"/></svg>`;
const moduleIconPaths = {
  "travel-medicine": '<path d="M9 3h6v4h3a2 2 0 0 1 2 2v9H4V9a2 2 0 0 1 2-2h3V3Z"/><path d="M12 10v6m-3-3h6"/>',
  "travel-documents": '<path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M8 12h6m-6 4h6"/>',
  "vehicle-check": '<path d="m4 15 1.5-5h13l1.5 5v4H4v-4Z"/><path d="m7 10 1-3h8l1 3M7 19v2m10-2v2M7 15h.01M17 15h.01"/>',
  "home-safety": '<path d="m3 11 9-7 9 7v9H3v-9Z"/><path d="M9 20v-6h6v6M7 10h.01M17 10h.01"/>',
  "road-emergency": '<path d="M5 7h14v13H5zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M12 10v6m-3-3h6"/>',
  "road-trip-comfort": '<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H5a3 3 0 0 0 0 6h2m5 2v6m-4 0h8"/>',
  "electronics-navigation": '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 5h4M11 18.5h2"/>',
  "clothing-toiletries": '<path d="m9 4 3 2 3-2 5 4-3 4-2-1v10H9V11l-2 1-3-4 5-4Z"/>',
  "lodging-checkin": '<path d="M4 19V6a2 2 0 0 1 2-2h5v15M4 13h16v6M11 8h2m-2 3h2M17 13v6"/>',
  "camping-outdoor": '<path d="m3 20 9-16 9 16H3Z"/><path d="m9 20 3-6 3 6M6 16h12"/>',
  "family-travel": '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14 20a5 5 0 0 1 7 0"/>',
  "pet-travel": '<path d="M8 11c-2 0-4 2-4 5 0 2 1 3 3 3 2 0 3-1 5-1s3 1 5 1c2 0 3-1 3-3 0-3-2-5-4-5-1 0-2 .5-4 .5S9 11 8 11Z"/><circle cx="7" cy="7" r="1.5"/><circle cx="12" cy="5.5" r="1.5"/><circle cx="17" cy="7" r="1.5"/>',
  "long-drive-safety": '<path d="m12 3 8 3v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3Z"/><path d="m8 12 2.5 2.5L16 9"/>',
};
const moduleIcon = (id, fallback) =>
  `<svg class="module-icon" viewBox="0 0 24 24" aria-hidden="true">${moduleIconPaths[id] || `<path d="M5 5h14v14H5z"/><path d="M8 12h8"/>`}</svg>`;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const day = (s) => String(s).slice(0, 10),
  nowDay = () =>
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }),
  num = (s) => Date.parse(day(s) + "T00:00:00Z"),
  gap = (a, b) => Math.round((num(b) - num(a)) / 86400000),
  addDay = (s, n) => new Date(num(s) + n * 86400000).toISOString().slice(0, 10);
const pretty = (s) => `${Number(s.slice(5, 7))}月${Number(s.slice(8, 10))}日`,
  weekday = (s) =>
    ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
      new Date(s + "T00:00:00Z").getUTCDay()
    ];
let trip = null,
  trips = [],
  tab = "today",
  scope = "公共",
  selected = nowDay(),
  busy = false,
  connection = true,
  weatherByDate = {},
  weatherLoading = {},
  weatherTripId = null;
const authQuery = new URLSearchParams(location.search),
  authFragment = new URLSearchParams(location.hash.slice(1));
let invite = authQuery.get("invite") || authFragment.get("invite"),
  recovery = authQuery.get("recover") || authFragment.get("recover");
if (invite || recovery) history.replaceState(null, "", location.pathname);
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").style.display = "none"), 4200);
}
async function api(path, data) {
  if (data && !navigator.onLine)
    throw Error("当前已断网，无法保存。请联网后重试。");
  let response;
  try {
    await ensureAuth();
    let operation, payload;
    if (path === "trips") [operation, payload] = ["listTrips", {}];
    else if (path === "create") [operation, payload] = ["createTrip", data];
    else if (path === "join") [operation, payload] = ["joinTrip", data];
    else if (path === "invite-preview") [operation, payload] = ["previewInvite", data];
    else if (path === "upload-ticket") [operation, payload] = ["uploadTicket", data];
    else if (path === "recover") [operation, payload] = ["recoverMember", data];
    else if (path === "weather") [operation, payload] = ["getWeather", data];
    else if (path.startsWith("trips/")) {
      operation = data ? "mutateTrip" : "getTrip";
      payload = { ...(data || {}), tripId: path.slice(6) };
    } else throw Error("接口不存在");
    response = await cloud.callFunction({ name: "suixing-api", data: { operation, data: payload }, parse: true });
  } catch {
    connection = false;
    throw Error("连接失败，无法确认保存结果。请联网刷新后核对。");
  }
  connection = true;
  const envelope = response?.result;
  if (!envelope?.ok) {
    if (envelope?.status === 409) {
      await refresh();
    }
    throw Object.assign(Error(envelope?.error || "操作失败"), { status: envelope?.status || 500 });
  }
  return envelope.data;
}
function remember(v) {
  trip = v.trip;
  localStorage.setItem("suixing-trip", trip.id);
  selected = clampDay();
}
const clampDay = () =>
  !trip
    ? nowDay()
    : nowDay() < day(trip.start)
      ? day(trip.start)
      : nowDay() > day(trip.end)
        ? day(trip.end)
        : nowDay();
async function refresh() {
  if (!trip) return;
  trip = await api("trips/" + trip.id);
  if (selected < day(trip.start) || selected > day(trip.end))
    selected = clampDay();
  render();
}
async function loadWeather(date) {
  if (!trip || !date || weatherLoading[date]) return;
  if (weatherTripId !== trip.id) {
    weatherTripId = trip.id;
    weatherByDate = {};
    weatherLoading = {};
  }
  const cached = weatherByDate[date];
  if (isWeatherCacheFresh(cached)) return;
  weatherLoading[date] = true;
  try {
    const result = await api("weather", { tripId: trip.id, date });
    weatherByDate[date] = stampWeatherResult(result);
  } catch {
    const fallback = await browserWeatherFallback(date);
    weatherByDate[date] = stampWeatherResult(fallback);
    if (weatherByDate[date].reason === "error") {
      setTimeout(() => { if (trip && !document.hidden) { delete weatherByDate[date]; loadWeather(date); } }, 15000);
    }
  } finally {
    delete weatherLoading[date];
    if (trip) render();
  }
}
function weatherPlaceForDate(date) {
  const hotel = (trip?.hotels || []).find((entry) => entry.checkin <= date && date < entry.checkout);
  const event = (trip?.events || []).filter((entry) => entry.date === date && (entry.address || entry.endPlace || entry.startPlace)).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))[0];
  return String(hotel?.city || event?.address || event?.endPlace || event?.startPlace || "").trim();
}
async function browserWeatherFallback(date) {
  const place = weatherPlaceForDate(date);
  if (!place) return { available: false, reason: "missing_place", date };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=zh&format=json`, { signal: controller.signal });
    const geo = await geoResponse.json();
    let location = geo?.results?.[0];
    if (!location) {
      const fallbackResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&accept-language=zh-CN&limit=1&q=${encodeURIComponent(place)}`, { signal: controller.signal });
      const fallback = (await fallbackResponse.json())?.[0];
      if (fallback) location = { name: fallback.display_name?.split(",")[0] || place, latitude: Number(fallback.lat), longitude: Number(fallback.lon), geoSource: "OpenStreetMap" };
    }
    if (!location) { clearTimeout(timeout); return { available: false, reason: "place_not_found", date, place }; }
    const forecastResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(location.latitude)}&longitude=${encodeURIComponent(location.longitude)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`, { signal: controller.signal });
    clearTimeout(timeout);
    const forecast = await forecastResponse.json();
    const index = (forecast.daily?.time || []).indexOf(date);
    if (index < 0) return { available: false, reason: "out_of_range", date, place };
    const code = Number(forecast.daily.weather_code[index]);
    const condition = { 0: "晴", 1: "大部晴朗", 2: "局部多云", 3: "阴", 45: "雾", 48: "雾凇", 51: "小毛毛雨", 53: "毛毛雨", 55: "较强毛毛雨", 61: "小雨", 63: "中雨", 65: "大雨", 71: "小雪", 73: "中雪", 75: "大雪", 80: "阵雨", 81: "较强阵雨", 82: "强阵雨", 95: "雷雨", 96: "雷雨伴冰雹", 99: "雷雨伴强冰雹" }[code] || "天气变化";
    return { available: true, date, place, location: location.name || place, geoSource: location.geoSource || "Open-Meteo", code, condition, high: forecast.daily.temperature_2m_max[index], low: forecast.daily.temperature_2m_min[index], rainProbability: forecast.daily.precipitation_probability_max?.[index] ?? null, updatedAt: new Date().toISOString(), source: "Open-Meteo" };
  } catch {
    return { available: false, reason: "error", date, place };
  }
}
function weatherIcon(code) {
  const key = `weather-${Number(code) || 0}`;
  const cloud = `<path d="M13 32c-4.1 0-7-2.8-7-6.5 0-3.3 2.3-6 5.5-6.5.8-5.5 5.4-9.5 11-9.5 5.9 0 10.6 4.2 11.2 9.8 3.7.2 6.8 3.2 6.8 6.8 0 3.5-2.9 6-7 6H13Z" fill="url(#${key}-cloud)"/>`;
  const sun = `<g fill="url(#${key}-sun)"><circle cx="30" cy="17" r="8"/><path d="M30 4v4M30 26v4M17 17h4M39 17h4M20.8 7.8l2.8 2.8M36.4 23.4l2.8 2.8M39.2 7.8l-2.8 2.8M23.6 23.4l-2.8 2.8" fill="none" stroke="#ffd66b" stroke-width="3" stroke-linecap="round"/></g>`;
  const drops = `<g fill="#83c7ff"><path d="M15 35c-2.7 3.3-2.9 4.8-2.9 5.8a2.9 2.9 0 1 0 5.8 0c0-1-1.1-3.1-2.9-5.8Z"/><path d="M25 35c-2.7 3.3-2.9 4.8-2.9 5.8a2.9 2.9 0 1 0 5.8 0c0-1-1.1-3.1-2.9-5.8Z"/><path d="M35 35c-2.7 3.3-2.9 4.8-2.9 5.8a2.9 2.9 0 1 0 5.8 0c0-1-1.1-3.1-2.9-5.8Z"/></g>`;
  const snow = `<g stroke="#a9dcff" stroke-width="2.5" stroke-linecap="round"><path d="M17 36v9M13 38l8 5M21 38l-8 5M31 36v9M27 38l8 5M35 38l-8 5"/></g>`;
  const fog = `<g fill="none" stroke="#a8c9eb" stroke-width="3" stroke-linecap="round"><path d="M12 37h24M16 43h20M11 49h14"/></g>`;
  const lightning = `<path d="m25 34-5 11h6l-2 8 9-13h-6l3-6Z" fill="url(#${key}-bolt)"/>`;
  let layer = sun;
  if ([45, 48].includes(code)) layer = `${cloud}${fog}`;
  else if ([71, 73, 75].includes(code)) layer = `${cloud}${snow}`;
  else if ([95, 96, 99].includes(code)) layer = `${cloud}${lightning}`;
  else if (code >= 51) layer = `${cloud}${drops}`;
  else if (code >= 3) layer = cloud;
  else if (code >= 1) layer = `${sun}${cloud}`;
  return `<svg viewBox="0 0 48 54" focusable="false" aria-hidden="true"><defs><linearGradient id="${key}-cloud" x1="12" y1="10" x2="36" y2="34" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset=".52" stop-color="#ddecff"/><stop offset="1" stop-color="#a8c7ec"/></linearGradient><radialGradient id="${key}-sun" cx=".35" cy=".28"><stop stop-color="#fff4a5"/><stop offset=".55" stop-color="#ffd460"/><stop offset="1" stop-color="#f5ab35"/></radialGradient><linearGradient id="${key}-bolt" x1="20" y1="34" x2="33" y2="53" gradientUnits="userSpaceOnUse"><stop stop-color="#fff1a3"/><stop offset="1" stop-color="#f6b72e"/></linearGradient><filter id="${key}-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#6a9fce" flood-opacity=".24"/></filter></defs><g filter="url(#${key}-shadow)">${layer}</g></svg>`;
}
function weatherCard(date) {
  const w = weatherByDate[date];
  if (!w) return `<section class="weather-card card"><div><strong>当地天气</strong><span class="muted">正在查询…</span></div></section>`;
  if (!w.available) return `<section class="weather-card card"><div><strong>当地天气</strong><span class="muted">${w.reason === "missing_place" ? "请先填写住宿城市或行程地址" : w.reason === "place_not_found" ? "地点未识别，请补充城市或区域" : w.reason === "out_of_range" ? "天气预报将在临近日期更新" : "网络暂时不可用，稍后自动重试"}</span></div></section>`;
  return `<section class="weather-card card"><div class="weather-main"><span class="weather-symbol">${weatherIcon(Number(w.code))}</span><div><strong>${esc(w.location || w.place)}</strong><span class="muted">${esc(w.condition)}</span><small class="weather-source">天气 Open-Meteo · 地点 ${esc(w.geoSource || "Open-Meteo")}</small></div></div><div class="weather-temp"><strong>${Math.round(w.high)}°</strong><span>${Math.round(w.low)}°</span></div><div class="weather-extra"><span>${w.rainProbability == null ? "" : `降雨 ${w.rainProbability}%`}</span><span>${w.wind == null ? "" : `风速 ${Math.round(w.wind)} km/h`}</span></div></section>`;
}
async function mutate(data) {
  if (busy) throw Error("正在保存，请稍候");
  busy = true;
  try {
    const v = await api("trips/" + trip.id, {
      ...data,
      revision: data.revision ?? trip.revision,
    });
    trip = v.trip;
    render();
    return v;
  } finally {
    busy = false;
  }
}
function show(title, html) {
  modal.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button data-action="close" aria-label="关闭">${icon("close")}</button></div><div class="modal-body">${html}</div>`;
  if (!modal.open) modal.showModal();
}
const pickerTypes = new Set(["date", "time", "datetime-local", "range", "trip-type"]);
const pickerDisplay = (value, type) => {
  if (type === "range") {
    const [start, end] = String(value || "").split("|");
    return start && end ? `${start.replaceAll("-", "/")} → ${end.replaceAll("-", "/")}` : "选择出发和归来日期";
  }
  if (!value) return type === "time" ? "选择时间" : "选择日期";
  if (type === "datetime-local") {
    const [d, t] = value.split("T");
    return `${d.replaceAll("-", "/")} ${t || "00:00"}`;
  }
  return type === "date" ? value.replaceAll("-", "/") : value;
};
const field = (label, name, value = "", type = "text", required = false) =>
  pickerTypes.has(type)
    ? `<label class="field picker-field">${label}<input class="picker-input" name="${name}" type="text" value="${esc(pickerDisplay(value, type))}" data-value="${esc(value)}" data-picker="${type}" autocomplete="off" readonly ${required ? "required" : ""}></label>`
    : `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" autocomplete="off" ${required ? "required" : ""} ${type === "text" ? 'maxlength="200"' : ""}></label>`;
const dateRangeField = (label, start, end, required = true) => {
  const value = `${start}|${end}`;
  return `<label class="field picker-field range-field">${label}<input class="picker-input" name="travelDates" type="text" value="${esc(pickerDisplay(value, "range"))}" data-picker="range" data-start="${esc(start)}" data-end="${esc(end)}" data-start-name="${start === end ? "" : "startDate"}" data-end-name="${end === start ? "" : "endDate"}" autocomplete="off" readonly ${required ? "required" : ""}><input type="hidden" name="startDate" value="${esc(start)}"><input type="hidden" name="endDate" value="${esc(end)}"></label>`;
};
const select = (label, name, values, current) =>
  `<label class="field">${label}<select name="${name}">${values.map((v) => `<option ${v === current ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
const typeSelect = (current = "自驾游") =>
  `<label class="field picker-field trip-type-field">类型<input class="picker-input" name="type" type="text" value="${esc(current)}" data-value="${esc(current)}" data-picker="trip-type" autocomplete="off" readonly required></label>`;
const note = (label, name, value = "") =>
  `<label class="field">${label}<textarea name="${name}" maxlength="2000">${esc(value)}</textarea></label>`;
function form(kind, fields, id = "", del = "") {
  return `<form data-form="${kind}" data-id="${id}" data-revision="${trip?.revision ?? 0}">${fields}<p class="error" role="alert"></p><div class="form-actions">${del ? `<button type="button" class="btn danger" data-action="${del}" data-id="${id}">删除</button>` : ""}<button class="btn" type="submit">${kind === "create" ? "创建旅行" : kind === "join" ? "加入旅行" : kind === "recover" ? "恢复我的身份" : kind === "ticketCreate" ? "添加票据" : "保存"}</button></div></form>`;
}
const avatarInfo = (avatarId) => avatars.find((entry) => entry.id === avatarId);
function avatarImage(member, className = "") {
  const info = avatarInfo(member?.avatarId);
  const src = member?.avatarData?.match(/^data:image\/(?:jpeg|png|webp);base64,/) ? member.avatarData : info?.src;
  return src
    ? `<img class="member-avatar ${className}" src="${esc(src)}" alt="" loading="lazy" decoding="async">`
    : `<span class="member-avatar avatar-fallback ${className}" aria-hidden="true">?</span>`;
}
function memberChip(member, className = "") {
  if (!member) return "";
  return `<span class="member-chip ${className}">${avatarImage(member)}<span>${esc(member.name)}</span></span>`;
}
function avatarPicker(selectedId = "", usedIds = [], allowDuplicates = false, selectedData = "") {
  const customSelected = Boolean(selectedData);
  return `<fieldset class="avatar-picker"><legend>选择头像</legend><input type="hidden" name="avatarId" value="${esc(selectedId)}"><input type="hidden" name="avatarData" value="${esc(selectedData)}"><div class="avatar-grid"><label class="avatar-option avatar-upload ${customSelected ? "selected" : ""}" aria-label="上传自定义头像"><input type="file" accept="image/jpeg,image/png,image/webp" data-avatar-file><span class="avatar-upload-preview">${customSelected ? `<img src="${esc(selectedData)}" alt="">` : `${icon("plus")}<b>上传图片</b>`}</span><i aria-hidden="true">✓</i></label>${avatars.map((entry) => {
    const unavailable = !allowDuplicates && usedIds.includes(entry.id) && entry.id !== selectedId;
    return `<button type="button" class="avatar-option ${entry.id === selectedId ? "selected" : ""}" data-action="choose-avatar" data-value="${entry.id}" aria-label="${entry.name}${unavailable ? "，已被选择" : ""}" aria-pressed="${entry.id === selectedId}" ${unavailable ? "disabled" : ""}><img src="${entry.src}" alt="" loading="lazy"><i aria-hidden="true">✓</i></button>`;
  }).join("")}</div><p class="muted">可上传自己的照片；系统头像在同一趟旅行中优先不重复。</p></fieldset>`;
}
let pickerState = null;
const pad2 = (n) => String(n).padStart(2, "0");
const dateOnly = (value) => String(value || "").slice(0, 10);
function parsePickerState(input) {
  const type = input.dataset.picker;
  if (type === "trip-type") {
    const value = tripTypes.includes(input.dataset.value) ? input.dataset.value : tripTypes[0];
    return { input, type, value, stage: "options" };
  }
  if (type === "range") {
    const start = new Date(`${input.dataset.start}T12:00:00`);
    const end = input.dataset.end ? new Date(`${input.dataset.end}T12:00:00`) : null;
    return { input, type, start, end, date: start, month: new Date(start.getFullYear(), start.getMonth(), 1), stage: "date" };
  }
  const value = input.dataset.value || "";
  const dateValue = type === "datetime-local" ? dateOnly(value) : type === "date" ? value : nowDay();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
    ? new Date(`${dateValue}T12:00:00`)
    : new Date(`${nowDay()}T12:00:00`);
  const timeValue = type === "datetime-local" ? value.slice(11, 16) : type === "time" ? value : "";
  const [hour = "0", minute = "0"] = timeValue.split(":");
  return {
    input,
    type,
    date,
    month: new Date(date.getFullYear(), date.getMonth(), 1),
    hour: Number(hour) || 0,
    minute: Number(minute) || 0,
    stage: type === "time" ? "time" : "date",
  };
}
const pickerWeekdays = ["日", "一", "二", "三", "四", "五", "六"];
function pickerDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function pickerDateView() {
  const s = pickerState;
  const y = s.month.getFullYear();
  const m = s.month.getMonth();
  const selected = pickerDateKey(s.date);
  const rangeStart = s.type === "range" && s.start ? pickerDateKey(s.start) : "";
  const rangeEnd = s.type === "range" && s.end ? pickerDateKey(s.end) : "";
  const firstDay = new Date(y, m, 1).getDay();
  const count = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const n = i - firstDay + 1;
    const d = new Date(y, m, n);
    const key = pickerDateKey(d);
    const outside = d.getMonth() !== m;
    const inRange = rangeStart && rangeEnd && key > rangeStart && key < rangeEnd;
    const selectedClass = s.type === "range"
      ? `${key === rangeStart ? "range-start selected" : ""} ${key === rangeEnd ? "range-end selected" : ""} ${inRange ? "in-range" : ""}`
      : key === selected ? "selected" : "";
    cells.push(`<button type="button" class="picker-day ${outside ? "outside" : ""} ${selectedClass}" data-picker-date="${key}">${d.getDate()}</button>`);
  }
  const rangeSummary = s.type === "range" ? `<div class="picker-range-summary"><span>出发<strong>${s.start ? pickerDateKey(s.start).replaceAll("-", "/") : "请选择"}</strong></span><em>${s.start && s.end ? `共 ${Math.round((s.end - s.start) / 86400000) + 1} 天` : "请选择归来日期"}</em><span>归来<strong>${s.end ? pickerDateKey(s.end).replaceAll("-", "/") : "请选择"}</strong></span></div>` : "";
  picker.innerHTML = `<div class="picker-sheet"><div class="picker-top"><button type="button" class="picker-cancel" data-picker-action="cancel">取消</button><strong>${s.type === "range" ? "选择出行日期" : "请选择日期"}</strong><button type="button" class="picker-close" data-picker-action="cancel" aria-label="关闭">${icon("close")}</button></div><div class="picker-month"><button type="button" data-picker-action="prev" aria-label="上个月">‹</button><strong>${y}年${m + 1}月</strong><button type="button" data-picker-action="next" aria-label="下个月">›</button></div><div class="picker-weekdays">${pickerWeekdays.map((d) => `<span>${d}</span>`).join("")}</div><div class="picker-grid">${cells.join("")}</div>${rangeSummary}<button type="button" class="picker-confirm" data-picker-action="confirm-date">${s.type === "datetime-local" ? "下一步：选择时间" : "确认"}</button></div>`;
}
function pickerTimeView() {
  const s = pickerState;
  const hours = Array.from({ length: 24 }, (_, n) => `<button type="button" class="picker-wheel-item ${n === s.hour ? "selected" : ""}" data-picker-hour="${n}">${n} 时</button>`).join("");
  const minutes = Array.from({ length: 60 }, (_, n) => `<button type="button" class="picker-wheel-item ${n === s.minute ? "selected" : ""}" data-picker-minute="${n}">${n} 分</button>`).join("");
  picker.innerHTML = `<div class="picker-sheet picker-time-sheet"><div class="picker-top"><button type="button" class="picker-cancel" data-picker-action="cancel">取消</button><strong>选择时间</strong><button type="button" class="picker-cancel picker-blue" data-picker-action="confirm-time">确定</button></div><div class="picker-wheels"><div class="picker-wheel" data-picker-wheel="hour">${hours}</div><div class="picker-wheel" data-picker-wheel="minute">${minutes}</div></div></div>`;
  requestAnimationFrame(() => {
    picker.querySelector(`[data-picker-hour="${s.hour}"]`)?.scrollIntoView({ block: "center" });
    picker.querySelector(`[data-picker-minute="${s.minute}"]`)?.scrollIntoView({ block: "center" });
  });
}
function pickerTypeView() {
  const s = pickerState;
  const options = tripTypes.map((value, index) => `<button type="button" class="picker-wheel-item picker-type-option ${value === s.value ? "selected" : ""}" data-picker-option="${index}" aria-pressed="${value === s.value}">${esc(value)}</button>`).join("");
  picker.innerHTML = `<div class="picker-sheet picker-time-sheet picker-type-sheet"><div class="picker-top"><button type="button" class="picker-cancel" data-picker-action="cancel">取消</button><strong>选择类型</strong><button type="button" class="picker-cancel picker-blue" data-picker-action="confirm-option">确认</button></div><div class="picker-wheels picker-type-wheels"><div class="picker-wheel picker-type-wheel" data-picker-wheel="type">${options}</div></div></div>`;
  requestAnimationFrame(() => {
    picker.querySelector(`[data-picker-option="${tripTypes.indexOf(s.value)}"]`)?.scrollIntoView({ block: "center" });
  });
}
function openPicker(input) {
  pickerState = parsePickerState(input);
  if (!picker.open) picker.showModal();
  pickerState.stage === "time" ? pickerTimeView() : pickerState.stage === "options" ? pickerTypeView() : pickerDateView();
}
function commitPicker() {
  const s = pickerState;
  if (!s) return;
  if (s.type === "trip-type") {
    s.input.dataset.value = s.value;
    s.input.value = s.value;
    s.input.dispatchEvent(new Event("change", { bubbles: true }));
    picker.close();
    pickerState = null;
    return;
  }
  if (s.type === "range") {
    if (!s.start || !s.end) return;
    const start = pickerDateKey(s.start), end = pickerDateKey(s.end);
    s.input.dataset.start = start;
    s.input.dataset.end = end;
    s.input.value = pickerDisplay(`${start}|${end}`, "range");
    const startInput = s.input.form?.querySelector('input[name="startDate"]');
    const endInput = s.input.form?.querySelector('input[name="endDate"]');
    if (startInput) startInput.value = start;
    if (endInput) endInput.value = end;
    picker.close();
    pickerState = null;
    return;
  }
  const date = pickerDateKey(s.date);
  const value = s.type === "date" ? date : s.type === "time" ? `${pad2(s.hour)}:${pad2(s.minute)}` : `${date}T${pad2(s.hour)}:${pad2(s.minute)}`;
  s.input.dataset.value = value;
  s.input.value = pickerDisplay(value, s.type);
  s.input.dispatchEvent(new Event("change", { bubbles: true }));
  picker.close();
  pickerState = null;
}
picker.addEventListener("cancel", () => { pickerState = null; });
picker.addEventListener("scroll", (event) => {
  const wheel = event.target.closest?.('[data-picker-wheel="type"]');
  if (!wheel || pickerState?.type !== "trip-type") return;
  clearTimeout(picker.typeScrollTimer);
  picker.typeScrollTimer = setTimeout(() => {
    const center = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
    const options = [...wheel.querySelectorAll("[data-picker-option]")];
    const selectedOption = options.reduce((nearest, option) =>
      Math.abs(option.getBoundingClientRect().top + option.offsetHeight / 2 - center)
        < Math.abs(nearest.getBoundingClientRect().top + nearest.offsetHeight / 2 - center) ? option : nearest,
    options[0]);
    if (!selectedOption) return;
    pickerState.value = tripTypes[Number(selectedOption.dataset.pickerOption)];
    options.forEach((option) => {
      const selected = option === selectedOption;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
  }, 80);
}, true);
picker.addEventListener("click", (event) => {
  const target = event.target.closest("[data-picker-action], [data-picker-date], [data-picker-hour], [data-picker-minute], [data-picker-option]");
  if (!target || !pickerState) return;
  if (target.dataset.pickerDate) {
    if (pickerState.type === "range") {
      const next = new Date(`${target.dataset.pickerDate}T12:00:00`);
      if (!pickerState.start || pickerState.end || next < pickerState.start) {
        pickerState.start = next;
        pickerState.end = null;
      } else {
        pickerState.end = next;
      }
      pickerState.date = next;
      pickerDateView();
      return;
    }
    const next = new Date(`${target.dataset.pickerDate}T12:00:00`);
    pickerState.date = next;
    pickerDateView();
  } else if (target.dataset.pickerHour != null) {
    pickerState.hour = Number(target.dataset.pickerHour);
    pickerTimeView();
  } else if (target.dataset.pickerMinute != null) {
    pickerState.minute = Number(target.dataset.pickerMinute);
    pickerTimeView();
  } else if (target.dataset.pickerOption != null) {
    pickerState.value = tripTypes[Number(target.dataset.pickerOption)];
    pickerTypeView();
  } else if (target.dataset.pickerAction === "prev" || target.dataset.pickerAction === "next") {
    pickerState.month.setMonth(pickerState.month.getMonth() + (target.dataset.pickerAction === "next" ? 1 : -1));
    pickerDateView();
  } else if (target.dataset.pickerAction === "confirm-date") {
    if (pickerState.type === "datetime-local") {
      pickerState.stage = "time";
      pickerTimeView();
    } else commitPicker();
  } else if (target.dataset.pickerAction === "confirm-time") {
    commitPicker();
  } else if (target.dataset.pickerAction === "confirm-option") {
    commitPicker();
  } else if (target.dataset.pickerAction === "cancel") {
    picker.close();
    pickerState = null;
  }
});
function brand() {
  return `<header class="topbar"><div class="brand"><img class="brand-logo" src="/brand/logo-512.png?v=20260915-logo3" alt="" width="36" height="36"><span>向野<small>INTO THE WILD</small></span></div>${trip ? "" : '<span class="eyebrow">轻装出发</span>'}</header>`;
}
function render() {
  app.dataset.view = trip ? tab : "welcome";
  const oldDateScroll = $(".date-strip")?.scrollLeft;
  if (!trip) {
    app.innerHTML = `<main class="shell">${brand()}<section class="welcome"><span class="eyebrow">把准备留下，把风景带走</span><h1>下一程，<br>从容出发。</h1><p class="welcome-lead">路线、住宿、随身物品。<br>出门需要记住的事，都放在这里。</p><div class="hero card"><span class="pill">你的自驾随身助手</span><svg class="route-art" viewBox="0 0 400 70"><path d="M5 50C65 50 55 10 115 20S200 75 255 35 335 10 390 25"/><circle cx="5" cy="50" r="4"/><circle cx="390" cy="25" r="5"/></svg><div class="hero-foot"><span>准备好，就出发。</span>${icon("arrow")}</div></div><button class="btn full" data-action="create">${icon("plus")} 创建我的旅行</button>${[
      ["map", "每天的路线与住宿", "打开手机，就知道下一站。"],
      ["list", "一起准备，各自确认", "公共物品共享，个人清单独立。"],
      ["calendar", "重要节点，不再漏掉", "提前准备，出发前再检查一次。"],
    ]
      .map(
        ([i, t, d]) =>
          `<div class="welcome-point">${icon(i)}<div><h3>${t}</h3><p>${d}</p></div></div>`,
      )
      .join(
        "",
      )}<p class="muted">已有同行邀请？请直接打开朋友发来的邀请链接。</p></section></main>`;
    return;
  }
  app.innerHTML = `${!navigator.onLine || !connection ? '<div class="offline-bar" role="alert">连接已断开 · 当前内容尚未更新，联网后才能保存</div>' : ""}<main class="shell">${brand()}${trip.archived ? '<div class="notice">这趟旅行已归档，内容仅供查看。<button class="text-btn" data-action="create">新建旅行</button></div>' : ""}${tab === "today" ? today() : tab === "route" ? route() : tab === "list" ? checklist() : memberCenter()}</main><nav class="bottom-nav" aria-label="主要导航">${[
    ["today", "sun", "今天"],
    ["route", "map", "行程"],
    ["list", "list", "清单"],
    ["people", "users", "我的"],
  ]
    .map(
      ([v, i, t]) =>
        `<button class="nav-item ${tab === v ? "active" : ""}" data-action="tab" data-value="${v}" ${tab === v ? 'aria-current="page"' : ""}>${icon(i)}${t}</button>`,
    )
    .join("")}</nav>`;
  if (trip.archived)
    app.querySelectorAll("[data-write]").forEach((b) => (b.disabled = true));
  const strip = $(".date-strip"),
    active = $(".date-btn.active");
  if (strip && active)
    strip.scrollLeft =
      oldDateScroll ??
      active.offsetLeft -
        strip.offsetLeft -
        (strip.clientWidth - active.clientWidth) / 2;
}
const progress = (a) => ({
  done: a.filter((x) => x.done).length,
  total: a.length,
});
const bar = (done, total) =>
  `<div class="progress"><i style="width:${total ? Math.round((done / total) * 100) : 0}%"></i></div>`;
function reminder() {
  const d = gap(nowDay(), trip.start);
  return d > 7
    ? ["准备旅行", "先把路线和住宿记下来，准备工作慢慢完成。"]
    : d > 3
      ? ["出发前 7 天", "核对待购票事项、证件与车辆准备。"]
      : d > 1
        ? ["出发前 3 天", "检查未完成项目，补齐缺少物品。"]
        : d === 1
          ? ["明天出发", "逐项复核关键物品，确认出发时间。"]
          : d === 0
            ? ["今天出发", "出发前再看一眼，关键项目都确认了吗？"]
            : nowDay() <= day(trip.end)
              ? ["旅途中", "按自己的节奏，享受今天的路程。"]
              : ["旅程已结束", "整理好回忆后，可以在设置中归档这趟旅行。"];
}
function reviewSummary() {
  const pub = trip.items.filter((i) => !i.owner && i.key),
    mine = trip.items.filter((i) => i.owner && i.key),
    reviewed = (a) => a.filter((i) => i.reviewed).length;
  const all =
    reviewed(pub) === pub.length &&
    trip.progress.every((p) => p.keys === p.reviewed);
  return `<div class="notice ${all ? "" : "warn"}"><div class="row"><strong>${all ? "关键项复核已全部完成" : "出发前 · 关键项复核"}</strong><button class="text-btn" data-action="tab" data-value="list">去检查 →</button></div><div>公共 ${reviewed(pub)}/${pub.length} · 我的 ${reviewed(mine)}/${mine.length}</div><div class="muted">${all ? "公共与每位同行人的关键项均已确认。" : "准备好以后，还需要再确认一次；同行人各自复核。"}</div></div>`;
}
function today() {
  const d = gap(nowDay(), trip.start),
    target = clampDay(),
    phase = reminder(),
    pub = progress(trip.items.filter((i) => !i.owner)),
    mine = progress(trip.items.filter((i) => i.owner));
  const tickets = trip.items
    .filter((i) => i.remind && !i.done)
    .sort((a, b) => a.remind.localeCompare(b.remind));
  loadWeather(target);
  const schedule = `<div class="section-head"><h2>${d > 0 ? "出发日安排" : nowDay() > day(trip.end) ? "最后一天安排" : "今天的安排"}</h2><span class="muted">${pretty(target)}</span></div>${weatherCard(target)}${eventsCard(target)}${hotelCard(target)}`;
  const preparation = `<div class="section-head"><h2>出行准备</h2><button class="text-btn" data-action="tab" data-value="list">查看清单 →</button></div><div class="stats">${[
    ["公共准备", pub],
    ["我的准备", mine],
  ]
    .map(
      ([name, p]) =>
        `<div class="card"><div class="muted">${name}</div><p><strong>${p.done}</strong><span class="muted"> / ${p.total} 项</span></p>${bar(p.done, p.total)}</div>`,
    )
    .join(
      "",
    )}</div><div class="notice"><strong>${phase[0]}</strong><p>${phase[1]}</p>${d > 0 ? '<button class="text-btn" data-action="cal-prep">添加准备节点到日历 →</button>' : ""}</div>${d <= 1 && nowDay() <= day(trip.end) ? reviewSummary() : ""}${tickets.length ? `<div class="section-head"><h2>待办提醒</h2><span class="muted">${tickets.length} 项</span></div><div class="card check-card">${tickets.map((i) => itemRow(i)).join("")}</div>` : ""}`;
  const hotel = trip.hotels.find(
    (h) => h.checkin <= target && target < h.checkout,
  );
  const totalDays = gap(trip.start, trip.end) + 1;
  const countdown = d > 0
    ? { label: "距离出发", value: d, unit: "天" }
    : nowDay() <= day(trip.end)
      ? { label: "旅行第", value: gap(trip.start, nowDay()) + 1, unit: "天" }
      : { label: "本次旅程", value: totalDays, unit: "天" };
  const dateText = (value) => `${pretty(day(value))}${value.slice(11, 16)}`;
  const tripHero = `<section class="hero card trip-hero ${d <= 0 ? "on-trip" : ""}"><div class="trip-hero-heading"><h2>${esc(trip.name)}</h2><span class="trip-type-badge">${esc(trip.type || "自驾游")}</span></div><div class="trip-countdown"><span>${countdown.label}</span><strong>${countdown.value}</strong><span>${countdown.unit}</span></div><div class="trip-date-panel"><div class="trip-date-block"><span>出发日期</span><strong>${dateText(trip.start)}</strong></div><div class="trip-duration"><b>${totalDays}天</b><i aria-hidden="true"></i></div><div class="trip-date-block trip-date-end"><span>归来日期</span><strong>${dateText(trip.end)}</strong></div></div></section>`;
  return `<div class="page-heading"><div><span class="eyebrow">${pretty(nowDay())} · ${weekday(nowDay())}</span><h1>${d > 0 ? "旅途将近，准备出发。" : nowDay() > day(trip.end) ? "到家了，好好休息。" : "今天，也有好风景。"}</h1></div></div>${tripHero}${nowDay() === day(trip.end) ? `<div class="notice">今天归来 · 预计 ${trip.end.slice(11)}，记得给返程留足时间。</div>` : ""}${d > 0 ? preparation + schedule : schedule + preparation}`;
}
const eventList = (d) =>
  trip.events
    .filter((e) => e.date === d)
    .sort((a, b) => (a.startTime || a.time || "").localeCompare(b.startTime || b.time || ""));
function addresses(address) {
  return address
    ? `<div class="small-actions"><button data-action="copy" data-value="${esc(address)}">复制地址</button><a href="https://uri.amap.com/search?keyword=${encodeURIComponent(address)}&callnative=1" target="_blank" rel="noopener noreferrer">打开地图 ↗</a></div>`
    : "";
}
function routePlaces(entry) {
  const start = String(entry.startPlace || "").trim();
  const end = String(entry.endPlace || "").trim();
  if (!start && !end) return "";
  const parts = [];
  if (start) parts.push(`<em class="route-label route-start-label">起点</em><strong class="route-place route-start-place">${esc(start)}</strong>`);
  if (start && end) parts.push('<i class="route-arrow" aria-hidden="true">→</i>');
  if (end) parts.push(`<strong class="route-place route-end-place">${esc(end)}</strong><em class="route-label route-end-label">终点</em>`);
  return `<div class="journey-route ${start && end ? "has-both-places" : "has-one-place"}">${parts.join("")}</div>`;
}
function mapAction(entry) {
  const place = String(entry.address || entry.endPlace || entry.startPlace || "").trim();
  if (!place) return "";
  return `<a class="itinerary-map" href="https://uri.amap.com/search?keyword=${encodeURIComponent(place)}&callnative=1" target="_blank" rel="noopener noreferrer" aria-label="打开${esc(place)}地图"><img src="/brand/map-marker.svg" alt="" aria-hidden="true"></a>`;
}
function eventsCard(d) {
  const items = eventList(d);
  if (!items.length) {
    return `<div class="card"><div class="empty"><p>这一天的安排尚未填写</p><button class="btn secondary" data-action="event" data-date="${d}" data-write>${icon("plus")} 添加安排</button></div></div>`;
  }
  const segments = items.flatMap(splitEventByPeriods);
  return `<div class="itinerary-list">${schedulePeriods.map((period) => {
    const periodItems = segments.filter((entry) => entry.periodId === period.id);
    if (!periodItems.length) return "";
    return `<article class="card itinerary-card period-card"><div class="itinerary-head period-card-head"><h3>${period.name}行程</h3><span class="period-count">${periodItems.length} 项</span></div><div class="itinerary-divider" aria-hidden="true"></div><div class="period-timeline">${periodItems.map((entry) => `<section class="period-event"><span class="journey-dot" aria-hidden="true"></span><div class="period-event-body"><div class="period-event-head"><div><div class="period-event-time">${esc(entry.segmentStart)} <span>—</span> ${esc(entry.segmentEnd)}</div><h4>${esc(entry.title)}</h4></div><div class="period-event-actions"><button class="itinerary-edit" data-action="event" data-id="${entry.id}" aria-label="编辑 ${esc(entry.title)}" data-write>${icon("edit")}</button>${mapAction(entry)}</div></div>${entry.continuedFromPrevious || entry.continuesToNext ? `<div class="continuation-tags">${entry.continuedFromPrevious ? '<span>接上个时段</span>' : ""}${entry.continuesToNext ? '<span>下个时段继续</span>' : ""}</div>` : ""}${routePlaces(entry)}${entry.note ? `<p class="itinerary-note">${esc(entry.note)}</p>` : ""}</div></section>`).join("")}</div></article>`;
  }).join("")}</div>`;
}
function hotelCard(d) {
  const h = trip.hotels.find((h) => h.checkin <= d && d < h.checkout);
  return h
    ? `<section class="hotel-section"><div class="section-head"><div><h2>住宿</h2><span class="muted">${d === nowDay() ? "今晚" : "当晚"}</span></div></div><div class="card hotel"><div class="hotel-heading">${icon("hotel")}<div><div class="muted">${esc(h.city)}</div><h3>${esc(h.name)}</h3></div></div><p class="muted">${esc(h.address)}</p><p class="muted">${pretty(h.checkin)} 入住 · ${pretty(h.checkout)} 退房</p>${h.note ? `<p>${esc(h.note)}</p>` : ""}${addresses(h.address)}<div class="small-actions">${h.phone ? `<a href="tel:${esc(h.phone.replace(/[^\d+ -]/g, ""))}">致电 ${esc(h.phone)}</a>` : ""}<button data-action="hotel" data-id="${h.id}" data-write>编辑住宿</button></div></div></section>`
    : `<section class="hotel-section"><div class="section-head"><h2>住宿</h2></div><div class="card hotel-empty">${d === day(trip.end) ? '<span class="muted">归来日，无需填写住宿</span>' : `<button class="ticket-upload" data-action="hotel" data-date="${d}" data-write>${icon("plus")} 添加住宿</button>`}</div></section>`;
}
function route() {
  const days = Array.from({ length: gap(trip.start, trip.end) + 1 }, (_, i) =>
    addDay(trip.start, i),
  );
  loadWeather(selected);
  return `<div class="date-strip" aria-label="选择行程日期">${days.map((d) => `<button class="date-btn ${selected === d ? "active" : ""}" data-action="date" data-value="${d}" ${selected === d ? 'aria-current="date"' : ""}><span>${weekday(d)}</span><strong>${Number(d.slice(8))}</strong><span>${Number(d.slice(5, 7))} 月</span></button>`).join("")}</div><div class="section-head"><h2>${pretty(selected)} · 第 ${gap(trip.start, selected) + 1} 天</h2><button class="text-btn" data-action="event" data-date="${selected}" data-write>添加安排 +</button></div>${weatherCard(selected)}${eventsCard(selected)}${hotelCard(selected)}${ticketCard(selected)}`;
}
function ticketCard(date) {
  const tickets = (trip.tickets || []).filter((ticket) => ticket.date === date);
  const addButton = `<button class="ticket-upload" data-action="add-ticket" data-date="${date}" data-write>${icon("plus")} 添加票据</button>`;
  return `<section class="ticket-section"><div class="section-head"><div><h2>票务</h2>${tickets.length ? `<span class="muted">${tickets.length} 张</span>` : ""}</div>${tickets.length ? addButton : ""}</div>${tickets.length ? `<div class="ticket-grid">${tickets.map((ticket) => `<article class="card ticket-card"><button class="ticket-image" data-action="view-ticket" data-id="${ticket.id}" aria-label="查看 ${esc(ticket.type || ticket.title)}"><img src="${esc(ticket.imageUrl)}" alt="${esc(ticket.type || ticket.title)}" loading="lazy" decoding="async"></button><div class="ticket-card-foot"><div><strong>${esc(ticket.type || ticket.title)}</strong><small>${esc((ticket.startTime || "").slice(11, 16) || "时间未填写")}</small><span>${memberChip(trip.members.find((member) => member.id === ticket.uploadedByMemberId))}</span></div><div class="ticket-actions"><button data-action="edit-ticket" data-id="${ticket.id}" aria-label="编辑票据" data-write>${icon("edit")}</button><button class="delete" data-action="delete-ticket" data-id="${ticket.id}" aria-label="删除票据" data-write>${icon("trash")}</button></div></div></article>`).join("")}</div>` : `<div class="card ticket-empty">${addButton}</div>`}</section>`;
}
const ticketTypes = ["车票", "门票", "机票", "船票", "其他票据"];
function ticketCreateForm(date) {
  show("添加票据", form("ticketCreate", `${select("选择类型", "type", ticketTypes, "车票")}${field("起始时间", "startTime", `${date}T09:00`, "datetime-local", true)}<label class="field ticket-file-field">上传图片<span class="ticket-file-picker">${icon("plus")}<span data-ticket-file-name>选择票据图片</span><input name="image" type="file" data-ticket-file accept="image/jpeg,image/png,image/webp" required></span><small>支持 JPG、PNG、WebP，原图不超过 20MB</small></label>`));
}
function ticketMetaForm(id) {
  const ticket = (trip.tickets || []).find((entry) => entry.id === id);
  if (!ticket) return;
  show("编辑票据", form("ticketMeta", `${select("选择类型", "type", ticketTypes, ticket.type || ticket.title || "其他票据")}${field("起始时间", "startTime", ticket.startTime || `${ticket.date}T09:00`, "datetime-local", true)}`, ticket.id));
}
function ticketPreview(id) {
  const ticket = (trip.tickets || []).find((entry) => entry.id === id);
  if (!ticket) return;
  show(ticket.type || ticket.title, `<div class="ticket-preview"><img src="${esc(ticket.imageUrl)}" alt="${esc(ticket.type || ticket.title)}"><p class="muted">${pretty(ticket.date)} ${(ticket.startTime || "").slice(11, 16)}</p></div>`);
}
function deleteTicketPrompt(id) {
  const ticket = (trip.tickets || []).find((entry) => entry.id === id);
  if (!ticket) return;
  show("删除这张票据？", `<div class="notice warn"><strong>${esc(ticket.title)}</strong><p>删除后，同行成员也无法继续查看这张图片。</p></div><div class="form-actions"><button class="btn secondary" data-action="close">取消</button><button class="btn danger" data-action="confirm-delete-ticket" data-id="${ticket.id}">确认删除</button></div>`);
}
function itemRow(i) {
  const reviewing = gap(nowDay(), trip.start) <= 1;
  const member = trip.members.find((entry) => entry.id === (i.owner || i.byMemberId));
  const confirmed = i.done ? `<span class="item-confirmer">${avatarImage(member, "tiny")}${esc(member?.name || i.by || "原确认人")}<span>${i.owner ? "已准备" : "已确认"}</span></span>` : "";
  return `<div class="check-row ${i.done ? "done" : ""}"><button class="check-main" data-action="toggle" data-id="${i.id}" role="checkbox" aria-checked="${i.done}" data-write><span class="checkbox">${i.done ? icon("check") : ""}</span><span class="item-copy"><span class="item-title-line"><span class="item-title">${esc(i.title)}</span>${i.key ? '<span class="key-badge">关键项</span>' : ""}</span><span class="item-meta">${confirmed}${i.remind ? `<span>${pretty(day(i.remind))} ${i.remind.slice(11)} 提醒</span>` : ""}${i.linkedDate ? `<span>关联 ${pretty(i.linkedDate)} 行程</span>` : ""}</span></span></button><div class="item-actions">${i.key && i.done && reviewing ? `<button class="review-btn ${i.reviewed ? "checked" : ""}" data-action="review" data-id="${i.id}" data-write>${i.reviewed ? "已复核" : "再确认"}</button>` : ""}<button class="item-action edit" data-action="item" data-id="${i.id}" aria-label="编辑 ${esc(i.title)}" title="编辑" data-write>${icon("edit")}</button><button class="item-action delete" data-action="deleteItem" data-id="${i.id}" aria-label="删除 ${esc(i.title)}" title="删除" data-write>${icon("trash")}</button></div></div>`;
}
function checklist() {
  const items = trip.items.filter((i) =>
      scope === "公共" ? !i.owner : !!i.owner,
    ),
    p = progress(items);
  const categories = trip.categories.filter((c) =>
    scope === "公共" ? !c.owner : c.owner === trip.me,
  );
  return `<div class="segment">${["公共", "我的"].map((s) => `<button class="${scope === s ? "active" : ""}" data-action="scope" data-value="${s}">${s === "公共" ? "一起准备" : "我的物品"}</button>`).join("")}</div><section class="checklist-overview card"><div class="checklist-overview-head"><div><span class="muted">准备进度</span><div class="checklist-total"><strong>${p.done}</strong><span>/ ${p.total} 项</span></div></div><div class="checklist-actions"><button class="checklist-action-btn template-import-btn" data-action="templates" data-write>${filledIcon("template")}<span>导入模板</span></button><button class="checklist-action-btn" data-action="category" data-write>${filledIcon("category")}<span>新建分类</span></button></div></div><div class="checklist-progress"><i style="width:${p.total ? Math.round((p.done / p.total) * 100) : 0}%"></i></div></section>${gap(nowDay(), trip.start) <= 1 ? reviewSummary() : ""}${categories
    .map(
      (c) =>
        `<section class="check-group"><div class="section-head category-head"><div><h2>${esc(c.name)}</h2><span class="muted">${items.filter((i) => i.categoryId === c.id).length} 项</span></div><button class="text-btn" data-action="item" data-category="${c.id}" aria-label="在${esc(c.name)}中新增条目" data-write>新增条目 +</button></div><div class="card check-card">${
          items
            .filter((i) => i.categoryId === c.id)
            .map(itemRow)
            .join("") ||
          '<p class="empty">还没有条目，点击分类旁的“新增条目”。</p>'
        }</div></section>`,
    )
    .join(
      "",
    )}<div class="section-head"><h2>同行人的准备</h2><button class="text-btn" data-action="tab" data-value="people">查看成员 →</button></div><div class="card members">${trip.progress.map((p) => `<div class="member"><div class="row"><span>${memberChip(p)}${p.id === trip.me ? '<span class="pill">我</span>' : ""}</span><span class="muted">${p.done}/${p.total} 已准备</span></div>${bar(p.done, p.total)}<div class="muted">关键项复核 ${p.reviewed}/${p.keys}</div></div>`).join("")}</div>`;
}
function tripForm(edit = false) {
  const start = edit ? trip.start : addDay(nowDay(), 7) + "T08:00";
  const end = edit ? trip.end : addDay(nowDay(), 10) + "T18:00";
  show(
    edit ? "编辑旅行" : "开启一段新旅程",
    form(
      edit ? "trip" : "create",
      `${field("旅行名称", "name", edit ? trip.name : "", "text", true)}${typeSelect(edit ? trip.type || "自驾游" : "自驾游")}${edit ? "" : field("你的昵称", "nickname", trip?.members.find((m) => m.id === trip.me)?.name || "", "text", true)}${edit ? "" : avatarPicker()}${dateRangeField("出行日期", day(start), day(end))}<div class="form-grid">${field("出发时间（北京时间）", "startTime", start.slice(11, 16), "time", true)}${field("归来时间（北京时间）", "endTime", end.slice(11, 16), "time", true)}</div>${!edit && trips.length ? `<label class="field">复用已有清单<select name="reuse"><option value="">使用精简默认清单</option>${trips.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></label><p class="muted">仅复用公共清单和你的个人清单，完成与复核状态都会清零。</p>` : ""}${edit ? '<p class="muted">修改日期或时间后，请同步更新已添加的手机日历。</p>' : ""}`,
    ),
  );
}
function categoryForm() {
  show(
    "新建分类",
    form(
      "category",
      `<p class="muted">添加到${scope === "公共" ? "“一起准备”，同行人都能使用" : "“我的物品”，仅你自己使用"}。</p><input type="hidden" name="scope" value="${scope}"><label class="field">分类名称<input name="name" maxlength="40" required placeholder="例如：露营装备"></label>`,
    ),
  );
}
function templateLibrary() {
  const destination = scope === "公共" ? "一起准备" : "我的物品";
  show(
    "导入清单模板",
    `<p class="template-import-note">将模板添加到<strong>${destination}</strong>。导入后，每一条内容都可以编辑或删除。</p><div class="template-list">${checklistTemplates.map((template) => `<button class="template-card" data-action="template-preview" data-id="${template.id}"><span class="template-symbol module-${template.id}" aria-hidden="true">${moduleIcon(template.id, template.symbol)}</span><span class="template-copy"><strong>${esc(template.name)}</strong><small>${template.items.length} 项 · 建议放入${template.recommendedScope === "公共" ? "一起准备" : "我的物品"}</small></span><span class="template-arrow" aria-hidden="true">›</span></button>`).join("")}</div>`,
  );
}
function templateDetail(templateId) {
  const template = checklistTemplates.find((entry) => entry.id === templateId);
  if (!template) return toast("清单模板不存在");
  const destination = scope === "公共" ? "一起准备" : "我的物品";
  show(
    template.name,
    `<div class="template-detail-head"><span class="template-symbol large module-${template.id}" aria-hidden="true">${moduleIcon(template.id, template.symbol)}</span><div><span class="template-badge">建议放入${template.recommendedScope === "公共" ? "一起准备" : "我的物品"}</span><p>${esc(template.description)}</p></div></div><ul class="template-items">${template.items.map((item) => `<li><span>${esc(item.title)}</span>${item.key ? '<em>关键项</em>' : ""}</li>`).join("")}</ul><button class="btn full" data-action="import-template" data-id="${template.id}" data-write>导入到${destination}</button><button class="text-btn template-back" data-action="templates">返回模板列表</button>`,
  );
}
function itemForm(id, categoryId) {
  const i = trip.items.find((i) => i.id === id) || {};
  const category = trip.categories.find(
    (c) => c.id === (i.categoryId || categoryId),
  );
  if (!category) {
    toast("请从对应分类旁新增条目");
    return;
  }
  show(
    id ? "编辑条目" : `新增条目 · ${category.name}`,
    form(
      "item",
      `<p class="muted">${category.owner ? "我的物品" : "一起准备"} / ${esc(category.name)}</p><input type="hidden" name="categoryId" value="${category.id}"><input type="hidden" name="scope" value="${category.owner ? "我的" : "公共"}">${field("条目名称", "title", i.title || "", "text", true)}<label class="field inline"><input name="key" type="checkbox" ${i.key ? "checked" : ""}>关键项：出发前需要再次确认</label>${field("提醒时间（选填，北京时间）", "remind", i.remind || "", "datetime-local")}${field("关联行程日期（选填）", "linkedDate", i.linkedDate || "", "date")}${i.remind ? `<button type="button" class="btn secondary full" data-action="cal-item" data-id="${i.id}">${icon("calendar")} 添加到手机日历</button><p class="muted">修改提醒时间后需重新更新日历。</p>` : ""}`,
      i.id || "",
      i.id ? "deleteItem" : "",
    ),
  );
}
function eventForm(id, date) {
  const e = trip.events.find((e) => e.id === id) || {};
  show(
    id ? "编辑行程安排" : "添加行程安排",
    form(
      "event",
      `${field("做什么", "title", e.title || "", "text", true)}${field("日期", "date", e.date || date || selected, "date", true)}<div class="form-grid">${field("开始时间", "startTime", e.startTime || e.time || "", "time", true)}${field("结束时间", "endTime", e.endTime || "", "time", true)}</div><div class="period-rule"><strong>按开始时间自动归类</strong><span>上午 08:00—13:00 · 下午 13:00—18:00 · 晚上 18:00—23:00</span><span>跨越时段的安排会连续显示在多个时段卡中。</span></div><div class="form-grid">${field("起始地（选填）", "startPlace", e.startPlace || "")}${field("目的地（选填）", "endPlace", e.endPlace || "")}</div>${field("详细地址（选填）", "address", e.address || "")}${note("备注（选填）", "note", e.note || "")}`,
      e.id || "",
      e.id ? "deleteEvent" : "",
    ),
  );
}
function hotelForm(id, date) {
  const h = trip.hotels.find((h) => h.id === id) || {},
    d = h.checkin || date || selected;
  show(
    id ? "编辑住宿" : "添加住宿",
    form(
      "hotel",
      `${field("城市", "city", h.city || "", "text", true)}${field("酒店名称", "name", h.name || "", "text", true)}${field("酒店地址", "address", h.address || "", "text", true)}<div class="form-grid">${field("入住日期", "checkin", d, "date", true)}${field("退房日期", "checkout", h.checkout || addDay(d, 1), "date", true)}</div>${field("酒店电话（选填）", "phone", h.phone || "", "tel")}${note("入住须知 / 停车入口（选填）", "note", h.note || "")}`,
      h.id || "",
      h.id ? "deleteHotel" : "",
    ),
  );
}
function members() {
  const own = trip.me === trip.creator;
  show(
    "一起出发的人",
    `<p class="muted">公共清单一起确认，个人物品各自准备。</p><div class="identity-note"><strong>你的身份会保存在这台设备</strong><span>正常关闭网页后再打开仍可继续使用。换手机、使用无痕模式或清除浏览器数据前，请先生成自己的恢复链接。</span></div>${own && !trip.archived ? `<button class="btn full" data-action="invite">${icon("users")} 复制邀请链接</button><p class="muted">链接仅分享给同行人。对方打开后填写昵称即可加入。</p>` : ""}<div class="members">${trip.members.map((m) => `<div><div class="row"><span class="member-name-row">${avatarImage(m)}<span>${esc(m.name)}</span> ${m.id === trip.creator ? '<span class="pill">创建者</span>' : ""}</span></div>${(own || m.id === trip.me) && !trip.archived ? `<div class="small-actions"><button data-action="recovery" data-id="${m.id}">${m.id === trip.me ? "保存我的恢复链接" : "为此成员生成恢复链接"}</button>${own && m.id !== trip.creator ? `<button data-action="removeMember" data-id="${m.id}">移除成员</button>` : ""}</div>` : ""}</div>`).join("")}</div>${own && !trip.archived ? '<div class="subtle"><button class="text-btn" data-action="rotate">使旧邀请失效，生成新链接</button></div>' : ""}`,
  );
}
async function settings() {
  trips = await api("trips");
  show(
    "旅行与设置",
    `<p class="muted">${esc(trip.name)} · ${trip.archived ? "已归档" : "当前旅行"}</p><div class="stack"><button class="btn secondary full" data-action="create">新建旅行</button>${!trip.archived ? '<button class="btn secondary full" data-action="edit-trip">编辑名称与出发归来时间</button>' : ""}${trip.me === trip.creator ? '<button class="btn secondary full" data-action="export-trip">下载旅行备份</button>' : ""}${trip.me === trip.creator && !trip.archived ? '<button class="btn danger full" data-action="archive">归档当前旅行</button>' : ""}</div><div class="section-head"><h3>我的旅行</h3></div>${trips.map((t) => `<button class="archive-item" data-action="switch" data-id="${t.id}"><strong>${esc(t.name)}</strong><span>${pretty(day(t.start))} — ${pretty(day(t.end))} · ${t.archived ? "已归档" : "进行中"}</span></button>`).join("")}<p class="muted">所有时间按北京时间显示。正常关闭网页不会丢失身份；换设备或清除浏览器数据前，请在“同行成员”中保存自己的恢复链接。</p>`,
  );
  if (trip.me === trip.creator) {
    const area = document.createElement("div");
    area.className = "subtle";
    area.innerHTML =
      '<button class="btn danger full" data-action="delete-trip">删除整趟旅行</button><p class="muted">用于清理测试旅行。删除需要二次确认，会同时删除所有同行人的这趟旅行数据。</p>';
    modal.querySelector(".modal-body").append(area);
  }
}
function profileForm() {
  const me = trip.members.find((member) => member.id === trip.me);
  const used = trip.members.filter((member) => member.id !== trip.me).map((member) => member.avatarId);
  const allUsed = trip.members.map((member) => member.avatarId);
  const allowDuplicates = avatars.every((avatar) => allUsed.includes(avatar.id));
  show("编辑我的资料", form("profile", `${field("昵称", "name", me.name, "text", true)}${avatarPicker(me.avatarId, used, allowDuplicates, me.avatarData || "")}`));
}
function myTripMember(member, own) {
  const canManage = (own || member.id === trip.me) && !trip.archived;
  return `<div class="my-trip-member"><div class="my-trip-member-main">${avatarImage(member, "list-avatar")}<div><strong>${esc(member.name)}</strong><span>${member.id === trip.creator ? "创建者" : "同行成员"}${member.id === trip.me ? " · 我" : ""}</span></div></div>${canManage ? `<div class="my-trip-member-actions"><button data-action="recovery" data-id="${member.id}">${member.id === trip.me ? "身份恢复" : "恢复链接"}</button>${own && member.id !== trip.creator ? `<button class="danger-link" data-action="removeMember" data-id="${member.id}">移除</button>` : ""}</div>` : ""}</div>`;
}
function myTripCard(entry, own) {
  const current = entry.id === trip.id;
  const status = entry.archived ? "已归档" : current ? "当前旅程" : "进行中";
  if (!current) return `<button class="my-trip-card archive" data-action="switch" data-id="${entry.id}"><div class="my-trip-card-head"><strong>${esc(entry.name)}</strong><span class="trip-status">${status}</span></div><div class="my-trip-dates">${pretty(day(entry.start))}<span>→</span>${pretty(day(entry.end))}</div></button>`;
  return `<article class="my-trip-card current ${entry.archived ? "archived" : ""}"><div class="my-trip-card-head"><div><h3>${esc(entry.name)}</h3><span class="trip-status">${status}</span></div><span class="my-trip-count">${trip.members.length} 人同行</span></div><div class="my-trip-dates">${pretty(day(entry.start))}<span>→</span>${pretty(day(entry.end))}</div>${own && !entry.archived ? `<div class="my-trip-invite"><span>把邀请链接发给同行人</span><button data-action="invite">复制邀请链接</button></div>` : ""}<div class="my-trip-members">${trip.members.map((member) => myTripMember(member, own)).join("")}</div><div class="my-trip-actions">${!entry.archived ? `<button data-action="edit-trip" data-write>${icon("edit")} 编辑旅行</button>` : ""}${own ? `<button data-action="export-trip">${icon("arrow")} 导出备份</button>` : ""}${own && !entry.archived ? `<button data-action="archive" data-write>${icon("more")} 归档旅行</button>` : ""}${own ? `<button class="danger" data-action="delete-trip" data-write>${icon("trash")} 删除旅行</button>` : ""}</div>${own && !entry.archived ? `<button class="text-btn rotate-link" data-action="rotate">更换邀请链接，使旧链接失效</button>` : ""}</article>`;
}
function memberCenter() {
  const me = trip.members.find((member) => member.id === trip.me);
  const own = trip.me === trip.creator;
  return `<section class="my-profile-section"><div class="section-head"><h2>我的资料</h2><button class="text-btn" data-action="profile" data-write>${icon("edit")} 编辑资料</button></div><div class="card my-profile-card">${avatarImage(me, "profile-avatar")}<div class="my-profile-copy"><h2>${esc(me.name)}</h2><span class="pill">${own ? "创建者" : "同行成员"}</span><p class="muted">身份保存在这台设备</p></div></div></section>
    <section class="my-trips-section"><div class="section-head"><h2>旅行管理</h2><button class="text-btn" data-action="create">${icon("plus")} 新建旅行</button></div><div class="my-trip-list">${trips.map((entry) => myTripCard(entry, own)).join("")}</div></section>`;
}
function deleteItemPrompt(id) {
  const item = trip.items.find((entry) => entry.id === id);
  if (!item) return;
  show(
    "删除清单条目",
    `<div class="notice warn"><strong>${esc(item.title)}</strong><p>${item.owner ? "这条内容只会从你的个人清单中移除。" : "删除后，同行人的公共清单中也会移除这条内容。"}</p></div><div class="form-actions"><button class="btn secondary" data-action="close">取消</button><button class="btn danger" data-action="confirm-delete-item" data-id="${item.id}">确认删除</button></div>`,
  );
}
function deleteTripPrompt() {
  show(
    "删除整趟旅行？",
    `<div class="notice warn"><strong>${esc(trip.name)}</strong><p>这趟旅行的行程、酒店、公共与个人清单、成员和邀请都会删除，所有同行人将无法继续访问。</p><p>归档会保留记录；删除后页面中无法找回。</p></div><div class="form-actions"><button class="btn secondary" data-action="close">保留旅行</button><button class="btn danger" data-action="confirm-delete-trip">继续删除</button></div>`,
  );
}
async function confirmTripDeletion() {
  const result = await api("trips/" + trip.id, {
    action: "prepareDeletion",
    revision: trip.revision,
  });
  show(
    "最后确认 · 永久删除",
    `<form data-form="deleteTrip" data-revision="${trip.revision}"><p>请输入旅行名称 <strong>${esc(trip.name)}</strong>，确认删除整趟旅行。</p><input type="hidden" name="challenge" value="${result.challenge}">${field("输入旅行名称确认", "confirmName", "", "text", true)}<p class="error" role="alert"></p><div class="form-actions"><button type="button" class="btn secondary" data-action="close">取消</button><button type="submit" class="btn danger">确认永久删除</button></div></form>`,
  );
}
async function copy(v) {
  try {
    await navigator.clipboard.writeText(v);
    toast("已复制");
  } catch {
    show(
      "复制内容",
      `<p class="muted">长按或选中下面的内容复制。</p><div class="link-output">${esc(v)}</div>`,
    );
  }
}
function icsEvent(title, time, uid) {
  return calendarEvent(title, time, uid, trip.revision);
}
function downloadCalendar(events) {
  if (!events.length) {
    toast("准备节点已过，可为具体事项设置新提醒");
    return;
  }
  const text = calendarFile(events);
  const file = new File([text], "向野-旅行提醒.ics", {
    type: "text/calendar;charset=utf-8",
  });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    navigator
      .share({
        files: [file],
        title: "向野旅行提醒",
        text: "请选择手机日历打开并确认导入。",
      })
      .then(() => toast("已打开分享面板，请选择日历并确认导入。"))
      .catch((error) => {
        if (error?.name !== "AbortError") toast("分享失败，请改用下载方式导入日历。");
      });
    return;
  }
  const url = URL.createObjectURL(
      file,
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "向野-旅行提醒.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast("日历文件已生成，请打开并确认导入；修改时间后需重新添加。");
}
async function prepareTicketImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw Error("请选择 JPG、PNG 或 WebP 图片");
  if (file.size > 20 * 1024 * 1024) throw Error("原图不能超过 20MB");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = .9;
  let blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  while (blob && blob.size > 2800000 && quality > .62) {
    quality -= .08;
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }
  if (!blob || blob.size > 3000000) throw Error("图片处理后仍然过大，请先裁剪后重试");
  const imageBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
  return { imageBase64, mime: "image/jpeg", size: blob.size };
}

async function prepareAvatarImage(file) {
  if (!file?.type?.match(/^image\/(jpeg|png|webp)$/)) throw Error("请选择 JPG、PNG 或 WebP 图片");
  if (file.size > 12 * 1024 * 1024) throw Error("头像图片不能超过 12MB");
  const bitmap = await createImageBitmap(file);
  const size = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 320;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, 320, 320);
  context.drawImage(
    bitmap,
    Math.round((bitmap.width - size) / 2),
    Math.round((bitmap.height - size) / 2),
    size,
    size,
    0,
    0,
    320,
    320,
  );
  bitmap.close?.();
  let quality = 0.86;
  let blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  while (blob && blob.size > 150 * 1024 && quality > 0.5) {
    quality -= 0.08;
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }
  if (!blob) throw Error("无法处理这张图片，请换一张重试");
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("无法读取这张图片，请换一张重试"));
    reader.readAsDataURL(blob);
  });
}
document.addEventListener("change", async (event) => {
  const avatarInput = event.target.closest("[data-avatar-file]");
  if (avatarInput) {
    const picker = avatarInput.closest(".avatar-picker");
    try {
      const avatarData = await prepareAvatarImage(avatarInput.files?.[0]);
      picker.querySelector('input[name="avatarData"]').value = avatarData;
      picker.querySelector('input[name="avatarId"]').value = "";
      picker.querySelectorAll(".avatar-option").forEach((option) => option.classList.remove("selected"));
      const upload = avatarInput.closest(".avatar-upload");
      upload.classList.add("selected");
      upload.querySelector(".avatar-upload-preview").innerHTML = `<img src="${esc(avatarData)}" alt="自定义头像预览">`;
    } catch (error) {
      avatarInput.value = "";
      toast(error.message);
    }
    return;
  }
  const input = event.target.closest("[data-ticket-file]");
  if (!input) return;
  const name = input.closest(".ticket-file-picker")?.querySelector("[data-ticket-file-name]");
  if (name) name.textContent = input.files?.[0]?.name || "选择票据图片";
});
document.addEventListener("click", async (ev) => {
  const pickerInput = ev.target.closest("[data-picker]");
  if (pickerInput) {
    ev.preventDefault();
    ev.stopPropagation();
    openPicker(pickerInput);
    return;
  }
  const b = ev.target.closest("[data-action]");
  if (!b || b.disabled) return;
  const a = b.dataset.action,
    id = b.dataset.id;
  try {
    switch (a) {
      case "close":
        modal.close();
        break;
      case "tab":
        tab = b.dataset.value;
        if (tab === "people") trips = await api("trips");
        render();
        window.scrollTo(0, 0);
        break;
      case "choose-avatar": {
        const grid = b.closest(".avatar-picker");
        grid.querySelector('input[name="avatarId"]').value = b.dataset.value;
        grid.querySelector('input[name="avatarData"]').value = "";
        grid.querySelectorAll(".avatar-option").forEach((option) => {
          const selected = option === b;
          option.classList.toggle("selected", selected);
          option.setAttribute("aria-pressed", String(selected));
        });
        break;
      }
      case "profile":
        profileForm();
        break;
      case "add-ticket":
        ticketCreateForm(b.dataset.date);
        break;
      case "view-ticket":
        ticketPreview(id);
        break;
      case "edit-ticket":
        ticketMetaForm(id);
        break;
      case "delete-ticket":
        deleteTicketPrompt(id);
        break;
      case "confirm-delete-ticket":
        await mutate({ action: "deleteTicket", id });
        modal.close();
        toast("票据已删除");
        break;
      case "scope":
        scope = b.dataset.value;
        render();
        break;
      case "date":
        selected = b.dataset.value;
        {
          const x = $(".date-strip")?.scrollLeft;
          render();
          $(".date-strip").scrollLeft = x;
        }
        break;
      case "create":
        trips = await api("trips");
        tripForm();
        break;
      case "edit-trip":
        tripForm(true);
        break;
      case "item":
        itemForm(id, b.dataset.category);
        break;
      case "category":
        categoryForm();
        break;
      case "templates":
        templateLibrary();
        break;
      case "template-preview":
        templateDetail(id);
        break;
      case "import-template":
        await mutate({ action: "importTemplate", templateId: id, scope });
        modal.close();
        toast(`已导入到${scope === "公共" ? "一起准备" : "我的物品"}`);
        break;
      case "delete-trip":
        deleteTripPrompt();
        break;
      case "confirm-delete-trip":
        await confirmTripDeletion();
        break;
      case "event":
        eventForm(id, b.dataset.date);
        break;
      case "hotel":
        hotelForm(id, b.dataset.date);
        break;
      case "members":
        members();
        break;
      case "settings":
        await settings();
        break;
      case "copy":
        await copy(b.dataset.value);
        break;
      case "invite":
        await copy(location.origin + "/?invite=" + trip.invite);
        break;
      case "toggle":
      case "review":
        await mutate({ action: a, id });
        toast(a === "review" ? "复核状态已保存" : "已保存");
        break;
      case "deleteItem":
        deleteItemPrompt(id);
        break;
      case "confirm-delete-item":
        await mutate({ action: "deleteItem", id });
        modal.close();
        toast("条目已删除");
        break;
      case "deleteEvent":
      case "deleteHotel":
      case "removeMember":
      case "archive":
      case "rotate":
        if (
          confirm(
            {
              archive: "归档后将只可查看，确认归档这趟旅行？",
              rotate: "旧邀请链接将立即失效，已加入的成员不受影响。确认更换？",
              removeMember: "确认移除这位成员及其个人清单？",
            }[a] || "确认删除？此操作无法撤销。",
          )
        ) {
          await mutate({ action: a, id, member: id });
          if (modal.open) modal.close();
          toast("已完成");
        }
        break;
      case "recovery": {
        const v = await mutate({ action: "recovery", member: id });
        const selfRecovery = id === trip.me;
        show(
          "恢复身份链接",
          `<p>${selfRecovery ? "请把链接保存到只有自己能访问的地方，换手机时在新设备打开。" : "把此链接单独发送给对应成员，在新手机上打开。"}</p><p class="muted">链接 24 小时有效，仅可使用一次。成功恢复后，旧设备上的这趟旅行身份会失效。</p><div class="link-output">${esc(location.origin + "/?recover=" + v.code)}</div><button class="btn full" data-action="copy" data-value="${esc(location.origin + "/?recover=" + v.code)}">复制恢复链接</button>`,
        );
        break;
      }
      case "switch":
        trip = await api("trips/" + id);
        localStorage.setItem("suixing-trip", id);
        selected = clampDay();
        tab = "today";
        if (modal.open) modal.close();
        render();
        break;
      case "cal-item": {
        const i = trip.items.find((i) => i.id === id);
        downloadCalendar([icsEvent(i.title, i.remind, i.id)]);
        break;
      }
      case "cal-prep":
        downloadCalendar(
          [7, 3, 1]
            .map((n) => ({ n, date: addDay(trip.start, -n) }))
            .filter((x) => new Date(x.date + "T09:00:00+08:00") > new Date())
            .map(({ n, date }) =>
              icsEvent(
                `${trip.name} · 出发前 ${n} 天${n === 1 ? "：复核关键清单" : "：准备检查"}`,
                date + "T09:00",
                trip.id + "-prep-" + n,
              ),
            ),
        );
        break;
      case "export-trip": {
        const exported = await api("trips/" + trip.id, { action: "exportTrip", revision: trip.revision });
        const url = URL.createObjectURL(new Blob([JSON.stringify(exported.exportData, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `向野-${trip.name}-备份.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        toast("旅行备份已下载");
        break;
      }
    }
  } catch (e) {
    toast(e.message);
  }
});
document.addEventListener("submit", async (ev) => {
  const f = ev.target.closest("form[data-form]");
  if (!f) return;
  ev.preventDefault();
  const submit = f.querySelector("[type=submit]");
  submit.disabled = true;
  const data = Object.fromEntries(new FormData(f)),
    kind = f.dataset.form;
  f.querySelectorAll("[data-picker]").forEach((input) => {
    data[input.name] = input.dataset.value || "";
  });
  try {
    if ((kind === "create" || kind === "join" || kind === "profile") && !data.avatarId && !data.avatarData)
      throw Error("请选择一个头像");
    if ((kind === "create" || kind === "trip") && data.startDate && data.endDate) {
      data.start = `${data.startDate}T${data.startTime || "08:00"}`;
      data.end = `${data.endDate}T${data.endTime || "18:00"}`;
    }
    if (kind === "ticketCreate") {
      const file = f.querySelector("[data-ticket-file]")?.files?.[0];
      if (!file) throw Error("请选择票据图片");
      toast("正在处理并上传票据…");
      const image = await prepareTicketImage(file);
      const result = await api("upload-ticket", {
        tripId: trip.id,
        revision: Number(f.dataset.revision),
        type: data.type,
        startTime: data.startTime,
        ...image,
      });
      trip = result.trip;
      modal.close();
      render();
      toast("票据已添加");
      return;
    } else if (kind === "deleteTrip") {
      await api("trips/" + trip.id, {
        action: "deleteTrip",
        ...data,
        revision: Number(f.dataset.revision),
      });
      trip = null;
      trips = [];
      localStorage.removeItem("suixing-trip");
      tab = "today";
      modal.close();
      await boot();
      toast("整趟旅行已删除");
      return;
    } else if (kind === "create" || kind === "join" || kind === "recover") {
      const v = await api(kind, { ...data, invite, code: recovery });
      remember(v);
      invite = null;
      recovery = null;
      tab = "today";
    } else {
      const old =
        kind === "trip"
          ? trip.start + "|" + trip.end
          : kind === "item"
            ? trip.items.find((i) => i.id === f.dataset.id)?.remind
            : null;
      await mutate({
        ...data,
        action: kind,
        id: f.dataset.id || undefined,
        key: data.key === "on",
        revision: Number(f.dataset.revision),
      });
      if (
        (kind === "trip" && old !== trip.start + "|" + trip.end) ||
        (kind === "item" && old && old !== data.remind)
      )
        toast("已保存时间修改，请重新更新手机日历。");
      else toast("已保存");
    }
    modal.close();
    render();
  } catch (e) {
    f.querySelector(".error").textContent =
      e.message === "保存失败，请稍后重试"
        ? "没有加入成功，请检查邀请链接后重试。"
        : e.message;
    f.dataset.revision = trip?.revision ?? 0;
  } finally {
    submit.disabled = false;
  }
});
async function boot() {
  try {
    await ensureAuth();
    trips = await api("trips");
    const chosen =
      trips.find(
        (t) => t.id === localStorage.getItem("suixing-trip") && !t.archived,
      ) ||
      trips.find((t) => !t.archived) ||
      trips[0];
    if (chosen) {
      trip = await api("trips/" + chosen.id);
      selected = clampDay();
    }
    render();
    if (invite) {
      const preview = await api("invite-preview", { invite });
      show(
        `加入 · ${preview.tripName}`,
        form(
          "join",
          field("你的昵称", "nickname", "", "text", true) +
            avatarPicker("", preview.usedAvatarIds, preview.allowDuplicates) +
            '<p class="muted">无需注册。昵称仅用于同行展示；加入后可以共同编辑行程、住宿和公共清单。本机浏览器会记住你的身份。</p>',
        ),
      );
    }
    if (recovery)
      show(
        "在这台手机恢复身份",
        form(
          "recover",
          "<p>恢复后，旧设备的访问身份将失效。请确认这是创建者发给你的专属链接。</p>",
        ),
      );
  } catch (e) {
    render();
    toast(e.message);
  }
}
window.addEventListener("offline", () => {
  connection = false;
  render();
  toast("已断网，无法保存");
});
window.addEventListener("online", () =>
  (trip ? refresh() : boot()).catch((e) => toast(e.message)),
);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh().catch(() => {});
});
setInterval(async () => {
  if (trip && navigator.onLine && !modal.open && !busy && !document.hidden) {
    try {
      const wasDisconnected = !connection;
      const next = await api("trips/" + trip.id);
      const changed = Number(next.revision) !== Number(trip.revision);
      trip = next;
      if (changed || wasDisconnected) render();
    } catch (e) {
      if (e.status === 403) {
        trip = null;
        localStorage.removeItem("suixing-trip");
        render();
        toast("访问权限已变更，请重新打开邀请或恢复链接。");
      } else {
        if (!wasDisconnected) render();
      }
    }
  }
}, 4000);
boot();
