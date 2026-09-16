import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AiBadge } from "../common/AiBadge";
import { Spinner } from "../common/States";
import { IconSparkle, IconChevronDown } from "../common/Icons";
import { api } from "../../lib/api";
import type { RunState } from "../../hooks/useEventRun";
import type { AssistantCitation } from "../../lib/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: AssistantCitation[];
  groundedInCurrentEvent?: boolean;
  modelUsed?: string;
  blocked?: boolean;
}

/** Same purple guardrails marker as the SMS console's BLOCKED log entries —
 * one consistent "NeMo Guardrails stopped this" visual across both of the
 * app's real free-text-reaches-an-LLM surfaces. */
function GuardrailsBlockedBadge() {
  return (
    <span className="animate-guardrails-glow inline-flex items-center gap-1.5 rounded-full border border-accent-purple/40 bg-accent-purple/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-purple">
      Blocked by NeMo Guardrails
    </span>
  );
}

const SUGGESTIONS = ["What is NWS?", "What is the current state?", "How is the evacuation route calculated?"];

function CitationChips({ citations }: { citations: AssistantCitation[] }) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {citations.map((c) => (
        <span
          key={c.doc_id}
          title={`Similarity ${c.score.toFixed(2)}`}
          className="rounded-full border border-hairline-strong bg-surface-raised px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone"
        >
          {c.title}
        </span>
      ))}
    </div>
  );
}

/** A persistent, docked right-side chat panel — same idea as GitHub
 * Copilot Chat's sidebar, not a routed page you navigate away from and
 * lose. Mounted once at the App root (not per-view) so it survives
 * navigation, and always grounded to whatever event is currently loaded
 * (state.event?.event_id), updating automatically as the operator switches
 * cities or reruns the pipeline — never requires picking an event
 * manually. Disabled until an analysis has actually been started
 * (state.phase !== "idle"), since "grounded in the current analysis" is
 * the whole point and there's nothing to ground in before that. */
export function AssistantPanel({ state, openSignal }: { state: RunState; openSignal?: number }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const eventId = state.event?.event_id ?? null;
  const analysisStarted = state.phase !== "idle";

  // openSignal is bumped by the command palette's "Open Assistant" entry —
  // a plain counter, not a boolean, so picking that command again while
  // already open still re-affirms it. Skip the mount-time invocation so a
  // caller can safely initialize the counter at 0 without forcing the
  // panel open on first render.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (openSignal !== undefined) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, asking]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || !analysisStarted) return;
    setInput("");
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: q }]);
    setAsking(true);
    try {
      const result = await api.assistantChat(q, eventId);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.answer,
          citations: result.citations,
          groundedInCurrentEvent: result.grounded_in_current_event,
          modelUsed: result.model_used,
          blocked: result.blocked,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Something went wrong reaching the assistant: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setAsking(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="sticky top-14 flex h-[calc(100vh-56px)] w-12 shrink-0 flex-col items-center gap-3 border-l border-hairline/80 bg-canvas/80 py-6 text-mute backdrop-blur-md hover:text-primary"
        title="Open Assistant"
      >
        <IconSparkle className="h-5 w-5" />
        <span className="[writing-mode:vertical-rl] text-[11px] font-bold uppercase tracking-wider">Assistant</span>
        {analysisStarted && <span className="mt-auto h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_6px_1px_rgba(118,185,0,0.8)]" />}
      </button>
    );
  }

  return (
    <div className="sticky top-14 flex h-[calc(100vh-56px)] w-[380px] shrink-0 flex-col border-l border-hairline/80 bg-canvas/95 backdrop-blur-md">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-intel-violet/30 to-intel/10 text-intel">
          <IconSparkle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink">Assistant</div>
          <div className="truncate text-[10px] text-stone">
            {analysisStarted
              ? eventId
                ? `Grounded in ${state.event?.city_label}`
                : "Analysis starting…"
              : "Run a check to activate"}
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="text-mute hover:text-body" title="Collapse Assistant">
          <IconChevronDown className="h-4 w-4 rotate-90" />
        </button>
      </div>

      {!analysisStarted ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <IconSparkle className="h-6 w-6 text-stone" />
          <p className="text-sm text-stone">
            The assistant activates once you run a check — it's grounded in that analysis, not a generic chatbot.
          </p>
        </div>
      ) : (
        <>
          <div ref={listRef} className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <p className="text-xs text-stone">
                  Answers come only from this app's own documented facts and the current run's live data, never
                  invented.
                </p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-full border border-hairline-strong bg-surface-raised px-3 py-1.5 text-xs font-bold text-body hover:border-primary hover:text-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((m) => (
                  <div key={m.id} className={clsx("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
                    <div
                      className={clsx(
                        "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                        m.role === "user"
                          ? "bg-gradient-to-b from-accent-green-pale to-primary text-on-primary"
                          : "border border-hairline-strong bg-surface text-body",
                      )}
                    >
                      {m.role === "assistant" && (
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                          {m.blocked ? (
                            <GuardrailsBlockedBadge />
                          ) : (
                            <AiBadge model={m.modelUsed} services={["NIM", "NeMo Retriever", "Switchyard", "Relay"]} />
                          )}
                          {m.groundedInCurrentEvent && (
                            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                              Grounded in current event
                            </span>
                          )}
                        </div>
                      )}
                      {m.text}
                      {m.role === "assistant" && m.citations && <CitationChips citations={m.citations} />}
                    </div>
                  </div>
                ))}
                {asking && (
                  <div className="flex items-center gap-2 text-xs text-stone">
                    <Spinner size={14} /> Retrieving relevant context and reasoning…
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-hairline p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !asking) ask(input);
              }}
              placeholder="Ask a question…"
              disabled={asking}
              className="h-10 flex-1 rounded-xl border border-hairline-strong bg-surface px-3 text-sm text-ink placeholder:text-stone focus:border-primary focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={() => ask(input)}
              disabled={!input.trim() || asking}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-accent-green-pale to-primary text-on-primary disabled:opacity-40"
              title="Ask"
            >
              {asking ? <Spinner size={16} /> : <IconChevronDown className="h-4 w-4 -rotate-90" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
