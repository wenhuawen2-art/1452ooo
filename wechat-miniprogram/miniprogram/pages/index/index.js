const AVATARS = [
  ["avatar-01", "羊驼", "avatar-01-alpaca.png"], ["avatar-02", "公鸡", "avatar-02-rooster.png"],
  ["avatar-03", "老鼠", "avatar-03-mouse.png"], ["avatar-04", "鳄鱼", "avatar-04-crocodile.png"],
  ["avatar-05", "大象", "avatar-05-elephant.png"], ["avatar-06", "水豚", "avatar-06-capybara.png"],
  ["avatar-07", "猫", "avatar-07-cat.png"], ["avatar-08", "狗", "avatar-08-dog.png"],
  ["avatar-09", "兔子", "avatar-09-rabbit.png"], ["avatar-10", "熊猫", "avatar-10-panda.png"],
  ["avatar-11", "狐狸", "avatar-11-fox.png"], ["avatar-12", "熊", "avatar-12-bear.png"],
  ["avatar-13", "企鹅", "avatar-13-penguin.png"], ["avatar-14", "海豹", "avatar-14-seal.png"],
  ["avatar-15", "浣熊", "avatar-15-raccoon.png"], ["avatar-16", "奶牛", "avatar-16-cow.png"],
].map(([id, name, file]) => ({ id, name, src: `/assets/avatars/${file}` }));
const TRIP_TYPES = ["自驾游", "旅游", "露营", "房车旅行", "徒步", "骑行", "亲子游", "摄影旅行", "商务出行", "探亲", "其他"];
const PERIODS = [{ name: "上午" }, { name: "下午" }, { name: "晚上" }];
const EXPENSE_CATEGORIES = ["交通出行", "自驾用车", "住宿", "餐饮", "景点活动", "购物", "保险通讯", "其他"];
const EXPENSE_CURRENCIES = ["CNY", "USD", "EUR", "JPY", "HKD", "KRW", "GBP", "AUD", "CAD", "SGD"];
const SPLIT_MODES = [{ value: "equal", label: "平均分摊" }, { value: "personal", label: "个人消费" }, { value: "custom", label: "自定义金额" }];
const OUTFIT_SCENES = ["日常出行", "户外徒步", "拍照打卡", "用餐聚会", "休息放松", "其他"];
const TRANSPORT_MODES = [{ id: "driving", label: "自驾", icon: "🚗" }, { id: "rail", label: "高铁/火车", icon: "🚄" }, { id: "flight", label: "飞机", icon: "✈" }, { id: "transit", label: "公交/地铁", icon: "🚌" }, { id: "walking", label: "步行", icon: "🚶" }, { id: "bicycling", label: "骑行", icon: "🚲" }, { id: "ferry", label: "轮渡", icon: "⛴" }, { id: "other", label: "其他", icon: "•" }];
const DEFAULT_OUTFIT_TYPES = ["上装", "下装", "外套", "内搭", "内衣", "袜子", "鞋履", "配饰"].map((name, sortOrder) => ({ id: `default-${sortOrder + 1}`, name, sortOrder, active: true }));
const { createDemoExperience } = require("./demo");
const decorateTemplate = (template) => ({ ...template, iconSrc: `/assets/template-icons/template-${template.id}.png` });
const day = (value) => String(value || "").slice(0, 10);
const todayKey = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const dayNumber = (value) => Date.parse(`${day(value)}T00:00:00Z`);
const gap = (a, b) => Math.round((dayNumber(b) - dayNumber(a)) / 86400000);
const addDay = (value, amount) => new Date(dayNumber(value) + amount * 86400000).toISOString().slice(0, 10);
const pretty = (value) => `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`;
const dateTimeDisplay = (value) => String(value || "").replace("T", " ").slice(0, 16);
const weekday = (value) => ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(`${value}T00:00:00Z`).getUTCDay()];
const avatarSrc = (value) => value?.avatarData || AVATARS.find((entry) => entry.id === value?.avatarId)?.src || AVATARS[0].src;
const decorateTripSummary = (trip) => trip ? ({ ...trip, startDisplay: dateTimeDisplay(trip.start), endDisplay: dateTimeDisplay(trip.end) }) : trip;
const decorateTrip = (trip) => trip ? ({ ...decorateTripSummary(trip), members: (trip.members || []).map((member) => ({ ...member, avatarSrc: avatarSrc(member) })), tickets: (trip.tickets || []).map((ticket) => ({ ...ticket, previewSrc: ticket.imageUrl || ticket.fileId || "" })), outfits: (trip.outfits || []).map((outfit) => ({ ...outfit, photoSrc: outfit.photoUrl || outfit.photoFileId || "", items: (outfit.items || []).map((item) => ({ ...item, photoSrc: item.photoUrl || item.photoFileId || "" })) })) }) : trip;
const activeOutfitTypes = (account) => (account?.outfitTypes?.length ? account.outfitTypes : DEFAULT_OUTFIT_TYPES).filter((entry) => entry.active !== false).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
const localId = (prefix = "local") => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const progress = (items) => ({ done: items.filter((item) => item.done).length, total: items.length });
const percent = (done, total) => total ? Math.round(done / total * 100) : 0;
const currencySymbol = (currency) => ({ CNY: "¥", USD: "$", EUR: "€", JPY: "¥", HKD: "HK$", KRW: "₩", GBP: "£", AUD: "A$", CAD: "C$", SGD: "S$" }[currency] || `${currency || "CNY"} `);
const money = (minor, currency = "CNY") => `${currencySymbol(currency)}${(Number(minor || 0) / 100).toFixed(currency === "JPY" ? 0 : 2)}`;
const splitLabel = (mode) => ({ equal: "平均分摊", personal: "个人消费", custom: "自定义金额" }[mode] || "平均分摊");
const minorFromInput = (value) => Math.round(Number(String(value || "0").replace(/,/g, "")) * 100);
const routeDistance = (meters) => Number(meters || 0) >= 1000 ? `${(Number(meters) / 1000).toFixed(Number(meters) >= 100000 ? 0 : 1)} 公里` : `${Number(meters || 0)} 米`;
const decorateRouteOverview = (overview) => {
  const rawPoints = overview?.points || [];
  const points = rawPoints.filter((point) => !point.unresolved && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)));
  const markers = points.map((point, index) => ({ id: index + 1, pointId: point.id, latitude: Number(point.latitude), longitude: Number(point.longitude), iconPath: "/assets/icons/route-marker.png", width: 28, height: 34, label: { content: `${point.role === "return" ? "返" : point.number || index + 1} ${point.label}`, color: "#17243f", fontSize: 10, borderRadius: 8, bgColor: "#ffffff", padding: 4, anchorX: -12, anchorY: -42 } }));
  const polylines = (overview?.segments || []).filter((segment) => (segment.points || []).length > 1).map((segment) => ({ points: segment.points, color: segment.color || "#4f8ee8", width: segment.width || 6, dottedLine: !!segment.dottedLine, arrowLine: !!segment.arrowLine, borderColor: segment.borderColor || "#ffffff", borderWidth: segment.borderWidth || 1 }));
  const modeSummary = [...new Set((overview?.segments || []).map((segment) => `${segment.icon || ""}${segment.label || ""}`))].join(" · ");
  const includePoints = points.length >= 2 ? (overview?.includePoints || points.map(({ latitude, longitude }) => ({ latitude, longitude }))) : [];
  return { ...overview, rawPoints, points, pointCount: points.length, startLabel: points[0]?.label || "", endLabel: points.at(-1)?.label || "", markers, polylines, includePoints, mapScale: points.length < 2 ? 8 : 5, centerLatitude: Number(points[0]?.latitude || 35), centerLongitude: Number(points[0]?.longitude || 105), distanceLabel: overview?.distanceMeters ? routeDistance(overview.distanceMeters) : "", modeSummary };
};

Page({
  data: {
    loading: true, error: "", account: null, trip: null, trips: [], tab: "today", scope: "公共",
    selectedDate: todayKey(), dates: [], dateLabel: "", tripStartDate: "", tripEndDate: "", daysUntil: 0, tripDays: 0, me: null, isOwner: false,
    publicProgress: { done: 0, total: 0, percent: 0 }, mineProgress: { done: 0, total: 0, percent: 0 },
    weather: null, weatherLoading: false, routeOverview: null, routeLoading: false, routeMapOpen: false, routeEditing: false, routeEditorPoints: [], routeSearchIndex: -1, routeSearchKeyword: "", routeSearchResults: [], transportModes: TRANSPORT_MODES, periods: [], hotel: null, selectedTickets: [], selectedOutfits: [], outfitScenes: OUTFIT_SCENES, outfitTypes: DEFAULT_OUTFIT_TYPES, checklistGroups: [], templates: [], categoryMenuId: "", expenses: [], settlements: [], expenseMembers: [], expenseSettings: {}, expenseSegment: "details", expenseGroups: [], expenseCategories: EXPENSE_CATEGORIES, expenseCurrencies: EXPENSE_CURRENCIES, splitModes: SPLIT_MODES, expenseFilters: { date: "all", category: "all", payer: "all" }, expenseSummary: { totalYuan: "0.00", myNetMinor: 0, myNetLabel: "¥0.00", todayTotal: "¥0.00", myPaidToday: "¥0.00", myOwedToday: "¥0.00", budgetProgress: 0, categoryStats: [], dailyStats: [], memberStats: [], plan: [] },
    avatars: AVATARS, tripTypes: TRIP_TYPES, modal: null, busy: false, invite: "", loginPrompt: false,
    guestMode: false, authState: "checking",
  },
  onLoad(options) { this.pendingInvite = options.invite || ""; this.bootstrap(); },
  onShow() { if (!this.data.guestMode && this.data.trip && !this.data.loading && !this.pendingChecklistActions?.size && !this.data.busy) this.refreshTrip(false); },
  async call(operation, data = {}) {
    const response = await wx.cloud.callFunction({ name: "suixing-api", data: { operation, data } });
    const envelope = response?.result;
    if (!envelope?.ok) throw Object.assign(new Error(envelope?.error || "操作失败"), { status: envelope?.status || 500, code: envelope?.code || "", requestId: envelope?.requestId || "" });
    return envelope.data;
  },
  async bootstrap() {
    this.setData({ loading: true, error: "" });
    try {
      const result = await this.call("bootstrapAccount");
      const account = { ...result.account, avatarSrc: avatarSrc(result.account) };
      this.setData({ account, outfitTypes: activeOutfitTypes(account), trips: (result.trips || []).map(decorateTripSummary) });
      if (!account.profileComplete) {
        this.loadGuestExperience();
        if (this.pendingInvite) await this.prepareGuestInvite(this.pendingInvite);
        return;
      }
      this.setData({ guestMode: false, authState: "authenticated", trip: null, expenses: [], expenseSummary: { totalYuan: "0.00", myNetMinor: 0, myNetLabel: "¥0.00" } });
      if (this.pendingInvite) { await this.prepareInvite(this.pendingInvite); this.setData({ loading: false }); return; }
      const stored = wx.getStorageSync("xiangye-current-trip");
      const chosen = result.trips.find((entry) => entry.id === stored && !entry.archived) || result.trips.find((entry) => !entry.archived) || result.trips[0];
      if (chosen) await this.loadTrip(chosen.id);
      this.setData({ loading: false });
    } catch (error) { this.loadGuestExperience(); this.notify("当前以游客模式体验"); }
  },
  retry() { this.bootstrap(); },
  loadGuestExperience() {
    const demo = createDemoExperience();
    const trip = decorateTrip(demo.trip);
    this.setData({ loading: false, error: "", guestMode: true, authState: "guest", account: { ...demo.account, avatarSrc: avatarSrc(demo.account) }, outfitTypes: DEFAULT_OUTFIT_TYPES, trip, trips: [decorateTripSummary(trip)], selectedDate: day(trip.start), weather: demo.weather, routeOverview: decorateRouteOverview(demo.routeOverview), expenses: demo.expenses, settlements: [], expenseMembers: trip.members, expenseSettings: { baseCurrency: "CNY", budgetMinor: 150000, expenseCategories: EXPENSE_CATEGORIES }, loginPrompt: false });
    this.derive();
    this.deriveExpenseView();
  },
  requireLogin(intent = "write") {
    if (!this.data.guestMode) return true;
    this.pendingAuthIntent = intent;
    this.setData({ authState: "login", loginPrompt: true });
    return false;
  },
  requireWritableTrip(intent = "write") {
    if (!this.requireLogin(intent)) return false;
    if (!this.data.trip) { this.notify("请先创建旅行"); return false; }
    if (this.data.trip.archived) { this.notify("归档旅行仅可查看"); return false; }
    return true;
  },
  startLogin(event) {
    if (event?.currentTarget?.dataset?.intent) this.pendingAuthIntent = event.currentTarget.dataset.intent;
    return this.activateWechatAccount();
  },
  dismissLogin() { this.pendingAuthIntent = ""; this.setData({ authState: "guest", loginPrompt: false }); },
  async prepareGuestInvite(invite) {
    try { const preview = await this.call("previewInvite", { invite }); this.setData({ modal: { type: "guestInvite", title: `旅行邀请 · ${preview.tripName}`, invite, values: {} } }); }
    catch { this.notify("邀请信息暂时无法读取"); }
  },
  async activateWechatAccount() {
    if (this.data.busy) return;
    this.setData({ busy: true, authState: "login" }); wx.showLoading({ title: "微信登录中" });
    try {
      const result = await this.call("activateAccount");
      const account = { ...result.account, avatarSrc: avatarSrc(result.account) };
      const intent = this.pendingAuthIntent || "";
      this.pendingAuthIntent = "";
      this.setData({ account, outfitTypes: activeOutfitTypes(account), loginPrompt: false, guestMode: false, authState: "authenticated", trip: null, trips: (result.trips || []).map(decorateTripSummary), modal: null });
      if (this.pendingInvite) await this.prepareInvite(this.pendingInvite);
      else {
        const chosen = this.data.trips.find((entry) => !entry.archived) || this.data.trips[0];
        if (chosen) await this.loadTrip(chosen.id);
        else if (intent === "createTrip") this.openCreateTrip();
        else if (intent && intent !== "login") this.notify("登录成功，请先创建旅行");
      }
    } catch (error) {
      this.setData({ authState: "guest" });
      this.notify(error.status === 401 ? "微信身份连接失败，请稍后重试或联系开发者" : (error.message || "微信登录失败，请稍后重试"));
    }
    finally { wx.hideLoading(); this.setData({ busy: false }); }
  },
  async loadTrip(id) {
    const loadVersion = this.localChangeVersion || 0;
    let trip = await this.call("getTrip", { tripId: id });
    if (loadVersion !== (this.localChangeVersion || 0)) return;
    trip = decorateTrip(trip);
    wx.setStorageSync("xiangye-current-trip", id);
    this.setData({ trip, selectedDate: this.clampDate(this.data.selectedDate, trip), invite: trip.invite || "" });
    this.derive();
    if (this.data.tab === "today") { this.loadWeather(); this.loadRouteOverview(); }
  },
  clampDate(value, trip = this.data.trip) {
    if (!trip) return todayKey();
    const candidate = value || todayKey();
    return candidate < day(trip.start) ? day(trip.start) : candidate > day(trip.end) ? day(trip.end) : candidate;
  },
  derive() {
    const trip = this.data.trip; if (!trip) return;
    const selectedDate = this.clampDate(this.data.selectedDate, trip);
    const count = Math.min(366, gap(trip.start, trip.end) + 1);
    const dates = Array.from({ length: Math.max(1, count) }, (_, index) => { const value = addDay(trip.start, index); return { value, day: Number(value.slice(8, 10)), month: Number(value.slice(5, 7)), weekday: weekday(value), active: value === selectedDate }; });
    const me = trip.members.find((entry) => entry.id === trip.me);
    const pub = progress(trip.items.filter((item) => !item.owner)); const mine = progress(trip.items.filter((item) => item.owner));
    const events = (trip.events || []).filter((entry) => entry.date === selectedDate).sort((a, b) => (a.startTime || a.time || "").localeCompare(b.startTime || b.time || ""));
    const periods = PERIODS.map((period) => ({ ...period, events: events.filter((entry) => (entry.period || this.periodFor(entry.startTime)) === period.name).map((entry) => { const mode = TRANSPORT_MODES.find((option) => option.id === entry.transportMode) || TRANSPORT_MODES.at(-1); return { ...entry, locationText: entry.address || entry.endPlace || entry.startPlace || "", transportLabel: mode.label, transportIcon: mode.icon }; }) })).filter((entry) => entry.events.length);
    const hotel = (trip.hotels || []).find((entry) => entry.checkin <= selectedDate && selectedDate < entry.checkout) || null;
    const selectedTickets = (trip.tickets || []).filter((entry) => entry.date === selectedDate);
    const selectedOutfits = (trip.outfits || []).filter((entry) => entry.date === selectedDate).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || Number(a.createdAt || 0) - Number(b.createdAt || 0));
    const categories = trip.categories.filter((entry) => this.data.scope === "公共" ? !entry.owner : entry.owner === trip.me);
    const membersById = new Map((trip.members || []).map((member) => [member.id, member]));
    const checklistGroups = categories.map((category) => ({ ...category, items: trip.items.filter((item) => item.categoryId === category.id && (this.data.scope === "公共" ? !item.owner : item.owner === trip.me)).map((item) => {
      const confirmer = membersById.get(item.byMemberId);
      return { ...item, confirmerName: confirmer?.name || item.by || "", confirmerAvatarSrc: confirmer ? avatarSrc(confirmer) : "" };
    }) }));
    this.setData({ selectedDate, dates, dateLabel: `${pretty(selectedDate)} · 第 ${gap(trip.start, selectedDate) + 1} 天`, tripStartDate: day(trip.start), tripEndDate: day(trip.end), daysUntil: Math.max(0, gap(todayKey(), trip.start)), tripDays: Math.max(1, gap(trip.start, trip.end) + 1), me: me ? { ...me, avatarSrc: avatarSrc(me) } : null, isOwner: trip.me === trip.creator, publicProgress: { ...pub, percent: percent(pub.done, pub.total) }, mineProgress: { ...mine, percent: percent(mine.done, mine.total) }, periods, hotel, selectedTickets, selectedOutfits, checklistGroups });
  },
  periodFor(time = "") { return time < "13:00" ? "上午" : time < "18:00" ? "下午" : "晚上"; },
  async refreshTrip(showLoading = true) { if (this.data.guestMode || !this.data.trip || this.pendingChecklistActions?.size || this.data.busy) return; if (showLoading) wx.showLoading({ title: "正在刷新" }); try { await this.loadTrip(this.data.trip.id); } catch (error) { this.notify(error.message); } finally { if (showLoading) wx.hideLoading(); } },
  setTab(event) {
    const tab = event.currentTarget.dataset.tab;
    const nextData = tab === "expenses" ? { tab, "expenseFilters.date": this.data.selectedDate } : { tab };
    this.setData(nextData, () => { if (tab === "today" || tab === "outfit") this.loadWeather(); if (tab === "today") this.loadRouteOverview(); if (tab === "people") this.reloadTrips(); if (tab === "expenses") this.loadExpenses(); });
  },
  async loadExpenses() {
    if (!this.data.trip) return;
    if (this.data.guestMode) return this.deriveExpenseView();
    try {
      const result = await this.call("listExpenses", { tripId: this.data.trip.id });
      this.setData({ expenses: result.expenses || [], settlements: result.settlements || [], expenseMembers: result.members || this.data.trip.members || [], expenseSettings: result.settings || {} });
      this.deriveExpenseView();
    } catch (error) { this.notify(error.message); }
  },
  deriveExpenseView() {
    const trip = this.data.trip; if (!trip) return;
    const members = this.data.expenseMembers.length ? this.data.expenseMembers : trip.members || [];
    const memberMap = new Map(members.map((member) => [member.id, member]));
    const expenses = (this.data.expenses || []).map((entry) => {
      const rate = Number(entry.exchangeRateToBase || 1), baseAmountMinor = Number(entry.baseAmountMinor || Math.round(Number(entry.amountMinor || 0) * rate));
      const participants = entry.participants?.length ? entry.participants : (entry.splitMode === "personal" ? [{ memberId: entry.payerMemberId, amountMinor: entry.amountMinor }] : members.map((member, index) => ({ memberId: member.id, amountMinor: Math.floor(Number(entry.amountMinor || 0) / members.length) + (index < Number(entry.amountMinor || 0) % members.length ? 1 : 0) })));
      return { ...entry, baseAmountMinor, participants, categoryInitial: String(entry.category || "其他").slice(0, 1), payerName: memberMap.get(entry.payerMemberId)?.name || "未知成员", displayAmount: money(entry.amountMinor, entry.currency), baseDisplay: entry.currency && entry.currency !== (this.data.expenseSettings.baseCurrency || "CNY") ? `约 ${money(baseAmountMinor, this.data.expenseSettings.baseCurrency || "CNY")}` : "", splitLabel: splitLabel(entry.splitMode), participantCount: participants.length };
    });
    const balances = new Map(members.map((member) => [member.id, { memberId: member.id, name: member.name, avatarSrc: avatarSrc(member), paidMinor: 0, owedMinor: 0, netMinor: 0 }]));
    const dateTotals = {}, dateCounts = {}, categoryTotals = {}, categoryCounts = {};
    expenses.forEach((entry) => {
      const amount = entry.baseAmountMinor; dateTotals[entry.date] = (dateTotals[entry.date] || 0) + amount; dateCounts[entry.date] = (dateCounts[entry.date] || 0) + 1; categoryTotals[entry.category || "其他"] = (categoryTotals[entry.category || "其他"] || 0) + amount; categoryCounts[entry.category || "其他"] = (categoryCounts[entry.category || "其他"] || 0) + 1;
      if (balances.has(entry.payerMemberId)) balances.get(entry.payerMemberId).paidMinor += amount;
      entry.participants.forEach((part) => { if (balances.has(part.memberId)) balances.get(part.memberId).owedMinor += Math.round(Number(part.amountMinor || 0) * Number(entry.exchangeRateToBase || 1)); });
    });
    balances.forEach((entry) => { entry.netMinor = entry.paidMinor - entry.owedMinor; });
    (this.data.settlements || []).forEach((settlement) => { const amount = Number(settlement.amountMinor || 0) * Number(settlement.exchangeRateToBase || 1); if (balances.has(settlement.fromMemberId)) balances.get(settlement.fromMemberId).netMinor += amount; if (balances.has(settlement.toMemberId)) balances.get(settlement.toMemberId).netMinor -= amount; });
    const memberStats = [...balances.values()].map((entry) => ({ ...entry, paidDisplay: money(entry.paidMinor), owedDisplay: money(entry.owedMinor), netDisplay: `${entry.netMinor >= 0 ? "应收" : "应付"} ${money(Math.abs(entry.netMinor))}` }));
    const creditors = memberStats.filter((entry) => entry.netMinor > 0).map((entry) => ({ ...entry, left: entry.netMinor })).sort((a, b) => b.left - a.left), debtors = memberStats.filter((entry) => entry.netMinor < 0).map((entry) => ({ ...entry, left: -entry.netMinor })).sort((a, b) => b.left - a.left), plan = [];
    let di = 0, ci = 0; while (di < debtors.length && ci < creditors.length) { const amountMinor = Math.min(debtors[di].left, creditors[ci].left); plan.push({ key: `${debtors[di].memberId}-${creditors[ci].memberId}`, fromMemberId: debtors[di].memberId, fromName: debtors[di].name, toMemberId: creditors[ci].memberId, toName: creditors[ci].name, amountMinor, amountDisplay: money(amountMinor) }); debtors[di].left -= amountMinor; creditors[ci].left -= amountMinor; if (!debtors[di].left) di++; if (!creditors[ci].left) ci++; }
    const totalMinor = expenses.reduce((sum, entry) => sum + entry.baseAmountMinor, 0), selected = this.data.expenseFilters.date === "all" ? this.data.selectedDate : this.data.expenseFilters.date, currentDate = selected || todayKey();
    const myId = trip.me, currentEntries = expenses.filter((entry) => entry.date === currentDate), myPaidToday = currentEntries.filter((entry) => entry.payerMemberId === myId).reduce((sum, entry) => sum + entry.baseAmountMinor, 0), myOwedToday = currentEntries.reduce((sum, entry) => sum + (entry.participants.find((part) => part.memberId === myId)?.amountMinor || 0) * Number(entry.exchangeRateToBase || 1), 0);
    const categories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([category, amountMinor]) => ({ category, amountMinor, amountDisplay: money(amountMinor), count: categoryCounts[category], percent: totalMinor ? Math.round(amountMinor / totalMinor * 100) : 0 }));
    const dateCount = Math.max(1, gap(trip.start, todayKey() < day(trip.start) ? trip.start : todayKey() > day(trip.end) ? trip.end : todayKey()) + 1);
    const allDates = Array.from({ length: Math.max(1, Math.min(366, gap(trip.start, trip.end) + 1)) }, (_, index) => addDay(trip.start, index));
    const dailyStats = allDates.map((date, index) => ({ date, dateLabel: pretty(date), dayLabel: `第 ${index + 1} 天`, amountMinor: dateTotals[date] || 0, amountDisplay: money(dateTotals[date] || 0), count: dateCounts[date] || 0, percent: totalMinor ? Math.round((dateTotals[date] || 0) / Math.max(...Object.values(dateTotals), 1) * 100) : 0 }));
    const filters = this.data.expenseFilters, filtered = expenses.filter((entry) => (filters.date === "all" || entry.date === filters.date) && (filters.category === "all" || (entry.category || "其他") === filters.category) && (filters.payer === "all" || entry.payerMemberId === filters.payer));
    const configuredCategories = this.data.expenseSettings.expenseCategories?.length ? this.data.expenseSettings.expenseCategories : EXPENSE_CATEGORIES;
    const groups = allDates.map((date, index) => {
      const entries = filtered.filter((entry) => entry.date === date);
      const categoryNames = [...configuredCategories, ...entries.map((entry) => entry.category || "其他")].filter((name, position, list) => list.indexOf(name) === position);
      const categoryGroups = categoryNames.map((category) => {
        const categoryEntries = entries.filter((entry) => (entry.category || "其他") === category);
        const amountMinor = categoryEntries.reduce((sum, entry) => sum + entry.baseAmountMinor, 0);
        return { category, categoryInitial: String(category).slice(0, 1), count: categoryEntries.length, amountDisplay: money(amountMinor), entries: categoryEntries };
      }).filter((group) => group.entries.length);
      return { date, dateLabel: pretty(date), dayLabel: `第 ${index + 1} 天`, totalDisplay: money(dateTotals[date] || 0), count: dateCounts[date] || 0, categoryGroups };
    }).filter((group) => filters.date !== "all" ? group.date === filters.date : group.categoryGroups.length || group.date === this.data.selectedDate);
    const me = memberStats.find((entry) => entry.memberId === myId) || { paidMinor: 0, owedMinor: 0, netMinor: 0 }, outstandingMinor = memberStats.reduce((sum, entry) => sum + Math.max(0, entry.netMinor), 0), budgetMinor = this.data.expenseSettings.budgetMinor == null ? null : Number(this.data.expenseSettings.budgetMinor), highest = dailyStats.reduce((best, entry) => entry.amountMinor > best.amountMinor ? entry : best, dailyStats[0]);
    const settlements = (this.data.settlements || []).map((entry) => ({ ...entry, fromName: memberMap.get(entry.fromMemberId)?.name || "成员", toName: memberMap.get(entry.toMemberId)?.name || "成员", amountDisplay: money(entry.amountMinor, entry.currency || this.data.expenseSettings.baseCurrency) }));
    this.setData({ expenses, settlements, expenseGroups: groups, expenseCategories: configuredCategories, expenseSummary: { totalMinor, totalYuan: (totalMinor / 100).toFixed(2), totalDisplay: money(totalMinor), todayLabel: currentDate === todayKey() ? "今日团队支出" : `${pretty(currentDate)}支出`, todayTotal: money(dateTotals[currentDate] || 0), myPaidToday: money(myPaidToday), myOwedToday: money(Math.round(myOwedToday)), myNetMinor: me.netMinor, myNetLabel: `${me.netMinor >= 0 ? "应收" : "应付"} ${money(Math.abs(me.netMinor))}`, myPaidDisplay: money(me.paidMinor), myOwedDisplay: money(me.owedMinor), outstandingMinor, outstandingDisplay: money(outstandingMinor), settledDisplay: money((this.data.settlements || []).reduce((sum, entry) => sum + Number(entry.amountMinor || 0), 0)), budgetMinor, budgetDisplay: budgetMinor == null ? "未设置" : money(budgetMinor), remainingDisplay: budgetMinor == null ? "未设置" : money(budgetMinor - totalMinor), budgetProgress: budgetMinor ? Math.min(100, Math.round(totalMinor / budgetMinor * 100)) : 0, averageDisplay: money(Math.round(totalMinor / dateCount)), highestDayLabel: highest?.amountMinor ? `${highest.dateLabel} · ${highest.amountDisplay}` : "暂无支出", categoryStats: categories, dailyStats, memberStats, plan, expenseCount: expenses.length } });
  },
  setScope(event) { this.setData({ scope: event.currentTarget.dataset.scope }, () => this.derive()); },
  selectDate(event) {
    const selectedDate = event.currentTarget.dataset.date;
    const nextData = this.data.tab === "expenses" ? { selectedDate, "expenseFilters.date": selectedDate } : { selectedDate };
    this.setData(nextData, () => { this.derive(); if (this.data.tab === "today" || this.data.tab === "outfit") this.loadWeather(); if (this.data.tab === "expenses") this.deriveExpenseView(); });
  },
  openChecklist(event) { this.setData({ scope: event.currentTarget.dataset.scope, tab: "list" }, () => this.derive()); },
  setExpenseSegment(event) { this.setData({ expenseSegment: event.currentTarget.dataset.segment }); },
  setExpenseFilter(event) { const { field, value } = event.currentTarget.dataset; this.setData({ [`expenseFilters.${field}`]: value }, () => this.deriveExpenseView()); },
  resetExpenseFilters() { this.setData({ expenseFilters: { date: "all", category: "all", payer: "all" } }, () => this.deriveExpenseView()); },
  drillExpense(event) { const { field, value } = event.currentTarget.dataset; this.setData({ expenseSegment: "details", [`expenseFilters.${field}`]: value }, () => this.deriveExpenseView()); },
  openExpense(event) {
    if (!this.requireWritableTrip("expense")) return;
    const id = event?.currentTarget?.dataset?.id, current = this.data.expenses.find((entry) => entry.id === id);
    const categories = this.data.expenseCategories, currency = current?.currency || this.data.expenseSettings.baseCurrency || "CNY", category = current?.category || categories[0] || "其他", splitMode = current?.splitMode || "equal", members = this.data.expenseMembers.map((member) => { const part = current?.participants?.find((entry) => entry.memberId === member.id); return { ...member, avatarSrc: avatarSrc(member), selected: current ? !!part : true, amount: part ? (Number(part.amountMinor || 0) / 100).toFixed(2) : "" }; });
    this.setData({ modal: { type: "expense", edit: !!current, id, title: current ? "编辑费用" : "记一笔", categories, categoryIndex: Math.max(0, categories.indexOf(category)), currencies: EXPENSE_CURRENCIES, currencyIndex: Math.max(0, EXPENSE_CURRENCIES.indexOf(currency)), payers: this.data.expenseMembers, payerIndex: Math.max(0, this.data.expenseMembers.findIndex((member) => member.id === (current?.payerMemberId || this.data.trip.me))), splitModes: SPLIT_MODES, splitIndex: Math.max(0, SPLIT_MODES.findIndex((mode) => mode.value === splitMode)), members, values: { date: current?.date || this.data.selectedDate, title: current?.title || "", amount: current ? (Number(current.amountMinor || 0) / 100).toFixed(2) : "", currency, exchangeRateToBase: current?.exchangeRateToBase || 1, category, payerMemberId: current?.payerMemberId || this.data.trip.me, splitMode, note: current?.note || "", receiptFileId: current?.receiptFileId || "", removeReceipt: false } } });
  },
  bindExpenseCategory(event) { const index = Number(event.detail.value); this.setData({ "modal.categoryIndex": index, "modal.values.category": this.data.modal.categories[index] }); },
  bindExpenseCurrency(event) { const index = Number(event.detail.value), currency = this.data.modal.currencies[index]; this.setData({ "modal.currencyIndex": index, "modal.values.currency": currency, "modal.values.exchangeRateToBase": currency === (this.data.expenseSettings.baseCurrency || "CNY") ? 1 : this.data.modal.values.exchangeRateToBase || "" }); },
  bindExpensePayer(event) { const index = Number(event.detail.value); this.setData({ "modal.payerIndex": index, "modal.values.payerMemberId": this.data.modal.payers[index].id }); },
  bindSplitMode(event) { const index = Number(event.detail.value); this.setData({ "modal.splitIndex": index, "modal.values.splitMode": this.data.modal.splitModes[index].value }); },
  toggleExpenseMember(event) { const index = Number(event.currentTarget.dataset.index), members = this.data.modal.members.map((member, memberIndex) => memberIndex === index ? { ...member, selected: !member.selected } : member); this.setData({ "modal.members": members }); },
  bindCustomShare(event) { this.setData({ [`modal.members[${Number(event.currentTarget.dataset.index)}].amount`]: event.detail.value }); },
  async chooseExpenseReceipt() { try { const media = await wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["compressed"] }); const path = media.tempFiles?.[0]?.tempFilePath; if (path) this.setData({ "modal.receiptLocalPath": path, "modal.values.removeReceipt": false }); } catch (error) { if (!/cancel/i.test(error.errMsg || "")) this.notify("票据读取失败"); } },
  removeExpenseReceipt() { this.setData({ "modal.receiptLocalPath": "", "modal.values.removeReceipt": true }); },
  openExpenseSettings() { if (!this.requireWritableTrip("expenseSettings")) return; const settings = this.data.expenseSettings || {}; this.setData({ modal: { type: "expenseSettings", title: "记账设置", currencies: EXPENSE_CURRENCIES, currencyIndex: Math.max(0, EXPENSE_CURRENCIES.indexOf(settings.baseCurrency || "CNY")), values: { baseCurrency: settings.baseCurrency || "CNY", budget: settings.budgetMinor == null ? "" : (settings.budgetMinor / 100).toFixed(2), categories: (settings.expenseCategories?.length ? settings.expenseCategories : EXPENSE_CATEGORIES).join("、") } } }); },
  bindSettingsCurrency(event) { const index = Number(event.detail.value); this.setData({ "modal.currencyIndex": index, "modal.values.baseCurrency": this.data.modal.currencies[index] }); },
  async deleteExpense(event) { if (!this.requireWritableTrip("deleteExpense") || this.data.busy) return; const id = event.currentTarget.dataset.id; const confirmed = await new Promise((resolve) => wx.showModal({ title: "删除费用", content: "删除后分账和统计会同步更新，确认删除？", success: (result) => resolve(result.confirm) })); if (!confirmed) return; this.setData({ busy: true }); try { const result = await this.call("deleteExpense", { tripId: this.data.trip.id, id, revision: this.data.trip.revision }); this.setData({ "trip.revision": result.revision }); await this.loadExpenses(); this.notify("费用已删除"); } catch (error) { this.notify(error.message); } finally { this.setData({ busy: false }); } },
  async saveSettlement(event) { if (!this.requireWritableTrip("settlement") || this.data.busy) return; const { from, to, amount } = event.currentTarget.dataset; this.setData({ busy: true }); try { const result = await this.call("saveSettlement", { tripId: this.data.trip.id, revision: this.data.trip.revision, date: this.clampDate(todayKey()), fromMemberId: from, toMemberId: to, amountMinor: Number(amount), currency: this.data.expenseSettings.baseCurrency || "CNY", note: "按建议方案结清" }); this.setData({ "trip.revision": result.revision }); await this.loadExpenses(); this.notify("已标记结清"); } catch (error) { this.notify(error.message); } finally { this.setData({ busy: false }); } },
  async deleteSettlement(event) { if (!this.requireWritableTrip("settlement") || this.data.busy) return; this.setData({ busy: true }); try { const result = await this.call("deleteSettlement", { tripId: this.data.trip.id, id: event.currentTarget.dataset.id, revision: this.data.trip.revision }); this.setData({ "trip.revision": result.revision }); await this.loadExpenses(); this.notify("结算已撤销"); } catch (error) { this.notify(error.message); } finally { this.setData({ busy: false }); } },
  openExpenseSplit() { this.setData({ tab: "expenses", expenseSegment: "split" }, () => this.loadExpenses()); },
  async reloadTrips() { if (this.data.guestMode) return; try { this.setData({ trips: (await this.call("listTrips")).map(decorateTripSummary) }); } catch (error) { this.notify(error.message); } },
  async loadWeather() { if (!this.data.trip || this.data.guestMode) return; this.setData({ weatherLoading: true }); try { this.setData({ weather: await this.call("getWeather", { tripId: this.data.trip.id, date: this.data.selectedDate }) }); } catch (error) { this.setData({ weather: { available: false, reason: error.message } }); } finally { this.setData({ weatherLoading: false }); } },
  async loadRouteOverview(force = false) {
    if (!this.data.trip || this.data.guestMode || this.data.routeLoading) return;
    this.setData({ routeLoading: true });
    try { this.setData({ routeOverview: decorateRouteOverview(await this.call("getRouteOverview", { tripId: this.data.trip.id, force })) }); }
    catch (error) { this.setData({ routeOverview: { available: false, configured: error.code !== "TENCENT_LBS_110" && !/TENCENT_LBS_KEY|待配置/.test(error.message), error: error.message, points: [], markers: [], polylines: [], unresolved: [] } }); }
    finally { this.setData({ routeLoading: false }); }
  },
  openRouteMap() { if (!this.data.routeOverview?.available && !(this.data.routeOverview?.unresolved || []).length) return; this.setData({ routeMapOpen: true, routeEditing: false }); },
  closeRouteMap() { this.setData({ routeMapOpen: false, routeEditing: false, routeSearchIndex: -1, routeSearchResults: [] }); },
  startRouteEdit() {
    if (!this.requireLogin("route")) return;
    if (this.data.trip?.archived) return this.notify("归档旅行仅可查看");
    const overview = this.data.routeOverview || {};
    const resolved = new Map((overview.rawPoints || overview.points || []).map((point) => [point.id, point]));
    const segmentByTo = new Map((overview.segments || []).map((segment) => [segment.toId, segment.transportMode]));
    const source = overview.allPoints?.length ? overview.allPoints : overview.points || [];
    const routeEditorPoints = source.map((point, index) => {
      const merged = { ...point, ...(resolved.get(point.id) || {}) };
      const routeMode = segmentByTo.get(point.id) || point.transportMode || (this.data.trip.type === "自驾游" ? "driving" : "other");
      return { ...merged, excluded: !!point.excluded, routeMode, modeIndex: Math.max(0, TRANSPORT_MODES.findIndex((mode) => mode.id === routeMode)), order: index };
    });
    this.setData({ routeEditing: true, routeEditorPoints, routeSearchIndex: -1, routeSearchResults: [] });
  },
  cancelRouteEdit() { this.setData({ routeEditing: false, routeSearchIndex: -1, routeSearchResults: [] }); },
  bindRoutePoint(event) { const index = Number(event.currentTarget.dataset.index), field = event.currentTarget.dataset.field; this.setData({ [`routeEditorPoints[${index}].${field}`]: event.detail.value, [`routeEditorPoints[${index}].latitude`]: null, [`routeEditorPoints[${index}].longitude`]: null }); },
  bindRouteMode(event) { const index = Number(event.currentTarget.dataset.index), modeIndex = Number(event.detail.value); this.setData({ [`routeEditorPoints[${index}].modeIndex`]: modeIndex, [`routeEditorPoints[${index}].routeMode`]: TRANSPORT_MODES[modeIndex].id }); },
  toggleRoutePoint(event) { const index = Number(event.currentTarget.dataset.index); this.setData({ [`routeEditorPoints[${index}].excluded`]: !this.data.routeEditorPoints[index].excluded }); },
  moveRoutePoint(event) { const index = Number(event.currentTarget.dataset.index), target = event.currentTarget.dataset.direction === "up" ? index - 1 : index + 1, points = [...this.data.routeEditorPoints]; if (target < 0 || target >= points.length) return; [points[index], points[target]] = [points[target], points[index]]; this.setData({ routeEditorPoints: points, routeSearchIndex: -1, routeSearchResults: [] }); },
  beginRouteSearch(event) { const index = Number(event.currentTarget.dataset.index), point = this.data.routeEditorPoints[index]; this.setData({ routeSearchIndex: index, routeSearchKeyword: point.address || point.label || "", routeSearchResults: [] }); },
  bindRouteSearch(event) { this.setData({ routeSearchKeyword: event.detail.value }); },
  async searchRoutePlaces() { const keyword = String(this.data.routeSearchKeyword || "").trim(); if (!keyword) return this.notify("请输入地点名称"); try { this.setData({ busy: true }); const routeSearchResults = await this.call("searchRoutePlaces", { tripId: this.data.trip.id, keyword }); this.setData({ routeSearchResults }); if (!routeSearchResults.length) this.notify("没有找到匹配地点"); } catch (error) { this.notify(error.message); } finally { this.setData({ busy: false }); } },
  selectRoutePlace(event) { const index = this.data.routeSearchIndex, result = this.data.routeSearchResults[Number(event.currentTarget.dataset.index)]; if (index < 0 || !result) return; this.setData({ [`routeEditorPoints[${index}].label`]: result.title, [`routeEditorPoints[${index}].address`]: result.address, [`routeEditorPoints[${index}].latitude`]: result.latitude, [`routeEditorPoints[${index}].longitude`]: result.longitude, [`routeEditorPoints[${index}].poiId`]: result.id, routeSearchIndex: -1, routeSearchResults: [] }); },
  async saveRouteEditor(reset = false) {
    if (this.data.busy || this.data.guestMode) return;
    this.setData({ busy: true }); wx.showLoading({ title: "正在生成路线" });
    try {
      const points = this.data.routeEditorPoints;
      const visible = points.filter((point) => !point.excluded), segmentModes = {};
      visible.slice(1).forEach((point, index) => { segmentModes[`${visible[index].id}__${point.id}`] = point.routeMode || "other"; });
      const payload = { tripId: this.data.trip.id, revision: this.data.trip.revision, reset, points: points.map(({ id, label, address, latitude, longitude, poiId, excluded }) => ({ id, label, address, latitude, longitude, poiId, excluded })), order: points.map((point) => point.id), segmentModes };
      let result;
      try { result = await this.call("saveRouteOverviewConfig", payload); }
      catch (error) { if (error.status !== 409) throw error; const latest = await this.call("getTrip", { tripId: this.data.trip.id }); result = await this.call("saveRouteOverviewConfig", { ...payload, revision: Number(latest.revision ?? latest.trip?.revision) }); }
      this.setData({ trip: decorateTrip(result.trip), routeOverview: decorateRouteOverview(result.overview), routeEditing: false, routeSearchIndex: -1, routeSearchResults: [] }); this.derive(); this.notify(reset ? "已恢复自动路线" : "路线已更新");
    } catch (error) { this.notify(error.message || "路线保存失败"); }
    finally { wx.hideLoading(); this.setData({ busy: false }); }
  },
  saveRouteEditorTap() { this.saveRouteEditor(false); },
  resetRouteEditor() { this.saveRouteEditor(true); },
  rebuildRouteOverview() { this.loadRouteOverview(true); },
  openProfile(required = false) { const account = this.data.account || {}; this.setData({ modal: { type: "profile", title: required ? "设置你的资料" : "编辑我的资料", required, values: { nickname: account.nickname || "旅行者", avatarId: account.avatarId || "avatar-01", avatarData: account.avatarData || "" } } }); },
  openProfileTap() { if (!this.requireLogin("profile")) return; this.openProfile(false); },
  openCreateTrip() { if (!this.requireLogin("createTrip")) return; const now = todayKey(); this.setData({ modal: { type: "trip", title: "创建旅行", values: { name: "", type: "自驾游", startDate: now, startTime: "08:00", endDate: addDay(now, 3), endTime: "18:00" } } }); },
  openCloneTrip() { if (!this.requireLogin("cloneTrip")) return; const trip = this.data.trip; if (!trip || this.data.busy) return; this.setData({ modal: { type: "cloneTrip", title: "创建旅行副本", sourceId: trip.id, values: { name: `${trip.name}（副本）` } } }); },
  openEditTrip() { if (!this.requireLogin("editTrip")) return; const trip = this.data.trip; this.setData({ modal: { type: "trip", edit: true, title: "编辑旅行", values: { name: trip.name, type: trip.type || "自驾游", startDate: day(trip.start), startTime: trip.start.slice(11, 16), endDate: day(trip.end), endTime: trip.end.slice(11, 16) } } }); },
  openEvent(event) { if (!this.requireWritableTrip("event")) return; const id = event.currentTarget.dataset.id; const current = this.data.trip.events.find((entry) => entry.id === id) || {}; const transportMode = current.transportMode || (this.data.trip.type === "自驾游" ? "driving" : "other"); this.setData({ modal: { type: "event", edit: !!id, title: id ? "编辑行程安排" : "添加行程安排", id, transportModes: TRANSPORT_MODES, transportIndex: Math.max(0, TRANSPORT_MODES.findIndex((mode) => mode.id === transportMode)), values: { title: current.title || "", date: current.date || event.currentTarget.dataset.date || this.data.selectedDate, startTime: current.startTime || current.time || "09:00", endTime: current.endTime || "10:00", startPlace: current.startPlace || "", endPlace: current.endPlace || "", address: current.address || "", transportMode, note: current.note || "" } } }); },
  openHotel(event) { if (!this.requireWritableTrip("hotel")) return; const id = event.currentTarget.dataset.id; const current = this.data.trip.hotels.find((entry) => entry.id === id) || {}; this.setData({ modal: { type: "hotel", edit: !!id, title: id ? "编辑住宿" : "添加住宿", id, values: { name: current.name || "", city: current.city || "", address: current.address || "", checkin: current.checkin || this.data.selectedDate, checkout: current.checkout || addDay(this.data.selectedDate, 1), phone: current.phone || "", note: current.note || "" } } }); },
  openOutfit(event) {
    if (!this.requireWritableTrip("outfit")) return;
    const id = event?.currentTarget?.dataset?.id;
    const current = (this.data.trip.outfits || []).find((entry) => entry.id === id) || {};
    const scene = current.scene || OUTFIT_SCENES[0];
    const types = this.data.outfitTypes;
    const items = (current.items || []).map((item) => ({ ...item, localId: item.id || localId("item"), typeIndex: Math.max(0, types.findIndex((type) => type.id === item.typeId || type.name === item.typeName)), photoLocalPath: "", removePhoto: false }));
    this.setData({ modal: { type: "outfit", edit: !!id, title: id ? "编辑穿搭" : "添加穿搭", id, clientMutationId: current.clientMutationId || localId("outfit"), scenes: OUTFIT_SCENES, sceneIndex: Math.max(0, OUTFIT_SCENES.indexOf(scene)), legacyPhotoSrc: current.photoSrc || "", legacyPhotoFileId: current.photoFileId || "", values: { date: current.date || this.data.selectedDate, title: current.title || "", scene, note: current.note || "", items } } });
  },
  openOutfitItem(event) {
    const outfitId = event.currentTarget.dataset.outfit, itemId = event.currentTarget.dataset.item;
    if (!this.requireWritableTrip("outfit")) return;
    const outfit = (this.data.trip.outfits || []).find((entry) => entry.id === outfitId), current = outfit?.items?.find((entry) => entry.id === itemId);
    if (!outfit || !current) return this.notify("衣物不存在或已被删除");
    const types = this.data.outfitTypes;
    const item = { ...current, localId: current.id, typeIndex: Math.max(0, types.findIndex((type) => type.id === current.typeId || type.name === current.typeName)), photoLocalPath: "", removePhoto: false };
    this.setData({ modal: { type: "outfitItem", title: `编辑${current.typeName || "衣物"}`, outfitId, itemId, clientMutationId: localId("outfit-item-edit"), values: { items: [item] } } });
  },
  openNewOutfitItem(event) {
    if (!this.requireWritableTrip("outfit")) return;
    const outfitId = event.currentTarget.dataset.outfit;
    const outfit = (this.data.trip.outfits || []).find((entry) => entry.id === outfitId);
    if (!outfit) return this.notify("穿搭不存在或已被删除");
    const type = this.data.outfitTypes[0];
    if (!type) return this.notify("请先在整套穿搭编辑中新增衣物类型");
    const item = { localId: localId("item"), id: "", typeId: type.id, typeName: type.name, typeIndex: 0, name: "", photoFileId: "", photoSrc: "", photoLocalPath: "", removePhoto: false };
    this.setData({ modal: { type: "outfitItem", title: "新增衣物", outfitId, itemId: "", newItem: true, clientMutationId: localId("outfit-item-create"), values: { items: [item] } } });
  },
  async deleteOutfitItem(event) {
    if (!this.requireWritableTrip("outfit") || this.data.busy) return;
    const outfit = (this.data.trip.outfits || []).find((entry) => entry.id === event.currentTarget.dataset.outfit);
    const itemId = event.currentTarget.dataset.item, item = outfit?.items?.find((entry) => entry.id === itemId);
    if (!outfit || !item) return this.notify("衣物不存在或已被删除");
    if (outfit.items.length <= 1) return this.notify("每套穿搭至少保留一件衣物，可直接删除整套穿搭");
    const confirmed = await new Promise((resolve) => wx.showModal({ title: "删除衣物", content: `确认删除“${item.typeName} · ${item.name}”？`, confirmText: "删除", confirmColor: "#d55757", success: (result) => resolve(result.confirm) }));
    if (!confirmed) return;
    const payload = { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "outfit", id: outfit.id, clientMutationId: localId("outfit-item-delete"), date: outfit.date, title: outfit.title, scene: outfit.scene, note: outfit.note || "", photoFileId: outfit.photoFileId || "", items: outfit.items.filter((entry) => entry.id !== itemId).map((entry, index) => ({ id: entry.id, typeId: entry.typeId, typeName: entry.typeName, name: entry.name, photoFileId: entry.photoFileId || "", sortOrder: index })) };
    this.setData({ busy: true });
    try {
      let result;
      try { result = await this.call("mutateTrip", payload); }
      catch (error) { if (error.status !== 409) throw error; const latest = await this.call("getTrip", { tripId: this.data.trip.id }); result = await this.call("mutateTrip", { ...payload, revision: latest.trip.revision }); }
      this.setData({ trip: decorateTrip(result.trip) }); this.derive(); this.notify("衣物已删除");
    } catch (error) { this.notify(error.message || "删除失败"); }
    finally { this.setData({ busy: false }); }
  },
  addOutfitItem() { const types = this.data.outfitTypes; if (!types.length) return this.openOutfitTypeManager(); const item = { localId: localId("item"), id: "", typeId: types[0].id, typeName: types[0].name, typeIndex: 0, name: "", photoFileId: "", photoSrc: "", photoLocalPath: "", removePhoto: false }; this.setData({ [`modal.values.items[${this.data.modal.values.items.length}]`]: item }); },
  bindOutfitItemType(event) { const index = Number(event.currentTarget.dataset.index), typeIndex = Number(event.detail.value), type = this.data.outfitTypes[typeIndex]; if (!type) return; this.setData({ [`modal.values.items[${index}].typeIndex`]: typeIndex, [`modal.values.items[${index}].typeId`]: type.id, [`modal.values.items[${index}].typeName`]: type.name }); },
  bindOutfitItemName(event) { this.setData({ [`modal.values.items[${Number(event.currentTarget.dataset.index)}].name`]: event.detail.value }); },
  removeOutfitItem(event) { const index = Number(event.currentTarget.dataset.index), items = this.data.modal.values.items.filter((_, itemIndex) => itemIndex !== index); this.setData({ "modal.values.items": items }); },
  openOutfitTypeManager() { this.outfitDraft = this.data.modal?.type === "outfit" ? this.data.modal : this.outfitDraft; this.setData({ modal: { type: "outfitTypes", title: "衣物类型管理", types: this.data.outfitTypes, editingId: "", values: { name: "" } } }); },
  returnToOutfit() { const draft = this.outfitDraft; this.outfitDraft = null; if (!draft) return this.setData({ modal: null }); const types = this.data.outfitTypes; draft.values.items = (draft.values.items || []).map((item) => { const index = Math.max(0, types.findIndex((type) => type.id === item.typeId)); const type = types[index]; return type ? { ...item, typeIndex: index, typeId: type.id, typeName: type.name } : item; }); this.setData({ modal: draft }); },
  editOutfitType(event) { const current = this.data.outfitTypes.find((entry) => entry.id === event.currentTarget.dataset.id); if (current) this.setData({ "modal.editingId": current.id, "modal.values.name": current.name }); },
  cancelOutfitTypeEdit() { this.setData({ "modal.editingId": "", "modal.values.name": "" }); },
  async saveOutfitType() { const name = String(this.data.modal.values.name || "").trim(); if (!name) return this.notify("请填写衣物类型名称"); try { const result = await this.call("mutateOutfitType", { action: this.data.modal.editingId ? "rename" : "create", id: this.data.modal.editingId || undefined, name }); this.setData({ outfitTypes: result.outfitTypes, "account.outfitTypes": result.outfitTypes, "modal.types": result.outfitTypes, "modal.editingId": "", "modal.values.name": "" }); } catch (error) { this.notify(error.message); } },
  async mutateOutfitType(event) { try { const result = await this.call("mutateOutfitType", { action: event.currentTarget.dataset.action, id: event.currentTarget.dataset.id, direction: event.currentTarget.dataset.direction }); this.setData({ outfitTypes: result.outfitTypes, "account.outfitTypes": result.outfitTypes, "modal.types": result.outfitTypes }); } catch (error) { this.notify(error.message); } },
  openItem(event) { if (!this.requireWritableTrip("item")) return; const id = event.currentTarget.dataset.id; const current = this.data.trip.items.find((entry) => entry.id === id) || {}; const groups = this.data.trip.categories.filter((entry) => this.data.scope === "公共" ? !entry.owner : entry.owner === this.data.trip.me); const categoryId = current.categoryId || event.currentTarget.dataset.category || groups[0]?.id || ""; const categoryIndex = Math.max(0, groups.findIndex((entry) => entry.id === categoryId)); this.setData({ modal: { type: "item", edit: !!id, title: id ? "编辑清单条目" : "新增条目", id, categories: groups, categoryIndex, categoryName: groups[categoryIndex]?.name || "当前分类", values: { title: current.title || "", categoryId, key: !!current.key, remind: current.remind || "", linkedDate: current.linkedDate || "" } } }); },
  toggleCategoryMenu(event) { const id = event.currentTarget.dataset.id; this.setData({ categoryMenuId: this.data.categoryMenuId === id ? "" : id }); },
  openCategory(event) { if (!this.requireWritableTrip("category")) return; const id = event?.currentTarget?.dataset?.id; const current = this.data.trip?.categories.find((entry) => entry.id === id); this.setData({ categoryMenuId: "", modal: { type: "category", id: current?.id || "", title: current ? "编辑分类" : "新建分类", values: { name: current?.name || "" } } }); },
  async openTemplates() { try { const templates = this.data.templates.length ? this.data.templates : (await this.call("listChecklistTemplates")).map(decorateTemplate); this.setData({ templates, modal: { type: "templates", title: "导入清单模板", values: {} } }); } catch (error) { this.notify(error.message); } },
  openTemplateDetail(event) { const template = this.data.templates.find((entry) => entry.id === event.currentTarget.dataset.id); if (!template) return this.notify("清单模板不存在"); this.setData({ modal: { type: "templateDetail", title: template.name, template, values: {} } }); },
  closeModal() { if (this.data.modal?.required) return; if (this.data.modal?.type === "outfitTypes" && this.outfitDraft) return this.returnToOutfit(); this.setData({ modal: null }); }, stopBubble() {},
  bindInput(event) { this.setData({ [`modal.values.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  bindSwitch(event) { this.setData({ [`modal.values.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  bindDate(event) { this.setData({ [`modal.values.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  bindTime(event) { this.setData({ [`modal.values.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  bindType(event) { this.setData({ "modal.values.type": TRIP_TYPES[Number(event.detail.value)] }); },
  bindEventTransport(event) { const transportIndex = Number(event.detail.value); this.setData({ "modal.transportIndex": transportIndex, "modal.values.transportMode": TRANSPORT_MODES[transportIndex].id }); },
  bindOutfitScene(event) { const index = Number(event.detail.value); this.setData({ "modal.sceneIndex": index, "modal.values.scene": OUTFIT_SCENES[index] }); },
  bindCategory(event) { const index = Number(event.detail.value); this.setData({ "modal.categoryIndex": index, "modal.values.categoryId": this.data.modal.categories[index].id }); },
  chooseAvatar(event) { this.setData({ "modal.values.avatarId": event.currentTarget.dataset.id, "modal.values.avatarData": "" }); },
  async chooseProfileWechatAvatar(event) {
    const path = event.detail?.avatarUrl;
    if (!path) return;
    try {
      const compressed = await wx.compressImage({ src: path, quality: 72 }).catch(() => ({ tempFilePath: path }));
      const data = wx.getFileSystemManager().readFileSync(compressed.tempFilePath || path, "base64");
      this.setData({ "modal.values.avatarId": "", "modal.values.avatarData": `data:image/jpeg;base64,${data}` });
    } catch { this.notify("头像读取失败"); }
  },
  async chooseCustomAvatar() {
    if (this.avatarChoosing) return;
    this.avatarChoosing = true;
    try {
      const media = await wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["compressed"] });
      const path = media.tempFiles?.[0]?.tempFilePath;
      if (!path) return;
      const data = wx.getFileSystemManager().readFileSync(path, "base64");
      this.setData({ "modal.values.avatarId": "", "modal.values.avatarData": `data:image/jpeg;base64,${data}` });
    } catch (error) {
      if (!/cancel/i.test(error.errMsg || "")) this.notify("头像读取失败");
    } finally {
      this.avatarChoosing = false;
    }
  },
  async chooseOutfitItemPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    try {
      const media = await wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["compressed"] });
      const path = media.tempFiles?.[0]?.tempFilePath;
      if (!path) return;
      const compressed = await wx.compressImage({ src: path, quality: 72 }).catch(() => ({ tempFilePath: path }));
      const photoLocalPath = compressed.tempFilePath || path;
      const info = wx.getFileSystemManager().statSync(photoLocalPath);
      if (info.size > 5 * 1024 * 1024) throw new Error("图片过大，请选择 5MB 以内的图片");
      this.setData({ [`modal.values.items[${index}].photoLocalPath`]: photoLocalPath, [`modal.values.items[${index}].removePhoto`]: false });
    } catch (error) { if (!/cancel/i.test(error.errMsg || "")) this.notify(error.message || "图片读取失败"); }
  },
  removeOutfitItemPhoto(event) { const index = Number(event.currentTarget.dataset.index); this.setData({ [`modal.values.items[${index}].photoLocalPath`]: "", [`modal.values.items[${index}].removePhoto`]: true }); },
  async submitModal() {
    const modal = this.data.modal; if (!modal || this.data.busy) return; this.setData({ busy: true }); wx.showLoading({ title: "正在保存" });
    try {
      if (this.data.guestMode) throw new Error("请先登录后保存");
      const values = modal.values;
      if (modal.type === "profile") { const result = await this.call("updateAccountProfile", values); const account = { ...result.account, avatarSrc: avatarSrc(result.account) }; this.setData({ account, modal: null }); if (this.pendingInvite) await this.prepareInvite(this.pendingInvite); else await this.reloadTrips(); }
      else if (modal.type === "cloneTrip") { this.localChangeVersion = (this.localChangeVersion || 0) + 1; const result = await this.call("cloneTrip", { tripId: modal.sourceId, name: values.name }); wx.setStorageSync("xiangye-current-trip", result.trip.id); this.setData({ trip: decorateTrip(result.trip), selectedDate: day(result.trip.start), modal: null, tab: "people" }); await this.reloadTrips(); this.derive(); }
      else if (modal.type === "trip") { const payload = { ...values, start: `${values.startDate}T${values.startTime}`, end: `${values.endDate}T${values.endTime}` }; const result = modal.edit ? await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "trip", ...payload }) : await this.call("createTrip", payload); this.setData({ trip: decorateTrip(result.trip), modal: null, tab: "today" }); await this.reloadTrips(); this.derive(); this.loadWeather(); }
      else if (modal.type === "join") { const result = await this.call("joinTrip", { invite: modal.invite }); this.pendingInvite = ""; this.setData({ trip: decorateTrip(result.trip), modal: null, tab: "today" }); await this.reloadTrips(); this.derive(); this.loadWeather(); }
      else if (modal.type === "outfit") {
        if (!String(values.title || "").trim()) throw new Error("请填写穿搭标题");
        if (!(values.items || []).length) throw new Error("请至少添加一件衣物");
        if (values.items.some((item) => !String(item.name || "").trim())) throw new Error("请填写每件衣物的名称");
        const uploadedFileIds = [];
        try {
          const items = [];
          for (let index = 0; index < values.items.length; index += 1) {
            const item = values.items[index];
            let photoFileId = item.removePhoto ? "" : item.photoFileId || "";
            if (item.photoLocalPath) {
              const suffix = (item.photoLocalPath.match(/\.(png|webp|jpe?g)$/i)?.[1] || "jpg").replace("jpeg", "jpg");
              const uploaded = await wx.cloud.uploadFile({ cloudPath: `outfits/${this.data.trip.id}/${modal.clientMutationId}-${index}.${suffix}`, filePath: item.photoLocalPath });
              uploadedFileIds.push(uploaded.fileID); photoFileId = uploaded.fileID;
            }
            items.push({ id: item.id || undefined, typeId: item.typeId, typeName: item.typeName, name: item.name, photoFileId, sortOrder: index });
          }
          const payload = { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "outfit", id: modal.id || undefined, clientMutationId: modal.clientMutationId, date: values.date, title: values.title, scene: values.scene, note: values.note, photoFileId: modal.legacyPhotoFileId || "", items };
          let result;
          try { result = await this.call("mutateTrip", payload); }
          catch (error) {
            if (error.status !== 409) throw error;
            const latest = await this.call("getTrip", { tripId: this.data.trip.id });
            result = await this.call("mutateTrip", { ...payload, revision: latest.trip.revision });
          }
          this.setData({ trip: decorateTrip(result.trip), modal: null, selectedDate: values.date }); this.derive();
        } catch (error) {
          if (uploadedFileIds.length) await wx.cloud.deleteFile({ fileList: uploadedFileIds }).catch(() => {});
          throw error;
        }
      }
      else if (modal.type === "outfitItem") {
        const outfit = (this.data.trip.outfits || []).find((entry) => entry.id === modal.outfitId), item = values.items?.[0];
        if (!outfit || !item) throw new Error("衣物不存在或已被删除");
        if (!String(item.name || "").trim()) throw new Error("请填写衣物名称");
        let photoFileId = item.removePhoto ? "" : item.photoFileId || "", uploadedFileId = "";
        try {
          if (item.photoLocalPath) {
            const suffix = (item.photoLocalPath.match(/\.(png|webp|jpe?g)$/i)?.[1] || "jpg").replace("jpeg", "jpg");
            const uploaded = await wx.cloud.uploadFile({ cloudPath: `outfits/${this.data.trip.id}/${modal.clientMutationId}.${suffix}`, filePath: item.photoLocalPath });
            uploadedFileId = uploaded.fileID; photoFileId = uploaded.fileID;
          }
          const retainedItems = outfit.items.map((entry, index) => entry.id === modal.itemId ? { id: entry.id, typeId: item.typeId, typeName: item.typeName, name: item.name, photoFileId, sortOrder: index } : { id: entry.id, typeId: entry.typeId, typeName: entry.typeName, name: entry.name, photoFileId: entry.photoFileId || "", sortOrder: index });
          const items = modal.newItem ? [...retainedItems, { id: "", typeId: item.typeId, typeName: item.typeName, name: item.name, photoFileId, sortOrder: retainedItems.length }] : retainedItems;
          const payload = { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "outfit", id: outfit.id, clientMutationId: modal.clientMutationId, date: outfit.date, title: outfit.title, scene: outfit.scene, note: outfit.note || "", photoFileId: outfit.photoFileId || "", items };
          let result;
          try { result = await this.call("mutateTrip", payload); }
          catch (error) { if (error.status !== 409) throw error; const latest = await this.call("getTrip", { tripId: this.data.trip.id }); result = await this.call("mutateTrip", { ...payload, revision: latest.trip.revision }); }
          this.setData({ trip: decorateTrip(result.trip), modal: null }); this.derive(); this.notify(modal.newItem ? "衣物已添加" : "衣物已更新");
        } catch (error) { if (uploadedFileId) await wx.cloud.deleteFile({ fileList: [uploadedFileId] }).catch(() => {}); throw error; }
      }
      else if (modal.type === "expense") {
        if (!String(values.title || "").trim()) throw new Error("请填写消费事项");
        if (!(minorFromInput(values.amount) > 0)) throw new Error("请填写正确金额");
        if (values.currency !== (this.data.expenseSettings.baseCurrency || "CNY") && !(Number(values.exchangeRateToBase) > 0)) throw new Error("请填写正确汇率");
        const selected = modal.members.filter((member) => member.selected);
        if (values.splitMode !== "personal" && !selected.length) throw new Error("请选择参与分账成员");
        if (values.splitMode === "custom" && selected.reduce((sum, member) => sum + minorFromInput(member.amount), 0) !== minorFromInput(values.amount)) throw new Error("成员分摊合计需等于总额");
        let receiptFileId = values.removeReceipt ? "" : values.receiptFileId || "";
        let uploadedReceiptFileId = "";
        if (modal.receiptLocalPath) {
          const compressed = await wx.compressImage({ src: modal.receiptLocalPath, quality: 72 }).catch(() => ({ tempFilePath: modal.receiptLocalPath }));
          const path = compressed.tempFilePath || modal.receiptLocalPath, fs = wx.getFileSystemManager(), stat = fs.statSync(path);
          if (stat.size > 3000000) throw new Error("票据图片需小于 3MB");
          const suffix = (path.match(/\.(png|webp|jpe?g)$/i)?.[1] || "jpg").toLowerCase();
          receiptFileId = (await this.call("uploadExpenseReceipt", { tripId: this.data.trip.id, mime: `image/${suffix === "jpg" || suffix === "jpeg" ? "jpeg" : suffix}`, imageBase64: fs.readFileSync(path, "base64") })).fileId;
          uploadedReceiptFileId = receiptFileId;
        }
        const participants = values.splitMode === "custom" ? selected.map((member) => ({ memberId: member.id, amountMinor: minorFromInput(member.amount) })) : selected.map((member) => member.id);
        let result;
        try { result = await this.call("saveExpense", { tripId: this.data.trip.id, id: modal.id || undefined, revision: this.data.trip.revision, date: values.date, title: values.title, amount: values.amount, currency: values.currency, exchangeRateToBase: values.currency === (this.data.expenseSettings.baseCurrency || "CNY") ? 1 : values.exchangeRateToBase, category: values.category, payerMemberId: values.payerMemberId, splitMode: values.splitMode, participants, note: values.note, receiptFileId }); }
        catch (error) { if (uploadedReceiptFileId) await wx.cloud.deleteFile({ fileList: [uploadedReceiptFileId] }).catch(() => {}); throw error; }
        this.setData({ modal: null, "trip.revision": result.revision }); await this.loadExpenses();
      }
      else if (modal.type === "expenseSettings") {
        const categories = String(values.categories || "").split(/[、,，\n]/).map((entry) => entry.trim()).filter(Boolean);
        const result = await this.call("updateExpenseSettings", { tripId: this.data.trip.id, revision: this.data.trip.revision, baseCurrency: values.baseCurrency, budgetMinor: values.budget ? minorFromInput(values.budget) : null, expenseCategories: categories });
        this.setData({ modal: null, "trip.revision": result.revision, expenseSettings: result.settings }); await this.loadExpenses();
      }
      else if (["event", "hotel", "item", "category", "ticketMeta"].includes(modal.type)) {
        this.localChangeVersion = (this.localChangeVersion || 0) + 1;
        const payload = { tripId: this.data.trip.id, revision: this.data.trip.revision, action: modal.type, id: modal.id || undefined, scope: this.data.scope === "公共" ? "公共" : "我的", ...values };
        if (modal.type === "ticketMeta") payload.startTime = `${values.useDate}T${values.useClock}`;
        let result;
        try { result = await this.call("mutateTrip", payload); }
        catch (error) {
          if (error.status !== 409 || modal.type !== "event") throw error;
          const latest = await this.call("getTrip", { tripId: payload.tripId });
          result = await this.call("mutateTrip", { ...payload, revision: latest.trip.revision });
        }
        this.setData({ trip: decorateTrip(result.trip), modal: null, ...(modal.type === "event" ? { selectedDate: values.date } : {}) });
        this.derive();
        if (modal.type === "event" || modal.type === "hotel") setTimeout(() => this.loadRouteOverview(true), 0);
      }
      this.notify("已保存");
    } catch (error) { this.notify(error.requestId ? `${error.message}（编号 ${error.requestId.slice(-8)}）` : error.message); } finally { wx.hideLoading(); this.setData({ busy: false }); }
  },
  mutateAction(event) {
    const { action, id } = event.currentTarget.dataset;
    if (!this.requireWritableTrip(`checklist:${action}`)) return;
    if (!this.data.trip || !id) return;
    this.pendingChecklistActions ||= new Set();
    const key = `${action}:${id}`;
    if (this.pendingChecklistActions.has(key)) return;
    this.pendingChecklistActions.add(key);
    this.localChangeVersion = (this.localChangeVersion || 0) + 1;
    this.checklistQueue = (this.checklistQueue || Promise.resolve())
      .then(() => this.performChecklistAction(action, id))
      .catch((error) => this.notify(error.message))
      .finally(() => setTimeout(() => this.pendingChecklistActions.delete(key), action === "toggle" ? 650 : 0));
  },
  async performChecklistAction(action, id) {
    const snapshot = this.data.trip;
    if (!snapshot?.items.some((item) => item.id === id)) return;
    const item = snapshot.items.find((entry) => entry.id === id);
    const desiredDone = !item.done;
    if (action === "toggle") {
      this.setData({ trip: { ...snapshot, items: snapshot.items.map((entry) => entry.id === id ? { ...entry, done: desiredDone, reviewed: false, byMemberId: desiredDone ? snapshot.me : null, by: desiredDone ? this.data.me?.name : null } : entry) } });
      this.derive();
    }
    try {
      let result;
      try { result = await this.call("mutateTrip", { tripId: snapshot.id, revision: snapshot.revision, action, id }); }
      catch (error) {
        if (error.status !== 409) throw error;
        const latest = (await this.call("getTrip", { tripId: snapshot.id })).trip;
        if (action === "toggle" && latest.items.find((entry) => entry.id === id)?.done === desiredDone) result = { trip: latest };
        else result = await this.call("mutateTrip", { tripId: snapshot.id, revision: latest.revision, action, id });
      }
      if (this.data.trip?.id === snapshot.id) { this.setData({ trip: decorateTrip(result.trip) }); this.derive(); }
    } catch (error) {
      if (this.data.trip?.id === snapshot.id) { this.setData({ trip: snapshot }); this.derive(); }
      throw error;
    }
  },
  async importTemplate(event) { if (!this.requireWritableTrip("importTemplate") || this.data.busy) return; this.setData({ busy: true }); try { const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "importTemplate", templateId: event.currentTarget.dataset.id, scope: this.data.scope === "公共" ? "公共" : "我的" }); this.setData({ trip: result.trip, modal: null }); this.derive(); this.notify("模板已导入"); } catch (error) { this.notify(error.message); } finally { this.setData({ busy: false }); } },
  async moveOutfit(event) { if (!this.requireWritableTrip("outfit") || this.data.busy) return; this.setData({ busy: true }); try { const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "moveOutfit", id: event.currentTarget.dataset.id, direction: event.currentTarget.dataset.direction }); this.setData({ trip: decorateTrip(result.trip) }); this.derive(); } catch (error) { this.notify(error.message); } finally { this.setData({ busy: false }); } },
  async previewOutfit(event) { const outfit = (this.data.trip.outfits || []).find((entry) => entry.id === event.currentTarget.dataset.id); if (!outfit) return; try { let src = outfit.photoSrc || outfit.photoFileId; if (src?.startsWith("cloud://")) src = (await wx.cloud.downloadFile({ fileID: src })).tempFilePath; if (!src) throw new Error("穿搭图片暂不可用"); await wx.previewImage({ current: src, urls: [src] }); } catch (error) { this.notify(error.message || "图片预览失败"); } },
  async previewOutfitItem(event) { const outfit = (this.data.trip.outfits || []).find((entry) => entry.id === event.currentTarget.dataset.outfit); const piece = (outfit?.items || []).find((entry) => entry.id === event.currentTarget.dataset.item); if (!piece) return; try { let src = piece.photoSrc || piece.photoFileId; if (src?.startsWith("cloud://")) src = (await wx.cloud.downloadFile({ fileID: src })).tempFilePath; if (!src) throw new Error("衣物图片暂不可用"); await wx.previewImage({ current: src, urls: [src] }); } catch (error) { this.notify(error.message || "图片预览失败"); } },
  async confirmDelete(event) { if (!this.requireWritableTrip("delete") || this.data.busy) return; const action = event.currentTarget.dataset.action, id = event.currentTarget.dataset.id; this.setData({ categoryMenuId: "" }); const count = action === "deleteCategory" ? this.data.trip.items.filter((item) => item.categoryId === id).length : 0; const labels = { deleteItem: "删除这条清单内容？", deleteCategory: `删除此分类及其中 ${count} 条清单内容？此操作无法撤销。`, deleteEvent: "删除这项行程？", deleteHotel: "删除这项住宿？", deleteTicket: "删除这张票据？", deleteOutfit: "删除这套穿搭？相关图片也会删除。", removeMember: "移除这位同行成员？", archive: "归档后旅行将只可查看，确认归档？", rotate: "旧邀请会立即失效，确认更换？" }; const confirmed = await new Promise((resolve) => wx.showModal({ title: "请确认", content: labels[action] || "确认继续？", success: (result) => resolve(result.confirm) })); if (!confirmed) return; this.setData({ busy: true }); try { this.localChangeVersion = (this.localChangeVersion || 0) + 1; const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action, id, member: id }); this.setData({ trip: decorateTrip(result.trip) }); this.derive(); if (action === "deleteEvent" || action === "deleteHotel") this.loadRouteOverview(true); this.notify("已完成"); } catch (error) { this.notify(error.message); } finally { this.setData({ busy: false }); } },
  async deleteTrip(event) {
    if (!this.requireLogin("deleteTrip")) return;
    const id = event?.currentTarget?.dataset?.id || this.data.trip?.id;
    const trip = id === this.data.trip?.id ? this.data.trip : this.data.trips.find((entry) => entry.id === id);
    if (!trip) return;
    const confirmed = await new Promise((resolve) => wx.showModal({ title: "提示", content: "删除后无法恢复，是否删除？", confirmText: "删除", confirmColor: "#d55757", success: (result) => resolve(result.confirm) }));
    if (!confirmed) return;
    try {
      const prepared = await this.call("mutateTrip", { tripId: trip.id, revision: trip.revision, action: "prepareDeletion" });
      await this.call("mutateTrip", { tripId: trip.id, revision: trip.revision, action: "deleteTrip", challenge: prepared.challenge, confirmName: trip.name });
      if (trip.id === this.data.trip?.id) wx.removeStorageSync("xiangye-current-trip");
      await this.bootstrap();
    } catch (error) { this.notify(error.message); }
  },
  async switchTrip(event) { if (this.data.guestMode) return; try { await this.loadTrip(event.currentTarget.dataset.id); this.setData({ tab: "today" }); } catch (error) { this.notify(error.message); } },
  async prepareInvite(invite) { const preview = await this.call("previewInvite", { invite }); this.setData({ modal: { type: "join", title: `加入 · ${preview.tripName}`, invite, values: {} } }); },
  onShareAppMessage() { const trip = this.data.trip; return trip?.invite ? { title: `加入“${trip.name}”的旅行准备`, path: `/pages/index/index?invite=${trip.invite}` } : { title: "向野 · 自驾旅行助手", path: "/pages/index/index" }; },
  copyInvite() { if (this.data.trip?.invite) wx.setClipboardData({ data: `https://zdata-d4g6l75lwebf2dbb0-1485288642.tcloudbaseapp.com/?invite=${this.data.trip.invite}` }); },
  async openMap(event) { const place = event.currentTarget.dataset.place; if (!place) return this.notify("请先填写地址"); if (this.data.guestMode) return wx.openLocation({ latitude: 31.091, longitude: 102.849, name: place, address: place, scale: 12 }).catch(() => this.notify("地图暂不可用")); wx.showLoading({ title: "正在定位" }); try { const location = await this.call("resolveLocation", { tripId: this.data.trip.id, place }); await wx.openLocation({ latitude: Number(location.latitude), longitude: Number(location.longitude), name: location.name || place, address: location.address || place, scale: 15 }); } catch (error) { this.notify(error.message); } finally { wx.hideLoading(); } },
  async addTicket() { if (!this.requireWritableTrip("ticket")) return; try { const media = await wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"] }); const file = media.tempFiles[0]; const compressed = await wx.compressImage({ src: file.tempFilePath, quality: 72 }); this.ticketPath = compressed.tempFilePath; this.setData({ modal: { type: "ticket", title: "添加票据", values: { type: "门票", useDate: this.data.selectedDate, useClock: "09:00" } } }); } catch (error) { if (!/cancel/i.test(error.errMsg || "")) this.notify("选择图片失败"); } },
  async submitTicket() { if (!this.requireWritableTrip("ticket")) return; if (!this.ticketPath || this.data.busy) return; this.setData({ busy: true }); wx.showLoading({ title: "正在上传" }); let fileID = ""; try { const fs = wx.getFileSystemManager(); const info = fs.statSync(this.ticketPath); if (info.size > 10 * 1024 * 1024) throw new Error("图片过大，请选择 10MB 以内的图片"); const suffix = (this.ticketPath.match(/\.(png|webp|jpe?g)$/i)?.[1] || "jpg").replace("jpeg", "jpg"); const uploaded = await wx.cloud.uploadFile({ cloudPath: `tickets/${this.data.trip.id}/${Date.now()}-${Math.random().toString(16).slice(2)}.${suffix}`, filePath: this.ticketPath }); fileID = uploaded.fileID; const values = this.data.modal.values; const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "ticket", type: values.type, startTime: `${values.useDate}T${values.useClock}`, fileId: fileID, mime: `image/${suffix === "jpg" ? "jpeg" : suffix}`, size: info.size }); this.ticketPath = ""; this.setData({ trip: decorateTrip(result.trip), modal: null }); this.derive(); this.notify("票据已添加"); } catch (error) { if (fileID) wx.cloud.deleteFile({ fileList: [fileID] }).catch(() => {}); this.notify(error.message || "票据上传失败"); } finally { wx.hideLoading(); this.setData({ busy: false }); } },
  async previewTicket(event) { const ticket = this.data.trip.tickets.find((entry) => entry.id === event.currentTarget.dataset.id); if (!ticket) return; try { let src = ticket.imageUrl || ticket.fileId; if (src?.startsWith("cloud://")) src = (await wx.cloud.downloadFile({ fileID: src })).tempFilePath; if (!src) throw new Error("票据图片暂不可用"); await wx.previewImage({ current: src, urls: [src] }); } catch (error) { this.notify(error.message || "票据预览失败"); } },
  editTicket(event) { if (!this.requireWritableTrip("ticket")) return; const ticket = this.data.trip.tickets.find((entry) => entry.id === event.currentTarget.dataset.id); if (!ticket) return; this.setData({ modal: { type: "ticketMeta", title: "编辑票据", id: ticket.id, values: { type: ticket.type || ticket.title || "其他票据", useDate: day(ticket.startTime), useClock: ticket.startTime.slice(11, 16) || "09:00" } } }); },
  async exportCalendar() { const trip = this.data.trip; const stamp = (value) => String(value || "").replace(/[-:]/g, "") + "00"; const escape = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n"); const events = (trip.events || []).map((event) => `BEGIN:VEVENT\r\nUID:${event.id}@xiangye\r\nDTSTART:${stamp(`${event.date}T${event.startTime}`)}\r\nDTEND:${stamp(`${event.date}T${event.endTime}`)}\r\nSUMMARY:${escape(event.title)}\r\nLOCATION:${escape(event.address || event.endPlace || event.startPlace)}\r\nDESCRIPTION:${escape(event.note)}\r\nEND:VEVENT`).join("\r\n"); const content = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Xiangye//Travel//CN\r\nCALSCALE:GREGORIAN\r\n${events}\r\nEND:VCALENDAR\r\n`; const path = `${wx.env.USER_DATA_PATH}/向野-${trip.name}-行程.ics`; try { wx.getFileSystemManager().writeFileSync(path, content, "utf8"); await wx.openDocument({ filePath: path, fileType: "ics", showMenu: true }); } catch { try { await wx.shareFileMessage({ filePath: path, fileName: `向野-${trip.name}-行程.ics` }); } catch { this.notify("日历文件已生成，请从右上角转发"); } } },
  async exportTrip() { if (!this.requireLogin("exportTrip")) return; try { const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "exportTrip" }); const path = `${wx.env.USER_DATA_PATH}/向野-${this.data.trip.name}-备份.json`; wx.getFileSystemManager().writeFileSync(path, JSON.stringify(result.exportData, null, 2), "utf8"); await wx.shareFileMessage({ filePath: path, fileName: `向野-${this.data.trip.name}-备份.json` }); } catch (error) { this.notify(error.message || "导出失败"); } },
  notify(message) { wx.showToast({ title: String(message || "操作失败").slice(0, 20), icon: "none", duration: 2600 }); },
});
