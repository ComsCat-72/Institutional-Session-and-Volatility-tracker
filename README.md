# Institutional Session & Volatility Tracker

A proof-of-concept real-time dashboard that highlights institutional session transitions (London / New York) and plots volatility spikes from live candle data.

## Structure

- `server/` — Node.js backend with Express + Socket.io plus session/volatility logic.
- `client/` — React + Vite frontend with Tailwind, Framer Motion, and real-time socket updates.

## Getting Started

### 1) Backend

1) Copy `.env.example` to `.env` and add your OANDA API token if you want real market prices:

```bash
cp .env.example .env
# (edit .env to set OANDA_TOKEN and optional instruments)
```

2) Start the server

```bash
cd server
npm install
npm run start
```

By default the server uses a demo candle generator. With `OANDA_TOKEN` set it will fetch OANDA candles (REST polling). You can also enable streaming by setting `OANDA_ACCOUNT_ID` and `OANDA_STREAM=true` in your `.env`.

You can control candle granularity using `OANDA_GRANULARITY` (e.g. `M1`, `M5`, `H1`).

### 2) Frontend

```bash
cd client
npm install
npm run dev
```

The frontend will connect to `http://localhost:4000` by default.

## Notes

- The backend currently uses a synthetic candle generator in `server/src/wsClient.js` for demo/testing.
- The core session logic is implemented in `server/src/sessionLogic.js`, and the volatility/ignition rules are in `server/src/volatility.js`.
- The frontend heat map shows UTC session windows and toasts fire when an "Institutional Ignition" signal occurs in the first 60 minutes of a session.
