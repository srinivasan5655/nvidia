import { motion } from 'framer-motion';

export default function TopNav({ active, onNavigate, config }) {
  const tabs = [
    { id: 'workspace', label: 'Command Center' },
    { id: 'audit', label: 'Audit Trail' },
  ];

  return (
    <div>
      <div className="brand-stripe" />
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px',
          borderBottom: '1px solid var(--hairline)',
          background: 'rgba(0,0,0,0.9)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            style={{
              width: 34,
              height: 34,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              color: 'var(--on-primary)',
              fontSize: 15,
            }}
          >
            LS
          </motion.div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.2, color: 'var(--ink)' }}>
              LifeShield AI
            </div>
            <div className="caption" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10.5 }}>
              NVIDIA GSI Open Hackathon &middot; Team Cognitive Core
            </div>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: 28, position: 'relative' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`btn-ghost ${active === t.id ? 'active' : ''}`}
              style={{ position: 'relative' }}
              onClick={() => onNavigate(t.id)}
            >
              {t.label}
              {active === t.id && (
                <motion.div
                  layoutId="nav-underline"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: -2,
                    height: 2,
                    background: 'var(--accent)',
                  }}
                />
              )}
            </button>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="pulse-dot" />
          <span
            className="badge mono"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'transparent' }}
          >
            {config ? `${config.evidence_mode} · ${config.runtime_target}` : 'Connecting…'}
          </span>
        </div>
      </header>
    </div>
  );
}
