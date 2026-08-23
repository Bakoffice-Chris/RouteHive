import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';

const STATUS_LABEL = {
  scheduled: { label: 'Scheduled', tag: 'tag-amber' },
  completed: { label: 'Completed', tag: 'tag-green' },
  cancelled: { label: 'Cancelled', tag: 'tag-neutral' },
  no_show: { label: 'No-show', tag: 'tag-red' }
};

function formatWhen(iso) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

export default function Appointments() {
  const [appointments, setAppointments] = useState([]);
  const [reps, setReps] = useState([]);
  const [repFilter, setRepFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (repFilter) params.rep_id = repFilter;
      if (statusFilter) params.status = statusFilter;
      const [appts, repList] = await Promise.all([api.getAppointments(params), api.getUsers('rep')]);
      setAppointments(appts);
      setReps(repList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repFilter, statusFilter]);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Appointments</h1>
          <div className="subtitle">All reps — {appointments.length} shown</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <select value={repFilter} onChange={(e) => setRepFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3 }}>
          <option value="">All reps</option>
          {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3 }}>
          <option value="">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No-show</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : appointments.length === 0 ? (
          <div className="empty-state">No appointments match these filters.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rep</th>
                <th>Address</th>
                <th>Contact</th>
                <th>When</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.rep_name}</td>
                  <td>
                    <div>{a.address}</div>
                    <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.city}, {a.state} {a.zip}</div>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{a.full_name || '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{formatWhen(a.scheduled_at)}</td>
                  <td><span className={`tag ${STATUS_LABEL[a.status].tag}`}>{STATUS_LABEL[a.status].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
