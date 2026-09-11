import { randomBytes } from "node:crypto";
export const id = () => randomBytes(24).toString("hex");
export const day = (s) => String(s).slice(0, 10);
export const dateNumber = (s) => Date.parse(day(s) + "T00:00:00Z");
export const daysBetween = (a, b) =>
  Math.round((dateNumber(b) - dateNumber(a)) / 86400000);
export const staying = (h, d) => h.checkin <= d && d < h.checkout;
export function stage(t, now) {
  const n = daysBetween(now, t.start);
  return n > 7
    ? "准备旅行"
    : n > 3
      ? "出发前 7 天"
      : n > 1
        ? "出发前 3 天"
        : n === 1
          ? "明天出发 · 关键项复核"
          : n === 0
            ? "今天出发 · 检查复核"
            : day(now) <= day(t.end)
              ? "旅途中"
              : "旅程已结束";
}
export function defaults(owner) {
  return [
    ["公共", "携带物品", "车载应急工具", true],
    ["公共", "携带物品", "饮用水与纸巾", false],
    ["公共", "准备事项", "检查轮胎、胎压和油量", true],
    ["公共", "准备事项", "下载离线地图", false],
    ["公共", "准备事项", "检查门窗与水电", true],
    ["我的", "携带物品", "身份证", true],
    ["我的", "携带物品", "驾驶证（驾驶人）", true],
    ["我的", "携带物品", "常用药品", true],
    ["我的", "携带物品", "手机、充电线与充电宝", false],
    ["我的", "携带物品", "换洗衣物与洗漱用品", false],
  ].map(([scope, category, title, key]) => ({
    id: id(),
    owner: scope === "我的" ? owner : null,
    category,
    title,
    key,
    done: false,
    reviewed: false,
  }));
}
