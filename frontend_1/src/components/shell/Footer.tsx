import { AccentStripe } from "./AccentStripe";

const FOOTER_COLS: { title: string; items: string[] }[] = [
  { title: "Platform", items: ["Command Center", "Agentic Runtime", "Situation & Evidence", "Insurer Exposure"] },
  { title: "Decision Agents", items: ["Evidence Verifier", "Confidence Gate", "OpenShell Supervisor", "Policy Verifier"] },
  { title: "Evidence Sources", items: ["NWS", "USGS", "HCFCD", "TranStar", "FEMA"] },
  { title: "NVIDIA Technology", items: ["build.nvidia.com NIM", "NeMo Relay", "NeMo Switchyard", "OpenShell + DeepAgents"] },
];

export function Footer() {
  return (
    <footer className="mt-16 bg-canvas">
      <AccentStripe />
      <div className="border-t border-hairline/60">
        <div className="mx-auto max-w-[1600px] px-6 py-10">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-mute">{col.title}</div>
                <ul className="flex flex-col gap-2">
                  {col.items.map((item) => (
                    <li key={item} className="text-xs text-stone">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-hairline-strong pt-5">
            <p className="text-[11px] uppercase tracking-wide text-stone">
              Human judgment, supported by evidence. NVIDIA GSI Open Hackathon — Team Cognitive Core.
            </p>
            <p className="text-[11px] uppercase tracking-wide text-stone">
              build.nvidia.com &middot; NeMo Relay &middot; NeMo Switchyard &middot; OpenShell + DeepAgents
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
