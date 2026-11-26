// Derive the same brief shower for everyone in a two-hour window, including after reload.
function scheduledPrecipitation(now) {
  const minute = 60000;
  const windowLength = 120 * minute;
  const windowId = Math.floor(now / windowLength);
  function roll(salt) {
    let value = Math.imul(windowId ^ salt, 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
  }
  if (roll(1) >= 0.75) return null;
  const start = (10 + Math.floor(roll(2) * 76)) * minute;
  const duration = (10 + Math.floor(roll(3) * 16)) * minute;
  const elapsed = now - windowId * windowLength;
  if (elapsed < start || elapsed >= start + duration) return null;
  const month = new Date(windowId * windowLength + 9 * 60 * minute).getUTCMonth() + 1;
  const snowChance = month >= 11 || month <= 3 ? 0.55 : 0.05;
  return roll(4) < snowChance ? 'snow' : 'rain';
}

function localPrecipitation(now = Date.now()) {
  if (weatherLive.preview !== 'auto' || ['rain','snow'].includes(weatherLive.kind)) return null;
  return scheduledPrecipitation(now);
}

function localWeatherLabel(local) {
  return local === 'rain' ? '애시라인 · 국지성 비' : local === 'snow' ? '애시라인 · 국지성 눈' : '';
}
