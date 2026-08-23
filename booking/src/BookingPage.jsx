import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from './api.js';

function groupByDay(slots) {
  const groups = {};
  for (const iso of slots) {
    const d = new Date(iso);
    const key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(iso);
  }
  return groups;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function BookingPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState(''); // honeypot - real users never touch this
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(null);

  useEffect(() => {
    api
      .getSlots(token)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.book(token, { scheduled_at: selectedSlot, name, email, phone, website });
      setConfirmed(result);
    } catch (err) {
      setError(err.message);
      try {
        const fresh = await api.getSlots(token);
        setData(fresh);
        setSelectedSlot(null);
      } catch {
        // ignore secondary failure - the error banner above already covers it
      }
    } finally {
      setSubmitting(false);
    }
  }

  const dayGroups = data ? groupByDay(data.available_slots) : {};

  return (
    <div className="shell">
      <div className="header">
        <img src="/logo-64.png" alt="" />
        <div className="wordmark">
          <span className="route">Route</span><span className="hive">Hive</span>
        </div>
      </div>

      <div className="body-content">
        {loading && <div className="empty-state">Loading available times…</div>}

        {!loading && error && !confirmed && (
          <div className="error-banner">{error}</div>
        )}

        {!loading && !error && confirmed && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="confirm-icon">✓</div>
            <h1 style={{ fontSize: 20 }}>You're all set</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
              {new Date(confirmed.scheduled_at).toLocaleString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
              })}
            </p>
          </div>
        )}

        {!loading && !confirmed && data && (
          <>
            <h1>Book a time</h1>
            <p className="sub">Pick a time that works for you with {data.rep_first_name}.</p>

            {!selectedSlot ? (
              Object.keys(dayGroups).length === 0 ? (
                <div className="empty-state">No times are available right now. Please reach out directly to schedule.</div>
              ) : (
                Object.entries(dayGroups).map(([day, slots]) => (
                  <div className="day-group" key={day}>
                    <div className="day-label">{day}</div>
                    <div className="slot-grid">
                      {slots.map((slot) => (
                        <button key={slot} className="slot-btn" onClick={() => setSelectedSlot(slot)}>
                          {formatTime(slot)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="card" style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    {new Date(selectedSlot).toLocaleString('en-US', {
                      weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
                    })}
                  </div>
                  <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, padding: 0, cursor: 'pointer' }} onClick={() => setSelectedSlot(null)}>
                    Choose a different time
                  </button>
                </div>

                <div className="field">
                  <label htmlFor="name">Name</label>
                  <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="phone">Phone</label>
                  <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>

                <div className="hp-field" aria-hidden="true">
                  <label htmlFor="website">Website</label>
                  <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>

                {error && <div className="error-banner">{error}</div>}

                <button className="btn btn-amber" type="submit" disabled={submitting || !name}>
                  {submitting ? 'Booking…' : 'Confirm appointment'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
