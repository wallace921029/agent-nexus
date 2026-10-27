#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'node:path';
import { syncAgents, type SyncRow } from './agentsmd.js';
import { findCenterRoot, defaultCenter } from './paths.js';
import { runCheck, runProxy } from './mcproxy.js';
import { buildSnippets, localMcpEntry } from './snippets.js';
import { applySkills, listSkills, type SkillsRow } from './skills.js';
import { collectStatus, runDoctor } from './status.js';
import { initCenter } from './init.js';
import { TARGET_IDS, type TargetId } from './targets.js';
import { startWebServer } from './web.js';

const VERSION = '0.2.0';

const MARK: Record<string, string> = {
  linked: '✓ linked',
  relinked: '✓ updated',
  kept: '= up-to-date',
  copied: '✓ copied',
  'kept-copy': '= copy up-to-date',
  'refreshed-copy': '✓ copy refreshed',
  conflict: '✗ conflict',
  skipped: '- skipped',
  'not-ours': '- not ours',
  retracted: '✓ retracted',
};

function mark(kind: string): string {
  if (kind.startsWith('would')) return '[dry-run]';
  return MARK[kind] ?? kind;
}

function printRows(rows: Array<SyncRow | SkillsRow>): void {
  for (const r of rows) {
    const parts = [mark(r.kind).padEnd(10), `[${r.id}]`];
    if ('skill' in r && r.skill !== '-') parts.push(String(r.skill));
    const extra: string[] = [];
    if ('render' in r && r.render) extra.push(`rendered ${(r.render.bytes / 1024).toFixed(1)}KiB${r.render.overlayUsed ? ' (with overlay)' : ''}`);
    if (r.detail) extra.push(r.detail);
    const tail = extra.length ? `  — ${extra.join('; ')}` : '';
    console.log(`${parts.join(' ').padEnd(0)}  ${r.link}${tail}`);
  }
  const counts = new Map<string, number>();
  for (const r of rows) {
    const m = mark(r.kind);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  console.log(`\ntotal ${rows.length}: ` + [...counts.entries()].map(([k, n]) => `${k}×${n}`).join(', '));
}

function parseIds(raw: string[] | undefined): TargetId[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const out: TargetId[] = [];
  for (const chunk of raw) {
    for (const part of String(chunk).split(',')) {
      const v = part.trim();
      if (!v) continue;
      if (!(TARGET_IDS as readonly string[]).includes(v)) {
        throw new Error(`unknown target id: ${v} (valid: ${TARGET_IDS.join(', ')})`);
      }
      out.push(v as TargetId);
    }
  }
  return out.length ? out : undefined;
}

const program = new Command();
program
  .name('agent-nexus')
  .description('Unified config center for agent tools: AGENTS.md rendering & distribution, skills link matrix, MCP aggregator')
  .version(VERSION)
  .option('-c, --center <path>', 'center workspace path (default ~/.agent-nexus, or NEXUS_CENTER env)');

function centerOf(opts: { center?: string }): string {
  return opts.center ? findCenterRoot(opts.center) : findCenterRoot();
}

program
  .command('init')
  .description('Initialize the center workspace (AGENTS.md, mcp.json, skills/, .config/)')
  .option('--force', 'Continue even if files exist (never overwrites)')
  .action((opts: { force?: boolean }) => {
    const root = program.opts().center ? path.resolve(program.opts().center) : defaultCenter();
    const { created, existed } = initCenter(root, opts.force);
    for (const f of created) console.log(`✓ created ${f}`);
    for (const f of existed) console.log(`= exists ${f}`);
    console.log(`\nCenter workspace: ${root}\nNext: edit AGENTS.md, then run agent-nexus sync-agents`);
  });

program
  .command('sync-agents')
  .description('Render AGENTS.md (base + overlay) and distribute as symlinks/copies to each tool')
  .option('-t, --target <ids...>', 'only these targets, e.g. -t codex zcode')
  .option('-n, --dry-run', 'report actions without changing anything')
  .option('--force', 'distribute even if the tool dir is missing')
  .option('-r, --retract', 'retract instruction links (all when no -t given)')
  .action(async (opts: { target?: string[]; dryRun?: boolean; force?: boolean; retract?: boolean }) => {
    const center = centerOf(program.opts());
    const rows = await syncAgents(center, {
      only: parseIds(opts.target),
      dryRun: opts.dryRun,
      force: opts.force,
      retract: opts.retract,
    });
    printRows(rows);
  });

program
  .command('link-skills')
  .description('Link center skills into each tool user-level skills dir; no args = all skills × all targets')
  .option('-s, --skill <names...>', 'only these skills')
  .option('-t, --target <ids...>', 'only these targets')
  .option('-r, --retract', 'retract links (all when no --skill given)')
  .option('-n, --dry-run', 'report actions without changing anything')
  .option('--force', 'link even if the tool dir is missing')
  .action(async (opts: { skill?: string[]; target?: string[]; retract?: boolean; dryRun?: boolean; force?: boolean }) => {
    const center = centerOf(program.opts());
    const skills = opts.skill?.flatMap((v) => v.split(',').map((s) => s.trim())).filter(Boolean);
    const rows = await applySkills(center, {
      skills,
      targets: parseIds(opts.target),
      retract: opts.retract,
      dryRun: opts.dryRun,
      force: opts.force,
    });
    printRows(rows);
  });

program
  .command('status')
  .description('Show install status, skill links and instruction files per tool')
  .action(async () => {
    const center = centerOf(program.opts());
    const st = await collectStatus(center);
    console.log(`Center workspace: ${center}`);
    console.log(`Center skills (${st.skills.length}): ${st.skills.join(', ') || '(none)'}\n`);
    for (const t of st.targets) {
      const install = t.installed ? 'installed ✓' : 'installed ✗';
      const skills = `skills ${t.skillsLinked}/${t.skillsTotal}` + (t.skillsBroken ? ` broken:${t.skillsBroken}` : '') + (t.skillsForeign ? ` foreign:${t.skillsForeign}` : '');
      const instrMap: Record<string, string> = {
        none: 'instructions: none',
        ours: 'instructions: symlink ✓',
        'ours-broken': 'instructions: broken!',
        copy: 'instructions: copy mode',
        foreign: 'instructions: foreign file (untouched)',
        unsupported: 'instructions: not distributable (see notes)',
      };
      const custom = t.eff.customized ? ' [custom path]' : '';
      console.log(`${(t.eff.label + custom).padEnd(20)} ${install.padEnd(7)} ${skills.padEnd(22)} ${instrMap[t.instr]}`);
      console.log(`${' '.repeat(22)}instructions → ${t.instrPath}`);
      console.log(`${' '.repeat(22)}skills → ${t.eff.skillsDir}`);
      for (const note of t.eff.notes ?? []) console.log(`${' '.repeat(22)}· ${note}`);
    }
  });

program
  .command('doctor')
  .description('Self-check broken links, missing files, conflicts; --probe-codex probes codex skills discovery')
  .option('--probe-codex', 'actually invoke codex once to verify ~/.agents/skills is still scanned (uses a codex session)')
  .action(async (opts: { probeCodex?: boolean }) => {
    const center = centerOf(program.opts());
    const report = await runDoctor(center, { probeCodex: opts.probeCodex });
    if (report.issues.length === 0 && report.warnings.length === 0) {
      console.log('✓ All checks passed — nothing needs attention.');
      return;
    }
    for (const i of report.issues) console.log(`✗ ${i}`);
    for (const w of report.warnings) console.log(`! ${w}`);
    if (report.issues.length > 0) process.exitCode = 1;
  });

program
  .command('web')
  .description('Start the local web panel (buttons, skills matrix, MCP management)')
  .option('-p, --port <port>', 'port to listen on (default 8741)', '8741')
  .option('--no-open', 'do not auto-open the browser')
  .action(async (opts: { port: string; open: boolean }) => {
    const center = centerOf(program.opts());
    await startWebServer({ centerRoot: center, port: Number(opts.port), open: opts.open });
  });

const mcpCmd = new Command('mcp').description('Manage the MCP aggregator proxy');
mcpCmd
  .command('snippets')
  .description('Generate per-tool config snippets for agent-nexus-mcp')
  .option('--profile <name>', 'profile to generate for (default: default)', 'default')
  .option('--npx', 'generate npx-style (after npm publish; default uses the local dist/mcp.js path)')
  .action((opts: { profile: string; npx?: boolean }) => {
    const center = centerOf(program.opts());
    void center;
    const snippets = buildSnippets({ profile: opts.profile, localEntry: localMcpEntry(), useNpx: !!opts.npx });
    for (const s of snippets) {
      console.log(`\n===== ${s.label} → ${s.file} =====`);
      console.log(s.content);
      if (s.note) console.log(`（${s.note}）`);
    }
  });
mcpCmd
  .command('serve')
  .description('Run the MCP aggregator proxy over stdio (what tool configs spawn)')
  .option('--profile <name>', 'profile to serve (default: default = all upstreams)', 'default')
  .option('--mcp-config <file>', 'use a standalone config file (for tests)')
  .action(async (opts: { profile: string; mcpConfig?: string }) => {
    const center = opts.mcpConfig ? undefined : centerOf(program.opts());
    await runProxy({ profile: opts.profile, standaloneConfig: opts.mcpConfig, centerRoot: center });
  });
mcpCmd
  .command('check')
  .description('Per-upstream health check: connect and list tools/resources/prompts (no proxy started)')
  .option('--profile <name>', 'profile to check (default: default)', 'default')
  .option('--mcp-config <file>', 'use a standalone config file (for tests)')
  .action(async (opts: { profile: string; mcpConfig?: string }) => {
    const center = opts.mcpConfig ? undefined : centerOf(program.opts());
    const { ok, report } = await runCheck({ profile: opts.profile, centerRoot: center, standaloneConfig: opts.mcpConfig });
    for (const line of report) console.log(line);
    if (!ok) process.exitCode = 1;
  });
program.addCommand(mcpCmd);

program.parseAsync(process.argv).catch((e: Error) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
