import { useEffect, useState } from "react";
import clsx from "clsx";
import { Card, CardHeader } from "../../common/Card";
import { Badge } from "../../common/Badge";
import { Button } from "../../common/Button";
import { Spinner } from "../../common/States";
import { api } from "../../../lib/api";
import { fmtDateTime, CITY_INFO } from "../../../lib/format";
import type { EvalCaseResult, EvalSuiteResult } from "../../../lib/types";

function StatTile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" | "critical" }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface/80 p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-mute">{label}</div>
      <div
        className={clsx(
          "mt-1 font-mono text-2xl font-bold tabular-nums",
          tone === "good" ? "text-primary" : tone === "critical" ? "text-[#ff6b6b]" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function CaseCard({ result }: { result: EvalCaseResult }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={clsx(
        "rounded-xl border p-4",
        result.passed ? "border-hairline-strong bg-surface/80" : "border-[#d03b3b]/50 bg-[#d03b3b]/10",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-ink">{result.label}</div>
          <div className="text-[11px] uppercase tracking-wide text-mute">
            {CITY_INFO[result.city]?.short ?? result.city}
            {" · "}
            {result.overall_status}
            {result.confidence !== null && ` · confidence ${result.confidence.toFixed(2)}`}
            {` · ${result.latency_ms.toLocaleString()} ms`}
          </div>
        </div>
        <Badge tone={result.passed ? "good" : "critical"}>{result.passed ? "PASS" : "FAIL"}</Badge>
      </div>

      {result.error ? (
        <p className="mt-3 text-xs text-[#ff8a8a]">Pipeline error: {result.error}</p>
      ) : (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-2 text-[11px] font-bold uppercase tracking-wide text-primary hover:underline"
          >
            {expanded ? "Hide" : "Show"} {result.assertions.length} assertion(s) →
          </button>
          {expanded && (
            <div className="mt-2 flex flex-col gap-1.5">
              {result.assertions.map((a) => (
                <div key={a.name} className="flex items-start gap-2 text-xs">
                  <span
                    className={clsx(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                      a.passed ? "bg-primary text-on-primary" : "bg-[#d03b3b] text-white",
                    )}
                  >
                    {a.passed ? "✓" : "✗"}
                  </span>
                  <span className="text-stone">
                    <span className="font-mono text-body">{a.name}</span> — expected{" "}
                    <span className="font-mono">{a.expected}</span>, got <span className="font-mono">{a.actual}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The golden-dataset evaluation suite — real pipeline runs against a fixed
 * set of known-correct expectations (app/eval/golden_dataset.py on the
 * backend), not a claim without a benchmark behind it. Deliberately
 * on-demand (not auto-run): each pass is 2 full analyses plus 2 red-team
 * blocks, taking a few real minutes since it exercises live NIM calls. */
export function EvalSuiteCard() {
  const [result, setResult] = useState<EvalSuiteResult | null>(null);
  const [running, setRunning] = useState(false);
  const [checkedLast, setCheckedLast] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    api.evalLast().then((r) => {
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
      const r = await api.evalRun();
      setResult(r);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader
        eyebrow="Golden Dataset"
        title="Evaluation Suite"
        right={
          <Button onClick={run} loading={running} disabled={running} className="h-9 px-4 text-[11px]">
            {result ? "Run Again" : "Run Evaluation Suite"}
          </Button>
        }
      />
      <p className="mb-4 text-xs text-stone">
        Runs 4 fixed test cases (Houston/Chennai normal analysis, plus their Simulate Contradiction red-team
        counterpart) through the real pipeline — the same code "Check Now" uses — and checks deterministic
        assertions against the actual result. No LLM grades pass/fail.
      </p>

      {running && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-hairline-strong bg-surface-elevated/80 p-3 text-xs text-body">
          <Spinner size={16} />
          Running 4 real pipeline executions ({elapsedSec}s elapsed) — two full analyses plus two red-team blocks.
          This normally takes a few minutes. Please don't close this page.
        </div>
      )}

      {!running && !result && checkedLast && (
        <p className="text-sm text-stone">No evaluation suite has been run yet this session.</p>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Total cases" value={String(result.total_cases)} />
            <StatTile label="Passed" value={String(result.passed_count)} tone="good" />
            <StatTile label="Failed" value={String(result.failed_count)} tone={result.failed_count > 0 ? "critical" : "default"} />
            <StatTile label="Avg latency" value={`${(result.avg_latency_ms / 1000).toFixed(1)}s`} />
          </div>
          <div className="text-[11px] text-stone">Last run: {fmtDateTime(result.run_at)}</div>
          <div className="flex flex-col gap-3">
            {result.cases.map((c) => (
              <CaseCard key={c.case_id} result={c} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
