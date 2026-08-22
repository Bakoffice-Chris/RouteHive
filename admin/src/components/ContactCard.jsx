import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function ContactCard({ leadId, onClose, onChanged }) {
  const [lead, setLead] = useState(null);
  const [error, setError] = useState(null);
  const [savingFlag, setSavingFlag] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await api.getLead(leadId);
      setLead(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function toggleFlag(key) {
    if (!lead) return;
    setSavingFlag(key);
    setError(null);
    try {
      const updated = await api.updateLeadFlags(leadId, { [key]: !lead[key] });
      setLead((prev) => ({ ...prev, ...updated }));
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingFlag(null);
    }
  }

  async function submitNote(e) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    setError(null);
    try {
      const note = await api.addLeadNote(leadId, noteText.trim());
      setLead((prev) => ({ ...prev, notes: [note, ...prev.notes] }));
      setNoteText('');
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {!lead ? (
          <div className="empty-state">{error || 'Loading…'}</div>
        ) : (
          <>
            <div className="modal-header">
              <div>
                <h2>{lead.address}</h2>
                <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {lead.city}, {lead.state} {lead.zip}
                </div>
              </div>
              <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
            </div>

            <div style={{ fontSize: 14, marginBottom: 16 }}>
              <div><strong>{lead.full_name || 'Not enriched'}</strong></div>
              {(lead.phone || lead.email) && (
                <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {lead.phone && <div>{lead.phone}</div>}
                  {lead.email && <div>{lead.email}</div>}
                </div>
              )}
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="checkflag-row">
              <label className={`checkflag ${lead.visited ? 'checked' : ''}`}>
                <input type="checkbox" checked={lead.visited} disabled={savingFlag === 'visited'} onChange={() => toggleFlag('visited')} />
                Visited
              </label>
              <label className={`checkflag ${lead.has_solar ? 'checked' : ''}`}>
                <input type="checkbox" checked={lead.has_solar} disabled={savingFlag === 'has_solar'} onChange={() => toggleFlag('has_solar')} />
                Has solar
              </label>
              <label className={`checkflag flag-red ${lead.no_further_attempt ? 'checked' : ''}`}>
                <input type="checkbox" checked={lead.no_further_attempt} disabled={savingFlag === 'no_further_attempt'} onChange={() => toggleFlag('no_further_attempt')} />
                No further attempt
              </label>
            </div>

            <h3 style={{ margin: '20px 0 10px' }}>Notes</h3>
            <form onSubmit={submitNote} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note…"
                style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14 }}
              />
              <button className="btn btn-amber btn-sm" type="submit" disabled={savingNote || !noteText.trim()}>
                {savingNote ? 'Adding…' : 'Add'}
              </button>
            </form>

            <div className="notes-list">
              {lead.notes.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No notes yet.</div>
              ) : (
                lead.notes.map((note) => (
                  <div key={note.id} className="note-item">
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(note.created_at).toLocaleString()} · {note.author_name}
                    </div>
                    <div style={{ fontSize: 14, marginTop: 2 }}>{note.body}</div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
