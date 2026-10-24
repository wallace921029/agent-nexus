// 工具 logo（构建时由 Vite 内联为 data URL，仍保持单文件分发）
// 来源：各官方站点 favicon（antigravity.google / claude.ai / chatgpt.com / github.com / opencode.ai）；zcode 取自本机 ZCode 安装目录的官方图标（缩放至 64px）
import claude from '../assets/logos/claude.png';
import codex from '../assets/logos/codex.png';
import copilot from '../assets/logos/copilot.png';
import opencode from '../assets/logos/opencode.ico';
import antigravity from '../assets/logos/antigravity.ico';
import zcode from '../assets/logos/zcode.png';
import deepseek from '../assets/logos/deepseek.png';

export const LOGOS: Record<string, string> = {
  claude,
  codex,
  copilot,
  opencode,
  antigravity,
  zcode,
  dsh: deepseek,
  'claude-desktop': claude,
};
