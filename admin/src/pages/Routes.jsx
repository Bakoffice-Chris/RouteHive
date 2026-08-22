import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';

const STATUS_TAG = {
  draft: 'tag-neutral',
  assigned: 'tag-amber',
  in_progress: 'tag-amber',
  completed: 'tag-green'
};

export default function Routes() {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getRoutes()
      .then(setRoutes)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Routes</h1>
          <div className="subtitle">{routes.length} total</div>
        </div>
        <Link to="/routes/build-optimized" className="btn btn-amber">Build optimized route</Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty-state">Loading routes…</div>
        ) : routes.length === 0 ? (
          <div className="empty-state">
            No routes yet. Select leads on the Leads page and build your first route.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => (
                <tr key={route.id}>
                  <td style={{ fontWeight: 600 }}>{route.name}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{route.date}</td>
                  <td>
                    <span className={`tag ${STATUS_TAG[route.status] || 'tag-neutral'}`}>{route.status}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link to={`/routes/${route.id}`} className="btn btn-ghost btn-sm">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
