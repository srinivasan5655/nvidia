import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from './api/client.js';
import TopNav from './components/Layout/TopNav.jsx';
import Footer from './components/Layout/Footer.jsx';
import ParallaxField from './components/ParallaxField.jsx';
import Workspace from './views/Workspace.jsx';
import AuditTrail from './views/AuditTrail.jsx';

const pageVariants = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -16, scale: 0.99 },
};

export default function App() {
  const [view, setView] = useState('workspace');
  const [config, setConfig] = useState(null);
  const [run, setRun] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.config().then(setConfig).catch(() => {});
    refreshHistory();
  }, []);

  function refreshHistory() {
    api.listEvents().then(setHistory).catch(() => {});
  }

  async function handleRunReplay(label) {
    setLoading(true);
    setError(null);
    try {
      const result = await api.replayEvent(label);
      setRun(result);
      refreshHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(decision, note) {
    if (!run) return;
    setApproving(true);
    try {
      const result = await api.approveEvent(run.event.event_id, decision, note);
      setRun(result);
      refreshHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  async function handleSelectRun(eventId) {
    setError(null);
    try {
      const result = await api.getEvent(eventId);
      setRun(result);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <ParallaxField />
      <TopNav active={view} onNavigate={setView} config={config} />
      <main style={{ flex: 1, padding: '32px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          >
            {view === 'workspace' && (
              <Workspace
                run={run}
                loading={loading}
                error={error}
                onRunReplay={handleRunReplay}
                onApprove={handleApprove}
                approving={approving}
                history={history}
                onSelectRun={handleSelectRun}
                onOpenAudit={() => setView('audit')}
              />
            )}
            {view === 'audit' && <AuditTrail run={run} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
    </div>
  );
}
