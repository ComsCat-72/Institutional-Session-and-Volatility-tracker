/**
 * Core processing pipeline for incoming candle streams.
 *
 * Responsible for:
 * - mapping candles into session buckets
 * - calculating session relative volatility (SRV)
 * - emitting structured payloads for socket clients
 */

import { determineSession, SESSION_IDS, SESSIONS } from "./sessionLogic.js";
import { calculateSessionAverages, calculateSRV, isInstitutionalIgnition, calculateSessionADR } from "./volatility.js";

export class SessionProcessor {
  constructor({ lookbackCandles = 20, adrLookbackDays = 5 } = {}) {
    this.lookbackCandles = lookbackCandles;
    this.adrLookbackDays = adrLookbackDays;

    /**
     * Per-pair, per-session candle history.
     * {
     *   [pair]: {
     *     [sessionId]: Array<candle>
     *   }
     * }
     */
    this.history = new Map();
  }

  _ensurePair(pair) {
    if (!this.history.has(pair)) {
      this.history.set(pair, {
        [SESSION_IDS.LONDON]: [],
        [SESSION_IDS.NEW_YORK]: [],
        [SESSION_IDS.OVERLAP]: [],
        [SESSION_IDS.QUIET]: [],
      });
    }
    return this.history.get(pair);
  }

  _trimHistory(arr) {
    if (arr.length > this.lookbackCandles * 3) {
      // keep a bit more history in case sessions flip quickly
      arr.splice(0, arr.length - this.lookbackCandles * 3);
    }
  }

  getSessionStart(timestamp, sessionId) {
    const date = new Date(timestamp);
    if (sessionId === SESSION_IDS.LONDON) {
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), SESSIONS.LONDON.startUtcHour, 0, 0));
    }
    if (sessionId === SESSION_IDS.NEW_YORK) {
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), SESSIONS.NEW_YORK.startUtcHour, 0, 0));
    }

    // For overlap or quiet, just use the candle timestamp itself.
    return date;
  }

  isWithinFirstHour(timestamp, sessionId) {
    if (sessionId !== SESSION_IDS.LONDON && sessionId !== SESSION_IDS.NEW_YORK) {
      return false;
    }

    const start = this.getSessionStart(timestamp, sessionId).getTime();
    const delta = timestamp - start;
    return delta >= 0 && delta <= 60 * 60 * 1000;
  }

  /**
   * Process a new candle and return a JSON payload suitable for emitting to clients.
   */
  processCandle(pair, candle, meta = {}) {
    const sessionId = determineSession(new Date(candle.time));
    const sessions = this._ensurePair(pair);
    const bucket = sessions[sessionId] || [];

    bucket.push(candle);
    this._trimHistory(bucket);

    const sessionAverages = calculateSessionAverages(bucket, this.lookbackCandles);
    const srv = calculateSRV(candle, sessionAverages);
    const ignition = isInstitutionalIgnition(candle, sessionAverages);
    const inKillzone = ignition && this.isWithinFirstHour(candle.time, sessionId);

    const adr = calculateSessionADR(
      // Use full history across sessions per pair, since ADR is a daily metric.
      Object.values(sessions).flat(),
      (c) => determineSession(new Date(c.time)) === sessionId,
      this.adrLookbackDays
    );

    const payload = {
      pair,
      raw_pair: meta.rawPair || pair,
      granularity: meta.granularity || "M1",
      session: sessionId,
      volatility_score: Number(srv.toFixed(3)),
      in_killzone: inKillzone,
      institutional_ignition: ignition,
      session_adr: {
        avg_daily_range: Number(adr.avgDailyRange.toFixed(6)),
        recent: adr.dailyRanges,
      },
      session_averages: {
        avg_range: Number(sessionAverages.avgRange.toFixed(6)),
        avg_volume: Number(sessionAverages.avgVolume.toFixed(0)),
        candles: sessionAverages.candleCount,
      },
      timestamp: candle.time,
    };

    return payload;
  }
}
