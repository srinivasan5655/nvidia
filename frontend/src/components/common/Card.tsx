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
        "relative rounded-sm border border-hairline bg-surface-elevated",
        padded && "p-5",
        className,
      )}
      {...rest}
    >
      {corner && <span className="corner-square" />}
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
    <div className="mb-4 flex items-start justify-between gap-3">
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
