export default function TopNav({ active, onNavigate, config }) {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'evidence', label: 'Evidence Layer' },
    { id: 'gates', label: 'Decision Gates' },
    { id: 'outputs', label: 'Outputs & Approval' },
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
          padding: '18px 32px',
          borderBottom: '1px solid var(--hairline)',
          background: 'var(--surface-soft)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 6,
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              color: '#0a0a0a',
              fontSize: 15,
            }}
          >
            LS
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.3 }}>LifeShield AI</div>
            <div className="caption">NVIDIA GSI Open Hackathon · Team Cognitive Core</div>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: 28 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`btn-ghost ${active === t.id ? 'active' : ''}`}
              onClick={() => onNavigate(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="pulse-dot" />
          <span className="caption mono">
            {config ? `${config.evidence_mode} · ${config.runtime_target}` : 'connecting…'}
          </span>
        </div>
      </header>
    </div>
  );
}
