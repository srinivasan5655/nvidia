const BASE = '';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export const api = {
  health: () => req('/health'),
  config: () => req('/api/v1/config'),
  replayEvent: (label) =>
    req('/api/v1/events/replay', {
      method: 'POST',
      body: JSON.stringify({ scenario: 'houston_heavy_rain', label: label || 'Houston heavy-rain event (replayed)' }),
    }),
  listEvents: () => req('/api/v1/events'),
  getEvent: (eventId) => req(`/api/v1/events/${eventId}`),
  approveEvent: (eventId, decision, note) =>
    req(`/api/v1/events/${eventId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ decision, note, approver: 'duty_officer' }),
    }),
};
