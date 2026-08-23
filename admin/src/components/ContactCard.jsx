import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import BusyBeePanel from './BusyBeePanel.jsx';

export default function ContactCard({ leadId, onClose, onChanged }) {
  const [lead, setLead] = useState(null);
  const [error, setError] = useState(null);
  const [savingFlag, setSavingFlag] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState({ full_name: '', co_owner_name: '', email: '', phone: '' });
  const [savingContact, setSavingContact] = useState(false);
  const [loadingValue, setLoadingValue] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [intelError, setIntelError] = useState(null);
  const [showApptForm, setShowApptForm] = useState(false);
  const [apptDate, setApptDate] = useState('');
  const [apptRepId, setApptRepId] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [savingAppt, setSavingAppt] = useState(false);
  const [apptResult, setApptResult] = useState(null);
  const [bookingLink, setBookingLink] = useState(null);
  const [gettingLink, setGettingLink] = useState(false);
  const [linkRepId, setLinkRepId] = useState('');
  const [reps, setReps] = useState([]);
  const [savingOwner, setSavingOwner] = useState(false);

  async function load() {
    setError(null);
    try {
      const [data, repList] = await Promise.all([api.getLead(leadId), api.getUsers('rep')]);
      setLead(data);
      setReps(repList);
    } catch (err) {
      setError(err.message);
    }
  }

  async function bookAppointment(e) {
    e.preventDefault();
    if (!apptDate || !apptRepId) return;
    setSavingAppt(true);
    setApptResult(null);
    setError(null);
    try {
      const appt = await api.createAppointment({
        lead_id: leadId,
        rep_id: apptRepId,
        scheduled_at: new Date(apptDate).toISOString(),
        notes: apptNotes || undefined
      });
      setApptResult(appt);
      setShowApptForm(false);
      setApptDate('');
      setApptNotes('');
      setApptRepId('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAppt(false);
    }
  }

  async function getBookingLink() {
    if (!linkRepId) return;
    setGettingLink(true);
    setError(null);
    try {
      const link = await api.createBookingLink(leadId, linkRepId);
      setBookingLink(link);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(link.url).catch(() => {});
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGettingLink(false);
    }
  }

  async function changeOwner(repId) {
    setSavingOwner(true);
    setError(null);
    try {
      const updated = await api.assignLeadOwner(leadId, repId || null);
      setLead((prev) => ({ ...prev, assigned_rep_id: updated.assigned_rep_id, assigned_rep_name: updated.assigned_rep_name }));
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingOwner(false);
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

  function startEditingContact() {
    setContactDraft({
      full_name: lead.full_name || '',
      co_owner_name: lead.co_owner_name || '',
      email: lead.email || '',
      phone: lead.phone || ''
    });
    setEditingContact(true);
  }

  async function saveContact(e) {
    e.preventDefault();
    setSavingContact(true);
    setError(null);
    try {
      const updated = await api.updateLeadContact(leadId, contactDraft);
      setLead((prev) => ({ ...prev, ...updated }));
      setEditingContact(false);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingContact(false);
    }
  }

  async function fetchEstimatedValue() {
    setLoadingValue(true);
    setIntelError(null);
    try {
      const result = await api.getLeadEstimatedValue(leadId);
      setLead((prev) => ({ ...prev, ...result }));
    } catch (err) {
      setIntelError(err.message);
    } finally {
      setLoadingValue(false);
    }
  }

  async function fetchPropertyDetails() {
    setLoadingDetails(true);
    setIntelError(null);
    try {
      const result = await api.getLeadPropertyDetails(leadId);
      setLead((prev) => ({ ...prev, ...result }));
    } catch (err) {
      setIntelError(err.message);
    } finally {
      setLoadingDetails(false);
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
              {editingContact ? (
                <form onSubmit={saveContact}>
                  <div className="field">
                    <label>Name</label>
                    <input
                      autoFocus
                      value={contactDraft.full_name}
                      onChange={(e) => setContactDraft({ ...contactDraft, full_name: e.target.value })}
                      placeholder="Homeowner name"
                      style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14, width: '100%' }}
                    />
                  </div>
                  <div className="field">
                    <label>Co-owner name</label>
                    <input
                      value={contactDraft.co_owner_name}
                      onChange={(e) => setContactDraft({ ...contactDraft, co_owner_name: e.target.value })}
                      placeholder="Optional"
                      style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14, width: '100%' }}
                    />
                  </div>
                  <div className="field">
                    <label>Email</label>
                    <input
                      type="email"
                      value={contactDraft.email}
                      onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value })}
                      placeholder="Optional"
                      style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14, width: '100%' }}
                    />
                  </div>
                  <div className="field">
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={contactDraft.phone}
                      onChange={(e) => setContactDraft({ ...contactDraft, phone: e.target.value })}
                      placeholder="Optional"
                      style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 14, width: '100%' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-amber btn-sm" type="submit" disabled={savingContact}>
                      {savingContact ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingContact(false)} disabled={savingContact}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong>{lead.full_name || 'Not enriched'}</strong>
                    <button className="btn btn-ghost btn-sm" onClick={startEditingContact} style={{ padding: '2px 8px', fontSize: 11 }}>
                      Edit
                    </button>
                  </div>
                  {lead.co_owner_name && (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                      Co-owner: {lead.co_owner_name}
                    </div>
                  )}
                  {(lead.phone || lead.email) && (
                    <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      {lead.phone && <div>{lead.phone}</div>}
                      {lead.email && <div>{lead.email}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Owner:</span>
              <select
                value={lead.assigned_rep_id || ''}
                onChange={(e) => changeOwner(e.target.value)}
                disabled={savingOwner}
                style={{ padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 13 }}
              >
                <option value="">Unassigned</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

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

            <div className="card" style={{ marginTop: 16, padding: 14 }}>
              <h3 style={{ marginBottom: 10 }}>Appointment</h3>
              {apptResult && (
                <div style={{ fontSize: 13, color: 'var(--green)', marginBottom: 8 }}>
                  Booked for {new Date(apptResult.scheduled_at).toLocaleString()}
                </div>
              )}
              {bookingLink && (
                <div style={{ fontSize: 12, marginBottom: 10, wordBreak: 'break-all' }}>
                  <div style={{ color: 'var(--green)', marginBottom: 2 }}>Link copied to clipboard:</div>
                  <div className="mono" style={{ color: 'var(--text-muted)' }}>{bookingLink.url}</div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginBottom: showApptForm ? 12 : 0, flexWrap: 'wrap', alignItems: 'center' }}>
                {!showApptForm && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowApptForm(true)}>Schedule appointment</button>
                )}
                <select value={linkRepId} onChange={(e) => setLinkRepId(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 12 }}>
                  <option value="">Rep for link…</option>
                  {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button className="btn btn-ghost btn-sm" onClick={getBookingLink} disabled={!linkRepId || gettingLink}>
                  {gettingLink ? '…' : 'Self-service link'}
                </button>
              </div>
              {showApptForm && (
                <form onSubmit={bookAppointment}>
                  <div className="field">
                    <label>Rep</label>
                    <select value={apptRepId} onChange={(e) => setApptRepId(e.target.value)} required>
                      <option value="">Select a rep…</option>
                      {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Date &amp; time</label>
                    <input type="datetime-local" value={apptDate} onChange={(e) => setApptDate(e.target.value)} required />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    Must be within the next 3.5 business days.
                  </div>
                  <div className="field">
                    <label>Notes (optional)</label>
                    <input value={apptNotes} onChange={(e) => setApptNotes(e.target.value)} placeholder="e.g. wants to see financing options" />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-amber btn-sm" type="submit" disabled={savingAppt || !apptDate || !apptRepId}>
                      {savingAppt ? 'Booking…' : 'Book it'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowApptForm(false)} disabled={savingAppt}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="card" style={{ marginTop: 16, padding: 14 }}>
              <h3 style={{ marginBottom: 10 }}>County intel</h3>
              {!lead.apn ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  No parcel number on file — this lead wasn't sourced from Maricopa County, so county data isn't available for it.
                </div>
              ) : (
                <>
                  {intelError && <div className="error-banner" style={{ marginBottom: 10 }}>{intelError}</div>}
                  <div style={{ fontSize: 14, marginBottom: 8 }}>
                    {lead.estimated_value ? (
                      <span>${Number(lead.estimated_value).toLocaleString()} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({lead.value_type === 'full_cash_value' ? 'assessed value' : 'limited value'}, tax year {lead.valuation_year})</span></span>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={fetchEstimatedValue} disabled={loadingValue}>
                        {loadingValue ? 'Looking up…' : 'Look up estimated value'}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 14 }}>
                    {lead.property_intel_fetched_at && (lead.bedrooms || lead.square_footage || lead.has_pool !== null) ? (
                      <div>
                        <span>
                          {[
                            lead.bedrooms && `${lead.bedrooms}bd`,
                            lead.bathrooms && `${lead.bathrooms}ba`,
                            lead.square_footage && `${Number(lead.square_footage).toLocaleString()} sqft`,
                            lead.year_built && `Built ${lead.year_built}`
                          ].filter(Boolean).join(' · ')}
                        </span>
                        {lead.has_pool === true && <span className="tag tag-amber" style={{ padding: '1px 6px', marginLeft: 8 }}>Pool</span>}
                        {lead.has_pool === false && <span className="tag tag-neutral" style={{ padding: '1px 6px', marginLeft: 8 }}>No pool</span>}
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={fetchPropertyDetails} disabled={loadingDetails}>
                        {loadingDetails ? 'Looking up…' : 'Look up property details'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <BusyBeePanel
              leadId={leadId}
              leadEmail={lead.email}
              leadPhone={lead.phone}
              onNoteSaved={(note) => setLead((prev) => ({ ...prev, notes: [note, ...prev.notes] }))}
            />

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
