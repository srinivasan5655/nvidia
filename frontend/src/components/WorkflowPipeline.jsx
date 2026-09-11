import { Fragment } from 'react';
import { motion } from 'framer-motion';
import TiltCard from './TiltCard.jsx';
import StatusBadge from './StatusBadge.jsx';

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 22, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 24 } },
};

const GATE_LABELS = {
  evidence_verifier: 'Evidence Verifier',
  confidence_gate: 'Confidence Gate',
  openshell_supervisor: 'OpenShell Supervisor',
  policy_verifier: 'Policy Verifier',
};
const GATE_ORDER = Object.keys(GATE_LABELS);

function toneOf(status) {
  return (
    {
      passed: 'passed',
      approved: 'passed',
      degraded: 'degraded',
      blocked: 'blocked',
      rejected: 'blocked',
      pending: 'pending',
      awaiting_approval: 'pending',
      not_required: 'neutral',
    }[status] || 'neutral'
  );
}

function Icon({ name }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  switch (name) {
    case 'ingest':
      return (
        <svg {...common}>
          <path d="M12 2v13" />
          <path d="m6 10 6 6 6-6" />
          <path d="M4 21h16" />
        </svg>
      );
    case 'gates':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="7" height="16" rx="1" />
          <rect x="14" y="4" width="7" height="16" rx="1" />
        </svg>
      );
    case 'outputs':
      return (
        <svg {...common}>
          <path d="M12 2 2 7l10 5 10-5-10-5Z" />
          <path d="m2 17 10 5 10-5" />
          <path d="m2 12 10 5 10-5" />
        </svg>
      );
    case 'approval':
      return (
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case 'audit':
      return (
        <svg {...common}>
          <path d="M9 12h6" />
          <path d="M9 16h6" />
          <path d="M12.5 2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.5L12.5 2Z" />
          <path d="M12 2v5h5" />
        </svg>
      );
    default:
      return null;
  }
}

function Connector({ active }) {
  return (
    <div className="pipeline-arrow">
      <div className="pipeline-arrow__track">
        <motion.div
          className="pipeline-arrow__fill"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: active ? 1 : 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        />
      </div>
      {active && <span className="pipeline-arrow__pulse" />}
    </div>
  );
}

function statusOf(key, run) {
  if (!run) return 'not_required';
  switch (key) {
    case 'ingest':
      return 'passed';
    case 'gates': {
      const statuses = run.gates.map((g) => g.status);
      if (statuses.includes('blocked')) return 'blocked';
      if (statuses.includes('degraded')) return 'degraded';
      if (statuses.length > 0 && statuses.every((s) => s === 'passed')) return 'passed';
      return 'pending';
    }
    case 'outputs':
      return run.gates.every((g) => g.status === 'passed') ? 'passed' : 'blocked';
    case 'approval':
      return run.approval_status || 'pending';
    case 'audit':
      return 'passed';
    default:
      return 'not_required';
  }
}

const STAGES = [
  {
    key: 'ingest',
    icon: 'ingest',
    title: 'Evidence Ingest',
    view: 'evidence',
    sub: (run) =>
      run
        ? `${run.event.items.length} items · ${new Set(run.event.items.map((i) => i.source)).size} independent sources`
        : 'NWS · USGS · HCFCD · TranStar',
  },
  {
    key: 'gates',
    icon: 'gates',
    title: 'Decision Gates',
    view: 'gates',
    sub: (run) =>
      run
        ? `${run.gates.filter((g) => g.status === 'passed').length}/${run.gates.length} gates passed`
        : '4 NeMo Relay-guarded checks',
  },
  {
    key: 'outputs',
    icon: 'outputs',
    title: 'Dual Outputs',
    view: 'outputs',
    sub: () => 'Life-safety guidance + insurer exposure',
  },
  {
    key: 'approval',
    icon: 'approval',
    title: 'Human Approval',
    view: 'outputs',
    sub: (run) =>
      run
        ? run.approval_status === 'pending'
          ? 'Awaiting duty-officer sign-off'
          : `Marked ${run.approval_status}`
        : 'Required before release',
  },
  {
    key: 'audit',
    icon: 'audit',
    title: 'Audit Trail',
    view: 'audit',
    sub: () => 'Full trace sealed & queryable',
  },
];

export default function WorkflowPipeline({ run, onNavigate, compact = false }) {
  return (
    <motion.div
      className={`pipeline-flow${compact ? ' pipeline-flow--compact' : ''}`}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {STAGES.map((stage, i) => {
        const status = statusOf(stage.key, run);
        const tone = toneOf(status);
        return (
          <Fragment key={stage.key}>
            <motion.div variants={itemVariants} style={{ flex: '1 1 170px', minWidth: 150 }}>
              <TiltCard maxTilt={5}>
                <button
                  className="card pipeline-node"
                  style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => onNavigate(stage.view)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <span className={`pipeline-node__icon is-${tone}`}>
                      <Icon name={stage.icon} />
                    </span>
                    {!compact && <StatusBadge status={status} />}
                  </div>
                  <div className="pipeline-node__title">{stage.title}</div>
                  {!compact && <div className="pipeline-node__sub">{stage.sub(run)}</div>}
                  {!compact && stage.key === 'gates' && (
                    <div className="pipeline-gate-row">
                      {(run ? run.gates : GATE_ORDER.map((k) => ({ gate_name: k, status: 'not_required' }))).map(
                        (g) => (
                          <span key={g.gate_name} className={`pipeline-gate-chip ${toneOf(g.status)}`}>
                            <span className="pipeline-gate-chip__dot" />
                            {GATE_LABELS[g.gate_name] || g.gate_name}
                          </span>
                        )
                      )}
                    </div>
                  )}
                </button>
              </TiltCard>
            </motion.div>
            {i < STAGES.length - 1 && <Connector active={!!run} />}
          </Fragment>
        );
      })}
    </motion.div>
  );
}
