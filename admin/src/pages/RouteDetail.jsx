import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import ContactCard from '../components/ContactCard.jsx';
import RouteMap from '../components/RouteMap.jsx';
import { api } from '../api.js';

const OUTCOME_LABEL = {
  no_answer: 'No answer',
  spoke: 'Spoke',
  appointment: 'Appointment',
  sold: 'Sold',
  skip: 'Skipped'
};

export default function RouteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [route, setRoute] = useState(null);
  const [reps, setReps] = useState([]);
  const [error, setError] = useState(null);
  const [editingRoute, setEditingRoute] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [dateDraft, setDateDraft] = useState('');
  const [savingRoute, setSavingRoute] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selectedRep, setSelectedRep] = useState('');
  const [openLeadId, setOpenLeadId] = useState(null);

  async function load() {
    try {
      const [routeData, repData] = await Promise.all([api.getRoute(id), api.getUsers('rep')]);
      setRoute(routeData);
      setReps(repData);
      if (routeData.assigned_rep_id) setSelectedRep(routeData.assigned_rep_id);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAssign() {
    if (!selectedRep) return;
    setAssigning(true);
    setError(null);
    try {
      await api.assignRoute(id, selectedRep);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
  }

  function startEditing() {
    setNameDraft(route.name);
    setDateDraft(route.date ? route.date.slice(0, 10) : '');
    setEditingRoute(true);
  }

  async function saveRoute(e) {
    e.preventDefault();
    setSavingRoute(true);
    setError(null);
    try {
      const updated = await api.updateRoute(id, { name: nameDraft, date: dateDraft });
      setRoute((prev) => ({ ...prev, ...updated }));
      setEditingRoute(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingRoute(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${route.name}"? This removes all its stops. This can't be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteRoute(id);
      navigate('/routes');
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  if (!route) {
    return (
      <Layout>
        {error ? <div className="error-banner">{error}</div> : <div className="empty-state">Loading route…</div>}
      </Layout>
    );
  }

  const assignedRepName = reps.find((r) => r.id === route.assigned_rep_id)?.name;

  return (
    <Layout>
      <div className="page-header">
        <div style={{ width: '100%' }}>
          {editingRoute ? (
            <form onSubmit={saveRoute} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                <label>Name</label>
                <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} required />
              </div>
              <div className="field" style={{ marginBottom: 0, width: 160 }}>
                <label>Date</label>
                <input type="date" value={dateDraft} onChange={(e) => setDateDraft(e.target.value)} required />
              </div>
              <button className="btn btn-amber" type="submit" disabled={savingRoute}>
                {savingRoute ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditingRoute(false)} disabled={savingRoute}>
                Cancel
              </button>
            </form>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1>{route.name}</h1>
                <div className="subtitle mono">
                  {route.date} · {route.stops.length} stops · {route.status}
                  {route.build_mode && route.build_mode !== 'manual' && (
                    <> · {route.build_mode === 'radius' ? `${route.radius_miles}mi radius` : 'optimized path'} · ~{route.estimated_distance_miles}mi</>
                  )}
                </div>
                {route.start_label && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {route.start_label}{route.end_label && route.end_label !== route.start_label ? ` → ${route.end_label}` : ' (round trip)'}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={startEditing}>Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={handleDelete} disabled={deleting} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ padding: 8, marginBottom: 24 }}>
        <RouteMap
          stops={route.stops}
          start={route.start_lat != null ? { lat: route.start_lat, lng: route.start_lng, label: route.start_label } : null}
          end={route.end_lat != null ? { lat: route.end_lat, lng: route.end_lng, label: route.end_label } : null}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Stop manifest</h3>
          <div className="manifest">
            {route.stops.map((stop) => (
              <div key={stop.id} className={`manifest-stop ${stop.visited_at ? 'done' : ''}`} onClick={() => setOpenLeadId(stop.lead_id)} style={{ cursor: 'pointer' }}>
                <div className="manifest-stop-number">{stop.sequence_number}</div>
                <div className="manifest-stop-body">
                  <div className="manifest-stop-address">{stop.address}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {stop.city}, {stop.state} {stop.zip}
                  </div>
                  <div className="manifest-stop-meta">
                    <span>{stop.full_name || 'Not enriched'}</span>
                    {stop.outcome && <span className="tag tag-green" style={{ padding: '1px 6px' }}>{OUTCOME_LABEL[stop.outcome]}</span>}
                    {stop.visited && <span className="tag tag-green" style={{ padding: '1px 6px' }}>Visited</span>}
                    {stop.has_solar && <span className="tag tag-amber" style={{ padding: '1px 6px' }}>Solar</span>}
                    {stop.no_further_attempt && <span className="tag tag-red" style={{ padding: '1px 6px' }}>Stop</span>}
                  </div>
                  {stop.rep_notes && (
                    <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text-primary)' }}>
                      "{stop.rep_notes}"
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Assignment</h3>
          {assignedRepName && (
            <div style={{ marginBottom: 12, fontSize: 14 }}>
              Currently assigned to <strong>{assignedRepName}</strong>
            </div>
          )}
          <div className="field">
            <label htmlFor="rep">Assign to</label>
            <select id="rep" value={selectedRep} onChange={(e) => setSelectedRep(e.target.value)}>
              <option value="">Select a rep…</option>
              {reps.map((rep) => (
                <option key={rep.id} value={rep.id}>{rep.name}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-amber" onClick={handleAssign} disabled={!selectedRep || assigning} style={{ width: '100%', justifyContent: 'center' }}>
            {assigning ? 'Assigning…' : 'Assign route'}
          </button>
        </div>
      </div>

      {openLeadId && (
        <ContactCard leadId={openLeadId} onClose={() => setOpenLeadId(null)} onChanged={load} />
      )}
    </Layout>
  );
}
