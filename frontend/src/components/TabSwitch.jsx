import { motion } from 'framer-motion';

// Segmented control, NVIDIA-system styled (angular, hairline, single accent
// underline) — same interaction pattern as TopNav's nav links, just scoped
// to the workspace body instead of the page chrome.
export default function TabSwitch({ tabs, active, onChange }) {
  return (
    <div className="tab-switch" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={`tab-switch__item ${active === t.id ? 'is-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.icon && <span className="tab-switch__icon">{t.icon}</span>}
          {t.label}
          {active === t.id && (
            <motion.div
              layoutId="tab-switch-underline"
              className="tab-switch__underline"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}
