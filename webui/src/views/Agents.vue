<script setup lang="ts">
import { ref } from 'vue';
import { store, log, refresh } from '../lib/store';
import { postSyncAgents, postTargetPaths, type Row, type TargetStatus } from '../lib/api';
import Modal from '../components/Modal.vue';
import Ic from '../components/Ic.vue';
import { LOGOS } from '../lib/logos';

/* 设计：卡片直操作（弃用表格+勾选）
   - 每卡：logo + 名称 + 状态胶囊 + 生效路径 + 相关提示 + 行内动作（分发/收回/✎路径）
   - 全局：Preview all (dry-run) / Distribute all / Retract all */

const busy = ref(false);

function pill(t: TargetStatus): { cls: string; text: string } {
  switch (t.instr) {
    case 'ours':
      return { cls: 'border-ok/40 bg-ok/10 text-ok', text: 'symlink ✓' };
    case 'copy':
      return { cls: 'border-ok/40 bg-ok/10 text-ok', text: 'copy mode ✓' };
    case 'ours-broken':
      return { cls: 'border-err/40 bg-err/10 text-err', text: 'broken' };
    default:
      // foreign 与 none 同等展示：已存在的他人文件在派发时会自动 backup 接管，无需提示
      return { cls: 'border-line text-sub/70', text: 'not distributed' };
  }
}

function hint(t: TargetStatus): { text: string; cls: string } | null {
  if (t.instr === 'ours-broken') return { text: 'Link is broken — re-distribute to fix.', cls: 'text-err' };
  if (t.instr === 'copy') return { text: 'Windows copy mode (Developer Mode off) — content refreshes on every sync.', cls: 'text-sub/80' };
  if (t.eff.instr.kind === 'agentsRef')
    return { text: 'AGENTS.md is symlinked; CLAUDE.md gets an "@~/…/AGENTS.md" absolute import (created only when missing; an existing CLAUDE.md is left alone).', cls: 'text-sub/70' };
  if (t.instr === 'unsupported') return { text: t.eff.notes?.[0] ?? null, cls: 'text-sub/70' };
  return null;
}

function rowsToLog(rows: Row[], prefix = ''): void {
  for (const r of rows) {
    log(`${prefix}${r.kind} [${r.id}] ${r.link ?? ''}${r.detail ? ' — ' + r.detail : ''}`, r.kind === 'conflict' ? 'err' : 'ok');
  }
}

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

const previewAll = () =>
  run(async () => {
    const { rows } = await postSyncAgents({ dryRun: true });
    rowsToLog(rows, '[preview] ');
  });

const distributeAll = () =>
  run(async () => {
    if (!confirm('Distribute AGENTS.md (symlinks) to ALL distributable tools?')) return;
    const { rows } = await postSyncAgents({});
    rowsToLog(rows);
    await refresh();
  });

const retractAll = () =>
  run(async () => {
    if (!confirm('Retract instruction links from ALL tools?')) return;
    const { rows } = await postSyncAgents({ retract: true });
    rowsToLog(rows);
    await refresh();
  });

const distributeOne = (t: TargetStatus) =>
  run(async () => {
    if (!confirm(`Distribute AGENTS.md to ${t.eff.label}?`)) return;
    const { rows } = await postSyncAgents({ targets: [t.eff.id] });
    rowsToLog(rows);
    await refresh();
  });

const retractOne = (t: TargetStatus) =>
  run(async () => {
    if (!confirm(`Retract the instruction link from ${t.eff.label}?`)) return;
    const { rows } = await postSyncAgents({ targets: [t.eff.id], retract: true });
    rowsToLog(rows);
    await refresh();
  });

// 路径编辑弹窗
const editing = ref<{ id: string; label: string; effPath: string; current: string } | null>(null);
const editValue = ref('');

function openEdit(t: TargetStatus): void {
  const settings = store.state?.targetSettings?.[t.eff.id] ?? {};
  const cur = (settings.instructions as string | null | undefined) ?? '';
  editing.value = { id: t.eff.id, label: t.eff.label, effPath: t.instrPath, current: cur };
  editValue.value = cur;
}

const saveEdit = () =>
  run(async () => {
    if (!editing.value) return;
    const v = editValue.value.trim();
    const { detail } = await postTargetPaths({ id: editing.value.id, key: 'instructions', value: v === '' ? null : v });
    log(detail, 'ok');
    editing.value = null;
    await refresh();
  });
</script>

<template>
  <div v-if="!store.state" class="py-20 text-center text-sub">Loading…</div>
  <div v-else class="space-y-4">
    <!-- 顶栏：标题 + 全局动作 -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold">AGENTS.md distribution</h2>
        <p class="mt-0.5 text-[12px] text-sub">
          AGENTS.md + per-tool overlays → rendered → symlinked into each tool. An existing file is auto-backed-up (<code class="font-mono">.backup-timestamp</code>) and taken over; ✎ customizes the path.
        </p>
      </div>
      <div class="flex gap-2.5">
        <button class="rounded-lg border border-line bg-panel px-3.5 py-2 text-[13px] text-sub transition-colors hover:border-accent/50 hover:text-fg" @click="previewAll">Preview all (dry-run)</button>
        <button class="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-base transition-opacity hover:opacity-90" @click="distributeAll">Distribute all</button>
        <button class="rounded-lg border border-line bg-panel px-3.5 py-2 text-[13px] text-sub transition-colors hover:border-err/60 hover:text-err" @click="retractAll">Retract all</button>
      </div>
    </div>

    <!-- 工具卡片列表（字母序，数据源已排序） -->
    <div class="space-y-2">
      <div
        v-for="t in store.state.status.targets"
        :key="t.eff.id"
        class="group/card flex items-center gap-3.5 rounded-xl border border-line bg-panel px-4 py-3 transition-colors hover:border-line2"
      >
        <div class="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-panel2 p-1.5">
          <img :src="LOGOS[t.eff.id]" class="h-full w-full rounded-sm object-contain" alt="" />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[13px] font-semibold">{{ t.eff.label }}</span>
            <span v-if="t.eff.customized" class="rounded bg-accent/12 px-1.5 py-0.5 text-[10px] text-accent">custom path</span>
            <span class="rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium" :class="pill(t).cls">{{ pill(t).text }}</span>
            <span v-if="!t.installed" class="text-[11px] text-sub/60">not installed</span>
          </div>
          <div class="mt-0.5 truncate font-mono text-[11.5px] text-sub/80" :title="t.instrPath">
            {{ t.eff.supports.instructions ? t.instrPath : '—' }}
          </div>
          <div v-if="hint(t)?.text" class="mt-1 text-[11px]" :class="hint(t)?.cls">{{ hint(t)?.text }}</div>
        </div>

        <!-- 行内动作：悬停浮现（已分发状态时常显收回） -->
        <div
          class="flex flex-none items-center gap-1.5 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100"
          :class="{ 'opacity-60': t.instr === 'ours' || t.instr === 'ours-broken' }"
        >
          <template v-if="t.eff.supports.instructions">
            <button
              class="rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[11.5px] text-sub transition-colors hover:border-accent/60 hover:text-accent"
              :disabled="busy"
              @click="distributeOne(t)"
            >
              {{ t.instr === 'none' || t.instr === 'ours-broken' ? 'Distribute' : 'Re-distribute' }}
            </button>
            <button
              v-if="t.instr === 'ours' || t.instr === 'copy' || t.instr === 'ours-broken'"
              class="rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[11.5px] text-sub transition-colors hover:border-err/60 hover:text-err"
              :disabled="busy"
              @click="retractOne(t)"
            >
              Retract
            </button>
            <button class="rounded-lg p-1.5 text-sub/60 transition-colors hover:text-accent" title="Custom instruction path" @click="openEdit(t)">
              <Ic name="edit" />
            </button>
          </template>
        </div>
      </div>
    </div>

    <Modal v-if="editing" :title="`${editing.label} · custom instruction path`" @close="editing = null">
      <div class="space-y-3">
        <p class="text-[12px] text-sub">
          Accepts home-relative (e.g. <code class="font-mono">.zcode/MY.md</code>), <code class="font-mono">~/</code>, or absolute paths. Save empty = reset to default.<br />
          Current: <code class="font-mono text-[11px]">{{ editing.effPath }}</code>
        </p>
        <input
          v-model="editValue"
          class="w-full rounded-lg border border-line bg-base px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
          :placeholder="editing.effPath"
          @keyup.enter="saveEdit"
        />
        <div class="flex justify-end gap-2.5 pt-1">
          <button class="rounded-lg border border-line px-3.5 py-1.5 text-[13px] text-sub hover:text-fg" @click="editing = null">Cancel</button>
          <button class="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-base hover:opacity-90" @click="saveEdit">Save</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
