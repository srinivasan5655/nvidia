import { motion } from 'framer-motion';
import TiltCard from '../../components/TiltCard.jsx';
import FloodMap from '../../components/FloodMap.jsx';

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 250, damping: 23 } },
};

function money(n) {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

export default function InsuranceExposureTab({ run }) {
  const { event, insurer_exposure } = run;

  if (!insurer_exposure) {
    return (
      <div className="card">
        <div className="body-sm muted">
          Not computed — this event was blocked upstream by a decision gate before exposure math ran. See Agent Activity for which gate and why.
        </div>
      </div>
    );
  }

  // Real arithmetic over real per-line fields the backend already returns —
  // not a new number the backend doesn't already imply.
  const aggregateRetained = insurer_exposure.lines.reduce((s, l) => s + l.capped_at_limit, 0);

  return (
    <motion.div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} variants={containerVariants} initial="hidden" animate="show">
      <motion.div variants={itemVariants} className="grid-4">
        <div className="card spec-cell">
          <div className="spec-cell__value">{insurer_exposure.total_policies_in_footprint}</div>
          <div className="spec-cell__label">Policies exposed</div>
        </div>
        <div className="card spec-cell">
          <div className="spec-cell__value">{money(insurer_exposure.total_tiv_in_footprint)}</div>
          <div className="spec-cell__label">Insured value exposed</div>
        </div>
        <div className="card spec-cell">
          <div className="spec-cell__value">{money(insurer_exposure.total_estimated_exposure)}</div>
          <div className="spec-cell__label">Estimated gross exposure</div>
        </div>
        <div className="card spec-cell">
          <div className="spec-cell__value">{money(aggregateRetained)}</div>
          <div className="spec-cell__label">Retained loss (after limits)</div>
        </div>
      </motion.div>

      <motion.div className="grid-2" style={{ alignItems: 'start' }} variants={itemVariants}>
        <TiltCard maxTilt={3}>
          <div className="card">
            <div className="title-md">Policy-level exposure</div>
            <table className="data-table" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>Policy</th>
                  <th>TIV</th>
                  <th>Damage ratio</th>
                  <th>Gross loss</th>
                  <th>Retained (capped)</th>
                </tr>
              </thead>
              <tbody>
                {insurer_exposure.lines.map((l) => (
                  <tr key={l.policy_id}>
                    <td className="mono">{l.policy_id}</td>
                    <td className="mono">{money(l.total_insured_value)}</td>
                    <td className="mono">{(l.estimated_damage_ratio * 100).toFixed(1)}%</td>
                    <td className="mono">{money(l.gross_loss_estimate)}</td>
                    <td className="mono">{money(l.capped_at_limit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="caption" style={{ marginTop: 12 }}>
              {insurer_exposure.methodology} · confidence {(insurer_exposure.confidence * 100).toFixed(0)}% · cites {insurer_exposure.citing_evidence.length} evidence item(s)
            </div>
          </div>
        </TiltCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="label-upper" style={{ color: 'var(--accent)' }}>Footprint</div>
          <FloodMap event={event} height={320} />
        </div>
      </motion.div>
    </motion.div>
  );
}
