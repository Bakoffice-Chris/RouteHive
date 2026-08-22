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

export default function RouteView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [route, setRoute] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getRoute(id)
      .then(setRoute)
      .catch((err) => setError(err.message));
  }, [id]);

  const doneCount = route?.stops.filter((s) => s.visited_at).length || 0;

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

            {route.stops.map((stop) => (
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
            ))}
          </>
        )}
      </div>
    </div>
  );
}
