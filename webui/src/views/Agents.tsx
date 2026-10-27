import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { log, refresh, useStore } from '../lib/store';
import { listContainerVariants, listItemVariants, sectionVariants } from '../lib/animation';
import { postSyncAgents, postTargetPaths, type Row, type TargetStatus } from '../lib/api';
import Modal from '../components/Modal';
import Ic from '../components/Ic';
import { LOGOS } from '../lib/logos';

/* 设计：卡片直操作（弃用表格+勾选）
   - 每卡：logo + 名称 + 状态胶囊 + 生效路径 + 相关提示 + 行内动作（分发/收回/✎路径）
   - 全局：Preview all (dry-run) / Distribute all / Retract all */

function pill(target: TargetStatus): { cls: string; text: string } {
  switch (target.instr) {
    case 'ours':
      return { cls: 'border-ok/40 bg-ok/10 text-ok', text: 'symlink ✓' };
    case 'copy':
      return { cls: 'border-ok/40 bg-ok/10 text-ok', text: 'copy mode ✓' };
    case 'ours-broken':
      return { cls: 'border-err/40 bg-err/10 text-err', text: 'broken' };
    default:
      // foreign 与 none 同等展示：已存在的他人文件在派发时会自动 backup 接管，无需提示
      return { cls: 'border-line text-sub/70', text: 'not distributed' };
  }
}

function hint(target: TargetStatus): { text: string; cls: string } | null {
  if (target.instr === 'ours-broken') return { text: 'Link is broken — re-distribute to fix.', cls: 'text-err' };
  if (target.instr === 'copy') return { text: 'Windows copy mode (Developer Mode off) — content refreshes on every sync.', cls: 'text-sub/80' };
  if (target.eff.instr.kind === 'agentsRef')
    return { text: 'AGENTS.md is symlinked; CLAUDE.md gets an "@~/…/AGENTS.md" absolute import (created only when missing; an existing CLAUDE.md is left alone).', cls: 'text-sub/70' };
  if (target.instr === 'unsupported') return { text: target.eff.notes?.[0] ?? '', cls: 'text-sub/70' };
  return null;
}

function rowsToLog(rows: Row[], prefix = ''): void {
  for (const row of rows) {
    log(`${prefix}${row.kind} [${row.id}] ${row.link ?? ''}${row.detail ? ' — ' + row.detail : ''}`, row.kind === 'conflict' ? 'err' : 'ok');
  }
}

interface EditingTarget {
  id: string;
  label: string;
  effPath: string;
  current: string;
}

export default function Agents() {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [editValue, setEditValue] = useState('');

  async function run(operation: () => Promise<void>): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await operation();
    } catch (e) {
      log(`Operation failed: ${(e as Error).message}`, 'err');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const previewAll = () =>
    run(async () => {
      const { rows } = await postSyncAgents({ dryRun: true });
      rowsToLog(rows, '[preview] ');
    });

  const distributeAll = () =>
    run(async () => {
      if (!confirm('Distribute AGENTS.md (symlinks) to ALL distributable tools?')) return;
      const { rows } = await postSyncAgents({});
      rowsToLog(rows);
      await refresh();
    });

  const retractAll = () =>
    run(async () => {
      if (!confirm('Retract instruction links from ALL tools?')) return;
      const { rows } = await postSyncAgents({ retract: true });
      rowsToLog(rows);
      await refresh();
    });

  const distributeOne = (target: TargetStatus) =>
    run(async () => {
      if (!confirm(`Distribute AGENTS.md to ${target.eff.label}?`)) return;
      const { rows } = await postSyncAgents({ targets: [target.eff.id] });
      rowsToLog(rows);
      await refresh();
    });

  const retractOne = (target: TargetStatus) =>
    run(async () => {
      if (!confirm(`Retract the instruction link from ${target.eff.label}?`)) return;
      const { rows } = await postSyncAgents({ targets: [target.eff.id], retract: true });
      rowsToLog(rows);
      await refresh();
    });

  function openEdit(target: TargetStatus): void {
    const settings = store.state?.targetSettings?.[target.eff.id] ?? {};
    const current = (settings.instructions as string | null | undefined) ?? '';
    setEditing({ id: target.eff.id, label: target.eff.label, effPath: target.instrPath, current });
    setEditValue(current);
  }

  const saveEdit = () =>
    run(async () => {
      const currentEditing = editing;
      if (!currentEditing) return;
      const value = editValue.trim();
      const { detail } = await postTargetPaths({ id: currentEditing.id, key: 'instructions', value: value === '' ? null : value });
      log(detail, 'ok');
      setEditing(null);
      await refresh();
    });

  if (!store.state) return <div className="py-20 text-center text-sub">Loading…</div>;

  return (
    <div className="space-y-4">
      {/* 顶栏：标题 + 全局动作 */}
      <motion.div className="flex flex-wrap items-center justify-between gap-3" variants={sectionVariants} initial="hidden" animate="visible">
        <div>
          <h2 className="text-base font-semibold">AGENTS.md distribution</h2>
          <p className="mt-0.5 text-[12px] text-sub">
            AGENTS.md + per-tool overlays → rendered → symlinked into each tool. An existing file is auto-backed-up (<code className="font-mono">.backup-timestamp</code>) and taken over; ✎ customizes the path.
          </p>
        </div>
        <div className="flex gap-2.5">
          <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg border border-line bg-panel px-3.5 py-2 text-[13px] text-sub transition-colors hover:border-accent/50 hover:text-fg" onClick={() => void previewAll()}>Preview all (dry-run)</motion.button>
          <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-base transition-opacity hover:opacity-90" onClick={() => void distributeAll()}>Distribute all</motion.button>
          <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg border border-line bg-panel px-3.5 py-2 text-[13px] text-sub transition-colors hover:border-err/60 hover:text-err" onClick={() => void retractAll()}>Retract all</motion.button>
        </div>
      </motion.div>

      {/* 工具卡片列表（字母序，数据源已排序） */}
      <motion.div className="space-y-2" variants={listContainerVariants} initial="hidden" animate="visible">
        {store.state.status.targets.map((target) => {
          const targetPill = pill(target);
          const targetHint = hint(target);
          return (
            <motion.div
              layout
              key={target.eff.id}
              variants={listItemVariants}
              whileHover={{ y: -1 }}
              className="group/card flex items-center gap-3.5 rounded-xl border border-line bg-panel px-4 py-3 transition-colors hover:border-line2"
            >
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-panel2 p-1.5">
                <img src={LOGOS[target.eff.id]} className="h-full w-full rounded-sm object-contain" alt="" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold">{target.eff.label}</span>
                  {target.eff.customized ? <span className="rounded bg-accent/12 px-1.5 py-0.5 text-[10px] text-accent">custom path</span> : null}
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${targetPill.cls}`}>{targetPill.text}</span>
                  {!target.installed ? <span className="text-[11px] text-sub/60">not installed</span> : null}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11.5px] text-sub/80" title={target.instrPath}>
                  {target.eff.supports.instructions ? target.instrPath : '—'}
                </div>
                {targetHint?.text ? <div className={`mt-1 text-[11px] ${targetHint.cls}`}>{targetHint.text}</div> : null}
              </div>

              {/* 行内动作：悬停浮现（已分发状态时常显收回） */}
              <div
                className={`flex flex-none items-center gap-1.5 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100 ${target.instr === 'ours' || target.instr === 'ours-broken' ? 'opacity-60' : ''}`}
              >
                {target.eff.supports.instructions ? (
                  <>
                    <motion.button
                      type="button" whileTap={{ scale: 0.98 }}
                      className="rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[11.5px] text-sub transition-colors hover:border-accent/60 hover:text-accent"
                      disabled={busy}
                      onClick={() => void distributeOne(target)}
                    >
                      {target.instr === 'none' || target.instr === 'ours-broken' ? 'Distribute' : 'Re-distribute'}
                    </motion.button>
                    {target.instr === 'ours' || target.instr === 'copy' || target.instr === 'ours-broken' ? (
                      <motion.button
                        type="button" whileTap={{ scale: 0.98 }}
                        className="rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[11.5px] text-sub transition-colors hover:border-err/60 hover:text-err"
                        disabled={busy}
                        onClick={() => void retractOne(target)}
                      >
                        Retract
                      </motion.button>
                    ) : null}
                    <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg p-1.5 text-sub/60 transition-colors hover:text-accent" title="Custom instruction path" onClick={() => openEdit(target)}>
                      <Ic name="edit" />
                    </motion.button>
                  </>
                ) : null}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      <AnimatePresence>
      {editing ? (
        <Modal key="instruction-path" title={`${editing.label} · custom instruction path`} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <p className="text-[12px] text-sub">
              Accepts home-relative (e.g. <code className="font-mono">.zcode/MY.md</code>), <code className="font-mono">~/</code>, or absolute paths. Save empty = reset to default.<br />
              Current: <code className="font-mono text-[11px]">{editing.effPath}</code>
            </p>
            <input
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              className="w-full rounded-lg border border-line bg-base px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
              placeholder={editing.effPath}
              onKeyUp={(event) => {
                if (event.key === 'Enter') void saveEdit();
              }}
            />
            <div className="flex justify-end gap-2.5 pt-1">
              <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg border border-line px-3.5 py-1.5 text-[13px] text-sub hover:text-fg" onClick={() => setEditing(null)}>Cancel</motion.button>
              <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-base hover:opacity-90" onClick={() => void saveEdit()}>Save</motion.button>
            </div>
          </div>
        </Modal>
      ) : null}
      </AnimatePresence>
    </div>
  );
}
