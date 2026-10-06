const KEY = 'broasteria_token';

export function getToken() {
  return localStorage.getItem(KEY);
}

export function setToken(t) {
  localStorage.setItem(KEY, t);
}

export function clearToken() {
  localStorage.removeItem(KEY);
}

export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    throw new Error('Sesion expirada, entra con tu PIN');
  }

  const texto = await res.text();
  let data = null;
  try { data = texto ? JSON.parse(texto) : null; } catch { data = { raw: texto }; }

  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data;
}

export const money = (n) => `S/${Number(n || 0).toFixed(2)}`;

export const fechaCorta = (f) => {
  const d = new Date(f);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export const hoy = () => new Date().toISOString().slice(0, 10);

export function haceDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
