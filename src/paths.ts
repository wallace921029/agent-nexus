import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** 家目录。测试钩子：设置 NEXUS_HOME 可重定向到沙箱目录 */
export function homeDir(): string {
  const override = process.env.NEXUS_HOME;
  return override ? path.resolve(override) : os.homedir();
}

/** 把 POSIX 风格相对路径（如 .claude/skills）转换为当前平台的绝对路径 */
export function toPlatformPath(home: string, rel: string): string {
  return path.join(home, ...rel.split('/'));
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.stat(p);
    return true;
  } catch {
    return false;
  }
}

/** 中心工作区默认位置：~/.agent-nexus（受 NEXUS_HOME 影响，便于沙箱测试） */
export function defaultCenter(): string {
  return path.join(homeDir(), '.agent-nexus');
}

/**
 * 中心工作区解析顺序：--center 参数 > NEXUS_CENTER 环境变量 > ~/.agent-nexus（已初始化）。
 * 初始化标记：AGENTS.md / mcp.json / .config 任一存在即视为已初始化。
 */
export function findCenterRoot(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  if (process.env.NEXUS_CENTER) return path.resolve(process.env.NEXUS_CENTER);
  const def = defaultCenter();
  const initialized =
    fs.existsSync(path.join(def, 'AGENTS.md')) ||
    fs.existsSync(path.join(def, 'mcp.json')) ||
    fs.existsSync(path.join(def, '.config'));
  if (initialized) return def;
  throw new Error(
    `Center workspace not found: ~/.agent-nexus is not initialized. Run agent-nexus init first (or set --center / NEXUS_CENTER)`
  );
}
