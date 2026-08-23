import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../api.js';

export default function AddLead() {
  const navigate = useNavigate();
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!address.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.createLead({ address: address.trim(), city, state, zip, owner_name: ownerName });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="app-shell">
        <TopBar back title="My Routes" />
        <div className="content">
          <div className="success-banner">Lead added — it's in the pool, ready for your manager to build a route around it.</div>
          <div className="btn-row">
            <button className="btn btn-amber" onClick={() => { setDone(false); setAddress(''); setCity(''); setState(''); setZip(''); setOwnerName(''); }}>
              Add another
            </button>
            <button className="btn btn-outline" onClick={() => navigate('/routes')}>Back to My Routes</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar back title="My Routes" />
      <div className="content">
        <h1 style={{ marginBottom: 4 }}>Add a Lead</h1>
        <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          Found a house that's not in the system? Add it here — it'll be assigned to you automatically.
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="address">Address</label>
            <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" required />
          </div>
          <div className="field">
            <label htmlFor="city">City</label>
            <input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="btn-row" style={{ marginBottom: 16 }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label htmlFor="state">State</label>
              <input id="state" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} style={{ textTransform: 'uppercase' }} />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label htmlFor="zip">Zip</label>
              <input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="owner">Homeowner name (optional)</label>
            <input id="owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
          </div>
          <button className="btn btn-amber" type="submit" disabled={saving || !address.trim()}>
            {saving ? 'Adding…' : 'Add lead'}
          </button>
        </form>
      </div>
    </div>
  );
}
