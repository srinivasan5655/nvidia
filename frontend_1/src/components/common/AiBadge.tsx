import { IconRobot } from "./Icons";

/** One consistent, deliberately loud visual marker for "an LLM/AI agent
 * wrote or produced this" — used next to every AI-generated headline,
 * narrative, or decision in the app (life-safety guidance, the what-if
 * counterfactual, agent-authored exposure/evacuation narratives, vision-
 * specialist damage descriptions, the agentic gate) so it's never
 * ambiguous which on-screen content came from a model versus deterministic
 * math. A muted violet-cyan + a quiet pulsing glow is used nowhere else in
 * the chrome, so it's still recognizable at a glance without shouting over
 * the app's green/status badge palette.
 *
 * `services` names the specific NVIDIA stack components that actually
 * produced this piece of content (e.g. ["NIM", "Switchyard", "Relay"]) —
 * rendered as small chips in the app's own primary green (NVIDIA's brand
 * color, already used for this app's own identity elsewhere) so it reads
 * as "powered by NVIDIA" rather than blending into the AI-Generated pill's
 * cyan-violet tone. Pass only the services genuinely exercised for THIS
 * output, not every service the app has anywhere. */
export function AiBadge({
  model,
  services,
  className = "",
}: {
  model?: string;
  services?: string[];
  className?: string;
}) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="animate-ai-glow inline-flex items-center gap-1.5 rounded-full border border-intel/40 bg-gradient-to-r from-intel/10 to-intel-violet/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-intel">
        <IconRobot className="h-3.5 w-3.5 shrink-0" />
        AI-Generated
        {model && model !== "none" && (
          <span className="font-mono normal-case tracking-normal text-intel/70">· {model}</span>
        )}
      </span>
      {services?.map((s) => (
        <span
          key={s}
          className="animate-nvidia-glow rounded-full border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary"
          title={`Powered by NVIDIA ${s}`}
        >
          {s}
        </span>
      ))}
    </span>
  );
}
