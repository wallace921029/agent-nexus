import * as fs from 'node:fs';
import * as path from 'node:path';
import { enabledTargets, loadConfig } from './config.js';
import { ensureLink, inspectLink, loadState, retractLink, saveState, type LinkOutcome } from './link.js';
import { homeDir } from './paths.js';
import { effectiveTarget } from './targets.js';
import type { TargetId } from './targets.js';

export interface SkillsRow extends LinkOutcome {
  id: TargetId | '-';
  skill: string;
}

export interface SkillsOptions {
  skills?: string[];
  targets?: TargetId[];
  retract?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

/** 中心里的 skills 列表（skills/<名称>/SKILL.md） */
export function listSkills(centerRoot: string): string[] {
  const dir = path.join(centerRoot, 'skills');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

/** 链接矩阵：选中 skill × 选中目标，逐格创建/收回目录链接 */
export async function applySkills(centerRoot: string, opts: SkillsOptions = {}): Promise<SkillsRow[]> {
  const cfg = loadConfig(centerRoot);
  const state = loadState(centerRoot);
  const home = homeDir();
  const rows: SkillsRow[] = [];
  const defs = enabledTargets(cfg).filter((t) => !opts.targets?.length || opts.targets!.includes(t.id));

  // 不支持 skills 的目标（如 Claude Desktop）直接说明并跳过
  const actionable = defs.filter((d) => effectiveTarget(home, d, cfg.targets[d.id]).supports.skills);
  const skippedUnsupported = defs
    .filter((d) => !actionable.includes(d))
    .map((d) => ({ id: d.id, skill: '-', kind: 'skipped' as const, link: '', detail: 'not distributable for this tool (see notes)' }));

  if (opts.retract) {
    // 收回不依赖中心清单：从目标目录一侧枚举我们的链接，
    // 这样中心里已删除的 skill 留下的悬空链接也能收回
    const wanted = opts.skills ?? [];
    for (const def of actionable) {
      const t = effectiveTarget(home, def, cfg.targets[def.id]);
      if (!fs.existsSync(t.installDir) && !opts.force) {
        rows.push({
          id: def.id,
          skill: '-',
          kind: 'skipped',
          link: t.installDir,
          detail: 'tool directory not found (treated as not installed), skipped; add --force to retract anyway',
        });
        continue;
      }
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(t.skillsDir, { withFileTypes: true });
      } catch {
        /* 目录尚不存在 */
      }
      let any = false;
      for (const e of entries) {
        if (!e.isDirectory() && !e.isSymbolicLink()) continue;
        const p = path.join(t.skillsDir, e.name);
        const info = await inspectLink(p, centerRoot);
        if (!(info.type === 'symlink' && info.ours)) continue;
        if (wanted.length && !wanted.includes(e.name)) continue;
        any = true;
        rows.push({ id: def.id, skill: e.name, ...(await retractLink(p, centerRoot, state, opts.dryRun)) });
      }
      if (!any) {
        rows.push({ id: def.id, skill: '-', kind: 'skipped', link: t.skillsDir, detail: 'no links to retract' });
      }
    }
    rows.push(...skippedUnsupported);
    if (!opts.dryRun) saveState(centerRoot, state);
    return rows;
  }

  const allSkills = listSkills(centerRoot);
  if (allSkills.length === 0) {
    return [
      {
        id: '-',
        skill: '-',
        kind: 'skipped',
        link: path.join(centerRoot, 'skills'),
        detail: 'no skills in the center yet (expected skills/<name>/SKILL.md)',
      },
    ];
  }

  const skillNames = opts.skills?.length ? allSkills.filter((s) => opts.skills!.includes(s)) : allSkills;
  for (const wanted of opts.skills ?? []) {
    if (!allSkills.includes(wanted)) {
      rows.push({ id: '-', skill: wanted, kind: 'skipped', link: '-', detail: `skill not found in center: ${wanted}` });
    }
  }

  for (const def of actionable) {
    const t = effectiveTarget(home, def, cfg.targets[def.id]);
    if (!fs.existsSync(t.installDir) && !opts.force) {
      rows.push({
        id: def.id,
        skill: '-',
        kind: 'skipped',
        link: t.installDir,
        detail: 'tool directory not found (treated as not installed), skipped; add --force to link anyway',
      });
      continue;
    }
    for (const s of skillNames) {
      const target = path.join(centerRoot, 'skills', s);
      const link = path.join(t.skillsDir, s);
      const res = await ensureLink(target, link, { kind: 'dir', dryRun: opts.dryRun, centerRoot });
      rows.push({ id: def.id, skill: s, ...res });
    }
  }

  rows.push(...skippedUnsupported);
  if (!opts.dryRun) saveState(centerRoot, state);
  return rows;
}
