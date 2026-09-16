/** A more atmospheric stand-in for a plain spinner at exactly the moments
 * this app is waiting on a real NVIDIA model call — three staggered dots
 * in the intel/violet "AI-generated" color family (matching AiBadge), so
 * "the model is thinking" reads as a distinct state from "the network is
 * loading." Decorative only; callers still drive their own disabled/busy
 * state, this never blocks anything itself. */
export function ThinkingIndicator({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="animate-thinking-dot h-1.5 w-1.5 rounded-full bg-gradient-to-br from-intel to-intel-violet"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </span>
      {label && <span className="text-xs text-stone">{label}</span>}
    </span>
  );
}
