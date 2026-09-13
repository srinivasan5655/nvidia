import type { RelayRecord } from "./types";

/** The ATOF exporter writes a "start" and an "end" record per scope, both
 * sharing the same uuid — rendering both as siblings produces duplicate
 * React keys and doubles every row/node in the UI. Keep one record per
 * uuid, preferring "end" (the completed span, which carries the fuller
 * picture) and falling back to whatever arrived. */
export function dedupeRelayRecords(records: RelayRecord[]): RelayRecord[] {
  const byUuid = new Map<string, RelayRecord>();
  for (const r of records) {
    const existing = byUuid.get(r.uuid);
    if (!existing || r.scope_category === "end") {
      byUuid.set(r.uuid, r);
    }
  }
  return Array.from(byUuid.values());
}
