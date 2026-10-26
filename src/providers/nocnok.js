// ============================================================================
// NOCNOK — búsqueda paginada; cada registro ya trae todos los datos.
// La API solo regresa propiedades publicadas.
// ============================================================================
import { httpJson } from '../shared/http.js';
import { texto, numero, antiguedad, firmaFotos, estatusDotcasa, normalizar } from '../core/mapping.js';

const API = 'https://api.nocnok.com/v1/sites/properties/search';

const TIPOS = {
  House: 'Casa', Apartment: 'Departamento', Land: 'Terreno', Ranch: 'Rancho', CountryHouse: 'Quinta',
  Warehouse: 'Bodega Comercial', Shop: 'Local Comercial', MedicalOffice: 'Oficina', Office: 'Oficina',
  Building: 'Edificio', Hotel: 'Edificio', IndustrialWarehouse: 'Nave Industrial',
};

// Devuelve [{ id, updatedAt, status, raw }] de todas las páginas.
export async function listar(key) {
  const out = [];
  for (let page = 1; page < 1000; page++) {
    const j = await httpJson(API, {
      method: 'POST',
      headers: { 'x-api-key': key },
      body: { pageNumber: page, pageSize: 100, sortBy: 'LastModifiedAt', sortDirection: 'Descending' },
    });
    if (j && j.success === false) throw new Error('Nocnok search: ' + JSON.stringify(j).slice(0, 300));
    const d = j?.data || {};
    const items = Array.isArray(d.items) ? d.items : [];
    for (const p of items) {
      if (p.code) out.push({ id: String(p.code), updatedAt: p.lastUpdatedAt ?? null, status: 'published', raw: p });
    }
    const pageCount = Number(d.pageCount) || 0;
    if (!items.length || page >= pageCount) break;
  }
  return out;
}

export async function detalle(_key, item, hoy = new Date()) {
  return mapear(item.raw, item, hoy);
}

export function mapear(p, item, hoy = new Date()) {
  let tipo = TIPOS[p.type] || texto(p.type);
  if (p.type === 'Warehouse' && p.category === 'Industrial') tipo = 'Bodega industrial';

  let operacion = null, precio = null, renta = null;
  if (p.isSale || p.isForeclosure) {
    operacion = 'Venta';
    precio = p.isSale ? p.salePrice : p.foreclosurePrice;
    if (p.isRent) renta = p.rentPrice;
  } else if (p.isRent) { operacion = 'Renta'; precio = p.rentPrice; }
  else if (p.isLodging) { operacion = 'Renta'; precio = p.lodgingPrice; }

  const banos = p.fullBathrooms ?? Math.max(0, (Number(p.bathrooms) || 0) - (Number(p.halfBathrooms) || 0));
  const lat = numero(p.geolocation?.lat), lon = numero(p.geolocation?.lon);
  const fee = numero(p.maintenanceFee);

  return normalizar({
    public_id: item.id,
    status: item.status,
    estatus: estatusDotcasa(item.status),
    updated_at: item.updatedAt,
    descripcion: texto(p.description || p.title),
    tipo_inmueble: tipo,
    operacion,
    precio: numero(precio),
    precio_renta: numero(renta),
    moneda: texto(p.currencyCode) || 'MXN',
    recamaras: numero(p.bedrooms),
    banos: numero(banos),
    medios_banos: numero(p.halfBathrooms),
    m2_construccion: numero(p.constructionSize),
    m2_terreno: numero(p.lotSize),
    pisos: numero(p.levels),
    latitud: lat || null,
    longitud: lon || null,
    cp: texto(p.postalCode),
    colonia: texto(p.settlement),
    ciudad: texto(p.municipality),
    estado: texto(p.state),
    tour: texto(p.virtualTourUrl),
    antiguedad: antiguedad(p.yearBuilt, hoy),
    mantenimiento: fee && fee > 0 ? fee : null,
    mantenimiento_descripcion: null,
    fotos: firmaFotos(p.pictureUrls),
  });
}
