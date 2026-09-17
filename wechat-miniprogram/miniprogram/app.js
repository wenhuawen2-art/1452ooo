App({
  globalData: { envId: "zdata-d4g6l75lwebf2dbb0" },
  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({ title: "微信版本过低", content: "请升级微信后重新打开向野。", showCancel: false });
      return;
    }
    wx.cloud.init({ env: this.globalData.envId, traceUser: true });
  },
});
