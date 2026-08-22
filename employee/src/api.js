const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  getMyRoutes: () => request('/api/routes'),
  getRoute: (id) => request(`/api/routes/${id}`),

  checkinStop: (id) => request(`/api/stops/${id}/checkin`, { method: 'PATCH' }),
  logOutcome: (id, outcome, rep_notes) =>
    request(`/api/stops/${id}/outcome`, { method: 'PATCH', body: JSON.stringify({ outcome, rep_notes }) }),

  getLead: (id) => request(`/api/leads/${id}`),
  updateLeadFlags: (id, flags) => request(`/api/leads/${id}/flags`, { method: 'PATCH', body: JSON.stringify(flags) }),
  addLeadNote: (id, body) => request(`/api/leads/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) })
};

export { getToken };
