import React, { useEffect, useState } from 'react';
import TopBar from '../components/TopBar.jsx';
import { api } from '../api.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

export default function SeniorSchedule() {
  const [seniors, setSeniors] = useState([]);
  const [selectedSeniorId, setSelectedSeniorId] = useState('');
  const [appointments, setAppointments] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getSeniors()
      .then((data) => {
        setSeniors(data);
        if (data.length > 0) setSelectedSeniorId(data[0].id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSeniorId) return;
    setError(null);
    Promise.all([
      api.getAppointments({ rep_id: selectedSeniorId, status: 'scheduled' }),
      api.getAvailability(selectedSeniorId)
    ])
      .then(([appts, avail]) => {
        setAppointments(appts);
        setAvailability(avail);
      })
      .catch((err) => setError(err.message));
  }, [selectedSeniorId]);

  return (
    <div className="app-shell">
      <TopBar back title="My Routes" />
      <div className="content">
        <h1 style={{ marginBottom: 4 }}>Senior Schedule</h1>
        <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          For coordinating closing meetings
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : seniors.length === 0 ? (
          <div className="empty-state">No Senior is set up on this account yet.</div>
        ) : (
          <>
            {seniors.length > 1 && (
              <div className="field">
                <label htmlFor="senior-select">Senior</label>
                <select id="senior-select" value={selectedSeniorId} onChange={(e) => setSelectedSeniorId(e.target.value)}>
                  {seniors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <h3 style={{ margin: '20px 0 10px' }}>Availability</h3>
            {availability.length === 0 ? (
              <div className="empty-state">No hours set yet.</div>
            ) : (
              <div className="card" style={{ marginBottom: 20 }}>
                {availability.map((w) => (
                  <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
                    <span>{DAYS[w.day_of_week]}</span>
                    <span className="mono" style={{ color: 'var(--text-muted)' }}>{w.start_time}–{w.end_time}</span>
                  </div>
                ))}
              </div>
            )}

            <h3 style={{ marginBottom: 10 }}>Upcoming appointments</h3>
            {appointments.length === 0 ? (
              <div className="empty-state">Nothing scheduled.</div>
            ) : (
              appointments.map((appt) => (
                <div key={appt.id} className="stop-card done" style={{ flexDirection: 'column', alignItems: 'stretch', borderLeftColor: 'var(--amber)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div className="stop-address">{appt.address}</div>
                      <div className="stop-sub">{appt.city}, {appt.state} {appt.zip}</div>
                      <div className="mono" style={{ fontSize: 13, marginTop: 4 }}>{formatWhen(appt.scheduled_at)}</div>
                    </div>
                    <span className={`tag ${STATUS_LABEL[appt.status].tag}`}>{STATUS_LABEL[appt.status].label}</span>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
