import { motion, AnimatePresence } from "framer-motion";

export function ToastManager({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 30, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-auto w-72 rounded-2xl border border-white/10 bg-white/10 backdrop-blur-xl p-4 shadow-lg animate-glassPulse"
          >
            <div className="flex items-start gap-3">
              <div className="mt-px h-2 w-2 rounded-full bg-emerald-400" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-100">{toast.title}</div>
                <div className="mt-1 text-xs text-slate-300">{toast.message}</div>
              </div>
              <button
                onClick={() => onDismiss(toast.id)}
                className="text-slate-400 hover:text-slate-100"
              >
                ×
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
