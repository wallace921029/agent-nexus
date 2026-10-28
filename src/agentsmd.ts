import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { enabledTargets, loadConfig } from './config.js';
import { ensureLink, inspectLink, loadState, retractLink, saveState, type LinkOutcome, type LinkState } from './link.js';
import { homeDir } from './paths.js';
import { distributableTarget } from './detect.js';
import { renderInstruction } from './render.js';
import { effectiveTarget, AGENTS_REF_FILE, AGENTS_REF_OLD_LINE, type EffectiveTarget } from './targets.js';
import type { TargetId } from './targets.js';

export interface SyncRow extends LinkOutcome {
  id: TargetId | '-';
  label: string;
  render?: { bytes: number; overlayUsed: boolean };
}

export interface SyncOptions {
  only?: TargetId[];
  dryRun?: boolean;
  force?: boolean;
  retract?: boolean;
}

/** 该工具的引用行：绝对 ~/ 路径形式的 @ 导入（相对工作目录解析不可靠，Claude 官方示例亦用绝对路径） */
function refLineFor(t: EffectiveTarget): string {
  const rel = path.relative(homeDir(), t.instr.path).split(path.sep).join('/');
  return `@~/${rel}`;
}

/**
 * agentsRef（claude / claude-desktop）的引用文件处理：
 * CLAUDE.md 不存在 → 创建 `@~/…/AGENTS.md` 引用；旧方案的我方 CLAUDE.md 软链或旧版相对引用行 → 迁移；
 * 他人文件一律不动。返回追加到行 detail 的说明。
 */
async function ensureRefFile(t: EffectiveTarget, centerRoot: string, dryRun: boolean): Promise<string> {
  const refP = t.instr.refPath;
  if (!refP) return '';
  const line = refLineFor(t);
  const write = (): void => {
    fs.mkdirSync(path.dirname(refP), { recursive: true });
    fs.writeFileSync(refP, line + '\n');
  };
  const info = await inspectLink(refP, centerRoot);
  if (info.type === 'none') {
    if (!dryRun) write();
    return dryRun ? `would create ${path.basename(refP)} with "${line}"` : `created ${path.basename(refP)} with "${line}"`;
  }
  if (info.type === 'symlink' && info.ours) {
    if (!dryRun) {
      await fsp.unlink(refP);
      write();
    }
    return dryRun ? `would migrate our old ${path.basename(refP)} link to a "${line}" reference` : `migrated old ${path.basename(refP)} link → "${line}" reference`;
  }
  if (info.type === 'file') {
    const content = fs.readFileSync(refP, 'utf8').trim();
    if (content === line) return `${path.basename(refP)} already references ${AGENTS_REF_FILE}`;
    if (content === AGENTS_REF_OLD_LINE) {
      if (!dryRun) write();
      return dryRun ? `would migrate ${path.basename(refP)} from "${AGENTS_REF_OLD_LINE}" to the absolute "${line}"` : `migrated ${path.basename(refP)} → "${line}"`;
    }
  }
  return `${path.basename(refP)} already exists — left untouched`;
}

/** 收回 agentsRef：引用文件仅当内容正好是我们的引用行（现行或旧版）时删除 */
function retractRefFile(t: EffectiveTarget, dryRun: boolean): string {
  const refP = t.instr.refPath;
  if (!refP || !fs.existsSync(refP)) return '';
  try {
    const content = fs.readFileSync(refP, 'utf8').trim();
    if (content !== refLineFor(t) && content !== AGENTS_REF_OLD_LINE) return `${path.basename(refP)} kept (content is not our reference)`;
    if (!dryRun) fs.rmSync(refP);
    return dryRun ? `would remove ${path.basename(refP)} reference` : `removed ${path.basename(refP)} reference`;
  } catch {
    return '';
  }
}

/** 渲染 AGENTS.md 并下发（软链，Windows 无权限时复制）；已有他人文件按策略改名备份后接管；--retract 收回 */
export async function syncAgents(centerRoot: string, opts: SyncOptions = {}): Promise<SyncRow[]> {
  const cfg = loadConfig(centerRoot);
  const state = loadState(centerRoot);
  const home = homeDir();
  const rows: SyncRow[] = [];

  for (const def of enabledTargets(cfg)) {
    if (opts.only?.length && !opts.only.includes(def.id)) continue;
    const t = effectiveTarget(home, def, cfg.targets[def.id]);

    if (!t.supports.instructions) {
      rows.push({ id: def.id, label: t.label, kind: 'skipped', link: '', detail: 'not distributable for this tool (see notes)' });
      continue;
    }

    // 分发门槛：探测不到已安装且配置目录也不存在才跳过（残留目录 = 可操作，npx 按需启动的工具目录是活的）
    if (!distributableTarget(t.probe, t.installDir) && !opts.force) {
      rows.push({
        id: def.id,
        label: t.label,
        kind: 'skipped',
        link: t.installDir,
        detail: 'tool not detected as installed (no CLI on PATH / app found, no config dir), skipped; add --force to distribute anyway',
      });
      continue;
    }

    if (opts.retract) {
      const res = await retractLink(t.instr.path, centerRoot, state, opts.dryRun);
      const extra = t.instr.kind === 'agentsRef' ? retractRefFile(t, !!opts.dryRun) : '';
      rows.push({ id: def.id, label: t.label, ...res, detail: [res.detail, extra].filter(Boolean).join('; ') || undefined });
      continue;
    }

    const render = renderInstruction(centerRoot, t);
    const res = await ensureLink(render.file, t.instr.path, {
      kind: 'file',
      copyFallback: true,
      takeover: true,
      dryRun: opts.dryRun,
      state,
      centerRoot,
    });

    const row: SyncRow = {
      id: def.id,
      label: t.label,
      ...res,
      render: { bytes: render.bytes, overlayUsed: render.overlayUsed },
    };
    const extras: string[] = [];
    if (res.detail) extras.push(res.detail);
    if (t.instr.kind === 'agentsRef') {
      const refNote = await ensureRefFile(t, centerRoot, !!opts.dryRun);
      if (refNote) extras.push(refNote);
    }
    if (def.id === 'codex' && render.bytes > 32 * 1024) {
      extras.push(`rendered artifact ${(render.bytes / 1024).toFixed(1)}KiB exceeds the codex 32KiB limit and will be truncated`);
    }
    row.detail = extras.join('; ') || undefined;
    rows.push(row);
  }

  if (!opts.dryRun) saveState(centerRoot, state);
  return rows;
}
