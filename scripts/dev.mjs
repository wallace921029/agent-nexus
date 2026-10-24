#!/usr/bin/env node
// 一条命令启动面板开发环境：后端（node dist/cli.js web，8741）+ 前端（Vite，5173）
// - 8741 已有面板后端在运行时自动复用，不重复启动
// - Ctrl+C / 任一子进程退出时，全部一起退出
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB_PORT = 8741;
const VITE_PORT = 5173;
const IS_WIN = process.platform === 'win32';

async function backendAlive() {
  try {
    const res = await fetch(`http://127.0.0.1:${WEB_PORT}/api/state`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

if (!existsSync(path.join(root, 'dist', 'cli.js'))) {
  console.log('[dev] dist/cli.js missing — building the CLI first (npm run build)…');
  const r = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: IS_WIN });
  if (r.status !== 0) process.exit(1);
}

const children = [];
let stopped = false;

function prefixPipe(name, p) {
  const write = (stream, chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) stream.write(`[${name}] ${line}\n`);
    }
  };
  p.stdout.on('data', (d) => write(process.stdout, d));
  p.stderr.on('data', (d) => write(process.stderr, d));
  p.on('exit', (code) => {
    if (stopped) return;
    console.error(`\n[${name}] process exited (code=${code}), shutting down all…`);
    cleanup();
    process.exit(code ?? 1);
  });
}

function launch(name, cmd, args, cwd) {
  // detached（POSIX）让子进程自成进程组，退出时整组带走，避免孤儿
  const p = spawn(cmd, args, { cwd, shell: IS_WIN, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], detached: !IS_WIN });
  children.push(p);
  prefixPipe(name, p);
  return p;
}

function killTree(p) {
  try {
    if (IS_WIN) {
      p.kill();
    } else {
      process.kill(-p.pid, 'SIGTERM'); // 进程组
    }
  } catch {
    try {
      p.kill('SIGTERM');
    } catch {
      /* 已退出 */
    }
  }
}

function cleanup() {
  if (stopped) return;
  stopped = true;
  for (const c of children) killTree(c);
}

process.on('SIGINT', () => {
  console.log('\n[dev] Ctrl+C received, shutting down…');
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

if (await backendAlive()) {
  console.log(`[web ] a panel backend is already running on ${WEB_PORT}, reusing it`);
} else {
  console.log(`[web ] starting panel backend on 127.0.0.1:${WEB_PORT}`);
  launch('web ', 'node', [path.join('dist', 'cli.js'), 'web', '--no-open', '-p', String(WEB_PORT)], root);
}
console.log('[vite] starting the Vite dev server…');
const viteBin = path.join(root, 'webui', 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(viteBin)) {
  console.error('[vite] missing dependencies: run npm install inside webui/ first');
  cleanup();
  process.exit(1);
}
launch('vite', process.execPath, [viteBin], path.join(root, 'webui'));

console.log(`[dev ] ready: frontend http://localhost:${VITE_PORT} (/api proxied to ${WEB_PORT}), Ctrl+C stops both`);

// 尽力打开浏览器（失败不影响）
setTimeout(() => {
  try {
    const opener = IS_WIN ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = IS_WIN ? ['/c', 'start', '', `http://localhost:${VITE_PORT}`] : [`http://localhost:${VITE_PORT}`];
    spawn(opener, args, { stdio: 'ignore', detached: true, shell: IS_WIN }).unref();
  } catch {
    /* ignore */
  }
}, 1800);
