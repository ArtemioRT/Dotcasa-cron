// ============================================================================
// EASYBROKER — listado ligero (estatus + updated_at) y detalle por propiedad
// Docs: https://dev.easybroker.com/reference/get_listing-statuses
// ============================================================================
import { httpJson } from '../shared/http.js';
import { texto, numero, montoDeTexto, antiguedad, estadoCompleto, firmaFotos, estatusDotcasa, normalizar } from '../core/mapping.js';

const API = 'https://api.easybroker.com/v1';

const TIPOS = {
  'Casa en condominio': 'Casa', 'Casa de campo': 'Quinta', 'Villa': 'Casa',
  'Local en centro comercial': 'Local Comercial', 'Local comercial': 'Local Comercial',
  'Bodega comercial': 'Bodega Comercial', 'Nave industrial': 'Nave Industrial',
  'Terreno comercial': 'Terreno', 'Terreno industrial': 'Terreno', 'Terreno habitacional': 'Terreno',
  'Huerta': 'Rancho', 'Granja': 'Rancho',
  'Desarrollo vertical': 'Departamento', 'Desarrollo horizontal': 'Casa',
  'Penthouse': 'Departamento', 'Loft': 'Departamento', 'Dúplex': 'Departamento', 'Duplex': 'Departamento',
  'Consultorio': 'Oficina',
};
const OPERACION = { sale: 'Venta', rental: 'Renta', temporary_rental: 'Renta' };

const headers = (key) => ({ 'X-Authorization': key });

// Devuelve [{ id, updatedAt, status }] de todas las páginas.
export async function listar(key) {
  const out = [];
  for (let page = 1; page < 1000; page++) {
    const j = await httpJson(`${API}/listing_statuses?page=${page}&limit=100`, { headers: headers(key) });
    for (const c of j.content || []) {
      if (c.public_id) out.push({ id: c.public_id, updatedAt: c.updated_at ?? null, status: c.status ?? null });
    }
    if (!j.pagination?.next_page || !(j.content || []).length) break;
  }
  return out;
}

// Trae el detalle y lo convierte al formato DotCasa.
export async function detalle(key, item, hoy = new Date()) {
  const p = await httpJson(`${API}/properties/${encodeURIComponent(item.id)}`, { headers: headers(key) });
  return mapear(p, item, hoy);
}

export function mapear(p, item, hoy = new Date()) {
  const ops = Array.isArray(p.operations) ? p.operations : [];
  const op = ops[0] || {};
  const renta = ops.find((o) => o.type === 'rental');
  const partes = String(p.location?.name ?? '').split(', ');
  const tipo = texto(p.property_type);
  const imagenes = (p.property_images || p.images || []).map((i) => i?.url);

  return normalizar({
    public_id: item.id,
    status: item.status,
    estatus: estatusDotcasa(item.status),
    updated_at: item.updatedAt,
    descripcion: texto(p.description),
    tipo_inmueble: tipo ? (TIPOS[tipo] ?? tipo) : null,
    operacion: OPERACION[op.type] ?? texto(op.type),
    precio: numero(op.amount),
    precio_renta: numero(renta?.amount),
    moneda: texto(op.currency),
    recamaras: numero(p.bedrooms),
    banos: numero(p.bathrooms),
    medios_banos: numero(p.half_bathrooms),
    m2_construccion: numero(p.construction_size),
    m2_terreno: numero(p.lot_size),
    pisos: numero(p.floors),
    latitud: numero(p.location?.latitude),
    longitud: numero(p.location?.longitude),
    cp: texto(p.location?.postal_code),
    colonia: texto(partes[0]),
    ciudad: texto(partes[1]),
    estado: estadoCompleto(partes[partes.length - 1]),
    tour: texto(p.virtual_tour),
    antiguedad: antiguedad(p.age, hoy),
    mantenimiento: montoDeTexto(p.maintenance_amount),
    mantenimiento_descripcion: texto(p.expenses),
    fotos: firmaFotos(imagenes),
  });
}

// El listado de EasyBroker trae estatus y fecha; con eso basta para saber
// si hay que pedir el detalle.
export const necesitaDetalle = true;
