import type { ReactNode } from "react";
import clsx from "clsx";

export type Tone = "neutral" | "good" | "warning" | "critical" | "primary" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-hairline-strong text-mute bg-surface-raised",
  good: "border-[#0ca30c]/40 text-[#3ddb3d] bg-[#0ca30c]/10",
  warning: "border-[#fab219]/40 text-[#fab219] bg-[#fab219]/10",
  critical: "border-[#d03b3b]/50 text-[#ff6b6b] bg-[#d03b3b]/10",
  primary: "border-primary/50 text-primary bg-primary/10",
  info: "border-hairline-strong text-body bg-surface-raised",
};

export function Badge({
  children,
  tone = "neutral",
  dot,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur-sm",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

export function statusTone(status: "passed" | "blocked" | "degraded"): Tone {
  if (status === "passed") return "good";
  if (status === "degraded") return "warning";
  return "critical";
}
