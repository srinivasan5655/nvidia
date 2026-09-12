import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";
import { Spinner } from "./States";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "outline-dark" | "ghost" | "danger";
  loading?: boolean;
}

export function Button({ variant = "primary", loading, className, children, disabled, ...rest }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-sm text-sm font-bold uppercase tracking-wide px-5 h-10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-primary text-on-primary hover:bg-primary-dark",
    outline: "bg-transparent text-primary border-2 border-primary hover:bg-primary/10",
    "outline-dark": "bg-transparent text-ink border border-hairline-strong hover:border-ink",
    ghost: "bg-transparent text-primary hover:underline px-0 h-auto",
    danger: "bg-transparent text-[#ff6b6b] border border-[#d03b3b]/60 hover:bg-[#d03b3b]/10",
  };
  return (
    <button className={clsx(base, variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}
