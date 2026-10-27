import type { HTMLAttributes, ReactNode } from 'react';

// shadcn/ui 风格 Card 的 React 适配（融合面板玻璃底）
interface UiCardProps extends HTMLAttributes<HTMLDivElement> {
  compact?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
}

export default function UiCard({ compact = false, header, footer, className, children, ...props }: UiCardProps) {
  return (
    <div className={['rounded-xl border border-line bg-panel text-fg shadow-sm backdrop-blur-xl', className].filter(Boolean).join(' ')} {...props}>
      {header ? <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">{header}</div> : null}
      <div className={compact ? 'px-4 py-3.5' : 'p-5'}>{children}</div>
      {footer ? <div className="border-t border-line px-5 py-3.5">{footer}</div> : null}
    </div>
  );
}
