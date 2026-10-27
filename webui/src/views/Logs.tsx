import { AnimatePresence, motion } from 'motion/react';
import { clearLogs, useStore } from '../lib/store';
import { listItemVariants, sectionVariants } from '../lib/animation';

export default function Logs() {
  const store = useStore();

  return (
    <motion.div className="space-y-4" variants={sectionVariants} initial="hidden" animate="visible">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Activity Log</h2>
          <p className="mt-0.5 text-[12px] text-sub">Panel operation history (kept in browser localStorage, up to 300 entries).</p>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          className="rounded-lg border border-line bg-panel px-3.5 py-2 text-[13px] text-sub transition-colors hover:border-err/60 hover:text-err"
          onClick={clearLogs}
        >
          Clear
        </motion.button>
      </div>
      <motion.div layout className="overflow-hidden rounded-xl border border-line bg-panel">
        <AnimatePresence mode="wait" initial={false}>
          {store.logs.length === 0 ? (
            <motion.div
              key="empty"
              className="px-4 py-10 text-center text-[13px] text-sub/70"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
            >
              No records yet
            </motion.div>
          ) : (
            <motion.div
              key="logs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {store.logs.map((entry, index) => (
                <motion.div
                  layout
                  key={entry.id}
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  custom={index}
                  className="flex gap-3 border-b border-line/50 px-4 py-2 font-mono text-[12px] last:border-0"
                >
                  <span className="flex-none text-sub/60">{entry.ts}</span>
                  <span className={entry.level === 'err' ? 'text-err' : entry.level === 'ok' ? 'text-ok' : 'text-sub'}>{entry.msg}</span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
