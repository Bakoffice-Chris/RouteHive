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
  createLead: (payload) => request('/api/leads', { method: 'POST', body: JSON.stringify(payload) }),
  removeLeadsFromRoute: (leadIds) => request('/api/leads/bulk-remove-from-route', { method: 'POST', body: JSON.stringify({ lead_ids: leadIds }) }),
  assignLeadOwner: (id, repId) => request(`/api/leads/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ rep_id: repId }) }),
  importCsv: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/api/leads/import-csv', { method: 'POST', body: form });
  },

  getLead: (id) => request(`/api/leads/${id}`),
  getLeadBrief: (id) => request(`/api/leads/${id}/brief`),
  getLeadEstimatedValue: (id) => request(`/api/leads/${id}/estimated-value`),
  getLeadPropertyDetails: (id) => request(`/api/leads/${id}/property-details`),
  getLeadDraft: (id, channel) => request(`/api/leads/${id}/draft?channel=${channel}`),
  updateLeadFlags: (id, flags) => request(`/api/leads/${id}/flags`, { method: 'PATCH', body: JSON.stringify(flags) }),
  updateLeadContact: (id, payload) => request(`/api/leads/${id}/contact`, { method: 'PATCH', body: JSON.stringify(payload) }),
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
  updateRoute: (id, payload) => request(`/api/routes/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteRoute: (id) => request(`/api/routes/${id}`, { method: 'DELETE' }),

  getUsers: (role) => request(`/api/users${role ? `?role=${role}` : ''}`),
  createUser: (payload) => request('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id, payload) => request(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  exportLeadsCsv: async () => {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/leads/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `routehive-leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  importNotes: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/api/leads/import-notes', { method: 'POST', body: form });
  },

  getTerritories: () => request('/api/territories'),
  createTerritory: (payload) => request('/api/territories', { method: 'POST', body: JSON.stringify(payload) }),

  getApiKeys: () => request('/api/integrations/api-keys'),
  createApiKey: (name) => request('/api/integrations/api-keys', { method: 'POST', body: JSON.stringify({ name }) }),
  revokeApiKey: (id) => request(`/api/integrations/api-keys/${id}/revoke`, { method: 'PATCH' }),

  getWebhooks: () => request('/api/integrations/webhooks'),
  createWebhook: (url) => request('/api/integrations/webhooks', { method: 'POST', body: JSON.stringify({ url }) }),
  toggleWebhook: (id) => request(`/api/integrations/webhooks/${id}/toggle`, { method: 'PATCH' }),
  deleteWebhook: (id) => request(`/api/integrations/webhooks/${id}`, { method: 'DELETE' }),

  scoutHivePreview: (searchTerm, lookbackDays) => {
    const qs = new URLSearchParams({ search_term: searchTerm, lookback_days: lookbackDays }).toString();
    return request(`/api/leads/scouthive/preview?${qs}`);
  },
  scoutHiveImport: (searchTerm, records) =>
    request('/api/leads/scouthive/import', { method: 'POST', body: JSON.stringify({ search_term: searchTerm, records }) }),
  scoutHiveValuation: (apn) => request(`/api/leads/scouthive/valuation?apn=${encodeURIComponent(apn)}`),
  scoutHiveDetails: (apn) => request(`/api/leads/scouthive/details?apn=${encodeURIComponent(apn)}`),

  getAppointments: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/appointments${qs ? `?${qs}` : ''}`);
  },
  createAppointment: (payload) => request('/api/appointments', { method: 'POST', body: JSON.stringify(payload) }),
  updateAppointment: (id, payload) => request(`/api/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  getAppointmentReminder: (id, type, channel) => request(`/api/appointments/${id}/reminder?type=${type}&channel=${channel}`),

  getAvailability: (repId) => request(`/api/availability${repId ? `?rep_id=${repId}` : ''}`),
  addAvailability: (payload) => request('/api/availability', { method: 'POST', body: JSON.stringify(payload) }),
  deleteAvailability: (id) => request(`/api/availability/${id}`, { method: 'DELETE' }),
  createBookingLink: (leadId, repId) =>
    request(`/api/leads/${leadId}/booking-link`, { method: 'POST', body: JSON.stringify(repId ? { rep_id: repId } : {}) })
};

export { getToken };
