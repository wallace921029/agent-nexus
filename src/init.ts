import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 初始化中心工作区（~/.agent-nexus）：
 *   AGENTS.md   / mcp.json / skills/   —— 用户内容，缺失才创建
 *   .config/                        —— 项目自身（设置/渲染产物/状态/日志）
 * overlays/ 不主动创建：需要某家工具的专属差异时用户自建 overlays/<id>.md
 */

const AGENTS_SAMPLE = `# Global instruction base (AGENTS.md)

> Global instructions shared by all agents. After editing, run \`agent-nexus sync-agents\` (or distribute from the web panel).
> Per-tool differences go in overlays/<tool-id>.md (optional).

## Example: reply style

- Reply concisely and lead with the conclusion.
`;

export function initCenter(centerRoot: string, _force = false): { created: string[]; existed: string[] } {
  const created: string[] = [];
  const existed: string[] = [];
  const rel = (p: string) => path.relative(centerRoot, p);

  const ensureFile = (p: string, content: string): void => {
    if (fs.existsSync(p)) {
      existed.push(rel(p));
      return;
    }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    created.push(rel(p));
  };

  fs.mkdirSync(centerRoot, { recursive: true });
  ensureFile(path.join(centerRoot, 'AGENTS.md'), AGENTS_SAMPLE);
  // 标准 mcpServers 格式的空清单（与 Claude 等工具的配置同款）
  ensureFile(path.join(centerRoot, 'mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2) + '\n');
  ensureFile(path.join(centerRoot, '.gitignore'), '.config/\n');
  fs.mkdirSync(path.join(centerRoot, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(centerRoot, '.config'), { recursive: true });
  if (created.includes('AGENTS.md')) {
    // skills 目录新建时才留一个入口说明（已存在则不动用户目录）
    const hint = path.join(centerRoot, 'skills', '.gitkeep');
    if (!fs.existsSync(hint)) fs.writeFileSync(hint, '');
  }
  return { created, existed };
}
