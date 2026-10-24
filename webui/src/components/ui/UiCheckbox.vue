<script setup lang="ts">
// shadcn/ui Checkbox 的 Vue 适配：方块圆角 + 主色填充 + 勾形 SVG
defineProps<{ modelValue?: boolean; disabled?: boolean; title?: string }>();
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>();
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="!!modelValue"
    :disabled="disabled"
    :title="title"
    class="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-35"
    :class="modelValue ? 'border-accent bg-accent text-base' : 'border-line2 bg-transparent hover:border-accent/80 hover:bg-accent/10'"
    @click="!disabled && emit('update:modelValue', !modelValue)"
  >
    <svg v-if="modelValue" viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  </button>
</template>
