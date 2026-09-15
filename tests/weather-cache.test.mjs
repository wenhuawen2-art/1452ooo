import test from "node:test";
import assert from "node:assert/strict";
import { isWeatherCacheFresh, stampWeatherResult } from "../public/weather-cache.js";

const now = Date.parse("2026-09-15T00:00:00.000Z");

test("weather cache prevents immediate rerender loops for unavailable results", () => {
  for (const reason of ["missing_place", "place_not_found", "out_of_range"]) {
    const value = stampWeatherResult({ available: false, reason }, new Date(now));
    assert.equal(isWeatherCacheFresh(value, now + 299999), true, reason);
    assert.equal(isWeatherCacheFresh(value, now + 300000), false, reason);
  }
});

test("weather cache retries network failures without a render loop", () => {
  const value = stampWeatherResult({ available: false, reason: "error" }, new Date(now));
  assert.equal(isWeatherCacheFresh(value, now + 14999), true);
  assert.equal(isWeatherCacheFresh(value, now + 15000), false);
});

test("weather cache retains successful daily forecasts for one hour", () => {
  const value = stampWeatherResult({ available: true, high: 26 }, new Date(now));
  assert.equal(isWeatherCacheFresh(value, now + 3599999), true);
  assert.equal(isWeatherCacheFresh(value, now + 3600000), false);
});
