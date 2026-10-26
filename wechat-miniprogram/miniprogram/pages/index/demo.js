const pad = (value) => String(value).padStart(2, "0");
const localDay = (offset = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

function createDemoExperience() {
  const start = localDay(0), second = localDay(1), end = localDay(3);
  const trip = {
    id: "demo-trip", revision: 1, name: "川西秋日自驾", type: "自驾游", start: `${start}T08:00`, end: `${end}T18:00`, archived: false,
    creator: "demo-owner", me: "demo-owner", invite: "",
    members: [
      { id: "demo-owner", name: "向野体验官", avatarId: "avatar-01" },
      { id: "demo-friend", name: "同行伙伴", avatarId: "avatar-06" },
    ],
    events: [
      { id: "demo-event-1", date: start, period: "上午", startTime: "09:00", endTime: "12:00", title: "驶向四姑娘山", startPlace: "成都", endPlace: "四姑娘山", address: "四姑娘山风景名胜区", transportMode: "driving", note: "途中预留观景和休息时间" },
      { id: "demo-event-2", date: start, period: "下午", startTime: "14:00", endTime: "17:00", title: "双桥沟轻徒步", address: "双桥沟景区", transportMode: "walking", note: "带上外套和饮用水" },
      { id: "demo-event-3", date: second, period: "上午", startTime: "10:00", endTime: "12:00", title: "高原观景", address: "猫鼻梁观景台", transportMode: "driving", note: "根据天气调整停留时间" },
    ],
    hotels: [{ id: "demo-hotel", name: "山野民宿", city: "小金县", address: "四姑娘山镇", checkin: start, checkout: end, phone: "", note: "含早餐，可免费停车" }],
    tickets: [],
    outfits: [
      { id: "demo-outfit-1", ownerMemberId: "demo-owner", date: start, title: "高原出发穿搭", scene: "日常出行", items: [["上装", "速干长袖"], ["下装", "轻量长裤"], ["外套", "防风外套"], ["鞋履", "缓震运动鞋"], ["配饰", "遮阳帽、墨镜"]].map(([typeName, name], sortOrder) => ({ id: `demo-1-${sortOrder}`, typeName, name, sortOrder, photoUrl: "/assets/mastergo-list/outfit/demo-look.jpg" })), note: "早晚温差大，外套放在随手可取的位置", sortOrder: 0, createdAt: 1 },
      { id: "demo-outfit-2", ownerMemberId: "demo-owner", date: start, title: "双桥沟轻徒步", scene: "户外徒步", items: [["内搭", "排汗内搭"], ["下装", "徒步裤"], ["外套", "冲锋衣"], ["鞋履", "防滑徒步鞋"], ["袜子", "吸湿排汗袜"]].map(([typeName, name], sortOrder) => ({ id: `demo-2-${sortOrder}`, typeName, name, sortOrder })), note: "准备一双备用袜子", sortOrder: 1, createdAt: 2 },
      { id: "demo-outfit-3", ownerMemberId: "demo-owner", date: second, title: "观景拍照穿搭", scene: "拍照打卡", items: [["内搭", "米色针织衫"], ["下装", "深色牛仔裤"], ["外套", "焦糖色夹克"], ["鞋履", "短靴"], ["配饰", "围巾"]].map(([typeName, name], sortOrder) => ({ id: `demo-3-${sortOrder}`, typeName, name, sortOrder })), note: "颜色与秋日山景协调", sortOrder: 0, createdAt: 3 },
    ],
    categories: [
      { id: "demo-cat-1", name: "携带物品", owner: null },
      { id: "demo-cat-2", name: "准备事项", owner: null },
      { id: "demo-cat-3", name: "我的物品", owner: "demo-owner" },
    ],
    items: [
      { id: "demo-item-1", categoryId: "demo-cat-1", title: "车载应急工具", key: true, done: true, owner: null, byMemberId: "demo-owner", by: "向野体验官" },
      { id: "demo-item-2", categoryId: "demo-cat-1", title: "饮用水与纸巾", key: false, done: true, owner: null, byMemberId: "demo-friend", by: "同行伙伴" },
      { id: "demo-item-3", categoryId: "demo-cat-2", title: "检查轮胎与油量", key: true, done: false, owner: null },
      { id: "demo-item-4", categoryId: "demo-cat-2", title: "下载离线地图", key: false, done: true, owner: null, byMemberId: "demo-owner", by: "向野体验官" },
      { id: "demo-item-5", categoryId: "demo-cat-3", title: "保暖外套", key: true, done: false, owner: "demo-owner" },
      { id: "demo-item-6", categoryId: "demo-cat-3", title: "充电宝", key: false, done: true, owner: "demo-owner", byMemberId: "demo-owner", by: "向野体验官" },
    ],
  };
  return {
    account: { id: "guest", nickname: "游客", avatarId: "avatar-01", avatarData: "", profileComplete: false },
    trip,
    weather: { available: true, location: "四姑娘山", condition: "晴间多云", code: 1, high: 18, low: 7, current: 14, humidity: 48, uvIndex: 3.6, uvLevel: "中等", source: "体验数据", geoSource: "演示地点" },
    routeOverview: {
      configured: true, available: true, distanceMeters: 226000, durationMinutes: 270, unresolved: [],
      transportModes: [{ id: "driving", label: "自驾" }, { id: "walking", label: "步行" }],
      points: [
        { id: "demo-start", label: "成都", address: "成都市", latitude: 30.5728, longitude: 104.0668, role: "start", number: 1, date: start, title: "出发", resolutionSource: "administrative", resolutionSourceLabel: "行政区定位" },
        { id: "demo-stop", label: "四姑娘山", address: "四姑娘山风景名胜区", latitude: 31.104, longitude: 102.899, role: "stop", number: 2, date: start, title: "驶向四姑娘山", resolutionSource: "precise", resolutionSourceLabel: "具体地点" },
        { id: "demo-end", label: "双桥沟", address: "双桥沟景区", latitude: 31.118, longitude: 102.846, role: "end", number: 3, date: second, title: "轻徒步" },
      ],
      allPoints: [],
      segments: [
        { id: "demo-1", fromId: "demo-start", toId: "demo-stop", transportMode: "driving", label: "自驾", icon: "🚗", color: "#4f8ee8", width: 6, dottedLine: false, points: [{ latitude: 30.5728, longitude: 104.0668 }, { latitude: 30.81, longitude: 103.55 }, { latitude: 31.104, longitude: 102.899 }] },
        { id: "demo-2", fromId: "demo-stop", toId: "demo-end", transportMode: "walking", label: "步行", icon: "🚶", color: "#e69a35", width: 6, dottedLine: true, points: [{ latitude: 31.104, longitude: 102.899 }, { latitude: 31.118, longitude: 102.846 }] },
      ],
      includePoints: [{ latitude: 30.5728, longitude: 104.0668 }, { latitude: 31.104, longitude: 102.899 }, { latitude: 31.118, longitude: 102.846 }],
    },
    expenses: [
      { id: "demo-expense-1", date: start, title: "午餐", category: "餐饮", currency: "CNY", amountMinor: 16800, baseAmountMinor: 16800, exchangeRateToBase: 1, payerMemberId: "demo-owner", splitMode: "equal", participants: [{ memberId: "demo-owner", amountMinor: 8400 }, { memberId: "demo-friend", amountMinor: 8400 }], note: "两人简餐" },
      { id: "demo-expense-2", date: start, title: "住宿订金", category: "住宿", currency: "CNY", amountMinor: 42000, baseAmountMinor: 42000, exchangeRateToBase: 1, payerMemberId: "demo-friend", splitMode: "equal", participants: [{ memberId: "demo-owner", amountMinor: 21000 }, { memberId: "demo-friend", amountMinor: 21000 }], note: "山野民宿" },
      { id: "demo-expense-3", date: second, title: "景区门票", category: "景点活动", currency: "CNY", amountMinor: 30000, baseAmountMinor: 30000, exchangeRateToBase: 1, payerMemberId: "demo-owner", splitMode: "equal", participants: [{ memberId: "demo-owner", amountMinor: 15000 }, { memberId: "demo-friend", amountMinor: 15000 }], note: "双人票" },
    ],
  };
}

module.exports = { createDemoExperience };
