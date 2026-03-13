import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import dotenv from "dotenv";

import { LiveFeed, OandaFeed, OandaStreamingFeed } from "./wsClient.js";
import { SessionProcessor } from "./processor.js";

dotenv.config();

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  },
});

const processor = new SessionProcessor({ lookbackCandles: 20, adrLookbackDays: 5 });

const OANDA_TOKEN = process.env.OANDA_TOKEN;
const OANDA_ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID;
const OANDA_INSTRUMENTS = (process.env.OANDA_INSTRUMENTS || "GBP_USD,EUR_USD,USD_JPY").split(",").map((s) => s.trim()).filter(Boolean);
const OANDA_GRANULARITY = process.env.OANDA_GRANULARITY || "M1";
const OANDA_POLL_MS = Number(process.env.POLL_INTERVAL_MS || 60000);
const USE_STREAM = String(process.env.OANDA_STREAM || "false").toLowerCase() === "true";

const liveFeed =
  OANDA_TOKEN && USE_STREAM && OANDA_ACCOUNT_ID
    ? new OandaStreamingFeed({
        token: OANDA_TOKEN,
        accountId: OANDA_ACCOUNT_ID,
        instruments: OANDA_INSTRUMENTS,
        granularity: OANDA_GRANULARITY,
      })
    : OANDA_TOKEN
    ? new OandaFeed({
        token: OANDA_TOKEN,
        instruments: OANDA_INSTRUMENTS,
        granularity: OANDA_GRANULARITY,
        intervalMs: OANDA_POLL_MS,
      })
    : new LiveFeed({ pairs: ["GBPJPY", "EURUSD", "USDJPY"], intervalMs: 2500 });

// Socket.io connection
io.on("connection", (socket) => {
  console.log("Client connected", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
  });
});

// Broadcast processed candle payload to all clients
liveFeed.on("candle", ({ pair, rawPair, granularity, candle }) => {
  const payload = processor.processCandle(pair, candle, { rawPair, granularity });
  io.emit("instrumental_update", payload);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Using feed: ${OANDA_TOKEN ? (USE_STREAM && OANDA_ACCOUNT_ID ? "OANDA stream" : "OANDA REST") : "demo"}`);
  // Start the feed (may be async for streaming sources)
  Promise.resolve(liveFeed.start()).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Live feed failed to start", err);
  });
});
