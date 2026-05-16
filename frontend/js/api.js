// ═══════════════════════════════════════════════════
//  TransportFlow — API Client
//  All fetch calls to the backend REST API
// ═══════════════════════════════════════════════════

const API_BASE = '/api';

// ── Token helpers ────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('tf_token'),
  setToken: (t) => localStorage.setItem('tf_token', t),
  getUser:  () => JSON.parse(localStorage.getItem('tf_user') || 'null'),
  setUser:  (u) => localStorage.setItem('tf_user', JSON.stringify(u)),
  clear:    () => { localStorage.removeItem('tf_token'); localStorage.removeItem('tf_user'); },
  isLoggedIn: () => !!localStorage.getItem('tf_token'),
};

// ── Core fetch wrapper ───────────────────────────────
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

// ── Auth API ─────────────────────────────────────────
const AuthAPI = {
  login:    (email, password) => apiFetch('/auth/login',    { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (payload)         => apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  me:       ()                => apiFetch('/auth/me'),
  updateProfile: (payload)    => apiFetch('/auth/profile',  { method: 'PUT',  body: JSON.stringify(payload) }),
};

// ── Requests API ─────────────────────────────────────
const RequestsAPI = {
  getAll:       ()        => apiFetch('/requests'),
  getOne:       (id)      => apiFetch(`/requests/${id}`),
  create:       (payload) => apiFetch('/requests',           { method: 'POST', body: JSON.stringify(payload) }),
  updateStatus: (id, status) => apiFetch(`/requests/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  delete:       (id)      => apiFetch(`/requests/${id}`,    { method: 'DELETE' }),
};

// ── Messages API ─────────────────────────────────────
const MessagesAPI = {
  getConversations: ()       => apiFetch('/messages'),
  getThread:        (userId) => apiFetch(`/messages/${userId}`),
  send:             (payload)=> apiFetch('/messages',        { method: 'POST', body: JSON.stringify(payload) }),
};

// ── Admin API ────────────────────────────────────────
const AdminAPI = {
  getStats:    ()      => apiFetch('/admin/stats'),
  getUsers:    ()      => apiFetch('/admin/users'),
  updateUser:  (id, p) => apiFetch(`/admin/users/${id}`, { method: 'PUT',    body: JSON.stringify(p) }),
  deleteUser:  (id)    => apiFetch(`/admin/users/${id}`, { method: 'DELETE' }),
  getRequests: ()      => apiFetch('/admin/requests'),
};
