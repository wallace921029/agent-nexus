import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSnippets } from '../dist/snippets.js';
import { startWebServer } from '../dist/web.js';

const snippet = buildSnippets({ profile: 'opencode', localEntry: '/tmp/mcp.js', useNpx: false })
  .find((item) => item.id === 'opencode');
const config = JSON.parse(snippet.content);
assert.equal(config.$schema, 'https://opencode.ai/config.json');
assert.deepEqual(config.mcp.servers['agent-nexus-mcp-opencode'].command, ['node', '/tmp/mcp.js', '--profile', 'opencode']);
assert.equal(config.mcp.servers['agent-nexus-mcp-opencode'].type, 'local');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-opencode-test-'));
const oldHome = process.env.HOME;
process.env.HOME = tmp;
let server;
try {
  const configDir = path.join(tmp, '.config', 'opencode');
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, 'opencode.jsonc');
  const centerRoot = path.join(tmp, 'center');
  fs.mkdirSync(centerRoot);
  const web = await startWebServer({ centerRoot, port: 0, open: false });
  server = web.server;
  const detected = async () => {
    const response = await fetch(new URL('api/state', web.url));
    assert.equal(response.status, 200);
    return (await response.json()).mcpConnected.opencode;
  };
  fs.writeFileSync(configPath, `{
    // OpenCode V2 configuration with comments and trailing commas.
    "$schema": "https://opencode.ai/config.json",
    "mcp": {
      "agent-nexus-mcp": { "type": "local", "command": ["node"] },
      "servers": { "agent-nexus-mcp-opencode": { "type": "local", "command": ["node"], }, },
    },
  }`);
  assert.deepEqual(await detected(), ['agent-nexus-mcp-opencode']);
  fs.writeFileSync(configPath, '{ invalid json');
  assert.deepEqual(await detected(), []);
  console.log('OpenCode V2 configuration checks passed');
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (oldHome === undefined) delete process.env.HOME;
  else process.env.HOME = oldHome;
  fs.rmSync(tmp, { recursive: true, force: true });
}
