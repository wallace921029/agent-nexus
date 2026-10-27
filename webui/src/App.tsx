import { useEffect, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { refresh, setView, useStore, type StoreState, type View } from './lib/store';
import { toggleTheme, useTheme } from './lib/theme';
import { listItemVariants, pageVariants } from './lib/animation';
import Ic, { type IconName } from './components/Ic';
import logo from './assets/logo.svg';
import Dashboard from './views/Dashboard';
import Agents from './views/Agents';
import Skills from './views/Skills';
import Mcp from './views/Mcp';
import Files from './views/Files';
import Logs from './views/Logs';

const nav: Array<{ id: View; label: string; icon: IconName }> = [
  { id: 'dashboard', label: 'Overview', icon: 'grid' },
  { id: 'files', label: 'NEXUS FILES', icon: 'folder' },
  { id: 'agents', label: 'AGENTS.md', icon: 'file' },
  { id: 'skills', label: 'Skills', icon: 'blocks' },
  { id: 'mcp', label: 'MCP Servers', icon: 'plug' },
  { id: 'logs', label: 'Activity Log', icon: 'list' },
];

const views: Record<View, ComponentType> = {
  dashboard: Dashboard,
  agents: Agents,
  skills: Skills,
  mcp: Mcp,
  files: Files,
  logs: Logs,
};

function doctorColor(store: StoreState): 'ok' | 'warn' | 'err' {
  if (store.error && !store.state) return 'err';
  const doctor = store.state?.doctor;
  if (!doctor) return 'warn';
  if (doctor.issues.length) return 'err';
  if (doctor.warnings.length) return 'warn';
  return 'ok';
}

export default function App() {
  const store = useStore();
  const theme = useTheme();
  const doctorTone = doctorColor(store);
  const CurrentView = views[store.view];

  useEffect(() => {
    void refresh();
  }, []);

  const doctorText = store.error && !store.state
    ? 'backend offline'
    : store.state
      ? doctorTone === 'ok'
        ? 'doctor: all good'
        : `${store.state.doctor.issues.length} issue(s) / ${store.state.doctor.warnings.length} warning(s)`
      : 'Loading…';

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* 黯淡的动态环境光，置于所有磨砂面板之下 */}
      <div className="ambient-background" aria-hidden="true">
        <span className="ambient-orb ambient-orb-a"></span>
        <span className="ambient-orb ambient-orb-b"></span>
        <span className="ambient-orb ambient-orb-c"></span>
      </div>

      {/* 侧边栏 */}
      <motion.aside
        className="relative z-10 flex w-56 flex-none flex-col border-r border-line bg-panel"
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <img src={logo} className="h-8 w-8 rounded-lg" alt="Agent Nexus" />
          <div>
            <div className="text-sm font-semibold tracking-wide">Agent Nexus</div>
            <div className="text-[11px] text-sub">Unified Config Center</div>
          </div>
        </div>

        <nav className="mt-1 flex-1 space-y-0.5 px-2">
          {nav.map((item, index) => (
            <motion.button
              type="button"
              key={item.id}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${store.view === item.id ? 'bg-accent/12 font-medium text-accent' : 'text-sub hover:bg-panel2 hover:text-fg'}`}
              variants={listItemVariants}
              initial="hidden"
              animate="visible"
              custom={index}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setView(item.id)}
            >
              <Ic name={item.icon} />
              {item.label}
            </motion.button>
          ))}
        </nav>

        <div className="space-y-2 border-t border-line px-4 py-3">
          <div className="flex items-center gap-2 text-[12px]">
            <span className={`dot dot-${doctorTone}`} />
            <span className="text-sub">{doctorText}</span>
          </div>
          <div className="truncate font-mono text-[11px] text-sub/80" title={store.state?.center}>
            {store.state?.center}
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-[12px] text-sub transition-colors hover:border-accent/50 hover:text-fg"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
          >
            <Ic name={theme === 'dark' ? 'sun' : 'moon'} />
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-[12px] text-sub transition-colors hover:border-accent/50 hover:text-fg"
            disabled={store.loading}
            onClick={() => void refresh()}
          >
            <Ic name="refresh" className={store.loading ? 'animate-spin' : ''} />
            Refresh
          </motion.button>
        </div>
      </motion.aside>

      {/* 主区域 */}
      <main className="relative z-10 min-w-0 flex-1 overflow-y-auto">
        {/* 内容区不设最大宽度：撑满可用宽度（用户要求所有页面均不限宽） */}
        <AnimatePresence mode="wait">
          <motion.div
            key={store.view}
            className="px-8 py-6"
            variants={pageVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <CurrentView />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
