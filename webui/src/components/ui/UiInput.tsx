import type { InputHTMLAttributes } from 'react';

// shadcn/ui 风格 Input 的 React 适配
export default function UiInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={[
        'h-9 w-full rounded-lg border border-line bg-input px-3 font-mono text-[13px] text-fg outline-none transition-colors placeholder:text-sub/50 focus:border-accent/60 focus:ring-1 focus:ring-accent/30',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
