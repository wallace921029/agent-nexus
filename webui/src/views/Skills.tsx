import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { log, refresh, useStore } from '../lib/store';
import { listContainerVariants, listItemVariants, sectionVariants } from '../lib/animation';
import { postLinkSkills, postTargetPaths, type Row, type CellState, type TargetStatus } from '../lib/api';
import Modal from '../components/Modal';
import Ic from '../components/Ic';
import { confirmDialog } from '../components/ui/UiAlertDialog';
import UninstalledFold from '../components/UninstalledFold';
import { LOGOS } from '../lib/logos';

/* 设计：主从两栏（同 AGENTS.md 模块的卡片语言）
   - 左：工具纵向列表（大 logo + 名称 + linked 计数），点击选中
   - 右：选中工具的技能清单，逐个 Distribute / Retract
   - 无全局统计、无 New skill（技能文件在 Files 模块里创建） */

function rowsToLog(rows: Row[]): void {
  for (const row of rows) {
    log(`${row.kind} [${row.id}] ${row.skill ?? ''}${row.detail ? ' — ' + row.detail : ''}`, row.kind === 'conflict' ? 'err' : 'ok');
  }
}

function skillPill(state: CellState | undefined): { cls: string; text: string } {
  switch (state) {
    case 'linked':
      return { cls: 'border-ok/40 bg-ok/10 text-ok', text: 'linked ✓' };
    case 'broken':
      return { cls: 'border-err/40 bg-err/10 text-err', text: 'broken' };
    case 'foreign':
      return { cls: 'border-warn/40 bg-warn/10 text-warn', text: 'foreign' };
    default:
      return { cls: 'border-line text-sub/70', text: 'not linked' };
  }
}

// 不支持本地下发的工具：优先展示 notes 里与 skills 相关的那条
const unsupportedNote = (target: TargetStatus): string =>
  target.eff.notes?.find((note) => note.toLowerCase().includes('skill')) ??
  'Skills are managed inside the app itself; agent-nexus only distributes MCP here.';

interface EditDir {
  id: string;
  label: string;
  effPath: string;
}

export default function Skills() {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [selected, setSelected] = useState('');
  const [editDir, setEditDir] = useState<EditDir | null>(null);
  const [editDirValue, setEditDirValue] = useState('');

  const targets = store.state?.status.targets ?? [];
  // 已安装在前，未安装沉底折叠；默认选中优先落在已安装的工具上
  const installedTargets = targets.filter((target) => target.installed);
  const missingTargets = targets.filter((target) => !target.installed);
  const current =
    targets.find((target) => target.eff.id === selected) ??
    installedTargets.find((target) => target.eff.supports.skills) ??
    targets.find((target) => target.eff.supports.skills) ??
    targets[0];

  function toolButton(target: TargetStatus) {
    return (
      <motion.button
        type="button" whileTap={{ scale: 0.98 }}
        key={target.eff.id}
        variants={listItemVariants}
        whileHover={{ x: 2 }}
        className={[
          'flex w-full items-center gap-3.5 rounded-xl border bg-panel px-4 py-3 text-left transition-colors hover:border-line2',
          current?.eff.id === target.eff.id ? 'row-sel border-accent/50 bg-accent/[0.06]' : 'border-line',
          !target.eff.supports.skills ? 'opacity-55' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => setSelected(target.eff.id)}
      >
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-panel2 p-1.5">
          <img src={LOGOS[target.eff.id]} className="h-full w-full rounded-sm object-contain" alt="" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold">{target.eff.label}</span>
            {target.eff.customized ? <span className="rounded bg-accent/12 px-1.5 py-0.5 text-[10px] text-accent">custom dir</span> : null}
          </div>
          <div className="mt-0.5 text-[11px] text-sub/75">
            {target.eff.supports.skills ? `${linkedCount(target)} / ${skills.length} linked` : 'skills not distributable'}
          </div>
        </div>
        {!target.installed ? (
          <span className="flex-none text-[10.5px] text-sub/60">not installed{target.residual ? ' · config remains' : ''}</span>
        ) : null}
      </motion.button>
    );
  }
  const skills = store.state?.skills ?? [];
  const cell = (target: string, skill: string): CellState | undefined => store.state?.status.skillsMatrix[target]?.[skill];
  const linkedCount = (target: TargetStatus): number => skills.filter((skill) => cell(target.eff.id, skill) === 'linked').length;

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

  // 单个技能 × 当前工具
  const toggleSkill = (skill: string, target: TargetStatus, linked: boolean) =>
    run(async () => {
      const { rows } = await postLinkSkills({ skills: [skill], targets: [target.eff.id], retract: linked });
      rowsToLog(rows);
      await refresh();
    });

  // 当前工具整组派发 / 收回
  const distributeTool = (target: TargetStatus) =>
    run(async () => {
      if (!skills.length) return;
      if (
        !(await confirmDialog({
          title: `Distribute ALL skills to ${target.eff.label}?`,
          description: 'Every center skill is symlinked into this tool; foreign entries are never touched.',
          confirmText: 'Distribute all',
        }))
      )
        return;
      const { rows } = await postLinkSkills({ skills: [...skills], targets: [target.eff.id] });
      rowsToLog(rows);
      await refresh();
    });

  const retractTool = (target: TargetStatus) =>
    run(async () => {
      if (!skills.length) return;
      if (
        !(await confirmDialog({
          title: `Retract ALL skill links from ${target.eff.label}?`,
          confirmText: 'Retract all',
          tone: 'destructive',
        }))
      )
        return;
      const { rows } = await postLinkSkills({ skills: [...skills], targets: [target.eff.id], retract: true });
      rowsToLog(rows);
      await refresh();
    });

  function openEditDir(target: TargetStatus): void {
    const settings = store.state?.targetSettings?.[target.eff.id] ?? {};
    setEditDir({ id: target.eff.id, label: target.eff.label, effPath: target.eff.skillsDir });
    setEditDirValue((settings.skillsDir as string | null | undefined) ?? '');
  }

  const saveEditDir = () =>
    run(async () => {
      const currentEdit = editDir;
      if (!currentEdit) return;
      const value = editDirValue.trim();
      const { detail } = await postTargetPaths({ id: currentEdit.id, key: 'skillsDir', value: value === '' ? null : value });
      log(detail, 'ok');
      setEditDir(null);
      await refresh();
    });

  if (!store.state) return <div className="py-20 text-center text-sub">Loading…</div>;

  return (
    <div className="space-y-4">
      {/* 顶栏：标题（无全局动作，操作都在右侧详情里） */}
      <motion.div variants={sectionVariants} initial="hidden" animate="visible">
        <h2 className="text-base font-semibold">Skills distribution</h2>
        <p className="mt-0.5 text-[12px] text-sub">
          Pick a tool, then distribute or retract each skill individually. Links are symlinks into the tool's native skills dir — foreign entries are never touched.
        </p>
      </motion.div>

      {/* 主从两栏：左列工具卡与右侧面板各自独立（v2 分离版式） */}
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* 左：工具纵向列表（已安装在前，未安装沉底折叠） */}
        <motion.div className="space-y-2" variants={listContainerVariants} initial="hidden" animate="visible">
          {installedTargets.map(toolButton)}
          {missingTargets.length ? (
            <UninstalledFold count={missingTargets.length}>{missingTargets.map(toolButton)}</UninstalledFold>
          ) : null}
        </motion.div>

        {/* 右：选中工具的技能面板 */}
        <AnimatePresence mode="wait">
        {current ? (
          <motion.div key={current.eff.id} className="min-w-0 rounded-xl border border-line bg-panel" variants={sectionVariants} initial="hidden" animate="visible" exit="exit">
            {/* 详情头 */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <img src={LOGOS[current.eff.id]} className="h-4.5 w-4.5 rounded-sm object-contain" alt="" />
                  <span className="text-[14px] font-semibold">{current.eff.label}</span>
                  {current.eff.supports.skills ? (
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${linkedCount(current) ? 'border-ok/40 bg-ok/10 text-ok' : 'border-line text-sub/70'}`}>
                      {linkedCount(current)} / {skills.length} linked
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11.5px] text-sub/80" title={current.eff.skillsDir}>
                  {current.eff.supports.skills ? current.eff.skillsDir : '—'}
                </div>
              </div>
              {current.eff.supports.skills ? (
                <div className="flex items-center gap-1.5">
                  <motion.button
                    type="button" whileTap={{ scale: 0.98 }}
                    className="rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[11.5px] text-sub transition-colors hover:border-accent/60 hover:text-accent"
                    disabled={busy || !skills.length || (!current.installed && !current.residual)}
                    onClick={() => void distributeTool(current)}
                  >
                    Distribute all
                  </motion.button>
                  <motion.button
                    type="button" whileTap={{ scale: 0.98 }}
                    className="rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[11.5px] text-sub transition-colors hover:border-err/60 hover:text-err"
                    disabled={busy || !skills.length || (!current.installed && !current.residual)}
                    onClick={() => void retractTool(current)}
                  >
                    Retract all
                  </motion.button>
                  <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg p-1.5 text-sub/60 transition-colors hover:text-accent" title="Custom skills dir" onClick={() => openEditDir(current)}>
                    <Ic name="edit" />
                  </motion.button>
                </div>
              ) : null}
            </div>

            {/* 不支持 skills 的工具 */}
            {!current.eff.supports.skills ? (
              <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-panel2 text-sub"><Ic name="blocks" /></div>
                <div>
                  <div className="text-[14px] font-medium">Local skill distribution isn't available for this tool</div>
                  <div className="mt-1 text-[12px] text-sub/75">{unsupportedNote(current)}</div>
                </div>
              </div>
            ) : !skills.length ? (
              /* 中心还没有任何技能 */
              <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-panel2 text-sub"><Ic name="folder" /></div>
                <div>
                  <div className="text-[14px] font-medium">No skills in the center yet</div>
                  <div className="mt-1 text-[12px] text-sub/75">Create <code className="font-mono">~/.agent-nexus/skills/&lt;name&gt;/SKILL.md</code> in the Files module, then distribute here.</div>
                </div>
              </div>
            ) : (
              /* 技能清单：逐个派发 / 收回 */
              <div className="space-y-1.5 p-3">
                {skills.map((skill, index) => {
                  const skillState = cell(current.eff.id, skill);
                  const statePill = skillPill(skillState);
                  return (
                    <motion.div
                      layout
                      key={skill}
                      variants={listItemVariants}
                      initial="hidden"
                      animate="visible"
                      custom={index}
                      className="flex items-center gap-3 rounded-lg border border-line/60 bg-panel2/40 px-3.5 py-2.5 transition-colors hover:border-line2"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]" title={skill}>{skill}</span>
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${statePill.cls}`}>
                        {statePill.text}
                      </span>
                      {skillState !== 'foreign' ? (
                        skillState === 'linked' ? (
                          <motion.button
                            type="button" whileTap={{ scale: 0.98 }}
                            className="rounded-lg border border-line bg-transparent px-2.5 py-1 text-[11.5px] text-sub transition-colors hover:border-err/60 hover:text-err"
                            disabled={busy}
                            onClick={() => void toggleSkill(skill, current, true)}
                          >
                            Retract
                          </motion.button>
                        ) : (
                          <motion.button
                            type="button" whileTap={{ scale: 0.98 }}
                            className="rounded-lg border border-line bg-transparent px-2.5 py-1 text-[11.5px] text-sub transition-colors hover:border-accent/60 hover:text-accent"
                            disabled={busy}
                            onClick={() => void toggleSkill(skill, current, false)}
                          >
                            {skillState === 'broken' ? 'Re-link' : 'Distribute'}
                          </motion.button>
                        )
                      ) : null}
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* 图例 */}
            {current.eff.supports.skills && skills.length ? (
              <div className="border-t border-line px-5 py-3 text-[11px] text-sub/75">
                linked = symlink into the center · foreign = exists but not ours (never touched) · broken = re-link to fix
              </div>
            ) : null}
          </motion.div>
        ) : null}
        </AnimatePresence>
      </div>

      {/* 自定义 skills 目录弹窗 */}
      <AnimatePresence>
      {editDir ? (
        <Modal key="skills-dir" title={`${editDir.label} · custom skills dir`} onClose={() => setEditDir(null)}>
          <div className="space-y-3">
            <p className="text-[12px] text-sub">
              Accepts home-relative, <code className="font-mono">~/</code>, or absolute paths; save empty = reset to default.<br />
              Current: <code className="font-mono text-[11px]">{editDir.effPath}</code>
            </p>
            <input
              value={editDirValue}
              onChange={(event) => setEditDirValue(event.target.value)}
              className="w-full rounded-lg border border-line bg-base px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
              placeholder={editDir.effPath}
              onKeyUp={(event) => {
                if (event.key === 'Enter') void saveEditDir();
              }}
            />
            <div className="flex justify-end gap-2.5 pt-1">
              <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg border border-line px-3.5 py-1.5 text-[13px] text-sub hover:text-fg" onClick={() => setEditDir(null)}>Cancel</motion.button>
              <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-base hover:opacity-90" onClick={() => void saveEditDir()}>Save</motion.button>
            </div>
          </div>
        </Modal>
      ) : null}
      </AnimatePresence>
    </div>
  );
}
