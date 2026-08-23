import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../api.js';

const STATUS_TAG = {
  assigned: 'tag-amber',
  in_progress: 'tag-amber',
  completed: 'tag-green'
};

function isToday(dateStr) {
  return dateStr === new Date().toISOString().slice(0, 10);
}

export default function MyRoutes() {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getMyRoutes()
      .then((data) => setRoutes(data.sort((a, b) => (a.date < b.date ? 1 : -1))))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="app-shell">
      <TopBar />
      <div className="content">
        <h1 style={{ marginBottom: 4 }}>My Routes</h1>
        <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {routes.length} assigned
        </div>

        <Link to="/appointments" className="btn btn-outline" style={{ marginBottom: 20, display: 'flex' }}>
          My Appointments
        </Link>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : routes.length === 0 ? (
          <div className="empty-state">No routes assigned yet. Check back once your manager assigns one.</div>
        ) : (
          routes.map((route) => (
            <Link key={route.id} to={`/routes/${route.id}`} className="route-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="route-card-title">{route.name}</div>
                  <div className="route-card-meta">
                    {isToday(route.date) ? 'TODAY' : route.date}
                  </div>
                </div>
                <span className={`tag ${STATUS_TAG[route.status] || 'tag-neutral'}`}>{route.status}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
