import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { modalBackdropVariants, modalPanelVariants } from '../../lib/animation';
import UiButton from './UiButton';

// shadcn/ui 风格 AlertDialog 的 React 适配：分发/收回等操作的二次确认弹窗。
// 与 Modal（普通 Dialog）的语义区别：点击遮罩不关闭，必须显式选择 Cancel/确认。

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** destructive = 危险操作（收回/丢弃），默认聚焦 Cancel；default = 主色操作（分发） */
  tone?: 'default' | 'destructive';
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let notify: ((pending: PendingConfirm) => void) | null = null;
let active = false;

/** 全局确认弹窗（替代浏览器原生 confirm）：宿主未挂载或已有弹窗时兜底返回 false */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!notify || active) {
      resolve(false);
      return;
    }
    active = true;
    notify({ ...options, resolve: (ok) => { active = false; resolve(ok); } });
  });
}

/** 全局挂载一次（App 根部），承接 confirmDialog 发起的弹窗 */
export function ConfirmHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    notify = setPending;
    return () => {
      notify = null;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    (pending.tone === 'destructive' ? cancelRef : confirmRef).current?.focus();
  }, [pending]);

  function settle(ok: boolean): void {
    const current = pending;
    if (!current) return;
    setPending(null);
    current.resolve(ok);
  }

  // Escape = 取消；Tab 在面板按钮间循环（焦点不逃出弹窗）
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      settle(false);
      return;
    }
    if (event.key === 'Tab') {
      const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [];
      if (buttons.length === 0) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    }
  }

  return (
    <AnimatePresence>
      {pending ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
          variants={modalBackdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onKeyDown={onKeyDown}
        >
          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.title}
            className="w-[420px] max-w-full rounded-xl border border-line bg-panel p-5 shadow-[0_16px_60px_rgba(0,0,0,.5)]"
            variants={modalPanelVariants}
          >
            <h3 className="text-sm font-semibold text-fg">{pending.title}</h3>
            {pending.description ? <div className="mt-1.5 text-[12.5px] leading-relaxed text-sub">{pending.description}</div> : null}
            <div className="mt-5 flex justify-end gap-2.5">
              <UiButton ref={cancelRef} variant="secondary" onClick={() => settle(false)}>
                {pending.cancelText ?? 'Cancel'}
              </UiButton>
              <UiButton
                ref={confirmRef}
                variant={pending.tone === 'destructive' ? 'destructive' : 'accent'}
                className={pending.tone === 'destructive' ? 'border-err/50 bg-err/10' : undefined}
                onClick={() => settle(true)}
              >
                {pending.confirmText ?? 'Confirm'}
              </UiButton>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
