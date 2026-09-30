const test = require("node:test");
const assert = require("node:assert/strict");
const { extractRoutePlan, normalizeRouteConfig, routeInputSignature, validCoordinatePair, matchAdministrativePlace, hotelForRouteDate, hotelRouteCandidates } = require("../shared/route-overview.cjs");

const trip = {
  type: "自驾游",
  events: [
    { id: "b", date: "2026-10-02", startTime: "09:00", title: "返程", startPlace: "景区", endPlace: "成都", transportMode: "driving" },
    { id: "a", date: "2026-10-01", startTime: "08:00", title: "出发", startPlace: "成都", endPlace: "景区", address: "四姑娘山景区", transportMode: "driving" },
  ],
};

test("route overview extracts chronological points, deduplicates joins and detects return", () => {
  const result = extractRoutePlan(trip);
  assert.deepEqual(result.visiblePoints.map((point) => point.label), ["成都", "景区", "成都"]);
  assert.deepEqual(result.visiblePoints.map((point) => point.role), ["start", "stop", "return"]);
  assert.equal(result.segments.length, 2);
  assert.ok(result.segments.every((segment) => segment.transportMode === "driving"));
});

test("route overview applies shared ordering, exclusions, POI corrections and mixed modes", () => {
  const config = normalizeRouteConfig({
    points: [{ id: "a:end", label: "双桥沟", address: "双桥沟景区", latitude: 31.1, longitude: 102.9 }, { id: "b:end", excluded: true }],
    order: ["a:start", "a:end", "b:end"],
    segmentModes: { "a:start__a:end": "rail" },
  }, trip);
  trip.routeConfig = config;
  const result = extractRoutePlan(trip);
  assert.deepEqual(result.visiblePoints.map((point) => point.label), ["成都", "双桥沟"]);
  assert.equal(result.visiblePoints[1].latitude, 31.1);
  assert.equal(result.segments[0].transportMode, "rail");
});

test("fuzzy places match the most specific real administrative division", () => {
  const components = { province: "四川省", city: "阿坝藏族羌族自治州", district: "九寨沟县" };
  assert.deepEqual(matchAdministrativePlace("九寨沟", components), { name: "九寨沟县", level: "district" });
  assert.deepEqual(matchAdministrativePlace("九寨沟县", components), { name: "九寨沟县", level: "district" });
  assert.equal(matchAdministrativePlace("九寨沟风景名胜区", components), null);
  assert.deepEqual(matchAdministrativePlace("阿坝藏族羌族自治州", components), { name: "阿坝藏族羌族自治州", level: "city" });
});

test("same-day lodging is selected before checkout and produces ordered geocoding candidates", () => {
  const lodgingTrip = { hotels: [{ id: "h1", name: "广元国际酒店", city: "广元市", address: "广元市利州区东坝街道1号", checkin: "2026-10-01", checkout: "2026-10-03" }] };
  const hotel = hotelForRouteDate(lodgingTrip, "2026-10-02");
  assert.equal(hotel.id, "h1");
  assert.equal(hotelForRouteDate(lodgingTrip, "2026-10-03"), null);
  assert.deepEqual(hotelRouteCandidates(hotel), ["广元市利州区东坝街道1号", "广元市广元国际酒店", "广元国际酒店", "广元市"]);
});

test("route cache signature changes when relevant lodging data changes", () => {
  const lodgingTrip = { ...trip, routeConfig: null, hotels: [{ id: "h1", name: "酒店甲", city: "广元市", address: "地址甲", checkin: "2026-10-01", checkout: "2026-10-02" }] };
  const before = routeInputSignature(lodgingTrip);
  lodgingTrip.hotels[0].address = "地址乙";
  assert.notEqual(routeInputSignature(lodgingTrip), before);
});

test("empty and zero coordinates never become manual map points", () => {
  assert.equal(validCoordinatePair(null, null), false);
  assert.equal(validCoordinatePair("", ""), false);
  assert.equal(validCoordinatePair(0, 0), false);
  assert.equal(validCoordinatePair(34.3416, 108.9398), true);
  const config = normalizeRouteConfig({ points: [{ id: "a:start", label: "西安", address: "西安", latitude: null, longitude: null }] }, trip);
  assert.equal(config.points[0].latitude, undefined);
  assert.equal(config.points[0].longitude, undefined);
});

test("location-like itinerary titles are included while generic activities stay out of the route", () => {
  const result = extractRoutePlan({ type: "自驾游", events: [
    { id: "a", date: "2026-10-01", startTime: "09:00", title: "狮子沟牧场游玩" },
    { id: "b", date: "2026-10-01", startTime: "12:00", title: "吃饭" },
    { id: "c", date: "2026-10-01", startTime: "14:00", title: "南站记忆历史文化街区" },
  ] });
  assert.deepEqual(result.visiblePoints.map((point) => point.label), ["狮子沟牧场游玩", "南站记忆历史文化街区"]);
});

test("new title-derived places keep chronological position beside an existing saved order", () => {
  const result = extractRoutePlan({ type: "自驾游", events: [
    { id: "a", date: "2026-10-01", startTime: "08:00", title: "开车", startPlace: "西安", endPlace: "汉中" },
    { id: "b", date: "2026-10-01", startTime: "10:00", title: "狮子沟牧场游玩" },
    { id: "c", date: "2026-10-01", startTime: "16:00", title: "开车", startPlace: "汉中", endPlace: "广元" },
  ], routeConfig: { order: ["a:start", "a:end", "c:end"] } });
  assert.deepEqual(result.visiblePoints.map((point) => point.label), ["西安", "汉中", "狮子沟牧场游玩", "汉中", "广元"]);
});
