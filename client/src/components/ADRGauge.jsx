export function ADRGauge({ title, moved, target }) {
  const percentage = target > 0 ? Math.min(1, moved / target) : 0;
  return (
    <div className="rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10 shadow-lg p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        <div className="text-xs text-slate-200">
          {moved.toFixed(1)} / {target.toFixed(1)} pips
        </div>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-emerald-400 transition-all"
          style={{ width: `${percentage * 100}%` }}
        />
      </div>
    </div>
  );
}
