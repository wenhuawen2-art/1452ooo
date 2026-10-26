// This page renders the shared form; the originating page owns validation and persistence.
const COMMANDS = ["bindInput","chooseProfileWechatAvatar","chooseAvatar","bindType","bindDate","bindTime","bindEventTransport","bindCategory","bindSwitch","openTemplateDetail","importTemplate","openTemplates","startLogin","bindOutfitItemType","bindOutfitItemName","chooseOutfitItemPhoto","removeOutfitItemPhoto","bindOutfitScene","removeOutfitItem","addOutfitItem","saveOutfitType","cancelOutfitTypeEdit","mutateOutfitType","editOutfitType","returnToOutfit","bindExpenseCategory","bindExpenseCurrency","bindExpensePayer","bindSplitMode","toggleExpenseMember","bindCustomShare","chooseExpenseReceipt","removeExpenseReceipt","bindSettingsCurrency","submitModal","closeModal"];
const definition = {
  data: { modal: null, busy: false, statusBarHeight: 24, headerHeight: 68, systemContentTop: 74, systemHeaderHeight: 130, fieldErrors: {}, saveError: "" },
  onLoad() {
    this.keyboardListener = event => this.setData({ keyboardHeight: event.height || 0 });
    wx.onKeyboardHeightChange?.(this.keyboardListener);
    this.channel = this.getOpenerEventChannel();
    this.channel.on("draft", data => {
      if (!data.modal) { if (this.saved) return; this.saved = true; wx.disableAlertBeforeUnload?.(); wx.navigateBack(); return; }
      this.setData(data);
      if (data.dirty && !this.alertEnabled) { wx.enableAlertBeforeUnload?.({ message: "修改尚未保存，确定离开吗？" }); this.alertEnabled = true; }
      if (!data.dirty && this.alertEnabled) { wx.disableAlertBeforeUnload?.(); this.alertEnabled = false; }
    });
    this.channel.emit("ready");
  },
  onUnload() { wx.offKeyboardHeightChange?.(this.keyboardListener); this.channel?.emit("closed"); },
  stopBubble() {},
};
for (const method of COMMANDS) definition[method] = function(event) { this.channel?.emit("command", { method, event: { currentTarget: { dataset: event?.currentTarget?.dataset || {} }, detail: event?.detail || {} } }); };
Page(definition);
