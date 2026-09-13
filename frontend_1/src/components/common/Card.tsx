import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  corner?: boolean;
  padded?: boolean;
}

export function Card({ children, corner, padded = true, className, ...rest }: CardProps) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl border border-hairline bg-gradient-to-b from-surface-raised to-surface-elevated shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_12px_24px_-12px_rgba(0,0,0,0.6)]",
        padded && "p-6",
        className,
      )}
      {...rest}
    >
      {corner && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/25 blur-2xl"
        />
      )}
      {children}
    </div>
  );
}

export function CardHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: string;
  title: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="relative mb-4 flex items-start justify-between gap-3">
      <div>
        {eyebrow && (
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-mute">{eyebrow}</div>
        )}
        <div className="text-base font-bold text-ink">{title}</div>
      </div>
      {right}
    </div>
  );
}
