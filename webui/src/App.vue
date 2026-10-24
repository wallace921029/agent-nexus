<script setup lang="ts">
import { onMounted } from 'vue';
import { store, refresh } from './lib/store';
import { theme, toggleTheme } from './lib/theme';
import Ic from './components/Ic.vue';
import logo from './assets/logo.svg';
import Dashboard from './views/Dashboard.vue';
import Agents from './views/Agents.vue';
import Skills from './views/Skills.vue';
import Mcp from './views/Mcp.vue';
import Files from './views/Files.vue';
import Logs from './views/Logs.vue';

const nav: Array<{ id: typeof store.view; label: string; icon: 'grid' | 'file' | 'blocks' | 'plug' | 'folder' | 'list' }> = [
  { id: 'dashboard', label: 'Overview', icon: 'grid' },
  { id: 'files', label: 'NEXUS FILES', icon: 'folder' },
  { id: 'agents', label: 'AGENTS.md', icon: 'file' },
  { id: 'skills', label: 'Skills', icon: 'blocks' },
  { id: 'mcp', label: 'MCP Servers', icon: 'plug' },
  { id: 'logs', label: 'Activity Log', icon: 'list' },
];

const doctorColor = (): 'ok' | 'warn' | 'err' => {
  if (store.error && !store.state) return 'err';
  const d = store.state?.doctor;
  if (!d) return 'warn';
  if (d.issues.length) return 'err';
  if (d.warnings.length) return 'warn';
  return 'ok';
};

onMounted(refresh);
</script>

<template>
  <div class="relative flex h-full overflow-hidden">
    <!-- 黯淡的动态环境光，置于所有磨砂面板之下 -->
    <div class="ambient-background" aria-hidden="true">
      <span class="ambient-orb ambient-orb-a"></span>
      <span class="ambient-orb ambient-orb-b"></span>
      <span class="ambient-orb ambient-orb-c"></span>
    </div>

    <!-- 侧边栏 -->
    <aside class="relative z-10 flex w-56 flex-none flex-col border-r border-line bg-panel">
      <div class="flex items-center gap-2.5 px-4 py-4">
        <img :src="logo" class="h-8 w-8 rounded-lg" alt="Agent Nexus" />
        <div>
          <div class="text-sm font-semibold tracking-wide">Agent Nexus</div>
          <div class="text-[11px] text-sub">Unified Config Center</div>
        </div>
      </div>

      <nav class="mt-1 flex-1 space-y-0.5 px-2">
        <button
          v-for="item in nav"
          :key="item.id"
          class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors"
          :class="store.view === item.id ? 'bg-accent/12 font-medium text-accent' : 'text-sub hover:bg-panel2 hover:text-fg'"
          @click="store.view = item.id"
        >
          <Ic :name="item.icon" />
          {{ item.label }}
        </button>
      </nav>

      <div class="space-y-2 border-t border-line px-4 py-3">
        <div class="flex items-center gap-2 text-[12px]">
          <span class="dot" :class="'dot-' + doctorColor()" />
          <span class="text-sub">
            {{
              store.error && !store.state
                ? 'backend offline'
                : store.state
                  ? doctorColor() === 'ok'
                    ? 'doctor: all good'
                    : `${store.state.doctor.issues.length} issue(s) / ${store.state.doctor.warnings.length} warning(s)`
                  : 'Loading…'
            }}
          </span>
        </div>
        <div class="truncate font-mono text-[11px] text-sub/80" :title="store.state?.center">
          {{ store.state?.center }}
        </div>
        <button
          class="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-[12px] text-sub transition-colors hover:border-accent/50 hover:text-fg"
          :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          :title="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          @click="toggleTheme()"
        >
          <Ic :name="theme === 'dark' ? 'sun' : 'moon'" />
          {{ theme === 'dark' ? 'Light theme' : 'Dark theme' }}
        </button>
        <button
          class="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-[12px] text-sub transition-colors hover:border-accent/50 hover:text-fg"
          :disabled="store.loading"
          @click="refresh()"
        >
          <Ic name="refresh" :class="store.loading ? 'animate-spin' : ''" />
          Refresh
        </button>
      </div>
    </aside>

    <!-- 主区域 -->
    <main class="relative z-10 min-w-0 flex-1 overflow-y-auto">
      <!-- 内容区不设最大宽度：撑满可用宽度（用户要求所有页面均不限宽） -->
      <div class="px-8 py-6">
        <Dashboard v-if="store.view === 'dashboard'" />
        <Agents v-else-if="store.view === 'agents'" />
        <Skills v-else-if="store.view === 'skills'" />
        <Mcp v-else-if="store.view === 'mcp'" />
        <Files v-else-if="store.view === 'files'" />
        <Logs v-else />
      </div>
    </main>
  </div>
</template>
