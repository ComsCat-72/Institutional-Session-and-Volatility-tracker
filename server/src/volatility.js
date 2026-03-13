/**
 * Volatility and institutional signal calculator.
 *
 * - Session-Relative Volatility (SRV): current candle range / average range of last N candles in the same session.
 * - Institutional Ignition: volume surge + strong directional candle body.
 *
 * Candles are assumed to be in the following shape:
 * {
 *   time: number (millis since epoch),
 *   open: number,
 *   high: number,
 *   low: number,
 *   close: number,
 *   volume: number
 * }
 */

export function candleRange(candle) {
  return Math.max(0, candle.high - candle.low);
}

export function candleBody(candle) {
  return Math.abs(candle.close - candle.open);
}

export function average(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function calculateSessionAverages(candles, lookback = 20) {
  const last = candles.slice(-lookback);
  const ranges = last.map(candleRange).filter((v) => v > 0);
  const volumes = last.map((c) => c.volume || 0);

  return {
    avgRange: average(ranges),
    avgVolume: average(volumes),
    candleCount: last.length,
  };
}

export function calculateSRV(currentCandle, sessionAverages) {
  const range = candleRange(currentCandle);
  if (!sessionAverages || !sessionAverages.avgRange) return 0;
  return range / sessionAverages.avgRange;
}

export function isInstitutionalIgnition(currentCandle, sessionAverages, opts = {}) {
  const volumeThreshold = (opts.volumeMultiplier ?? 1.5) * (sessionAverages.avgVolume || 0);
  const range = candleRange(currentCandle);
  const body = candleBody(currentCandle);
  const bodyRatio = range > 0 ? body / range : 0;

  return (
    currentCandle.volume >= volumeThreshold &&
    bodyRatio >= (opts.bodyRatioThreshold ?? 0.7) &&
    range > 0
  );
}

/**
 * Calculates a session ADS (average daily session range) for the last N days.
 *
 * @param {Array} candles - list of candles spanning multiple days. Candles must include `time` in ms UTC.
 * @param {Function} sessionFilter - function that returns true for candles inside the desired session window.
 * @param {number} lookbackDays - number of days to average. Defaults to 5.
 *
 * @returns {object} { avgDailyRange, dailyRanges }
 */
export function calculateSessionADR(candles, sessionFilter, lookbackDays = 5) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return { avgDailyRange: 0, dailyRanges: [] };
  }

  // Group candles by UTC date.
  const dailyBuckets = new Map();

  for (const candle of candles) {
    if (!sessionFilter(candle)) continue;
    const date = new Date(candle.time);
    const dayKey = date.toISOString().slice(0, 10); // YYYY-MM-DD
    const bucket = dailyBuckets.get(dayKey) || [];
    bucket.push(candle);
    dailyBuckets.set(dayKey, bucket);
  }

  const dailyRanges = [];

  for (const [dayKey, dayCandles] of dailyBuckets.entries()) {
    const high = Math.max(...dayCandles.map((c) => c.high));
    const low = Math.min(...dayCandles.map((c) => c.low));
    dailyRanges.push({ day: dayKey, range: high - low, candleCount: dayCandles.length });
  }

  // Take most recent lookbackDays by date string.
  dailyRanges.sort((a, b) => (a.day < b.day ? 1 : -1));
  const recent = dailyRanges.slice(0, lookbackDays);

  return {
    avgDailyRange: average(recent.map((d) => d.range)),
    dailyRanges: recent,
  };
}
