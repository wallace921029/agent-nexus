# agent-nexus

[简体中文](README.zh-CN.md)

**One config, synced to every AI coding tool on your machine.**

Using Claude Code, Codex, Copilot, OpenCode and more at the same time? Each tool wants its own copy of your global rules, skills, and MCP servers — every change has to be repeated tool by tool. agent-nexus keeps all of it in one place (`~/.agent-nexus`): write once, distribute everywhere with one click.

- **Global instructions**: write a single `AGENTS.md`; it is rendered under each tool's expected file name (CLAUDE.md, copilot-instructions.md, …) and distributed in one click
- **Skills** (instruction packages that extend what an AI assistant can do): keep them in one folder and distribute them to every tool by ticking checkboxes in the panel
- **MCP servers** (MCP: Model Context Protocol — the standard interface for AI tools to call external capabilities): list all your servers in one file and point every tool at agent-nexus as its single MCP entry; adding a server later no longer means editing every tool's config

## Quick start: npx + web panel

Requires Node.js ≥ 20. No install needed — two commands:

```bash
npx -y @wallace921029/agent-nexus init   # first run: create ~/.agent-nexus (AGENTS.md, mcp.json, skills/)
npx -y @wallace921029/agent-nexus web    # start the web panel; the browser opens http://127.0.0.1:8741 automatically
```

Everything you do day-to-day happens in the panel:

- **Overview**: health at a glance, per-tool integration status
- **AGENTS.md**: edit, preview, distribute / retract
- **Skills**: distribution matrix — tick to distribute or retract; create new skills too
- **MCP**: edit the server list, copy each tool's connect snippet with one click
- **Files**: edit any file under `~/.agent-nexus` directly (with syntax highlighting)

The panel listens on 127.0.0.1 only, has no password, and is meant for personal use on your own machine; stop it with Ctrl+C. Prefer the terminal? Every operation is also available as a CLI command — see "Command reference" below.

## Supported tools

| Tool | Instructions | Skills | MCP |
|---|---|---|---|
| Claude Code | ✅ | ✅ | ✅ |
| Codex (CLI / ChatGPT desktop) | ✅ | ✅ | ✅ |
| GitHub Copilot (CLI / VS Code / App) | ✅ | ✅ | ✅ |
| OpenCode (CLI / desktop) | ✅ | ✅ | ✅ |
| Antigravity (desktop / CLI) | ✅ | ✅ | ✅ |
| DeepSeek Harness | ✅ | ✅ | ✅ |
| ZCode | ✅ | ✅ | ✅ |
| Claude Desktop | — (no local instructions file) | upload in-app | ✅ |

Behavior notes:

- Instructions and skills are distributed as symlinks (junctions on Windows) — no duplicate copies inside each tool's directory. If the target already holds someone else's file: instruction files are backed up automatically (renamed with a timestamp) and then taken over, while skills are left untouched and reported — nothing is ever silently overwritten
- Every tool's distribution paths are customizable via the ✎ button on its row in the panel
- To give one specific tool some extra rules, put them in `~/.agent-nexus/overlays/<tool-id>.md` — they are appended to that tool only

## Centralized MCP management

All MCP servers live in one file, `~/.agent-nexus/mcp.json` (the same mcpServers format Claude uses; editable in the panel's MCP tab). Once a tool connects to agent-nexus, every server in the list is forwarded to it automatically:

```bash
npx -y @wallace921029/agent-nexus mcp snippets --npx   # print per-tool connect snippets — copy & paste
npx -y @wallace921029/agent-nexus mcp check            # test each server's connectivity
```

You can also define per-tool subsets (profiles) — for example, let one tool see only some of the servers. Configure them in the panel's MCP tab or under `mcpProfiles` in `.config/config.json`.

## Command reference

| Command | What it does |
|---|---|
| `init` | Initialize `~/.agent-nexus` |
| `web` | Start the web panel (`-p` to change the port, `--no-open` to skip opening the browser) |
| `sync-agents` | Render AGENTS.md and distribute it (`-t` limit to tools, `-r` retract, `-n` dry run) |
| `link-skills` | Distribute skills (`-s`/`-t` limit scope, `-r` retract, `-n` dry run) |
| `status` | Show each tool's integration status |
| `doctor` | Health check: broken links, conflicts, missing files |
| `mcp snippets` | Print per-tool MCP connect snippets (`--npx` for the npx form) |
| `mcp check` | Test MCP server connectivity |

## Notes

- Skills enabled for Codex live in `~/.agents/skills`, which Copilot / OpenCode / ZCode also scan — they will see those skills too
- Windows: directories use junctions (no admin rights needed); file symlinks require enabling Developer Mode once — without it, files are copied instead and flagged in `status`
- Each machine keeps its own copy; there is no cross-device sync. The center directory can be relocated with `--center` or the `NEXUS_CENTER` environment variable
- The panel has no authentication and listens on localhost only — do not expose it to a network

## Running from source (development)

```bash
git clone https://github.com/wallace921029/agent-nexus.git
cd agent-nexus && npm install && npm run build
node dist/cli.js <command>   # same effect as the npx form
npm run dev:web              # panel development: backend + frontend hot reload, one command
npm test                     # MCP proxy end-to-end tests
```

MIT License
