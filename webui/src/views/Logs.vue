<script setup lang="ts">
import { store, clearLogs } from '../lib/store';
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-base font-semibold">Activity Log</h2>
        <p class="mt-0.5 text-[12px] text-sub">Panel operation history (kept in browser localStorage, up to 300 entries).</p>
      </div>
      <button
        class="rounded-lg border border-line bg-panel px-3.5 py-2 text-[13px] text-sub transition-colors hover:border-err/60 hover:text-err"
        @click="clearLogs"
      >
        Clear
      </button>
    </div>
    <div class="overflow-hidden rounded-xl border border-line bg-panel">
      <div v-if="store.logs.length === 0" class="px-4 py-10 text-center text-[13px] text-sub/70">No records yet</div>
      <div v-for="(l, i) in store.logs" :key="i" class="flex gap-3 border-b border-line/50 px-4 py-2 font-mono text-[12px] last:border-0">
        <span class="flex-none text-sub/60">{{ l.ts }}</span>
        <span :class="l.level === 'err' ? 'text-err' : l.level === 'ok' ? 'text-ok' : 'text-sub'">{{ l.msg }}</span>
      </div>
    </div>
  </div>
</template>
