import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';

export default function BuildOptimizedRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const leadIds = location.state?.leadIds || [];

  const [mode, setMode] = useState(leadIds.length > 0 ? 'endpoints' : 'radius');
  const [name, setName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Radius mode fields
  const [centerZip, setCenterZip] = useState('');
  const [radiusMiles, setRadiusMiles] = useState('3');
  const [maxStops, setMaxStops] = useState('');

  // Endpoints mode fields
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');

  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [building, setBuilding] = useState(false);

  function parsePointInput(value) {
    // Accept "lat,lng" directly, or fall back to treating it as a free-text
    // address/place the API will geocode. Zip-only input in radius mode is
    // handled separately via the dedicated zip field.
    const coordMatch = value.trim().match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      return { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[3]), label: value };
    }
    return { address: value };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBuilding(true);

    try {
      let payload;
      if (mode === 'radius') {
        if (!centerZip || !radiusMiles) throw new Error('Zip code and radius are required');
        payload = {
          mode: 'radius',
          name,
          date,
          center_zip: centerZip,
          radius_miles: parseFloat(radiusMiles),
          max_stops: maxStops ? parseInt(maxStops, 10) : undefined
        };
      } else {
        if (leadIds.length === 0) throw new Error('No leads selected — go to Leads and check the stops for this route first');
        if (!startInput || !endInput) throw new Error('Start and end locations are required');
        payload = {
          mode: 'endpoints',
          name,
          date,
          lead_ids: leadIds,
          start: parsePointInput(startInput),
          end: parsePointInput(endInput)
        };
      }

      const route = await api.buildOptimizedRoute(payload);
      setResult(route);
      setTimeout(() => navigate(`/routes/${route.id}`), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setBuilding(false);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Build optimized route</h1>
          <div className="subtitle">Auto-sequenced by estimated distance, not manual ordering</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {result && (
        <div className="error-banner" style={{ background: 'rgba(59,133,99,0.08)', borderColor: 'var(--green)', color: 'var(--green)' }}>
          Route built: {result.stop_count} stops, ~{result.estimated_distance_miles} mi. Opening it now…
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          type="button"
          className={mode === 'radius' ? 'btn btn-primary' : 'btn btn-ghost'}
          onClick={() => setMode('radius')}
        >
          Zip + radius
        </button>
        <button
          type="button"
          className={mode === 'endpoints' ? 'btn btn-primary' : 'btn btn-ghost'}
          onClick={() => setMode('endpoints')}
        >
          Start + end point
        </button>
      </div>

      <div className="card" style={{ maxWidth: 460 }}>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Route name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. North Phoenix sweep" required />
          </div>
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          {mode === 'radius' ? (
            <>
              <div className="field">
                <label htmlFor="zip">Center zip code</label>
                <input id="zip" value={centerZip} onChange={(e) => setCenterZip(e.target.value)} placeholder="85028" required />
              </div>
              <div className="field">
                <label htmlFor="radius">Radius (miles)</label>
                <input id="radius" type="number" step="0.5" min="0.5" value={radiusMiles} onChange={(e) => setRadiusMiles(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="maxStops">Max stops (optional)</label>
                <input id="maxStops" type="number" min="1" value={maxStops} onChange={(e) => setMaxStops(e.target.value)} placeholder="No limit" />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Automatically pulls every unassigned lead with coordinates within range of the zip's center point,
                and builds a round-trip route starting and ending there.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, marginBottom: 16, color: leadIds.length ? 'var(--text-primary)' : 'var(--red)' }}>
                {leadIds.length > 0
                  ? `${leadIds.length} stops selected from the Leads page`
                  : 'No leads selected — go to Leads, check the stops you want, then click "Build route" and choose this mode'}
              </div>
              <div className="field">
                <label htmlFor="start">Start location</label>
                <input id="start" value={startInput} onChange={(e) => setStartInput(e.target.value)} placeholder="Address, or lat,lng" required />
              </div>
              <div className="field">
                <label htmlFor="end">End location</label>
                <input id="end" value={endInput} onChange={(e) => setEndInput(e.target.value)} placeholder="Address, or lat,lng" required />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Orders the selected stops for the shortest path between these two points.
              </div>
            </>
          )}

          <button className="btn btn-amber" type="submit" disabled={building} style={{ width: '100%', justifyContent: 'center' }}>
            {building ? 'Building…' : 'Build route'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
