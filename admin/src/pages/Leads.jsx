import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import ContactCard from '../components/ContactCard.jsx';
import { api } from '../api.js';

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
  const [dispositionFilter, setDispositionFilter] = useState('');
  const [openLeadId, setOpenLeadId] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = dispositionFilter ? { disposition: dispositionFilter } : {};
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
  }, [dispositionFilter]);

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
        <div style={{ display: 'flex', gap: 10 }}>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            {importing ? 'Importing…' : 'Import CSV'}
            <input type="file" accept=".csv" onChange={handleImport} disabled={importing} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-ghost" disabled={selected.size === 0} onClick={buildRouteFromSelected}>
            Manual order ({selected.size})
          </button>
          <button className="btn btn-amber" disabled={selected.size === 0} onClick={buildOptimizedFromSelected}>
            Build optimized ({selected.size})
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <select value={dispositionFilter} onChange={(e) => setDispositionFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3 }}>
          <option value="">All dispositions</option>
          {Object.entries(DISPOSITION_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
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
                <th style={{ width: 32 }}></th>
                <th>Address</th>
                <th>Name</th>
                <th>Contact</th>
                <th>Purchase date</th>
                <th>Flags</th>
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
                    <td className="mono" style={{ fontSize: 12 }} onClick={() => setOpenLeadId(lead.id)}>{lead.purchase_date || '—'}</td>
                    <td onClick={() => setOpenLeadId(lead.id)}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {lead.visited && <span className="tag tag-green" style={{ padding: '1px 6px' }}>Visited</span>}
                        {lead.has_solar && <span className="tag tag-amber" style={{ padding: '1px 6px' }}>Solar</span>}
                        {lead.no_further_attempt && <span className="tag tag-red" style={{ padding: '1px 6px' }}>Stop</span>}
                      </div>
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
