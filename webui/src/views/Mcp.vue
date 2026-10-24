<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { store, log, refresh } from '../lib/store';
import { postMcpProfile, postTargetPaths, type ToolSnippet, type TargetStatus } from '../lib/api';
import Ic from '../components/Ic.vue';
import Modal from '../components/Modal.vue';
import { LOGOS } from '../lib/logos';

// 主从布局（与 Skills 页同款）：左列第一项 default（通用 agent-nexus-mcp）+ 各工具
// 每个工具一个以自己名字命名的 profile（默认全开），开关写入 .config/config.json 的 mcpProfiles
// 工具之间绝不合并展示（即使默认 MCP 配置路径相同，也各自独立、可单独覆盖路径 ✎）
// 服务器定义本身只读：来自 mcp.json（标准 mcpServers 格式，在 Files 模块编辑）

interface Row {
  id: string;
  label: string;
  target?: TargetStatus;
}

const selected = ref<string>('default');
const targets = computed(() => store.state?.status.targets ?? []);
const rows = computed<Row[]>(() => [
  { id: 'default', label: 'Default' },
  ...targets.value.map((t) => ({ id: t.eff.id, label: t.eff.label, target: t })),
]);
const current = computed<Row>(() => rows.value.find((r) => r.id === selected.value) ?? rows.value[0]);
const isDefault = computed(() => current.value?.id === 'default');

// Files 模块保存 mcp.json 后组件重挂载时拉一次最新状态
onMounted(() => void refresh());

const mcp = computed(() => store.state?.mcp ?? { upstreams: {}, profiles: {} });
const issues = computed(() => store.state?.mcpIssues ?? []);
const upstreamKeys = computed(() => Object.keys(mcp.value.upstreams));
// 全局可用 = mcp.json 里未 disabled 的服务器（分母）
const usableServers = computed(() => upstreamKeys.value.filter((k) => !mcp.value.upstreams[k].disabled));

function endpointText(key: string): string {
  const u = mcp.value.upstreams[key];
  return u.type === 'http' ? (u.url ?? '') : [u.command, ...(u.args ?? [])].filter(Boolean).join(' ');
}

/** 该项生效的服务器列表：无 profile = 默认全开 */
function enabledFor(id: string): string[] {
  const p = mcp.value.profiles[id];
  if (!p || p.upstreams === '*') return usableServers.value;
  return p.upstreams.filter((u) => usableServers.value.includes(u));
}

function isOn(id: string, key: string): boolean {
  return enabledFor(id).includes(key);
}

const busy = ref(false);
async function toggle(id: string, key: string): Promise<void> {
  if (busy.value || mcp.value.upstreams[key]?.disabled) return;
  const cur = enabledFor(id);
  const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
  busy.value = true;
  try {
    await postMcpProfile({ tool: id, upstreams: next });
    log(`${current.value.label}: ${key} ${next.includes(key) ? 'enabled' : 'disabled'}`, 'ok');
    await refresh();
  } catch (e) {
    log(`Toggle failed: ${(e as Error).message}`, 'err');
  } finally {
    busy.value = false;
  }
}

// 接入状态（只读探测自家条目是否存在）
function connectedNames(id: string): string[] {
  return store.state?.mcpConnected?.[id] ?? [];
}

function isDefaultRow(id: string): boolean {
  return id === 'default';
}

/** 行级接入状态：default 看通用条目是否被任何工具使用，工具看自己的配置 */
function rowConnected(id: string): string[] {
  if (id === 'default') return defaultInUse.value.length ? ['agent-nexus-mcp'] : [];
  return connectedNames(id);
}

/** 哪些工具的原生配置里有通用 agent-nexus-mcp 条目 */
const defaultInUse = computed<string[]>(() => {
  const map = store.state?.mcpConnected ?? {};
  return Object.entries(map)
    .filter(([, names]) => names.includes('agent-nexus-mcp'))
    .map(([id]) => targets.value.find((t) => t.eff.id === id)?.eff.label ?? id);
});

// 选中工具的接入片段：snippets 按工具 id 键控，一工具一份独立卡
function toolSnippets(r: Row): Array<{ profile: string; s: ToolSnippet }> {
  const s = (store.state?.snippets[r.id] ?? []).find((x) => x.id === r.id);
  return s ? [{ profile: r.id, s }] : [];
}

// default 项：展示所有工具的通用片段（server 名 agent-nexus-mcp）
const defaultSnippets = computed<ToolSnippet[]>(() => store.state?.snippets['default'] ?? []);

// 片段复制
const copied = ref('');
async function copy(s: ToolSnippet): Promise<void> {
  try {
    await navigator.clipboard.writeText(s.content);
    copied.value = s.id + s.content.slice(0, 24);
    setTimeout(() => (copied.value = ''), 1200);
  } catch {
    log('Copy failed: clipboard unavailable', 'err');
  }
}

// MCP 配置路径覆盖（每工具独立）
const editingPath = ref<{ id: string; label: string; effPath: string } | null>(null);
const editPathValue = ref('');

function openPathEdit(): void {
  if (!current.value?.target) return;
  editingPath.value = { id: current.value.id, label: current.value.label, effPath: current.value.target.eff.mcpConfig };
  editPathValue.value = '';
}

async function savePath(): Promise<void> {
  if (!editingPath.value) return;
  try {
    const v = editPathValue.value.trim();
    const { detail } = await postTargetPaths({ id: editingPath.value.id, key: 'mcpConfig', value: v === '' ? null : v });
    log(detail, 'ok');
    editingPath.value = null;
    await refresh();
  } catch (e) {
    log(`Save failed: ${(e as Error).message}`, 'err');
  }
}
</script>

<template>
  <div v-if="!store.state" class="py-20 text-center text-sub">Loading…</div>
  <div v-else class="space-y-4">
    <!-- 页头 -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold">MCP Servers</h2>
        <p class="mt-0.5 text-[12px] text-sub">
          Every server in <code class="font-mono">mcp.json</code> flows through one proxy entry — <span class="font-mono text-accent">agent-nexus-mcp</span> for all tools, or a per-tool <span class="font-mono">agent-nexus-mcp-&lt;tool&gt;</span> subset.
        </p>
      </div>
    </div>

    <!-- mcp.json 解析/校验问题（手编出错时提示） -->
    <div v-if="issues.length" class="rounded-xl border border-err/40 bg-err/10 px-4 py-3">
      <div class="flex items-center gap-2 text-[13px] font-medium text-err"><span class="dot dot-err" />mcp.json has problems — fix it in the Files view</div>
      <ul class="mt-1.5 list-disc space-y-0.5 pl-8 text-[12px] text-err/80">
        <li v-for="(e, i) in issues" :key="i">{{ e }}</li>
      </ul>
    </div>

    <!-- 主从两栏：左列选项与右侧面板各自独立（同 Skills 分离版式） -->
    <div class="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <!-- 左：default（通用）+ 工具列表 -->
      <div class="space-y-2">
        <button
          v-for="r in rows"
          :key="r.id"
          class="flex w-full items-center gap-3.5 rounded-xl border bg-panel px-4 py-3 text-left transition-colors hover:border-line2"
          :class="[
            current?.id === r.id ? 'row-sel border-accent/50 bg-accent/[0.06]' : 'border-line',
            r.target && !r.target.installed && 'opacity-55',
          ]"
          @click="selected = r.id"
        >
          <div class="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-panel2 p-1.5">
            <Ic v-if="isDefaultRow(r.id)" name="plug" class="h-5 w-5 text-accent" />
            <img v-else :src="LOGOS[r.id]" class="h-full w-full rounded-sm object-contain" alt="" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-[13px] font-semibold" :class="isDefaultRow(r.id) ? 'font-mono text-accent' : ''">{{ r.label }}</span>
              <span v-if="isDefaultRow(r.id)" class="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent/90">all tools</span>
              <span v-else-if="r.target && !r.target.installed" class="text-[11px] text-sub/60">not installed</span>
            </div>
            <div class="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-sub/70">
              <span class="dot" :class="rowConnected(r.id).length ? 'dot-ok' : 'dot-off'"></span>
              <span>{{ usableServers.length ? `${enabledFor(r.id).length} / ${usableServers.length} servers` : 'no servers yet' }}</span>
            </div>
          </div>
        </button>
      </div>

      <!-- 右：服务器开关面板在上，接入卡在下 -->
      <div v-if="current" class="min-w-0 space-y-4">
        <!-- 服务器开关面板（profile = 选中项名字，默认全开） -->
        <div class="rounded-xl border border-line bg-panel">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
            <div>
              <h3 class="text-[14px] font-semibold">Available MCP servers</h3>
              <p class="mt-0.5 text-[12px] text-sub">
                From <code class="font-mono text-accent">mcp.json</code> (Files view). Toggles set the
                <code class="font-mono">{{ current.id }}</code> profile{{ isDefault ? ' — the default applies to every tool using agent-nexus-mcp' : '' }}; defaults to all servers.
              </p>
            </div>
            <span class="rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent">
              {{ enabledFor(current.id).length }} / {{ usableServers.length }} enabled
            </span>
          </div>
          <div class="divide-y divide-line/60">
            <div v-if="upstreamKeys.length === 0" class="px-5 py-6 text-center text-[12px] text-sub/70">
              No servers yet — add entries to the "mcpServers" object in mcp.json (Files view).
            </div>
            <div v-for="k in upstreamKeys" :key="k" class="flex flex-wrap items-center gap-3 px-5 py-3" :class="mcp.upstreams[k].disabled ? 'opacity-55' : ''">
              <span class="w-36 flex-none truncate font-mono text-[12.5px] font-medium text-fg" :title="k">{{ k }}</span>
              <span class="flex-none rounded-md border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-sub">{{ mcp.upstreams[k].type }}</span>
              <span class="min-w-40 flex-1 truncate font-mono text-[11.5px] text-sub/80" :title="endpointText(k)">{{ endpointText(k) || '—' }}</span>
              <span v-if="mcp.upstreams[k].disabled" class="flex-none rounded-md border border-line px-1.5 py-0.5 text-[10.5px] font-medium text-sub/70">globally disabled</span>
              <!-- 该项的开/关 -->
              <button
                class="relative h-5 w-9 flex-none rounded-full border transition-colors"
                :class="[
                  isOn(current.id, k) ? 'border-accent/60 bg-accent/25' : 'border-line bg-panel2',
                  mcp.upstreams[k].disabled && 'cursor-not-allowed opacity-40',
                ]"
                role="switch"
                :aria-checked="isOn(current.id, k)"
                :disabled="busy || mcp.upstreams[k].disabled"
                :title="mcp.upstreams[k].disabled ? 'Globally disabled in mcp.json' : isOn(current.id, k) ? `On for ${current.label} — click to exclude` : `Off for ${current.label} — click to include`"
                @click="toggle(current.id, k)"
              >
                <span
                  class="absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all"
                  :class="isOn(current.id, k) ? 'left-[18px] bg-accent' : 'left-0.5 bg-sub/60'"
                ></span>
              </button>
            </div>
          </div>
        </div>

        <!-- 接入卡 -->
        <div class="rounded-xl border border-line bg-panel">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-panel2 p-1.5">
                <Ic v-if="isDefault" name="plug" class="h-4.5 w-4.5 text-accent" />
                <img v-else :src="LOGOS[current.id]" class="h-full w-full rounded-sm object-contain" alt="" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-[13px] font-semibold" :class="isDefault ? 'font-mono text-accent' : ''">{{ current.label }}</span>
                  <span v-if="current.target?.eff.mcpConfigCustomized" class="rounded bg-accent/12 px-1.5 py-0.5 text-[10px] text-accent">custom path</span>
                </div>
                <div class="truncate font-mono text-[11px] text-sub/70" :title="isDefault ? 'agent-nexus-mcp' : toolSnippets(current)[0]?.s.file">
                  {{ isDefault ? 'agent-nexus-mcp · applies to every tool' : toolSnippets(current)[0]?.s.file ?? '—' }}
                </div>
              </div>
            </div>
            <div class="flex flex-none items-center gap-2">
              <button
                v-if="!isDefault"
                class="rounded-lg p-1.5 text-sub/60 transition-colors hover:text-accent"
                title="Custom MCP config path"
                @click="openPathEdit"
              >
                <Ic name="edit" />
              </button>
              <span
                class="rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium"
                :class="rowConnected(current.id).length ? 'border-ok/40 bg-ok/10 text-ok' : 'border-line text-sub/70'"
              >
                {{ rowConnected(current.id).length ? 'in use ✓' : 'not in use' }}
              </span>
            </div>
          </div>
          <div class="space-y-3 p-4">
            <p v-if="isDefault" :class="defaultInUse.length ? 'text-[12px] text-ok/90' : 'text-[12px] text-sub'">
              <template v-if="defaultInUse.length">
                Found agent-nexus-mcp in {{ defaultInUse.join(', ') }} — restart those tools after changing mcp.json or the toggles above.
              </template>
              <template v-else>
                The universal entry — merge any tool's snippet below and all mcp.json servers flow through <span class="font-mono text-accent">agent-nexus-mcp</span>.
              </template>
            </p>
            <p v-else-if="rowConnected(current.id).length" class="text-[12px] text-ok/90">
              Found {{ rowConnected(current.id).join(', ') }} in this tool's MCP config — restart {{ current.label }} after changing mcp.json or the toggles above.
            </p>
            <p v-else class="text-[12px] text-sub">
              Not connected yet — merge the snippet below into the tool's MCP config; the server name carries this tool's profile (<span class="font-mono text-accent">agent-nexus-mcp-{{ current.id }}</span>).
            </p>

            <!-- default：所有工具的通用片段网格 -->
            <div v-if="isDefault" class="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div v-for="s in defaultSnippets" :key="s.id" class="rounded-lg border border-line bg-base p-3">
                <div class="mb-2 flex items-center justify-between">
                  <span class="flex items-center gap-2 text-[13px] font-medium">
                    <img :src="LOGOS[s.id]" class="h-4 w-4 rounded-sm object-contain" alt="" />{{ s.label }}
                  </span>
                  <button class="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-sub transition-colors hover:border-accent/50 hover:text-accent" @click="copy(s)">
                    <Ic name="copy" />
                    {{ copied === s.id + s.content.slice(0, 24) ? 'Copied' : 'Copy' }}
                  </button>
                </div>
                <div class="mb-1.5 font-mono text-[11px] text-sub/70">{{ s.file }}</div>
                <pre class="max-h-44 overflow-auto rounded-md bg-panel px-3 py-2 font-mono text-[11.5px] leading-relaxed text-fg/90">{{ s.content }}</pre>
                <div v-if="s.cli" class="mt-2">
                  <div class="mb-1 flex items-center justify-between">
                    <span class="text-[11px] font-medium text-sub/80">CLI one-liner</span>
                    <button
                      class="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-sub transition-colors hover:border-accent/50 hover:text-accent"
                      @click="copy({ ...s, id: s.id + '-cli', content: s.cli ?? '' })"
                    >
                      <Ic name="copy" />
                      {{ copied === s.id + '-cli' + (s.cli ?? '').slice(0, 24) ? 'Copied' : 'Copy' }}
                    </button>
                  </div>
                  <pre class="overflow-auto rounded-md bg-panel px-3 py-2 font-mono text-[11px] leading-relaxed text-fg/90">{{ s.cli }}</pre>
                </div>
                <div v-if="s.note" class="mt-1.5 text-[11px] text-sub/70">{{ s.note }}</div>
              </div>
            </div>

            <!-- 具体工具：单张片段卡 -->
            <template v-else>
              <div v-for="{ profile, s } in toolSnippets(current)" :key="profile" class="rounded-lg border border-line bg-base p-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-[12px] font-medium">
                  profile: {{ profile }}
                  <span class="ml-1.5 font-mono text-[11px] font-normal text-accent">agent-nexus-mcp-{{ profile }}</span>
                </span>
                <button class="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-sub transition-colors hover:border-accent/50 hover:text-accent" @click="copy(s)">
                  <Ic name="copy" />
                  {{ copied === s.id + s.content.slice(0, 24) ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre class="max-h-44 overflow-auto rounded-md bg-panel px-3 py-2 font-mono text-[11.5px] leading-relaxed text-fg/90">{{ s.content }}</pre>
              <div v-if="s.cli" class="mt-2">
                <div class="mb-1 flex items-center justify-between">
                  <span class="text-[11px] font-medium text-sub/80">CLI one-liner</span>
                  <button
                    class="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-sub transition-colors hover:border-accent/50 hover:text-accent"
                    @click="copy({ ...s, id: s.id + '-cli', content: s.cli ?? '' })"
                  >
                    <Ic name="copy" />
                    {{ copied === s.id + '-cli' + (s.cli ?? '').slice(0, 24) ? 'Copied' : 'Copy' }}
                  </button>
                </div>
                <pre class="overflow-auto rounded-md bg-panel px-3 py-2 font-mono text-[11px] leading-relaxed text-fg/90">{{ s.cli }}</pre>
              </div>
              <div v-if="s.note" class="mt-1.5 text-[11px] text-sub/70">{{ s.note }}</div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- MCP 配置路径覆盖弹窗 -->
    <Modal v-if="editingPath" :title="`${editingPath.label} · custom MCP config path`" @close="editingPath = null">
      <div class="space-y-3">
        <p class="text-[12px] text-sub">
          Accepts home-relative (e.g. <code class="font-mono">.codex/config.toml</code>), <code class="font-mono">~/</code>, or absolute paths. Save empty = reset to default.<br />
          Current: <code class="font-mono text-[11px]">{{ editingPath.effPath }}</code>
        </p>
        <input
          v-model="editPathValue"
          class="w-full rounded-lg border border-line bg-base px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
          :placeholder="editingPath.effPath"
          @keyup.enter="savePath"
        />
        <div class="flex justify-end gap-2.5 pt-1">
          <button class="rounded-lg border border-line px-3.5 py-1.5 text-[13px] text-sub hover:text-fg" @click="editingPath = null">Cancel</button>
          <button class="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-base hover:opacity-90" @click="savePath">Save</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
