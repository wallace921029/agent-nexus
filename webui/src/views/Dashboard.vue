<script setup lang="ts">
import { computed, ref } from 'vue';
import { store, refresh } from '../lib/store';
import type { TargetStatus } from '../lib/api';
import { LOGOS } from '../lib/logos';
import Ic from '../components/Ic.vue';

/* 纯统计页：只展示状态与模块入口，不做任何分发/收回操作（操作去各自的模块） */

const instrMeta: Record<TargetStatus['instr'], { dot: string; label: string }> = {
  none: { dot: 'dot-off', label: 'Not distributed' },
  ours: { dot: 'dot-ok', label: 'Linked' },
  'ours-broken': { dot: 'dot-err', label: 'Broken link' },
  copy: { dot: 'dot-ok', label: 'Copied' },
  // foreign 同 none：他人文件派发时自动 backup 接管，不再特别提示
  foreign: { dot: 'dot-off', label: 'Not distributed' },
  unsupported: { dot: 'dot-off', label: 'MCP only' },
};

const targets = computed(() => store.state?.status.targets ?? []);
const issueCount = computed(() => store.state?.doctor.issues.length ?? 0);
const warningCount = computed(() => store.state?.doctor.warnings.length ?? 0);
const attentionCount = computed(() => issueCount.value + warningCount.value);
const showAttention = ref(false);

const installedCount = computed(() => targets.value.filter((t) => t.installed).length);
const missingCount = computed(() => targets.value.length - installedCount.value);
const instructionTargetCount = computed(() => targets.value.filter((t) => t.eff.supports.instructions).length);
const instructionReadyCount = computed(() => targets.value.filter((t) => t.eff.supports.instructions && (t.instr === 'ours' || t.instr === 'copy')).length);
const instructionPendingCount = computed(() => instructionTargetCount.value - instructionReadyCount.value);
const skillTargetCount = computed(() => targets.value.filter((t) => t.eff.supports.skills).length);
const skillsLinked = computed(() => targets.value.reduce((sum, t) => sum + t.skillsLinked, 0));
const skillsTotal = computed(() => targets.value.reduce((sum, t) => sum + (t.eff.supports.skills ? t.skillsTotal : 0), 0));
const skillsBroken = computed(() => targets.value.reduce((sum, t) => sum + t.skillsBroken, 0));

const healthTone = computed(() => {
  if (issueCount.value) return 'err';
  if (warningCount.value) return 'warn';
  return 'ok';
});
const healthTitle = computed(() => {
  if (healthTone.value === 'err') return 'Issues found';
  if (healthTone.value === 'warn') return 'Needs review';
  return 'All healthy';
});
const healthSummary = computed(() => {
  const parts: string[] = [];
  if (issueCount.value) parts.push(`${issueCount.value} issue${issueCount.value === 1 ? '' : 's'}`);
  if (warningCount.value) parts.push(`${warningCount.value} warning${warningCount.value === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : 'All automated checks are passing';
});
const attentionTitle = computed(() => {
  const parts: string[] = [];
  if (issueCount.value) parts.push(`${issueCount.value} issue${issueCount.value === 1 ? '' : 's'}`);
  if (warningCount.value) parts.push(`${warningCount.value} warning${warningCount.value === 1 ? '' : 's'}`);
  return `${parts.join(' and ')} ${attentionCount.value === 1 ? 'requires' : 'require'} review`;
});
const firstAttention = computed(() => store.state?.doctor.issues[0] ?? store.state?.doctor.warnings[0] ?? '');

const skillPercent = (t: TargetStatus): number => {
  if (!t.skillsTotal) return 0;
  return Math.min(100, Math.round((t.skillsLinked / t.skillsTotal) * 100));
};

const go = (v: typeof store.view) => {
  store.view = v;
};

const quickLinks = [
  { view: 'agents', label: 'Instructions', description: 'Preview and distribution', icon: 'file' },
  { view: 'skills', label: 'Skills', description: 'Distribution matrix', icon: 'blocks' },
  { view: 'mcp', label: 'MCP Servers', description: 'Upstream connections', icon: 'plug' },
  { view: 'files', label: 'Nexus Files', description: 'Browse workspace files', icon: 'folder' },
] as const;
</script>

<template>
  <!-- 后端连接失败：明确报错而不是无限加载 -->
  <div v-if="!store.state">
    <div v-if="store.error" class="rounded-2xl border border-err/25 bg-panel px-6 py-12 text-center">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-err/25 bg-err/10 text-err">
        <Ic name="alert" class="h-5 w-5" />
      </div>
      <h1 class="mt-4 text-lg font-semibold">Backend unavailable</h1>
      <p class="mt-1 text-[12.5px] text-sub">无法连接面板后端（127.0.0.1:8741）</p>
      <p class="mt-4 text-[12px] leading-6 text-sub">
        {{ store.error }}<br />
        如果你打开的是 Vite 开发页（5173），请先在另一个终端启动后端：
        <code class="rounded bg-panel2 px-1.5 py-0.5 font-mono text-[11px] text-accent">node dist/cli.js web --no-open -p 8741</code>
      </p>
      <button class="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[12.5px] font-medium text-base transition-opacity hover:opacity-90" @click="refresh()">
        <Ic name="refresh" />重试
      </button>
    </div>
    <div v-else class="space-y-5" aria-label="Loading overview">
      <div class="flex items-center justify-between px-1">
        <div class="space-y-2">
          <div class="h-7 w-32 animate-pulse rounded-lg bg-panel2"></div>
          <div class="h-4 w-72 animate-pulse rounded-lg bg-panel"></div>
        </div>
        <div class="h-9 w-32 animate-pulse rounded-lg bg-panel"></div>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="i in 4" :key="i" class="h-32 animate-pulse rounded-2xl border border-line bg-panel"></div>
      </div>
      <div class="h-[420px] animate-pulse rounded-2xl border border-line bg-panel"></div>
    </div>
  </div>

  <div v-else class="space-y-5">
    <!-- 页面标题与全局状态 -->
    <header class="flex flex-wrap items-center justify-between gap-4 px-1">
      <div>
        <div class="flex items-center gap-2.5">
          <h1 class="text-[24px] font-semibold tracking-[-0.035em]">Overview</h1>
          <span class="rounded-md border border-line bg-panel px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-sub/70">Live</span>
        </div>
        <p class="mt-1 text-[12.5px] text-sub">Instruction distribution, skill links, and agent readiness at a glance.</p>
      </div>
      <div class="flex items-center gap-2.5">
        <span
          class="hidden items-center gap-2 rounded-lg border px-3 py-2 text-[11.5px] font-medium sm:inline-flex"
          :class="healthTone === 'err' ? 'border-err/25 bg-err/8 text-err' : healthTone === 'warn' ? 'border-warn/25 bg-warn/8 text-warn' : 'border-ok/25 bg-ok/8 text-ok'"
        >
          <span class="dot" :class="healthTone === 'ok' ? 'dot-ok' : healthTone === 'warn' ? 'dot-warn' : 'dot-err'"></span>
          {{ healthTitle }}
        </span>
        <button
          class="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[11.5px] text-sub transition-colors hover:border-accent/40 hover:text-fg disabled:opacity-50"
          :disabled="store.loading"
          @click="refresh()"
        >
          <Ic name="refresh" :class="store.loading ? 'animate-spin' : ''" />
          {{ store.loading ? 'Refreshing…' : 'Refresh status' }}
        </button>
      </div>
    </header>

    <!-- 四项关键指标 -->
    <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Workspace summary">
      <article class="relative overflow-hidden rounded-2xl border border-line bg-panel p-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)] transition-colors hover:border-line2">
        <span class="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"></span>
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold uppercase tracking-[0.13em] text-sub/70">System health</span>
          <span
            class="flex h-8 w-8 items-center justify-center rounded-xl"
            :class="healthTone === 'err' ? 'bg-err/10 text-err' : healthTone === 'warn' ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok'"
          >
            <Ic :name="healthTone === 'ok' ? 'check' : 'alert'" />
          </span>
        </div>
        <div
          class="mt-2 text-[22px] font-semibold leading-8 tracking-[-0.03em]"
          :class="healthTone === 'err' ? 'text-err' : healthTone === 'warn' ? 'text-warn' : 'text-ok'"
        >{{ healthTitle }}</div>
        <p class="mt-1 truncate text-[11px] text-sub" :title="healthSummary">{{ healthSummary }}</p>
      </article>

      <article class="relative overflow-hidden rounded-2xl border border-line bg-panel p-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)] transition-colors hover:border-line2">
        <span class="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"></span>
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold uppercase tracking-[0.13em] text-sub/70">Agents detected</span>
          <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent"><Ic name="grid" /></span>
        </div>
        <div class="mt-1 text-[28px] font-semibold leading-9 tracking-[-0.04em]">
          {{ installedCount }}<span class="ml-1.5 text-[14px] font-normal tracking-normal text-sub">/ {{ targets.length }}</span>
        </div>
        <p class="mt-1 text-[11px] text-sub">{{ missingCount ? `${missingCount} not installed` : 'Every registered agent is available' }}</p>
      </article>

      <article class="relative overflow-hidden rounded-2xl border border-line bg-panel p-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)] transition-colors hover:border-line2">
        <span class="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"></span>
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold uppercase tracking-[0.13em] text-sub/70">Instructions ready</span>
          <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent"><Ic name="file" /></span>
        </div>
        <div class="mt-1 text-[28px] font-semibold leading-9 tracking-[-0.04em]">
          {{ instructionReadyCount }}<span class="ml-1.5 text-[14px] font-normal tracking-normal text-sub">/ {{ instructionTargetCount }}</span>
        </div>
        <p class="mt-1 text-[11px] text-sub">{{ instructionPendingCount ? `${instructionPendingCount} pending or overridden` : 'Every supported agent is covered' }}</p>
      </article>

      <article class="relative overflow-hidden rounded-2xl border border-line bg-panel p-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)] transition-colors hover:border-line2">
        <span class="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"></span>
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold uppercase tracking-[0.13em] text-sub/70">Active skill links</span>
          <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent"><Ic name="blocks" /></span>
        </div>
        <div class="mt-1 text-[28px] font-semibold leading-9 tracking-[-0.04em]">
          {{ skillsLinked }}<span class="ml-1.5 text-[14px] font-normal tracking-normal text-sub">/ {{ skillsTotal }}</span>
        </div>
        <p class="mt-1 text-[11px]" :class="skillsBroken ? 'text-err' : 'text-sub'">
          {{ skillsBroken ? `${skillsBroken} broken link${skillsBroken === 1 ? '' : 's'}` : `${skillTargetCount} compatible agents` }}
        </p>
      </article>
    </section>

    <!-- 可展开的异常摘要，避免多张大横幅抢占首屏 -->
    <section
      v-if="attentionCount"
      class="overflow-hidden rounded-2xl border"
      :class="healthTone === 'err' ? 'border-err/25 bg-err/6' : 'border-warn/25 bg-warn/6'"
    >
      <button class="flex w-full items-center gap-3 px-4 py-3 text-left" :aria-expanded="showAttention" @click="showAttention = !showAttention">
        <span
          class="flex h-8 w-8 flex-none items-center justify-center rounded-lg"
          :class="healthTone === 'err' ? 'bg-err/10 text-err' : 'bg-warn/10 text-warn'"
        ><Ic name="alert" /></span>
        <span class="min-w-0 flex-1">
          <span class="block text-[12px] font-medium" :class="healthTone === 'err' ? 'text-err' : 'text-warn'">{{ attentionTitle }}</span>
          <span class="mt-0.5 hidden truncate text-[11px] text-sub sm:block" :title="firstAttention">{{ firstAttention }}</span>
        </span>
        <span class="hidden text-[11px] text-sub sm:inline">{{ showAttention ? 'Hide details' : 'Show details' }}</span>
        <Ic name="chevron" class="text-sub transition-transform" :class="showAttention ? 'rotate-90' : ''" />
      </button>
      <div v-if="showAttention" class="max-h-48 space-y-2 overflow-y-auto border-t px-4 py-3" :class="healthTone === 'err' ? 'border-err/15' : 'border-warn/15'">
        <div v-for="(message, index) in store.state.doctor.issues" :key="`issue-${index}`" class="flex items-start gap-2.5 text-[11.5px] leading-5">
          <span class="dot dot-err mt-1.5"></span><span class="text-fg/90">{{ message }}</span>
        </div>
        <div v-for="(message, index) in store.state.doctor.warnings" :key="`warning-${index}`" class="flex items-start gap-2.5 text-[11.5px] leading-5">
          <span class="dot dot-warn mt-1.5"></span><span class="text-sub">{{ message }}</span>
        </div>
      </div>
    </section>

    <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <!-- Agent 集成状态：统一列表取代重复卡片 -->
      <section class="overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
        <header class="flex items-center justify-between gap-3 px-5 py-4">
          <div class="flex items-center gap-3">
            <span class="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/15 bg-accent/10 text-accent"><Ic name="plug" /></span>
            <div>
              <h2 class="text-[13.5px] font-semibold">Agent integrations</h2>
              <p class="mt-0.5 text-[10.5px] text-sub/75">Native instruction and skill status</p>
            </div>
          </div>
          <span class="rounded-lg border border-line bg-panel2 px-2.5 py-1 text-[10.5px] text-sub">{{ targets.length }} agents</span>
        </header>

        <div class="hidden grid-cols-[minmax(150px,1.15fr)_minmax(145px,1fr)_minmax(115px,0.8fr)_24px] gap-4 border-y border-line bg-panel2/35 px-5 py-2.5 text-[9.5px] font-semibold uppercase tracking-[0.13em] text-sub/55 lg:grid">
          <span>Agent</span><span>Instructions</span><span>Skills</span><span></span>
        </div>

        <div class="divide-y divide-line/60">
          <button
            v-for="t in targets"
            :key="t.eff.id"
            class="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-panel2/65 lg:grid-cols-[minmax(150px,1.15fr)_minmax(145px,1fr)_minmax(115px,0.8fr)_24px] lg:gap-4 lg:px-5"
            :aria-label="`View ${t.eff.label} instruction details`"
            @click="go('agents')"
          >
            <span class="flex min-w-0 items-center gap-3">
              <span class="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-line/70 bg-panel2">
                <img :src="LOGOS[t.eff.id]" class="h-5 w-5 rounded-sm object-contain" alt="" />
              </span>
              <span class="min-w-0">
                <span class="flex items-center gap-2">
                  <span class="truncate text-[12.5px] font-medium">{{ t.eff.label }}</span>
                  <span v-if="t.eff.customized" class="flex-none rounded bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent">Custom</span>
                </span>
                <span class="mt-0.5 block text-[10.5px]" :class="t.installed ? 'text-sub/65' : 'text-warn/85'">{{ t.installed ? 'Available' : 'Not installed' }}</span>
                <span class="mt-1 flex items-center gap-1.5 text-[10px] text-sub lg:hidden">
                  <span>{{ instrMeta[t.instr].label }}</span><span class="text-sub/35">·</span><span>{{ t.eff.supports.skills ? `${t.skillsLinked}/${t.skillsTotal} skills` : 'No skills' }}</span>
                </span>
              </span>
            </span>

            <span class="hidden items-center gap-2 text-[11.5px] text-sub lg:flex" :title="t.instrPath">
              <span class="dot" :class="instrMeta[t.instr].dot"></span>
              <span class="truncate">{{ instrMeta[t.instr].label }}</span>
            </span>

            <span v-if="t.eff.supports.skills" class="hidden lg:block">
              <span class="flex items-center justify-between gap-2 text-[10.5px]">
                <span class="text-fg">{{ t.skillsLinked }}<span class="text-sub/60"> / {{ t.skillsTotal }}</span></span>
                <span v-if="t.skillsBroken" class="text-err">{{ t.skillsBroken }} broken</span>
                <span v-else class="text-sub/55">{{ skillPercent(t) }}%</span>
              </span>
              <span class="mt-2 block h-1 overflow-hidden rounded-full bg-line">
                <span class="block h-full rounded-full transition-[width]" :class="t.skillsBroken ? 'bg-err' : 'bg-accent'" :style="{ width: `${skillPercent(t)}%` }"></span>
              </span>
            </span>
            <span v-else class="hidden text-[11px] text-sub/50 lg:block">Not supported</span>

            <span class="flex h-7 w-7 items-center justify-center justify-self-end rounded-lg text-sub/45 transition-all group-hover:bg-accent/10 group-hover:translate-x-0.5 group-hover:text-accent">
              <Ic name="chevron" />
            </span>
          </button>
        </div>
        <footer class="border-t border-line px-5 py-3 text-[10.5px] text-sub/60">Select an agent to review its instruction settings.</footer>
      </section>

      <!-- 右侧：只读模块入口与活动时间线 -->
      <div class="space-y-5">
        <section class="rounded-2xl border border-line bg-panel p-3 shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
          <header class="px-2 pb-2 pt-1">
            <h2 class="text-[13px] font-semibold">Quick access</h2>
            <p class="mt-0.5 text-[10.5px] text-sub/70">Jump to a management module</p>
          </header>
          <div class="space-y-1">
            <button
              v-for="item in quickLinks"
              :key="item.view"
              class="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-panel2"
              @click="go(item.view)"
            >
              <span class="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-line/70 bg-panel2 text-sub transition-colors group-hover:border-accent/25 group-hover:text-accent">
                <Ic :name="item.icon" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-[12px] font-medium">{{ item.label }}</span>
                <span class="mt-0.5 block truncate text-[10.5px] text-sub/70">{{ item.description }}</span>
              </span>
              <Ic name="chevron" class="text-sub/40 transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
            </button>
          </div>
        </section>

        <section class="overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
          <header class="flex items-center justify-between border-b border-line px-4 py-3.5">
            <div class="flex items-center gap-2">
              <Ic name="list" class="text-sub/70" />
              <h2 class="text-[13px] font-semibold">Recent activity</h2>
            </div>
            <span v-if="store.logs.length" class="rounded-md bg-panel2 px-1.5 py-0.5 text-[9.5px] text-sub/65">{{ store.logs.length }}</span>
          </header>
          <div v-if="store.logs.length" class="divide-y divide-line/50 px-4">
            <div v-for="(l, i) in store.logs.slice(0, 5)" :key="i" class="flex items-start gap-2.5 py-3">
              <span class="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" :class="l.level === 'err' ? 'bg-err' : l.level === 'ok' ? 'bg-ok' : 'bg-accent'"></span>
              <span class="min-w-0 flex-1">
                <span class="line-clamp-2 text-[11.5px] leading-[1.45]" :class="l.level === 'err' ? 'text-err' : l.level === 'ok' ? 'text-fg/90' : 'text-sub'" :title="l.msg">{{ l.msg }}</span>
                <span class="mt-1 block font-mono text-[9.5px] text-sub/50">{{ l.ts }}</span>
              </span>
            </div>
          </div>
          <div v-else class="flex flex-col items-center px-4 py-8 text-center">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-panel2 text-sub/55"><Ic name="list" /></span>
            <p class="mt-3 text-[11.5px] font-medium text-sub">No activity yet</p>
            <p class="mt-1 text-[10.5px] leading-4 text-sub/55">Panel operations will appear here.</p>
          </div>
          <footer class="border-t border-line px-4 py-2.5">
            <button class="flex w-full items-center justify-between text-[10.5px] text-sub transition-colors hover:text-accent" @click="go('logs')">
              <span>View activity log</span><Ic name="chevron" />
            </button>
          </footer>
        </section>
      </div>
    </div>
  </div>
</template>
