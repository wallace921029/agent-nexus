# agent-nexus

**一份配置，同步给你电脑上所有的 AI 编程工具。**

同时用着 Claude Code、Codex、Copilot、OpenCode……每个工具都要单独配一遍「全局规则、技能、MCP 服务」，改一处就得挨个工具再改一遍。agent-nexus 把这些集中放在一个地方（`~/.agent-nexus`），写一次，一键分发给所有工具：

- **全局指令**：写一份 `AGENTS.md`，自动转成各工具要的文件名（CLAUDE.md、copilot-instructions.md 等），一键下发
- **技能（skills，给 AI 助手扩展能力的指令包）**：集中放在一个目录，面板里勾选即可同时分发到各工具
- **MCP 服务（MCP：Model Context Protocol，让 AI 工具调用外部功能的标准接口）**：所有服务的地址集中写在一个文件里，各工具只接入 agent-nexus 这一个入口，以后新增服务不用再挨个工具改配置

## 快速开始：npx 打开网页面板

要求 Node.js ≥ 20，无需安装，两条命令：

```bash
npx -y @wallace921029/agent-nexus init   # 首次使用：创建 ~/.agent-nexus（AGENTS.md、mcp.json、skills/）
npx -y @wallace921029/agent-nexus web    # 启动网页面板，浏览器自动打开 http://127.0.0.1:8741
```

日常操作都可以在面板里完成：

- **总览**：健康度、各工具接入状态
- **AGENTS.md**：编辑、预览、下发 / 收回
- **Skills**：分发矩阵，勾选即分发或收回，还能新建技能
- **MCP**：编辑服务清单，一键复制各工具的接入配置
- **文件**：直接编辑 `~/.agent-nexus` 里的任何文件（带语法高亮）

面板只监听本机（127.0.0.1），无密码，个人电脑自用；Ctrl+C 退出。不想用面板的话，全部操作也都有命令行版本，见下面「命令一览」。

## 支持的工具

| 工具 | 全局指令 | Skills | MCP |
|---|---|---|---|
| Claude Code | ✅ | ✅ | ✅ |
| Codex（CLI / ChatGPT 桌面版） | ✅ | ✅ | ✅ |
| GitHub Copilot（CLI / VS Code / App） | ✅ | ✅ | ✅ |
| OpenCode（CLI / 桌面版） | ✅ | ✅ | ✅ |
| Antigravity（桌面版 / CLI） | ✅ | ✅ | ✅ |
| DeepSeek Harness | ✅ | ✅ | ✅ |
| ZCode | ✅ | ✅ | ✅ |
| Claude Desktop | —（无本地指令文件） | 需在应用内上传 | ✅ |

几点行为说明：

- 指令和技能都以软链接（Windows 上为 junction）下发，不在各工具目录里产生重复副本；目标位置已有别人的文件时会跳过不动，不会覆盖
- 每个工具的分发路径都可以改：面板里对应行的 ✎ 按钮
- 需要给某个工具加专属差异时，在 `~/.agent-nexus/overlays/<工具id>.md` 里写，只会追加给那一家

## MCP 集中管理

所有 MCP 服务写在一个文件 `~/.agent-nexus/mcp.json`（与 Claude 同款的 mcpServers 格式，可在面板 MCP 页编辑）。各工具接入 agent-nexus 这一个服务后，清单里的所有服务都会自动转发过来：

```bash
npx -y @wallace921029/agent-nexus mcp snippets --npx   # 生成各工具的接入配置，复制粘贴即可
npx -y @wallace921029/agent-nexus mcp check            # 逐个测试服务连通性
```

还可以按工具定义不同的子集（profile），比如让某个工具只接其中几个服务；在面板 MCP 页或 `.config/config.json` 的 `mcpProfiles` 里配置。

## 命令一览

| 命令 | 作用 |
|---|---|
| `init` | 初始化 `~/.agent-nexus` |
| `web` | 打开网页面板（`-p` 改端口，`--no-open` 不自动开浏览器） |
| `sync-agents` | 渲染 AGENTS.md 并下发（`-t` 指定工具，`-r` 收回，`-n` 预览不动文件） |
| `link-skills` | 分发 skills（`-s`/`-t` 限定范围，`-r` 收回，`-n` 预览） |
| `status` | 查看各工具接入状态 |
| `doctor` | 体检：断链、冲突、缺文件 |
| `mcp snippets` | 生成各工具的 MCP 接入配置（`--npx` 用 npx 形式） |
| `mcp check` | 测试各 MCP 服务连通性 |

## 其他说明

- 为 Codex 启用的技能存放在 `~/.agents/skills`，Copilot / OpenCode / ZCode 也会扫描这个目录，所以也能看到它们
- Windows：目录用 junction（免管理员）；文件软链接需一次性开启「开发者模式」，未开启时自动改为复制并在 `status` 标注
- 每台电脑独立一套，不做跨设备同步；中心目录可用 `--center` 参数或 `NEXUS_CENTER` 环境变量重定向
- 面板无鉴权、仅监听本机，请勿暴露到网络

## 从源码运行（开发者）

```bash
git clone https://github.com/wallace921029/agent-nexus.git
cd agent-nexus && npm install && npm run build
node dist/cli.js <命令>     # 效果与 npx 相同
npm run dev:web             # 面板二次开发：前后端同时热更，一条命令起停
npm test                    # MCP 代理端到端测试
```

MIT License
