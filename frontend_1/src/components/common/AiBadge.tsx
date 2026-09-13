import { IconRobot } from "./Icons";

/** One consistent, deliberately loud visual marker for "an LLM/AI agent
 * wrote or produced this" — used next to every AI-generated headline,
 * narrative, or decision in the app (life-safety guidance, the what-if
 * counterfactual, agent-authored exposure/evacuation narratives, vision-
 * specialist damage descriptions, the agentic gate) so it's never
 * ambiguous which on-screen content came from a model versus deterministic
 * math. A muted violet-cyan + a quiet pulsing glow is used nowhere else in
 * the chrome, so it's still recognizable at a glance without shouting over
 * the app's green/status badge palette. */
export function AiBadge({ model, className = "" }: { model?: string; className?: string }) {
  return (
    <span
      className={`animate-ai-glow inline-flex items-center gap-1.5 rounded-full border border-[#7dd3fc]/40 bg-gradient-to-r from-[#7dd3fc]/10 to-[#a78bfa]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#c4d9f7] ${className}`}
    >
      <IconRobot className="h-3.5 w-3.5 shrink-0" />
      AI-Generated
      {model && <span className="font-mono normal-case tracking-normal text-[#c4d9f7]/60">· {model}</span>}
    </span>
  );
}
