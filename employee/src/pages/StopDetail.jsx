import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import BusyBeePanel from '../components/BusyBeePanel.jsx';
import { api } from '../api.js';
import { getDirectionsUrl } from '../lib/navigation.js';

const OUTCOMES = [
  { key: 'no_answer', label: 'No answer' },
  { key: 'spoke', label: 'Spoke' },
  { key: 'appointment', label: 'Appointment' },
  { key: 'sold', label: 'Sold' },
  { key: 'skip', label: 'Skip' }
];

export default function StopDetail() {
  const { id: routeId, stopId } = useParams();
  const [stop, setStop] = useState(null);
  const [lead, setLead] = useState(null);
  const [showApptForm, setShowApptForm] = useState(false);
  const [apptDate, setApptDate] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [savingAppt, setSavingAppt] = useState(false);
  const [apptResult, setApptResult] = useState(null);
  const [bookingLink, setBookingLink] = useState(null);
  const [gettingLink, setGettingLink] = useState(false);
  const [error, setError] = useState(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [loggingOutcome, setLoggingOutcome] = useState(false);
  const [savingFlag, setSavingFlag] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState({ full_name: '', co_owner_name: '', email: '', phone: '' });
  const [savingContact, setSavingContact] = useState(false);
  const [loadingValue, setLoadingValue] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [intelError, setIntelError] = useState(null);

  async function load() {
    setError(null);
    try {
      const route = await api.getRoute(routeId);
      const foundStop = route.stops.find((s) => s.id === stopId);
      if (!foundStop) throw new Error('Stop not found on this route');
      setStop(foundStop);

      const leadDetail = await api.getLead(foundStop.lead_id);
      setLead(leadDetail);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, stopId]);

  async function handleCheckin() {
    setCheckingIn(true);
    setError(null);
    try {
      const result = await api.checkinStop(stopId);
      setStop((prev) => ({ ...prev, visited_at: result.visited_at }));
    } catch (err) {
      setError(err.message);
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleOutcome(outcomeKey) {
    setLoggingOutcome(true);
    setError(null);
    try {
      await api.logOutcome(stopId, outcomeKey);
      setStop((prev) => ({ ...prev, outcome: outcomeKey, visited_at: prev.visited_at || new Date().toISOString() }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoggingOutcome(false);
    }
  }

  async function toggleFlag(key) {
    if (!lead) return;
    setSavingFlag(key);
    setError(null);
    try {
      const updated = await api.updateLeadFlags(lead.id, { [key]: !lead[key] });
      setLead((prev) => ({ ...prev, ...updated }));
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
      const note = await api.addLeadNote(lead.id, noteText.trim());
      setLead((prev) => ({ ...prev, notes: [note, ...prev.notes] }));
      setNoteText('');
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
      const updated = await api.updateLeadContact(lead.id, contactDraft);
      setLead((prev) => ({ ...prev, ...updated }));
      setEditingContact(false);
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
      const result = await api.getLeadEstimatedValue(lead.id);
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
      const result = await api.getLeadPropertyDetails(lead.id);
      setLead((prev) => ({ ...prev, ...result }));
    } catch (err) {
      setIntelError(err.message);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function bookAppointment(e) {
    e.preventDefault();
    if (!apptDate) return;
    setSavingAppt(true);
    setApptResult(null);
    setError(null);
    try {
      const appt = await api.createAppointment({
        lead_id: lead.id,
        scheduled_at: new Date(apptDate).toISOString(),
        notes: apptNotes || undefined
      });
      setApptResult(appt);
      setShowApptForm(false);
      setApptDate('');
      setApptNotes('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAppt(false);
    }
  }

  async function getBookingLink() {
    setGettingLink(true);
    setError(null);
    try {
      const link = await api.createBookingLink(lead.id);
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

  return (
    <div className="app-shell">
      <TopBar back title="Route" />
      <div className="content">
        {error && <div className="error-banner">{error}</div>}

        {!stop || !lead ? (
          <div className="empty-state">{error ? '' : 'Loading…'}</div>
        ) : (
          <>
            <div className="detail-header">
              <div className="detail-address">{stop.address}</div>
              <div className="detail-sub">{stop.city}, {stop.state} {stop.zip}</div>
              {editingContact ? (
                <form onSubmit={saveContact} style={{ marginTop: 8 }}>
                  <div className="field">
                    <label>Name</label>
                    <input
                      autoFocus
                      value={contactDraft.full_name}
                      onChange={(e) => setContactDraft({ ...contactDraft, full_name: e.target.value })}
                      placeholder="Homeowner name"
                    />
                  </div>
                  <div className="field">
                    <label>Co-owner name</label>
                    <input
                      value={contactDraft.co_owner_name}
                      onChange={(e) => setContactDraft({ ...contactDraft, co_owner_name: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="field">
                    <label>Email</label>
                    <input
                      type="email"
                      value={contactDraft.email}
                      onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="field">
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={contactDraft.phone}
                      onChange={(e) => setContactDraft({ ...contactDraft, phone: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="btn-row">
                    <button className="btn btn-amber" type="submit" disabled={savingContact}>
                      {savingContact ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => setEditingContact(false)} disabled={savingContact}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="detail-contact" style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {lead.full_name ? <span>{lead.full_name}</span> : <span style={{ color: 'var(--text-muted)' }}>No name on file</span>}
                    <button className="btn btn-outline" onClick={startEditingContact} style={{ width: 'auto', minHeight: 'auto', padding: '3px 10px', fontSize: 12 }}>
                      Edit
                    </button>
                  </div>
                  {lead.co_owner_name && <div style={{ marginTop: 4 }}>Co-owner: {lead.co_owner_name}</div>}
                  {(lead.phone || lead.email) && (
                    <div style={{ marginTop: 4 }}>
                      {lead.phone && <div>{lead.phone}</div>}
                      {lead.email && <div>{lead.email}</div>}
                    </div>
                  )}
                </div>
              )}
              {stop.lat != null && stop.lng != null && (
                <a
                  className="btn btn-amber"
                  style={{ marginTop: 14 }}
                  href={getDirectionsUrl(stop.lat, stop.lng, stop.address)}
                >
                  Navigate
                </a>
              )}
            </div>

            <div className="section">
              <BusyBeePanel
                leadId={lead.id}
                leadEmail={lead.email}
                leadPhone={lead.phone}
                onNoteSaved={(note) => setLead((prev) => ({ ...prev, notes: [note, ...prev.notes] }))}
              />
            </div>

            <div className="section">
              <h3 style={{ marginBottom: 10 }}>Arrival</h3>
              <button className={`btn ${stop.visited_at ? 'btn-outline' : 'btn-ink'}`} onClick={handleCheckin} disabled={checkingIn || !!stop.visited_at}>
                {stop.visited_at ? `Checked in ${new Date(stop.visited_at).toLocaleTimeString()}` : checkingIn ? 'Checking in…' : 'Check in'}
              </button>
            </div>

            <div className="section">
              <h3 style={{ marginBottom: 10 }}>Appointment</h3>
              {apptResult && (
                <div style={{ fontSize: 14, color: 'var(--green)', marginBottom: 8 }}>
                  Booked for {new Date(apptResult.scheduled_at).toLocaleString()}
                </div>
              )}
              {bookingLink && (
                <div style={{ fontSize: 13, marginBottom: 8, wordBreak: 'break-all' }}>
                  <div style={{ color: 'var(--green)', marginBottom: 2 }}>Link copied — share it with the homeowner:</div>
                  <div className="mono" style={{ color: 'var(--text-muted)' }}>{bookingLink.url}</div>
                </div>
              )}
              {!showApptForm ? (
                <div className="btn-row">
                  <button className="btn btn-outline" onClick={() => setShowApptForm(true)}>Schedule appointment</button>
                  <button className="btn btn-outline" onClick={getBookingLink} disabled={gettingLink}>
                    {gettingLink ? '…' : 'Self-service link'}
                  </button>
                </div>
              ) : (
                <form onSubmit={bookAppointment}>
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
                  <div className="btn-row">
                    <button className="btn btn-amber" type="submit" disabled={savingAppt || !apptDate}>
                      {savingAppt ? 'Booking…' : 'Book it'}
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => setShowApptForm(false)} disabled={savingAppt}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="section">
              <h3 style={{ marginBottom: 10 }}>Outcome</h3>
              <div className="outcome-grid">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.key}
                    className={`outcome-btn ${stop.outcome === o.key ? 'selected' : ''}`}
                    disabled={loggingOutcome}
                    onClick={() => handleOutcome(o.key)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="section">
              <h3 style={{ marginBottom: 6 }}>Contact card</h3>
              <div className="checkflag-row">
                <label className="checkflag">
                  <input type="checkbox" checked={!!lead.visited} disabled={savingFlag === 'visited'} onChange={() => toggleFlag('visited')} />
                  Visited
                </label>
                <label className="checkflag">
                  <input type="checkbox" checked={!!lead.has_solar} disabled={savingFlag === 'has_solar'} onChange={() => toggleFlag('has_solar')} />
                  Has solar
                </label>
                <label className="checkflag flag-red">
                  <input type="checkbox" checked={!!lead.no_further_attempt} disabled={savingFlag === 'no_further_attempt'} onChange={() => toggleFlag('no_further_attempt')} />
                  No further attempt
                </label>
              </div>
            </div>

            {lead.solar_fit && !lead.solar_fit.excluded && (
              <div className="section">
                <h3 style={{ marginBottom: 8 }}>Solar fit</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    className={`tag ${lead.solar_fit.score >= 50 ? 'tag-green' : lead.solar_fit.score >= 25 ? 'tag-amber' : 'tag-neutral'}`}
                    style={{ fontSize: 14, padding: '4px 10px' }}
                  >
                    {lead.solar_fit.score}/100
                  </span>
                </div>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--text-muted)' }}>
                  {lead.solar_fit.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}

            <div className="section">
              <h3 style={{ marginBottom: 10 }}>County intel</h3>
              {!lead.apn ? (
                <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                  No parcel number on file for this lead.
                </div>
              ) : (
                <>
                  {intelError && <div className="error-banner" style={{ marginBottom: 10 }}>{intelError}</div>}
                  <div style={{ marginBottom: 10 }}>
                    {lead.estimated_value ? (
                      <div style={{ fontSize: 15 }}>
                        ${Number(lead.estimated_value).toLocaleString()}
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {lead.value_type === 'full_cash_value' ? 'Assessed value' : 'Limited value'}, tax year {lead.valuation_year}
                        </div>
                      </div>
                    ) : (
                      <button className="btn btn-outline" onClick={fetchEstimatedValue} disabled={loadingValue}>
                        {loadingValue ? 'Looking up…' : 'Look up estimated value'}
                      </button>
                    )}
                  </div>
                  <div>
                    {lead.property_intel_fetched_at && (lead.bedrooms || lead.square_footage || lead.has_pool !== null) ? (
                      <div style={{ fontSize: 15 }}>
                        {[
                          lead.bedrooms && `${lead.bedrooms}bd`,
                          lead.bathrooms && `${lead.bathrooms}ba`,
                          lead.square_footage && `${Number(lead.square_footage).toLocaleString()} sqft`,
                          lead.year_built && `Built ${lead.year_built}`
                        ].filter(Boolean).join(' · ')}
                        {lead.has_pool === true && <span className="tag tag-amber" style={{ marginLeft: 8 }}>Pool</span>}
                        {lead.has_pool === false && <span className="tag tag-neutral" style={{ marginLeft: 8 }}>No pool</span>}
                      </div>
                    ) : (
                      <button className="btn btn-outline" onClick={fetchPropertyDetails} disabled={loadingDetails}>
                        {loadingDetails ? 'Looking up…' : 'Look up property details'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="section">
              <h3 style={{ marginBottom: 10 }}>Notes</h3>
              <form onSubmit={submitNote} className="note-input-row">
                <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…" />
                <button className="btn btn-amber" type="submit" disabled={savingNote || !noteText.trim()}>
                  {savingNote ? '…' : 'Add'}
                </button>
              </form>

              {lead.notes.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No notes yet.</div>
              ) : (
                lead.notes.map((note) => (
                  <div key={note.id} className="note-item">
                    <div className="note-meta">{new Date(note.created_at).toLocaleString()} · {note.author_name}</div>
                    <div className="note-body">{note.body}</div>
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
