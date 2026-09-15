export const stampWeatherResult = (weather, now = new Date()) => ({
  ...weather,
  updatedAt: weather?.updatedAt || now.toISOString(),
});

export const weatherCacheTtl = (weather) =>
  weather?.available ? 3600000 : weather?.reason === "error" ? 15000 : 300000;

export const isWeatherCacheFresh = (weather, now = Date.now()) => {
  if (!weather) return false;
  const updatedAt = Date.parse(weather.updatedAt || "");
  return Number.isFinite(updatedAt) && now >= updatedAt && now - updatedAt < weatherCacheTtl(weather);
};
