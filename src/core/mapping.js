// ============================================================================
// MAPEO COMÚN — reglas de DotCasa que comparten todos los proveedores
// ============================================================================

// Estatus externos (vocabulario EasyBroker) → estatus DotCasa
export const ESTATUS = {
  published: 'Activo',
  not_published: 'Borrador',
  reserved: 'En pausa',
  suspended: 'En pausa',
  flagged: 'En pausa',
  disapproved: 'En pausa',
  sold: 'Finalizado',
  rented: 'Finalizado',
  eliminada: 'Finalizado',
};
export const estatusDotcasa = (s) => ESTATUS[s] ?? 'Borrador';

// Abreviaturas de estados → nombre completo (más largas primero)
const ESTADOS = [
  ['Distrito Federal', 'Ciudad de México'], ['CDMX', 'Ciudad de México'], ['D.F.', 'Ciudad de México'],
  ['Edo. Mex.', 'Estado de México'], ['Edo. de México', 'Estado de México'],
  ['B.C.S.', 'Baja California Sur'], ['B.C.', 'Baja California'],
  ['N.L.', 'Nuevo León'], ['Jal.', 'Jalisco'], ['Coah.', 'Coahuila'], ['Tamps.', 'Tamaulipas'],
  ['Q. Roo', 'Quintana Roo'], ['Qro.', 'Querétaro'], ['Gto.', 'Guanajuato'], ['S.L.P.', 'San Luis Potosí'],
  ['Chih.', 'Chihuahua'], ['Ver.', 'Veracruz'], ['Pue.', 'Puebla'], ['Yuc.', 'Yucatán'],
  ['Mich.', 'Michoacán'], ['Sin.', 'Sinaloa'], ['Son.', 'Sonora'], ['Ags.', 'Aguascalientes'],
];
export function estadoCompleto(s) {
  const v = texto(s);
  if (!v) return null;
  const hit = ESTADOS.find(([abrev]) => v === abrev);
  return hit ? hit[1] : v;
}

// Antigüedad = año actual - año de construcción (2026 → 0). Sin año → null.
export function antiguedad(valor, hoy = new Date()) {
  const m = String(valor ?? '').match(/\d{4}/);
  const anio = m ? Number(m[0]) : 0;
  if (anio <= 1800) return null;
  return Math.max(0, hoy.getFullYear() - anio);
}

export function texto(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Primer número positivo dentro de un texto ("$1,500 MXN" → 1500)
export function montoDeTexto(v) {
  if (typeof v === 'number') return v > 0 ? v : null;
  const limpio = String(v ?? '').replace(/,/g, '');
  const m = limpio.match(/[0-9]+(\.[0-9]+)?/);
  const n = m ? Number(m[0]) : null;
  return n && n > 0 ? n : null;
}

// Mismo formato que Fotos_Externo_Firma en Bubble: "url1","url2"
export function firmaFotos(urls) {
  const lista = (urls || []).filter(Boolean).slice(0, 50).map((u) => String(u).replace(/"/g, ''));
  return lista.length ? lista.map((u) => `"${u}"`).join(',') : null;
}

// Campos que viajan a Bubble. Todo proveedor devuelve exactamente esta forma.
export const CAMPOS = [
  'public_id', 'status', 'estatus', 'updated_at',
  'descripcion', 'tipo_inmueble', 'operacion', 'precio', 'precio_renta', 'moneda',
  'recamaras', 'banos', 'medios_banos', 'm2_construccion', 'm2_terreno', 'pisos',
  'latitud', 'longitud', 'cp', 'colonia', 'ciudad', 'estado', 'tour',
  'antiguedad', 'mantenimiento', 'mantenimiento_periodo', 'mantenimiento_descripcion', 'fotos',
];

export function normalizar(p) {
  const out = {};
  for (const c of CAMPOS) out[c] = p[c] === undefined ? null : p[c];
  if (out.mantenimiento) out.mantenimiento_periodo = 'Mensual';
  else out.mantenimiento_periodo = null;
  return out;
}
