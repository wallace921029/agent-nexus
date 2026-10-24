#!/usr/bin/env node
// e2e 测试用上游 MCP server：工具（含进度/失败/动态工具）、资源、提示词
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// 代理退出后若还有未完成的写入，静默退出而不是抛 EPIPE 崩溃栈
process.stdout?.on?.('error', (e) => {
  if (e.code === 'EPIPE') process.exit(0);
});

let dynamicOn = false;

const server = new Server(
  { name: 'fixture-upstream', version: '0.0.1' },
  { capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} } }
);

function tools() {
  const list = [
    { name: 'echo', description: '回显文本', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    { name: 'slow_echo', description: '慢速回显（发进度）', inputSchema: { type: 'object', properties: { text: { type: 'string' }, seconds: { type: 'number', default: 2 } }, required: ['text'] } },
    { name: 'fail', description: '总是返回 isError', inputSchema: { type: 'object', properties: {} } },
    { name: 'toggle_tool', description: '切换 dynamic_tool 可见性并广播 list_changed', inputSchema: { type: 'object', properties: {} } },
  ];
  if (dynamicOn) list.push({ name: 'dynamic_tool', description: '动态出现的工具', inputSchema: { type: 'object', properties: {} } });
  return list;
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools() }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};
  const token = req.params._meta?.progressToken;

  if (name === 'echo') return { content: [{ type: 'text', text: String(args.text ?? '') }] };

  if (name === 'slow_echo') {
    const totalMs = Math.max(0.2, Number(args.seconds ?? 2)) * 1000;
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, totalMs / steps));
      await server.notification({
        method: 'notifications/progress',
        params: { progress: i, total: steps, ...(token !== undefined ? { progressToken: token } : {}) },
      });
    }
    return { content: [{ type: 'text', text: String(args.text ?? '') }] };
  }

  if (name === 'fail') return { content: [{ type: 'text', text: 'boom（上游故意失败）' }], isError: true };

  if (name === 'toggle_tool') {
    dynamicOn = !dynamicOn;
    await server.notification({ method: 'notifications/tools/list_changed' });
    return { content: [{ type: 'text', text: dynamicOn ? 'dynamic_tool ON' : 'dynamic_tool OFF' }] };
  }

  return { content: [{ type: 'text', text: `未知工具：${name}` }], isError: true };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [{ uri: 'nx://hello', name: 'hello', mimeType: 'text/plain' }],
}));
server.setRequestHandler(ReadResourceRequestSchema, async (req) => ({
  contents: [{ uri: req.params.uri, mimeType: 'text/plain', text: 'hello from fixture' }],
}));

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [{ name: 'greet', description: '生成问候', arguments: [{ name: 'name', required: true }] }],
}));
server.setRequestHandler(GetPromptRequestSchema, async (req) => ({
  messages: [{ role: 'user', content: { type: 'text', text: `你好，${req.params.arguments?.name ?? ''}` } }],
}));

await server.connect(new StdioServerTransport());
