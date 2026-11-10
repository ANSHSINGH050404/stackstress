import type { ComponentType } from '@/types';

interface ComponentIconProps {
  type: ComponentType;
  size?: number;
}

export default function ComponentIcon({ type, size = 18 }: ComponentIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {type === 'traffic-generator' ? (
        <path d="M3 12h3l2-5 4 10 2-5h2l2-3 1 3h2" />
      ) : type === 'load-balancer' ? (
        <>
          <circle cx="4" cy="12" r="1.5" />
          <circle cx="19" cy="5" r="1.5" />
          <circle cx="19" cy="19" r="1.5" />
          <path d="M5.5 12H10m0 0V5h7.5M10 12v7h7.5" />
        </>
      ) : type === 'service' ? (
        <>
          <rect x="4" y="4" width="16" height="7" rx="1" />
          <rect x="4" y="13" width="16" height="7" rx="1" />
          <path d="M7 7.5h.01M10 7.5h7M7 16.5h.01M10 16.5h7" />
        </>
      ) : type === 'cache' ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="1" />
          <path d="M7 8h4M7 12h4M7 16h3m5-10-2 5h3l-2 5" />
        </>
      ) : (
        <>
          <ellipse cx="12" cy="5.5" rx="8" ry="2.5" />
          <path d="M4 5.5v13c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-13" />
          <path d="M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" />
        </>
      )}
    </svg>
  );
}
