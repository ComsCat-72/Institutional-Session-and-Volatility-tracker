import { motion } from "framer-motion";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const SESSION_IDS = {
  LONDON: "London_Open",
  NEW_YORK: "New_York_Open",
  OVERLAP: "Overlap",
  QUIET: "Quiet",
};

const SESSIONS = {
  [SESSION_IDS.LONDON]: { startUtcHour: 7, endUtcHour: 10 },
  [SESSION_IDS.NEW_YORK]: { startUtcHour: 12, endUtcHour: 15 },
};

function isWithinWindow(hour, session) {
  return hour >= session.startUtcHour && hour < session.endUtcHour;
}

function determineSession(date) {
  const hour = date.getUTCHours();
  const inLondon = isWithinWindow(hour, SESSIONS[SESSION_IDS.LONDON]);
  const inNewYork = isWithinWindow(hour, SESSIONS[SESSION_IDS.NEW_YORK]);

  if (inLondon && inNewYork) return SESSION_IDS.OVERLAP;
  if (inLondon) return SESSION_IDS.LONDON;
  if (inNewYork) return SESSION_IDS.NEW_YORK;
  return SESSION_IDS.QUIET;
}

const sessionStyles = {
  [SESSION_IDS.LONDON]: "bg-emerald-600",
  [SESSION_IDS.NEW_YORK]: "bg-emerald-500",
  [SESSION_IDS.OVERLAP]: "bg-emerald-400",
  [SESSION_IDS.QUIET]: "bg-slate-800",
};

export function HeatMap() {
  const now = new Date();
  const currentHour = now.getUTCHours();

  return (
    <div className="rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10 shadow-lg p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold text-slate-100">24h Session Heat Map (UTC)</div>
        <div className="text-xs text-slate-300">Current UTC: {now.toUTCString().slice(17, 25)}</div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="inline-flex w-max gap-1">
          {HOURS.map((h) => {
            const session = determineSession(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h)));
            const isNow = h === currentHour;
            return (
              <motion.div
                key={h}
                layout
                className={`h-10 min-w-[40px] rounded-md border border-slate-800 ${sessionStyles[session]} ${isNow ? "ring-2 ring-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.55)]" : ""}`}
                title={`UTC ${h.toString().padStart(2, "0")}:00 – ${session}`}
              >
                <div className="flex h-full items-center justify-center text-xs text-slate-50">
                  {h}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
