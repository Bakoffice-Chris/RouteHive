import React, { useEffect, useState } from 'react';
import TopBar from '../components/TopBar.jsx';
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

export default function AllRepAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getAppointments({ status: 'scheduled' })
      .then(setAppointments)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="app-shell">
      <TopBar back title="My Routes" />
      <div className="content">
        <h1 style={{ marginBottom: 4 }}>All Rep Appointments</h1>
        <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          {appointments.length} scheduled — for coordinating closing meetings
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : appointments.length === 0 ? (
          <div className="empty-state">No appointments scheduled across the team yet.</div>
        ) : (
          appointments.map((appt) => (
            <div key={appt.id} className="stop-card done" style={{ flexDirection: 'column', alignItems: 'stretch', borderLeftColor: 'var(--amber)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="stop-address">{appt.rep_name}</div>
                  <div className="stop-sub">{appt.address}, {appt.city}, {appt.state} {appt.zip}</div>
                  <div className="mono" style={{ fontSize: 13, marginTop: 4 }}>{formatWhen(appt.scheduled_at)}</div>
                  {appt.full_name && <div style={{ fontSize: 13, marginTop: 2, color: 'var(--text-muted)' }}>{appt.full_name}</div>}
                </div>
                <span className={`tag ${STATUS_LABEL[appt.status].tag}`}>{STATUS_LABEL[appt.status].label}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
