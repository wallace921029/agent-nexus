<script setup lang="ts">
// shadcn/ui Button 的 Vue 适配（default 使用前景/背景反色；accent 为主色实心 CTA）
defineProps<{
  variant?: 'default' | 'accent' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'default' | 'icon';
  disabled?: boolean;
}>();
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-50"
    :class="[
      size === 'sm' ? 'h-8 px-3' : size === 'icon' ? 'h-8 w-8' : 'h-9 px-4',
      variant === 'default' && 'bg-fg text-base hover:bg-sub',
      variant === 'accent' && 'bg-accent text-base shadow-[0_0_24px_-8px] shadow-accent/60 hover:bg-accent/85',
      variant === 'secondary' && 'bg-panel2 text-fg hover:bg-line2',
      variant === 'outline' && 'border border-line2 bg-transparent text-fg hover:border-accent/50 hover:text-accent',
      variant === 'ghost' && 'text-sub hover:bg-panel2 hover:text-fg',
      variant === 'destructive' && 'border border-err/25 bg-transparent text-err/90 hover:border-err/60 hover:bg-err/10 hover:text-err',
      !variant && 'bg-fg text-base hover:bg-sub',
    ]"
  >
    <slot />
  </button>
</template>
