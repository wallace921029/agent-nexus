// 工具 logo（构建时由 Vite 内联为 data URL，仍保持单文件分发）
// 来源：各官方站点 favicon（antigravity.google / claude.ai / chatgpt.com / github.com / opencode.ai）
import claude from '../assets/logos/claude.png';
import codex from '../assets/logos/codex.png';
import copilot from '../assets/logos/copilot.png';
import opencode from '../assets/logos/opencode.ico';
import antigravity from '../assets/logos/antigravity.ico';

export const LOGOS: Record<string, string> = {
  claude,
  codex,
  copilot,
  opencode,
  antigravity,
};
