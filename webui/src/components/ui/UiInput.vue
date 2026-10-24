<script setup lang="ts">
// shadcn/ui Input 的 Vue 适配
defineProps<{ placeholder?: string; modelValue?: string }>();
const emit = defineEmits<{ 'update:modelValue': [v: string]; keyupEnter: [] }>();
</script>

<template>
  <input
    :value="modelValue"
    :placeholder="placeholder"
    class="h-9 w-full rounded-lg border border-line bg-input px-3 font-mono text-[13px] text-fg outline-none transition-colors placeholder:text-sub/50 focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    @keyup.enter="emit('keyupEnter')"
  />
</template>
