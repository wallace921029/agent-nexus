import * as fs from 'node:fs';
import * as path from 'node:path';
import { homeDir } from './paths.js';
import type { InstallProbe } from './targets.js';

/** “已安装”探测：命令在 PATH/常见 bin 目录上、或应用安装位置存在，任一命中即视为已安装。
    纯文件系统检查（不 spawn 子进程），每次状态收集实时执行，无性能负担。 */

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
// Windows 上 npm 全局命令是 .cmd/.bat 垫片，原生程序是 .exe；其他平台无后缀
const EXTS = IS_WIN ? ['', '.exe', '.cmd', '.bat'] : [''];

/** 命令检索目录：PATH 之外补充常见用户级/包管理器 bin。
    GUI/LaunchAgent 启动的进程 PATH 往往不含这些位置，只查 PATH 会漏检。 */
function binDirs(): string[] {
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const home = homeDir();
  const extra = [
    path.join(home, '.local', 'bin'), // pipx、claude 原生安装器等
    path.join(home, '.npm-global', 'bin'), // 常见自定义 npm prefix
    path.join(home, 'bin'),
  ];
  if (IS_MAC) extra.push('/opt/homebrew/bin', '/usr/local/bin'); // Apple Silicon / Intel brew
  if (IS_WIN) extra.push(path.join(home, 'AppData', 'Roaming', 'npm')); // Windows npm 全局 bin 默认位置
  return [...new Set([...pathDirs, ...extra])];
}

export function commandOnPath(command: string): boolean {
  return binDirs().some((dir) => EXTS.some((ext) => fs.existsSync(path.join(dir, command + ext))));
}

/** 应用路径展开：支持 ~ / ~/ 前缀 */
function expandAppPath(p: string): string {
  const home = homeDir();
  if (p === '~') return home;
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(home, p.slice(2));
  return p;
}

/** Windows 路径展开：%LOCALAPPDATA% 等环境变量；未定义的变量展开为空串（探测自然落空） */
function expandWindows(p: string): string {
  return p.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? '');
}

/** 命中任一探测点 → 已安装；probe 缺省或当前平台没有候选（如 Linux 上的纯桌面应用）→ 回退目录存在性（旧行为） */
export function probeInstalled(probe: InstallProbe | undefined, installDir: string): boolean {
  if (!probe) return fs.existsSync(installDir);
  const hits: boolean[] = [];
  for (const command of probe.commands ?? []) hits.push(commandOnPath(command));
  if (IS_MAC) for (const app of probe.macApps ?? []) hits.push(fs.existsSync(expandAppPath(app)));
  if (IS_WIN) for (const p of probe.winPaths ?? []) hits.push(fs.existsSync(expandAppPath(expandWindows(p))));
  if (hits.length === 0) return fs.existsSync(installDir);
  return hits.some(Boolean);
}
