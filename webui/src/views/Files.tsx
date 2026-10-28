import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { log } from '../lib/store';
import { listItemVariants } from '../lib/animation';
import { fsList, fsRead, fsWrite, fsSearch, type FsEntry } from '../lib/api';
import Ic from '../components/Ic';
import Modal from '../components/Modal';
import CodeEditor from '../components/CodeEditor';
import { confirmDialog } from '../components/ui/UiAlertDialog';

/** 目录树节点：children 懒加载（首次展开时拉取） */
interface TreeNode {
  name: string;
  path: string;
  dir: boolean;
  size?: number;
  expanded?: boolean;
  loaded?: boolean;
  children?: TreeNode[];
}

interface SearchResult {
  path: string;
  dir: boolean;
  size?: number;
}

function humanSize(size?: number): string {
  if (size == null) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function toNodes(entries: FsEntry[], parentPath: string): TreeNode[] {
  return entries.map((entry) => ({
    name: entry.name,
    path: parentPath ? `${parentPath}/${entry.name}` : entry.name,
    dir: entry.dir,
    size: entry.size,
  }));
}

async function fetchEntries(path: string): Promise<TreeNode[]> {
  const result = await fsList(path);
  return toNodes(result.entries, path === '' ? '' : path);
}

/** 按路径不可变更新树节点，确保嵌套状态变化触发 React 重渲染。 */
function updateTreeNode(nodes: TreeNode[], path: string, update: (node: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === path) return update(node);
    if (node.children) return { ...node, children: updateTreeNode(node.children, path, update) };
    return node;
  });
}

export default function Files() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [openRel, setOpenRel] = useState<string | null>(null);
  const [original, setOriginal] = useState('');
  const [draft, setDraft] = useState('');
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [newFileDir, setNewFileDir] = useState<TreeNode | null>(null);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // ---- 搜索 ----
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const searchTimer = setTimeout(async () => {
      try {
        const result = await fsSearch(query.trim());
        setResults(result.results);
      } catch (e) {
        log(`Search failed: ${(e as Error).message}`, 'err');
      } finally {
        setSearching(false);
      }
    }, 160);
    return () => clearTimeout(searchTimer);
  }, [query]);

  /** 展开的树 → 扁平渲染行（带深度） */
  const flat: Array<{ node: TreeNode; depth: number }> = [];
  (function walk(nodes: TreeNode[], depth: number) {
    for (const node of nodes) {
      flat.push({ node, depth });
      if (node.dir && node.expanded && node.children) walk(node.children, depth + 1);
    }
  })(tree, 0);

  const dirty = openRel !== null && draft !== original;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const fileExt = (openRel?.split('.').pop() ?? '').slice(0, 4).toLowerCase();

  // 编辑器头部路径拆分：目录部分 + 文件名
  const rel = openRel ?? '';
  const separator = rel.lastIndexOf('/');
  const pathParts = { dir: separator >= 0 ? rel.slice(0, separator + 1) : '', name: separator >= 0 ? rel.slice(separator + 1) : rel };

  async function openFile(path: string): Promise<void> {
    if (
      dirtyRef.current &&
      !(await confirmDialog({
        title: 'Discard unsaved changes?',
        description: 'This file has unsaved changes that will be lost.',
        confirmText: 'Discard & continue',
        cancelText: 'Keep editing',
        tone: 'destructive',
      }))
    )
      return;
    setOpenRel(path);
    setOriginal('');
    setDraft('');
    setFileError('');
    try {
      const result = await fsRead(path);
      setOriginal(result.content);
      setDraft(result.content);
    } catch (e) {
      setFileError((e as Error).message);
    }
  }

  /** 展开目录（首次懒加载），已加载则收起/再展开 */
  async function toggle(node: TreeNode): Promise<void> {
    if (!node.dir) {
      await openFile(node.path);
      return;
    }
    if (node.loaded) {
      setTree((current) => updateTreeNode(current, node.path, (item) => ({ ...item, expanded: !item.expanded })));
      return;
    }
    setLoading(true);
    try {
      const children = await fetchEntries(node.path);
      setTree((current) => updateTreeNode(current, node.path, (item) => ({ ...item, children, loaded: true, expanded: true })));
    } catch (e) {
      log(`Failed to list directory: ${(e as Error).message}`, 'err');
    } finally {
      setLoading(false);
    }
  }

  async function reloadRoot(): Promise<void> {
    setLoading(true);
    try {
      setTree(await fetchEntries(''));
    } catch (e) {
      log(`Failed to list directory: ${(e as Error).message}`, 'err');
    } finally {
      setLoading(false);
    }
  }

  async function save(): Promise<void> {
    const path = openRel;
    if (!path || savingRef.current) return;
    const content = draft;
    savingRef.current = true;
    setSaving(true);
    try {
      await fsWrite({ path, content });
      setOriginal(content);
      log(`Saved ${path}`, 'ok');
    } catch (e) {
      log(`Save failed: ${(e as Error).message}`, 'err');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const p = openRel ?? '';
  let hint = '';
  if (p === 'AGENTS.md' || p.startsWith('overlays/')) {
    hint = 'This is an instruction source file: re-distribute from the AGENTS.md page (or run sync-agents) after saving to take effect.';
  } else if (p.startsWith('skills/')) {
    hint = 'This is a skill source file: saves take effect immediately (tools read through symlinks).';
  } else if (p === 'mcp.json') {
    hint = 'Standard mcpServers format (same as Claude\'s config): the proxy aggregates every entry — see the parsed result on the MCP Servers view. Per-tool subsets go under "mcpProfiles" in .config/config.json.';
  } else if (p.startsWith('.config/build/')) {
    hint = 'Auto-generated artifact: overwritten on the next sync-agents — edit AGENTS.md / overlays instead.';
  }

  function openNewFile(node: TreeNode | null): void {
    setNewFileDir(node);
    setNewFileName('');
    setNewFileOpen(true);
  }

  async function createFile(): Promise<void> {
    const name = newFileName.trim();
    if (!name) return;
    const directory = newFileDir;
    const dirPath = directory?.path ?? '';
    const path = dirPath ? `${dirPath}/${name}` : name;
    try {
      await fsWrite({ path, content: '' });
      log(`Created ${path}`, 'ok');
      setNewFileOpen(false);
      if (directory) {
        setTree((current) => updateTreeNode(current, directory.path, (node) => ({ ...node, loaded: false, expanded: true })));
        await toggle({ ...directory, loaded: false, expanded: true });
      } else {
        await reloadRoot();
      }
      await openFile(path);
    } catch (e) {
      log(`Create failed: ${(e as Error).message}`, 'err');
    }
  }

  useEffect(() => {
    void reloadRoot();
  }, []);

  return (
    <div className="flex h-[calc(100vh-3rem)] gap-4">
      {/* 左：文件浏览器 */}
      <motion.div className="flex w-80 flex-none flex-col overflow-hidden rounded-xl border border-line bg-panel" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
        <div className="border-b border-line px-3.5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold">Files</span>
            <div className="flex items-center gap-1">
              <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-md p-1.5 text-sub/70 transition-colors hover:bg-panel2 hover:text-accent" title="Refresh tree" onClick={() => void reloadRoot()}><Ic name="refresh" className={loading ? 'animate-spin' : ''} /></motion.button>
              <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-md p-1.5 text-sub/70 transition-colors hover:bg-panel2 hover:text-accent" title="New file in root" onClick={() => openNewFile(null)}><Ic name="plus" /></motion.button>
            </div>
          </div>
          <div className="relative mt-2.5">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sub/50"><Ic name="search" /></span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-lg border border-line bg-input py-1.5 pl-8 pr-2.5 text-[12px] text-fg outline-none transition-colors placeholder:text-sub/50 focus:border-accent/50"
              placeholder="Search files…"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1.5">
          <AnimatePresence mode="wait" initial={false}>
          {/* 搜索结果模式 */}
          {query.trim() ? (
            <motion.div key="search" initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }}>
              {!searching && results.length === 0 ? <div className="px-4 py-8 text-center text-[12px] text-sub/70">No matches for "{query.trim()}"</div> : null}
              {results.map((result, index) => (
                <motion.div layout key={result.path} variants={listItemVariants} initial="hidden" animate="visible" custom={index} className="px-2">
                  <motion.button
                    type="button" whileTap={{ scale: 0.98 }}
                    className={`row flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-panel2 ${openRel === result.path ? 'row-sel bg-accent/12 text-accent' : 'text-sub'}`}
                    title={'~/.agent-nexus/' + result.path}
                    onClick={() => void openFile(result.path)}
                  >
                    <span className="text-sub/60"><Ic name="file" /></span>
                    <span className="min-w-0 flex-1 truncate">
                      {result.path.lastIndexOf('/') >= 0 ? <span className="font-mono text-sub/50">{result.path.slice(0, result.path.lastIndexOf('/') + 1)}</span> : null}
                      <span className={`font-mono ${openRel === result.path ? '' : 'text-fg'}`}>{result.path.split('/').pop()}</span>
                    </span>
                    <span className="text-[10px] text-sub/50">{humanSize(result.size)}</span>
                  </motion.button>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            /* 目录树模式 */
            <motion.div key="tree" initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -4 }}>
              {flat.map((row, index) => (
                <motion.div layout key={row.node.path} variants={listItemVariants} initial="hidden" animate="visible" custom={index} className="group/row flex items-center px-2" data-depth={row.depth}>
                  <motion.button
                    type="button" whileTap={{ scale: 0.98 }}
                    className={`row flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pr-1.5 text-left text-[12px] transition-colors hover:bg-panel2 ${openRel === row.node.path ? 'row-sel bg-accent/12 text-accent' : row.node.dir ? 'text-fg' : 'text-sub'}`}
                    style={{ marginLeft: row.depth * 14 }}
                    onClick={() => void toggle(row.node)}
                  >
                    {row.node.dir ? <Ic name="chevron" className={`text-sub/50 transition-transform ${row.node.expanded ? 'rotate-90' : ''}`} /> : <span className="inline-block w-4"></span>}
                    {row.node.dir ? <span className="text-accent/80"><Ic name="folder" /></span> : <Ic name="file" />}
                    <span className="flex-1 truncate font-mono" title={'~/.agent-nexus/' + row.node.path}>{row.node.name}</span>
                    {!row.node.dir ? <span className="text-[10px] text-sub/40">{humanSize(row.node.size)}</span> : null}
                  </motion.button>
                  {row.node.dir ? (
                    <motion.button
                      type="button" whileTap={{ scale: 0.98 }}
                      className="mr-1 hidden rounded p-1 text-sub/50 hover:text-accent group-hover/row:block"
                      title="New file here"
                      onClick={() => openNewFile(row.node)}
                    >
                      <Ic name="plus" />
                    </motion.button>
                  ) : null}
                </motion.div>
              ))}
              {!loading && tree.length === 0 ? <div className="px-4 py-8 text-center text-[12px] text-sub/70">Empty</div> : null}
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-1.5 border-t border-line px-3.5 py-2">
          <span className="h-1.5 w-1.5 flex-none rounded-full bg-ok/70"></span>
          <span className="truncate font-mono text-[10.5px] text-sub/60">~/.agent-nexus</span>
        </div>
      </motion.div>

      {/* 右：编辑器 */}
      <motion.div className="flex min-w0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
        <AnimatePresence mode="wait" initial={false}>
        {openRel ? (
          <motion.div key={openRel} className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -4 }}>
            <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
              {fileExt ? <span className="flex h-6 min-w-9 flex-none items-center justify-center rounded-md border border-line bg-panel2 px-1.5 font-mono text-[10px] font-semibold uppercase text-accent">{fileExt}</span> : null}
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[13px] font-medium">{pathParts.name}</div>
                <div className="truncate font-mono text-[11px] text-sub/70" title={openRel}>~/.agent-nexus/{openRel}</div>
              </div>
              <AnimatePresence>
                {dirty ? <motion.span className="flex flex-none items-center gap-1.5 rounded-md border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}><span className="dot dot-warn" />unsaved</motion.span> : null}
              </AnimatePresence>
              <motion.button
                type="button" whileTap={{ scale: 0.98 }}
                className={`flex-none rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition-opacity ${dirty ? 'bg-accent text-base hover:opacity-90' : 'border border-line text-sub/50'}`}
                disabled={!dirty || saving}
                onClick={() => void save()}
              >
                {saving ? 'Saving…' : 'Save (Ctrl+S)'}
              </motion.button>
            </div>
            {fileError ? (
              <motion.div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-err" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                {fileError}
              </motion.div>
            ) : (
              <CodeEditor
                value={draft}
                onChange={setDraft}
                filename={openRel}
                className="min-h-0 flex-1 overflow-hidden px-2"
                onSave={() => void save()}
              />
            )}
            {hint ? <motion.div className="border-t border-line bg-warn/5 px-4 py-2 text-[11.5px] text-warn/90" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>{hint}</motion.div> : null}
          </motion.div>
        ) : (
          /* 空状态 */
          <motion.div key="empty" className="flex flex-1 flex-col items-center justify-center gap-4 p-8" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-panel2 text-sub">
              <Ic name="folder" />
            </div>
            <div className="text-center">
              <div className="text-[14px] font-medium text-fg">No file selected</div>
              <div className="mt-1 text-[12px] text-sub/70">Browse the tree or search on the left, then pick a text file<br />(.md .txt .py .js …) to view and edit.</div>
            </div>
            <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg bg-accent px-4 py-2 text-[12px] font-medium text-base hover:opacity-90" onClick={() => openNewFile(null)}>Create a file</motion.button>
          </motion.div>
        )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
      {newFileOpen ? (
        <Modal key="new-file" title={`New file${newFileDir ? ' · ' + newFileDir.path : ''}`} onClose={() => setNewFileOpen(false)}>
          <div className="space-y-3">
            <p className="text-[12px] text-sub">
              Creates an empty file under <code className="font-mono">~/.agent-nexus/{newFileDir?.path ?? ''}</code> and opens it in the editor.
            </p>
            <input
              value={newFileName}
              onChange={(event) => setNewFileName(event.target.value)}
              className="w-full rounded-lg border border-line bg-base px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
              placeholder="filename (e.g. my-skill.md)"
              onKeyUp={(event) => {
                if (event.key === 'Enter') void createFile();
              }}
            />
            <div className="flex justify-end gap-2.5 pt-1">
              <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg border border-line px-3.5 py-1.5 text-[13px] text-sub hover:text-fg" onClick={() => setNewFileOpen(false)}>Cancel</motion.button>
              <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-base hover:opacity-90" onClick={() => void createFile()}>Create</motion.button>
            </div>
          </div>
        </Modal>
      ) : null}
      </AnimatePresence>
    </div>
  );
}
