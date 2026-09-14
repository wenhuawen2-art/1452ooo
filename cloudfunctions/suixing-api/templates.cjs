const checklistTemplates = [
  {
    id: "travel-medicine",
    name: "常用药品与急救",
    recommendedScope: "我的",
    symbol: "药",
    description: "按个人健康情况增减；处方药和用药信息建议本人保管。",
    items: [
      { title: "个人处方药与备用量", key: true },
      { title: "用药清单、处方与过敏信息", key: true },
      { title: "创可贴、无菌纱布与医用胶带" },
      { title: "消毒湿巾或消毒用品" },
      { title: "退热止痛药" },
      { title: "抗过敏药" },
      { title: "晕车药" },
      { title: "肠胃药与口服补液盐" },
    ],
  },
  {
    id: "travel-documents",
    name: "证件与资料",
    recommendedScope: "我的",
    symbol: "证",
    description: "集中核对本人证件、车辆资料和已确认的订单信息。",
    items: [
      { title: "身份证", key: true },
      { title: "驾驶证（驾驶人）", key: true },
      { title: "机动车行驶证", key: true },
      { title: "车辆保险或电子保单" },
      { title: "酒店与票务订单" },
      { title: "紧急联系人与重要电话" },
    ],
  },
  {
    id: "vehicle-check",
    name: "车辆出发检查",
    recommendedScope: "公共",
    symbol: "车",
    description: "出发前集中检查影响行车安全和续航的关键项目。",
    items: [
      { title: "轮胎胎压、磨损与备胎", key: true },
      { title: "机油、冷却液、制动液与玻璃水", key: true },
      { title: "蓄电池与充电系统" },
      { title: "前灯、刹车灯、转向灯与双闪", key: true },
      { title: "雨刷与挡风玻璃" },
      { title: "制动系统与异常声响" },
      { title: "油量或剩余电量与补能计划" },
    ],
  },
  {
    id: "home-safety",
    name: "离家安全检查",
    recommendedScope: "公共",
    symbol: "家",
    description: "离家前逐项确认燃气、电源、门窗和生活安排。",
    items: [
      { title: "关闭燃气阀门", key: true },
      { title: "关闭不必要的电器与电源", key: true },
      { title: "关好门窗并锁门", key: true },
      { title: "清理厨房、阳台和楼道可燃杂物" },
      { title: "倒垃圾并处理易腐食物" },
      { title: "安排宠物、绿植与备用钥匙" },
      { title: "暂停或委托代收快递" },
    ],
  },
  {
    id: "road-emergency",
    name: "车载应急物资",
    recommendedScope: "公共",
    symbol: "援",
    description: "覆盖途中故障、夜间停车和临时滞留时常用的基础物资。",
    items: [
      { title: "手机、车充与充电宝", key: true },
      { title: "急救包", key: true },
      { title: "反光背心与三角警告牌", key: true },
      { title: "手电筒与备用电池" },
      { title: "搭电线或应急启动电源" },
      { title: "千斤顶、备胎与补胎工具" },
      { title: "饮用水与耐储存食物" },
      { title: "纸质或离线地图与紧急电话" },
    ],
  },
];

const getChecklistTemplate = (templateId) =>
  checklistTemplates.find((template) => template.id === templateId);

module.exports = { checklistTemplates, getChecklistTemplate };
