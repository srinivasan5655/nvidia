import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";
import { Spinner } from "./States";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "outline-dark" | "ghost" | "danger";
  loading?: boolean;
}

export function Button({ variant = "primary", loading, className, children, disabled, ...rest }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold uppercase tracking-wide px-5 h-11 transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";
  const variants: Record<string, string> = {
    primary:
      "bg-gradient-to-b from-accent-green-pale to-primary text-on-primary shadow-[0_1px_0_0_rgba(255,255,255,0.35)_inset,0_8px_20px_-6px_rgba(118,185,0,0.55)] hover:brightness-110 hover:shadow-[0_1px_0_0_rgba(255,255,255,0.35)_inset,0_10px_26px_-6px_rgba(118,185,0,0.7)]",
    outline: "bg-transparent text-primary border-2 border-primary/70 hover:border-primary hover:bg-primary/10",
    "outline-dark": "bg-transparent text-ink border border-hairline-strong hover:border-ink",
    ghost: "bg-transparent text-primary hover:underline px-0 h-auto rounded-none",
    danger:
      "bg-transparent text-[#ff8a8a] border border-[#d03b3b]/60 hover:bg-[#d03b3b]/10 hover:border-[#d03b3b]",
  };
  return (
    <button className={clsx(base, variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}
