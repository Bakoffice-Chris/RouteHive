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
  getLeadBrief: (id) => request(`/api/leads/${id}/brief`),
  getLeadEstimatedValue: (id) => request(`/api/leads/${id}/estimated-value`),
  getLeadPropertyDetails: (id) => request(`/api/leads/${id}/property-details`),
  createLead: (payload) => request('/api/leads', { method: 'POST', body: JSON.stringify(payload) }),
  getSeniors: () => request('/api/users/seniors'),
  getAvailableSeniors: (scheduledAt, durationMinutes) =>
    request(`/api/appointments/available-seniors?scheduled_at=${encodeURIComponent(scheduledAt)}&duration_minutes=${durationMinutes || 30}`),

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
  createBookingLink: (leadId) => request(`/api/leads/${leadId}/booking-link`, { method: 'POST' }),
  getLeadDraft: (id, channel) => request(`/api/leads/${id}/draft?channel=${channel}`),
  updateLeadFlags: (id, flags) => request(`/api/leads/${id}/flags`, { method: 'PATCH', body: JSON.stringify(flags) }),
  updateLeadContact: (id, payload) => request(`/api/leads/${id}/contact`, { method: 'PATCH', body: JSON.stringify(payload) }),
  addLeadNote: (id, body) => request(`/api/leads/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),

  updateMyLocation: (lat, lng) =>
    request('/api/users/me/location', { method: 'PATCH', body: JSON.stringify({ lat, lng }) }),
  disableMyLocation: () => request('/api/users/me/location/disable', { method: 'PATCH' })
};

export { getToken };
