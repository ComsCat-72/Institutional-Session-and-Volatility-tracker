import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { HeatMap } from "./components/HeatMap";
import { ADRGauge } from "./components/ADRGauge";
import { ToastManager } from "./components/ToastManager";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

function useSocket(onMessage) {
  const socketRef = useRef();

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("connected to backend", socket.id);
    });

    socket.on("instrumental_update", (msg) => {
      onMessage?.(msg);
    });

    socket.on("disconnect", () => {
      console.log("disconnected");
    });

    return () => {
      socket.disconnect();
    };
  }, [onMessage]);

  return socketRef;
}

export default function App() {
  const [latest, setLatest] = useState({});
  const [toasts, setToasts] = useState([]);

  const addToast = (toast) => {
    setToasts((prev) => [...prev, toast]);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleIncoming = (payload) => {
    setLatest((prev) => ({ ...prev, [payload.pair]: payload }));

    if (payload.in_killzone) {
      addToast({
        id: `${payload.pair}-${payload.timestamp}`,
        title: `Ignition: ${payload.pair}`,
        message: `${payload.session} – Volatility ${payload.volatility_score.toFixed(2)}`,
      });

      // auto-dismiss after 9 seconds
      setTimeout(() => removeToast(`${payload.pair}-${payload.timestamp}`), 9000);
    }
  };

  useSocket(handleIncoming);

  const pairs = useMemo(() => Object.keys(latest), [latest]);

  const [utcNow, setUtcNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setUtcNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="pointer-events-none absolute inset-0 glass-bg" />
      <div className="pointer-events-none absolute inset-0 bg-black/25 backdrop-blur-xl" />

      <header className="relative mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Institutional Session & Volatility Tracker</h1>
            <p className="text-sm text-slate-300">Real-time Smart Money session transitions and volatility spikes.</p>
          </div>
          <div className="flex flex-col gap-1 text-xs text-slate-300 md:text-right">
            <span>UTC Time: {utcNow.toUTCString().slice(17, 25)}</span>
            <span>Instruments: {pairs.length || 0}</span>
          </div>
        </div>

        <HeatMap />
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-6 pb-10">
        <section className="grid gap-4 lg:grid-cols-2">
          {pairs.length === 0 ? (
            <div className="rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10 p-6 text-center text-slate-200 shadow-lg">
              Waiting for live data from the backend...
            </div>
          ) : (
            pairs.map((pair) => {
              const payload = latest[pair];
              const adrTarget = payload.session_adr?.avg_daily_range ?? 0;
              const moved = payload.session_averages?.avg_range ?? 0;
              const sessionColor = payload.session === "Overlap" ? "text-emerald-300" : "text-sky-200";

              return (
                <div key={pair} className="rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10 p-6 shadow-lg">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-lg font-semibold text-slate-50">{pair}</div>
                      <div className={`text-sm ${sessionColor}`}>{payload.session}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-300">Volatility Score</div>
                      <div className="text-3xl font-semibold text-emerald-300">{payload.volatility_score.toFixed(2)}</div>
                      <div className="mt-1 text-xs text-slate-300">
                        {payload.in_killzone ? "🔥 In killzone" : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <ADRGauge title="Session ADR" moved={moved} target={adrTarget || 1} />
                    <div className="rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10 p-4">
                      <div className="text-xs font-semibold text-slate-100">Session Stats</div>
                      <div className="mt-2 space-y-1 text-xs text-slate-200">
                        <div>Granularity: {payload.granularity}</div>
                        <div>Avg Range (last 20): {payload.session_averages.avg_range.toFixed(4)}</div>
                        <div>Avg Volume (last 20): {payload.session_averages.avg_volume.toFixed(0)}</div>
                        <div>ADR (5d): {adrTarget.toFixed(4)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </main>

      <ToastManager toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
