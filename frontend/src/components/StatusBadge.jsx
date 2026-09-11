import { motion } from 'framer-motion';

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

  return (
    <motion.span
      className={`badge ${cls}`}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
    >
      {LABELS[status] || status}
    </motion.span>
  );
}
