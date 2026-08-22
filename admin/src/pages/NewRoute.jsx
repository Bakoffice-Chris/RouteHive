import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';

export default function NewRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const leadIds = location.state?.leadIds || [];

  const [name, setName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const route = await api.createRoute({ name, date, lead_ids: leadIds });
      navigate(`/routes/${route.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (leadIds.length === 0) {
    return (
      <Layout>
        <div className="page-header">
          <h1>Build route</h1>
        </div>
        <div className="empty-state">
          No leads selected. Go to the Leads page and check the stops you want on this route.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Build route</h1>
          <div className="subtitle">{leadIds.length} stops selected</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ maxWidth: 420 }}>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Route name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. North Phoenix — Monday" required />
          </div>
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <button className="btn btn-amber" type="submit" disabled={creating}>
            {creating ? 'Creating…' : `Create route with ${leadIds.length} stops`}
          </button>
        </form>
      </div>
    </Layout>
  );
}
