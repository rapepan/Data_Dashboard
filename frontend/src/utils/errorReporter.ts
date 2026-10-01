import { API_BASE } from '../services/apiClient';

const DEDUPE_MS = 30_000;
const lastSent = new Map<string, number>();

export function reportClientError(error: unknown) {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error ?? 'unknown'));
  const message = `${err.name}: ${err.message}`.slice(0, 300);
  const now = Date.now();
  if (now - (lastSent.get(message) ?? 0) < DEDUPE_MS) return;
  lastSent.set(message, now);

  fetch(`${API_BASE}/client-error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Background': '1' },
    credentials: 'include',
    keepalive: true,
    body: JSON.stringify({ message, stack: err.stack?.slice(0, 2000), page: window.location.pathname }),
  }).catch(() => undefined);
}

export function installErrorReporter() {
  window.addEventListener('error', event => {
    if (event.error) reportClientError(event.error);
  });
  window.addEventListener('unhandledrejection', event => reportClientError(event.reason));
}
