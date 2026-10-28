import type { ButtonHTMLAttributes, Ref } from 'react';

// shadcn/ui 风格 Button 的 React 适配（default 使用前景/背景反色；accent 为主色实心 CTA）
interface UiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'accent' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'default' | 'icon';
  ref?: Ref<HTMLButtonElement>;
}

const variants = {
  default: 'bg-fg text-base hover:bg-sub',
  accent: 'bg-accent text-base shadow-[0_0_24px_-8px] shadow-accent/60 hover:bg-accent/85',
  secondary: 'bg-panel2 text-fg hover:bg-line2',
  outline: 'border border-line2 bg-transparent text-fg hover:border-accent/50 hover:text-accent',
  ghost: 'text-sub hover:bg-panel2 hover:text-fg',
  destructive: 'border border-err/25 bg-transparent text-err/90 hover:border-err/60 hover:bg-err/10 hover:text-err',
};

const sizes = {
  sm: 'h-8 px-3',
  default: 'h-9 px-4',
  icon: 'h-8 w-8',
};

export default function UiButton({ variant = 'default', size = 'default', className, type = 'button', ref, ...props }: UiButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-50',
        sizes[size],
        variants[variant],
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
