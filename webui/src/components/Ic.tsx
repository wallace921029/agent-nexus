import type { ReactNode, SVGProps } from 'react';

export type IconName = 'grid' | 'file' | 'blocks' | 'plug' | 'list' | 'refresh' | 'copy' | 'edit' | 'trash' | 'plus' | 'zap' | 'folder' | 'chevron' | 'search' | 'sun' | 'moon' | 'check' | 'alert';

interface IcProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

function paths(name: IconName): ReactNode {
  switch (name) {
    case 'grid':
      return <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>;
    case 'file':
      return <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h6" /></>;
    case 'blocks':
      return <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /><path d="M11 7h4a2 2 0 0 1 2 2v2" /><path d="M7 11v4a2 2 0 0 0 2 2h2" /></>;
    case 'plug':
      return <><circle cx="5" cy="12" r="2.2" /><circle cx="19" cy="5" r="2.2" /><circle cx="19" cy="19" r="2.2" /><path d="M7.2 12H13" /><path d="m13 12 4-5.2" /><path d="m13 12 4 5.2" /></>;
    case 'list':
      return <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3.5 6h.01" /><path d="M3.5 12h.01" /><path d="M3.5 18h.01" /></>;
    case 'refresh':
      return <><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></>;
    case 'copy':
      return <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>;
    case 'edit':
      return <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />;
    case 'trash':
      return <><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>;
    case 'plus':
      return <><path d="M12 5v14" /><path d="M5 12h14" /></>;
    case 'zap':
      return <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />;
    case 'folder':
      return <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />;
    case 'chevron':
      return <path d="m9 18 6-6-6-6" />;
    case 'search':
      return <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>;
    case 'sun':
      return <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></>;
    case 'moon':
      return <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />;
    case 'check':
      return <path d="M20 6 9 17l-5-5" />;
    case 'alert':
      return <><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></>;
  }
}

export default function Ic({ name, className, ...props }: IcProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
      className={['shrink-0', className].filter(Boolean).join(' ')}
    >
      {paths(name)}
    </svg>
  );
}
