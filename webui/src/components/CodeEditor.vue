<script setup lang="ts">
// CodeMirror 6 代码编辑器封装：语法高亮 + 行号 + 撤销/折叠 + Ctrl+S 保存 + Tab 缩进
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { yaml } from '@codemirror/lang-yaml';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { theme as appTheme } from '../lib/theme';

const props = defineProps<{ modelValue: string; filename: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; save: [] }>();

const host = ref<HTMLElement>();
const themeCompartment = new Compartment();
let view: EditorView | null = null;

function langFor(filename: string): Extension {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'md' || ext === 'markdown') return markdown();
  if (ext === 'json') return json();
  if (ext === 'py' || ext === 'pyi') return python();
  if (['js', 'mjs', 'cjs', 'jsx'].includes(ext)) return javascript({ jsx: ext === 'jsx' });
  if (ext === 'ts' || ext === 'tsx') return javascript({ typescript: true, jsx: ext === 'tsx' });
  if (ext === 'yml' || ext === 'yaml') return yaml();
  if (['html', 'htm', 'svg', 'xml'].includes(ext)) return html();
  if (ext === 'css') return css();
  return [];
}

function themeExtension(): Extension {
  const dark = appTheme.value === 'dark';
  return [
    dark ? oneDark : [],
    // 融入当前面板主题（透明背景、行号槽与主题色）
    EditorView.theme({
      '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--color-fg)' },
      '.cm-scroller': {
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: '12.5px',
        lineHeight: '1.65',
      },
      '.cm-gutters': { backgroundColor: 'transparent', borderRight: '1px solid var(--color-line)', color: 'var(--color-sub)' },
      '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--color-accent) 6%, transparent)' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--color-fg)' },
      '.cm-content': { paddingBottom: '40vh' },
    }, { dark }),
  ];
}

function create(): void {
  if (!host.value) return;
  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      basicSetup,
      themeCompartment.of(themeExtension()),
      keymap.of([
        { key: 'Mod-s', run: () => { emit('save'); return true; } },
        indentWithTab,
      ]),
      langFor(props.filename),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) emit('update:modelValue', u.state.doc.toString());
      }),
    ],
  });
  view = new EditorView({ state, parent: host.value });
}

onMounted(create);
onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

// 只重配置主题扩展，保留当前文档、光标和撤销历史
watch(appTheme, () => {
  view?.dispatch({ effects: themeCompartment.reconfigure(themeExtension()) });
});

// 打开别的文件：语言随文件名变化，直接重建编辑器
watch(
  () => props.filename,
  () => {
    view?.destroy();
    create();
  }
);

// 外部程序性赋值（如重新读取文件）时同步进编辑器；编辑器内部编辑触发的回写不再回灌
watch(
  () => props.modelValue,
  (v) => {
    if (!view) return;
    const cur = view.state.doc.toString();
    if (v !== cur) view.dispatch({ changes: { from: 0, to: cur.length, insert: v } });
  }
);
</script>

<template>
  <div ref="host" class="h-full min-h-0 overflow-hidden"></div>
</template>
