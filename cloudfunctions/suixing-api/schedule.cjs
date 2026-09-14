const schedulePeriods = [
  { id: "morning", name: "上午", start: 0, end: 13 * 60, range: "08:00—13:00" },
  { id: "afternoon", name: "下午", start: 13 * 60, end: 18 * 60, range: "13:00—18:00" },
  { id: "evening", name: "晚上", start: 18 * 60, end: 24 * 60, range: "18:00—23:00" },
];

const timeToMinutes = (value) => {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
};

const minutesToTime = (value) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

const periodForStart = (value) => {
  const minutes = timeToMinutes(value);
  if (minutes === null) return "上午";
  if (minutes < 13 * 60) return "上午";
  if (minutes < 18 * 60) return "下午";
  return "晚上";
};

function splitEventByPeriods(event) {
  const startValue = event.startTime || event.time || "";
  const endValue = event.endTime || "";
  const start = timeToMinutes(startValue);
  const end = timeToMinutes(endValue);
  if (start === null || end === null || end <= start) {
    const periodName = periodForStart(startValue);
    const period = schedulePeriods.find((entry) => entry.name === periodName);
    return [{
      ...event,
      periodId: period.id,
      periodName: period.name,
      segmentStart: startValue || "待补充",
      segmentEnd: endValue || "待补充",
      continuedFromPrevious: false,
      continuesToNext: false,
    }];
  }
  return schedulePeriods
    .filter((period) => start < period.end && end > period.start)
    .map((period) => ({
      ...event,
      periodId: period.id,
      periodName: period.name,
      segmentStart: minutesToTime(Math.max(start, period.start)),
      segmentEnd: minutesToTime(Math.min(end, period.end)),
      continuedFromPrevious: start < period.start,
      continuesToNext: end > period.end,
    }));
}

module.exports = { schedulePeriods, timeToMinutes, periodForStart, splitEventByPeriods };
