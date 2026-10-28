import * as http from 'node:http';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { syncAgents } from './agentsmd.js';
import { loadConfig, mcpJsonIssues, updateMcpProfile, updateTargetSettings, enabledTargets, type NexusConfig } from './config.js';
import { PAGE_HTML } from './page.js';
import { applySkills } from './skills.js';
import { buildSnippets, localMcpEntry } from './snippets.js';
import { runDoctor } from './status.js';
import { effectiveTarget, TARGET_IDS, type TargetId } from './targets.js';
import { VERSION } from './version.js';

/**
 * agent-nexus web：本地网页面板（仅绑定 127.0.0.1）。
 * 页面在 src/page.ts；本文件只做 API：
 *   GET  /api/state        总览（status/矩阵/doctor/mcp 配置/接入片段）
 *   POST /api/sync-agents  { targets?, retract?, dryRun? }
 *   POST /api/link-skills  { skills?, targets?, retract?, dryRun? }
 *   POST /api/skill-create { name }
 *   POST /api/mcp-profile { tool, upstreams }   按工具开关服务器子集（写 .config mcpProfiles）
 *   mcp.json 只读展示：服务器定义的编辑统一走 Files 模块的 /api/fs/write（配置源唯一）
 */

export interface WebOptions {
  centerRoot: string;
  port: number;
  open: boolean;
}

function json(res: http.ServerResponse, code: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(data);
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1024 * 1024) throw new Error('request body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

function filterIds(raw: unknown): TargetId[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out = raw.filter((v): v is TargetId => typeof v === 'string' && (TARGET_IDS as readonly string[]).includes(v));
  return out.length ? out : undefined;
}

function openBrowser(url: string): void {
  try {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* 打不开就让用户手动访问 */
  }
}

/** 文件模块的路径安全解析：只允许访问中心工作区之内 */
function safeFsPath(centerRoot: string, rel: string): string {
  const root = path.resolve(centerRoot);
  const p = path.resolve(root, rel);
  if (p !== root && !p.startsWith(root + path.sep)) {
    throw new Error('paths outside the center workspace are not allowed');
  }
  return p;
}

const FS_READ_LIMIT = 512 * 1024;
const FS_WRITE_LIMIT = 1024 * 1024;

/** 只读探测：按各工具自己的（可覆盖）MCP 配置路径，找已存在的 agent-nexus-mcp 条目名 */
function detectNexusMcp(cfg: NexusConfig): Record<string, string[]> {
  const home = os.homedir();
  const NAME_RE = /^agent-nexus-mcp(-[A-Za-z0-9._-]+)?$/;
  const keys = (o: unknown): string[] =>
    o && typeof o === 'object' ? Object.keys(o).filter((k) => NAME_RE.test(k)) : [];
  const readJson = (p: string): any => {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  };

  const out: Record<string, string[]> = {};
  for (const def of enabledTargets(cfg)) {
    const eff = effectiveTarget(home, def, cfg.targets[def.id]);
    let p = eff.mcpConfig;
    if (!fs.existsSync(p)) {
      // opencode 常用 .jsonc 变体：配置路径的 .json 不存在时尝试同名 .jsonc
      if (def.id === 'opencode' && p.endsWith('.json') && fs.existsSync(p + 'c')) p += 'c';
      else {
        out[def.id] = [];
        continue;
      }
    }
    // dsh：YAML patch 文件里的 serverName 行
    if (def.id === 'dsh') {
      const found = new Set<string>();
      for (const m of fs.readFileSync(p, 'utf8').matchAll(/serverName:\s*([A-Za-z0-9_-]{1,32})/g)) {
        if (NAME_RE.test(m[1])) found.add(m[1]);
      }
      out[def.id] = [...found];
      continue;
    }
    if (def.id === 'codex') {
      const found = new Set<string>();
      for (const m of fs.readFileSync(p, 'utf8').matchAll(/^\s*\[mcp_servers\.([A-Za-z0-9._-]+)\]/gm)) {
        if (NAME_RE.test(m[1])) found.add(m[1]);
      }
      out[def.id] = [...found];
      continue;
    }
    let raw: any;
    if (def.id === 'opencode') {
      const txt = fs
        .readFileSync(p, 'utf8')
        .replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
        .replace(/,(\s*[}\]])/g, '$1');
      try {
        raw = JSON.parse(txt);
      } catch {
        raw = null;
      }
    } else {
      raw = readJson(p);
    }
    out[def.id] = keys(def.id === 'zcode' ? raw?.mcp?.servers : def.id === 'opencode' ? raw?.mcp : raw?.mcpServers);
  }
  return out;
}

export async function startWebServer(opts: WebOptions): Promise<{ server: http.Server; url: string }> {
  const center = opts.centerRoot;

  const state = async () => {
    const report = await runDoctor(center);
    const cfg = loadConfig(center);
    // 每工具自己的（可覆盖）MCP 配置路径 → 展示用 ~ 相对形式；片段全部按 effective 路径生成
    const home = os.homedir();
    const displayPaths: Record<string, string> = {};
    for (const def of enabledTargets(cfg)) {
      const eff = effectiveTarget(home, def, cfg.targets[def.id]);
      displayPaths[def.id] = eff.mcpConfig.startsWith(home) ? '~' + eff.mcpConfig.slice(home.length) : eff.mcpConfig;
    }
    // 从 npx 缓存运行时（~/.npm/_npx/…）本地路径易失效，接入片段自动改用 npx 形式
    const useNpxSnippet = localMcpEntry().includes(`${path.sep}_npx${path.sep}`);
    const snippets: Record<string, ReturnType<typeof buildSnippets>> = {};
    // 第一项 default = 通用入口（server 名 agent-nexus-mcp，适用于所有工具）
    snippets['default'] = buildSnippets({ profile: 'default', localEntry: localMcpEntry(), useNpx: useNpxSnippet, paths: displayPaths });
    // 其余每个工具一个以自己名字命名的 profile（即使默认路径相同也各自独立，不合并）
    for (const id of TARGET_IDS) {
      snippets[id] = buildSnippets({ profile: id, localEntry: localMcpEntry(), useNpx: useNpxSnippet, paths: displayPaths });
    }
    // mcp.json 由 Files 模块手编，这里负责暴露语法/格式/校验问题
    const mcpIssues = mcpJsonIssues(center, cfg);
    return {
      version: VERSION,
      center,
      // 展示用 ~ 缩写路径（完整路径仍在 center 字段，供悬停提示）
      centerDisplay: center === home ? '~' : center.startsWith(home) ? '~' + center.slice(home.length) : center,
      skills: report.status.skills,
      status: report.status,
      doctor: { issues: report.issues, warnings: report.warnings },
      targetSettings: cfg.targets,
      mcp: cfg.mcp,
      mcpIssues,
      mcpConnected: detectNexusMcp(cfg),
      snippets,
    };
  };

  const server = http.createServer(async (req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const q = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
    try {
      if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
        // no-store：本地面板经常重建，避免浏览器缓存住旧版页面
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(PAGE_HTML);
        return;
      }
      if (url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === 'GET' && url === '/api/state') {
        json(res, 200, await state());
        return;
      }
      if (req.method === 'POST' && url === '/api/sync-agents') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const rows = await syncAgents(center, {
          only: filterIds(body.targets),
          dryRun: !!body.dryRun,
          retract: !!body.retract,
        });
        json(res, 200, { rows });
        return;
      }
      if (req.method === 'POST' && url === '/api/link-skills') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const skills = Array.isArray(body.skills) ? body.skills.filter((s: unknown) => typeof s === 'string') : undefined;
        const rows = await applySkills(center, {
          skills,
          targets: filterIds(body.targets),
          retract: !!body.retract,
          dryRun: !!body.dryRun,
        });
        json(res, 200, { rows });
        return;
      }
      if (req.method === 'POST' && url === '/api/skill-create') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const name = String(body.name ?? '').trim();
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
          json(res, 400, { error: 'name may only contain alphanumerics . _ - starting with a letter/digit (max 64 chars)' });
          return;
        }
        const dir = path.join(center, 'skills', name);
        if (fs.existsSync(dir)) {
          json(res, 400, { error: `already exists: skills/${name}` });
          return;
        }
        fs.mkdirSync(dir, { recursive: true });
        const tmpl = `---\nname: ${name}\ndescription: TODO: one line describing when to use this skill\n---\n\n# ${name}\n\nTODO: write the skill instructions here.\n`;
        fs.writeFileSync(path.join(dir, 'SKILL.md'), tmpl);
        json(res, 200, { ok: true, detail: `created skills/${name}/SKILL.md; edit it, then tick it on the Skills page` });
        return;
      }
      if (req.method === 'POST' && url === '/api/target-paths') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const id = String(body.id ?? '');
        if (!(TARGET_IDS as readonly string[]).includes(id)) {
          json(res, 400, { error: `unknown target id: ${id}` });
          return;
        }
        const key = body.key;
        const value = body.value;
        if (value != null && typeof value !== 'string') {
          json(res, 400, { error: 'value must be a string or null (null = reset to default)' });
          return;
        }
        const v = value == null || value.trim() === '' ? null : value.trim();
        if (key === 'skillsDir') {
          updateTargetSettings(center, id as TargetId, { skillsDir: v });
        } else if (key === 'instructions') {
          updateTargetSettings(center, id as TargetId, { instructions: v });
        } else if (key === 'mcpConfig') {
          updateTargetSettings(center, id as TargetId, { mcpConfig: v });
        } else {
          json(res, 400, { error: 'key must be skillsDir, instructions or mcpConfig' });
          return;
        }
        json(res, 200, { ok: true, detail: v === null ? 'reset to the default path' : `updated ${key} of ${id}: ${v}` });
        return;
      }
      if (req.method === 'GET' && url === '/api/fs/list') {
        try {
          const rel = q.get('path') ?? '';
          const dirPath = safeFsPath(center, rel);
          const st = fs.statSync(dirPath);
          if (!st.isDirectory()) throw new Error('not a directory');
          const entries = fs
            .readdirSync(dirPath, { withFileTypes: true })
            .map((e) => ({
              name: e.name,
              dir: e.isDirectory(),
              size: e.isFile() ? fs.statSync(path.join(dirPath, e.name)).size : undefined,
            }))
            .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(a.name));
          json(res, 200, { path: rel, entries });
        } catch (e) {
          json(res, 400, { error: (e as Error).message });
        }
        return;
      }
      if (req.method === 'GET' && url === '/api/fs/search') {
        try {
          const needle = (q.get('q') ?? '').toLowerCase();
          if (!needle) {
            json(res, 200, { results: [] });
            return;
          }
          const results: Array<{ path: string; dir: boolean; size?: number }> = [];
          const walk = (rel: string, depth: number): void => {
            if (results.length >= 200 || depth > 8) return;
            let entries: fs.Dirent[];
            try {
              entries = fs.readdirSync(safeFsPath(center, rel), { withFileTypes: true });
            } catch {
              return;
            }
            for (const e of entries) {
              const p = rel ? `${rel}/${e.name}` : e.name;
              if (e.isDirectory()) walk(p, depth + 1);
              else if (e.name.toLowerCase().includes(needle)) {
                try {
                  results.push({ path: p, dir: false, size: fs.statSync(safeFsPath(center, p)).size });
                } catch {
                  /* stat 失败跳过 */
                }
              }
            }
          };
          walk('', 0);
          results.sort((a, b) => a.path.localeCompare(b.path));
          json(res, 200, { results });
        } catch (e) {
          json(res, 400, { error: (e as Error).message });
        }
        return;
      }
      if (req.method === 'GET' && url === '/api/fs/read') {
        try {
          const rel = q.get('path') ?? '';
          const filePath = safeFsPath(center, rel);
          const st = fs.statSync(filePath);
          if (!st.isFile()) throw new Error('not a file');
          if (st.size > FS_READ_LIMIT) throw new Error(`file is ${(st.size / 1024).toFixed(0)}KB, over the 512KB limit; not editable in browser`);
          const buf = fs.readFileSync(filePath);
          if (buf.includes(0)) throw new Error('looks like a binary file; not editable in browser');
          json(res, 200, { path: rel, content: buf.toString('utf8'), bytes: st.size });
        } catch (e) {
          json(res, 400, { error: (e as Error).message });
        }
        return;
      }
      if (req.method === 'POST' && url === '/api/fs/write') {
        try {
          const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
          const rel = String(body.path ?? '');
          const content = String(body.content ?? '');
          if (content.length > FS_WRITE_LIMIT) throw new Error('content exceeds the 1MB limit');
          const filePath = safeFsPath(center, rel);
          const base = path.basename(filePath);
          if (!base || /[<>:"|?*\x00]/.test(base)) throw new Error('invalid file name');
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, content);
          json(res, 200, { ok: true, bytes: Buffer.byteLength(content) });
        } catch (e) {
          json(res, 400, { error: (e as Error).message });
        }
        return;
      }
      if (req.method === 'POST' && url === '/api/mcp-profile') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const tool = String(body.tool ?? '');
        // default = 通用 profile（适用所有工具）；其余必须是注册过的工具 id
        if (tool !== 'default' && !TARGET_IDS.includes(tool as TargetId)) {
          json(res, 400, { error: `unknown tool "${tool}"` });
          return;
        }
        const profile = tool;
        // 写入前过滤掉 mcp.json 里已不存在的名字，避免悬空引用拖垮代理
        const servers = Object.keys(loadConfig(center).mcp.upstreams);
        const list = Array.isArray(body.upstreams) ? body.upstreams.map(String).filter((u: string) => servers.includes(u)) : [];
        updateMcpProfile(center, profile, list);
        json(res, 200, { ok: true, detail: `profile "${profile}" → ${list.length} server(s)` });
        return;
      }
      json(res, 404, { error: 'not found' });
    } catch (e) {
      json(res, 500, { error: (e as Error).message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  const url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : opts.port}/`;
  console.log(`agent-nexus web panel: ${url}`);
  console.log(`center: ${center} (listening on 127.0.0.1 only, Ctrl+C to stop)`);
  if (opts.open) openBrowser(url);
  return { server, url };
}
