/**
 * Market data source integration.
 *
 * Provides a common candle event interface for downstream processors.
 *
 * The simple demo generator is retained for local testing, but the primary
 * implementation uses OANDA REST candles.
 */

import EventEmitter from "events";
import axios from "axios";

function displaySymbol(raw) {
  return String(raw).replace(/_/g, "");
}

export class LiveFeed extends EventEmitter {
  constructor({ pairs = ["GBPJPY"], intervalMs = 5000 } = {}) {
    super();
    this.pairs = pairs;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.lastPrice = {};
  }

  start() {
    for (const pair of this.pairs) {
      this.lastPrice[pair] = 150 + Math.random() * 10;
    }

    this.timer = setInterval(() => {
      const now = Date.now();
      for (const pair of this.pairs) {
        const base = this.lastPrice[pair];
        const open = base;
        const close = base + (Math.random() - 0.5) * 0.3;
        const high = Math.max(open, close) + Math.random() * 0.2;
        const low = Math.min(open, close) - Math.random() * 0.2;
        const volume = 100 + Math.random() * 400;

        this.lastPrice[pair] = close;

        const candle = {
          time: now,
          open,
          high,
          low,
          close,
          volume,
        };

        this.emit("candle", { pair: displaySymbol(pair), rawPair: pair, granularity: "M1", candle });
      }
    }, this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}

function normalizePairForOanda(pair) {
  // OANDA uses underscores, e.g. "GBP_USD".
  if (pair.includes("_")) return pair;
  return pair.replace(/(.{3})(.{3})/, "$1_$2");
}

export class OandaFeed extends EventEmitter {
  constructor({ token, instruments = ["GBP_USD"], granularity = "M1", intervalMs = 60000, apiBase = "https://api-fxpractice.oanda.com" } = {}) {
    super();
    this.token = token;
    this.instruments = instruments;
    this.granularity = granularity;
    this.intervalMs = intervalMs;
    this.apiBase = apiBase;
    this.timer = null;
    this.lastCandleTime = {};
  }

  async _fetchLatestCandle(instrument) {
    const url = `${this.apiBase}/v3/instruments/${instrument}/candles`;
    const params = {
      granularity: this.granularity,
      count: 2,
      price: "M",
    };

    const resp = await axios.get(url, {
      params,
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      timeout: 15000,
    });

    const candles = resp.data?.candles ?? [];
    if (!candles.length) return null;

    // Return the latest closed candle.
    const latest = candles[candles.length - 1];
    if (!latest.complete) return null;

    return {
      time: new Date(latest.time).getTime(),
      open: Number(latest.mid.o),
      high: Number(latest.mid.h),
      low: Number(latest.mid.l),
      close: Number(latest.mid.c),
      volume: Number(latest.volume || 0),
    };
  }

  async _emitCandles() {
    for (const rawPair of this.instruments) {
      const instrument = normalizePairForOanda(rawPair);
      try {
        const candle = await this._fetchLatestCandle(instrument);
        if (!candle) continue;

        const lastTime = this.lastCandleTime[instrument] || 0;
        if (candle.time <= lastTime) continue;

        this.lastCandleTime[instrument] = candle.time;
        this.emit("candle", { pair: displaySymbol(rawPair), rawPair, granularity: this.granularity, candle });
      } catch (err) {
        // quietly ignore transient errors; clients can log as needed
        // eslint-disable-next-line no-console
        console.warn("OANDA feed error", instrument, err.message || err);
      }
    }
  }

  start() {
    if (!this.token) {
      throw new Error("OANDA token is required for OandaFeed");
    }

    // emit once immediately, then start interval
    this._emitCandles();
    this.timer = setInterval(() => this._emitCandles(), this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}

function granularityToMs(granularity) {
  if (!granularity) return 60000;
  const match = granularity.match(/^M(\d+)$/);
  if (match) return Number(match[1]) * 60000;
  if (granularity === "H1") return 60 * 60000;
  if (granularity === "D") return 24 * 60 * 60000;
  return 60000;
}

export class OandaStreamingFeed extends EventEmitter {
  constructor({ token, accountId, instruments = ["GBP_USD"], granularity = "M1", apiBase = "https://stream-fxpractice.oanda.com" } = {}) {
    super();
    this.token = token;
    this.accountId = accountId;
    this.instruments = instruments;
    this.granularity = granularity;
    this.apiBase = apiBase;
    this.buffer = "";
    this.candles = new Map();
    this.req = null;
  }

  _bucketKey(instrument, bucketStart) {
    return `${instrument}-${bucketStart}`;
  }

  _createCandleBucket(instrument, bucketStart, price, timestamp) {
    return {
      instrument,
      bucketStart,
      time: timestamp,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
    };
  }

  _flushBucket(bucket) {
    const { instrument, open, high, low, close, volume, time } = bucket;
    const candle = { time, open, high, low, close, volume };
    const display = displaySymbol(instrument);
    this.emit("candle", { pair: display, rawPair: instrument, granularity: this.granularity, candle });
  }

  _processTick(tick) {
    if (tick.type !== "PRICE" || !tick.instrument || !tick.time) return;

    const bid = Number(tick.bids?.[0]?.price || 0);
    const ask = Number(tick.asks?.[0]?.price || 0);
    const price = (bid + ask) / 2;
    if (!price) return;

    const timestamp = new Date(tick.time).getTime();
    const bucketSize = granularityToMs(this.granularity);
    const bucketStart = Math.floor(timestamp / bucketSize) * bucketSize;

    const key = this._bucketKey(tick.instrument, bucketStart);
    let bucket = this.candles.get(key);

    if (!bucket) {
      // flush any previous completed bucket for this instrument
      for (const [k, prevBucket] of this.candles.entries()) {
        if (k.startsWith(`${tick.instrument}-`) && prevBucket.bucketStart < bucketStart) {
          this._flushBucket(prevBucket);
          this.candles.delete(k);
        }
      }

      bucket = this._createCandleBucket(tick.instrument, bucketStart, price, timestamp);
      this.candles.set(key, bucket);
    }

    bucket.high = Math.max(bucket.high, price);
    bucket.low = Math.min(bucket.low, price);
    bucket.close = price;
    bucket.time = timestamp;
    bucket.volume += 1;
  }

  async start() {
    if (!this.token || !this.accountId) {
      throw new Error("OANDA token and accountId are required for OandaStreamingFeed");
    }

    const instruments = this.instruments.map((i) => normalizePairForOanda(i)).join(",");
    const url = `${this.apiBase}/v3/accounts/${this.accountId}/pricing/stream?instruments=${encodeURIComponent(instruments)}`;

    const https = await import("https");

    this.req = https.get(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    }, (res) => {
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        this.buffer += chunk;
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            this._processTick(msg);
          } catch (err) {
            // ignore malformed lines
          }
        }
      });

      res.on("end", () => {
        for (const bucket of this.candles.values()) {
          this._flushBucket(bucket);
        }
      });
    });

    this.req.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.warn("OANDA streaming error", err.message || err);
    });
  }

  stop() {
    if (this.req) {
      this.req.destroy();
      this.req = null;
    }
    this.candles.clear();
  }
}
