<script setup lang="ts">
import { computed, ref } from 'vue';
import { store, log, refresh } from '../lib/store';
import { postLinkSkills, postTargetPaths, type Row, type CellState, type TargetStatus } from '../lib/api';
import Modal from '../components/Modal.vue';
import Ic from '../components/Ic.vue';
import { LOGOS } from '../lib/logos';

/* 设计：主从两栏（同 AGENTS.md 模块的卡片语言）
   - 左：工具纵向列表（大 logo + 名称 + linked 计数），点击选中
   - 右：选中工具的技能清单，逐个 Distribute / Retract
   - 无全局统计、无 New skill（技能文件在 Files 模块里创建） */

const busy = ref(false);

async function run(fn: () => Promise<void>): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    log(`Operation failed: ${(e as Error).message}`, 'err');
  } finally {
    busy.value = false;
  }
}

function rowsToLog(rows: Row[]): void {
  for (const r of rows) {
    log(`${r.kind} [${r.id}] ${r.skill ?? ''}${r.detail ? ' — ' + r.detail : ''}`, r.kind === 'conflict' ? 'err' : 'ok');
  }
}

// ---- 选中工具（默认第一个可分发的）----
const selected = ref('');
const targets = computed(() => store.state?.status.targets ?? []);
const current = computed<TargetStatus | undefined>(
  () => targets.value.find((t) => t.eff.id === selected.value) ?? targets.value.find((t) => t.eff.supports.skills) ?? targets.value[0],
);
const skills = computed(() => store.state?.skills ?? []);

const cell = (t: string, s: string): CellState | undefined => store.state?.status.skillsMatrix[t]?.[s];
const linkedCount = (t: TargetStatus): number => skills.value.filter((s) => cell(t.eff.id, s) === 'linked').length;

// 不支持本地下发的工具：优先展示 notes 里与 skills 相关的那条
const unsupportedNote = (t: TargetStatus): string =>
  t.eff.notes?.find((n) => n.toLowerCase().includes('skill')) ??
  'Skills are managed inside the app itself; agent-nexus only distributes MCP here.';

function skillPill(state: CellState | undefined): { cls: string; text: string } {
  switch (state) {
    case 'linked':
      return { cls: 'border-ok/40 bg-ok/10 text-ok', text: 'linked ✓' };
    case 'broken':
      return { cls: 'border-err/40 bg-err/10 text-err', text: 'broken' };
    case 'foreign':
      return { cls: 'border-warn/40 bg-warn/10 text-warn', text: 'foreign' };
    default:
      return { cls: 'border-line text-sub/70', text: 'not linked' };
  }
}

// 单个技能 × 当前工具
const toggleSkill = (skill: string, t: TargetStatus, linked: boolean) =>
  run(async () => {
    const { rows } = await postLinkSkills({ skills: [skill], targets: [t.eff.id], retract: linked });
    rowsToLog(rows);
    await refresh();
  });

// 当前工具整组派发 / 收回
const distributeTool = (t: TargetStatus) =>
  run(async () => {
    if (!skills.value.length) return;
    if (!confirm(`Distribute ALL skills to ${t.eff.label}?`)) return;
    const { rows } = await postLinkSkills({ skills: [...skills.value], targets: [t.eff.id] });
    rowsToLog(rows);
    await refresh();
  });

const retractTool = (t: TargetStatus) =>
  run(async () => {
    if (!skills.value.length) return;
    if (!confirm(`Retract ALL skill links from ${t.eff.label}?`)) return;
    const { rows } = await postLinkSkills({ skills: [...skills.value], targets: [t.eff.id], retract: true });
    rowsToLog(rows);
    await refresh();
  });

// 自定义 skills 目录（✎）
const editDir = ref<{ id: string; label: string; effPath: string } | null>(null);
const editDirValue = ref('');

function openEditDir(t: TargetStatus): void {
  const settings = store.state?.targetSettings?.[t.eff.id] ?? {};
  editDir.value = { id: t.eff.id, label: t.eff.label, effPath: t.eff.skillsDir };
  editDirValue.value = (settings.skillsDir as string | null | undefined) ?? '';
}

const saveEditDir = () =>
  run(async () => {
    if (!editDir.value) return;
    const v = editDirValue.value.trim();
    const { detail } = await postTargetPaths({ id: editDir.value.id, key: 'skillsDir', value: v === '' ? null : v });
    log(detail, 'ok');
    editDir.value = null;
    await refresh();
  });
</script>

<template>
  <div v-if="!store.state" class="py-20 text-center text-sub">Loading…</div>
  <div v-else class="space-y-4">
    <!-- 顶栏：标题（无全局动作，操作都在右侧详情里） -->
    <div>
      <h2 class="text-base font-semibold">Skills distribution</h2>
      <p class="mt-0.5 text-[12px] text-sub">
        Pick a tool, then distribute or retract each skill individually. Links are symlinks into the tool's native skills dir — foreign entries are never touched.
      </p>
    </div>

    <!-- 主从两栏：左列工具卡与右侧面板各自独立（v2 分离版式） -->
    <div class="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <!-- 左：工具纵向列表 -->
      <div class="space-y-2">
        <button
          v-for="t in targets"
          :key="t.eff.id"
          class="flex w-full items-center gap-3.5 rounded-xl border bg-panel px-4 py-3 text-left transition-colors hover:border-line2"
          :class="[
            current?.eff.id === t.eff.id ? 'row-sel border-accent/50 bg-accent/[0.06]' : 'border-line',
            !t.eff.supports.skills && 'opacity-55',
          ]"
          @click="selected = t.eff.id"
        >
          <div class="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-panel2 p-1.5">
            <img :src="LOGOS[t.eff.id]" class="h-full w-full rounded-sm object-contain" alt="" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate text-[13px] font-semibold">{{ t.eff.label }}</span>
              <span v-if="t.eff.customized" class="rounded bg-accent/12 px-1.5 py-0.5 text-[10px] text-accent">custom dir</span>
            </div>
            <div class="mt-0.5 text-[11px] text-sub/75">
              <template v-if="t.eff.supports.skills">{{ linkedCount(t) }} / {{ skills.length }} linked</template>
              <template v-else>skills not distributable</template>
            </div>
          </div>
          <span v-if="!t.installed" class="flex-none text-[10.5px] text-sub/60">not installed</span>
        </button>
      </div>

      <!-- 右：选中工具的技能面板 -->
      <div v-if="current" class="min-w-0 rounded-xl border border-line bg-panel">
        <!-- 详情头 -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div class="min-w-0">
            <div class="flex items-center gap-2.5">
              <img :src="LOGOS[current.eff.id]" class="h-4.5 w-4.5 rounded-sm object-contain" alt="" />
              <span class="text-[14px] font-semibold">{{ current.eff.label }}</span>
              <span
                v-if="current.eff.supports.skills"
                class="rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium"
                :class="linkedCount(current) ? 'border-ok/40 bg-ok/10 text-ok' : 'border-line text-sub/70'"
              >
                {{ linkedCount(current) }} / {{ skills.length }} linked
              </span>
            </div>
            <div class="mt-0.5 truncate font-mono text-[11.5px] text-sub/80" :title="current.eff.skillsDir">
              {{ current.eff.supports.skills ? current.eff.skillsDir : '—' }}
            </div>
          </div>
          <div v-if="current.eff.supports.skills" class="flex items-center gap-1.5">
            <button
              class="rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[11.5px] text-sub transition-colors hover:border-accent/60 hover:text-accent"
              :disabled="busy || !skills.length || !current.installed"
              @click="distributeTool(current)"
            >
              Distribute all
            </button>
            <button
              class="rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[11.5px] text-sub transition-colors hover:border-err/60 hover:text-err"
              :disabled="busy || !skills.length || !current.installed"
              @click="retractTool(current)"
            >
              Retract all
            </button>
            <button class="rounded-lg p-1.5 text-sub/60 transition-colors hover:text-accent" title="Custom skills dir" @click="openEditDir(current)">
              <Ic name="edit" />
            </button>
          </div>
        </div>

        <!-- 不支持 skills 的工具 -->
        <div v-if="!current.eff.supports.skills" class="flex flex-col items-center gap-3 px-4 py-14 text-center">
          <div class="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-panel2 text-sub"><Ic name="blocks" /></div>
          <div>
            <div class="text-[14px] font-medium">Local skill distribution isn't available for this tool</div>
            <div class="mt-1 text-[12px] text-sub/75">{{ unsupportedNote(current) }}</div>
          </div>
        </div>

        <!-- 中心还没有任何技能 -->
        <div v-else-if="!skills.length" class="flex flex-col items-center gap-3 px-4 py-14 text-center">
          <div class="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-panel2 text-sub"><Ic name="folder" /></div>
          <div>
            <div class="text-[14px] font-medium">No skills in the center yet</div>
            <div class="mt-1 text-[12px] text-sub/75">Create <code class="font-mono">~/.agent-nexus/skills/&lt;name&gt;/SKILL.md</code> in the Files module, then distribute here.</div>
          </div>
        </div>

        <!-- 技能清单：逐个派发 / 收回 -->
        <div v-else class="space-y-1.5 p-3">
          <div
            v-for="s in skills"
            :key="s"
            class="flex items-center gap-3 rounded-lg border border-line/60 bg-panel2/40 px-3.5 py-2.5 transition-colors hover:border-line2"
          >
            <span class="min-w-0 flex-1 truncate font-mono text-[12.5px]" :title="s">{{ s }}</span>
            <span class="rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium" :class="skillPill(cell(current.eff.id, s)).cls">
              {{ skillPill(cell(current.eff.id, s)).text }}
            </span>
            <template v-if="cell(current.eff.id, s) !== 'foreign'">
              <button
                v-if="cell(current.eff.id, s) === 'linked'"
                class="rounded-lg border border-line bg-transparent px-2.5 py-1 text-[11.5px] text-sub transition-colors hover:border-err/60 hover:text-err"
                :disabled="busy"
                @click="toggleSkill(s, current, true)"
              >
                Retract
              </button>
              <button
                v-else
                class="rounded-lg border border-line bg-transparent px-2.5 py-1 text-[11.5px] text-sub transition-colors hover:border-accent/60 hover:text-accent"
                :disabled="busy"
                @click="toggleSkill(s, current, false)"
              >
                {{ cell(current.eff.id, s) === 'broken' ? 'Re-link' : 'Distribute' }}
              </button>
            </template>
          </div>
        </div>

        <!-- 图例 -->
        <div v-if="current.eff.supports.skills && skills.length" class="border-t border-line px-5 py-3 text-[11px] text-sub/75">
          linked = symlink into the center · foreign = exists but not ours (never touched) · broken = re-link to fix
        </div>
      </div>
    </div>

    <!-- 自定义 skills 目录弹窗 -->
    <Modal v-if="editDir" :title="`${editDir.label} · custom skills dir`" @close="editDir = null">
      <div class="space-y-3">
        <p class="text-[12px] text-sub">
          Accepts home-relative, <code class="font-mono">~/</code>, or absolute paths; save empty = reset to default.<br />
          Current: <code class="font-mono text-[11px]">{{ editDir.effPath }}</code>
        </p>
        <input
          v-model="editDirValue"
          class="w-full rounded-lg border border-line bg-base px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
          :placeholder="editDir.effPath"
          @keyup.enter="saveEditDir"
        />
        <div class="flex justify-end gap-2.5 pt-1">
          <button class="rounded-lg border border-line px-3.5 py-1.5 text-[13px] text-sub hover:text-fg" @click="editDir = null">Cancel</button>
          <button class="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-base hover:opacity-90" @click="saveEditDir">Save</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
