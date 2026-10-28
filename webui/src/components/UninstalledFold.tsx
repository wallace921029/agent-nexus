import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Ic from './Ic';

/* 未安装工具折叠区：默认收起，点击展开；children = 未安装工具的卡片/行
   variant: card = 卡片列表语境（Agents/Skills）；row = 分隔行列表语境（Dashboard） */
interface UninstalledFoldProps {
  count: number;
  variant?: 'card' | 'row';
  children: ReactNode;
}

export default function UninstalledFold({ count, variant = 'card', children }: UninstalledFoldProps) {
  const [open, setOpen] = useState(false);

  const toggleClass =
    variant === 'card'
      ? 'w-full items-center gap-2.5 rounded-xl border border-dashed border-line px-4 py-2.5 text-[12px] text-sub transition-colors hover:border-line2 hover:text-fg'
      : 'w-full items-center gap-2.5 px-4 py-2.5 text-[11px] text-sub/70 transition-colors hover:text-fg lg:px-5';
  const contentClass = variant === 'card' ? 'space-y-2' : 'divide-y divide-line/60';

  return (
    <div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.99 }}
        className={`flex ${toggleClass}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Ic name="chevron" className={`flex-none transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="flex-1 text-left">Not installed</span>
        <span className={`flex-none rounded-md px-1.5 py-0.5 text-[10.5px] ${variant === 'card' ? 'border border-line bg-panel2 text-sub/70' : 'bg-panel2 text-sub/60'}`}>
          {count}
        </span>
      </motion.button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className={`mt-2 ${contentClass}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
