#!/usr/bin/env node
// agent-nexus-mcp：MCP 聚合代理入口（stdio）
// Usage:agent-nexus-mcp [--profile <名>] [--center <中心路径>|NEXUS_CENTER] [--mcp-config <独立json>]
import { runProxy } from './mcproxy.js';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.error(`agent-nexus-mcp — MCP aggregator proxy (stdio)

选项：
  --profile <name>    which profile to use (default: default = all upstreams)
  --center <path>     center workspace path (default: ~/.agent-nexus or NEXUS_CENTER env)
  --mcp-config <file> use a standalone config { "mcpServers": {...}, "mcpProfiles": {...} } instead of the center`);
  process.exit(0);
}

function argValue(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

const profile = argValue('--profile') ?? 'default';
const standaloneConfig = argValue('--mcp-config');
const centerRoot = argValue('--center') ?? process.env.NEXUS_CENTER;

runProxy({ profile, standaloneConfig, centerRoot }).catch((e: Error) => {
  console.error(`[agent-nexus-mcp] startup failed: ${e.message}`);
  process.exit(1);
});
