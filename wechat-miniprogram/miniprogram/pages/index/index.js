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
const decorateTrip = (trip) => trip ? ({ ...decorateTripSummary(trip), members: (trip.members || []).map((member) => ({ ...member, avatarSrc: avatarSrc(member) })), tickets: (trip.tickets || []).map((ticket) => ({ ...ticket, previewSrc: ticket.imageUrl || ticket.fileId || "" })) }) : trip;
const progress = (items) => ({ done: items.filter((item) => item.done).length, total: items.length });
const percent = (done, total) => total ? Math.round(done / total * 100) : 0;

Page({
  data: {
    loading: true, error: "", account: null, trip: null, trips: [], tab: "today", scope: "公共",
    selectedDate: todayKey(), dates: [], dateLabel: "", tripStartDate: "", tripEndDate: "", daysUntil: 0, tripDays: 0, me: null, isOwner: false,
    publicProgress: { done: 0, total: 0, percent: 0 }, mineProgress: { done: 0, total: 0, percent: 0 },
    weather: null, weatherLoading: false, periods: [], hotel: null, selectedTickets: [], checklistGroups: [], templates: [], categoryMenuId: "", expenses: [], expenseSummary: { totalYuan: "0.00", myNetMinor: 0, myNetLabel: "¥0.00" },
    avatars: AVATARS, tripTypes: TRIP_TYPES, modal: null, busy: false, invite: "", loginProfile: null,
  },
  onLoad(options) { this.pendingInvite = options.invite || ""; this.bootstrap(); },
  onShow() { if (this.data.trip && !this.data.loading && !this.pendingChecklistActions?.size && !this.data.busy) this.refreshTrip(false); },
  async call(operation, data = {}) {
    const response = await wx.cloud.callFunction({ name: "suixing-api", data: { operation, data } });
    const envelope = response?.result;
    if (!envelope?.ok) throw Object.assign(new Error(envelope?.error || "操作失败"), { status: envelope?.status || 500 });
    return envelope.data;
  },
  async bootstrap() {
    this.setData({ loading: true, error: "" });
    try {
      const result = await this.call("bootstrapAccount");
      const account = { ...result.account, avatarSrc: avatarSrc(result.account) };
      this.setData({ account, trips: (result.trips || []).map(decorateTripSummary) });
      if (!account.profileComplete) {
        this.setData({ loading: false, loginProfile: { nickname: "", avatarUrl: "" } });
        return;
      }
      if (this.pendingInvite) { await this.prepareInvite(this.pendingInvite); this.setData({ loading: false }); return; }
      const stored = wx.getStorageSync("xiangye-current-trip");
      const chosen = result.trips.find((entry) => entry.id === stored && !entry.archived) || result.trips.find((entry) => !entry.archived) || result.trips[0];
      if (chosen) await this.loadTrip(chosen.id);
      this.setData({ loading: false });
    } catch (error) { this.setData({ loading: false, error: error.message || "登录失败，请重试" }); }
  },
  retry() { this.bootstrap(); },
  chooseWechatAvatar(event) {
    const avatarUrl = event.detail?.avatarUrl || "";
    if (avatarUrl) this.setData({ "loginProfile.avatarUrl": avatarUrl });
  },
  bindWechatNickname(event) { this.setData({ "loginProfile.nickname": event.detail.value }); },
  async loginWithWechat() {
    const profile = this.data.loginProfile || {};
    if (!profile.avatarUrl) return this.notify("请选择微信头像");
    if (!String(profile.nickname || "").trim()) return this.notify("请填写微信昵称");
    if (this.data.busy) return;
    this.setData({ busy: true }); wx.showLoading({ title: "正在登录" });
    try {
      const avatarData = await this.readAvatarData(profile.avatarUrl);
      const result = await this.call("updateAccountProfile", { nickname: profile.nickname.trim(), avatarId: "", avatarData });
      const account = { ...result.account, avatarSrc: avatarSrc(result.account) };
      this.setData({ account, loginProfile: null });
      if (this.pendingInvite) await this.prepareInvite(this.pendingInvite);
      else {
        await this.reloadTrips();
        const chosen = this.data.trips.find((entry) => !entry.archived) || this.data.trips[0];
        if (chosen) await this.loadTrip(chosen.id);
      }
    } catch (error) { this.notify(error.message || "微信登录失败"); }
    finally { wx.hideLoading(); this.setData({ busy: false }); }
  },
  async readAvatarData(path) {
    let localPath = path;
    if (/^https?:\/\//.test(path)) localPath = (await wx.downloadFile({ url: path })).tempFilePath;
    const compressed = await wx.compressImage({ src: localPath, quality: 72 }).catch(() => ({ tempFilePath: localPath }));
    const data = wx.getFileSystemManager().readFileSync(compressed.tempFilePath || localPath, "base64");
    return `data:image/jpeg;base64,${data}`;
  },
  async loadTrip(id) {
    const loadVersion = this.localChangeVersion || 0;
    let trip = await this.call("getTrip", { tripId: id });
    if (loadVersion !== (this.localChangeVersion || 0)) return;
    trip = decorateTrip(trip);
    wx.setStorageSync("xiangye-current-trip", id);
    this.setData({ trip, selectedDate: this.clampDate(this.data.selectedDate, trip), invite: trip.invite || "" });
    this.derive();
    if (this.data.tab === "today") this.loadWeather();
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
    const periods = PERIODS.map((period) => ({ ...period, events: events.filter((entry) => (entry.period || this.periodFor(entry.startTime)) === period.name).map((entry) => ({ ...entry, locationText: entry.address || entry.endPlace || entry.startPlace || "" })) })).filter((entry) => entry.events.length);
    const hotel = (trip.hotels || []).find((entry) => entry.checkin <= selectedDate && selectedDate < entry.checkout) || null;
    const selectedTickets = (trip.tickets || []).filter((entry) => entry.date === selectedDate);
    const categories = trip.categories.filter((entry) => this.data.scope === "公共" ? !entry.owner : entry.owner === trip.me);
    const membersById = new Map((trip.members || []).map((member) => [member.id, member]));
    const checklistGroups = categories.map((category) => ({ ...category, items: trip.items.filter((item) => item.categoryId === category.id && (this.data.scope === "公共" ? !item.owner : item.owner === trip.me)).map((item) => {
      const confirmer = membersById.get(item.byMemberId);
      return { ...item, confirmerName: confirmer?.name || item.by || "", confirmerAvatarSrc: confirmer ? avatarSrc(confirmer) : "" };
    }) }));
    this.setData({ selectedDate, dates, dateLabel: `${pretty(selectedDate)} · 第 ${gap(trip.start, selectedDate) + 1} 天`, tripStartDate: day(trip.start), tripEndDate: day(trip.end), daysUntil: Math.max(0, gap(todayKey(), trip.start)), tripDays: Math.max(1, gap(trip.start, trip.end) + 1), me: me ? { ...me, avatarSrc: avatarSrc(me) } : null, isOwner: trip.me === trip.creator, publicProgress: { ...pub, percent: percent(pub.done, pub.total) }, mineProgress: { ...mine, percent: percent(mine.done, mine.total) }, periods, hotel, selectedTickets, checklistGroups });
  },
  periodFor(time = "") { return time < "13:00" ? "上午" : time < "18:00" ? "下午" : "晚上"; },
  async refreshTrip(showLoading = true) { if (!this.data.trip || this.pendingChecklistActions?.size || this.data.busy) return; if (showLoading) wx.showLoading({ title: "正在刷新" }); try { await this.loadTrip(this.data.trip.id); } catch (error) { this.notify(error.message); } finally { if (showLoading) wx.hideLoading(); } },
  setTab(event) { const tab = event.currentTarget.dataset.tab; this.setData({ tab }); if (tab === "today") this.loadWeather(); if (tab === "people") this.reloadTrips(); if (tab === "expenses") this.loadExpenses(); },
  async loadExpenses() { if (!this.data.trip) return; try { const result = await this.call("listExpenses", { tripId: this.data.trip.id }); const members = new Map((result.members || []).map((member) => [member.id, member.name])); const expenses = (result.expenses || []).map((entry) => ({ ...entry, payerName: members.get(entry.payerMemberId) || "未知成员", displayAmount: `${entry.currency === "CNY" ? "¥" : entry.currency + " "}${(Number(entry.amountMinor || 0) / 100).toFixed(2)}` })); const me = result.summary?.me || { netMinor: 0 }; this.setData({ expenses, expenseSummary: { totalYuan: (Number(result.summary?.totalMinor || 0) / 100).toFixed(2), myNetMinor: me.netMinor, myNetLabel: `${me.netMinor >= 0 ? "应收" : "应付"} ¥${(Math.abs(me.netMinor) / 100).toFixed(2)}` } }); } catch (error) { this.notify(error.message); } },
  setScope(event) { this.setData({ scope: event.currentTarget.dataset.scope }, () => this.derive()); },
  selectDate(event) { this.setData({ selectedDate: event.currentTarget.dataset.date }, () => { this.derive(); if (this.data.tab === "today") this.loadWeather(); }); },
  openChecklist(event) { this.setData({ scope: event.currentTarget.dataset.scope, tab: "list" }, () => this.derive()); },
  openExpense() { if (!this.data.trip || this.data.trip.archived) return; this.setData({ modal: { type: "expense", title: "记一笔", values: { date: this.data.selectedDate, title: "", amount: "", note: "", isAA: true } } }); },
  openExpenseSplit() { this.setData({ tab: "expenses" }, () => this.loadExpenses()); },
  async reloadTrips() { try { this.setData({ trips: (await this.call("listTrips")).map(decorateTripSummary) }); } catch (error) { this.notify(error.message); } },
  async loadWeather() { if (!this.data.trip) return; this.setData({ weatherLoading: true }); try { this.setData({ weather: await this.call("getWeather", { tripId: this.data.trip.id, date: this.data.selectedDate }) }); } catch (error) { this.setData({ weather: { available: false, reason: error.message } }); } finally { this.setData({ weatherLoading: false }); } },
  openProfile(required = false) { const account = this.data.account || {}; this.setData({ modal: { type: "profile", title: required ? "设置你的资料" : "编辑我的资料", required, values: { nickname: account.nickname || "旅行者", avatarId: account.avatarId || "avatar-01", avatarData: account.avatarData || "" } } }); },
  openProfileTap() { this.openProfile(false); },
  openCreateTrip() { const now = todayKey(); this.setData({ modal: { type: "trip", title: "创建旅行", values: { name: "", type: "自驾游", startDate: now, startTime: "08:00", endDate: addDay(now, 3), endTime: "18:00" } } }); },
  openCloneTrip() { const trip = this.data.trip; if (!trip || this.data.busy) return; this.setData({ modal: { type: "cloneTrip", title: "创建旅行副本", sourceId: trip.id, values: { name: `${trip.name}（副本）` } } }); },
  openEditTrip() { const trip = this.data.trip; this.setData({ modal: { type: "trip", edit: true, title: "编辑旅行", values: { name: trip.name, type: trip.type || "自驾游", startDate: day(trip.start), startTime: trip.start.slice(11, 16), endDate: day(trip.end), endTime: trip.end.slice(11, 16) } } }); },
  openEvent(event) { const id = event.currentTarget.dataset.id; const current = this.data.trip.events.find((entry) => entry.id === id) || {}; this.setData({ modal: { type: "event", edit: !!id, title: id ? "编辑行程安排" : "添加行程安排", id, values: { title: current.title || "", date: current.date || event.currentTarget.dataset.date || this.data.selectedDate, startTime: current.startTime || current.time || "09:00", endTime: current.endTime || "10:00", startPlace: current.startPlace || "", endPlace: current.endPlace || "", address: current.address || "", note: current.note || "" } } }); },
  openHotel(event) { const id = event.currentTarget.dataset.id; const current = this.data.trip.hotels.find((entry) => entry.id === id) || {}; this.setData({ modal: { type: "hotel", edit: !!id, title: id ? "编辑住宿" : "添加住宿", id, values: { name: current.name || "", city: current.city || "", address: current.address || "", checkin: current.checkin || this.data.selectedDate, checkout: current.checkout || addDay(this.data.selectedDate, 1), phone: current.phone || "", note: current.note || "" } } }); },
  openItem(event) { const id = event.currentTarget.dataset.id; const current = this.data.trip.items.find((entry) => entry.id === id) || {}; const groups = this.data.trip.categories.filter((entry) => this.data.scope === "公共" ? !entry.owner : entry.owner === this.data.trip.me); const categoryId = current.categoryId || event.currentTarget.dataset.category || groups[0]?.id || ""; const categoryIndex = Math.max(0, groups.findIndex((entry) => entry.id === categoryId)); this.setData({ modal: { type: "item", edit: !!id, title: id ? "编辑清单条目" : "新增条目", id, categories: groups, categoryIndex, categoryName: groups[categoryIndex]?.name || "当前分类", values: { title: current.title || "", categoryId, key: !!current.key, remind: current.remind || "", linkedDate: current.linkedDate || "" } } }); },
  toggleCategoryMenu(event) { const id = event.currentTarget.dataset.id; this.setData({ categoryMenuId: this.data.categoryMenuId === id ? "" : id }); },
  openCategory(event) { const id = event?.currentTarget?.dataset?.id; const current = this.data.trip?.categories.find((entry) => entry.id === id); this.setData({ categoryMenuId: "", modal: { type: "category", id: current?.id || "", title: current ? "编辑分类" : "新建分类", values: { name: current?.name || "" } } }); },
  async openTemplates() { try { const templates = this.data.templates.length ? this.data.templates : (await this.call("listChecklistTemplates")).map(decorateTemplate); this.setData({ templates, modal: { type: "templates", title: "导入清单模板", values: {} } }); } catch (error) { this.notify(error.message); } },
  openTemplateDetail(event) { const template = this.data.templates.find((entry) => entry.id === event.currentTarget.dataset.id); if (!template) return this.notify("清单模板不存在"); this.setData({ modal: { type: "templateDetail", title: template.name, template, values: {} } }); },
  closeModal() { if (this.data.modal?.required) return; this.setData({ modal: null }); }, stopBubble() {},
  bindInput(event) { this.setData({ [`modal.values.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  bindSwitch(event) { this.setData({ [`modal.values.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  bindDate(event) { this.setData({ [`modal.values.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  bindTime(event) { this.setData({ [`modal.values.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  bindType(event) { this.setData({ "modal.values.type": TRIP_TYPES[Number(event.detail.value)] }); },
  bindCategory(event) { const index = Number(event.detail.value); this.setData({ "modal.categoryIndex": index, "modal.values.categoryId": this.data.modal.categories[index].id }); },
  chooseAvatar(event) { this.setData({ "modal.values.avatarId": event.currentTarget.dataset.id, "modal.values.avatarData": "" }); },
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
  async submitModal() {
    const modal = this.data.modal; if (!modal || this.data.busy) return; this.setData({ busy: true }); wx.showLoading({ title: "正在保存" });
    try {
      const values = modal.values;
      if (modal.type === "profile") { const result = await this.call("updateAccountProfile", values); const account = { ...result.account, avatarSrc: avatarSrc(result.account) }; this.setData({ account, modal: null }); if (this.pendingInvite) await this.prepareInvite(this.pendingInvite); else await this.reloadTrips(); }
      else if (modal.type === "cloneTrip") { this.localChangeVersion = (this.localChangeVersion || 0) + 1; const result = await this.call("cloneTrip", { tripId: modal.sourceId, name: values.name }); wx.setStorageSync("xiangye-current-trip", result.trip.id); this.setData({ trip: decorateTrip(result.trip), selectedDate: day(result.trip.start), modal: null, tab: "people" }); await this.reloadTrips(); this.derive(); }
      else if (modal.type === "trip") { const payload = { ...values, start: `${values.startDate}T${values.startTime}`, end: `${values.endDate}T${values.endTime}` }; const result = modal.edit ? await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "trip", ...payload }) : await this.call("createTrip", payload); this.setData({ trip: decorateTrip(result.trip), modal: null, tab: "today" }); await this.reloadTrips(); this.derive(); this.loadWeather(); }
      else if (modal.type === "join") { const result = await this.call("joinTrip", { invite: modal.invite }); this.pendingInvite = ""; this.setData({ trip: decorateTrip(result.trip), modal: null, tab: "today" }); await this.reloadTrips(); this.derive(); this.loadWeather(); }
      else if (modal.type === "expense") { const result = await this.call("saveExpense", { tripId: this.data.trip.id, revision: this.data.trip.revision, date: values.date, title: values.title, amount: values.amount, currency: "CNY", category: "其他", payerMemberId: this.data.trip.me, splitMode: values.isAA ? "equal" : "personal", participants: this.data.trip.members.map((member) => member.id), note: values.note }); this.setData({ modal: null, "trip.revision": result.revision }); await this.loadExpenses(); }
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
      }
      this.notify("已保存");
    } catch (error) { this.notify(error.message); } finally { wx.hideLoading(); this.setData({ busy: false }); }
  },
  mutateAction(event) {
    const { action, id } = event.currentTarget.dataset;
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
  async importTemplate(event) { try { const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "importTemplate", templateId: event.currentTarget.dataset.id, scope: this.data.scope === "公共" ? "公共" : "我的" }); this.setData({ trip: result.trip, modal: null }); this.derive(); this.notify("模板已导入"); } catch (error) { this.notify(error.message); } },
  async confirmDelete(event) { const action = event.currentTarget.dataset.action, id = event.currentTarget.dataset.id; this.setData({ categoryMenuId: "" }); const count = action === "deleteCategory" ? this.data.trip.items.filter((item) => item.categoryId === id).length : 0; const labels = { deleteItem: "删除这条清单内容？", deleteCategory: `删除此分类及其中 ${count} 条清单内容？此操作无法撤销。`, deleteEvent: "删除这项行程？", deleteHotel: "删除这项住宿？", deleteTicket: "删除这张票据？", removeMember: "移除这位同行成员？", archive: "归档后旅行将只可查看，确认归档？", rotate: "旧邀请会立即失效，确认更换？" }; const confirmed = await new Promise((resolve) => wx.showModal({ title: "请确认", content: labels[action] || "确认继续？", success: (result) => resolve(result.confirm) })); if (!confirmed) return; try { this.localChangeVersion = (this.localChangeVersion || 0) + 1; const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action, id, member: id }); this.setData({ trip: decorateTrip(result.trip) }); this.derive(); this.notify("已完成"); } catch (error) { this.notify(error.message); } },
  async deleteTrip(event) {
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
  async switchTrip(event) { try { await this.loadTrip(event.currentTarget.dataset.id); this.setData({ tab: "today" }); } catch (error) { this.notify(error.message); } },
  async prepareInvite(invite) { const preview = await this.call("previewInvite", { invite }); this.setData({ modal: { type: "join", title: `加入 · ${preview.tripName}`, invite, values: {} } }); },
  onShareAppMessage() { const trip = this.data.trip; return trip?.invite ? { title: `加入“${trip.name}”的旅行准备`, path: `/pages/index/index?invite=${trip.invite}` } : { title: "向野 · 自驾旅行助手", path: "/pages/index/index" }; },
  copyInvite() { if (this.data.trip?.invite) wx.setClipboardData({ data: `https://zdata-d4g6l75lwebf2dbb0-1485288642.tcloudbaseapp.com/?invite=${this.data.trip.invite}` }); },
  async openMap(event) { const place = event.currentTarget.dataset.place; if (!place) return this.notify("请先填写地址"); wx.showLoading({ title: "正在定位" }); try { const location = await this.call("resolveLocation", { tripId: this.data.trip.id, place }); await wx.openLocation({ latitude: Number(location.latitude), longitude: Number(location.longitude), name: location.name || place, address: location.address || place, scale: 15 }); } catch (error) { this.notify(error.message); } finally { wx.hideLoading(); } },
  async addTicket() { try { const media = await wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"] }); const file = media.tempFiles[0]; const compressed = await wx.compressImage({ src: file.tempFilePath, quality: 72 }); this.ticketPath = compressed.tempFilePath; this.setData({ modal: { type: "ticket", title: "添加票据", values: { type: "门票", useDate: this.data.selectedDate, useClock: "09:00" } } }); } catch (error) { if (!/cancel/i.test(error.errMsg || "")) this.notify("选择图片失败"); } },
  async submitTicket() { if (!this.ticketPath || this.data.busy) return; this.setData({ busy: true }); wx.showLoading({ title: "正在上传" }); let fileID = ""; try { const fs = wx.getFileSystemManager(); const info = fs.statSync(this.ticketPath); if (info.size > 10 * 1024 * 1024) throw new Error("图片过大，请选择 10MB 以内的图片"); const suffix = (this.ticketPath.match(/\.(png|webp|jpe?g)$/i)?.[1] || "jpg").replace("jpeg", "jpg"); const uploaded = await wx.cloud.uploadFile({ cloudPath: `tickets/${this.data.trip.id}/${Date.now()}-${Math.random().toString(16).slice(2)}.${suffix}`, filePath: this.ticketPath }); fileID = uploaded.fileID; const values = this.data.modal.values; const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "ticket", type: values.type, startTime: `${values.useDate}T${values.useClock}`, fileId: fileID, mime: `image/${suffix === "jpg" ? "jpeg" : suffix}`, size: info.size }); this.ticketPath = ""; this.setData({ trip: decorateTrip(result.trip), modal: null }); this.derive(); this.notify("票据已添加"); } catch (error) { if (fileID) wx.cloud.deleteFile({ fileList: [fileID] }).catch(() => {}); this.notify(error.message || "票据上传失败"); } finally { wx.hideLoading(); this.setData({ busy: false }); } },
  async previewTicket(event) { const ticket = this.data.trip.tickets.find((entry) => entry.id === event.currentTarget.dataset.id); if (!ticket) return; try { let src = ticket.imageUrl || ticket.fileId; if (src?.startsWith("cloud://")) src = (await wx.cloud.downloadFile({ fileID: src })).tempFilePath; if (!src) throw new Error("票据图片暂不可用"); await wx.previewImage({ current: src, urls: [src] }); } catch (error) { this.notify(error.message || "票据预览失败"); } },
  editTicket(event) { const ticket = this.data.trip.tickets.find((entry) => entry.id === event.currentTarget.dataset.id); if (!ticket) return; this.setData({ modal: { type: "ticketMeta", title: "编辑票据", id: ticket.id, values: { type: ticket.type || ticket.title || "其他票据", useDate: day(ticket.startTime), useClock: ticket.startTime.slice(11, 16) || "09:00" } } }); },
  async exportCalendar() { const trip = this.data.trip; const stamp = (value) => String(value || "").replace(/[-:]/g, "") + "00"; const escape = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n"); const events = (trip.events || []).map((event) => `BEGIN:VEVENT\r\nUID:${event.id}@xiangye\r\nDTSTART:${stamp(`${event.date}T${event.startTime}`)}\r\nDTEND:${stamp(`${event.date}T${event.endTime}`)}\r\nSUMMARY:${escape(event.title)}\r\nLOCATION:${escape(event.address || event.endPlace || event.startPlace)}\r\nDESCRIPTION:${escape(event.note)}\r\nEND:VEVENT`).join("\r\n"); const content = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Xiangye//Travel//CN\r\nCALSCALE:GREGORIAN\r\n${events}\r\nEND:VCALENDAR\r\n`; const path = `${wx.env.USER_DATA_PATH}/向野-${trip.name}-行程.ics`; try { wx.getFileSystemManager().writeFileSync(path, content, "utf8"); await wx.openDocument({ filePath: path, fileType: "ics", showMenu: true }); } catch { try { await wx.shareFileMessage({ filePath: path, fileName: `向野-${trip.name}-行程.ics` }); } catch { this.notify("日历文件已生成，请从右上角转发"); } } },
  async exportTrip() { try { const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "exportTrip" }); const path = `${wx.env.USER_DATA_PATH}/向野-${this.data.trip.name}-备份.json`; wx.getFileSystemManager().writeFileSync(path, JSON.stringify(result.exportData, null, 2), "utf8"); await wx.shareFileMessage({ filePath: path, fileName: `向野-${this.data.trip.name}-备份.json` }); } catch (error) { this.notify(error.message || "导出失败"); } },
  notify(message) { wx.showToast({ title: String(message || "操作失败").slice(0, 20), icon: "none", duration: 2600 }); },
});
