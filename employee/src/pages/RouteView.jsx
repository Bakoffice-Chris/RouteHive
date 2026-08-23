import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import RouteMap from '../components/RouteMap.jsx';
import { api } from '../api.js';
import { getDirectionsUrl } from '../lib/navigation.js';

const OUTCOME_LABEL = {
  no_answer: 'No answer',
  spoke: 'Spoke',
  appointment: 'Appointment',
  sold: 'Sold',
  skip: 'Skipped'
};

const DISPOSITION_LABELS = {
  not_contacted: 'Not contacted',
  contacted: 'Contacted',
  appointment_set: 'Appointment',
  sold: 'Sold',
  not_interested: 'Not interested',
  do_not_contact: 'Do not contact'
};

export default function RouteView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [route, setRoute] = useState(null);
  const [error, setError] = useState(null);
  const [dispositionFilter, setDispositionFilter] = useState('');
  const [visitedFilter, setVisitedFilter] = useState(false);
  const [hasSolarFilter, setHasSolarFilter] = useState(false);
  const [noFurtherAttemptFilter, setNoFurtherAttemptFilter] = useState(false);

  useEffect(() => {
    api
      .getRoute(id)
      .then(setRoute)
      .catch((err) => setError(err.message));
  }, [id]);

  const doneCount = route?.stops.filter((s) => s.visited_at).length || 0;

  const visibleStops = (route?.stops || []).filter((stop) => {
    if (dispositionFilter && stop.disposition !== dispositionFilter) return false;
    if (visitedFilter && !stop.visited) return false;
    if (hasSolarFilter && !stop.has_solar) return false;
    if (noFurtherAttemptFilter && !stop.no_further_attempt) return false;
    return true;
  });

  return (
    <div className="app-shell">
      <TopBar back title="My Routes" />
      <div className="content">
        {error && <div className="error-banner">{error}</div>}

        {!route ? (
          <div className="empty-state">{error ? '' : 'Loading…'}</div>
        ) : (
          <>
            <h1 style={{ marginBottom: 4 }}>{route.name}</h1>
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
              {doneCount} / {route.stops.length} visited
              {route.estimated_distance_miles ? ` · ~${route.estimated_distance_miles} mi` : ''}
            </div>

            <div className="card" style={{ padding: 4, marginBottom: 16 }}>
              <RouteMap stops={route.stops} />
            </div>

            <div className="card" style={{ marginBottom: 16, padding: 12 }}>
              <div style={{ marginBottom: 10 }}>
                <select
                  value={dispositionFilter}
                  onChange={(e) => setDispositionFilter(e.target.value)}
                  style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--line)', borderRadius: 4, fontSize: 13 }}
                >
                  <option value="">All outcomes</option>
                  {Object.entries(DISPOSITION_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
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
              </div>
            </div>

            {visibleStops.length === 0 ? (
              <div className="empty-state">No stops match these filters.</div>
            ) : (
              visibleStops.map((stop) => (
              <div
                key={stop.id}
                className={`stop-card ${stop.visited_at ? 'done' : ''}`}
                onClick={() => navigate(`/routes/${route.id}/stops/${stop.id}`)}
              >
                <div className="stop-number">{stop.sequence_number}</div>
                <div className="stop-body">
                  <div className="stop-address">{stop.address}</div>
                  <div className="stop-sub">{stop.city}, {stop.state} {stop.zip}</div>
                  <div className="stop-tags">
                    {stop.outcome && <span className="tag tag-green">{OUTCOME_LABEL[stop.outcome]}</span>}
                    {stop.visited && <span className="tag tag-green">Visited</span>}
                    {stop.has_solar && <span className="tag tag-amber">Solar</span>}
                    {stop.no_further_attempt && <span className="tag tag-red">Stop</span>}
                  </div>
                </div>
                {stop.lat != null && stop.lng != null && (
                  <a
                    className="stop-nav-btn"
                    href={getDirectionsUrl(stop.lat, stop.lng, stop.address)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Navigate to ${stop.address}`}
                  >
                    ➔
                  </a>
                )}
              </div>
            ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
