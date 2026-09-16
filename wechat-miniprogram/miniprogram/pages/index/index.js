const webUrl = "https://zdata-d4g6l75lwebf2dbb0-1485288642.tcloudbaseapp.com/?from=wechat-miniprogram";

Page({
  data: { webUrl },
  onShareAppMessage() {
    return {
      title: "向野 · 自驾旅行助手",
      path: "/pages/index/index"
    };
  }
});
