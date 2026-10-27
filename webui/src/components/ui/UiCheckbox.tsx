// shadcn/ui 风格 Checkbox 的 React 适配：方块圆角 + 主色填充 + 勾形 SVG
interface UiCheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}

export default function UiCheckbox({ checked = false, onCheckedChange, disabled, title, className }: UiCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      className={[
        'flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-35',
        checked ? 'border-accent bg-accent text-base' : 'border-line2 bg-transparent hover:border-accent/80 hover:bg-accent/10',
        className,
      ].filter(Boolean).join(' ')}
      onClick={() => {
        if (!disabled) onCheckedChange?.(!checked);
      }}
    >
      {checked ? (
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : null}
    </button>
  );
}
