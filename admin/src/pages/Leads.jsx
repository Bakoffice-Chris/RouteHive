import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import ContactCard from '../components/ContactCard.jsx';
import { api } from '../api.js';
import { formatDateOnly } from '../lib/dateFormat.js';

const DISPOSITION_LABELS = {
  not_contacted: { label: 'Not contacted', tag: 'tag-neutral' },
  contacted: { label: 'Contacted', tag: 'tag-amber' },
  appointment_set: { label: 'Appointment', tag: 'tag-green' },
  sold: { label: 'Sold', tag: 'tag-green' },
  not_interested: { label: 'Not interested', tag: 'tag-red' },
  do_not_contact: { label: 'Do not contact', tag: 'tag-red' }
};

export default function Leads() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [importingNotes, setImportingNotes] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dispositionFilter, setDispositionFilter] = useState('');
  const [sortBySolarFit, setSortBySolarFit] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [newLead, setNewLead] = useState({ address: '', city: '', state: '', zip: '', owner_name: '' });
  const [savingLead, setSavingLead] = useState(false);
  const [visitedFilter, setVisitedFilter] = useState(false);
  const [hasSolarFilter, setHasSolarFilter] = useState(false);
  const [noFurtherAttemptFilter, setNoFurtherAttemptFilter] = useState(false);
  const [openLeadId, setOpenLeadId] = useState(null);
  const [notesImportResult, setNotesImportResult] = useState(null);
  const [bulkRemoving, setBulkRemoving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (dispositionFilter) params.disposition = dispositionFilter;
      if (visitedFilter) params.visited = 'true';
      if (hasSolarFilter) params.has_solar = 'true';
      if (noFurtherAttemptFilter) params.no_further_attempt = 'true';
      if (sortBySolarFit) params.sort = 'solar_fit';
      const data = await api.getLeads(params);
      setLeads(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispositionFilter, visitedFilter, hasSolarFilter, noFurtherAttemptFilter, sortBySolarFit]);

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      if (prev.size === leads.length && leads.length > 0) return new Set();
      return new Set(leads.map((l) => l.id));
    });
  }

  async function handleRemoveFromRoute() {
    if (selected.size === 0) return;
    if (!confirm(`Remove ${selected.size} lead(s) from their current route(s)? This doesn't delete the leads or the routes, just the association.`)) return;
    setBulkRemoving(true);
    setError(null);
    try {
      await api.removeLeadsFromRoute([...selected]);
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkRemoving(false);
    }
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const result = await api.importCsv(file);
      await load();
      alert(`Imported ${result.imported} leads.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  async function handleImportNotes(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportingNotes(true);
    setError(null);
    setNotesImportResult(null);
    try {
      const result = await api.importNotes(file);
      setNotesImportResult(result);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setImportingNotes(false);
      e.target.value = '';
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await api.exportLeadsCsv();
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleAddLead(e) {
    e.preventDefault();
    if (!newLead.address.trim()) return;
    setSavingLead(true);
    setError(null);
    try {
      await api.createLead(newLead);
      setNewLead({ address: '', city: '', state: '', zip: '', owner_name: '' });
      setShowAddLead(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingLead(false);
    }
  }

  function buildRouteFromSelected() {
    const ids = Array.from(selected);
    navigate('/routes/new', { state: { leadIds: ids } });
  }

  function buildOptimizedFromSelected() {
    const ids = Array.from(selected);
    navigate('/routes/build-optimized', { state: { leadIds: ids } });
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Leads</h1>
          <div className="subtitle">{leads.length} in view</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-amber btn-sm" onClick={() => setShowAddLead((v) => !v)}>
            {showAddLead ? 'Cancel' : 'Add lead'}
          </button>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            {importing ? 'Importing…' : 'Import CSV'}
            <input type="file" accept=".csv" onChange={handleImport} disabled={importing} style={{ display: 'none' }} />
          </label>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            {importingNotes ? 'Importing…' : 'Import notes'}
            <input type="file" accept=".csv" onChange={handleImportNotes} disabled={importingNotes} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-ghost btn-sm" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button className="btn btn-ghost" disabled={selected.size === 0} onClick={buildRouteFromSelected}>
            Manual order ({selected.size})
          </button>
          <button className="btn btn-ghost" disabled={selected.size === 0 || bulkRemoving} onClick={handleRemoveFromRoute} style={{ color: selected.size > 0 ? 'var(--red)' : undefined, borderColor: selected.size > 0 ? 'var(--red)' : undefined }}>
            {bulkRemoving ? 'Removing…' : `Remove from route (${selected.size})`}
          </button>
          <button className="btn btn-amber" disabled={selected.size === 0} onClick={buildOptimizedFromSelected}>
            Build optimized ({selected.size})
          </button>
        </div>
      </div>

      {showAddLead && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 480 }}>
          <h3 style={{ marginBottom: 12 }}>Add a lead</h3>
          <form onSubmit={handleAddLead}>
            <div className="field">
              <label>Address</label>
              <input value={newLead.address} onChange={(e) => setNewLead({ ...newLead, address: e.target.value })} placeholder="123 Main St" required />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="field" style={{ flex: 2 }}>
                <label>City</label>
                <input value={newLead.city} onChange={(e) => setNewLead({ ...newLead, city: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>State</label>
                <input value={newLead.state} onChange={(e) => setNewLead({ ...newLead, state: e.target.value })} maxLength={2} style={{ textTransform: 'uppercase' }} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Zip</label>
                <input value={newLead.zip} onChange={(e) => setNewLead({ ...newLead, zip: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Owner name (optional)</label>
              <input value={newLead.owner_name} onChange={(e) => setNewLead({ ...newLead, owner_name: e.target.value })} />
            </div>
            <button className="btn btn-amber" type="submit" disabled={savingLead || !newLead.address.trim()}>
              {savingLead ? 'Adding…' : 'Add lead'}
            </button>
          </form>
        </div>
      )}

      {notesImportResult && (
        <div className="error-banner" style={{ background: 'rgba(59,133,99,0.08)', borderColor: 'var(--green)', color: 'var(--green)' }}>
          Imported {notesImportResult.imported} note{notesImportResult.imported === 1 ? '' : 's'}.
          {notesImportResult.skipped_count > 0 && (
            <> {notesImportResult.skipped_count} address{notesImportResult.skipped_count === 1 ? '' : 'es'} didn't match any existing lead: {notesImportResult.skipped_addresses.join(', ')}</>
          )}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 16 }}>
        <select value={dispositionFilter} onChange={(e) => setDispositionFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3 }}>
          <option value="">All dispositions</option>
          {Object.entries(DISPOSITION_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={visitedFilter} onChange={(e) => setVisitedFilter(e.target.checked)} />
            Visited
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={hasSolarFilter} onChange={(e) => setHasSolarFilter(e.target.checked)} />
            Has solar
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={noFurtherAttemptFilter} onChange={(e) => setNoFurtherAttemptFilter(e.target.checked)} />
            No further attempt
          </label>
          <button
            className={`btn btn-sm ${sortBySolarFit ? 'btn-amber' : 'btn-ghost'}`}
            onClick={() => setSortBySolarFit((v) => !v)}
            title="Sort by likely solar fit, using pool/value/size/purchase-recency signals"
          >
            {sortBySolarFit ? '✓ Best solar prospects first' : 'Sort by solar fit'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty-state">Loading leads…</div>
        ) : leads.length === 0 ? (
          <div className="empty-state">
            No leads yet. Import a CSV of new home purchase records to get started.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={leads.length > 0 && selected.size === leads.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
                <th>Address</th>
                <th>Name</th>
                <th>Contact</th>
                <th>Purchase date</th>
                <th>Flags</th>
                <th>Solar fit</th>
                <th>Assigned</th>
                <th>Disposition</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const disp = DISPOSITION_LABELS[lead.disposition] || DISPOSITION_LABELS.not_contacted;
                return (
                  <tr key={lead.id} className={selected.has(lead.id) ? 'checked' : ''}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
                    </td>
                    <td onClick={() => setOpenLeadId(lead.id)} style={{ cursor: 'pointer' }}>
                      <div style={{ fontWeight: 600 }}>{lead.address}</div>
                      <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {lead.city}, {lead.state} {lead.zip}
                      </div>
                    </td>
                    <td onClick={() => setOpenLeadId(lead.id)} style={{ cursor: 'pointer' }}>
                      {lead.full_name || <span style={{ color: 'var(--text-muted)' }}>Not enriched</span>}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }} onClick={() => setOpenLeadId(lead.id)}>
                      {lead.phone || lead.email ? (
                        <>
                          {lead.phone && <div>{lead.phone}</div>}
                          {lead.email && <div>{lead.email}</div>}
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }} onClick={() => setOpenLeadId(lead.id)}>{formatDateOnly(lead.purchase_date) || '—'}</td>
                    <td onClick={() => setOpenLeadId(lead.id)}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {lead.visited && <span className="tag tag-green" style={{ padding: '1px 6px' }}>Visited</span>}
                        {lead.has_solar && <span className="tag tag-amber" style={{ padding: '1px 6px' }}>Solar</span>}
                        {lead.no_further_attempt && <span className="tag tag-red" style={{ padding: '1px 6px' }}>Stop</span>}
                      </div>
                    </td>
                    <td onClick={() => setOpenLeadId(lead.id)} title={lead.solar_fit?.reasons?.join(' · ')}>
                      {lead.solar_fit?.excluded ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        <span className={`tag ${lead.solar_fit?.score >= 50 ? 'tag-green' : lead.solar_fit?.score >= 25 ? 'tag-amber' : 'tag-neutral'}`}>
                          {lead.solar_fit?.score ?? 0}/100
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {lead.assigned_rep_name ? (
                        <>
                          {lead.assigned_rep_name}
                          {lead.assignment_source === 'route' && lead.route_name && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>via {lead.route_name}</div>
                          )}
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                      )}
                    </td>
                    <td onClick={() => setOpenLeadId(lead.id)}>
                      <span className={`tag ${disp.tag}`}>{disp.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {openLeadId && (
        <ContactCard leadId={openLeadId} onClose={() => setOpenLeadId(null)} onChanged={load} />
      )}
    </Layout>
  );
}
