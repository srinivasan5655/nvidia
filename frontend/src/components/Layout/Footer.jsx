import { motion } from 'framer-motion';

export default function Footer() {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      style={{
        padding: '20px 32px',
        borderTop: '1px solid var(--hairline)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        background: 'var(--canvas)',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <span className="caption" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 6, height: 6, background: 'var(--accent)', flexShrink: 0 }} />
        LifeShield AI &mdash; every output traces to its evidence bundle, passes automated decision gates, and requires human approval before release.
      </span>
      <span className="caption mono" style={{ color: 'var(--stone)' }}>
        Illustrative synthetic scenario &mdash; not a prediction of a real incident.
      </span>
    </motion.footer>
  );
}
