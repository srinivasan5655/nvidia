const LABELS = {
  passed: 'Passed',
  degraded: 'Degraded',
  blocked: 'Blocked',
  pending: 'Pending',
  awaiting_approval: 'Awaiting Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  not_required: 'Not Required',
};

export default function StatusBadge({ status }) {
  const cls =
    {
      passed: 'badge-passed',
      approved: 'badge-passed',
      degraded: 'badge-degraded',
      blocked: 'badge-blocked',
      rejected: 'badge-blocked',
      pending: 'badge-pending',
      awaiting_approval: 'badge-pending',
      not_required: 'badge-neutral',
    }[status] || 'badge-neutral';

  return <span className={`badge ${cls}`}>{LABELS[status] || status}</span>;
}
