const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  getLeads: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/leads${qs ? `?${qs}` : ''}`);
  },
  importCsv: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/api/leads/import-csv', { method: 'POST', body: form });
  },

  getLead: (id) => request(`/api/leads/${id}`),
  updateLeadFlags: (id, flags) => request(`/api/leads/${id}/flags`, { method: 'PATCH', body: JSON.stringify(flags) }),
  addLeadNote: (id, body) => request(`/api/leads/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),

  getRoutes: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/routes${qs ? `?${qs}` : ''}`);
  },
  getRoute: (id) => request(`/api/routes/${id}`),
  createRoute: (payload) => request('/api/routes', { method: 'POST', body: JSON.stringify(payload) }),
  buildOptimizedRoute: (payload) => request('/api/routes/build-optimized', { method: 'POST', body: JSON.stringify(payload) }),
  assignRoute: (id, rep_id) =>
    request(`/api/routes/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ rep_id }) }),
  reorderStops: (id, stop_ids_in_order) =>
    request(`/api/routes/${id}/reorder`, { method: 'PATCH', body: JSON.stringify({ stop_ids_in_order }) }),

  getUsers: (role) => request(`/api/users${role ? `?role=${role}` : ''}`),
  createUser: (payload) => request('/api/users', { method: 'POST', body: JSON.stringify(payload) }),

  getTerritories: () => request('/api/territories'),
  createTerritory: (payload) => request('/api/territories', { method: 'POST', body: JSON.stringify(payload) })
};

export { getToken };
