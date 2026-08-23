import React, { useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';

export default function ScoutHive() {
  const [searchTerm, setSearchTerm] = useState('');
  const [lookbackDays, setLookbackDays] = useState(90);
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [importResult, setImportResult] = useState(null);

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setSearching(true);
    setError(null);
    setImportResult(null);
    setSelected(new Set());
    try {
      const data = await api.scoutHivePreview(searchTerm.trim(), lookbackDays);
      setResults(data);
    } catch (err) {
      setError(err.message);
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  function toggleSelect(apn, address) {
    const key = apn || address;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function selectAllNew() {
    if (!results) return;
    const newOnes = results.results.filter((r) => !r.already_in_database).map((r) => r.apn || r.address);
    setSelected(new Set(newOnes));
  }

  async function handleImport() {
    if (!results || selected.size === 0) return;
    setImporting(true);
    setError(null);
    try {
      const chosen = results.results.filter((r) => selected.has(r.apn || r.address));
      const result = await api.scoutHiveImport(results.search_term, chosen);
      setImportResult(result);
      const refreshed = await api.scoutHivePreview(results.search_term, lookbackDays);
      setResults(refreshed);
      setSelected(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo-40.png" alt="" style={{ width: 32, height: 32 }} />
          <div>
            <h1 style={{ fontFamily: 'var(--font-brand)', textTransform: 'none', letterSpacing: '0.02em', fontSize: 22 }}>
              <span style={{ color: 'var(--ink)' }}>Scout</span><span style={{ color: 'var(--amber)' }}>Hive</span>
            </h1>
            <div className="subtitle">New home sales from Maricopa County, ready to bring into your pipeline</div>
          </div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
            <label htmlFor="search_term">Zip code, subdivision, or area</label>
            <input id="search_term" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="e.g. 85028" />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 140 }}>
            <label htmlFor="lookback">Last (days)</label>
            <input id="lookback" type="number" min="1" value={lookbackDays} onChange={(e) => setLookbackDays(e.target.value)} />
          </div>
          <button className="btn btn-amber" type="submit" disabled={searching || !searchTerm.trim()}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
      </div>

      {importResult && (
        <div className="error-banner" style={{ background: 'rgba(59,133,99,0.08)', borderColor: 'var(--green)', color: 'var(--green)' }}>
          Imported {importResult.imported} lead{importResult.imported === 1 ? '' : 's'}.
          {importResult.skipped_duplicate > 0 && <> {importResult.skipped_duplicate} already existed and were skipped.</>}
        </div>
      )}

      {results && (
        <>
          <div className="toolbar">
            <span className="subtitle" style={{ fontSize: 12 }}>
              {results.count} sale{results.count === 1 ? '' : 's'} found in the last {results.lookback_days} days
            </span>
            <button className="btn btn-ghost btn-sm" onClick={selectAllNew}>Select all new</button>
            <button className="btn btn-amber" disabled={selected.size === 0 || importing} onClick={handleImport}>
              {importing ? 'Importing…' : `Import selected (${selected.size})`}
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {results.results.length === 0 ? (
              <div className="empty-state">No sales found for this search in the selected window.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>Address</th>
                    <th>Owner</th>
                    <th>Purchase date</th>
                    <th>Sale price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.results.map((r) => {
                    const key = r.apn || r.address;
                    return (
                      <tr key={key} className={selected.has(key) ? 'checked' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(key)}
                            disabled={r.already_in_database}
                            onChange={() => toggleSelect(r.apn, r.address)}
                          />
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.address}</div>
                          <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {r.city}, {r.state} {r.zip}
                          </div>
                        </td>
                        <td>{r.owner_name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{r.purchase_date}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{r.sale_price ? `$${Number(r.sale_price).toLocaleString()}` : '—'}</td>
                        <td>
                          {r.already_in_database ? (
                            <span className="tag tag-neutral">Already in database</span>
                          ) : (
                            <span className="tag tag-green">New</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {!results && !searching && (
        <div className="empty-state">
          Search a zip code, subdivision, or area to see recent home sales from Maricopa County — anything new gets a "New" tag, anything you've already pulled in shows as "Already in database."
        </div>
      )}
    </Layout>
  );
}
