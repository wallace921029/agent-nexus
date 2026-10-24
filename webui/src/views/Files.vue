<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { log } from '../lib/store';
import { fsList, fsRead, fsWrite, fsSearch, type FsEntry } from '../lib/api';
import Ic from '../components/Ic.vue';
import Modal from '../components/Modal.vue';
import CodeEditor from '../components/CodeEditor.vue';

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

const tree = ref<TreeNode[]>([]);
const loading = ref(false);

const openRel = ref<string | null>(null);
const original = ref('');
const draft = ref('');
const fileError = ref('');
const saving = ref(false);
const newFileDir = ref<TreeNode | null>(null);
const newFileOpen = ref(false);
const newFileName = ref('');

// ---- 搜索 ----
const query = ref('');
const searching = ref(false);
const results = ref<Array<{ path: string; dir: boolean; size?: number }>>([]);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

watch(query, (v) => {
  clearTimeout(searchTimer);
  if (!v.trim()) {
    results.value = [];
    return;
  }
  searching.value = true;
  searchTimer = setTimeout(async () => {
    try {
      const r = await fsSearch(v.trim());
      results.value = r.results;
    } catch (e) {
      log(`Search failed: ${(e as Error).message}`, 'err');
    } finally {
      searching.value = false;
    }
  }, 160);
});

/** 展开的树 → 扁平渲染行（带深度） */
const flat = computed(() => {
  const out: Array<{ node: TreeNode; depth: number }> = [];
  (function walk(nodes: TreeNode[], depth: number) {
    for (const n of nodes) {
      out.push({ node: n, depth });
      if (n.dir && n.expanded && n.children) walk(n.children, depth + 1);
    }
  })(tree.value, 0);
  return out;
});

const dirty = computed(() => openRel.value !== null && draft.value !== original.value);

const fileExt = computed(() => (openRel.value?.split('.').pop() ?? '').slice(0, 4).toLowerCase());

// 编辑器头部路径拆分：目录部分 + 文件名
const pathParts = computed(() => {
  const rel = openRel.value ?? '';
  const i = rel.lastIndexOf('/');
  return { dir: i >= 0 ? rel.slice(0, i + 1) : '', name: i >= 0 ? rel.slice(i + 1) : rel };
});

function humanSize(n?: number): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function toNodes(entries: FsEntry[], parentPath: string): TreeNode[] {
  return entries.map((e) => ({
    name: e.name,
    path: parentPath ? `${parentPath}/${e.name}` : e.name,
    dir: e.dir,
    size: e.size,
  }));
}

async function fetchEntries(path: string): Promise<TreeNode[]> {
  const r = await fsList(path);
  return toNodes(r.entries, path === '' ? '' : path);
}

/** 展开目录（首次懒加载），已加载则收起/再展开 */
async function toggle(node: TreeNode): Promise<void> {
  if (!node.dir) {
    await openFile(node.path);
    return;
  }
  if (node.loaded) {
    node.expanded = !node.expanded;
    return;
  }
  loading.value = true;
  try {
    node.children = await fetchEntries(node.path);
    node.loaded = true;
    node.expanded = true;
  } catch (e) {
    log(`Failed to list directory: ${(e as Error).message}`, 'err');
  } finally {
    loading.value = false;
  }
}

async function reloadRoot(): Promise<void> {
  loading.value = true;
  try {
    tree.value = await fetchEntries('');
  } catch (e) {
    log(`Failed to list directory: ${(e as Error).message}`, 'err');
  } finally {
    loading.value = false;
  }
}

async function openFile(rel: string): Promise<void> {
  if (dirty.value && !confirm('This file has unsaved changes that will be lost. Continue?')) return;
  openRel.value = rel;
  original.value = '';
  draft.value = '';
  fileError.value = '';
  try {
    const r = await fsRead(rel);
    original.value = r.content;
    draft.value = r.content;
  } catch (e) {
    fileError.value = (e as Error).message;
  }
}

async function save(): Promise<void> {
  if (!openRel.value || saving.value) return;
  saving.value = true;
  try {
    await fsWrite({ path: openRel.value, content: draft.value });
    original.value = draft.value;
    log(`Saved ${openRel.value}`, 'ok');
  } catch (e) {
    log(`Save failed: ${(e as Error).message}`, 'err');
  } finally {
    saving.value = false;
  }
}

const hint = computed(() => {
  const p = openRel.value ?? '';
  if (p === 'AGENTS.md' || p.startsWith('overlays/')) {
    return 'This is an instruction source file: re-distribute from the AGENTS.md page (or run sync-agents) after saving to take effect.';
  }
  if (p.startsWith('skills/')) {
    return 'This is a skill source file: saves take effect immediately (tools read through symlinks).';
  }
  if (p === 'mcp.json') {
    return 'Standard mcpServers format (same as Claude\'s config): the proxy aggregates every entry — see the parsed result on the MCP Servers view. Per-tool subsets go under "mcpProfiles" in .config/config.json.';
  }
  if (p.startsWith('.config/build/')) {
    return 'Auto-generated artifact: overwritten on the next sync-agents — edit AGENTS.md / overlays instead.';
  }
  return '';
});

function openNewFile(node: TreeNode | null): void {
  newFileDir.value = node;
  newFileName.value = '';
  newFileOpen.value = true;
}

const createFile = async (): Promise<void> => {
  const name = newFileName.value.trim();
  if (!name) return;
  const dirPath = newFileDir.value?.path ?? '';
  const rel = dirPath ? `${dirPath}/${name}` : name;
  try {
    await fsWrite({ path: rel, content: '' });
    log(`Created ${rel}`, 'ok');
    newFileOpen.value = false;
    if (newFileDir.value) {
      newFileDir.value.loaded = false;
      newFileDir.value.expanded = true;
      await toggle(newFileDir.value);
    } else {
      await reloadRoot();
    }
    await openFile(rel);
  } catch (e) {
    log(`Create failed: ${(e as Error).message}`, 'err');
  }
};

onMounted(() => void reloadRoot());
</script>

<template>
  <div class="flex h-[calc(100vh-3rem)] gap-4">
    <!-- 左：文件浏览器 -->
    <div class="flex w-80 flex-none flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div class="border-b border-line px-3.5 py-3">
        <div class="flex items-center justify-between">
          <span class="text-[13px] font-semibold">Files</span>
          <div class="flex items-center gap-1">
            <button class="rounded-md p-1.5 text-sub/70 transition-colors hover:bg-panel2 hover:text-accent" title="Refresh tree" @click="reloadRoot()"><Ic name="refresh" :class="loading ? 'animate-spin' : ''" /></button>
            <button class="rounded-md p-1.5 text-sub/70 transition-colors hover:bg-panel2 hover:text-accent" title="New file in root" @click="openNewFile(null)"><Ic name="plus" /></button>
          </div>
        </div>
        <div class="relative mt-2.5">
          <span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sub/50"><Ic name="search" /></span>
          <input
            v-model="query"
            class="w-full rounded-lg border border-line bg-input py-1.5 pl-8 pr-2.5 text-[12px] text-fg outline-none transition-colors placeholder:text-sub/50 focus:border-accent/50"
            placeholder="Search files…"
            spellcheck="false"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto py-1.5">
        <!-- 搜索结果模式 -->
        <template v-if="query.trim()">
          <div v-if="!searching && results.length === 0" class="px-4 py-8 text-center text-[12px] text-sub/70">No matches for "{{ query.trim() }}"</div>
          <div v-for="r in results" :key="r.path" class="px-2">
            <button
              class="row flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-panel2"
              :class="openRel === r.path ? 'row-sel bg-accent/12 text-accent' : 'text-sub'"
              :title="'~/.agent-nexus/' + r.path"
              @click="openFile(r.path)"
            >
              <span class="text-sub/60"><Ic name="file" /></span>
              <span class="min-w-0 flex-1 truncate">
                <span v-if="r.path.lastIndexOf('/') >= 0" class="font-mono text-sub/50">{{ r.path.slice(0, r.path.lastIndexOf('/') + 1) }}</span>
                <span class="font-mono" :class="openRel === r.path ? '' : 'text-fg'">{{ r.path.split('/').pop() }}</span>
              </span>
              <span class="text-[10px] text-sub/50">{{ humanSize(r.size) }}</span>
            </button>
          </div>
        </template>

        <!-- 目录树模式 -->
        <template v-else>
          <div v-for="row in flat" :key="row.node.path" class="group/row flex items-center px-2" :data-depth="row.depth">
            <button
              class="row flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pr-1.5 text-left text-[12px] transition-colors hover:bg-panel2"
              :style="{ marginLeft: row.depth * 14 + 'px' }"
              :class="openRel === row.node.path ? 'row-sel bg-accent/12 text-accent' : row.node.dir ? 'text-fg' : 'text-sub'"
              @click="toggle(row.node)"
            >
              <Ic v-if="row.node.dir" name="chevron" class="text-sub/50 transition-transform" :class="row.node.expanded ? 'rotate-90' : ''" />
              <span v-else class="inline-block w-4"></span>
              <span v-if="row.node.dir" class="text-accent/80"><Ic name="folder" /></span>
              <Ic v-else name="file" />
              <span class="flex-1 truncate font-mono" :title="'~/.agent-nexus/' + row.node.path">{{ row.node.name }}</span>
              <span v-if="!row.node.dir" class="text-[10px] text-sub/40">{{ humanSize(row.node.size) }}</span>
            </button>
            <button
              v-if="row.node.dir"
              class="mr-1 hidden rounded p-1 text-sub/50 hover:text-accent group-hover/row:block"
              title="New file here"
              @click="openNewFile(row.node)"
            >
              <Ic name="plus" />
            </button>
          </div>
          <div v-if="!loading && tree.length === 0" class="px-4 py-8 text-center text-[12px] text-sub/70">Empty</div>
        </template>
      </div>

      <div class="flex items-center gap-1.5 border-t border-line px-3.5 py-2">
        <span class="h-1.5 w-1.5 flex-none rounded-full bg-ok/70"></span>
        <span class="truncate font-mono text-[10.5px] text-sub/60">~/.agent-nexus</span>
      </div>
    </div>

    <!-- 右：编辑器 -->
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <template v-if="openRel">
        <div class="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <span v-if="fileExt" class="flex h-6 min-w-9 flex-none items-center justify-center rounded-md border border-line bg-panel2 px-1.5 font-mono text-[10px] font-semibold uppercase text-accent">{{ fileExt }}</span>
          <div class="min-w-0 flex-1 leading-tight">
            <div class="truncate text-[13px] font-medium">{{ pathParts.name }}</div>
            <div class="truncate font-mono text-[11px] text-sub/70" :title="openRel">~/.agent-nexus/{{ openRel }}</div>
          </div>
          <span v-if="dirty" class="flex flex-none items-center gap-1.5 rounded-md border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn"><span class="dot dot-warn" />unsaved</span>
          <button
            class="flex-none rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition-opacity"
            :class="dirty ? 'bg-accent text-base hover:opacity-90' : 'border border-line text-sub/50'"
            :disabled="!dirty || saving"
            @click="save()"
          >
            {{ saving ? 'Saving…' : 'Save (Ctrl+S)' }}
          </button>
        </div>
        <div v-if="fileError" class="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-err">
          {{ fileError }}
        </div>
        <CodeEditor
          v-else
          v-model="draft"
          :filename="openRel"
          class="min-h-0 flex-1 overflow-hidden px-2"
          @save="save()"
        />
        <div v-if="hint" class="border-t border-line bg-warn/5 px-4 py-2 text-[11.5px] text-warn/90">{{ hint }}</div>
      </template>

      <!-- 空状态 -->
      <div v-else class="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <div class="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-panel2 text-sub">
          <Ic name="folder" />
        </div>
        <div class="text-center">
          <div class="text-[14px] font-medium text-fg">No file selected</div>
          <div class="mt-1 text-[12px] text-sub/70">Browse the tree or search on the left, then pick a text file<br />(.md .txt .py .js …) to view and edit.</div>
        </div>
        <button class="rounded-lg bg-accent px-4 py-2 text-[12px] font-medium text-base hover:opacity-90" @click="openNewFile(null)">Create a file</button>
      </div>
    </div>

    <Modal v-if="newFileOpen" :title="`New file${newFileDir ? ' · ' + newFileDir.path : ''}`" @close="newFileOpen = false">
      <div class="space-y-3">
        <p class="text-[12px] text-sub">
          Creates an empty file under <code class="font-mono">~/.agent-nexus/{{ newFileDir?.path ?? '' }}</code> and opens it in the editor.
        </p>
        <input
          v-model="newFileName"
          class="w-full rounded-lg border border-line bg-base px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
          placeholder="filename (e.g. my-skill.md)"
          @keyup.enter="createFile"
        />
        <div class="flex justify-end gap-2.5 pt-1">
          <button class="rounded-lg border border-line px-3.5 py-1.5 text-[13px] text-sub hover:text-fg" @click="newFileOpen = false">Cancel</button>
          <button class="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-base hover:opacity-90" @click="createFile">Create</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
