import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { log, refresh, useStore } from '../lib/store';
import { listContainerVariants, listItemVariants, sectionVariants, transitions } from '../lib/animation';
import { postMcpProfile, postTargetPaths, type ToolSnippet, type TargetStatus } from '../lib/api';
import Ic from '../components/Ic';
import Modal from '../components/Modal';
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

interface EditingPath {
  id: string;
  label: string;
  effPath: string;
}

function isDefaultRow(id: string): boolean {
  return id === 'default';
}

function CopyLabel({ copied }: { copied: boolean }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={copied ? 'copied' : 'copy'}
        initial={{ opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -2 }}
      >
        {copied ? 'Copied' : 'Copy'}
      </motion.span>
    </AnimatePresence>
  );
}

export default function Mcp() {
  const store = useStore();
  const [selected, setSelected] = useState('default');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [copied, setCopied] = useState('');
  const [editingPath, setEditingPath] = useState<EditingPath | null>(null);
  const [editPathValue, setEditPathValue] = useState('');

  const targets = store.state?.status.targets ?? [];
  const rows: Row[] = [
    { id: 'default', label: 'Default' },
    ...targets.map((target) => ({ id: target.eff.id, label: target.eff.label, target })),
  ];
  const current = rows.find((row) => row.id === selected) ?? rows[0];
  const currentRef = useRef(current);
  currentRef.current = current;
  const isDefault = current.id === 'default';

  // Files 模块保存 mcp.json 后组件重挂载时拉一次最新状态
  useEffect(() => {
    void refresh();
  }, []);

  const mcp = store.state?.mcp ?? { upstreams: {}, profiles: {} };
  const issues = store.state?.mcpIssues ?? [];
  const upstreamKeys = Object.keys(mcp.upstreams);
  // 全局可用 = mcp.json 里未 disabled 的服务器（分母）
  const usableServers = upstreamKeys.filter((key) => !mcp.upstreams[key].disabled);

  function endpointText(key: string): string {
    const upstream = mcp.upstreams[key];
    return upstream.type === 'http' ? (upstream.url ?? '') : [upstream.command, ...(upstream.args ?? [])].filter(Boolean).join(' ');
  }

  /** 该项生效的服务器列表：无 profile = 默认全开 */
  function enabledFor(id: string): string[] {
    const profile = mcp.profiles[id];
    if (!profile || profile.upstreams === '*') return usableServers;
    return profile.upstreams.filter((upstream) => usableServers.includes(upstream));
  }

  function isOn(id: string, key: string): boolean {
    return enabledFor(id).includes(key);
  }

  async function toggle(id: string, key: string): Promise<void> {
    if (busyRef.current || mcp.upstreams[key]?.disabled) return;
    const currentEnabled = enabledFor(id);
    const next = currentEnabled.includes(key) ? currentEnabled.filter((item) => item !== key) : [...currentEnabled, key];
    busyRef.current = true;
    setBusy(true);
    try {
      await postMcpProfile({ tool: id, upstreams: next });
      log(`${currentRef.current.label}: ${key} ${next.includes(key) ? 'enabled' : 'disabled'}`, 'ok');
      await refresh();
    } catch (e) {
      log(`Toggle failed: ${(e as Error).message}`, 'err');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // 接入状态（只读探测自家条目是否存在）
  function connectedNames(id: string): string[] {
    return store.state?.mcpConnected?.[id] ?? [];
  }

  /** 哪些工具的原生配置里有通用 agent-nexus-mcp 条目 */
  const defaultInUse = Object.entries(store.state?.mcpConnected ?? {})
    .filter(([, names]) => names.includes('agent-nexus-mcp'))
    .map(([id]) => targets.find((target) => target.eff.id === id)?.eff.label ?? id);

  /** 行级接入状态：default 看通用条目是否被任何工具使用，工具看自己的配置 */
  function rowConnected(id: string): string[] {
    if (id === 'default') return defaultInUse.length ? ['agent-nexus-mcp'] : [];
    return connectedNames(id);
  }

  // 选中工具的接入片段：snippets 按工具 id 键控，一工具一份独立卡
  function toolSnippets(row: Row): Array<{ profile: string; snippet: ToolSnippet }> {
    const snippet = (store.state?.snippets[row.id] ?? []).find((item) => item.id === row.id);
    return snippet ? [{ profile: row.id, snippet }] : [];
  }

  // default 项：展示所有工具的通用片段（server 名 agent-nexus-mcp）
  const defaultSnippets = store.state?.snippets['default'] ?? [];

  // 片段复制
  async function copy(snippet: ToolSnippet): Promise<void> {
    try {
      await navigator.clipboard.writeText(snippet.content);
      setCopied(snippet.id + snippet.content.slice(0, 24));
      setTimeout(() => setCopied(''), 1200);
    } catch {
      log('Copy failed: clipboard unavailable', 'err');
    }
  }

  function openPathEdit(): void {
    if (!current.target) return;
    setEditingPath({ id: current.id, label: current.label, effPath: current.target.eff.mcpConfig });
    setEditPathValue('');
  }

  async function savePath(): Promise<void> {
    const currentEdit = editingPath;
    if (!currentEdit) return;
    try {
      const value = editPathValue.trim();
      const { detail } = await postTargetPaths({ id: currentEdit.id, key: 'mcpConfig', value: value === '' ? null : value });
      log(detail, 'ok');
      setEditingPath(null);
      await refresh();
    } catch (e) {
      log(`Save failed: ${(e as Error).message}`, 'err');
    }
  }

  if (!store.state) return <div className="py-20 text-center text-sub">Loading…</div>;

  return (
    <div className="space-y-4">
      {/* 页头 */}
      <motion.div className="flex flex-wrap items-center justify-between gap-3" variants={sectionVariants} initial="hidden" animate="visible">
        <div>
          <h2 className="text-base font-semibold">MCP Servers</h2>
          <p className="mt-0.5 text-[12px] text-sub">
            Every server in <code className="font-mono">mcp.json</code> flows through one proxy entry — <span className="font-mono text-accent">agent-nexus-mcp</span> for all tools, or a per-tool <span className="font-mono">agent-nexus-mcp-&lt;tool&gt;</span> subset.
          </p>
        </div>
      </motion.div>

      {/* mcp.json 解析/校验问题（手编出错时提示） */}
      {issues.length ? (
        <motion.div className="rounded-xl border border-err/40 bg-err/10 px-4 py-3" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 text-[13px] font-medium text-err"><span className="dot dot-err" />mcp.json has problems — fix it in the Files view</div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-8 text-[12px] text-err/80">
            {issues.map((issue, index) => <li key={index}>{issue}</li>)}
          </ul>
        </motion.div>
      ) : null}

      {/* 主从两栏：左列选项与右侧面板各自独立（同 Skills 分离版式） */}
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* 左：default（通用）+ 工具列表 */}
        <motion.div className="space-y-2" variants={listContainerVariants} initial="hidden" animate="visible">
          {rows.map((row) => (
            <motion.button
              type="button" whileTap={{ scale: 0.98 }}
              key={row.id}
              variants={listItemVariants}
              whileHover={{ x: 2 }}
              className={[
                'flex w-full items-center gap-3.5 rounded-xl border bg-panel px-4 py-3 text-left transition-colors hover:border-line2',
                current.id === row.id ? 'row-sel border-accent/50 bg-accent/[0.06]' : 'border-line',
                row.target && !row.target.installed ? 'opacity-55' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelected(row.id)}
            >
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-panel2 p-1.5">
                {isDefaultRow(row.id) ? <Ic name="plug" className="h-5 w-5 text-accent" /> : <img src={LOGOS[row.id]} className="h-full w-full rounded-sm object-contain" alt="" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[13px] font-semibold ${isDefaultRow(row.id) ? 'font-mono text-accent' : ''}`}>{row.label}</span>
                  {isDefaultRow(row.id) ? (
                    <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent/90">all tools</span>
                  ) : row.target && !row.target.installed ? (
                    <span className="text-[11px] text-sub/60">not installed</span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-sub/70">
                  <span className={`dot ${rowConnected(row.id).length ? 'dot-ok' : 'dot-off'}`}></span>
                  <span>{usableServers.length ? `${enabledFor(row.id).length} / ${usableServers.length} servers` : 'no servers yet'}</span>
                </div>
              </div>
            </motion.button>
          ))}
        </motion.div>

        {/* 右：服务器开关面板在上，接入卡在下 */}
        <AnimatePresence mode="wait">
        <motion.div key={current.id} className="min-w-0 space-y-4" variants={sectionVariants} initial="hidden" animate="visible" exit="exit">
          {/* 服务器开关面板（profile = 选中项名字，默认全开） */}
          <div className="rounded-xl border border-line bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
              <div>
                <h3 className="text-[14px] font-semibold">Available MCP servers</h3>
                <p className="mt-0.5 text-[12px] text-sub">
                  From <code className="font-mono text-accent">mcp.json</code> (Files view). Toggles set the{' '}
                  <code className="font-mono">{current.id}</code> profile{isDefault ? ' — the default applies to every tool using agent-nexus-mcp' : ''}; defaults to all servers.
                </p>
              </div>
              <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent">
                {enabledFor(current.id).length} / {usableServers.length} enabled
              </span>
            </div>
            <div className="divide-y divide-line/60">
              {upstreamKeys.length === 0 ? (
                <div className="px-5 py-6 text-center text-[12px] text-sub/70">
                  No servers yet — add entries to the "mcpServers" object in mcp.json (Files view).
                </div>
              ) : null}
              {upstreamKeys.map((key, index) => (
                <motion.div layout key={key} variants={listItemVariants} initial="hidden" animate="visible" custom={index} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${mcp.upstreams[key].disabled ? 'opacity-55' : ''}`}>
                  <span className="w-36 flex-none truncate font-mono text-[12.5px] font-medium text-fg" title={key}>{key}</span>
                  <span className="flex-none rounded-md border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-sub">{mcp.upstreams[key].type}</span>
                  <span className="min-w-40 flex-1 truncate font-mono text-[11.5px] text-sub/80" title={endpointText(key)}>{endpointText(key) || '—'}</span>
                  {mcp.upstreams[key].disabled ? <span className="flex-none rounded-md border border-line px-1.5 py-0.5 text-[10.5px] font-medium text-sub/70">globally disabled</span> : null}
                  {/* 该项的开/关 */}
                  <motion.button
                    type="button" whileTap={{ scale: 0.98 }}
                    className={[
                      'relative h-5 w-9 flex-none rounded-full border transition-colors',
                      isOn(current.id, key) ? 'border-accent/60 bg-accent/25' : 'border-line bg-panel2',
                      mcp.upstreams[key].disabled ? 'cursor-not-allowed opacity-40' : '',
                    ].filter(Boolean).join(' ')}
                    role="switch"
                    aria-checked={isOn(current.id, key)}
                    disabled={busy || mcp.upstreams[key].disabled}
                    title={mcp.upstreams[key].disabled ? 'Globally disabled in mcp.json' : isOn(current.id, key) ? `On for ${current.label} — click to exclude` : `Off for ${current.label} — click to include`}
                    onClick={() => void toggle(current.id, key)}
                  >
                    <motion.span
                      initial={false}
                      animate={{ x: isOn(current.id, key) ? 14 : 0 }}
                      transition={transitions.spring}
                      className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full ${isOn(current.id, key) ? 'bg-accent' : 'bg-sub/60'}`}
                    />
                  </motion.button>
                </motion.div>
              ))}
            </div>
          </div>

          {/* 接入卡 */}
          <div className="rounded-xl border border-line bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-panel2 p-1.5">
                  {isDefault ? <Ic name="plug" className="h-4.5 w-4.5 text-accent" /> : <img src={LOGOS[current.id]} className="h-full w-full rounded-sm object-contain" alt="" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-semibold ${isDefault ? 'font-mono text-accent' : ''}`}>{current.label}</span>
                    {current.target?.eff.mcpConfigCustomized ? <span className="rounded bg-accent/12 px-1.5 py-0.5 text-[10px] text-accent">custom path</span> : null}
                  </div>
                  <div className="truncate font-mono text-[11px] text-sub/70" title={isDefault ? 'agent-nexus-mcp' : toolSnippets(current)[0]?.snippet.file}>
                    {isDefault ? 'agent-nexus-mcp · applies to every tool' : toolSnippets(current)[0]?.snippet.file ?? '—'}
                  </div>
                </div>
              </div>
              <div className="flex flex-none items-center gap-2">
                {!isDefault ? (
                  <motion.button
                    type="button" whileTap={{ scale: 0.98 }}
                    className="rounded-lg p-1.5 text-sub/60 transition-colors hover:text-accent"
                    title="Custom MCP config path"
                    onClick={openPathEdit}
                  >
                    <Ic name="edit" />
                  </motion.button>
                ) : null}
                <span className={`rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${rowConnected(current.id).length ? 'border-ok/40 bg-ok/10 text-ok' : 'border-line text-sub/70'}`}>
                  {rowConnected(current.id).length ? 'in use ✓' : 'not in use'}
                </span>
              </div>
            </div>
            <div className="space-y-3 p-4">
              {isDefault ? (
                <p className={defaultInUse.length ? 'text-[12px] text-ok/90' : 'text-[12px] text-sub'}>
                  {defaultInUse.length
                    ? `Found agent-nexus-mcp in ${defaultInUse.join(', ')} — restart those tools after changing mcp.json or the toggles above.`
                    : <>The universal entry — merge any tool's snippet below and all mcp.json servers flow through <span className="font-mono text-accent">agent-nexus-mcp</span>.</>}
                </p>
              ) : rowConnected(current.id).length ? (
                <p className="text-[12px] text-ok/90">
                  Found {rowConnected(current.id).join(', ')} in this tool's MCP config — restart {current.label} after changing mcp.json or the toggles above.
                </p>
              ) : (
                <p className="text-[12px] text-sub">
                  Not connected yet — merge the snippet below into the tool's MCP config; the server name carries this tool's profile (<span className="font-mono text-accent">agent-nexus-mcp-{current.id}</span>).
                </p>
              )}

              {/* default：所有工具的通用片段网格 */}
              {isDefault ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {defaultSnippets.map((snippet, index) => (
                    <motion.div layout key={snippet.id} variants={listItemVariants} initial="hidden" animate="visible" custom={index} className="rounded-lg border border-line bg-base p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[13px] font-medium">
                          <img src={LOGOS[snippet.id]} className="h-4 w-4 rounded-sm object-contain" alt="" />{snippet.label}
                        </span>
                        <motion.button type="button" whileTap={{ scale: 0.98 }} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-sub transition-colors hover:border-accent/50 hover:text-accent" onClick={() => void copy(snippet)}>
                          <Ic name="copy" />
                          <CopyLabel copied={copied === snippet.id + snippet.content.slice(0, 24)} />
                        </motion.button>
                      </div>
                      <div className="mb-1.5 font-mono text-[11px] text-sub/70">{snippet.file}</div>
                      <pre className="max-h-44 overflow-auto rounded-md bg-panel px-3 py-2 font-mono text-[11.5px] leading-relaxed text-fg/90">{snippet.content}</pre>
                      {snippet.cli ? (
                        <div className="mt-2">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-[11px] font-medium text-sub/80">CLI one-liner</span>
                            <motion.button
                              type="button" whileTap={{ scale: 0.98 }}
                              className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-sub transition-colors hover:border-accent/50 hover:text-accent"
                              onClick={() => void copy({ ...snippet, id: snippet.id + '-cli', content: snippet.cli ?? '' })}
                            >
                              <Ic name="copy" />
                              <CopyLabel copied={copied === snippet.id + '-cli' + (snippet.cli ?? '').slice(0, 24)} />
                            </motion.button>
                          </div>
                          <pre className="overflow-auto rounded-md bg-panel px-3 py-2 font-mono text-[11px] leading-relaxed text-fg/90">{snippet.cli}</pre>
                        </div>
                      ) : null}
                      {snippet.note ? <div className="mt-1.5 text-[11px] text-sub/70">{snippet.note}</div> : null}
                    </motion.div>
                  ))}
                </div>
              ) : (
                /* 具体工具：单张片段卡 */
                toolSnippets(current).map(({ profile, snippet }, index) => (
                  <motion.div layout key={profile} variants={listItemVariants} initial="hidden" animate="visible" custom={index} className="rounded-lg border border-line bg-base p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[12px] font-medium">
                        profile: {profile}
                        <span className="ml-1.5 font-mono text-[11px] font-normal text-accent">agent-nexus-mcp-{profile}</span>
                      </span>
                      <motion.button type="button" whileTap={{ scale: 0.98 }} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-sub transition-colors hover:border-accent/50 hover:text-accent" onClick={() => void copy(snippet)}>
                        <Ic name="copy" />
                        <CopyLabel copied={copied === snippet.id + snippet.content.slice(0, 24)} />
                      </motion.button>
                    </div>
                    <pre className="max-h-44 overflow-auto rounded-md bg-panel px-3 py-2 font-mono text-[11.5px] leading-relaxed text-fg/90">{snippet.content}</pre>
                    {snippet.cli ? (
                      <div className="mt-2">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-sub/80">CLI one-liner</span>
                          <motion.button
                            type="button" whileTap={{ scale: 0.98 }}
                            className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-sub transition-colors hover:border-accent/50 hover:text-accent"
                            onClick={() => void copy({ ...snippet, id: snippet.id + '-cli', content: snippet.cli ?? '' })}
                          >
                            <Ic name="copy" />
                            <CopyLabel copied={copied === snippet.id + '-cli' + (snippet.cli ?? '').slice(0, 24)} />
                          </motion.button>
                        </div>
                        <pre className="overflow-auto rounded-md bg-panel px-3 py-2 font-mono text-[11px] leading-relaxed text-fg/90">{snippet.cli}</pre>
                      </div>
                    ) : null}
                    {snippet.note ? <div className="mt-1.5 text-[11px] text-sub/70">{snippet.note}</div> : null}
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </motion.div>
        </AnimatePresence>
      </div>

      {/* MCP 配置路径覆盖弹窗 */}
      <AnimatePresence>
      {editingPath ? (
        <Modal key="mcp-path" title={`${editingPath.label} · custom MCP config path`} onClose={() => setEditingPath(null)}>
          <div className="space-y-3">
            <p className="text-[12px] text-sub">
              Accepts home-relative (e.g. <code className="font-mono">.codex/config.toml</code>), <code className="font-mono">~/</code>, or absolute paths. Save empty = reset to default.<br />
              Current: <code className="font-mono text-[11px]">{editingPath.effPath}</code>
            </p>
            <input
              value={editPathValue}
              onChange={(event) => setEditPathValue(event.target.value)}
              className="w-full rounded-lg border border-line bg-base px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
              placeholder={editingPath.effPath}
              onKeyUp={(event) => {
                if (event.key === 'Enter') void savePath();
              }}
            />
            <div className="flex justify-end gap-2.5 pt-1">
              <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg border border-line px-3.5 py-1.5 text-[13px] text-sub hover:text-fg" onClick={() => setEditingPath(null)}>Cancel</motion.button>
              <motion.button type="button" whileTap={{ scale: 0.98 }} className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-base hover:opacity-90" onClick={() => void savePath()}>Save</motion.button>
            </div>
          </div>
        </Modal>
      ) : null}
      </AnimatePresence>
    </div>
  );
}
