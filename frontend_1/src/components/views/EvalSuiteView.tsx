import { EvalSuiteCard } from "./eval/EvalSuiteCard";
import { NemoEvaluatorCard } from "./eval/NemoEvaluatorCard";

/** Dedicated top-level page for the golden-dataset evaluation suite.
 * Previously this card only lived inside Observability, one scroll below
 * the Relay trace — easy to open the app and never find it. It's real,
 * judge-reproducible evidence (4 fixed cases run through the actual
 * pipeline, deterministic assertions, no LLM grading its own homework), so
 * it gets a nav entry of its own instead of being a footnote on another
 * page. */
export function EvalSuiteView() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Golden Dataset</h1>
        <p className="text-sm text-stone">
          A fixed set of known-correct scenarios, run through the real, unmodified pipeline — proof the gates
          behave correctly, not a screenshot.
        </p>
      </div>
      <EvalSuiteCard />
      <NemoEvaluatorCard />
    </div>
  );
}
