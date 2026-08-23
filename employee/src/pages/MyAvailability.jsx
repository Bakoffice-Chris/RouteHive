import React, { useEffect, useState } from 'react';
import TopBar from '../components/TopBar.jsx';
import { api } from '../api.js';

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' }
];

export default function MyAvailability() {
  const [windows, setWindows] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(1);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await api.getAvailability();
      setWindows(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.addAvailability({ day_of_week: Number(day), start_time: start, end_time: end });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteAvailability(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app-shell">
      <TopBar back title="My Routes" />
      <div className="content">
        <h1 style={{ marginBottom: 4 }}>My Availability</h1>
        <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          Used to build your self-service booking links
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 10 }}>Add a weekly window</h3>
          <form onSubmit={handleAdd}>
            <div className="field">
              <label htmlFor="day">Day</label>
              <select id="day" value={day} onChange={(e) => setDay(e.target.value)}>
                {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div className="btn-row" style={{ marginBottom: 16 }}>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label htmlFor="start">From</label>
                <input id="start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label htmlFor="end">To</label>
                <input id="end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-amber" type="submit" disabled={saving}>
              {saving ? 'Adding…' : 'Add window'}
            </button>
          </form>
        </div>

        <h3 style={{ marginBottom: 10 }}>Your hours</h3>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : windows.length === 0 ? (
          <div className="empty-state">No availability set yet — add a window above so homeowners have times to pick from.</div>
        ) : (
          windows.map((w) => (
            <div key={w.id} className="stop-card" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div className="stop-address">{DAYS.find((d) => d.value === w.day_of_week)?.label}</div>
                <div className="stop-sub">{w.start_time} – {w.end_time}</div>
              </div>
              <button className="btn btn-outline" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => handleDelete(w.id)}>
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
