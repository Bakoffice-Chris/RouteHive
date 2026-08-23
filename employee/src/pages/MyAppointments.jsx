import React, { useEffect, useState } from 'react';
import TopBar from '../components/TopBar.jsx';
import AppointmentReminder from '../components/AppointmentReminder.jsx';
import { api } from '../api.js';

const STATUS_LABEL = {
  scheduled: { label: 'Scheduled', tag: 'tag-amber' },
  completed: { label: 'Completed', tag: 'tag-green' },
  cancelled: { label: 'Cancelled', tag: 'tag-neutral' },
  no_show: { label: 'No-show', tag: 'tag-red' }
};

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function hoursUntil(iso) {
  return (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60);
}

export default function MyAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  async function load() {
    setError(null);
    try {
      const data = await api.getAppointments({ status: 'scheduled' });
      setAppointments(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markStatus(id, status) {
    try {
      await api.updateAppointment(id, { status });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app-shell">
      <TopBar back title="My Routes" />
      <div className="content">
        <h1 style={{ marginBottom: 4 }}>My Appointments</h1>
        <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          {appointments.length} upcoming
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : appointments.length === 0 ? (
          <div className="empty-state">No appointments scheduled yet. Book one from a stop's contact card.</div>
        ) : (
          appointments.map((appt) => {
            const hrsAway = hoursUntil(appt.scheduled_at);
            const dueSoon = hrsAway <= 1.5 && hrsAway > 0;
            const dueTomorrow = hrsAway <= 25 && hrsAway > 20;
            return (
              <div key={appt.id} className="stop-card done" style={{ flexDirection: 'column', alignItems: 'stretch', borderLeftColor: 'var(--amber)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="stop-address">{appt.address}</div>
                    <div className="stop-sub">{appt.city}, {appt.state} {appt.zip}</div>
                    <div className="mono" style={{ fontSize: 13, marginTop: 4 }}>{formatWhen(appt.scheduled_at)}</div>
                    {appt.full_name && <div style={{ fontSize: 13, marginTop: 2 }}>{appt.full_name}</div>}
                  </div>
                  <span className={`tag ${STATUS_LABEL[appt.status].tag}`}>{STATUS_LABEL[appt.status].label}</span>
                </div>

                {(dueSoon || dueTomorrow) && (
                  <div className="tag tag-red" style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                    {dueSoon ? 'Reminder due — within the hour' : 'Reminder due — tomorrow'}
                  </div>
                )}

                <button
                  className="btn btn-outline"
                  style={{ marginTop: 10 }}
                  onClick={() => setExpandedId(expandedId === appt.id ? null : appt.id)}
                >
                  {expandedId === appt.id ? 'Hide reminders' : 'Send a reminder'}
                </button>

                {expandedId === appt.id && <AppointmentReminder appointment={appt} />}

                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn btn-outline" onClick={() => markStatus(appt.id, 'completed')}>Mark done</button>
                  <button className="btn btn-outline" onClick={() => markStatus(appt.id, 'cancelled')}>Cancel</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
