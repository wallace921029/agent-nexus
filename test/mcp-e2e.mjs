#!/usr/bin/env node
// agent-nexus-mcp 聚合代理端到端测试：
// 启动真实上游 fixture → 通过代理（dist/mcp.js）逐项验证聚合能力。
// 运行：node test/mcp-e2e.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-mcp-e2e-'));
const cfgFile = path.join(tmp, 'mcp.json');
fs.writeFileSync(
  cfgFile,
  JSON.stringify({
    mcpServers: {
      fixture: { command: process.execPath, args: [path.join(root, 'test', 'upstream-fixture.mjs')] },
      disabled_one: { command: 'no-such-command-xyz', args: [], disabled: true },
    },
    mcpProfiles: {
      default: '*',
      minimal: [],
    },
  })
);

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`✓ ${name}`);
  } else {
    fail++;
    console.log(`✗ ${name} ${detail}`);
  }
}

const client = new Client({ name: 'e2e-client', version: '0.0.1' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'dist', 'mcp.js'), '--mcp-config', cfgFile, '--profile', 'default'],
});

try {
  await client.connect(transport);

  // 1. 初始化 + 命名空间
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  check('代理初始化并聚合工具列表', names.length >= 4, names.join(','));
  check('工具名带 上游__ 前缀', names.includes('fixture__echo') && names.includes('fixture__slow_echo'));
  check('disabled 上游被排除', !names.some((n) => n.startsWith('disabled_one__')));
  check('描述带上游标注', (tools.find((t) => t.name === 'fixture__echo')?.description ?? '').includes('[fixture]'));

  // 2. 普通调用往返
  const r1 = await client.callTool({ name: 'fixture__echo', arguments: { text: '你好 nexus' } });
  check('工具调用往返', r1.content?.[0]?.text === '你好 nexus', JSON.stringify(r1).slice(0, 120));

  // 3. 进度通知透传（token 缝合链路）
  let progressCount = 0;
  const r2 = await client.callTool(
    { name: 'fixture__slow_echo', arguments: { text: 'slow', seconds: 1.2 } },
    undefined,
    { onprogress: () => progressCount++ }
  );
  check('进度通知透传到下游', progressCount >= 2, `progress=${progressCount}`);
  check('慢调用结果正确', r2.content?.[0]?.text === 'slow');

  // 4. 取消透传
  let cancelled = false;
  try {
    await client.callTool(
      { name: 'fixture__slow_echo', arguments: { text: 'x', seconds: 60 } },
      undefined,
      { signal: AbortSignal.timeout(500) }
    );
  } catch {
    cancelled = true;
  }
  check('取消信号透传（500ms 中断 60s 调用）', cancelled);

  // 5. 上游错误结果透传
  const r4 = await client.callTool({ name: 'fixture__fail', arguments: {} });
  check('上游 isError 结果原样透传', r4.isError === true);

  // 6. tools/list_changed 透传 + 缓存刷新
  let listChanged = false;
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    listChanged = true;
  });
  await client.callTool({ name: 'fixture__toggle_tool', arguments: {} });
  await new Promise((r) => setTimeout(r, 600));
  check('tools list_changed 通知透传', listChanged);
  const tools2 = await client.listTools();
  check('动态工具出现（缓存已刷新）', tools2.tools.some((t) => t.name === 'fixture__dynamic_tool'));
  await client.callTool({ name: 'fixture__toggle_tool', arguments: {} });
  await new Promise((r) => setTimeout(r, 400));

  // 7. 资源
  const res = await client.listResources();
  check('资源列表透传', res.resources.some((r) => String(r.uri) === 'nx://hello'));
  const rr = await client.readResource({ uri: 'nx://hello' });
  check('资源读取按 URI 路由', rr.contents?.[0]?.text === 'hello from fixture');

  // 8. 提示词（前缀 + 路由）
  const pr = await client.listPrompts();
  check('提示词列表带前缀', pr.prompts.some((p) => p.name === 'fixture__greet'));
  const gp = await client.getPrompt({ name: 'fixture__greet', arguments: { name: 'agent' } });
  check('提示词获取路由', gp.messages?.[0]?.content?.text === '你好，agent');

  // 9. 未知工具报错
  let unknownErr = false;
  try {
    await client.callTool({ name: 'nope__echo', arguments: {} });
  } catch {
    unknownErr = true;
  }
  check('未知上游前缀返回错误', unknownErr);

  await client.close();

  // 10. 结构化日志
  const logDir = path.join(tmp, '.mcp-logs');
  const logFiles = fs.existsSync(logDir) ? fs.readdirSync(logDir) : [];
  const logOk = logFiles.some((f) => {
    const lines = fs.readFileSync(path.join(logDir, f), 'utf8').trim().split('\n');
    return lines.some((l) => l.includes('"event":"tool_ok"')) && lines.some((l) => l.includes('"event":"upstream_connected"'));
  });
  check('结构化 JSONL 日志已写入', logOk, logDir);

  // 11. 空 profile 也能启动（0 上游）
  const c2 = new Client({ name: 'e2e-client2', version: '0.0.1' });
  const t2 = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, 'dist', 'mcp.js'), '--mcp-config', cfgFile, '--profile', 'minimal'],
  });
  await c2.connect(t2);
  const empty = await c2.listTools();
  check('空 profile 启动且工具数为 0', empty.tools.length === 0);
  await c2.close();

  // 12. mcp check 子命令
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('node', [path.join(root, 'dist', 'cli.js'), 'mcp', 'check', '--mcp-config', cfgFile], { encoding: 'utf8' });
  check('mcp check reports upstream health', out.includes('fixture') && out.includes('tools 4'));
} catch (e) {
  fail++;
  console.log(`✗ e2e 异常中断：${e && e.message ? e.message : String(e)}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
