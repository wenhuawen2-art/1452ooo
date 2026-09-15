const tripTypes = [
  "自驾游",
  "旅游",
  "露营",
  "房车旅行",
  "徒步",
  "骑行",
  "亲子游",
  "摄影旅行",
  "商务出行",
  "探亲",
  "其他",
];

const isTripType = (value) => tripTypes.includes(value);
const normalizeTripType = (value, fallback = "自驾游") => isTripType(value) ? value : fallback;

module.exports = { tripTypes, isTripType, normalizeTripType };
