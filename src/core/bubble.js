// ============================================================================
// BUBBLE — los dos únicos endpoints que usa el servicio
//   int_api_keys          → lista de keys a sincronizar
//   int_upsert_propiedad  → guarda una propiedad ya mapeada
// ============================================================================
import { BUBBLE_WF_URL, BUBBLE_API_TOKEN } from '../shared/config.js';
import { httpJson } from '../shared/http.js';

const auth = () => ({ Authorization: `Bearer ${BUBBLE_API_TOKEN}` });

// Bubble regresa { status, response: { keys: '{"id":..},{"id":..}' } }
export function parsearKeys(raw) {
  if (Array.isArray(raw)) return raw;
  const s = String(raw ?? '').trim();
  if (!s) return [];
  return JSON.parse(s.startsWith('[') ? s : `[${s}]`);
}

export async function obtenerKeys() {
  const j = await httpJson(`${BUBBLE_WF_URL}/int_api_keys`, { method: 'POST', headers: auth(), body: {} });
  return parsearKeys(j?.response?.keys).filter((k) => k && k.id && k.key && k.proveedor);
}

// Manda solo los campos con valor; Bubble deja vacío lo que no llega.
export async function upsert(keyId, proveedor, payload, { soloEstatus = false } = {}) {
  const body = { key: keyId, proveedor, solo_estatus: soloEstatus };
  for (const [k, v] of Object.entries(payload)) if (v !== null && v !== undefined) body[k] = v;
  return httpJson(`${BUBBLE_WF_URL}/int_upsert_propiedad`, { method: 'POST', headers: auth(), body, retries: 3 });
}
