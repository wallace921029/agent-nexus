import * as path from 'node:path';

/**
 * 为每个 Agent 工具生成“接入 agent-nexus-mcp 代理”的一行/一段配置片段。
 * server 名：default profile 用 agent-nexus-mcp；命名 profile 用 agent-nexus-mcp-<profile>。
 */

export interface SnippetOptions {
  profile: string;
  /** dist/mcp.js 的绝对路径（本地接入方式） */
  localEntry: string;
  /** true 时用 npx（已发布 npm 后的接入方式），否则用 node <localEntry> */
  useNpx: boolean;
  /** 各工具配置文件的展示路径覆盖（按 snippet id 键控；缺省用内置默认文案） */
  paths?: Record<string, string>;
}

export interface ToolSnippet {
  id: string;
  label: string;
  /** 配置要写入的文件 */
  file: string;
  /** cli = 一条命令；json = 要合并进文件的 JSON 片段；toml = TOML 片段；yaml = YAML patch 片段 */
  kind: 'cli' | 'json' | 'toml' | 'yaml';
  content: string;
  /** 命令行等价接入方式（如 claude mcp add），与 content 一并展示 */
  cli?: string;
  note?: string;
}

export function serverNameFor(profile: string): string {
  return profile === 'default' ? 'agent-nexus-mcp' : `agent-nexus-mcp-${profile}`;
}

function cmdParts(opts: SnippetOptions): { command: string; args: string[]; argv: string[] } {
  if (opts.useNpx) {
    const args = ['-y', 'agent-nexus-mcp', '--profile', opts.profile];
    return { command: 'npx', args, argv: ['npx', ...args] };
  }
  const args = [opts.localEntry, '--profile', opts.profile];
  return { command: 'node', args, argv: ['node', ...args] };
}

export function buildSnippets(opts: SnippetOptions): ToolSnippet[] {
  const name = serverNameFor(opts.profile);
  const { command, args, argv } = cmdParts(opts);
  const j = (v: unknown) => JSON.stringify(v, null, 2);
  const file = (id: string, fallback: string): string => opts.paths?.[id] ?? fallback;
  const snippets: ToolSnippet[] = [];

  snippets.push({
    id: 'claude',
    label: 'Claude Code',
    file: file('claude', '~/.claude.json (user scope)'),
    kind: 'json',
    content: j({ mcpServers: { [name]: { command, args, env: {} } } }),
    cli: `claude mcp add -s user ${name} -- ${argv.join(' ')}`,
    note: 'merge into the top-level "mcpServers" of ~/.claude.json (user scope)',
  });

  snippets.push({
    id: 'codex',
    label: 'Codex',
    file: file('codex', '~/.codex/config.toml'),
    kind: 'toml',
    content: `[mcp_servers.${name}]\ncommand = ${JSON.stringify(command)}\nargs = [${args.map((a) => JSON.stringify(a)).join(', ')}]`,
    note: 'one entry covers Codex CLI and the ChatGPT desktop app — both read ~/.codex/config.toml',
  });

  snippets.push({
    id: 'copilot',
    label: 'Copilot',
    file: file('copilot', '~/.copilot/mcp-config.json'),
    kind: 'json',
    content: j({ mcpServers: { [name]: { command, args, env: {} } } }),
    note: 'covers Copilot CLI, VS Code Copilot (global scope) and the GitHub Copilot app — all read ~/.copilot/mcp-config.json; the copilot mcp add command works too',
  });

  snippets.push({
    id: 'opencode',
    label: 'OpenCode',
    file: file('opencode', '~/.config/opencode/opencode.json(c)'),
    kind: 'json',
    content: j({ mcp: { [name]: { type: 'local', command: argv, environment: {} } } }),
    note: 'command is an array (full command line); merge into the existing mcp section',
  });

  snippets.push({
    id: 'antigravity',
    label: 'Antigravity',
    file: file('antigravity', '~/.gemini/config/mcp_config.json'),
    kind: 'json',
    content: j({ mcpServers: { [name]: { command, args, env: {} } } }),
    note: 'one entry covers the Antigravity desktop app and CLI — both read ~/.gemini/config/mcp_config.json',
  });

  snippets.push({
    id: 'dsh',
    label: 'DeepSeek Harness',
    file: file('dsh', '~/.dsh/cordis.patch.yml'),
    kind: 'yaml',
    content: [
      '- insert:',
      `    - id: mcp-${name}`,
      `      name: '@deepseek-ai/dsh-mcp-client'`,
      '      config:',
      `        serverName: ${name}`,
      '        transport: stdio',
      `        command: ${JSON.stringify(command)}`,
      `        args: [${args.map((a) => JSON.stringify(a)).join(', ')}]`,
    ].join('\n'),
    note: 'home patch applies to every profile (web hot-reloads, others need restart); ids must stay unique in the file — adjust if you already have mcp- rows',
  });

  snippets.push({
    id: 'zcode',
    label: 'ZCode',
    file: file('zcode', '~/.zcode/cli/config.json'),
    kind: 'json',
    content: j({ mcp: { servers: { [name]: { command, args, env: {} } } } }),
  });

  snippets.push({
    id: 'claude-desktop',
    label: 'Claude Desktop',
    file: file(
      'claude-desktop',
      'claude_desktop_config.json (macOS: ~/Library/Application Support/Claude/; Windows: %APPDATA%\\Claude\\)'
    ),
    kind: 'json',
    content: j({ mcpServers: { [name]: { command, args, env: {} } } }),
    note: 'Claude Desktop is stdio-only, and this proxy is stdio — directly compatible',
  });

  return snippets.sort((a, b) => a.label.localeCompare(b.label));
}

export function localMcpEntry(): string {
  // dist/mcp.js 相对本源码文件的绝对路径（编译后位于 dist/ 下）
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), 'mcp.js');
}
