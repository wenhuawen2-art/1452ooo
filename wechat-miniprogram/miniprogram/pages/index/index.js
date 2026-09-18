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
const decorateTemplate = (template) => ({ ...template, iconSrc: `/assets/icons/template-${template.id}.svg` });
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
const decorateTrip = (trip) => trip ? ({ ...decorateTripSummary(trip), members: (trip.members || []).map((member) => ({ ...member, avatarSrc: avatarSrc(member) })) }) : trip;
const progress = (items) => ({ done: items.filter((item) => item.done).length, total: items.length });
const percent = (done, total) => total ? Math.round(done / total * 100) : 0;

Page({
  data: {
    loading: true, error: "", account: null, trip: null, trips: [], tab: "today", scope: "公共",
    selectedDate: todayKey(), dates: [], dateLabel: "", daysUntil: 0, tripDays: 0, me: null, isOwner: false,
    publicProgress: { done: 0, total: 0, percent: 0 }, mineProgress: { done: 0, total: 0, percent: 0 },
    weather: null, weatherLoading: false, periods: [], hotel: null, selectedTickets: [], checklistGroups: [], templates: [],
    avatars: AVATARS, tripTypes: TRIP_TYPES, modal: null, busy: false, invite: "",
  },
  onLoad(options) { this.pendingInvite = options.invite || ""; this.bootstrap(); },
  onShow() { if (this.data.trip && !this.data.loading) this.refreshTrip(false); },
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
      if (!account.profileComplete) { this.openProfile(true); this.setData({ loading: false }); return; }
      if (this.pendingInvite) { await this.prepareInvite(this.pendingInvite); this.setData({ loading: false }); return; }
      const stored = wx.getStorageSync("xiangye-current-trip");
      const chosen = result.trips.find((entry) => entry.id === stored && !entry.archived) || result.trips.find((entry) => !entry.archived) || result.trips[0];
      if (chosen) await this.loadTrip(chosen.id);
      this.setData({ loading: false });
    } catch (error) { this.setData({ loading: false, error: error.message || "登录失败，请重试" }); }
  },
  retry() { this.bootstrap(); },
  async loadTrip(id) {
    let trip = await this.call("getTrip", { tripId: id });
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
    const checklistGroups = categories.map((category) => ({ ...category, items: trip.items.filter((item) => item.categoryId === category.id && (this.data.scope === "公共" ? !item.owner : item.owner === trip.me)) }));
    this.setData({ selectedDate, dates, dateLabel: `${pretty(selectedDate)} · 第 ${gap(trip.start, selectedDate) + 1} 天`, daysUntil: Math.max(0, gap(todayKey(), trip.start)), tripDays: Math.max(1, gap(trip.start, trip.end) + 1), me: me ? { ...me, avatarSrc: avatarSrc(me) } : null, isOwner: trip.me === trip.creator, publicProgress: { ...pub, percent: percent(pub.done, pub.total) }, mineProgress: { ...mine, percent: percent(mine.done, mine.total) }, periods, hotel, selectedTickets, checklistGroups });
  },
  periodFor(time = "") { return time < "13:00" ? "上午" : time < "18:00" ? "下午" : "晚上"; },
  async refreshTrip(showLoading = true) { if (!this.data.trip) return; if (showLoading) wx.showLoading({ title: "正在刷新" }); try { await this.loadTrip(this.data.trip.id); } catch (error) { this.notify(error.message); } finally { if (showLoading) wx.hideLoading(); } },
  setTab(event) { const tab = event.currentTarget.dataset.tab; this.setData({ tab }); if (tab === "today") this.loadWeather(); if (tab === "people") this.reloadTrips(); },
  setScope(event) { this.setData({ scope: event.currentTarget.dataset.scope }, () => this.derive()); },
  selectDate(event) { this.setData({ selectedDate: event.currentTarget.dataset.date }, () => { this.derive(); if (this.data.tab === "today") this.loadWeather(); }); },
  openChecklist(event) { this.setData({ scope: event.currentTarget.dataset.scope, tab: "list" }, () => this.derive()); },
  async reloadTrips() { try { this.setData({ trips: (await this.call("listTrips")).map(decorateTripSummary) }); } catch (error) { this.notify(error.message); } },
  async loadWeather() { if (!this.data.trip) return; this.setData({ weatherLoading: true }); try { this.setData({ weather: await this.call("getWeather", { tripId: this.data.trip.id, date: this.data.selectedDate }) }); } catch (error) { this.setData({ weather: { available: false, reason: error.message } }); } finally { this.setData({ weatherLoading: false }); } },
  openProfile(required = false) { const account = this.data.account || {}; this.setData({ modal: { type: "profile", title: required ? "设置你的资料" : "编辑我的资料", required, values: { nickname: account.nickname || "旅行者", avatarId: account.avatarId || "avatar-01", avatarData: account.avatarData || "" } } }); },
  openProfileTap() { this.openProfile(false); },
  openCreateTrip() { const now = todayKey(); this.setData({ modal: { type: "trip", title: "创建旅行", values: { name: "", type: "自驾游", startDate: now, startTime: "08:00", endDate: addDay(now, 3), endTime: "18:00" } } }); },
  openEditTrip() { const trip = this.data.trip; this.setData({ modal: { type: "trip", edit: true, title: "编辑旅行", values: { name: trip.name, type: trip.type || "自驾游", startDate: day(trip.start), startTime: trip.start.slice(11, 16), endDate: day(trip.end), endTime: trip.end.slice(11, 16) } } }); },
  openEvent(event) { const id = event.currentTarget.dataset.id; const current = this.data.trip.events.find((entry) => entry.id === id) || {}; this.setData({ modal: { type: "event", edit: !!id, title: id ? "编辑行程安排" : "添加行程安排", id, values: { title: current.title || "", date: current.date || event.currentTarget.dataset.date || this.data.selectedDate, startTime: current.startTime || current.time || "09:00", endTime: current.endTime || "10:00", startPlace: current.startPlace || "", endPlace: current.endPlace || "", address: current.address || "", note: current.note || "" } } }); },
  openHotel(event) { const id = event.currentTarget.dataset.id; const current = this.data.trip.hotels.find((entry) => entry.id === id) || {}; this.setData({ modal: { type: "hotel", edit: !!id, title: id ? "编辑住宿" : "添加住宿", id, values: { name: current.name || "", city: current.city || "", address: current.address || "", checkin: current.checkin || this.data.selectedDate, checkout: current.checkout || addDay(this.data.selectedDate, 1), phone: current.phone || "", note: current.note || "" } } }); },
  openItem(event) { const id = event.currentTarget.dataset.id; const current = this.data.trip.items.find((entry) => entry.id === id) || {}; const groups = this.data.trip.categories.filter((entry) => this.data.scope === "公共" ? !entry.owner : entry.owner === this.data.trip.me); const categoryId = current.categoryId || event.currentTarget.dataset.category || groups[0]?.id || ""; const categoryIndex = Math.max(0, groups.findIndex((entry) => entry.id === categoryId)); this.setData({ modal: { type: "item", edit: !!id, title: id ? "编辑清单条目" : "新增条目", id, categories: groups, categoryIndex, categoryName: groups[categoryIndex]?.name || "当前分类", values: { title: current.title || "", categoryId, key: !!current.key, remind: current.remind || "", linkedDate: current.linkedDate || "" } } }); },
  openCategory() { this.setData({ modal: { type: "category", title: "新建分类", values: { name: "" } } }); },
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
      else if (modal.type === "trip") { const payload = { ...values, start: `${values.startDate}T${values.startTime}`, end: `${values.endDate}T${values.endTime}` }; const result = modal.edit ? await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "trip", ...payload }) : await this.call("createTrip", payload); this.setData({ trip: decorateTrip(result.trip), modal: null, tab: "today" }); await this.reloadTrips(); this.derive(); this.loadWeather(); }
      else if (modal.type === "join") { const result = await this.call("joinTrip", { invite: modal.invite }); this.pendingInvite = ""; this.setData({ trip: decorateTrip(result.trip), modal: null, tab: "today" }); await this.reloadTrips(); this.derive(); this.loadWeather(); }
      else if (["event", "hotel", "item", "category", "ticketMeta"].includes(modal.type)) { const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action: modal.type, id: modal.id || undefined, scope: this.data.scope === "公共" ? "公共" : "我的", ...values }); this.setData({ trip: decorateTrip(result.trip), modal: null }); this.derive(); }
      this.notify("已保存");
    } catch (error) { this.notify(error.message); } finally { wx.hideLoading(); this.setData({ busy: false }); }
  },
  async mutateAction(event) { const action = event.currentTarget.dataset.action, id = event.currentTarget.dataset.id; try { const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action, id }); this.setData({ trip: result.trip }); this.derive(); } catch (error) { this.notify(error.message); } },
  async importTemplate(event) { try { const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "importTemplate", templateId: event.currentTarget.dataset.id, scope: this.data.scope === "公共" ? "公共" : "我的" }); this.setData({ trip: result.trip, modal: null }); this.derive(); this.notify("模板已导入"); } catch (error) { this.notify(error.message); } },
  async confirmDelete(event) { const action = event.currentTarget.dataset.action, id = event.currentTarget.dataset.id; const labels = { deleteItem: "删除这条清单内容？", deleteEvent: "删除这项行程？", deleteHotel: "删除这项住宿？", deleteTicket: "删除这张票据？", removeMember: "移除这位同行成员？", archive: "归档后旅行将只可查看，确认归档？", rotate: "旧邀请会立即失效，确认更换？" }; const confirmed = await new Promise((resolve) => wx.showModal({ title: "请确认", content: labels[action] || "确认继续？", success: (result) => resolve(result.confirm) })); if (!confirmed) return; try { const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action, id, member: id }); this.setData({ trip: result.trip }); this.derive(); this.notify("已完成"); } catch (error) { this.notify(error.message); } },
  async deleteTrip() { const trip = this.data.trip; const first = await new Promise((resolve) => wx.showModal({ title: "删除整趟旅行？", content: "行程、清单、成员和票据都会永久删除。", success: (result) => resolve(result.confirm) })); if (!first) return; try { const prepared = await this.call("mutateTrip", { tripId: trip.id, revision: trip.revision, action: "prepareDeletion" }); const typed = await new Promise((resolve) => wx.showModal({ title: "最后确认", content: `请输入旅行名称：${trip.name}`, editable: true, placeholderText: trip.name, success: (result) => resolve(result.confirm ? result.content : "") })); if (!typed) return; await this.call("mutateTrip", { tripId: trip.id, revision: trip.revision, action: "deleteTrip", challenge: prepared.challenge, confirmName: typed }); wx.removeStorageSync("xiangye-current-trip"); this.setData({ trip: null, trips: [], tab: "today" }); await this.bootstrap(); } catch (error) { this.notify(error.message); } },
  async switchTrip(event) { try { await this.loadTrip(event.currentTarget.dataset.id); this.setData({ tab: "today" }); } catch (error) { this.notify(error.message); } },
  async prepareInvite(invite) { const preview = await this.call("previewInvite", { invite }); this.setData({ modal: { type: "join", title: `加入 · ${preview.tripName}`, invite, values: {} } }); },
  onShareAppMessage() { const trip = this.data.trip; return trip?.invite ? { title: `加入“${trip.name}”的旅行准备`, path: `/pages/index/index?invite=${trip.invite}` } : { title: "向野 · 自驾旅行助手", path: "/pages/index/index" }; },
  copyInvite() { if (this.data.trip?.invite) wx.setClipboardData({ data: `https://zdata-d4g6l75lwebf2dbb0-1485288642.tcloudbaseapp.com/?invite=${this.data.trip.invite}` }); },
  async openMap(event) { const place = event.currentTarget.dataset.place; if (!place) return this.notify("请先填写地址"); wx.showLoading({ title: "正在定位" }); try { const location = await this.call("resolveLocation", { tripId: this.data.trip.id, place }); await wx.openLocation({ latitude: location.latitude, longitude: location.longitude, name: location.name, address: location.address, scale: 15 }); } catch (error) { this.notify(error.message); } finally { wx.hideLoading(); } },
  async addTicket() { try { const media = await wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"] }); const file = media.tempFiles[0]; const compressed = await wx.compressImage({ src: file.tempFilePath, quality: 72 }); this.ticketPath = compressed.tempFilePath; this.setData({ modal: { type: "ticket", title: "添加票据", values: { type: "门票", startTime: `${this.data.selectedDate}T09:00` } } }); } catch (error) { if (!/cancel/i.test(error.errMsg || "")) this.notify("选择图片失败"); } },
  async submitTicket() { if (!this.ticketPath || this.data.busy) return; this.setData({ busy: true }); wx.showLoading({ title: "正在上传" }); try { const fs = wx.getFileSystemManager(); const info = fs.statSync(this.ticketPath); const imageBase64 = fs.readFileSync(this.ticketPath, "base64"); const result = await this.call("uploadTicket", { tripId: this.data.trip.id, revision: this.data.trip.revision, type: this.data.modal.values.type, startTime: this.data.modal.values.startTime, imageBase64, mime: "image/jpeg", size: info.size }); this.ticketPath = ""; this.setData({ trip: result.trip, modal: null }); this.derive(); this.notify("票据已添加"); } catch (error) { this.notify(error.message); } finally { wx.hideLoading(); this.setData({ busy: false }); } },
  previewTicket(event) { const ticket = this.data.trip.tickets.find((entry) => entry.id === event.currentTarget.dataset.id); if (ticket?.imageUrl) wx.previewImage({ current: ticket.imageUrl, urls: [ticket.imageUrl] }); },
  editTicket(event) { const ticket = this.data.trip.tickets.find((entry) => entry.id === event.currentTarget.dataset.id); if (!ticket) return; this.setData({ modal: { type: "ticketMeta", title: "编辑票据", id: ticket.id, values: { type: ticket.type || ticket.title || "其他票据", startTime: ticket.startTime } } }); },
  async exportCalendar() { const trip = this.data.trip; const stamp = (value) => String(value || "").replace(/[-:]/g, "") + "00"; const escape = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n"); const events = (trip.events || []).map((event) => `BEGIN:VEVENT\r\nUID:${event.id}@xiangye\r\nDTSTART:${stamp(`${event.date}T${event.startTime}`)}\r\nDTEND:${stamp(`${event.date}T${event.endTime}`)}\r\nSUMMARY:${escape(event.title)}\r\nLOCATION:${escape(event.address || event.endPlace || event.startPlace)}\r\nDESCRIPTION:${escape(event.note)}\r\nEND:VEVENT`).join("\r\n"); const content = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Xiangye//Travel//CN\r\nCALSCALE:GREGORIAN\r\n${events}\r\nEND:VCALENDAR\r\n`; const path = `${wx.env.USER_DATA_PATH}/向野-${trip.name}-行程.ics`; try { wx.getFileSystemManager().writeFileSync(path, content, "utf8"); await wx.openDocument({ filePath: path, fileType: "ics", showMenu: true }); } catch { try { await wx.shareFileMessage({ filePath: path, fileName: `向野-${trip.name}-行程.ics` }); } catch { this.notify("日历文件已生成，请从右上角转发"); } } },
  async exportTrip() { try { const result = await this.call("mutateTrip", { tripId: this.data.trip.id, revision: this.data.trip.revision, action: "exportTrip" }); const path = `${wx.env.USER_DATA_PATH}/向野-${this.data.trip.name}-备份.json`; wx.getFileSystemManager().writeFileSync(path, JSON.stringify(result.exportData, null, 2), "utf8"); await wx.shareFileMessage({ filePath: path, fileName: `向野-${this.data.trip.name}-备份.json` }); } catch (error) { this.notify(error.message || "导出失败"); } },
  notify(message) { wx.showToast({ title: String(message || "操作失败").slice(0, 20), icon: "none", duration: 2600 }); },
});
