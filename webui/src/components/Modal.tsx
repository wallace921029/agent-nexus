import type { MouseEvent, ReactNode } from 'react';
import { motion } from 'motion/react';
import { modalBackdropVariants, modalPanelVariants } from '../lib/animation';

interface ModalProps {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ title, wide = false, onClose, children }: ModalProps) {
  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      variants={modalBackdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={closeFromBackdrop}
    >
      <motion.div
        className={`max-h-[86vh] max-w-[94vw] overflow-auto rounded-xl border border-line bg-panel shadow-[0_16px_60px_rgba(0,0,0,.5)] ${wide ? 'w-[820px]' : 'w-[560px]'}`}
        variants={modalPanelVariants}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-panel px-4 py-3">
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          <motion.button type="button" whileTap={{ scale: 0.9 }} className="rounded-md p-1 text-sub transition-colors hover:bg-panel2 hover:text-fg" onClick={onClose}>✕</motion.button>
        </div>
        <div className="p-4">{children}</div>
      </motion.div>
    </motion.div>
  );
}
