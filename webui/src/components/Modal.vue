<script setup lang="ts">
defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]" @click.self="emit('close')">
    <div
      class="max-h-[86vh] w-[560px] max-w-[94vw] overflow-auto rounded-xl border border-line bg-panel shadow-[0_16px_60px_rgba(0,0,0,.5)]"
      :class="wide ? 'w-[820px]' : ''"
    >
      <div class="sticky top-0 flex items-center justify-between border-b border-line bg-panel px-4 py-3">
        <h3 class="text-sm font-semibold text-fg">{{ title }}</h3>
        <button class="rounded-md p-1 text-sub transition-colors hover:bg-panel2 hover:text-fg" @click="emit('close')">✕</button>
      </div>
      <div class="p-4">
        <slot />
      </div>
    </div>
  </div>
</template>
