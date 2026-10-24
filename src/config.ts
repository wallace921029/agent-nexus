import * as fs from 'node:fs';
import * as path from 'node:path';
import { TARGETS, TARGET_IDS, type TargetDef, type TargetId, type TargetPathOverride } from './targets.js';

/**
 * 中心工作区布局（~/.agent-nexus）：
 *   AGENTS.md        指令公共底座（用户内容）
 *   overlays/*.md    各家专属片段（用户内容，可选）
 *   skills/          skill 源（用户内容）
 *   mcp.json         标准 mcpServers 格式的 MCP 服务器清单（用户内容）
 *   .config/         项目自身：可选 config.json（目标开关/路径覆盖/mcpProfiles）、build/、state.json、mcp-logs/
 */

/** MCP 上游定义：stdio 子进程 或 Streamable HTTP 远程 */
export interface McpUpstream {
  type: 'stdio' | 'http';
  /** stdio：要拉起的命令 */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** http：远程地址 */
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
}

/** profile：'*' 表示全部上游，否则为指定名字列表 */
export interface McpProfile {
  upstreams: string[] | '*';
}

export interface McpConfig {
  upstreams: Record<string, McpUpstream>;
  profiles: Record<string, McpProfile>;
}

export interface NexusConfig {
  version: number;
  targets: Partial<Record<TargetId, TargetPathOverride & { enabled: boolean }>>;
  windows: { fileLinkMode: 'auto' | 'symlink' | 'copy' };
  mcp: McpConfig;
}

export const DEFAULT_MCP: McpConfig = {
  upstreams: {},
  profiles: { default: { upstreams: '*' } },
};

export function mcpConfigPath(centerRoot: string): string {
  return path.join(centerRoot, 'mcp.json');
}

export function settingsPath(centerRoot: string): string {
  return path.join(centerRoot, '.config', 'config.json');
}

function readJsonSafe(p: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** 标准 mcpServers 条目（Claude 等工具同款）→ 内部上游定义 */
function parseServers(raw: Record<string, any> | undefined): Record<string, McpUpstream> {
  const out: Record<string, McpUpstream> = {};
  for (const [name, e] of Object.entries(raw ?? {})) {
    const entry = (e ?? {}) as Record<string, any>;
    if (entry.type === 'http' || (!entry.command && entry.url)) {
      out[name] = { type: 'http', url: entry.url, headers: entry.headers, disabled: entry.disabled };
    } else {
      out[name] = { type: 'stdio', command: entry.command, args: entry.args, env: entry.env, cwd: entry.cwd, disabled: entry.disabled };
    }
  }
  return out;
}

/** profiles 配置 → 内部 profile：值为 '*'、名字数组，或旧版 { upstreams: ... } 包装 */
function parseProfiles(raw: unknown): Record<string, McpProfile> {
  const out: Record<string, McpProfile> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    const u = ((v as any)?.upstreams ?? v) as unknown;
    out[name] = { upstreams: u === '*' ? '*' : Array.isArray(u) ? u.map(String) : [] };
  }
  return out;
}

export function loadConfig(centerRoot: string): NexusConfig {
  // 目标开关/路径覆盖/windows/mcpProfiles：可选的 .config/config.json（不存在=全默认）
  const settings = readJsonSafe(settingsPath(centerRoot)) ?? {};
  const cfg: NexusConfig = {
    version: 1,
    targets: {},
    windows: { fileLinkMode: 'auto', ...(settings.windows ?? {}) },
    mcp: structuredClone(DEFAULT_MCP),
  };
  for (const id of TARGET_IDS) {
    cfg.targets[id] = { enabled: true, ...(settings.targets?.[id] ?? {}) };
  }
  // 根目录 mcp.json：标准 mcpServers 格式（兼容旧版 upstreams 键）
  const mcpRaw = readJsonSafe(mcpConfigPath(centerRoot));
  // profiles 属于项目自身配置：.config/config.json 的 mcpProfiles（兼容旧版根目录 profiles 键）
  const settingProfiles = parseProfiles(settings.mcpProfiles);
  const legacyProfiles = mcpRaw ? parseProfiles(mcpRaw.profiles) : {};
  cfg.mcp = {
    upstreams: parseServers(mcpRaw?.mcpServers ?? mcpRaw?.upstreams),
    profiles: Object.keys(settingProfiles).length ? settingProfiles : legacyProfiles,
  };
  if (!cfg.mcp.profiles.default) cfg.mcp.profiles.default = { upstreams: '*' };
  return cfg;
}

/** 面板展示用：mcp.json 语法错误 / 旧格式迁移提示 / 内容校验（空数组=无问题） */
export function mcpJsonIssues(centerRoot: string, cfg: NexusConfig): string[] {
  const p = mcpConfigPath(centerRoot);
  if (!fs.existsSync(p)) return validateMcpConfig(cfg.mcp);
  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return [`mcp.json is not valid JSON — ${(e as Error).message}`];
  }
  const issues: string[] = [];
  if (!('mcpServers' in raw)) {
    if ('upstreams' in raw || 'profiles' in raw) {
      issues.push(
        'mcp.json uses the legacy { "upstreams": …, "profiles": … } format — rename the server map to "mcpServers" and move profiles to "mcpProfiles" in .config/config.json (legacy format still works)'
      );
    } else {
      issues.push('mcp.json has no "mcpServers" object — add one (standard MCP config format, same as Claude\'s)');
    }
  }
  issues.push(...validateMcpConfig(cfg.mcp));
  return issues;
}

/** 修改某个目标的设置（enabled / 路径覆盖），写入可选的 .config/config.json */
export function updateTargetSettings(
  centerRoot: string,
  id: TargetId,
  patch: { enabled?: boolean; skillsDir?: string | null; instructions?: TargetPathOverride['instructions']; mcpConfig?: string | null }
): void {
  const p = settingsPath(centerRoot);
  const raw = readJsonSafe(p) ?? {};
  raw.targets = raw.targets ?? {};
  const cur = raw.targets[id] ?? {};
  const next: any = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  raw.targets[id] = next;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(raw, null, 2) + '\n');
}

/** 修改某个 profile 的服务器子集（面板开关用），写入可选的 .config/config.json 的 mcpProfiles */
export function updateMcpProfile(centerRoot: string, profile: string, upstreams: string[]): void {
  const p = settingsPath(centerRoot);
  const raw = readJsonSafe(p) ?? {};
  raw.mcpProfiles = raw.mcpProfiles ?? {};
  raw.mcpProfiles[profile] = upstreams;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(raw, null, 2) + '\n');
}

/** 独立 mcp 配置文件（测试或免中心场景）：{ "mcpServers": {...}, "mcpProfiles": {...} } */
export function loadStandaloneMcpConfig(file: string): McpConfig {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    upstreams: parseServers(raw.mcpServers ?? raw.upstreams),
    profiles: { default: { upstreams: '*' }, ...parseProfiles(raw.mcpProfiles ?? raw.profiles) },
  };
}

export function enabledTargets(cfg: NexusConfig): TargetDef[] {
  // 统一按显示名字母排序，所有模块（状态/面板/分发顺序）共用
  return TARGETS.filter((t) => cfg.targets[t.id]?.enabled !== false).sort((a, b) => a.label.localeCompare(b.label));
}

/** 校验 mcp 配置，返回错误信息列表（空数组=合法） */
export function validateMcpConfig(mcp: McpConfig): string[] {
  const errs: string[] = [];
  for (const [name, up] of Object.entries(mcp.upstreams)) {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) errs.push(`upstream name "${name}" may only contain letters/digits . _ - (used as tool-name prefix, no __)`);
    if (up.type === 'stdio') {
      if (!up.command) errs.push(`upstream ${name} (stdio) is missing command`);
    } else if (up.type === 'http') {
      if (!up.url) errs.push(`upstream ${name} (http) is missing url`);
    } else {
      errs.push(`upstream ${name}: type must be stdio or http`);
    }
  }
  for (const [pname, prof] of Object.entries(mcp.profiles)) {
    if (prof.upstreams !== '*') {
      for (const u of prof.upstreams) {
        if (!(u in mcp.upstreams)) errs.push(`profile "${pname}" references unknown upstream "${u}"`);
      }
    }
  }
  return errs;
}
