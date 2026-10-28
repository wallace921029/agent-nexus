import * as path from 'node:path';

/**
 * 各 Agent 工件的分发目标注册表。
 *
 * 约定（2026-10 与用户确认）：
 * - skills 一律用各工具自己的原生用户级目录；codex 用官方现行目录 ~/.agents/skills
 *   （~/.codex/skills 为历史遗留，不使用）。
 * - 全局指令按各家实际文件名渲染后软链下发；已存在的非我方文件一律跳过不动。
 */
export type TargetId =
  | 'claude'
  | 'claude-desktop'
  | 'codex'
  | 'copilot'
  | 'opencode'
  | 'dsh'
  | 'antigravity'
  | 'zcode';

export interface InstrSpec {
  /** 相对家目录的 POSIX 风格路径 */
  rel: string;
  kind: 'file' | 'rulesDir' | 'agentsRef';
  /** kind=rulesDir 时写入规则目录的文件名 */
  fileName?: string;
  /** 渲染产物需附加的 YAML frontmatter（如 Antigravity 模块化规则要求 trigger 字段，否则被静默忽略） */
  frontmatter?: Record<string, string>;
}

/** agentsRef 的语义（claude / claude-desktop）：
 *  rel = 工具根目录；派发 = 软链 <dir>/AGENTS.md（渲染产物）；
 *  <dir>/CLAUDE.md 不存在则创建对 AGENTS.md 的 @ 导入（绝对 ~/ 路径形式，用户级导入不触发信任确认）；
 *  已存在的他人 CLAUDE.md 一律不动。 */
export const AGENTS_REF_FILE = 'AGENTS.md';
export const AGENTS_REF_REF_FILE = 'CLAUDE.md';
/** 旧版相对引用行，仅用于识别/迁移已创建的引用文件 */
export const AGENTS_REF_OLD_LINE = '@./AGENTS.md';

/** “已安装”探测声明：命中任一探测点即视为已安装；
    未声明（或当前平台没有候选）时回退为 installDir 存在性判断 */
export interface InstallProbe {
  /** 在 PATH 及常见 bin 目录（~/.local/bin、brew、%APPDATA%\npm 等）上查找的命令名（Windows 自动尝试 .exe/.cmd/.bat 后缀） */
  commands?: string[];
  /** macOS 桌面应用安装位置（绝对路径；支持 ~，用户级与系统级 /Applications 建议都声明） */
  macApps?: string[];
  /** Windows 安装位置（支持 %LOCALAPPDATA% 等环境变量展开与 ~ 前缀） */
  winPaths?: string[];
}

export interface TargetDef {
  id: TargetId;
  label: string;
  /** 该工具“已安装”的判定目录（相对家目录） */
  installDir: string;
  /** “已安装”探测声明（PATH 命令 / 应用安装位置）；缺省时仅按 installDir 存在性判断 */
  probe?: InstallProbe;
  /** 用户级 skills 目录（相对家目录） */
  skillsRel: string;
  /** 全局指令落点 */
  instr: InstrSpec;
  /** 各工具原生 MCP 配置文件（相对家目录）；即便默认值相同也各自独立、可单独覆盖 */
  mcpConfig: string;
  /** 能力声明（默认都支持）；如 claude-desktop 仅支持 MCP */
  supports?: { instructions: boolean; skills: boolean };
  notes?: string[];
}

export const TARGETS: readonly TargetDef[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    installDir: '.claude',
    probe: { commands: ['claude'] },
    skillsRel: '.claude/skills',
    instr: { rel: '.claude', kind: 'agentsRef' },
    mcpConfig: '.claude.json',
    notes: [
      'officially documented to support symlinked skill dirs',
      'MCP: ~/.claude.json stays local; claude.ai connectors sync INTO Claude Code sessions one-way (runtime-only, not removable via claude mcp remove, ~2K tokens per connector per turn)',
    ],
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    installDir:
      process.platform === 'darwin'
        ? 'Library/Application Support/Claude'
        : process.platform === 'win32'
          ? 'AppData/Roaming/Claude'
          : '.config/Claude',
    // Linux 无官方桌面版：平台无候选时自动回退目录存在性判断；macOS 系统级 + 用户级安装位置都查
    probe: {
      macApps: ['/Applications/Claude.app', '~/Applications/Claude.app'],
      winPaths: ['%LOCALAPPDATA%\\AnthropicClaude'],
    },
    skillsRel: '',
    instr: { rel: '', kind: 'agentsRef' },
    mcpConfig:
      process.platform === 'darwin'
        ? 'Library/Application Support/Claude/claude_desktop_config.json'
        : process.platform === 'win32'
          ? 'AppData/Roaming/Claude/claude_desktop_config.json'
          : '.config/Claude/claude_desktop_config.json',
    supports: { instructions: true, skills: false },
    notes: [
      'Claude Desktop / claude.ai does not read CLAUDE.md or AGENTS.md (Claude Code-only mechanism); agent-nexus still places AGENTS.md + a CLAUDE.md reference here for future/manual use',
      'nothing syncs across Claude products — skills are uploaded as ZIP inside the app (no local dir to symlink), memories/preferences live in app settings',
      'MCP works via claude_desktop_config.json (stdio only); claude.ai connectors do NOT come from this file',
    ],
  },
  {
    id: 'codex',
    label: 'Codex',
    installDir: '.codex',
    probe: { commands: ['codex'] },
    skillsRel: '.agents/skills',
    instr: { rel: '.codex/AGENTS.md', kind: 'file' },
    mcpConfig: '.codex/config.toml',
    notes: [
      'one row covers both Codex CLI and the ChatGPT desktop app — they share ~/.codex entirely (config.toml, AGENTS.md, app-server)',
      'skills use the current official dir ~/.agents/skills; ~/.codex/skills is legacy and unused',
      'note: copilot/opencode/zcode also scan ~/.agents/skills as a secondary path; skills enabled for codex are visible to them',
      'instruction files over 32KiB are truncated by codex (doctor checks this)',
    ],
  },
  {
    id: 'copilot',
    label: 'Copilot',
    installDir: '.copilot',
    probe: { commands: ['copilot'] },
    skillsRel: '.copilot/skills',
    instr: { rel: '.copilot/copilot-instructions.md', kind: 'file' },
    mcpConfig: '.copilot/mcp-config.json',
    notes: [
      'one row covers Copilot CLI, VS Code Copilot (global MCP scope), and the GitHub Copilot app — they share ~/.copilot (mcp-config.json, skills)',
      'custom instructions file applies to the CLI; VS Code/app read repo-level .github/copilot-instructions.md instead',
    ],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    installDir: '.config/opencode',
    probe: { commands: ['opencode'] },
    skillsRel: '.config/opencode/skills',
    instr: { rel: '.config/opencode/AGENTS.md', kind: 'file' },
    mcpConfig: '.config/opencode/opencode.json',
    notes: ['opencode does not support @import; rendered as plain concatenation'],
  },
  {
    id: 'dsh',
    label: 'DeepSeek Harness',
    installDir: '.dsh',
    probe: { commands: ['dsh'] },
    skillsRel: '.dsh/skills',
    instr: { rel: '.dsh/AGENTS.md', kind: 'file' },
    mcpConfig: '.dsh/cordis.patch.yml',
    notes: [
      'instructions load on NEW sessions only (project-level overrides global; global+project budget 65536 bytes, global dropped first when exceeded)',
      'skills hot-load via watcher (SKILL.md frontmatter required: name kebab-case + description; one level scanned, .system skipped)',
      'MCP = YAML patch rows in ~/.dsh/cordis.patch.yml (home patch, applies to EVERY profile; web hot-reloads, others need restart; file must not be empty/comments-only — write [] when unused)',
    ],
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    installDir: '.gemini',
    // gemini CLI 与 Antigravity 共读 ~/.gemini/config，任一存在即视为该行有效；
    // Windows 应用位置按 Electron 应用惯例（%LOCALAPPDATA%\Programs）尽力探测
    probe: {
      commands: ['antigravity', 'gemini'],
      macApps: ['/Applications/Antigravity.app', '~/Applications/Antigravity.app'],
      winPaths: ['%LOCALAPPDATA%\\Programs\\Antigravity'],
    },
    skillsRel: '.gemini/config/skills',
    instr: { rel: '.gemini/config/AGENTS.md', kind: 'file' },
    mcpConfig: '.gemini/config/mcp_config.json',
    notes: [
      'one row covers the Antigravity desktop app and the Antigravity CLI — both read ~/.gemini/config (AGENTS.md, skills/, mcp_config.json); the CLI also accepts ~/.gemini/config/rules/AGENTS.md as an equivalent rules location',
      'Antigravity IDE (~/.gemini/antigravity-ide) is a separate product, not covered by this row',
      '~/.gemini/antigravity-cli/ is app-internal state, not user config',
    ],
  },
  {
    id: 'zcode',
    label: 'ZCode',
    installDir: '.zcode',
    probe: { commands: ['zcode'] },
    skillsRel: '.zcode/skills',
    instr: { rel: '.zcode/AGENTS.md', kind: 'file' },
    mcpConfig: '.zcode/cli/config.json',
  },
];

export const TARGET_IDS: readonly TargetId[] = TARGETS.map((t) => t.id);

export function getTarget(id: TargetId): TargetDef {
  const def = TARGETS.find((t) => t.id === id);
  if (!def) throw new Error(`unknown target: ${id}`);
  return def;
}

/** 用户在 .config/config.json 里对某个目标的路径覆盖（都可省略=用默认） */
export interface TargetPathOverride {
  enabled?: boolean;
  /** 用户级 skills 目录，相对家目录或绝对路径（支持 ~ 开头） */
  skillsDir?: string | null;
  /** 全局指令位置：字符串（文件路径）或对象（rules 目录需 fileName） */
  instructions?: string | { path: string; type?: 'file' | 'rulesDir'; fileName?: string } | null;
  /** 该工具原生 MCP 配置文件路径（相对家目录 / ~/ / 绝对路径） */
  mcpConfig?: string | null;
}

/** 解析后的有效目标（绝对路径，供各模块直接使用） */
export interface EffectiveTarget {
  id: TargetId;
  label: string;
  notes?: string[];
  /** 该工具“已安装”的判定目录（绝对路径） */
  installDir: string;
  /** “已安装”探测声明（原样来自 TargetDef） */
  probe?: InstallProbe;
  /** 用户级 skills 目录（绝对路径；不支持 skills 时为空串） */
  skillsDir: string;
  instr: {
    /** 指令文件（或 rules 目录下的文件）绝对路径；不支持指令时为空串 */
    path: string;
    kind: 'file' | 'rulesDir' | 'agentsRef';
    /** 渲染产物文件名 */
    fileName: string;
    /** kind=agentsRef：引用文件 CLAUDE.md 的绝对路径 */
    refPath?: string;
    /** 渲染产物需附加的 YAML frontmatter（模块化规则目录用） */
    frontmatter?: Record<string, string>;
  };
  /** 该工具原生 MCP 配置文件（绝对路径） */
  mcpConfig: string;
  /** 是否使用了用户覆盖 */
  customized: boolean;
  /** MCP 配置路径是否使用了用户覆盖 */
  mcpConfigCustomized: boolean;
  /** 能力声明 */
  supports: { instructions: boolean; skills: boolean };
}

/** 支持 "~/x"、"/abs/x"、"rel/to/home" 三种写法 */
export function resolveUserPath(home: string, p: string): string {
  let s = p.trim();
  if (s === '~') return home;
  if (s.startsWith('~/') || s.startsWith('~\\')) s = home + s.slice(1);
  if (path.isAbsolute(s)) return path.normalize(s);
  return path.join(home, ...s.split(/[\\/]/));
}

/** 默认定义 + 用户覆盖 → 有效目标 */
export function effectiveTarget(home: string, def: TargetDef, ov?: TargetPathOverride | null): EffectiveTarget {
  const skillsRel = ov?.skillsDir ?? def.skillsRel;
  let customized = ov?.skillsDir != null && ov.skillsDir !== def.skillsRel;

  let instrPathRel = def.instr.rel;
  let kind = def.instr.kind;
  let fileName = '';
  const ins = ov?.instructions;
  if (typeof ins === 'string') {
    instrPathRel = ins;
    kind = 'file';
    customized = true;
  } else if (ins && typeof ins === 'object') {
    instrPathRel = ins.path;
    kind = ins.type ?? 'file';
    fileName = ins.fileName ?? '';
    customized = true;
  }
  // rulesDir 类型默认 agent-nexus.md；file 类型取路径 basename 作为渲染产物名；
  // agentsRef 类型：rel 为工具根目录（空串=installDir），产物固定 AGENTS.md
  let refDirRel: string | null = null;
  if (kind === 'agentsRef') {
    refDirRel = instrPathRel || def.installDir;
    fileName = AGENTS_REF_FILE;
  }
  if (!fileName) fileName = kind === 'rulesDir' ? 'agent-nexus.md' : '';
  if (!fileName) fileName = path.posix.basename(instrPathRel.replace(/\\/g, '/'));

  const supports = def.supports ?? { instructions: true, skills: true };
  const mcpConfigRel = ov?.mcpConfig ?? def.mcpConfig;
  const refDir = refDirRel ? resolveUserPath(home, refDirRel) : '';
  return {
    id: def.id,
    label: def.label,
    notes: def.notes,
    installDir: path.join(home, ...def.installDir.split('/')),
    probe: def.probe,
    skillsDir: supports.skills ? resolveUserPath(home, skillsRel) : '',
    instr: supports.instructions
      ? {
          path:
            kind === 'rulesDir'
              ? path.join(resolveUserPath(home, instrPathRel), fileName)
              : kind === 'agentsRef'
                ? path.join(refDir, fileName)
                : resolveUserPath(home, instrPathRel),
          kind,
          fileName,
          ...(kind === 'agentsRef' ? { refPath: path.join(refDir, AGENTS_REF_REF_FILE) } : {}),
          ...(def.instr.frontmatter ? { frontmatter: def.instr.frontmatter } : {}),
        }
      : { path: '', kind, fileName },
    mcpConfig: resolveUserPath(home, mcpConfigRel),
    customized,
    mcpConfigCustomized: ov?.mcpConfig != null && ov.mcpConfig !== def.mcpConfig,
    supports,
  };
}
