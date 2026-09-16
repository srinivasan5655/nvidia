import { Fragment } from "react";
import clsx from "clsx";

/** The chip-chain that answers "how did the system get to this answer" —
 * same idea as the finals-UI prototype's `.trace` element, in the same
 * cyan "this is AI reasoning" accent as AiBadge (see index.css's
 * `--color-intel` token), but every step here is a real stage this
 * specific output actually passed through — the gate names, the model
 * that ran, which harness produced it — never a decorative fixed list.
 * Callers build `steps` from the same fields the rest of the page already
 * reads (ls.agent_harness, ls.model_used, gate names), so a degraded run
 * shows a shorter, honestly different chain rather than the same chips
 * every time. */
export function ReasoningTrace({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, i) => (
        <Fragment key={`${step}-${i}`}>
          {i > 0 && <span className="text-intel/50">→</span>}
          <span
            className={clsx(
              "rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
              i === steps.length - 1
                ? "border-intel/50 bg-intel/10 text-intel"
                : "border-hairline-strong bg-surface-raised text-stone",
            )}
          >
            {step}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
