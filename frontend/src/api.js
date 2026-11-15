const API = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function request(path, { body, token, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('Unable to connect to the store. Check your connection and try again.', 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    const message = typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map(error => `${error.loc?.slice(1).join('.') || 'Form'}: ${error.msg}`).join(' ')
      : 'The store could not complete your request. Please try again.';
    throw new ApiError(message, response.status);
  }
  if (!data) throw new ApiError('The store returned an invalid response. Please try again.', response.status);
  return data;
}

export function storedToken() {
  try { return sessionStorage.getItem('court-token') || ''; } catch { return ''; }
}

export function storeToken(token) {
  try {
    if (token) sessionStorage.setItem('court-token', token);
    else sessionStorage.removeItem('court-token');
  } catch { /* The current in-memory session still works if storage is unavailable. */ }
}
