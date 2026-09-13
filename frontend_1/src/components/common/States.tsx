import type { ReactNode } from "react";

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="animate-spin text-primary"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({ icon, title, body }: { icon?: ReactNode; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-hairline-strong px-6 py-10 text-center">
      {icon && <div className="text-mute">{icon}</div>}
      <div className="text-sm font-bold text-body">{title}</div>
      {body && <div className="max-w-sm text-xs text-stone">{body}</div>}
    </div>
  );
}

export function ErrorState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-sm border border-[#d03b3b]/40 bg-[#d03b3b]/5 px-6 py-10 text-center">
      <div className="text-sm font-bold text-[#ff6b6b]">{title}</div>
      {body && <div className="max-w-sm text-xs text-stone">{body}</div>}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <Spinner size={22} />
      <div className="text-xs uppercase tracking-wide text-mute">{label}</div>
    </div>
  );
}
