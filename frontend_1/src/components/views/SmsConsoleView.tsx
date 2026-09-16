import { useEffect, useState } from "react";
import clsx from "clsx";
import { Card } from "../common/Card";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import { AiBadge } from "../common/AiBadge";
import { EmptyState } from "../common/States";
import { ThinkingIndicator } from "../common/ThinkingIndicator";
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
  const [sendingTestTemplate, setSendingTestTemplate] = useState(false);
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

  // Trial Twilio accounts can only deliver free-form SMS content to Indian
  // numbers after DLT template registration (a real, multi-day regulatory
  // process — not something this app can do for you). This proves the
  // Twilio account/number/recipient wiring genuinely works end-to-end using
  // Twilio's own pre-approved trial demo template instead of real content,
  // for exactly that situation.
  const sendTestTemplate = async () => {
    setSendingTestTemplate(true);
    try {
      const result = await api.smsSendTestTemplate();
      setLog((prev) => [
        {
          id: crypto.randomUUID(),
          ts: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          message: "[Twilio trial demo template — not real content] Reminder: Appt Tue Oct 29, 3:00 PM…",
          sent: result.sent,
          blocked: false,
          degraded: false,
          detail: result.sent
            ? `Delivered to ${result.to_number_masked ?? "recipient"} (sid ${result.provider_sid ?? "n/a"}) — proves the Twilio wiring works even though real content is blocked for this number.`
            : (result.detail ?? result.reason ?? "Send failed"),
        },
        ...prev,
      ]);
      refetch();
    } finally {
      setSendingTestTemplate(false);
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
        {status?.configured && (
          <Button
            variant="outline"
            onClick={sendTestTemplate}
            loading={sendingTestTemplate}
            className="h-8 px-3 text-[11px]"
            title="Sends Twilio's pre-approved trial demo template instead of real content — useful when the recipient's country (e.g. India) blocks free-form SMS until DLT templates are registered."
          >
            Send Test Template
          </Button>
        )}
        {status?.guardrails_enabled && (
          <span className="animate-guardrails-glow ml-auto flex items-center gap-1.5 rounded-full border border-accent-purple/40 bg-accent-purple/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-purple">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-purple shadow-[0_0_6px_1px_rgba(149,47,198,0.7)]" />
            Protected by NeMo Guardrails
          </span>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold uppercase tracking-wide text-mute">Message</span>
            {isAiDraft && <AiBadge model={draftInfo?.model} services={["NIM", "Switchyard", "Relay"]} />}
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
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-surface/90">
              <ThinkingIndicator label={`Drafting in ${languages.find((l) => l.code === language)?.name ?? language}…`} />
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
                    {entry.blocked && <AiBadge services={["NeMo Guardrails"]} />}
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
