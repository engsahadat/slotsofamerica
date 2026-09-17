import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  withCredentials: true,
});

// A stable per-browser identifier, generated once and reused — sent as X-Device-Id on every
// request so any endpoint that wants it (currently: FAST Payment's optional device_id field,
// which providers can factor into fraud/risk scoring) has it available without each feature
// needing its own generation logic. Never a substitute for real device fingerprinting; just a
// consistent value that's better than sending nothing at all. Falls back to a timestamp+random
// string on browsers without crypto.randomUUID(), and never throws if localStorage is blocked
// (private browsing, cookies disabled) — a request without this header is still fine, since the
// field is documented optional everywhere it's used.
function getOrCreateDeviceId(): string | null {
  try {
    const key = 'device_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const deviceId = getOrCreateDeviceId();
  if (deviceId) {
    config.headers['X-Device-Id'] = deviceId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
