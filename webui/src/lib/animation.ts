import type { Transition, Variants } from 'motion/react';

// 全局面板动效令牌：短距离、快反馈，避免动画干扰配置与编辑操作。
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_IN: [number, number, number, number] = [0.4, 0, 1, 1];

export const transitions = {
  fast: { duration: 0.14, ease: EASE_OUT },
  standard: { duration: 0.2, ease: EASE_OUT },
  exit: { duration: 0.12, ease: EASE_IN },
  spring: { type: 'spring', stiffness: 500, damping: 35 },
} satisfies Record<string, Transition>;

export const pageVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0, transition: transitions.exit },
};

export const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4, transition: transitions.exit },
};

export const listContainerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035 } },
};

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 5 },
  visible: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...transitions.fast, delay: Math.min(index * 0.018, 0.12) },
  }),
  exit: { opacity: 0, y: -4, transition: transitions.exit },
};

export const modalBackdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0, transition: transitions.exit },
};

export const modalPanelVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: transitions.exit },
};
