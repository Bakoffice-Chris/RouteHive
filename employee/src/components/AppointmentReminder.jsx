import React, { useState } from 'react';
import { api } from '../api.js';
import { getMailtoUrl, getSmsUrl } from '../lib/messaging.js';

export default function AppointmentReminder({ appointment }) {
  const [active, setActive] = useState(null); // '24h-email' | '24h-text' | '1h-email' | '1h-text'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  async function generate(type, channel) {
    const key = `${type}-${channel}`;
    setActive(key);
    setLoading(true);
    setError(null);
    setSubject('');
    setBody('');
    try {
      const result = await api.getAppointmentReminder(appointment.id, type, channel);
      setSubject(result.subject || '');
      setBody(result.body || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setActive(null);
    setError(null);
    setSubject('');
    setBody('');
  }

  const [type, channel] = active ? active.split('-') : [null, null];
  const hasEmail = !!appointment.email;
  const hasPhone = !!appointment.phone;

  return (
    <div style={{ marginTop: 10 }}>
      {!active && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            BusyBee reminders
          </div>
          <div className="btn-row">
            <button className="btn btn-outline" disabled={!hasEmail} onClick={() => generate('24h', 'email')} style={{ fontSize: 13 }}>
              24h email
            </button>
            <button className="btn btn-outline" disabled={!hasPhone} onClick={() => generate('24h', 'text')} style={{ fontSize: 13 }}>
              24h text
            </button>
          </div>
          <div className="btn-row">
            <button className="btn btn-outline" disabled={!hasEmail} onClick={() => generate('1h', 'email')} style={{ fontSize: 13 }}>
              1h email
            </button>
            <button className="btn btn-outline" disabled={!hasPhone} onClick={() => generate('1h', 'text')} style={{ fontSize: 13 }}>
              1h text
            </button>
          </div>
        </div>
      )}

      {loading && <div className="busybee-loading">Thinking…</div>}
      {error && <div className="error-banner" style={{ marginTop: 8 }}>{error}</div>}

      {active && !loading && (subject || body) && (
        <div style={{ marginTop: 8 }}>
          {channel === 'email' && (
            <div className="field">
              <label>Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label>Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={channel === 'email' ? 5 : 3}
              style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 4, fontSize: 14, width: '100%', fontFamily: 'inherit' }}
            />
          </div>
          <div className="btn-row">
            <a
              className="btn btn-amber"
              href={channel === 'email' ? getMailtoUrl(appointment.email, subject, body) : getSmsUrl(appointment.phone, body)}
            >
              {channel === 'email' ? 'Open in Mail' : 'Open in Messages'}
            </a>
            <button className="btn btn-outline" onClick={reset}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
