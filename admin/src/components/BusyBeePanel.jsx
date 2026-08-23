import React, { useState } from 'react';
import { api } from '../api.js';
import { getMailtoUrl, getSmsUrl } from '../lib/messaging.js';

export default function BusyBeePanel({ leadId, leadEmail, leadPhone, onNoteSaved }) {
  const [mode, setMode] = useState(null); // 'brief' | 'email' | 'text'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [savedToNotes, setSavedToNotes] = useState(false);

  async function runBrief() {
    setMode('brief');
    setLoading(true);
    setError(null);
    try {
      const result = await api.getLeadBrief(leadId);
      setBrief(result.brief);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function runDraft(channel) {
    setMode(channel);
    setLoading(true);
    setError(null);
    setSavedToNotes(false);
    try {
      const result = await api.getLeadDraft(leadId, channel);
      setSubject(result.subject || '');
      setBody(result.body || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Fires when the rep actually taps "Open in Mail/Messages" - this is the
  // point where they've chosen to use the draft, not just generated one.
  // Doesn't block or delay the mailto:/sms: navigation; the note save runs
  // in the background while the native app opens. Logged as "opened," not
  // "sent" - there's no way to confirm the rep actually pressed send in
  // their own Mail/Messages app afterward.
  async function handleUse(channel) {
    const label = channel === 'email' ? `Email opened in Mail (subject: "${subject}")` : 'Text opened in Messages';
    const noteBody = `[BusyBee] ${label}\n\n${body}`;
    try {
      const note = await api.addLeadNote(leadId, noteBody);
      setSavedToNotes(true);
      onNoteSaved?.(note);
    } catch (err) {
      // Don't block or alarm the rep over a note-save failure - the message
      // itself still opened fine. Just skip the "saved" confirmation.
    }
  }

  function reset() {
    setMode(null);
    setBrief(null);
    setSubject('');
    setBody('');
    setError(null);
    setSavedToNotes(false);
  }

  return (
    <div className="busybee-panel">
      <div className="busybee-header">
        <img src="/busybee-32.png" alt="" className="busybee-avatar" />
        <div>
          <div className="busybee-name">BusyBee</div>
          <div className="busybee-sub">AI assistant</div>
        </div>
      </div>

      {!mode && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={runBrief}>Pre-visit brief</button>
          <button className="btn btn-ghost btn-sm" onClick={() => runDraft('email')} disabled={!leadEmail} title={!leadEmail ? 'No email on file' : ''}>
            Draft email
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => runDraft('text')} disabled={!leadPhone} title={!leadPhone ? 'No phone on file' : ''}>
            Draft text
          </button>
        </div>
      )}

      {loading && <div className="busybee-loading">Thinking…</div>}
      {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}

      {mode === 'brief' && brief && (
        <>
          <div className="busybee-brief">{brief}</div>
          <button className="btn btn-ghost btn-sm" onClick={reset} style={{ marginTop: 10 }}>Back</button>
        </>
      )}

      {mode === 'email' && !loading && (subject || body) && (
        <div style={{ marginTop: 12 }}>
          <div className="field">
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14, width: '100%' }} />
          </div>
          <div className="field">
            <label>Body</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14, width: '100%', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a className="btn btn-amber btn-sm" href={getMailtoUrl(leadEmail, subject, body)} onClick={() => handleUse('email')}>
              Open in Mail
            </a>
            <button className="btn btn-ghost btn-sm" onClick={reset}>Back</button>
            {savedToNotes && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved to notes ✓</span>}
          </div>
        </div>
      )}

      {mode === 'text' && !loading && body && (
        <div style={{ marginTop: 12 }}>
          <div className="field">
            <label>Message</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14, width: '100%', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a className="btn btn-amber btn-sm" href={getSmsUrl(leadPhone, body)} onClick={() => handleUse('text')}>
              Open in Messages
            </a>
            <button className="btn btn-ghost btn-sm" onClick={reset}>Back</button>
            {savedToNotes && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved to notes ✓</span>}
          </div>
        </div>
      )}
    </div>
  );
}
