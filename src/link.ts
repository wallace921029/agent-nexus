import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * 链接引擎：所有分发动作统一走这里。
 *
 * - Linux/macOS：目录与文件都用符号链接（ln -s 等价）
 * - Windows：目录用 junction（免管理员）；文件符号链接需要“开发者模式”，
 *   无权限时按 copyFallback 退化为复制（记录进 .config/state.json 以便幂等刷新与安全收回）
 * - 目标位置已存在且不是我们创建的内容：默认 conflict 绝不覆盖；
 *   AGENTS.md 派发策略（2026-10-24 用户改定）传 takeover=true：他人文件改名
 *   <name>.backup-YYYYMMDDHHMMSS 留档后再接管
 */

export type ActionKind =
  | 'linked'
  | 'relinked'
  | 'kept'
  | 'copied'
  | 'kept-copy'
  | 'refreshed-copy'
  | 'takeover'
  | 'conflict'
  | 'skipped'
  | 'retracted'
  | 'not-ours'
  | 'would-link'
  | 'would-relink'
  | 'would-copy'
  | 'would-takeover'
  | 'would-conflict'
  | 'would-retract';

export interface LinkOutcome {
  kind: ActionKind;
  link: string;
  target?: string;
  detail?: string;
}

export interface LinkState {
  copies: Record<string, { source: string; hash: string }>;
}

const IS_WIN = process.platform === 'win32';

export function statePath(centerRoot: string): string {
  return path.join(centerRoot, '.config', 'state.json');
}

export function loadState(centerRoot: string): LinkState {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(centerRoot), 'utf8'));
    return { copies: raw.copies ?? {} };
  } catch {
    return { copies: {} };
  }
}

export function saveState(centerRoot: string, state: LinkState): void {
  fs.mkdirSync(path.dirname(statePath(centerRoot)), { recursive: true });
  fs.writeFileSync(statePath(centerRoot), JSON.stringify(state, null, 2) + '\n');
}

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function targetResolvable(p: string): Promise<boolean> {
  try {
    await fsp.stat(p);
    return true;
  } catch {
    return false;
  }
}

export interface LinkInspection {
  type: 'none' | 'symlink' | 'file' | 'dir';
  ours: boolean;
  target?: string;
  broken?: boolean;
}

/** 判断某个路径当前是不是“指向中心仓库的链接” */
export async function inspectLink(p: string, centerRoot: string): Promise<LinkInspection> {
  let st: fs.Stats;
  try {
    st = await fsp.lstat(p);
  } catch {
    return { type: 'none', ours: false };
  }
  if (st.isSymbolicLink()) {
    let raw: string;
    try {
      raw = await fsp.readlink(p);
    } catch {
      return { type: 'file', ours: false };
    }
    // Windows junction 的 readlink 结果可能带 \\?\ 前缀
    const cleaned = raw.replace(/^\\\\\?\\/, '');
    const target = path.resolve(path.dirname(p), cleaned);
    const root = path.resolve(centerRoot);
    const ours = target === root || target.startsWith(root + path.sep);
    return { type: 'symlink', ours, target, broken: !(await targetResolvable(p)) };
  }
  return { type: st.isDirectory() ? 'dir' : 'file', ours: false };
}

async function makeSymlink(kind: 'file' | 'dir', target: string, link: string): Promise<void> {
  if (IS_WIN) {
    // junction 免管理员；file 类型符号链接需要开发者模式
    await fsp.symlink(target, link, kind === 'dir' ? 'junction' : 'file');
  } else {
    await fsp.symlink(target, link);
  }
}

export interface EnsureOptions {
  kind: 'file' | 'dir';
  /** 仅对 file 生效：Windows 无符号链接权限时退化为复制 */
  copyFallback?: boolean;
  /** 目标位置是他人文件时：改名 <name>.backup-YYYYMMDDHHMMSS 留档后接管（AGENTS.md 派发策略） */
  takeover?: boolean;
  dryRun?: boolean;
  state?: LinkState;
  centerRoot: string;
}

/** 备份名：<原名>.backup-本地时间YYYYMMDDHHMMSS */
function backupName(p: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${p}.backup-${ts}`;
}

export async function ensureLink(target: string, link: string, opts: EnsureOptions): Promise<LinkOutcome> {
  const { kind, dryRun, centerRoot } = opts;
  const absTarget = path.resolve(target);
  const absLink = path.resolve(link);
  const info = await inspectLink(absLink, centerRoot);

  if (info.type === 'none') {
    if (dryRun) return { kind: 'would-link', link: absLink, target: absTarget };
    await fsp.mkdir(path.dirname(absLink), { recursive: true });
    try {
      await makeSymlink(kind, absTarget, absLink);
      return { kind: 'linked', link: absLink, target: absTarget };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (IS_WIN && kind === 'file' && (err.code === 'EPERM' || err.code === 'EACCES') && opts.copyFallback && opts.state) {
        try {
          await fsp.copyFile(absTarget, absLink);
        } catch (e2) {
          return { kind: 'skipped', link: absLink, detail: `copy also failed: ${(e2 as Error).message}` };
        }
        opts.state.copies[absLink] = { source: absTarget, hash: sha256(await fsp.readFile(absTarget)) };
        return { kind: 'copied', link: absLink, target: absTarget, detail: 'Windows Developer Mode not enabled; fell back to copy' };
      }
      return { kind: 'skipped', link: absLink, detail: err.message };
    }
  }

  if (info.type === 'symlink' && info.ours) {
    if (info.target === absTarget && !info.broken) {
      return { kind: 'kept', link: absLink, target: absTarget };
    }
    if (dryRun) {
      return { kind: 'would-relink', link: absLink, target: absTarget, detail: info.broken ? 'previous link broken, will recreate' : 'points to a stale artifact, will update' };
    }
    await fsp.unlink(absLink);
    await makeSymlink(kind, absTarget, absLink);
    return { kind: 'relinked', link: absLink, target: absTarget };
  }

  if (info.type === 'file' && opts.copyFallback && opts.state) {
    const prev = opts.state.copies[absLink];
    if (prev && prev.source === absTarget) {
      const current = sha256(await fsp.readFile(absLink));
      if (current !== prev.hash) {
        return { kind: 'conflict', link: absLink, detail: 'file was copied by us but edited manually since; not overwriting' };
      }
      const next = sha256(await fsp.readFile(absTarget));
      if (next === prev.hash) {
        return { kind: 'kept-copy', link: absLink, target: absTarget };
      }
      if (dryRun) {
        return { kind: 'would-copy', link: absLink, target: absTarget };
      }
      await fsp.copyFile(absTarget, absLink);
      opts.state.copies[absLink] = { source: absTarget, hash: next };
      return { kind: 'refreshed-copy', link: absLink, target: absTarget, detail: 'source updated; copy refreshed' };
    }
  }

  // AGENTS.md 派发策略：他人文件 → 改名备份后接管（失败则回滚还原）
  if (opts.takeover && info.type === 'file') {
    const backup = backupName(absLink);
    if (dryRun) {
      return { kind: 'would-takeover', link: absLink, target: absTarget, detail: `would move the existing file to ${path.basename(backup)}, then link ours` };
    }
    await fsp.rename(absLink, backup);
    try {
      await makeSymlink(kind, absTarget, absLink);
    } catch (e) {
      try {
        await fsp.rename(backup, absLink);
      } catch {
        /* 还原失败也只能如实报告 */
      }
      return { kind: 'skipped', link: absLink, detail: `takeover failed, original kept: ${(e as Error).message}` };
    }
    return { kind: 'takeover', link: absLink, target: absTarget, detail: `existing file backed up to ${path.basename(backup)}` };
  }

  return {
    kind: dryRun ? 'would-conflict' : 'conflict',
    link: absLink,
    detail: 'target location already holds non-agent-nexus content; skipped by policy',
  };
}

export async function retractLink(link: string, centerRoot: string, state: LinkState, dryRun = false): Promise<LinkOutcome> {
  const absLink = path.resolve(link);
  const info = await inspectLink(absLink, centerRoot);

  if (info.type === 'symlink' && info.ours) {
    if (dryRun) return { kind: 'would-retract', link: absLink };
    await fsp.unlink(absLink);
    return { kind: 'retracted', link: absLink };
  }

  const prev = state.copies[absLink];
  if (info.type === 'file' && prev) {
    const current = sha256(await fsp.readFile(absLink));
    if (current !== prev.hash) {
      return { kind: 'not-ours', link: absLink, detail: 'copy has been edited manually; not deleting' };
    }
    if (dryRun) return { kind: 'would-retract', link: absLink };
    await fsp.unlink(absLink);
    delete state.copies[absLink];
    return { kind: 'retracted', link: absLink, detail: 'deleted copy-mode file' };
  }

  return { kind: 'not-ours', link: absLink, detail: 'not created by agent-nexus; left untouched' };
}
