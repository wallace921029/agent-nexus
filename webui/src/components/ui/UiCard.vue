<script setup lang="ts">
// shadcn/ui Card 的 Vue 适配（融合面板玻璃底）
defineProps<{ compact?: boolean }>();
</script>

<template>
  <div class="rounded-xl border border-line bg-panel text-fg shadow-sm backdrop-blur-xl">
    <div v-if="$slots.header" class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
      <slot name="header" />
    </div>
    <div :class="compact ? 'px-4 py-3.5' : 'p-5'">
      <slot />
    </div>
    <div v-if="$slots.footer" class="border-t border-line px-5 py-3.5">
      <slot name="footer" />
    </div>
  </div>
</template>
