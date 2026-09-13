import { useEffect, useState } from "react";
import clsx from "clsx";
import { Card } from "../common/Card";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import { AiBadge } from "../common/AiBadge";
import { EmptyState, Spinner } from "../common/States";
import { IconMessageSquare } from "../common/Icons";
import { useSmsStatus, useSmsLanguages } from "../../hooks/useBackend";
import { api } from "../../lib/api";
import type { RunState } from "../../hooks/useEventRun";

interface LogEntry {
  id: string;
  ts: string;
  message: string;
  sent: boolean;
  blocked: boolean;
  degraded: boolean;
  detail: string | null;
}

const FALLBACK_LANGUAGES = [{ code: "en", name: "English" }];

export function SmsConsoleView({ state }: { state: RunState }) {
  const { data: status, refetch } = useSmsStatus();
  const { data: languagesData } = useSmsLanguages();
  const languages = languagesData?.languages ?? FALLBACK_LANGUAGES;

  const [language, setLanguage] = useState("en");
  const [message, setMessage] = useState("");
  const [isAiDraft, setIsAiDraft] = useState(false);
  const [draftInfo, setDraftInfo] = useState<{ model: string; language: string } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  const headline = state.lifeSafety?.headline.replace("[LLM unavailable] ", "");
  const canDraft = !!(state.event && headline);

  const draft = async (lang: string) => {
    if (!state.event || !headline) return;
    setDrafting(true);
    try {
      const result = await api.smsDraft({
        city_label: state.event.city_label,
        headline,
        guidance_points: state.lifeSafety?.guidance_points ?? [],
        language_code: lang,
      });
      setMessage(result.message);
      setIsAiDraft(true);
      setDraftInfo({ model: result.model_used, language: result.language });
    } finally {
      setDrafting(false);
    }
  };

  // Auto-draft the very first time life-safety guidance becomes available —
  // after that, drafting only happens on an explicit click (language change
  // or the Redraft button), never silently overwriting an operator's edits.
  useEffect(() => {
    if (canDraft && !message) draft(language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDraft]);

  const onLanguageChange = (lang: string) => {
    setLanguage(lang);
    if (canDraft) draft(lang);
  };

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const result = await api.smsSend(message.trim());
      const blocked = result.reason === "guardrails_blocked";
      const degraded = result.sent && result.reason === "guardrails_degraded";
      setLog((prev) => [
        {
          id: crypto.randomUUID(),
          ts: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          message: message.trim(),
          sent: result.sent,
          blocked,
          degraded,
          detail: result.sent
            ? degraded
              ? `Delivered to ${result.to_number_masked ?? "recipient"} — ${result.detail}`
              : `Delivered to ${result.to_number_masked ?? "recipient"} (sid ${result.provider_sid ?? "n/a"})`
            : (result.detail ?? result.reason ?? "Send failed"),
        },
        ...prev,
      ]);
      refetch();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green-pale/30 to-primary/20 text-primary">
          <IconMessageSquare className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">SMS Console</h1>
          <p className="text-sm text-stone">
            AI-drafted, multi-language citizen alerts — reviewed by you before they reach the preconfigured demo
            number.
          </p>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-wide text-mute">Status</span>
        {status?.configured ? (
          <>
            <Badge tone="good" dot="#0ca30c">
              Twilio Configured
            </Badge>
            <Badge tone="neutral">To {status.to_number_masked}</Badge>
            <Badge tone="neutral">From {status.from_number_masked}</Badge>
          </>
        ) : (
          <Badge tone="warning">Not configured — add TWILIO_* and SMS_DEMO_RECIPIENT to backend/.env</Badge>
        )}
        {status?.guardrails_enabled && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-accent-purple">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-purple shadow-[0_0_6px_1px_rgba(149,47,198,0.7)]" />
            Protected by NeMo Guardrails
          </span>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold uppercase tracking-wide text-mute">Message</span>
            {isAiDraft && <AiBadge model={draftInfo?.model} />}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wide text-mute">Language</label>
            <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              disabled={drafting}
              className="rounded-lg border border-hairline-strong bg-surface px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-ink outline-none focus:border-primary disabled:opacity-50"
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!canDraft && (
          <p className="mb-3 text-xs text-stone">
            Go to Home and run a check first — the AI draft is grounded in that run's life-safety guidance, not
            written from scratch.
          </p>
        )}

        <div className="relative mb-4">
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setIsAiDraft(false);
            }}
            placeholder="Type the alert message to send, or draft one with AI…"
            className="h-28 w-full rounded-xl border border-hairline-strong bg-surface p-3 text-base text-ink placeholder:text-stone focus:border-primary focus:outline-none"
          />
          {drafting && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-surface/90 text-sm text-mute">
              <Spinner size={16} /> Drafting in {languages.find((l) => l.code === language)?.name ?? language}…
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={send} loading={sending} disabled={!message.trim() || drafting} className="h-12 px-6">
            Send Demo SMS
          </Button>
          <Button
            variant="outline"
            onClick={() => draft(language)}
            loading={drafting}
            disabled={!canDraft}
            className="h-12 px-6"
          >
            {message ? "Redraft with AI" : "Draft with AI"}
          </Button>
        </div>
      </Card>

      <div>
        <div className="mb-2 text-sm font-bold uppercase tracking-wide text-mute">Transmission Log</div>
        {log.length === 0 ? (
          <Card>
            <EmptyState title="No messages sent yet" body="Sent messages during this session will appear here." />
          </Card>
        ) : (
          <Card padded={false} className="divide-y divide-hairline/70 font-mono text-xs">
            {log.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 p-4">
                <span
                  className={clsx(
                    "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                    entry.blocked
                      ? "bg-accent-purple shadow-[0_0_8px_1px_rgba(149,47,198,0.7)]"
                      : entry.sent
                        ? "bg-primary shadow-[0_0_8px_1px_rgba(118,185,0,0.7)]"
                        : "bg-[#ff6b6b] shadow-[0_0_8px_1px_rgba(208,59,59,0.6)]",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-mute">
                    <span>
                      [{entry.ts}] {entry.blocked ? "BLOCKED" : entry.sent ? "SENT" : "FAILED"}
                    </span>
                    {entry.blocked && <AiBadge />}
                  </div>
                  <div className="mt-1 text-body">{entry.message}</div>
                  <div className="mt-1 text-stone">{entry.detail}</div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
