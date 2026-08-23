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
  const [recipient, setRecipient] = useState('');
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
      setRecipient((channel === 'email' ? result.recipient_email : result.recipient_phone) || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUse(channel) {
    const label = channel === 'email' ? `Email opened in Mail (subject: "${subject}")` : 'Text opened in Messages';
    const noteBody = `[BusyBee] ${label}\n\n${body}`;
    try {
      const note = await api.addLeadNote(leadId, noteBody);
      setSavedToNotes(true);
      onNoteSaved?.(note);
    } catch (err) {
      // Skip the confirmation quietly - the message still opened fine.
    }
  }

  function reset() {
    setMode(null);
    setBrief(null);
    setSubject('');
    setBody('');
    setRecipient('');
    setError(null);
    setSavedToNotes(false);
  }

  const canLaunch = recipient.trim().length > 0;

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
          <button className="btn btn-ghost btn-sm" onClick={() => runDraft('email')}>Draft email</button>
          <button className="btn btn-ghost btn-sm" onClick={() => runDraft('text')}>Draft text</button>
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
            <label>To</label>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="homeowner@email.com — not on file, enter it here"
              style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14, width: '100%' }}
            />
          </div>
          <div className="field">
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14, width: '100%' }} />
          </div>
          <div className="field">
            <label>Body</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14, width: '100%', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {canLaunch ? (
              <a className="btn btn-amber btn-sm" href={getMailtoUrl(recipient, subject, body)} onClick={() => handleUse('email')}>
                Open in Mail
              </a>
            ) : (
              <span className="btn btn-amber btn-sm" style={{ opacity: 0.4, cursor: 'not-allowed' }}>Enter an email above</span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={reset}>Back</button>
            {savedToNotes && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved to notes ✓</span>}
          </div>
        </div>
      )}

      {mode === 'text' && !loading && body && (
        <div style={{ marginTop: 12 }}>
          <div className="field">
            <label>To</label>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Phone number — not on file, enter it here"
              style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14, width: '100%' }}
            />
          </div>
          <div className="field">
            <label>Message</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14, width: '100%', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {canLaunch ? (
              <a className="btn btn-amber btn-sm" href={getSmsUrl(recipient, body)} onClick={() => handleUse('text')}>
                Open in Messages
              </a>
            ) : (
              <span className="btn btn-amber btn-sm" style={{ opacity: 0.4, cursor: 'not-allowed' }}>Enter a phone number above</span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={reset}>Back</button>
            {savedToNotes && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved to notes ✓</span>}
          </div>
        </div>
      )}
    </div>
  );
}
