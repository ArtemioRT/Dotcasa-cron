// ============================================================================
// HTTP — fetch con timeout y reintentos en errores de red / 429 / 5xx
// ============================================================================
import { HTTP_TIMEOUT_MS } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function httpJson(url, { method = 'GET', headers = {}, body, retries = 2, timeout = HTTP_TIMEOUT_MS } = {}) {
  let lastErr;
  for (let intento = 0; intento <= retries; intento++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        method,
        headers: { accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 300)}`);
        lastErr.status = res.status;
        await sleep(800 * (intento + 1) ** 2);
        continue;
      }
      if (!res.ok) {
        const err = new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 300)}`);
        err.status = res.status;
        throw err;
      }
      try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
    } catch (e) {
      if (e.status && e.status < 500 && e.status !== 429) throw e;
      lastErr = e.name === 'AbortError' ? new Error(`${method} ${url} → timeout`) : e;
      await sleep(800 * (intento + 1) ** 2);
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

// Corre fn sobre items con un máximo de `n` a la vez
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
