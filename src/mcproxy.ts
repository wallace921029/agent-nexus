import * as fs from 'node:fs';
import * as path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  PromptListChangedNotificationSchema,
  Prompt,
  ReadResourceRequestSchema,
  Resource,
  ResourceListChangedNotificationSchema,
  Tool,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, loadStandaloneMcpConfig, type McpConfig, type McpUpstream } from './config.js';
import { findCenterRoot } from './paths.js';

/**
 * agent-nexus-mcp 聚合代理核心。
 *
 * - 对下游 Agent 表现为一个 stdio MCP Server；对上游同时是多个 MCP Client
 * - 工具/提示词名统一加 `上游名__` 前缀，重名靠前缀天然消解；资源按 URI 路由
 * - 透传：tools/resources/prompts 列表与读取、list_changed 通知、进度通知、取消（AbortSignal）
 * - 不透传：sampling/elicitation（罕用）；上游 HTTP 鉴权头由配置集中管理
 * - 所有事件写结构化 JSONL 日志（<center>/.config/mcp-logs/<profile>-<日期>.jsonl）
 */

const PROXY_VERSION = '0.1.0';
const CONNECT_TIMEOUT_MS = 20000;
const TOOL_TIMEOUT_MS = 60000;

export interface ProxyOptions {
  profile: string;
  centerRoot?: string;
  standaloneConfig?: string;
}

interface UpstreamState {
  name: string;
  def: McpUpstream;
  client: Client;
  alive: boolean;
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
  /** 资源 URI → 上游名（用于 ReadResource 路由） */
  resourceOwners: Map<string, string>;
}

type EventLog = (event: Record<string, unknown>) => void;

function makeLogger(logDir: string | null, profile: string): EventLog {
  if (!logDir) return () => {};
  return (event) => {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      fs.appendFileSync(
        path.join(logDir, `${profile}-${day}.jsonl`),
        JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n'
      );
    } catch {
      /* 日志失败不影响代理 */
    }
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} (timed out after ${ms}ms)`)), ms)),
  ]);
}

function resolveConfig(opts: ProxyOptions): { mcp: McpConfig; logDir: string; center: string | null } {
  if (opts.standaloneConfig) {
    return {
      mcp: loadStandaloneMcpConfig(opts.standaloneConfig),
      logDir: path.join(path.dirname(path.resolve(opts.standaloneConfig)), '.mcp-logs'),
      center: null,
    };
  }
  const center = opts.centerRoot ?? findCenterRoot();
  const cfg = loadConfig(center);
  return { mcp: cfg.mcp, logDir: path.join(center, '.config', 'mcp-logs'), center };
}

export function resolveProfileUpstreams(mcp: McpConfig, profileName: string): { names: string[]; error?: string } {
  const profile = mcp.profiles[profileName];
  if (!profile) {
    return { names: [], error: `profile "${profileName}" does not exist (available: ${Object.keys(mcp.profiles).join(', ') || 'none'})` };
  }
  const all = Object.entries(mcp.upstreams)
    .filter(([, u]) => !u.disabled)
    .map(([n]) => n);
  if (profile.upstreams === '*') return { names: all };
  const missing = profile.upstreams.filter((u) => !(u in mcp.upstreams));
  if (missing.length) return { names: [], error: `profile "${profileName}" references unknown upstreams: ${missing.join(', ')}` };
  return { names: profile.upstreams.filter((n) => !mcp.upstreams[n].disabled) };
}

async function connectUpstream(name: string, def: McpUpstream, log: EventLog): Promise<UpstreamState> {
  const client = new Client({ name: 'agent-nexus-mcp', version: PROXY_VERSION });
  const transport =
    def.type === 'http'
      ? new StreamableHTTPClientTransport(new URL(def.url as string), {
          requestInit: { headers: def.headers ?? {} },
        })
      : new StdioClientTransport({
          command: def.command as string,
          args: def.args ?? [],
          env: { ...(process.env as Record<string, string>), ...def.env },
          cwd: def.cwd,
          stderr: 'inherit', // 上游 stderr 直接透传，便于排障
        });

  const state: UpstreamState = {
    name,
    def,
    client,
    alive: false,
    tools: [],
    resources: [],
    prompts: [],
    resourceOwners: new Map(),
  };

  await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `upstream ${name} connect`);
  state.alive = true;
  log({ event: 'upstream_connected', upstream: name, type: def.type });
  return state;
}

async function refreshCaches(state: UpstreamState): Promise<void> {
  const [tools, resources, prompts] = await Promise.all([
    state.client.listTools().then((r) => r.tools).catch(() => state.tools),
    state.client.listResources().then((r) => r.resources).catch(() => state.resources),
    state.client.listPrompts().then((r) => r.prompts).catch(() => state.prompts),
  ]);
  state.tools = tools;
  state.resources = resources;
  state.prompts = prompts;
  state.resourceOwners = new Map(resources.map((r) => [String(r.uri), state.name]));
}

function prefixed(name: string, up: string): string {
  return `${up}__${name}`;
}

export interface BuiltProxy {
  server: Server;
  states: UpstreamState[];
  failures: Array<{ name: string; error: string }>;
}

/** 连接上游并构建聚合 Server（不启动 stdio 传输层；测试可直接复用） */
export async function buildProxy(opts: ProxyOptions): Promise<BuiltProxy> {
  const { mcp, logDir } = resolveConfig(opts);
  const log = makeLogger(logDir, opts.profile);

  const { names, error } = resolveProfileUpstreams(mcp, opts.profile);
  if (error) throw new Error(error);

  const settled = await Promise.all(
    names.map((n) =>
      connectUpstream(n, mcp.upstreams[n], log)
        .then((s) => ({ ok: true as const, s }))
        .catch((e: Error) => ({ ok: false as const, name: n, error: e.message }))
    )
  );
  const states = settled.filter((r) => r.ok).map((r) => (r as { ok: true; s: UpstreamState }).s);
  const failures = settled.filter((r) => !r.ok).map((r) => ({ name: (r as { ok: false; name: string; error: string }).name, error: (r as { ok: false; error: string }).error }));
  for (const f of failures) log({ event: 'upstream_failed', upstream: f.name, error: f.error });

  await Promise.all(states.map(refreshCaches));

  const server = new Server(
    { name: 'agent-nexus-mcp', version: PROXY_VERSION },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
      },
      instructions: `agent-nexus aggregator proxy (profile=${opts.profile}). Tool names follow "upstream__tool". Upstreams: ${states.map((s) => s.name).join(', ') || '(none)'}.`,
    }
  );

  const notifyToolsChanged = () => void server.notification({ method: 'notifications/tools/list_changed' }).catch(() => {});

  for (const state of states) {
    state.client.onclose = () => {
      state.alive = false;
      log({ event: 'upstream_closed', upstream: state.name });
      notifyToolsChanged();
    };
    state.client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      await refreshCaches(state).catch(() => {});
      log({ event: 'list_changed', upstream: state.name, kind: 'tools' });
      notifyToolsChanged();
    });
    state.client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => {
      await refreshCaches(state).catch(() => {});
      log({ event: 'list_changed', upstream: state.name, kind: 'resources' });
      void server.notification({ method: 'notifications/resources/list_changed' }).catch(() => {});
    });
    state.client.setNotificationHandler(PromptListChangedNotificationSchema, async () => {
      await refreshCaches(state).catch(() => {});
      log({ event: 'list_changed', upstream: state.name, kind: 'prompts' });
      void server.notification({ method: 'notifications/prompts/list_changed' }).catch(() => {});
    });
  }

  const findOwner = (prefixedName: string): { state: UpstreamState; original: string } | null => {
    const idx = prefixedName.indexOf('__');
    if (idx < 0) return null;
    const up = prefixedName.slice(0, idx);
    const original = prefixedName.slice(idx + 2);
    const state = states.find((s) => s.name === up && s.alive);
    return state ? { state, original } : null;
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: states.flatMap((s) =>
      s.tools.map((t) => ({
        ...t,
        name: prefixed(t.name, s.name),
        description: `[${s.name}] ${t.description ?? ''}`.trim(),
      }))
    ),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    const name = String(req.params.name);
    const started = Date.now();
    const owner = findOwner(name);
    if (!owner) {
      throw new McpError(ErrorCode.InvalidParams, `unknown tool: ${name} (or its upstream is down)`);
    }
    log({ event: 'tool_call', upstream: owner.state.name, tool: owner.original });
    // 下游 Agent 的 progressToken：SDK 会在回调里剥掉它，转发通知时必须缝回去
    const downstreamToken = (req.params._meta as Record<string, unknown> | undefined)?.progressToken;
    try {
      const result = await owner.state.client.callTool(
        { name: owner.original, arguments: req.params.arguments },
        undefined,
        {
          signal: extra.signal,
          timeout: TOOL_TIMEOUT_MS,
          resetTimeoutOnProgress: true,
          onprogress: (p) => {
            void server
              .notification({
                method: 'notifications/progress',
                params: {
                  ...(p as Record<string, unknown>),
                  ...(downstreamToken !== undefined ? { progressToken: downstreamToken } : {}),
                },
              } as never)
              .catch(() => {});
          },
        }
      );
      log({ event: 'tool_ok', upstream: owner.state.name, tool: owner.original, ms: Date.now() - started });
      return result as object;
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      const cancelled = extra.signal.aborted || (e as Error).name === 'AbortError';
      log({ event: 'tool_error', upstream: owner.state.name, tool: owner.original, ms: Date.now() - started, cancelled, error: msg });
      if (cancelled) throw new McpError(ErrorCode.RequestTimeout, `tool call cancelled: ${name}`);
      throw e;
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: states.flatMap((s) => s.resources),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = String(req.params.uri);
    const ownerName = states.find((s) => s.resourceOwners.get(uri))?.name;
    const target = states.find((s) => s.name === ownerName) ?? states.find((s) => s.alive);
    if (!target) throw new McpError(ErrorCode.InvalidParams, `no live upstream to read resource: ${uri}`);
    return (await target.client.readResource({ uri: req.params.uri })) as object;
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: states.flatMap((s) =>
      s.prompts.map((p) => ({ ...p, name: prefixed(p.name, s.name), description: `[${s.name}] ${p.description ?? ''}`.trim() }))
    ),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const owner = findOwner(String(req.params.name));
    if (!owner) throw new McpError(ErrorCode.InvalidParams, `unknown prompt: ${req.params.name}`);
    return (await owner.state.client.getPrompt({
      name: owner.original,
      arguments: req.params.arguments,
    })) as object;
  });

  log({
    event: 'proxy_built',
    profile: opts.profile,
    upstreams: states.map((s) => s.name),
    failures: failures.map((f) => f.name),
  });

  return { server, states, failures };
}

/** bin 入口：构建并挂到 stdio */
export async function runProxy(opts: ProxyOptions): Promise<void> {
  // 下游 Agent 提前关闭 stdio 时，避免 EPIPE 崩溃栈：静默退出
  process.stdout?.on?.('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EPIPE') process.exit(0);
  });
  const { server, states, failures } = await buildProxy(opts);
  for (const f of failures) console.error(`[agent-nexus-mcp] upstream failed: ${f.name} — ${f.error} (others continue)`);
  console.error(`[agent-nexus-mcp] profile=${opts.profile}, ${states.length} upstream(s) ready: ${states.map((s) => s.name).join(', ') || 'none'}`);
  await server.connect(new StdioServerTransport());
  // stdio 断开（Agent 会话结束）→ 关闭所有上游子进程并退出
  server.onclose = async () => {
    await Promise.allSettled(states.map((s) => s.client.close()));
    process.exit(0);
  };
  await new Promise(() => {}); // 常驻直到 stdio 关闭
}

/** `agent-nexus mcp check`：逐上游连通性检查（不启动代理服务） */
export async function runCheck(opts: ProxyOptions): Promise<{ ok: boolean; report: string[] }> {
  const { mcp } = resolveConfig(opts);
  const { names, error } = resolveProfileUpstreams(mcp, opts.profile);
  if (error) return { ok: false, report: [error] };

  const noopLog = () => {};
  const lines: string[] = [`profile "${opts.profile}": ${names.length} upstream(s)`];
  let allOk = true;
  for (const n of names) {
    try {
      const s = await connectUpstream(n, mcp.upstreams[n], noopLog);
      await refreshCaches(s);
      lines.push(`✓ ${n} — tools ${s.tools.length}, resources ${s.resources.length}, prompts ${s.prompts.length}`);
      await s.client.close().catch(() => {});
    } catch (e) {
      allOk = false;
      lines.push(`✗ ${n} — ${(e as Error).message}`);
    }
  }
  return { ok: allOk, report: lines };
}
