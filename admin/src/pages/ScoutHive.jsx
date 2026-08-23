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
  const [valuations, setValuations] = useState({}); // keyed by apn/address
  const [loadingValuation, setLoadingValuation] = useState(null);
  const [details, setDetails] = useState({}); // keyed by apn/address
  const [loadingDetails, setLoadingDetails] = useState(null);

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

  async function fetchValuation(apn, key) {
    if (!apn) return;
    setLoadingValuation(key);
    try {
      const result = await api.scoutHiveValuation(apn);
      setValuations((prev) => ({ ...prev, [key]: result }));
    } catch (err) {
      setValuations((prev) => ({ ...prev, [key]: { error: err.message } }));
    } finally {
      setLoadingValuation(null);
    }
  }

  async function fetchDetails(apn, key) {
    if (!apn) return;
    setLoadingDetails(key);
    try {
      const result = await api.scoutHiveDetails(apn);
      setDetails((prev) => ({ ...prev, [key]: result }));
    } catch (err) {
      setDetails((prev) => ({ ...prev, [key]: { error: err.message } }));
    } finally {
      setLoadingDetails(null);
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

          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            "Est. value" is Maricopa County's tax-assessed value, not a market estimate like a Zillow Zestimate — Arizona's assessment cap often understates true market value. Fetched one at a time per row to stay within the county's API limits.
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
                    <th>Est. value</th>
                    <th>Details</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.results.map((r) => {
                    const key = r.apn || r.address;
                    const valuation = valuations[key];
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
                        <td className="mono" style={{ fontSize: 12 }}>
                          {valuation?.estimated_value ? (
                            <span title={`${valuation.value_type}, tax year ${valuation.valuation_year}`}>
                              ${Number(valuation.estimated_value).toLocaleString()}
                            </span>
                          ) : valuation?.error ? (
                            <span style={{ color: 'var(--red)' }}>Unavailable</span>
                          ) : (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              disabled={!r.apn || loadingValuation === key}
                              onClick={() => fetchValuation(r.apn, key)}
                              title={!r.apn ? 'No parcel number on file' : ''}
                            >
                              {loadingValuation === key ? '…' : 'Get estimate'}
                            </button>
                          )}
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {(() => {
                            const d = details[key];
                            if (d?.error) return <span style={{ color: 'var(--red)' }}>Unavailable</span>;
                            if (d) {
                              const bits = [];
                              if (d.bedrooms) bits.push(`${d.bedrooms}bd`);
                              if (d.bathrooms) bits.push(`${d.bathrooms}ba`);
                              if (d.square_footage) bits.push(`${d.square_footage.toLocaleString()} sqft`);
                              if (d.year_built) bits.push(`Built ${d.year_built}`);
                              return (
                                <div>
                                  <div>{bits.length > 0 ? bits.join(' · ') : 'No details on file'}</div>
                                  {d.has_pool === true && <span className="tag tag-amber" style={{ padding: '1px 6px', marginTop: 2, display: 'inline-block' }}>Pool</span>}
                                  {d.has_pool === false && <span className="tag tag-neutral" style={{ padding: '1px 6px', marginTop: 2, display: 'inline-block' }}>No pool</span>}
                                </div>
                              );
                            }
                            return (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '3px 8px', fontSize: 11 }}
                                disabled={!r.apn || loadingDetails === key}
                                onClick={() => fetchDetails(r.apn, key)}
                                title={!r.apn ? 'No parcel number on file' : ''}
                              >
                                {loadingDetails === key ? '…' : 'Get details'}
                              </button>
                            );
                          })()}
                        </td>
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
