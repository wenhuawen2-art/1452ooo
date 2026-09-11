import cloudbase from "@cloudbase/js-sdk";
import { calendarEvent, calendarFile } from "./calendar.js";

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
  calendar: "M4 5h16v16H4V5m3-3v6m10-6v6M4 11h16",
};
const icon = (n) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.road}"/></svg>`;
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
  connection = true;
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
    else if (path === "recover") [operation, payload] = ["recoverMember", data];
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
const pickerTypes = new Set(["date", "time", "datetime-local", "range"]);
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
const note = (label, name, value = "") =>
  `<label class="field">${label}<textarea name="${name}" maxlength="2000">${esc(value)}</textarea></label>`;
function form(kind, fields, id = "", del = "") {
  return `<form data-form="${kind}" data-id="${id}" data-revision="${trip?.revision ?? 0}">${fields}<p class="error" role="alert"></p><div class="form-actions">${del ? `<button type="button" class="btn danger" data-action="${del}" data-id="${id}">删除</button>` : ""}<button class="btn" type="submit">${kind === "create" ? "创建旅行" : kind === "join" ? "加入旅行" : kind === "recover" ? "恢复我的身份" : "保存"}</button></div></form>`;
}
let pickerState = null;
const pad2 = (n) => String(n).padStart(2, "0");
const dateOnly = (value) => String(value || "").slice(0, 10);
function parsePickerState(input) {
  const type = input.dataset.picker;
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
function openPicker(input) {
  pickerState = parsePickerState(input);
  if (!picker.open) picker.showModal();
  pickerState.stage === "time" ? pickerTimeView() : pickerDateView();
}
function commitPicker() {
  const s = pickerState;
  if (!s) return;
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
picker.addEventListener("click", (event) => {
  const target = event.target.closest("[data-picker-action], [data-picker-date], [data-picker-hour], [data-picker-minute]");
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
  } else if (target.dataset.pickerAction === "cancel") {
    picker.close();
    pickerState = null;
  }
});
function brand() {
  return `<header class="topbar"><div class="brand"><span class="brand-mark">${icon("road")}</span><span>随行<small>ON THE ROAD</small></span></div>${trip ? `<div class="top-actions"><button class="icon-btn" data-action="members" aria-label="同行成员">${icon("users")}</button><button class="icon-btn" data-action="settings" aria-label="旅行设置">${icon("more")}</button></div>` : '<span class="eyebrow">轻装出发</span>'}</header>`;
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
  app.innerHTML = `${!navigator.onLine || !connection ? '<div class="offline-bar" role="alert">连接已断开 · 当前内容尚未更新，联网后才能保存</div>' : ""}<main class="shell">${brand()}${trip.archived ? '<div class="notice">这趟旅行已归档，内容仅供查看。<button class="text-btn" data-action="create">新建旅行</button></div>' : ""}${tab === "today" ? today() : tab === "route" ? route() : checklist()}</main><nav class="bottom-nav" aria-label="主要导航">${[
    ["today", "sun", "今天"],
    ["route", "map", "行程"],
    ["list", "list", "清单"],
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
  const schedule = `<div class="section-head"><h2>${d > 0 ? "出发日安排" : nowDay() > day(trip.end) ? "最后一天安排" : "今天的安排"}</h2><span class="muted">${pretty(target)}</span></div>${eventsCard(target)}${hotelCard(target)}`;
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
  return `<div class="page-heading"><div><span class="eyebrow">${pretty(nowDay())} · ${weekday(nowDay())}</span><h1>${d > 0 ? "旅途将近，准备出发。" : nowDay() > day(trip.end) ? "到家了，好好休息。" : "今天，也有好风景。"}</h1></div></div><section class="hero card ${d <= 0 ? "on-trip" : ""}"><div class="row"><span class="pill">${trip.archived ? "旅行回忆" : d > 0 ? "即将出发" : nowDay() > day(trip.end) ? "已归来" : "正在路上"}</span><span class="muted">${gap(trip.start, trip.end) + 1} 天旅程</span></div><h2>${esc(trip.name)}</h2><p class="muted">${pretty(day(trip.start))} ${trip.start.slice(11)} 出发 → ${pretty(day(trip.end))} ${trip.end.slice(11)} 归来</p>${d > 0 ? '<svg class="route-art" viewBox="0 0 550 70"><path d="M5 50C100 50 70 5 160 20S275 75 345 35 455 5 540 25"/><circle cx="5" cy="50" r="4"/><circle cx="540" cy="25" r="5"/></svg>' : `<p class="muted">${target === day(trip.end) ? "今日归来" : `今晚 · ${hotel ? esc(hotel.city + " / " + hotel.name) : "住宿尚未填写"}`}</p>`}<div class="hero-foot"><span>${d > 0 ? `距离出发 <strong>${d}</strong> 天` : nowDay() > day(trip.end) ? "本次旅程已结束" : `旅行第 <strong>${gap(trip.start, nowDay()) + 1}</strong> 天`}</span><button class="text-btn" style="color:#d6ece8" data-action="tab" data-value="route">完整行程 →</button></div></section>${nowDay() === day(trip.end) ? `<div class="notice">今天归来 · 预计 ${trip.end.slice(11)}，记得给返程留足时间。</div>` : ""}${d > 0 ? preparation + schedule : schedule + preparation}`;
}
const eventList = (d) =>
  trip.events
    .filter((e) => e.date === d)
    .sort(
      (a, b) =>
        ["上午", "下午", "晚上"].indexOf(a.period) -
          ["上午", "下午", "晚上"].indexOf(b.period) ||
        (a.time || "").localeCompare(b.time || ""),
    );
function addresses(address) {
  return address
    ? `<div class="small-actions"><button data-action="copy" data-value="${esc(address)}">复制地址</button><a href="https://uri.amap.com/search?keyword=${encodeURIComponent(address)}&callnative=1" target="_blank" rel="noopener noreferrer">打开地图 ↗</a></div>`
    : "";
}
function eventsCard(d) {
  const items = eventList(d);
  return `<div class="card">${items.length ? `<div class="timeline">${items.map((e) => `<div class="timeline-entry"><div class="time-label">${e.period}</div><div class="timeline-body"><div class="row"><h3>${esc(e.title)}</h3><button class="edit-item" data-action="event" data-id="${e.id}" aria-label="编辑 ${esc(e.title)}" data-write>${icon("edit")}</button></div><p class="event-time">${esc(e.startTime || e.time || "开始待补充")} — ${esc(e.endTime || "结束待补充")}</p>${e.address ? `<p class="muted">${esc(e.address)}</p>` : ""}${e.note ? `<p>${esc(e.note)}</p>` : ""}${addresses(e.address)}</div></div>`).join("")}</div>` : `<div class="empty"><p>这一天的安排尚未填写</p><button class="btn secondary" data-action="event" data-date="${d}" data-write>${icon("plus")} 添加安排</button></div>`}</div>`;
}
function hotelCard(d) {
  const h = trip.hotels.find((h) => h.checkin <= d && d < h.checkout);
  return h
    ? `<div class="card hotel"><div class="hotel-heading">${icon("hotel")}<div><div class="muted">${d === nowDay() ? "今晚住宿" : "当晚住宿"} · ${esc(h.city)}</div><h3>${esc(h.name)}</h3></div></div><p class="muted">${esc(h.address)}</p><p class="muted">${pretty(h.checkin)} 入住 · ${pretty(h.checkout)} 退房</p>${h.note ? `<p>${esc(h.note)}</p>` : ""}${addresses(h.address)}<div class="small-actions">${h.phone ? `<a href="tel:${esc(h.phone.replace(/[^\d+ -]/g, ""))}">致电 ${esc(h.phone)}</a>` : ""}<button data-action="hotel" data-id="${h.id}" data-write>编辑住宿</button></div></div>`
    : `<div class="card hotel"><div class="row"><div><h3>${d === day(trip.end) ? "归来日" : "当晚住宿"}</h3><span class="muted">${d === day(trip.end) ? "今天归来，无需填写住宿" : "尚未填写"}</span></div>${d !== day(trip.end) ? `<button class="text-btn" data-action="hotel" data-date="${d}" data-write>添加住宿 +</button>` : ""}</div></div>`;
}
function route() {
  const days = Array.from({ length: gap(trip.start, trip.end) + 1 }, (_, i) =>
    addDay(trip.start, i),
  );
  return `<div class="date-strip" aria-label="选择行程日期">${days.map((d) => `<button class="date-btn ${selected === d ? "active" : ""}" data-action="date" data-value="${d}" ${selected === d ? 'aria-current="date"' : ""}><span>${weekday(d)}</span><strong>${Number(d.slice(8))}</strong><span>${Number(d.slice(5, 7))} 月</span></button>`).join("")}</div><div class="section-head"><h2>${pretty(selected)} · 第 ${gap(trip.start, selected) + 1} 天</h2><button class="text-btn" data-action="event" data-date="${selected}" data-write>添加安排 +</button></div>${eventsCard(selected)}${hotelCard(selected)}`;
}
function itemRow(i) {
  const reviewing = gap(nowDay(), trip.start) <= 1;
  return `<div class="check-row ${i.done ? "done" : ""}"><button class="check-main" data-action="toggle" data-id="${i.id}" role="checkbox" aria-checked="${i.done}" data-write><span class="checkbox">${i.done ? icon("check") : ""}</span><span><span class="item-title">${esc(i.title)}</span><span class="item-meta">${i.key ? '<span class="key-dot">● 关键项</span>' : ""}${i.done ? (i.owner ? "已准备" : esc(i.by || "同行人") + " 已确认") : ""}${i.remind ? `<br>${pretty(day(i.remind))} ${i.remind.slice(11)} 提醒` : ""}${i.linkedDate ? ` · 关联 ${pretty(i.linkedDate)} 行程` : ""}</span></span></button>${i.key && i.done && reviewing ? `<button class="review-btn ${i.reviewed ? "checked" : ""}" data-action="review" data-id="${i.id}" data-write>${i.reviewed ? "已复核" : "再确认"}</button>` : ""}<button class="edit-item" data-action="item" data-id="${i.id}" aria-label="编辑 ${esc(i.title)}" data-write>${icon("more")}</button></div>`;
}
function checklist() {
  const items = trip.items.filter((i) =>
      scope === "公共" ? !i.owner : !!i.owner,
    ),
    p = progress(items);
  const categories = trip.categories.filter((c) =>
    scope === "公共" ? !c.owner : c.owner === trip.me,
  );
  return `<div class="segment">${["公共", "我的"].map((s) => `<button class="${scope === s ? "active" : ""}" data-action="scope" data-value="${s}">${s === "公共" ? "一起准备" : "我的物品"}</button>`).join("")}</div><div class="row"><span class="muted">已准备 <strong>${p.done}</strong> / ${p.total} 项</span><button class="text-btn" data-action="category" data-write>新建分类 +</button></div>${bar(p.done, p.total)}${gap(nowDay(), trip.start) <= 1 ? reviewSummary() : ""}${categories
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
    )}<div class="section-head"><h2>同行人的准备</h2><button class="text-btn" data-action="members">管理同行人 →</button></div><div class="card members">${trip.progress.map((p) => `<div class="member"><div class="row"><span><span class="avatar">${esc(p.name.slice(0, 1))}</span>${esc(p.name)}${p.id === trip.me ? "（我）" : ""}</span><span class="muted">${p.done}/${p.total} 已准备</span></div>${bar(p.done, p.total)}<div class="muted">关键项复核 ${p.reviewed}/${p.keys}</div></div>`).join("")}</div>`;
}
function tripForm(edit = false) {
  const start = edit ? trip.start : addDay(nowDay(), 7) + "T08:00";
  const end = edit ? trip.end : addDay(nowDay(), 10) + "T18:00";
  show(
    edit ? "编辑旅行" : "开启一段新旅程",
    form(
      edit ? "trip" : "create",
      `${field("旅行名称", "name", edit ? trip.name : "", "text", true)}${edit ? "" : field("你的昵称", "nickname", trip?.members.find((m) => m.id === trip.me)?.name || "", "text", true)}${dateRangeField("出行日期", day(start), day(end))}<div class="form-grid">${field("出发时间（北京时间）", "startTime", start.slice(11, 16), "time", true)}${field("归来时间（北京时间）", "endTime", end.slice(11, 16), "time", true)}</div>${!edit && trips.length ? `<label class="field">复用已有清单<select name="reuse"><option value="">使用精简默认清单</option>${trips.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></label><p class="muted">仅复用公共清单和你的个人清单，完成与复核状态都会清零。</p>` : ""}${edit ? '<p class="muted">修改日期或时间后，请同步更新已添加的手机日历。</p>' : ""}`,
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
      `${field("去哪里 / 做什么", "title", e.title || "", "text", true)}${field("日期", "date", e.date || date || selected, "date", true)}${select("时段", "period", ["上午", "下午", "晚上"], e.period || "上午")}<div class="form-grid">${field("开始时间", "startTime", e.startTime || e.time || "", "time", true)}${field("结束时间", "endTime", e.endTime || "", "time", true)}</div><p class="muted">填写同一天内的完整时段；跨天安排请拆成两天。</p>${field("地址（选填）", "address", e.address || "")}${note("备注（选填）", "note", e.note || "")}`,
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
    `<p class="muted">公共清单一起确认，个人物品各自准备。</p><div class="identity-note"><strong>你的身份会保存在这台设备</strong><span>正常关闭网页后再打开仍可继续使用。换手机、使用无痕模式或清除浏览器数据前，请先生成自己的恢复链接。</span></div>${own && !trip.archived ? `<button class="btn full" data-action="invite">${icon("users")} 复制邀请链接</button><p class="muted">链接仅分享给同行人。对方打开后填写昵称即可加入。</p>` : ""}<div class="members">${trip.members.map((m) => `<div><div class="row"><span><span class="avatar">${esc(m.name.slice(0, 1))}</span>${esc(m.name)} ${m.id === trip.creator ? '<span class="pill">创建者</span>' : ""}</span></div>${(own || m.id === trip.me) && !trip.archived ? `<div class="small-actions"><button data-action="recovery" data-id="${m.id}">${m.id === trip.me ? "保存我的恢复链接" : "为此成员生成恢复链接"}</button>${own && m.id !== trip.creator ? `<button data-action="removeMember" data-id="${m.id}">移除成员</button>` : ""}</div>` : ""}</div>`).join("")}</div>${own && !trip.archived ? '<div class="subtle"><button class="text-btn" data-action="rotate">使旧邀请失效，生成新链接</button></div>' : ""}`,
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
  const url = URL.createObjectURL(
      new Blob([text], { type: "text/calendar;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "随行-旅行提醒.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast("日历文件已生成，请打开并确认导入；修改时间后需更新日历。");
}
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
        render();
        window.scrollTo(0, 0);
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
          modal.close();
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
        modal.close();
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
        link.download = `随行-${trip.name}-备份.json`;
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
    if ((kind === "create" || kind === "trip") && data.startDate && data.endDate) {
      data.start = `${data.startDate}T${data.startTime || "08:00"}`;
      data.end = `${data.endDate}T${data.endTime || "18:00"}`;
    }
    if (kind === "deleteTrip") {
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
    if (invite)
      show(
        "加入同行旅行",
        form(
          "join",
          field("你的昵称", "nickname", "", "text", true) +
            '<p class="muted">无需注册。昵称仅用于同行展示；加入后可以共同编辑行程、住宿和公共清单。本机浏览器会记住你的身份。</p>',
        ),
      );
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
      const changed = next.revision !== trip.revision;
      trip = next;
      if (changed || wasDisconnected) render();
    } catch (e) {
      if (e.status === 403) {
        trip = null;
        localStorage.removeItem("suixing-trip");
        render();
        toast("访问权限已变更，请重新打开邀请或恢复链接。");
      } else {
        connection = false;
        render();
      }
    }
  }
}, 4000);
boot();
