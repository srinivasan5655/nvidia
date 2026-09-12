import { useMemo } from "react";
import { Card, CardHeader } from "../../common/Card";
import { Badge } from "../../common/Badge";
import { fmtTime } from "../../../lib/format";
import { dedupeRelayRecords } from "../../../lib/relay";
import type { LifeSafetyGuidance, RelayRecord, RuntimeConfig } from "../../../lib/types";

interface TreeNode {
  record: RelayRecord;
  children: TreeNode[];
}

function buildTree(records: RelayRecord[]): TreeNode[] {
  const byId = new Map(records.map((r) => [r.uuid, r]));
  const childrenOf = new Map<string, RelayRecord[]>();
  const roots: RelayRecord[] = [];
  for (const r of records) {
    if (r.parent_uuid && byId.has(r.parent_uuid)) {
      const list = childrenOf.get(r.parent_uuid) ?? [];
      list.push(r);
      childrenOf.set(r.parent_uuid, list);
    } else {
      roots.push(r);
    }
  }
  const toNode = (r: RelayRecord): TreeNode => ({
    record: r,
    children: (childrenOf.get(r.uuid) ?? []).sort((a, b) => a.timestamp.localeCompare(b.timestamp)).map(toNode),
  });
  return roots.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).map(toNode);
}

const CATEGORY_TONE: Record<string, "primary" | "neutral" | "good" | "info"> = {
  llm: "primary",
  tool: "info",
  guardrail: "good",
  agent: "neutral",
};

function ScopeNode({ node, depth }: { node: TreeNode; depth: number }) {
  const { record } = node;
  const model = record.metadata?.model as string | undefined;
  return (
    <div>
      <div
        className="flex items-center gap-2 py-1 text-xs"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <span className="text-stone">└</span>
        <Badge tone={CATEGORY_TONE[record.category] ?? "neutral"}>{record.category}</Badge>
        <span className="font-mono text-body">{record.name}</span>
        {model && <span className="text-stone">({model})</span>}
        <span className="ml-auto shrink-0 font-mono text-[10px] text-stone">{fmtTime(record.timestamp)}</span>
      </div>
      {node.children.map((c) => (
        <ScopeNode key={c.record.uuid} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

export function RuntimePanel({
  config,
  currentEventId,
  relayRecords,
  lifeSafety,
}: {
  config: RuntimeConfig | undefined;
  currentEventId: string | null;
  relayRecords: RelayRecord[] | undefined;
  lifeSafety: LifeSafetyGuidance | null;
}) {
  const eventRecords = useMemo(
    () => dedupeRelayRecords((relayRecords ?? []).filter((r) => r.metadata?.event_id === currentEventId)),
    [relayRecords, currentEventId],
  );
  const tree = useMemo(() => buildTree(eventRecords), [eventRecords]);

  // Prefer the value straight off EventRunResult.life_safety — it's present
  // whether or not Relay is enabled. The relay trace's scope metadata is
  // only a fallback for a run where life_safety hasn't landed yet but a
  // scope has already been recorded.
  const reasoningModel =
    lifeSafety?.model_used ||
    (eventRecords.find((r) => r.name === "life_safety_narrative")?.metadata?.model as string | undefined);
  const reasoningEffort = lifeSafety?.reasoning_effort;

  return (
    <Card corner>
      <CardHeader
        eyebrow="NVIDIA Runtime"
        title="Switchyard, Relay & OpenShell"
        right={config && <Badge tone="primary">{config.runtime_target}</Badge>}
      />
      {/* Fixed 2-col grid, not a viewport breakpoint: this card sits beside
          VisionSpecialistCard in an xl:grid-cols-2 layout, so its actual
          width tracks the sidebar/viewport combination, not the viewport
          alone — a sm:/lg: breakpoint here forced 4 cramped columns at
          1280px viewports where the card itself was still narrow. */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-mute">Runtime target</div>
          <div className="mt-0.5 font-mono text-body">{config?.runtime_target ?? "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-mute">Reasoning model</div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-body">
            <span>{reasoningModel ?? "—"}</span>
            {reasoningEffort && (
              <Badge tone={reasoningEffort === "high" ? "primary" : "info"}>{reasoningEffort}</Badge>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-mute">OpenShell</div>
          <div className="mt-0.5 font-mono text-body">{config?.openshell_enabled ? "Sandboxed" : "In-process"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-mute">Relay</div>
          <div className="mt-0.5 font-mono text-body">{config?.relay_enabled ? "Recording" : "Disabled"}</div>
        </div>
      </div>

      <div className="mt-4 border-t border-hairline pt-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-mute">Relay scope tree — this event</div>
        {tree.length === 0 ? (
          <p className="text-xs text-stone">
            {config?.relay_enabled ? "No scopes recorded yet for this event." : "Relay is disabled — no scopes to show."}
          </p>
        ) : (
          <div className="max-h-56 overflow-y-auto">
            {tree.map((n) => (
              <ScopeNode key={n.record.uuid} node={n} depth={0} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
