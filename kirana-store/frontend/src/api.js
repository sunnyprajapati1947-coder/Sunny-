import axios from 'axios';
import { io } from 'socket.io-client';

// Server base URL priority: in-app saved server (APK/PWA runtime config) >
// VITE_API_URL build env > same-origin '/api' (dev proxy / single-host deploy).
export const getApiBase = () => localStorage.getItem('rk_api_base') || import.meta.env.VITE_API_URL || '/api';
export const api = axios.create({ baseURL: getApiBase(), timeout: 20000 });

export function setApiBase(url) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  if (!base || base === '/api') localStorage.removeItem('rk_api_base');
  else localStorage.setItem('rk_api_base', base);
  api.defaults.baseURL = base || '/api';
  reconnectSocket();
}

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('rk_token');
  if (t) cfg.headers.Authorization = 'Bearer ' + t;
  const pt = sessionStorage.getItem('rk_price_token');
  if (pt) cfg.headers['X-Price-Token'] = pt;
  return cfg;
});
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !location.pathname.startsWith('/login') && !location.pathname.startsWith('/shop')) {
      localStorage.removeItem('rk_token');
      location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export let socket = io(getApiBase().startsWith('http') ? new URL(getApiBase()).origin : undefined, { autoConnect: true });
export function reconnectSocket() {
  try { socket.close(); } catch { /* noop */ }
  socket = io(getApiBase().startsWith('http') ? new URL(getApiBase()).origin : undefined, { autoConnect: true });
}
export const errMsg = (e) => e?.response?.data?.error || e?.message || 'Something went wrong';
