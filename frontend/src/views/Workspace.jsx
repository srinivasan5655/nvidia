import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TiltCard from '../components/TiltCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import TabSwitch from '../components/TabSwitch.jsx';
import ApprovalBar from '../components/ApprovalBar.jsx';
import WorkflowPipeline from '../components/WorkflowPipeline.jsx';
import EmergencyResponseTab from './tabs/EmergencyResponseTab.jsx';
import InsuranceExposureTab from './tabs/InsuranceExposureTab.jsx';
import AgentActivityTab from './tabs/AgentActivityTab.jsx';

const TABS = [
  { id: 'emergency', label: 'Emergency Response' },
  { id: 'insurance', label: 'Insurance Exposure' },
  { id: 'agents', label: 'Agent Activity' },
];

const tabContentVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

function fmtShort(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

// Real, backend-derived KPI values only — never a number the API response
// doesn't already contain. When there's no run yet, every card shows a dash
// rather than a placeholder number that could be mistaken for live data.
function kpisFor(tabId, run) {
  if (!run) {
    return [
      { label: 'Evidence items', value: '—' },
      { label: 'Independent sources', value: '—' },
      { label: 'Gates passed', value: '—' },
      { label: 'Overall status', value: '—' },
    ];
  }
  const gatesPassed = run.gates.filter((g) => g.status === 'passed').length;
  if (tabId === 'insurance' && run.insurer_exposure) {
    const ie = run.insurer_exposure;
    return [
      { label: 'Policies exposed', value: ie.total_policies_in_footprint },
      { label: 'Insured value exposed', value: `$${(ie.total_tiv_in_footprint / 1_000_000).toFixed(1)}M` },
      { label: 'Estimated gross exposure', value: `$${(ie.total_estimated_exposure / 1_000_000).toFixed(2)}M` },
      { label: 'Exposure confidence', value: `${(ie.confidence * 100).toFixed(0)}%` },
    ];
  }
  if (tabId === 'agents') {
    return [
      { label: 'Gates passed', value: `${gatesPassed}/${run.gates.length}` },
      { label: 'Overall status', value: run.overall_status.replace('_', ' ') },
      { label: 'Approval status', value: run.approval_status.replace('_', ' ') },
      { label: 'Relay-governed calls', value: run.gates.length },
    ];
  }
  return [
    { label: 'Evidence items', value: run.event.items.length },
    { label: 'Independent sources', value: new Set(run.event.items.map((i) => i.source)).size },
    { label: 'Gates passed', value: `${gatesPassed}/${run.gates.length}` },
    { label: 'Life-safety confidence', value: run.life_safety ? `${(run.life_safety.confidence * 100).toFixed(0)}%` : '—' },
  ];
}

// Maps WorkflowPipeline's five story stages (ingest/gates/outputs/approval/
// audit — a left-to-right narrative strip, kept from the old Overview page)
// onto this workspace's three tabs plus the separate Audit Trail page.
function stageTarget(view) {
  return { evidence: 'emergency', gates: 'agents', outputs: 'insurance', audit: 'audit' }[view] || 'emergency';
}

export default function Workspace({ run, loading, error, onRunReplay, onApprove, approving, history, onSelectRun, onOpenAudit }) {
  const [tab, setTab] = useState('emergency');
  const [label, setLabel] = useState('Houston heavy-rain event (replayed)');
  const [showHistory, setShowHistory] = useState(false);

  const kpis = kpisFor(tab, run);

  function handlePipelineNavigate(view) {
    if (view === 'audit') {
      onOpenAudit();
    } else {
      setTab(stageTarget(view));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <TiltCard maxTilt={2}>
        <div className="hero-dark" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
          <span className="corner-sq" />
          <div style={{ maxWidth: 640 }}>
            <div className="label-upper" style={{ color: 'var(--accent)' }}>Operations · Houston, TX</div>
            <div className="display-md" style={{ marginTop: 8 }}>
              {run ? run.event.label : 'Houston flood response'}
            </div>
            <div className="body-sm" style={{ marginTop: 8 }}>
              Real evidence &rarr; NVIDIA-governed decision gates &rarr; two decision outputs, both citing the same
              evidence record. Nothing below is dispatched without human approval.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 260 }}>
            <input className="text-input" value={label} onChange={(e) => setLabel(e.target.value)} />
            <button className="btn-primary" disabled={loading} onClick={() => onRunReplay(label)}>
              {loading ? 'Running pipeline…' : run ? 'Replay Again' : 'Replay Houston Event'}
            </button>
            {history.length > 0 && (
              <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowHistory((s) => !s)}>
                {showHistory ? 'Hide' : 'Show'} run history ({history.length})
              </button>
            )}
          </div>
        </div>
      </TiltCard>

      <AnimatePresence>
        {showHistory && (
          <motion.div
            className="card"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="title-md">Run history</div>
            <div className="caption" style={{ marginTop: 4 }}>
              Every past pipeline run, most recent first — select one to inspect it in the workspace below.
            </div>
            <table className="data-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Ran at</th>
                  <th>Status</th>
                  <th>Approval</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr
                    key={h.event.event_id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectRun(h.event.event_id)}
                  >
                    <td className="mono">{h.event.label}</td>
                    <td className="mono">{fmtShort(h.event.created_at)}</td>
                    <td><StatusBadge status={h.overall_status} /></td>
                    <td><StatusBadge status={h.approval_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <span style={{ color: '#f87171' }}>Pipeline error: {error}</span>
        </div>
      )}

      <WorkflowPipeline run={run} onNavigate={handlePipelineNavigate} />

      <div className="grid-4">
        {kpis.map((k) => (
          <div key={k.label} className="card spec-cell">
            <div className="spec-cell__value">{k.value}</div>
            <div className="spec-cell__label">{k.label}</div>
          </div>
        ))}
      </div>

      <ApprovalBar run={run} onApprove={onApprove} approving={approving} />

      <TabSwitch tabs={TABS} active={tab} onChange={setTab} />

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          variants={tabContentVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {!run ? (
            <div className="card">
              <div className="body-md">
                No event has been run yet. Replay the Houston event above to populate the {TABS.find((t) => t.id === tab)?.label.toLowerCase()} view with real evidence, gate, and decision data.
              </div>
            </div>
          ) : (
            <>
              {tab === 'emergency' && <EmergencyResponseTab run={run} />}
              {tab === 'insurance' && <InsuranceExposureTab run={run} />}
              {tab === 'agents' && <AgentActivityTab run={run} />}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
