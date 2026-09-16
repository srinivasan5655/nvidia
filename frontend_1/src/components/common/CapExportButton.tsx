import { useState } from "react";
import { Button } from "./Button";
import { api, ApiError } from "../../lib/api";

/** CAP (Common Alerting Protocol) export for the Government persona — the
 * format US IPAWS/Wireless Emergency Alerts and most national EM systems
 * require before a warning can trigger a real public broadcast. Only ever
 * succeeds once a run is "approved" (backend/app/decision/cap_export.py
 * refuses otherwise) — this button is only rendered in that state by its
 * callers, so the 409 path here is a defensive backstop, not the expected
 * path. */
export function CapExportButton({ eventId }: { eventId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.capAlert(eventId);
      const blob = new Blob([result.cap_xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cap-alert-${eventId}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" onClick={download} loading={busy} className="h-9 px-4 text-[11px]">
        Export CAP Alert (.xml)
      </Button>
      {error && <span className="text-[11px] text-[#ff6b6b]">{error}</span>}
    </div>
  );
}
