import { useEffect, useState } from 'react';
import { api } from './api/client.js';
import TopNav from './components/Layout/TopNav.jsx';
import Footer from './components/Layout/Footer.jsx';
import Overview from './views/Overview.jsx';
import EvidenceLayer from './views/EvidenceLayer.jsx';
import DecisionGates from './views/DecisionGates.jsx';
import Outputs from './views/Outputs.jsx';
import AuditTrail from './views/AuditTrail.jsx';

export default function App() {
  const [view, setView] = useState('overview');
  const [config, setConfig] = useState(null);
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.config().then(setConfig).catch(() => {});
  }, []);

  async function handleRunReplay(label) {
    setLoading(true);
    setError(null);
    try {
      const result = await api.replayEvent(label);
      setRun(result);
      setView('gates');
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
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopNav active={view} onNavigate={setView} config={config} />
      <main style={{ flex: 1, padding: '32px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        {view === 'overview' && (
          <Overview run={run} loading={loading} error={error} onRunReplay={handleRunReplay} onNavigate={setView} />
        )}
        {view === 'evidence' && <EvidenceLayer run={run} />}
        {view === 'gates' && <DecisionGates run={run} />}
        {view === 'outputs' && <Outputs run={run} onApprove={handleApprove} approving={approving} />}
        {view === 'audit' && <AuditTrail run={run} />}
      </main>
      <Footer />
    </div>
  );
}
