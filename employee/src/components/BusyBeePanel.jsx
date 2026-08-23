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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <button className="btn btn-outline" onClick={runBrief}>Pre-visit brief</button>
          <button className="btn btn-outline" onClick={() => runDraft('email')}>Draft email</button>
          <button className="btn btn-outline" onClick={() => runDraft('text')}>Draft text</button>
        </div>
      )}

      {loading && <div className="busybee-loading">Thinking…</div>}
      {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}

      {mode === 'brief' && brief && (
        <>
          <div className="busybee-brief">{brief}</div>
          <button className="btn btn-outline" onClick={reset} style={{ marginTop: 10 }}>Back</button>
        </>
      )}

      {mode === 'email' && !loading && (subject || body) && (
        <div style={{ marginTop: 12 }}>
          <div className="field">
            <label>To</label>
            <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Not on file — enter email" />
          </div>
          <div className="field">
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="field">
            <label>Body</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 4, fontSize: 15, width: '100%', fontFamily: 'inherit' }} />
          </div>
          <div className="btn-row">
            {canLaunch ? (
              <a className="btn btn-amber" href={getMailtoUrl(recipient, subject, body)} onClick={() => handleUse('email')}>
                Open in Mail
              </a>
            ) : (
              <span className="btn btn-amber" style={{ opacity: 0.4 }}>Enter an email above</span>
            )}
            <button className="btn btn-outline" onClick={reset}>Back</button>
          </div>
          {savedToNotes && <div style={{ fontSize: 13, color: 'var(--green)', marginTop: 8 }}>Saved to notes ✓</div>}
        </div>
      )}

      {mode === 'text' && !loading && body && (
        <div style={{ marginTop: 12 }}>
          <div className="field">
            <label>To</label>
            <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Not on file — enter phone number" />
          </div>
          <div className="field">
            <label>Message</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 4, fontSize: 15, width: '100%', fontFamily: 'inherit' }} />
          </div>
          <div className="btn-row">
            {canLaunch ? (
              <a className="btn btn-amber" href={getSmsUrl(recipient, body)} onClick={() => handleUse('text')}>
                Open in Messages
              </a>
            ) : (
              <span className="btn btn-amber" style={{ opacity: 0.4 }}>Enter a phone number above</span>
            )}
            <button className="btn btn-outline" onClick={reset}>Back</button>
          </div>
          {savedToNotes && <div style={{ fontSize: 13, color: 'var(--green)', marginTop: 8 }}>Saved to notes ✓</div>}
        </div>
      )}
    </div>
  );
}
