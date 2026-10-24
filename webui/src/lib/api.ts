// 后端 API 封装与类型
export interface EffectiveTarget {
  id: string;
  label: string;
  notes?: string[];
  installDir: string;
  skillsDir: string;
  instr: { path: string; kind: 'file' | 'rulesDir' | 'agentsRef'; fileName: string; refPath?: string; frontmatter?: Record<string, string> };
  /** 该工具原生 MCP 配置文件（绝对路径） */
  mcpConfig: string;
  customized: boolean;
  /** MCP 配置路径是否为用户覆盖 */
  mcpConfigCustomized: boolean;
  supports: { instructions: boolean; skills: boolean };
}

export interface TargetStatus {
  eff: EffectiveTarget;
  installed: boolean;
  skillsLinked: number;
  skillsBroken: number;
  skillsForeign: number;
  skillsTotal: number;
  instr: 'none' | 'ours' | 'ours-broken' | 'copy' | 'foreign' | 'unsupported';
  instrPath: string;
}

export type CellState = 'linked' | 'broken' | 'foreign' | 'none' | 'unsupported';

export interface NexusState {
  center: string;
  skills: string[];
  status: {
    targets: TargetStatus[];
    skillsMatrix: Record<string, Record<string, CellState>>;
    baseMissing: boolean;
  };
  doctor: { issues: string[]; warnings: string[] };
  targetSettings: Record<string, { enabled?: boolean; skillsDir?: string | null; instructions?: unknown }>;
  mcp: McpConfig;
  /** mcp.json 手编问题（JSON 语法错 / 校验失败项），空数组=无问题 */
  mcpIssues: string[];
  /** 各家原生 MCP 配置中已探测到的 agent-nexus-mcp 条目名（空数组=未接入） */
  mcpConnected: Record<string, string[]>;
  /** 接入片段，按工具 id 键控（profile = 工具名，server 名 agent-nexus-mcp-<tool>） */
  snippets: Record<string, ToolSnippet[]>;
}

export interface McpUpstream {
  type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
}

export interface McpConfig {
  upstreams: Record<string, McpUpstream>;
  profiles: Record<string, { upstreams: string[] | '*' }>;
}

export interface ToolSnippet {
  id: string;
  label: string;
  file: string;
  kind: 'cli' | 'json' | 'toml';
  content: string;
  note?: string;
}

export interface Row {
  kind: string;
  id: string;
  link?: string;
  skill?: string;
  detail?: string;
  label?: string;
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export const getState = () => api<NexusState>('/api/state');
export const postSyncAgents = (b: { targets?: string[]; dryRun?: boolean; retract?: boolean }) =>
  api<{ rows: Row[] }>('/api/sync-agents', b);
export const postLinkSkills = (b: { skills?: string[]; targets?: string[]; retract?: boolean; dryRun?: boolean }) =>
  api<{ rows: Row[] }>('/api/link-skills', b);
export const postSkillCreate = (b: { name: string }) => api<{ ok: boolean; detail: string }>('/api/skill-create', b);
export const postMcpProfile = (b: { tool: string; upstreams: string[] }) =>
  api<{ ok: boolean; detail: string }>('/api/mcp-profile', b);
export const postTargetPaths = (b: { id: string; key: 'skillsDir' | 'instructions' | 'mcpConfig'; value: string | null }) =>
  api<{ ok: boolean; detail: string }>('/api/target-paths', b);

// ---- 文件模块（浏览/编辑 ~/.agent-nexus 内的文本文件） ----
export interface FsEntry {
  name: string;
  dir: boolean;
  size?: number;
}
export const fsList = (p: string) => api<{ path: string; entries: FsEntry[] }>(`/api/fs/list?path=${encodeURIComponent(p)}`);
export const fsRead = (p: string) => api<{ path: string; content: string; bytes: number }>(`/api/fs/read?path=${encodeURIComponent(p)}`);
export const fsWrite = (b: { path: string; content: string }) => api<{ ok: boolean; bytes: number }>('/api/fs/write', b);
export const fsSearch = (q: string) => api<{ results: Array<{ path: string; dir: boolean; size?: number }> }>(`/api/fs/search?q=${encodeURIComponent(q)}`);
