import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { refresh, setView, useStore, type View } from '../lib/store';
import { listContainerVariants, listItemVariants, sectionVariants } from '../lib/animation';
import type { TargetStatus } from '../lib/api';
import { LOGOS } from '../lib/logos';
import Ic, { type IconName } from '../components/Ic';

/* 纯统计页：只展示状态与模块入口，不做任何分发/收回操作（操作去各自的模块） */

const instrMeta: Record<TargetStatus['instr'], { dot: string; label: string }> = {
  none: { dot: 'dot-off', label: 'Not distributed' },
  ours: { dot: 'dot-ok', label: 'Linked' },
  'ours-broken': { dot: 'dot-err', label: 'Broken link' },
  copy: { dot: 'dot-ok', label: 'Copied' },
  // foreign 同 none：他人文件派发时自动 backup 接管，不再特别提示
  foreign: { dot: 'dot-off', label: 'Not distributed' },
  unsupported: { dot: 'dot-off', label: 'MCP only' },
};

const quickLinks: Array<{ view: View; label: string; description: string; icon: IconName }> = [
  { view: 'agents', label: 'Instructions', description: 'Preview and distribution', icon: 'file' },
  { view: 'skills', label: 'Skills', description: 'Distribution matrix', icon: 'blocks' },
  { view: 'mcp', label: 'MCP Servers', description: 'Upstream connections', icon: 'plug' },
  { view: 'files', label: 'Nexus Files', description: 'Browse workspace files', icon: 'folder' },
];

const skillPercent = (target: TargetStatus): number => {
  if (!target.skillsTotal) return 0;
  return Math.min(100, Math.round((target.skillsLinked / target.skillsTotal) * 100));
};

export default function Dashboard() {
  const store = useStore();
  const [showAttention, setShowAttention] = useState(false);
  const state = store.state;

  // 后端连接失败：明确报错而不是无限加载
  if (!state) {
    if (store.error) {
      return (
        <div className="rounded-2xl border border-err/25 bg-panel px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-err/25 bg-err/10 text-err">
            <Ic name="alert" className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold">Backend unavailable</h1>
          <p className="mt-1 text-[12.5px] text-sub">无法连接面板后端（127.0.0.1:8741）</p>
          <p className="mt-4 text-[12px] leading-6 text-sub">
            {store.error}<br />
            如果你打开的是 Vite 开发页（5173），请先在另一个终端启动后端：
            <code className="rounded bg-panel2 px-1.5 py-0.5 font-mono text-[11px] text-accent">node dist/cli.js web --no-open -p 8741</code>
          </p>
          <motion.button type="button" whileTap={{ scale: 0.98 }} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[12.5px] font-medium text-base transition-opacity hover:opacity-90" onClick={() => void refresh()}>
            <Ic name="refresh" />重试
          </motion.button>
        </div>
      );
    }

    return (
      <div className="space-y-5" aria-label="Loading overview">
        <div className="flex items-center justify-between px-1">
          <div className="space-y-2">
            <div className="h-7 w-32 animate-pulse rounded-lg bg-panel2"></div>
            <div className="h-4 w-72 animate-pulse rounded-lg bg-panel"></div>
          </div>
          <div className="h-9 w-32 animate-pulse rounded-lg bg-panel"></div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl border border-line bg-panel"></div>)}
        </div>
        <div className="h-[420px] animate-pulse rounded-2xl border border-line bg-panel"></div>
      </div>
    );
  }

  const targets = state.status.targets;
  const issueCount = state.doctor.issues.length;
  const warningCount = state.doctor.warnings.length;
  const attentionCount = issueCount + warningCount;
  const installedCount = targets.filter((target) => target.installed).length;
  const missingCount = targets.length - installedCount;
  const instructionTargetCount = targets.filter((target) => target.eff.supports.instructions).length;
  const instructionReadyCount = targets.filter((target) => target.eff.supports.instructions && (target.instr === 'ours' || target.instr === 'copy')).length;
  const instructionPendingCount = instructionTargetCount - instructionReadyCount;
  const skillTargetCount = targets.filter((target) => target.eff.supports.skills).length;
  const skillsLinked = targets.reduce((sum, target) => sum + target.skillsLinked, 0);
  const skillsTotal = targets.reduce((sum, target) => sum + (target.eff.supports.skills ? target.skillsTotal : 0), 0);
  const skillsBroken = targets.reduce((sum, target) => sum + target.skillsBroken, 0);

  const healthTone: 'ok' | 'warn' | 'err' = issueCount ? 'err' : warningCount ? 'warn' : 'ok';
  const healthTitle = healthTone === 'err' ? 'Issues found' : healthTone === 'warn' ? 'Needs review' : 'All healthy';
  const healthParts: string[] = [];
  if (issueCount) healthParts.push(`${issueCount} issue${issueCount === 1 ? '' : 's'}`);
  if (warningCount) healthParts.push(`${warningCount} warning${warningCount === 1 ? '' : 's'}`);
  const healthSummary = healthParts.length ? healthParts.join(' · ') : 'All automated checks are passing';
  const attentionTitle = `${healthParts.join(' and ')} ${attentionCount === 1 ? 'requires' : 'require'} review`;
  const firstAttention = state.doctor.issues[0] ?? state.doctor.warnings[0] ?? '';

  return (
    <motion.div className="space-y-5" variants={sectionVariants} initial="hidden" animate="visible">
      {/* 页面标题与全局状态 */}
      <header className="flex flex-wrap items-center justify-between gap-4 px-1">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[24px] font-semibold tracking-[-0.035em]">Overview</h1>
            <span className="rounded-md border border-line bg-panel px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-sub/70">Live</span>
          </div>
          <p className="mt-1 text-[12.5px] text-sub">Instruction distribution, skill links, and agent readiness at a glance.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className={`hidden items-center gap-2 rounded-lg border px-3 py-2 text-[11.5px] font-medium sm:inline-flex ${healthTone === 'err' ? 'border-err/25 bg-err/8 text-err' : healthTone === 'warn' ? 'border-warn/25 bg-warn/8 text-warn' : 'border-ok/25 bg-ok/8 text-ok'}`}
          >
            <span className={`dot ${healthTone === 'ok' ? 'dot-ok' : healthTone === 'warn' ? 'dot-warn' : 'dot-err'}`}></span>
            {healthTitle}
          </span>
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[11.5px] text-sub transition-colors hover:border-accent/40 hover:text-fg disabled:opacity-50"
            disabled={store.loading}
            onClick={() => void refresh()}
          >
            <Ic name="refresh" className={store.loading ? 'animate-spin' : ''} />
            {store.loading ? 'Refreshing…' : 'Refresh status'}
          </motion.button>
        </div>
      </header>

      {/* 四项关键指标 */}
      <motion.section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Workspace summary" variants={listContainerVariants} initial="hidden" animate="visible">
        <motion.article variants={listItemVariants} whileHover={{ y: -2 }} className="relative overflow-hidden rounded-2xl border border-line bg-panel p-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)] transition-colors hover:border-line2">
          <span className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"></span>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-sub/70">System health</span>
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${healthTone === 'err' ? 'bg-err/10 text-err' : healthTone === 'warn' ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok'}`}>
              <Ic name={healthTone === 'ok' ? 'check' : 'alert'} />
            </span>
          </div>
          <div className={`mt-2 text-[22px] font-semibold leading-8 tracking-[-0.03em] ${healthTone === 'err' ? 'text-err' : healthTone === 'warn' ? 'text-warn' : 'text-ok'}`}>{healthTitle}</div>
          <p className="mt-1 truncate text-[11px] text-sub" title={healthSummary}>{healthSummary}</p>
        </motion.article>

        <motion.article variants={listItemVariants} whileHover={{ y: -2 }} className="relative overflow-hidden rounded-2xl border border-line bg-panel p-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)] transition-colors hover:border-line2">
          <span className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"></span>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-sub/70">Agents detected</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent"><Ic name="grid" /></span>
          </div>
          <div className="mt-1 text-[28px] font-semibold leading-9 tracking-[-0.04em]">
            {installedCount}<span className="ml-1.5 text-[14px] font-normal tracking-normal text-sub">/ {targets.length}</span>
          </div>
          <p className="mt-1 text-[11px] text-sub">{missingCount ? `${missingCount} not installed` : 'Every registered agent is available'}</p>
        </motion.article>

        <motion.article variants={listItemVariants} whileHover={{ y: -2 }} className="relative overflow-hidden rounded-2xl border border-line bg-panel p-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)] transition-colors hover:border-line2">
          <span className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"></span>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-sub/70">Instructions ready</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent"><Ic name="file" /></span>
          </div>
          <div className="mt-1 text-[28px] font-semibold leading-9 tracking-[-0.04em]">
            {instructionReadyCount}<span className="ml-1.5 text-[14px] font-normal tracking-normal text-sub">/ {instructionTargetCount}</span>
          </div>
          <p className="mt-1 text-[11px] text-sub">{instructionPendingCount ? `${instructionPendingCount} pending or overridden` : 'Every supported agent is covered'}</p>
        </motion.article>

        <motion.article variants={listItemVariants} whileHover={{ y: -2 }} className="relative overflow-hidden rounded-2xl border border-line bg-panel p-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)] transition-colors hover:border-line2">
          <span className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"></span>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-sub/70">Active skill links</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent"><Ic name="blocks" /></span>
          </div>
          <div className="mt-1 text-[28px] font-semibold leading-9 tracking-[-0.04em]">
            {skillsLinked}<span className="ml-1.5 text-[14px] font-normal tracking-normal text-sub">/ {skillsTotal}</span>
          </div>
          <p className={`mt-1 text-[11px] ${skillsBroken ? 'text-err' : 'text-sub'}`}>
            {skillsBroken ? `${skillsBroken} broken link${skillsBroken === 1 ? '' : 's'}` : `${skillTargetCount} compatible agents`}
          </p>
        </motion.article>
      </motion.section>

      {/* 可展开的异常摘要，避免多张大横幅抢占首屏 */}
      {attentionCount ? (
        <motion.section layout className={`overflow-hidden rounded-2xl border ${healthTone === 'err' ? 'border-err/25 bg-err/6' : 'border-warn/25 bg-warn/6'}`} variants={sectionVariants} initial="hidden" animate="visible">
          <motion.button type="button" whileTap={{ scale: 0.99 }} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={showAttention} onClick={() => setShowAttention((value) => !value)}>
            <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg ${healthTone === 'err' ? 'bg-err/10 text-err' : 'bg-warn/10 text-warn'}`}><Ic name="alert" /></span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[12px] font-medium ${healthTone === 'err' ? 'text-err' : 'text-warn'}`}>{attentionTitle}</span>
              <span className="mt-0.5 hidden truncate text-[11px] text-sub sm:block" title={firstAttention}>{firstAttention}</span>
            </span>
            <span className="hidden text-[11px] text-sub sm:inline">{showAttention ? 'Hide details' : 'Show details'}</span>
            <Ic name="chevron" className={`text-sub transition-transform ${showAttention ? 'rotate-90' : ''}`} />
          </motion.button>
          <AnimatePresence>
          {showAttention ? (
            <motion.div className={`max-h-48 space-y-2 overflow-y-auto border-t px-4 py-3 ${healthTone === 'err' ? 'border-err/15' : 'border-warn/15'}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              {state.doctor.issues.map((message, index) => (
                <div key={`issue-${index}`} className="flex items-start gap-2.5 text-[11.5px] leading-5">
                  <span className="dot dot-err mt-1.5"></span><span className="text-fg/90">{message}</span>
                </div>
              ))}
              {state.doctor.warnings.map((message, index) => (
                <div key={`warning-${index}`} className="flex items-start gap-2.5 text-[11.5px] leading-5">
                  <span className="dot dot-warn mt-1.5"></span><span className="text-sub">{message}</span>
                </div>
              ))}
            </motion.div>
          ) : null}
          </AnimatePresence>
        </motion.section>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Agent 集成状态：统一列表取代重复卡片 */}
        <section className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
          <header className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/15 bg-accent/10 text-accent"><Ic name="plug" /></span>
              <div>
                <h2 className="text-[13.5px] font-semibold">Agent integrations</h2>
                <p className="mt-0.5 text-[10.5px] text-sub/75">Native instruction and skill status</p>
              </div>
            </div>
            <span className="rounded-lg border border-line bg-panel2 px-2.5 py-1 text-[10.5px] text-sub">{targets.length} agents</span>
          </header>

          <div className="hidden grid-cols-[minmax(150px,1.15fr)_minmax(145px,1fr)_minmax(115px,0.8fr)_24px] gap-4 border-y border-line bg-panel2/35 px-5 py-2.5 text-[9.5px] font-semibold uppercase tracking-[0.13em] text-sub/55 lg:grid">
            <span>Agent</span><span>Instructions</span><span>Skills</span><span></span>
          </div>

          <motion.div className="divide-y divide-line/60" variants={listContainerVariants} initial="hidden" animate="visible">
            {targets.map((target) => (
              <motion.button
                type="button"
                key={target.eff.id}
                variants={listItemVariants}
                whileHover={{ x: 2 }}
                className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-panel2/65 lg:grid-cols-[minmax(150px,1.15fr)_minmax(145px,1fr)_minmax(115px,0.8fr)_24px] lg:gap-4 lg:px-5"
                aria-label={`View ${target.eff.label} instruction details`}
                onClick={() => setView('agents')}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-line/70 bg-panel2">
                    <img src={LOGOS[target.eff.id]} className="h-5 w-5 rounded-sm object-contain" alt="" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[12.5px] font-medium">{target.eff.label}</span>
                      {target.eff.customized ? <span className="flex-none rounded bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent">Custom</span> : null}
                    </span>
                    <span className={`mt-0.5 block text-[10.5px] ${target.installed ? 'text-sub/65' : 'text-warn/85'}`}>{target.installed ? 'Available' : 'Not installed'}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-[10px] text-sub lg:hidden">
                      <span>{instrMeta[target.instr].label}</span><span className="text-sub/35">·</span><span>{target.eff.supports.skills ? `${target.skillsLinked}/${target.skillsTotal} skills` : 'No skills'}</span>
                    </span>
                  </span>
                </span>

                <span className="hidden items-center gap-2 text-[11.5px] text-sub lg:flex" title={target.instrPath}>
                  <span className={`dot ${instrMeta[target.instr].dot}`}></span>
                  <span className="truncate">{instrMeta[target.instr].label}</span>
                </span>

                {target.eff.supports.skills ? (
                  <span className="hidden lg:block">
                    <span className="flex items-center justify-between gap-2 text-[10.5px]">
                      <span className="text-fg">{target.skillsLinked}<span className="text-sub/60"> / {target.skillsTotal}</span></span>
                      {target.skillsBroken ? <span className="text-err">{target.skillsBroken} broken</span> : <span className="text-sub/55">{skillPercent(target)}%</span>}
                    </span>
                    <span className="mt-2 block h-1 overflow-hidden rounded-full bg-line">
                      <span className={`block h-full rounded-full transition-[width] ${target.skillsBroken ? 'bg-err' : 'bg-accent'}`} style={{ width: `${skillPercent(target)}%` }}></span>
                    </span>
                  </span>
                ) : <span className="hidden text-[11px] text-sub/50 lg:block">Not supported</span>}

                <span className="flex h-7 w-7 items-center justify-center justify-self-end rounded-lg text-sub/45 transition-all group-hover:bg-accent/10 group-hover:translate-x-0.5 group-hover:text-accent">
                  <Ic name="chevron" />
                </span>
              </motion.button>
            ))}
          </motion.div>
          <footer className="border-t border-line px-5 py-3 text-[10.5px] text-sub/60">Select an agent to review its instruction settings.</footer>
        </section>

        {/* 右侧：只读模块入口与活动时间线 */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-line bg-panel p-3 shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
            <header className="px-2 pb-2 pt-1">
              <h2 className="text-[13px] font-semibold">Quick access</h2>
              <p className="mt-0.5 text-[10.5px] text-sub/70">Jump to a management module</p>
            </header>
            <motion.div className="space-y-1" variants={listContainerVariants} initial="hidden" animate="visible">
              {quickLinks.map((item) => (
                <motion.button
                  type="button"
                  key={item.view}
                  variants={listItemVariants}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.99 }}
                  className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-panel2"
                  onClick={() => setView(item.view)}
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-line/70 bg-panel2 text-sub transition-colors group-hover:border-accent/25 group-hover:text-accent">
                    <Ic name={item.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-sub/70">{item.description}</span>
                  </span>
                  <Ic name="chevron" className="text-sub/40 transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
                </motion.button>
              ))}
            </motion.div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
            <header className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Ic name="list" className="text-sub/70" />
                <h2 className="text-[13px] font-semibold">Recent activity</h2>
              </div>
              {store.logs.length ? <span className="rounded-md bg-panel2 px-1.5 py-0.5 text-[9.5px] text-sub/65">{store.logs.length}</span> : null}
            </header>
            {store.logs.length ? (
              <motion.div className="divide-y divide-line/50 px-4" variants={listContainerVariants} initial="hidden" animate="visible">
                {store.logs.slice(0, 5).map((entry) => (
                  <motion.div layout key={entry.id} variants={listItemVariants} className="flex items-start gap-2.5 py-3">
                    <span className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${entry.level === 'err' ? 'bg-err' : entry.level === 'ok' ? 'bg-ok' : 'bg-accent'}`}></span>
                    <span className="min-w-0 flex-1">
                      <span className={`line-clamp-2 text-[11.5px] leading-[1.45] ${entry.level === 'err' ? 'text-err' : entry.level === 'ok' ? 'text-fg/90' : 'text-sub'}`} title={entry.msg}>{entry.msg}</span>
                      <span className="mt-1 block font-mono text-[9.5px] text-sub/50">{entry.ts}</span>
                    </span>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-panel2 text-sub/55"><Ic name="list" /></span>
                <p className="mt-3 text-[11.5px] font-medium text-sub">No activity yet</p>
                <p className="mt-1 text-[10.5px] leading-4 text-sub/55">Panel operations will appear here.</p>
              </div>
            )}
            <footer className="border-t border-line px-4 py-2.5">
              <motion.button type="button" whileTap={{ scale: 0.98 }} className="flex w-full items-center justify-between text-[10.5px] text-sub transition-colors hover:text-accent" onClick={() => setView('logs')}>
                <span>View activity log</span><Ic name="chevron" />
              </motion.button>
            </footer>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
