<script setup lang="ts">
// shadcn/ui Badge 的 Vue 适配
defineProps<{ variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'warning' | 'success' }>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px] font-medium leading-none transition-colors"
    :class="[
      variant === 'default' && 'border-transparent bg-accent/15 text-accent',
      variant === 'secondary' && 'border-transparent bg-line text-sub',
      variant === 'outline' && 'border-line2 text-sub',
      variant === 'destructive' && 'border-err/40 bg-err/10 text-err',
      variant === 'warning' && 'border-warn/40 bg-warn/10 text-warn',
      variant === 'success' && 'border-ok/40 bg-ok/10 text-ok',
      !variant && 'border-transparent bg-line text-sub',
    ]"
  >
    <slot />
  </span>
</template>
