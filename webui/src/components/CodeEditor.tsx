// CodeMirror 6 代码编辑器封装：语法高亮 + 行号 + 撤销/折叠 + Ctrl+S 保存 + Tab 缩进
import { useEffect, useRef } from 'react';
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
import { useTheme, type Theme } from '../lib/theme';

interface CodeEditorProps {
  value: string;
  filename: string;
  onChange: (value: string) => void;
  onSave: () => void;
  className?: string;
}

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

function themeExtension(appTheme: Theme): Extension {
  const dark = appTheme === 'dark';
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

export default function CodeEditor({ value, filename, onChange, onSave, className }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment()).current;
  const appTheme = useTheme();
  const valueRef = useRef(value);
  const themeRef = useRef(appTheme);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  valueRef.current = value;
  themeRef.current = appTheme;
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  // 打开别的文件时重建编辑器，让语言随文件名变化。
  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        basicSetup,
        themeCompartment.of(themeExtension(themeRef.current)),
        keymap.of([
          { key: 'Mod-s', run: () => { onSaveRef.current(); return true; } },
          indentWithTab,
        ]),
        langFor(filename),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    const editor = new EditorView({ state, parent: host.current });
    view.current = editor;
    return () => {
      editor.destroy();
      if (view.current === editor) view.current = null;
    };
  }, [filename, themeCompartment]);

  // 只重配置主题扩展，保留当前文档、光标和撤销历史。
  useEffect(() => {
    view.current?.dispatch({ effects: themeCompartment.reconfigure(themeExtension(appTheme)) });
  }, [appTheme, themeCompartment]);

  // 外部程序性赋值（如重新读取文件）时同步进编辑器；内部编辑不再回灌。
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (value !== current) editor.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return <div ref={host} className={['h-full min-h-0 overflow-hidden', className].filter(Boolean).join(' ')} />;
}
