import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { enabledTargets, loadConfig } from './config.js';
import { inspectLink, loadState, type LinkInspection } from './link.js';
import { homeDir } from './paths.js';
import { baseMdPath } from './render.js';
import { listSkills } from './skills.js';
import { effectiveTarget } from './targets.js';
import type { EffectiveTarget } from './targets.js';
import { probeInstalled } from './detect.js';

export type InstrState = 'none' | 'ours' | 'ours-broken' | 'copy' | 'foreign' | 'unsupported';
export type SkillCellState = 'linked' | 'broken' | 'foreign' | 'none' | 'unsupported';

export interface TargetStatus {
  eff: EffectiveTarget;
  installed: boolean;
  /** 未安装但配置目录残留（卸载遗留，可能含历史下发的链接/文件） */
  residual: boolean;
  skillsLinked: number;
  skillsBroken: number;
  skillsForeign: number;
  skillsTotal: number;
  instr: InstrState;
  instrPath: string;
}

export interface CenterStatus {
  targets: TargetStatus[];
  skills: string[];
  baseMissing: boolean;
  /** skill × 目标 的链接状态矩阵（web 面板用） */
  skillsMatrix: Record<string, Record<string, SkillCellState>>;
}

function execFileAsync(cmd: string, args: string[], opts: cp.ExecFileOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.execFile(cmd, args, opts, (err, stdout) => {
      if (err) {
        (err as Error & { stdout?: string }).stdout = String(stdout);
        reject(err);
      } else {
        resolve(String(stdout));
      }
    });
  });
}

function instrState(info: LinkInspection, instrPath: string, copies: Record<string, { source: string }>): InstrState {
  if (info.type === 'none') return 'none';
  if (info.type === 'symlink' && info.ours) return info.broken ? 'ours-broken' : 'ours';
  if (info.type === 'file' && copies[instrPath]) return 'copy';
  return 'foreign';
}

export async function collectStatus(centerRoot: string): Promise<CenterStatus> {
  const cfg = loadConfig(centerRoot);
  const state = loadState(centerRoot);
  const home = homeDir();
  const skills = listSkills(centerRoot);

  const targets: TargetStatus[] = [];
  const skillsMatrix: Record<string, Record<string, SkillCellState>> = {};
  for (const def of enabledTargets(cfg)) {
    const eff = effectiveTarget(home, def, cfg.targets[def.id]);
    // 探测优先（PATH 命令 / 应用位置）；目录仅在“探测未装但目录仍在”时作为残留状态展示
    const installed = probeInstalled(def.probe, eff.installDir);
    const residual = !installed && fs.existsSync(eff.installDir);

    let linked = 0;
    let broken = 0;
    let foreign = 0;
    const matrix: Record<string, SkillCellState> = {};
    for (const s of skills) matrix[s] = eff.supports.skills ? 'none' : 'unsupported';
    if ((installed || residual) && eff.supports.skills) {
      // 从目标目录一侧枚举，这样中心里已删除的 skill 留下的断链也能被发现；
      // 残留态（目录在）同样枚举 —— 派发/收回对它开放，链接状态必须如实展示
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(eff.skillsDir, { withFileTypes: true });
      } catch {
        /* skills 目录尚不存在 */
      }
      for (const e of entries) {
        if (!e.isDirectory() && !e.isSymbolicLink()) continue;
        const linkPath = path.join(eff.skillsDir, e.name);
        const info = await inspectLink(linkPath, centerRoot);
        if (info.type === 'symlink' && info.ours) {
          if (info.broken) {
            broken++;
            if (e.name in matrix) matrix[e.name] = 'broken';
          } else {
            linked++;
            if (e.name in matrix) matrix[e.name] = 'linked';
          }
        } else if (skills.includes(e.name)) {
          foreign++;
          matrix[e.name] = 'foreign';
        }
      }
    }
    skillsMatrix[def.id] = matrix;

    const info = eff.supports.instructions ? await inspectLink(eff.instr.path, centerRoot) : { type: 'none' as const, ours: false };
    const instr: InstrState = eff.supports.instructions ? instrState(info, eff.instr.path, state.copies) : 'unsupported';

    targets.push({
      eff,
      installed,
      residual,
      skillsLinked: linked,
      skillsBroken: broken,
      skillsForeign: foreign,
      skillsTotal: skills.length,
      instr,
      instrPath: eff.instr.path,
    });
  }

  return { targets, skills, baseMissing: !fs.existsSync(baseMdPath(centerRoot)), skillsMatrix };
}

export interface DoctorReport {
  status: CenterStatus;
  issues: string[];
  warnings: string[];
}

export async function runDoctor(centerRoot: string, opts: { probeCodex?: boolean } = {}): Promise<DoctorReport> {
  const status = await collectStatus(centerRoot);
  const issues: string[] = [];
  const warnings: string[] = [];

  if (status.baseMissing) issues.push('AGENTS.md is missing; run agent-nexus init first');

  // 旧版布局残留提醒（center/ 目录或 nexus.config.json）
  if (fs.existsSync(path.join(centerRoot, 'center')) || fs.existsSync(path.join(centerRoot, 'nexus.config.json'))) {
    warnings.push('legacy layout leftovers detected (center/ dir or nexus.config.json); no longer used, safe to delete or migrate');
  }

  for (const t of status.targets) {
    if (t.instr === 'ours-broken') {
      issues.push(`[${t.eff.id}] instruction link broken: ${t.instrPath} (re-run sync-agents to fix)`);
    }
    if (t.skillsBroken > 0) {
      issues.push(`[${t.eff.id}] ${t.skillsBroken} skill link(s) broken (re-run link-skills to fix)`);
    }
    // 指令位置存在他人文件不再告警：派发时会自动 backup 接管（takeover 策略）
    if (t.skillsForeign > 0) {
      warnings.push(`[${t.eff.id}] ${t.skillsForeign} foreign entries with colliding names in skills dir, skipped`);
    }
    if (!t.installed && t.eff.supports.instructions) {
      // 残留目录 = 工具可能是 npx 按需启动形态，目录仍被读取 → 可分发；完全无痕才真正跳过
      warnings.push(
        t.residual
          ? `[${t.eff.id}] not detected as installed (no command on PATH / app location found); residual config dir ${t.eff.installDir} kept — distribution still allowed while the dir exists`
          : `[${t.eff.id}] not detected as installed (no command on PATH / app location found, no config dir); distribution skipped (--force to override)`,
      );
    }
  }

  const codex = status.targets.find((t) => t.eff.id === 'codex');
  if (codex?.instr === 'ours') {
    try {
      const buildFile = path.join(centerRoot, '.config', 'build', 'codex', codex.eff.instr.fileName);
      if (fs.existsSync(buildFile) && fs.statSync(buildFile).size > 32 * 1024) {
        warnings.push('[codex] rendered artifact exceeds 32KiB and will be truncated; trim AGENTS.md or the overlay');
      }
    } catch {
      /* ignore */
    }
  }

  if (opts.probeCodex) {
    const probe = await probeCodexDiscovery();
    (probe.ok ? warnings : issues).push(`[codex] skills 目录探测：${probe.detail}`);
  }

  return { status, issues, warnings };
}

/**
 * codex skills 目录活性探测：~/.agents/skills 是官方现行目录，但历史目录
 * ~/.codex/skills 在旧版本也曾被扫描。升级 codex 后跑一次可确认目录仍被识别。
 */
export async function probeCodexDiscovery(): Promise<{ ok: boolean; detail: string }> {
  try {
    await execFileAsync('codex', ['--version'], { timeout: 20000 });
  } catch (e) {
    return { ok: false, detail: `codex command not runnable: ${(e as Error).message.split('\n')[0]}` };
  }
  const dir = path.join(homeDir(), '.agents', 'skills', 'nexus-doctor-probe');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    '---\nname: nexus-doctor-probe\ndescription: doctor probe only, do not use\n---\n# probe\n'
  );
  try {
    const stdout = await execFileAsync(
      'codex',
      ['exec', '--skip-git-repo-check', 'Do not call any tools or read files. Answer YES or NO only: does your skills list contain a skill named nexus-doctor-probe?'],
      { timeout: 180000, cwd: os.tmpdir() }
    );
    // codex exec 输出包含回显的提问，取最后一个 "codex" 段之后的回答部分
    const idx = stdout.lastIndexOf('\ncodex\n');
    const answer = idx >= 0 ? stdout.slice(idx) : stdout;
    const found = /\bYES\b/i.test(answer) && !/\bNO\b/i.test(answer);
    return {
      ok: true,
      detail: found ? 'codex recognizes skills in ~/.agents/skills (probe passed)' : `codex did not recognize the probe skill; check whether ~/.agents/skills is still scanned. Output: ${answer.slice(0, 200)}`,
    };
  } catch (e) {
    const err = e as Error & { stdout?: string };
    return { ok: false, detail: `codex exec failed: ${err.message.split('\n')[0]}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
