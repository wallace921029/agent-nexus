# agent-nexus

多 Agent 工具统一配置中心。**中心工作区在 `~/.agent-nexus`**（仓库只放代码），一份配置下发到 Claude Code / Codex（含 ChatGPT 桌面版）/ Copilot（含 VS Code 与 Copilot App）/ OpenCode（含桌面版）/ DeepSeek Harness / Antigravity / ZCode：

```
~/.agent-nexus/
├── AGENTS.md        # 指令公共底座（用户内容）
├── overlays/        # 可选：各家专属片段 overlays/<工具id>.md（需要时才创建）
├── skills/          # skill 源（用户内容）
├── mcp.json         # MCP 服务器清单，标准 mcpServers 格式（用户内容）
└── .config/         # agent-nexus 自身：可选 config.json（目标开关/路径覆盖/mcpProfiles）、
                     #   build/（渲染产物，软链指向这里）、state.json、mcp-logs/
```

- **AGENTS.md**：公共底座 + 各家 overlay 渲染成各家文件名（CLAUDE.md / GEMINI.md / copilot-instructions.md / AGENTS.md…），软链下发；目标位置已有别人的文件则跳过不动
- **Skills**：`skills/<名>/SKILL.md` 按矩阵链接到各家原生用户级 skills 目录；支持一键全部分发 / 一键全部收回 / 单个增删
- **MCP 聚合代理**：`agent-nexus-mcp`（stdio），各家只配这一个 server；默认 profile 全量聚合，命名 profile 输出子集（如 `agent-nexus-mcp-for-claude`）
- **每个工具的指令位置 / skills 目录都可在 `.config/config.json` 覆盖**（注册表里的只是默认值）：网页面板每行有 ✎ 按钮

三个阶段均已完成：

| 阶段 | 内容 | 状态 |
|---|---|---|
| 一 | CLI：init / sync-agents / link-skills / status / doctor | ✅ |
| 二 | `agent-nexus web` 本地网页面板 | ✅ |
| 三 | `agent-nexus-mcp` stdio 聚合代理 + `mcp snippets` / `mcp check` | ✅ |

## 快速开始

```bash
npm install && npm run build
node dist/cli.js init                 # 初始化 ~/.agent-nexus（AGENTS.md、mcp.json、skills/）
# 编辑 ~/.agent-nexus/AGENTS.md，可选增加 overlays/<id>.md
node dist/cli.js sync-agents          # 渲染并下发全局指令
node dist/cli.js link-skills          # 分发全部 skills
node dist/cli.js status               # 查看状态
node dist/cli.js doctor               # 自检（升级 codex 后可加 --probe-codex）
node dist/cli.js web                  # 打开网页面板（--no-open 不自动开浏览器，-p 端口）
```

中心工作区解析顺序：`--center` 参数 > `NEXUS_CENTER` 环境变量 > `~/.agent-nexus`。

## 自定义每个工具的路径

`.config/config.json`（可选文件，改过才有）支持按目标覆盖（网页面板 AGENTS.md 页每行的 ✎ 按钮等效）：

```json
{
  "targets": {
    "zcode": {
      "enabled": true,
      "instructions": ".zcode/MY_AGENTS.md",
      "skillsDir": "~/zcode-skills"
    },
    "codex": {
      "instructions": { "path": ".codex/AGENTS.override.md" }
    }
  }
}
```

- 路径支持三种写法：相对家目录（`.zcode/MY_AGENTS.md`）、`~/` 开头、绝对路径
- `instructions` 可以是字符串（当作文件路径），rules 目录类目标用对象 `{ "path": "…", "type": "rulesDir", "fileName": "…" }`
- 省略或设为 null = 恢复注册表默认；`status` 会给自定义过的目标打 `[自定义路径]` 标记并显示生效路径

## 网页面板（agent-nexus web）

深色 / 浅色磨砂（glassmorphism：半透明面板 backdrop-blur + 淡光晕）双主题风格，侧栏可切换主题并在浏览器中记住选择。Vue 3 + Vite + Tailwind 实现（源码在 `webui/`），构建后内嵌为单文件由 CLI 直接托管，仍然只有 dist 一个分发物。各工具 logo（官方 favicon，存于 `webui/src/assets/logos/`，构建时内联为 data URL）展示在总览卡片、指令表、Skills 列头与 MCP 片段卡。

- **总览仪表盘**：系统健康度、Agent 检测、指令与 Skills 链接四项关键指标，可展开的 doctor 异常摘要、Agent 集成状态列表、管理模块快捷入口与最近活动时间线（只读统计，分发/收回操作仍在各模块内）
- **AGENTS.md 指令页**：目标选择表 + 预览（dry-run）/确认下发/全部收回；每行 ✎ 自定义指令位置
- **Skills 页**（shadcn/ui 组件风格）：统计卡片行（skills/已链接/冲突/断链）+ 分发矩阵（大点选区 Checkbox、冻结首列、行悬停、列头 logo+✎ 自定义目录）、一键全部分发/收回、新建 skill 弹窗
- **MCP 页**：上游（stdio/http）与 profile 可视化编辑、保存写入 nexus.config.json；每个 profile 自动生成各工具接入片段卡片（一键复制）
- **文件页**：双栏文件浏览器——左栏目录树（原地展开、选中高亮条、**全文搜索框**：后端递归搜索）；右栏 **CodeMirror 6 编辑器**（语法高亮 md/json/yaml/py/js/ts/html/css、行号、撤销、折叠、括号匹配）+ 文件类型徽标头；Ctrl+S 保存、Tab 缩进、未保存提醒、目录内/搜索空态新建文件；自动识别渲染源/skill/build 产物并给出提示；越界路径、二进制、超 512KB 文件一律拒绝
- **操作日志页**：面板内操作流水（localStorage 持久化，最多 300 条）

仅监听 127.0.0.1，无鉴权（本机自用）。

### 面板二次开发

```bash
npm run dev:web    # 一条命令：同时起后端（8741）+ Vite 前端（5173，热更新），自动开浏览器，Ctrl+C 一起退出
```

细节：dist 不存在会先自动编译；8741 已有面板后端在运行则直接复用不重复起；任一子进程意外退出会连带全部退出（不留孤儿进程）。改完执行 `npm run build:web`（构建 webui 并内嵌进 src/page.generated.ts），再 `npm run build` 编译 CLI；`npm run build:all` 一条龙。

## MCP 聚合代理（agent-nexus-mcp）

上游集中配置在 `~/.agent-nexus/mcp.json`——**标准 mcpServers 格式**（与 Claude 等工具的配置同款，在 Files 模块中编辑，网页面板 MCP 页只读展示）：

```json
{
  "mcpServers": {
    "chrome-devtools": { "command": "npx", "args": ["-y", "chrome-devtools-mcp"] },
    "remote-one":     { "type": "http", "url": "https://example.com/mcp" }
  }
}
```

按工具分子集（profiles）属于 agent-nexus 自身配置，放在 `.config/config.json` 的 `mcpProfiles` 键（`"*"` = 全部，数组 = 指定子集）：

```json
{
  "mcpProfiles": {
    "default":    "*",
    "for-claude": ["chrome-devtools"]
  }
}
```

- 工具/提示词名统一 `上游名__原名` 前缀（重名天然消解，描述带 `[上游名]` 标注）；资源按 URI 路由
- 透传：tools/resources/prompts 列表与读取、`tools/list_changed`（含缓存刷新）、进度通知（progressToken 缝合）、请求取消；不透传 sampling/elicitation
- 上游连接失败不拖垮整体（该上游工具缺席，其余继续）；结构化 JSONL 日志：`~/.agent-nexus/.config/mcp-logs/<profile>-<日期>.jsonl`
- 会话结束（stdio 关闭）自动结束全部上游子进程

各工具接入（一条命令或一段配置，详见 `node dist/cli.js mcp snippets`）：

```bash
# 例：Claude Code 接默认全量 profile
claude mcp add -s user agent-nexus-mcp -- node <本仓库>/dist/mcp.js --profile default
# 例：再接一个专属子集 profile（server 名自取）
claude mcp add -s user agent-nexus-mcp-for-claude -- node <本仓库>/dist/mcp.js --profile for-claude
```

```bash
node dist/cli.js mcp check            # 逐上游连通性体检（连接并列出工具/资源/提示词数量）
node test/mcp-e2e.mjs                 # 端到端测试（真实上游 fixture，19 项断言）
```

## 命令一览

| 命令 | 作用 |
|---|---|
| `init` | 初始化中心仓库结构 |
| `sync-agents` | 渲染 AGENTS.md 并下发（`-t` 限目标，`-r` 收回，`-n` dry-run） |
| `link-skills` | 分发 skills（`-s`/`-t` 限定，`-r` 收回，`-n` dry-run） |
| `status` | 各工具安装/skills 链接/指令文件状态 |
| `doctor` | 自检断链、冲突、缺文件；`--probe-codex` 探测 codex 目录活性 |
| `web` | 本地网页面板（`-p 端口`，`--no-open`） |
| `mcp snippets` | 生成各工具接入片段（`--profile x`，`--npx` 用 npx 形式） |
| `mcp check` | MCP 上游连通性体检 |

## 分发目标（各家原生目录）

| 工具 | skills 目录（默认） | 指令文件（默认） |
|---|---|---|
| Claude Code | `~/.claude/skills` | `~/.claude/CLAUDE.md` |
| Codex（CLI/ChatGPT 桌面） | `~/.agents/skills`（官方现行；`~/.codex/skills` 为历史遗留不用） | `~/.codex/AGENTS.md`（32KiB 上限） |
| Copilot（CLI / VS Code / App） | `~/.copilot/skills` | `~/.copilot/copilot-instructions.md` |
| OpenCode | `~/.config/opencode/skills` | `~/.config/opencode/AGENTS.md` |
| DeepSeek Harness | `~/.dsh/skills` | `~/.dsh/AGENTS.md`（新会话生效；MCP 走 `~/.dsh/cordis.patch.yml` YAML patch） |
| Antigravity（桌面应用/CLI） | `~/.gemini/config/skills` | `~/.gemini/config/AGENTS.md`（CLI 亦可用 `~/.gemini/config/rules/AGENTS.md`） |
| ZCode | `~/.zcode/skills` | `~/.zcode/AGENTS.md` |
| Claude Desktop | 不支持软链分发（skills 需在应用内以 ZIP 上传，无本地扫描目录） | 无本地指令文件；仅 MCP（stdio，可接代理） |

以上均为默认值，每个目标都可在 `.config/config.json` 或网页面板（✎ 按钮）里覆盖为自己的路径。

已知副作用：`~/.agents/skills` 同时是 copilot/opencode/zcode 的第二扫描路径，为 codex 启用的 skill 这三家也能看到。（Gemini CLI 已移除：Google 停止更新；Antigravity 仍保留）

## 三平台说明

- **Linux / macOS**：目录与文件一律符号链接
- **Windows 11**：目录用 junction（免管理员）；**文件**符号链接需要一次性开启"开发者模式"（设置 → 系统 → 开发者选项），未开启时自动退化为"sync 时复制"并在 status 中标注
- 每台机器独立部署，不做跨机同步；secrets 不进仓库

## 测试

```bash
node test/mcp-e2e.mjs   # MCP 代理端到端：命名空间/调用往返/进度/取消/listChanged/资源/提示词/日志/空profile/mcp check
```

链接引擎的分发/收回/冲突/断链/doctor 行为在第一阶段已通过 NEXUS_HOME 沙箱全场景验证（见 `status`/`doctor`）。
