import { useEffect, useState } from "react";
import clsx from "clsx";
import { Card, CardHeader } from "../../common/Card";
import { Badge } from "../../common/Badge";
import { Button } from "../../common/Button";
import { Spinner } from "../../common/States";
import { api } from "../../../lib/api";
import { fmtDateTime } from "../../../lib/format";
import type { NemoEvalBenchmark, NemoEvalReport } from "../../../lib/types";

const METRIC_LABEL: Record<string, string> = {
  precision: "Precision",
  recall: "Recall",
  f1: "F1 Score",
  accuracy: "Accuracy",
  faithfulness: "Faithfulness",
  completeness: "Completeness",
  bias: "Bias (fair = 1.0)",
};

function MetricTile({ name, value }: { name: string; value: number }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 80 ? "text-primary" : pct >= 50 ? "text-[#fab219]" : "text-[#ff6b6b]";
  return (
    <div className="rounded-xl border border-hairline bg-surface/80 p-3.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-mute">{METRIC_LABEL[name] ?? name}</div>
      <div className={clsx("mt-1 font-mono text-2xl font-bold tabular-nums", tone)}>{pct}%</div>
    </div>
  );
}

function BenchmarkBlock({ bench }: { bench: NemoEvalBenchmark }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl border border-hairline-strong bg-surface/60 p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold text-ink">{bench.name}</div>
        <span className="font-mono text-[10px] text-stone">
          {bench.sample_count} samples · {(bench.latency_ms / 1000).toFixed(1)}s
        </span>
      </div>
      <p className="mb-3 text-xs text-stone">{bench.description}</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Object.entries(bench.aggregate).map(([name, value]) => (
          <MetricTile key={name} name={name} value={value} />
        ))}
      </div>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="mt-3 text-[11px] font-bold uppercase tracking-wide text-primary hover:underline"
      >
        {expanded ? "Hide" : "Show"} {bench.samples.length} per-sample score(s) →
      </button>
      {expanded && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-hairline">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="sticky top-0 bg-surface-elevated text-[10px] uppercase tracking-wide text-mute">
              <tr>
                <th className="px-3 py-2">Case</th>
                {Object.keys(bench.aggregate).map((m) => (
                  <th key={m} className="px-3 py-2">
                    {METRIC_LABEL[m] ?? m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bench.samples.map((s, i) => (
                <tr key={i} className="border-t border-hairline">
                  <td className="max-w-[220px] truncate px-3 py-2 text-body" title={s.input_label}>
                    {s.input_label}
                  </td>
                  {Object.keys(bench.aggregate).map((m) => (
                    <td key={m} className="px-3 py-2 font-mono text-stone">
                      {s.scores[m] !== undefined ? s.scores[m].toFixed(2) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** The real NVIDIA NeMo Evaluator engine (pip-installed `nemo-evaluator`,
 * not a stub) run against two custom benchmarks — retrieval precision/
 * recall/F1 for the Assistant's NeMo Retriever, and faithfulness/
 * completeness/bias for real life-safety narratives. See
 * backend/app/eval/nemo_evaluator_suite.py for exactly how each metric is
 * computed and from what real data. */
export function NemoEvaluatorCard() {
  const [result, setResult] = useState<NemoEvalReport | null>(null);
  const [running, setRunning] = useState(false);
  const [checkedLast, setCheckedLast] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    api.nemoEvalLast().then((r) => {
      setResult(r);
      setCheckedLast(true);
    });
  }, []);

  useEffect(() => {
    if (!running) {
      setElapsedSec(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setElapsedSec(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const run = async () => {
    setRunning(true);
    try {
      setResult(await api.nemoEvalRun());
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader
        eyebrow="NVIDIA NeMo Evaluator"
        title="Quality Metrics"
        right={
          <Button onClick={run} loading={running} disabled={running} className="h-9 px-4 text-[11px]">
            {result ? "Run Again" : "Run NeMo Evaluator"}
          </Button>
        }
      />
      <p className="mb-4 text-xs text-stone">
        Runs the real <code className="font-mono">nemo-evaluator</code> engine against two benchmarks: NeMo
        Retriever precision/recall/F1 on a hand-labeled golden dataset, and life-safety narrative faithfulness/
        completeness/bias — the last three scored by this app's own real NeMo Guardrails checks, not a
        self-reported number.
      </p>

      {running && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-hairline-strong bg-surface-elevated/80 p-3 text-xs text-body">
          <Spinner size={16} />
          Running both benchmarks ({elapsedSec}s elapsed) — the second one runs the real pipeline twice with
          live NIM calls. This can take several minutes. Please don't close this page.
        </div>
      )}

      {!running && !result && checkedLast && (
        <p className="text-sm text-stone">No NeMo Evaluator run yet this session.</p>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone">
            <Badge tone="primary">{result.engine}</Badge>
            <span className="font-mono">v{result.engine_version}</span>
            <span>· Last run: {fmtDateTime(result.run_at)}</span>
          </div>
          {result.benchmarks.map((b) => (
            <BenchmarkBlock key={b.name} bench={b} />
          ))}
        </div>
      )}
    </Card>
  );
}
