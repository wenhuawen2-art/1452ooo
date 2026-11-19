const { MODES, tripTypes, entryRows, messageRows, textBlocks, selectionSummary, buildEdits, validatePreview } = require('./presentation');
const requestId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
const active = status => status === 'queued' || status === 'running';
const GENERATION_LABELS = {
  analysis: '正在分析出行需求',
  reply: '正在撰写旅行回复',
  itinerary: '正在安排每日行程',
  checklist: '正在整理准备清单',
  finalizing: '正在整理最终回复',
};
function elapsedSince(receivedAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - receivedAt) / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
const headerProgress = scrollTop => Math.round(Math.min(1, Math.max(0, Number(scrollTop) || 0) / 64) * 100) / 100;
const COPY = {
  AI_DISABLED: '旅行助手暂未开放，请稍后再来。', AI_NOT_ALLOWED: '旅行助手正在内测，当前账号尚未获得体验资格。',
  AI_LIMIT_REACHED: '今日体验次数已用完，明天再来继续规划。', AI_BUSY: '上一份方案仍在生成，请稍候。',
  AI_DRAFT_EXPIRED: '这份方案已过期，请重新生成。', AI_TIMEOUT: '这次生成超时了。内容未写入旅行，可手动重新发送。',
  AI_MODEL_TIMEOUT: '这次生成超时了。可缩短要求后重新发送。',
  AI_CONFLICT: '这趟旅行刚刚有更新。请复核最新内容后，再确认追加。',
  AI_CONVERSATION_TRIP: '这段对话属于另一趟旅行，请返回后重新打开旅行助手。',
  AI_GLOBAL_DAILY_LIMIT: '今日全站 AI 额度已用完，明天恢复。已有对话仍可查看。',
  AI_GLOBAL_MONTHLY_LIMIT: '本月全站 AI 额度已用完，下月恢复。已有对话仍可查看。',
  AI_BUDGET_CONFIG: 'AI 使用额度配置待确认，请稍后再试。',
};
Page({
  data: {
    ready: false, allowed: false, blocked: '', error: '', input: '', messages: [], conversationId: '', jobId: '', jobStatus: '',
    submitting: false, pollPaused: false, requestPending: false, remainingToday: 0, dailyLimit: 20, keyboardHeight: 0, globalLimitReason: '',
    jobReceivedAt: 0, jobElapsed: '', jobPhaseLabel: '', loadingReply: false,
    contentTop: 88, headerHeight: 144, safeBottom: 24, reducedMotion: false, isPreview: false, scrollTarget: '',
    chatHeaderProgress: 0, readerHeaderProgress: 0, previewHeaderProgress: 0, readerScrollTop: 0, previewScrollTop: 0,
    planOpen: false, planText: '', planBlocks: [], planName: '', planMessageId: '', previewOpen: false, rows: [], selectedCount: 0, selectedEvents: 0, selectedItems: 0, applying: false, applicationPending: false, applyError: '', conflict: false,
    target: 'current', scope: '我的', currentTrip: null, newTrip: {}, newStartDate: '', newStartTime: '08:00', newEndDate: '', newEndTime: '18:00',
    modes: MODES, tripTypes, tripTypeIndex: 0, result: null,
    suggestions: ['帮我规划三天成都慢旅行', '准备一份自驾出行清单', '把这趟旅行安排得轻松一些'],
  },
  onLoad(options = {}) {
    this.visible = true; this.destroyed = false; this.sequence = 0; this.tripId = options.tripId || '';
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const capsule = wx.getMenuButtonBoundingClientRect?.();
    const contentTop = Math.max((info.statusBarHeight || 24) + 44, (capsule?.bottom || 0) + 12);
    this.setData({ contentTop, headerHeight: contentTop + 56, safeBottom: Math.max(12, (info.screenHeight || 0) - (info.safeArea?.bottom || info.screenHeight || 0)), isPreview: !!wx.__localPreview, reducedMotion: !!wx.getStorageSync('xiangye-reduced-motion') });
    this.keyboardListener = event => { if (!this.destroyed) this.setData({ keyboardHeight: event.height || 0 }); };
    wx.onKeyboardHeightChange?.(this.keyboardListener);
    this.initialize();
  },
  onShow() { this.visible = true; if (this.data.ready && this.data.jobId && active(this.data.jobStatus)) this.poll(); },
  onHide() { this.visible = false; clearTimeout(this.pollTimer); },
  onUnload() { this.destroyed = true; this.visible = false; this.sequence++; clearTimeout(this.pollTimer); wx.offKeyboardHeightChange?.(this.keyboardListener); },
  updateHeaderScroll(section, event) {
    if (this.destroyed) return;
    const value = Number(event?.detail?.scrollTop ?? event?.scrollTop) || 0;
    this[section + 'ScrollPosition'] = Math.max(0, value);
    const key = section + 'HeaderProgress', progress = headerProgress(value);
    if (progress !== this.data[key]) this.setData({ [key]: progress });
  },
  onChatScroll(event) { this.updateHeaderScroll('chat', event); },
  onReaderScroll(event) { this.updateHeaderScroll('reader', event); },
  onPreviewScroll(event) { this.updateHeaderScroll('preview', event); },
  async call(operation, data = {}) {
    const response = await wx.cloud.callFunction({ name: 'suixing-api', data: { operation, data } });
    const envelope = response?.result;
    if (!envelope?.ok) throw Object.assign(new Error(envelope?.error || '连接未完成，请重试'), { code: envelope?.code || '', status: envelope?.status || 500 });
    return envelope.data;
  },
  errorText(error) { return COPY[error?.code] || error?.message || '连接未完成，请重试'; },
  conversationTripId() { return this.scopeTripId ?? this.data.currentTrip?.id ?? ''; },
  remember(patch = {}) {
    if (!this.storageKey) return;
    const previous = wx.getStorageSync(this.storageKey) || {};
    wx.setStorageSync(this.storageKey, { ...previous, tripId: this.conversationTripId(), conversationId: this.data.conversationId, jobId: this.data.jobId, ...patch });
  },
  async initialize() {
    this.setData({ error: '', blocked: '', allowed: false, ready: false });
    this.scopeTripId ??= this.tripId || wx.getStorageSync('xiangye-current-trip') || '';
    try {
      const capabilities = await this.call('getAiCapabilities');
      if (this.destroyed) return;
      this.setData({ remainingToday: capabilities.remainingToday || 0, dailyLimit: capabilities.dailyLimit || 20, globalLimitReason: COPY[capabilities.globalBudget?.reason] || '' });
      if (!capabilities.canUse) { this.setData({ ready: true, blocked: capabilities.reason || (capabilities.allowed ? COPY.AI_DISABLED : COPY.AI_NOT_ALLOWED) }); return; }
      const session = await this.call('bootstrapAccount');
      if (this.destroyed) return;
      if (!session.account?.profileComplete) { this.setData({ ready: true, allowed: false, blocked: '请先登录，再使用旅行助手。' }); return; }
      const legacyKey = `xiangye-ai-session:${session.account.id}`;
      this.storageKey = `${legacyKey}:trip:${encodeURIComponent(this.scopeTripId) || 'unbound'}`;
      let saved = wx.getStorageSync(this.storageKey);
      const legacy = saved ? null : wx.getStorageSync(legacyKey);
      const tripId = this.scopeTripId;
      if (tripId) {
        const response = await this.call('getTrip', { tripId }); const trip = response.trip || response;
        if (this.destroyed) return;
        if (trip.id !== tripId) throw Object.assign(new Error(COPY.AI_CONVERSATION_TRIP), { code: 'AI_CONVERSATION_TRIP' });
        this.setData({ currentTrip: trip, target: trip.archived ? 'new' : 'current' });
      } else this.setData({ currentTrip: null, target: 'new' });
      let restored = false;
      const candidate = saved || legacy || {};
      if (candidate.conversationId) {
        try { await this.restore(candidate.conversationId); restored = true; if (!saved) saved = candidate; }
        catch (error) { if (![403, 404, 409, 410].includes(error.status)) throw error; }
      }
      if (!restored) await this.restore();
      if (this.destroyed) return;
      saved ||= legacy?.pending && (legacy.pending.tripId || '') === tripId && !legacy.conversationId ? legacy : {};
      if (saved.pending && (saved.pending.tripId || '') === tripId && (!saved.pending.conversationId || saved.pending.conversationId === this.data.conversationId) && !this.data.jobId) { this.pendingRequest = saved.pending; this.setData({ input: saved.pending.message, requestPending: true, error: '上次发送结果尚未确认，点击重试即可恢复，不会重复扣次。' }); }
      if (saved.pendingApply) this.resumeApplication(saved.pendingApply);
      this.remember({ pending: this.pendingRequest || null, pendingApply: this.applyRequest ? saved.pendingApply : null });
      this.setData({ ready: true, allowed: true });
      if (this.data.jobId && active(this.data.jobStatus)) this.poll();
    } catch (error) { if (!this.destroyed) this.setData({ ready: true, allowed: false, error: this.errorText(error) }); }
  },
  async restore(conversationId) {
    const tripId = this.conversationTripId();
    const conversation = await this.call('getAiConversation', { ...(conversationId ? { conversationId } : {}), tripId });
    if (this.destroyed) return;
    if ((conversation.tripId || '') !== tripId) throw Object.assign(new Error(COPY.AI_CONVERSATION_TRIP), { code: 'AI_CONVERSATION_TRIP', status: 409 });
    const messages = messageRows(conversation.messages);
    const last = messages[messages.length - 1];
    const jobId = conversation.activeJobId || '';
    const request = jobId ? messages.find(message => message.jobId === jobId && message.role === 'user') : null;
    const jobReceivedAt = jobId ? Number(request?.createdAt) || this.data.jobReceivedAt || Date.now() : 0;
    this.setData({ conversationId: conversation.conversationId || '', messages, jobId,
      jobStatus: jobId ? (active(request?.status) ? request.status : 'queued') : '',
      jobReceivedAt, jobElapsed: jobReceivedAt ? elapsedSince(jobReceivedAt) : '', jobPhaseLabel: '', loadingReply: false,
      scrollTarget: jobId ? 'generation-progress' : 'conversation-bottom',
      ...(last?.status === 'failed' ? { error: this.errorText(last.error) } : {}) });
    this.remember();
  },
  inputMessage(event) { this.setData({ input: event.detail.value }); },
  useSuggestion(event) { this.setData({ input: this.data.suggestions[Number(event.currentTarget.dataset.index)] }); },
  async send() {
    if (this.data.submitting || active(this.data.jobStatus) || !this.data.allowed) return;
    if (this.data.globalLimitReason && !this.pendingRequest) { this.setData({error:this.data.globalLimitReason}); return; }
    const message = this.pendingRequest?.message || this.data.input.trim();
    if (!message) return;
    if (message.length > 2000) { this.setData({ error: '每条消息最多 2,000 字，请精简后再发送。' }); return; }
    const payload = this.pendingRequest || { message, clientRequestId: requestId('chat'), tripId: this.conversationTripId(), ...(this.data.conversationId ? { conversationId: this.data.conversationId } : {}) };
    this.pendingRequest = payload; this.remember({ pending: payload });
    this.setData({ submitting: true, error: '', requestPending: false, result: null });
    try {
      const result = await this.call('submitAiMessage', payload);
      if (this.destroyed) return;
      this.pendingRequest = null;
      const waiting = active(result.status);
      const jobReceivedAt = waiting ? Date.now() : 0;
      this.setData({ conversationId: result.conversationId, jobId: result.jobId, jobStatus: result.status, remainingToday: result.remainingToday, input: '', requestPending: false, pollPaused: false,
        jobReceivedAt, jobElapsed: waiting ? elapsedSince(jobReceivedAt) : '', jobPhaseLabel: '', scrollTarget: '' });
      this.remember({ pending: null });
      try { await this.restore(result.conversationId); }
      catch (error) {
        if (!waiting) throw error;
        if (!this.destroyed) { this.setData({ scrollTarget: 'generation-progress' }); this.poll(); }
        return;
      }
      if (waiting) { if (this.data.jobId) this.poll(); }
      else this.setData({ jobId: '', jobStatus: '', error: result.status === 'failed' || result.status === 'cancelled' ? this.errorText(result.error || { message: '本次生成已停止，请重新发送。' }) : '' });
    } catch (error) {
      if (this.destroyed) return;
      const definitive = !!error.code || (error.status >= 400 && error.status < 500);
      if (definitive) { this.pendingRequest = null; this.remember({ pending: null }); }
      this.setData({ error: this.errorText(error), requestPending: !definitive, ...(/^AI_GLOBAL_/.test(error.code || '') ? {globalLimitReason:this.errorText(error)} : {}) });
    } finally { if (!this.destroyed) this.setData({ submitting: false }); }
  },
  async poll() {
    clearTimeout(this.pollTimer);
    if (!this.visible || this.destroyed || !this.data.jobId || !active(this.data.jobStatus) || this.polling) return;
    this.polling = true; const seq = this.sequence; const jobId = this.data.jobId;
    try {
      const result = await this.call('getAiJob', { jobId });
      if (this.destroyed || seq !== this.sequence || jobId !== this.data.jobId) return;
      if (active(result.status)) {
        const jobReceivedAt = this.data.jobReceivedAt || Date.now();
        const jobPhaseLabel = Object.prototype.hasOwnProperty.call(GENERATION_LABELS, result.phase) ? GENERATION_LABELS[result.phase] : '';
        this.setData({ jobStatus: result.status, jobReceivedAt, jobElapsed: elapsedSince(jobReceivedAt),
          jobPhaseLabel, remainingToday: result.remainingToday, pollPaused: false, error: '' });
        if (this.visible) this.pollTimer = setTimeout(() => this.poll(), 2500);
      }
      else {
        if (result.status === 'succeeded') this.setData({ loadingReply: true, pollPaused: false, error: '' });
        await this.restore(result.conversationId || this.data.conversationId);
        if (this.destroyed || seq !== this.sequence) return;
        this.setData({ remainingToday: result.remainingToday, pollPaused: false,
          error: result.status === 'failed' || result.status === 'cancelled' ? this.errorText(result.error) : '' });
        this.remember({ pending: null });
      }
      this.pollFailures = 0;
    } catch (error) {
      if (this.destroyed || seq !== this.sequence) return;
      this.pollFailures = (this.pollFailures || 0) + 1;
      this.setData({ pollPaused: true, error: this.data.loadingReply ? '回复已生成，暂时无法读取。点击下方按钮重新查询。' : '暂时无法查询进度，回复仍可能在后台生成。重试只查询结果。' });
      if (this.pollFailures < 3 && this.visible) this.pollTimer = setTimeout(() => this.poll(), 5000);
    } finally { this.polling = false; }
  },
  retry() { if (this.pendingRequest) return this.send(); if (this.data.jobId) return this.poll(); return this.initialize(); },
  back() { if (this.data.previewOpen) { this.closePreview(); return; } if (this.data.planOpen) { this.closePlan(); return; } wx.navigateBack(); },
  async newConversation() {
    if (this.data.submitting || this.applyRequest || active(this.data.jobStatus)) return;
    const confirmed = await this.confirm('重新开始对话？', '当前对话将被删除，已应用到旅行的内容会保留。');
    if (!confirmed) return;
    try { if (this.data.conversationId) await this.call('deleteAiConversation', { conversationId: this.data.conversationId }); this.sequence++; this.pendingRequest = null; this.chatScrollPosition = this.readerScrollPosition = this.previewScrollPosition = 0; this.setData({ messages: [], conversationId: '', jobId: '', jobStatus: '', input: '', error: '', requestPending: false, result: null, planOpen: false, planText: '', planName: '', planMessageId: '', previewOpen: false, chatHeaderProgress: 0, readerHeaderProgress: 0, previewHeaderProgress: 0, readerScrollTop: 0, previewScrollTop: 0 }); this.remember({ pending: null }); }
    catch (error) { this.setData({ error: this.errorText(error) }); }
  },
  confirm(title, content) { return new Promise(resolve => wx.showModal({ title, content, confirmText: '确认', success: result => resolve(result.confirm), fail: () => resolve(false) })); },
  openPlan(event) {
    const message = this.data.messages.find(row => row.id === event.currentTarget.dataset.id);
    if (!message?.draft) return;
    this.readerScrollPosition = 0;
    this.setData({ planOpen: true, planText: message.text || '', planBlocks: textBlocks(message.text), planName: message.draft.trip?.name || '行程与行囊准备', planMessageId: message.id, readerScrollTop: 0, readerHeaderProgress: 0 });
    wx.hideKeyboard?.();
  },
  closePlan() { this.setData({ planOpen: false }); },
  continueToPreview() { if (this.data.planMessageId) this.openPreview({ currentTarget: { dataset: { id: this.data.planMessageId } } }); },
  openPreview(event) {
    if (this.applyRequest) { this.setData({ previewOpen: true, previewScrollTop: this.previewScrollPosition || 0, previewHeaderProgress: headerProgress(this.previewScrollPosition) }); return; }
    const message = this.data.messages.find(row => row.id === event.currentTarget.dataset.id);
    if (!message?.draft) return;
    this.draft = message.draft; this.applyRequest = null;
    this.previewScrollPosition = 0;
    const rows = entryRows(this.draft); const trip = this.draft.trip || {};
    const current = this.data.currentTrip;
    this.baseRevision = this.draft.sourceTripId === current?.id ? this.draft.baseRevision : current?.revision;
    this.setData({ planOpen: false, previewOpen: true, previewScrollTop: 0, previewHeaderProgress: 0, rows, ...selectionSummary(rows), target: current && !current.archived ? 'current' : 'new', scope: '我的', newTrip: { name: trip.name || '', type: trip.type || '自驾游', start: trip.start || '', end: trip.end || '' }, newStartDate: (trip.start || '').slice(0, 10), newStartTime: (trip.start || '').slice(11, 16) || '08:00', newEndDate: (trip.end || '').slice(0, 10), newEndTime: (trip.end || '').slice(11, 16) || '18:00', tripTypeIndex: Math.max(0, tripTypes.indexOf(trip.type)), applyError: '', conflict: false, result: null });
    wx.hideKeyboard?.();
  },
  closePreview() { if (!this.data.applying) this.setData({ previewOpen: false, planOpen: !!this.data.planMessageId, readerScrollTop: this.readerScrollPosition || 0, readerHeaderProgress: headerProgress(this.readerScrollPosition) }); },
  resumeApplication(saved) {
    const message = this.data.messages.find(row => row.draft?.id === saved.payload?.draftId);
    if (!message) return;
    this.draft = message.draft; this.applyRequest = saved.payload; this.baseRevision = saved.payload.baseRevision;
    this.previewScrollPosition = 0;
    const rows = entryRows(message.draft).map(row => ({ ...row, ...(saved.payload.editedEntries || []).find(entry => entry.id === row.id), selected: saved.payload.selectedEntryIds.includes(row.id) && !row.applied }));
    const trip = saved.payload.newTrip || {};
    this.setData({ previewOpen: true, previewScrollTop: 0, previewHeaderProgress: 0, applicationPending: true, rows, ...selectionSummary(rows), target: saved.payload.target, scope: saved.payload.scope, newTrip: trip, newStartDate: (trip.start || '').slice(0, 10), newStartTime: (trip.start || '').slice(11, 16), newEndDate: (trip.end || '').slice(0, 10), newEndTime: (trip.end || '').slice(11, 16), applyError: '上次应用结果尚未确认。点击确认应用，可安全恢复同一笔结果。' });
  },
  toggleEntry(event) {
    if (this.data.applying || this.applyRequest) return;
    const rows = this.data.rows.map(row => row.id === event.currentTarget.dataset.id && !row.applied ? { ...row, selected: !row.selected } : row);
    this.setData({ rows, ...selectionSummary(rows), applyError: '' });
  },
  editEntry(event) { if (this.applyRequest || this.data.applying) return; const rows = this.data.rows.map(row => row.id === event.currentTarget.dataset.id ? { ...row, editing: !row.editing } : row); this.setData({ rows }); },
  bindEntry(event) {
    if (this.applyRequest || this.data.applying) return;
    const { id, field } = event.currentTarget.dataset;
    const allowed = ['title', 'date', 'startTime', 'endTime', 'address', 'startPlace', 'endPlace', 'note', 'category', 'modeIndex']; if (!allowed.includes(field)) return;
    const rows = this.data.rows.map(row => row.id === id ? { ...row, [field]: event.detail.value, ...(field === 'modeIndex' ? { transportMode: MODES[Number(event.detail.value)]?.id || 'other' } : {}) } : row);
    this.setData({ rows, applyError: '' });
  },
  setTarget(event) { if (this.applyRequest || this.data.applying) return; const target = event.currentTarget.dataset.target; if (target === 'current' && (!this.data.currentTrip || this.data.currentTrip.archived)) return; this.setData({ target, applyError: '' }); },
  setScope(event) { if (!this.applyRequest && !this.data.applying) this.setData({ scope: event.currentTarget.dataset.scope }); },
  bindTrip(event) {
    if (this.applyRequest || this.data.applying) return;
    const field = event.currentTarget.dataset.field, value = event.detail.value;
    if (field === 'name') this.setData({ 'newTrip.name': value });
    else if (field === 'type') this.setData({ 'newTrip.type': tripTypes[Number(value)], tripTypeIndex: Number(value) });
    else if (['newStartDate', 'newStartTime', 'newEndDate', 'newEndTime'].includes(field)) {
      this.setData({ [field]: value }); this.setData({ 'newTrip.start': `${this.data.newStartDate}T${this.data.newStartTime}`, 'newTrip.end': `${this.data.newEndDate}T${this.data.newEndTime}` });
    }
  },
  async reviewConflict() {
    if (this.data.applying || !this.data.currentTrip) return;
    try {
      const response = await this.call('getTrip', { tripId: this.data.currentTrip.id }); const trip = response.trip || response;
      if (trip.archived) { this.setData({ currentTrip: trip, applyError: '旅行已归档，请选择创建新旅行。', target: 'new', conflict: false }); return; }
      const confirmed = await this.confirm('复核当前旅行', `${trip.name}\n已有 ${(trip.events || []).length} 项行程、${(trip.items || []).length} 项清单。确认将所选方案追加到这个最新版本？`);
      if (confirmed) { this.baseRevision = trip.revision; this.applyRequest = null; this.setData({ currentTrip: trip, conflict: false, applyError: '' }); }
    } catch (error) { this.setData({ applyError: this.errorText(error) }); }
  },
  async apply() {
    if (this.data.applying || this.confirmingApply || this.data.conflict) return;
    const error = this.applyRequest ? '' : validatePreview(this.data.rows, this.data.target, this.data.newTrip); if (error) { this.setData({ applyError: error }); return; }
    if (!this.applyRequest) {
      this.confirmingApply = true;
      const confirmed = await this.confirm('确认应用方案', `${this.data.target === 'new' ? '创建新旅行' : '追加到“' + this.data.currentTrip.name + '”'}，添加 ${this.data.selectedEvents} 项行程、${this.data.selectedItems} 项${this.data.scope === '我的' ? '个人' : '团队'}清单。已有内容会保留。`);
      this.confirmingApply = false;
      if (!confirmed) return;
      this.applyRequest = { draftId: this.draft.id, target: this.data.target, selectedEntryIds: this.data.rows.filter(row => row.selected && !row.applied).map(row => row.id), scope: this.data.scope, clientMutationId: requestId('apply'), editedEntries: buildEdits(this.data.rows), ...(this.data.target === 'new' ? { newTrip: this.data.newTrip } : { tripId: this.data.currentTrip.id, baseRevision: this.baseRevision }) };
    }
    this.remember({ pendingApply: { payload: this.applyRequest } });
    this.setData({ applying: true, applicationPending: true, applyError: '' });
    try {
      const result = await this.call('applyAiDraft', this.applyRequest);
      const trip = result.trip.trip || result.trip;
      wx.setStorageSync('xiangye-current-trip', trip.id); wx.setStorageSync('xiangye-profile-trip', trip.id);
      this.getOpenerEventChannel?.()?.emit?.('aiApplied', { tripId: trip.id });
      this.applyRequest = null;
      this.remember({ pendingApply: null });
      if (this.destroyed) return;
      this.setData({ currentTrip: trip.id === this.conversationTripId() ? trip : this.data.currentTrip, applicationPending: false, previewOpen: false, result: { tripName: trip.name, count: result.appliedEntryIds?.length || 0, tripId: trip.id } });
      await this.restore(this.data.conversationId);
    } catch (error) {
      const conflict = error.code === 'AI_CONFLICT' || error.status === 409;
      if (error.code || (error.status >= 400 && error.status < 500)) { this.applyRequest = null; this.remember({ pendingApply: null }); }
      if (!this.destroyed) this.setData({ conflict, applicationPending: !!this.applyRequest, applyError: this.errorText(error) + (this.applyRequest ? ' 重试会确认同一笔应用结果，不会重复添加。' : '') });
    } finally { if (!this.destroyed) this.setData({ applying: false }); }
  },
  viewTrip() { wx.navigateBack(); },
});
