import type { HTMLAttributes } from 'react';

// shadcn/ui 风格 Badge 的 React 适配
interface UiBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'warning' | 'success';
}

const variants = {
  default: 'border-transparent bg-accent/15 text-accent',
  secondary: 'border-transparent bg-line text-sub',
  outline: 'border-line2 text-sub',
  destructive: 'border-err/40 bg-err/10 text-err',
  warning: 'border-warn/40 bg-warn/10 text-warn',
  success: 'border-ok/40 bg-ok/10 text-ok',
};

export default function UiBadge({ variant = 'secondary', className, ...props }: UiBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px] font-medium leading-none transition-colors',
        variants[variant],
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
