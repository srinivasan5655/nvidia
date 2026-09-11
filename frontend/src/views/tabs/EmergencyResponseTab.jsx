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

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function EmergencyResponseTab({ run }) {
  const { event, life_safety } = run;

  return (
    <motion.div className="grid-2" style={{ alignItems: 'start' }} variants={containerVariants} initial="hidden" animate="show">
      <motion.div variants={itemVariants} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <TiltCard maxTilt={3}>
          <div className="card">
            <div className="label-upper" style={{ color: 'var(--accent)' }}>Priority recommendation</div>
            {life_safety ? (
              <>
                <div className="title-lg" style={{ marginTop: 8 }}>{life_safety.headline}</div>
                <ul style={{ marginTop: 14, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {life_safety.guidance_points.map((p, i) => (
                    <li key={i} className="body-sm">{p}</li>
                  ))}
                </ul>
                <div className="body-sm" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--hairline)' }}>
                  {life_safety.hazard_narrative}
                </div>
                <div className="caption" style={{ marginTop: 12 }}>
                  Confidence {(life_safety.confidence * 100).toFixed(0)}% · cites {life_safety.citing_evidence.length} evidence item(s) below
                </div>
              </>
            ) : (
              <div className="body-sm muted" style={{ marginTop: 10 }}>
                Not computed — this event was blocked upstream by a decision gate. See Agent Activity for which gate and why.
              </div>
            )}
          </div>
        </TiltCard>

        <div className="card">
          <div className="title-md">Event window</div>
          <div className="body-sm" style={{ marginTop: 8 }}>
            {event.label}<br />
            {fmt(event.window_start)} → {fmt(event.window_end)}
          </div>
          <div className="caption" style={{ marginTop: 10 }}>
            {event.items.length} evidence item(s) across {new Set(event.items.map((i) => i.source)).size} independent source(s) · evidence_mode: {event.evidence_mode}
          </div>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="label-upper" style={{ color: 'var(--accent)' }}>Evidence locations</div>
        <FloodMap event={event} height={440} />
      </motion.div>
    </motion.div>
  );
}
