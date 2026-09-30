const TRANSPORT_MODES = [
  { id: "driving", label: "自驾", icon: "🚗", route: "driving", color: "#4f8ee8" },
  { id: "rail", label: "高铁/火车", icon: "🚄", route: "direct", color: "#8b6fd6" },
  { id: "flight", label: "飞机", icon: "✈", route: "direct", color: "#5a78ba" },
  { id: "transit", label: "公交/地铁", icon: "🚌", route: "transit", color: "#26a69a" },
  { id: "walking", label: "步行", icon: "🚶", route: "walking", color: "#e69a35" },
  { id: "bicycling", label: "骑行", icon: "🚲", route: "bicycling", color: "#42a86b" },
  { id: "ferry", label: "轮渡", icon: "⛴", route: "direct", color: "#3f9db5" },
  { id: "other", label: "其他", icon: "•", route: "direct", color: "#8390a4" },
];

const MODE_IDS = new Set(TRANSPORT_MODES.map((entry) => entry.id));
const clean = (value, limit = 160) => String(value || "").trim().slice(0, limit);
const keyText = (value) => clean(value).toLowerCase().replace(/[\s·,，。;；、_-]+/g, "");
const adminBase = (value) => String(value || "").replace(/(?:特别行政区|自治州|自治县|自治旗|地区|新区|省|市|区|县|旗|州|盟)$/u, "");
const validCoordinatePair = (latitude, longitude) => latitude !== null && latitude !== undefined && latitude !== "" && longitude !== null && longitude !== undefined && longitude !== "" && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180 && !(Number(latitude) === 0 && Number(longitude) === 0);
const genericEventTitle = (value) => /^(?:开车|出发|返程|归程|回程|吃饭|早餐|早饭|午饭|晚饭|用餐|起床|休息|自由活动|提前带好简餐)$/u.test(clean(value).replace(/[（(].*$/, "").trim());
const titlePlaceAddress = (value) => clean(value).replace(/(?:全天)?(?:游玩|参观|打卡|游览)$/u, "").trim();

function matchAdministrativePlace(place, addressComponents = {}) {
  const query = keyText(place);
  for (const [level, value] of [["district", addressComponents.district], ["city", addressComponents.city], ["province", addressComponents.province]]) {
    const name = clean(value);
    if (name && (query === keyText(name) || query === keyText(adminBase(name)))) return { name, level };
  }
  return null;
}

function defaultTransportMode(tripType) {
  if (/自驾|房车|摩托/.test(String(tripType || ""))) return "driving";
  return "other";
}

function normalizeTransportMode(value, tripType) {
  return MODE_IDS.has(value) ? value : defaultTransportMode(tripType);
}

function hotelForRouteDate(trip, date) {
  return (trip.hotels || []).find((hotel) => hotel.checkin <= date && date < hotel.checkout) || null;
}

function hotelRouteCandidates(hotel) {
  if (!hotel) return [];
  const name = clean(hotel.name);
  const city = clean(hotel.city);
  const address = clean(hotel.address, 300);
  return [address, city && name ? `${city}${name}` : "", name, city].filter((value, index, list) => value && list.indexOf(value) === index);
}

function automaticRoutePoints(trip) {
  const events = [...(trip.events || [])].sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || "")) ||
    String(a.startTime || a.time || "").localeCompare(String(b.startTime || b.time || "")) ||
    String(a.id || "").localeCompare(String(b.id || "")));
  const points = [];
  for (const event of events) {
    const mode = normalizeTransportMode(event.transportMode, trip.type);
    const startPlace = clean(event.startPlace);
    const endPlace = clean(event.endPlace);
    const address = clean(event.address, 300);
    const titlePlace = !startPlace && !endPlace && !address && !genericEventTitle(event.title) ? clean(event.title) : "";
    if (startPlace) points.push({
      id: `${event.id}:start`, sourceEventId: event.id, sourceRole: "start", label: startPlace,
      address: startPlace, originalLabel: startPlace, originalAddress: startPlace,
      date: event.date, title: event.title, transportMode: mode,
    });
    if (endPlace || address) points.push({
      id: `${event.id}:end`, sourceEventId: event.id, sourceRole: "end", label: endPlace || address,
      address: address || endPlace, originalLabel: endPlace || address, originalAddress: address || endPlace,
      date: event.date, title: event.title, transportMode: mode,
    });
    if (titlePlace) points.push({
      id: `${event.id}:title`, sourceEventId: event.id, sourceRole: "title", label: titlePlace,
      address: titlePlaceAddress(titlePlace) || titlePlace, originalLabel: titlePlace, originalAddress: titlePlace,
      date: event.date, title: event.title, transportMode: mode,
    });
  }
  return points.filter((point, index, list) => {
    if (!index) return true;
    const previous = list[index - 1];
    const sameLabel = keyText(point.label) && keyText(point.label) === keyText(previous.label);
    const sameAddress = keyText(point.address) && keyText(point.address) === keyText(previous.address);
    return !sameLabel && !sameAddress;
  });
}

function extractRoutePlan(trip) {
  const automatic = automaticRoutePoints(trip);
  const config = trip.routeConfig || {};
  const overrides = new Map((config.points || []).map((point) => [String(point.id), point]));
  let points = automatic.map((point) => {
    const override = overrides.get(point.id);
    if (!override) return { ...point, excluded: false };
    return {
      ...point,
      label: clean(override.label) || point.label,
      address: clean(override.address, 300) || point.address,
      latitude: validCoordinatePair(override.latitude, override.longitude) ? Number(override.latitude) : undefined,
      longitude: validCoordinatePair(override.latitude, override.longitude) ? Number(override.longitude) : undefined,
      poiId: clean(override.poiId, 100),
      excluded: override.excluded === true,
    };
  });
  const order = Array.isArray(config.order) ? config.order.map(String) : [];
  if (order.length) {
    const automaticIds = points.map((point) => point.id);
    const mergedOrder = order.filter((pointId, index, list) => automaticIds.includes(pointId) && list.indexOf(pointId) === index);
    automaticIds.forEach((pointId, automaticIndex) => {
      if (mergedOrder.includes(pointId)) return;
      const nextKnown = automaticIds.slice(automaticIndex + 1).find((candidate) => mergedOrder.includes(candidate));
      if (nextKnown) mergedOrder.splice(mergedOrder.indexOf(nextKnown), 0, pointId);
      else mergedOrder.push(pointId);
    });
    const positions = new Map(mergedOrder.map((pointId, index) => [pointId, index]));
    points.sort((a, b) => (positions.get(a.id) ?? 100000) - (positions.get(b.id) ?? 100000));
  }
  points = points.map((point, index) => ({ ...point, order: index }));
  const visible = points.filter((point) => !point.excluded);
  const firstKey = visible[0] ? keyText(visible[0].address || visible[0].label) : "";
  const lastKey = visible.length > 1 ? keyText(visible.at(-1).address || visible.at(-1).label) : "";
  visible.forEach((point, index) => {
    point.role = index === 0 ? "start" : index === visible.length - 1 ? (firstKey && firstKey === lastKey ? "return" : "end") : "stop";
    point.number = index + 1;
  });
  const configuredModes = config.segmentModes || {};
  const segments = visible.slice(1).map((to, index) => {
    const from = visible[index];
    const id = `${from.id}__${to.id}`;
    return { id, fromId: from.id, toId: to.id, transportMode: normalizeTransportMode(configuredModes[id] || to.transportMode, trip.type) };
  });
  return { points, visiblePoints: visible, segments };
}

function routeInputSignature(trip) {
  const plan = extractRoutePlan(trip);
  return JSON.stringify({
    points: plan.points.map(({ id, label, address, latitude, longitude, excluded, order }) => ({ id, label, address, latitude, longitude, excluded, order })),
    segments: plan.segments.map(({ id, transportMode }) => ({ id, transportMode })),
    hotels: (trip.hotels || []).map(({ id, name, city, address, checkin, checkout }) => ({ id, name, city, address, checkin, checkout })),
  });
}

function normalizeRouteConfig(input, trip) {
  const automaticIds = new Set(automaticRoutePoints(trip).map((point) => point.id));
  const points = (Array.isArray(input.points) ? input.points : []).filter((point) => automaticIds.has(String(point.id))).map((point) => ({
    id: String(point.id), label: clean(point.label), address: clean(point.address, 300),
    poiId: clean(point.poiId, 100), excluded: point.excluded === true,
    latitude: validCoordinatePair(point.latitude, point.longitude) ? Number(point.latitude) : undefined,
    longitude: validCoordinatePair(point.latitude, point.longitude) ? Number(point.longitude) : undefined,
  }));
  const order = (Array.isArray(input.order) ? input.order : []).map(String).filter((id, index, list) => automaticIds.has(id) && list.indexOf(id) === index);
  const segmentModes = {};
  for (const [segmentId, mode] of Object.entries(input.segmentModes || {})) if (MODE_IDS.has(mode)) segmentModes[String(segmentId)] = mode;
  return { points, order, segmentModes, updatedAt: Date.now() };
}

module.exports = { TRANSPORT_MODES, defaultTransportMode, normalizeTransportMode, validCoordinatePair, matchAdministrativePlace, hotelForRouteDate, hotelRouteCandidates, automaticRoutePoints, extractRoutePlan, routeInputSignature, normalizeRouteConfig };
