process.env.NODE_ENV = 'test';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { antiguedad, montoDeTexto, estadoCompleto, firmaFotos } from '../src/core/mapping.js';
import * as eb from '../src/providers/easybroker.js';
import * as nk from '../src/providers/nocnok.js';

const HOY = new Date('2026-10-25T12:00:00Z');

test('antigüedad = año actual - año; vacío si no hay año', () => {
  assert.equal(antiguedad('2026', HOY), 0);
  assert.equal(antiguedad(2020, HOY), 6);
  assert.equal(antiguedad('Construida en 2015', HOY), 11);
  assert.equal(antiguedad('2030', HOY), 0);
  assert.equal(antiguedad(null, HOY), null);
  assert.equal(antiguedad('', HOY), null);
  assert.equal(antiguedad('5', HOY), null);
});

test('montos, estados y firma de fotos', () => {
  assert.equal(montoDeTexto('$1,500 MXN'), 1500);
  assert.equal(montoDeTexto('0'), null);
  assert.equal(estadoCompleto('N.L.'), 'Nuevo León');
  assert.equal(estadoCompleto('Sin.'), 'Sinaloa');
  assert.equal(estadoCompleto('Jalisco'), 'Jalisco');
  assert.equal(firmaFotos(['https://a/1.jpg', 'https://a/2.jpg']), '"https://a/1.jpg","https://a/2.jpg"');
  assert.equal(firmaFotos([]), null);
});

test('EasyBroker: detalle → formato DotCasa', () => {
  const p = {
    description: 'Prueba prueba prueba', bedrooms: 2, bathrooms: 1, half_bathrooms: 2,
    lot_size: 950, construction_size: 900, floors: 2, age: '2020',
    maintenance_amount: '800', expenses: 'Incluye vigilancia',
    property_type: 'Casa en condominio', virtual_tour: null,
    location: { name: '6 de Mayo, Guasave, Sin.', latitude: 25.49, longitude: -108.24, postal_code: '81480' },
    operations: [{ type: 'sale', amount: 800000, currency: 'MXN' }, { type: 'rental', amount: 9000, currency: 'MXN' }],
    property_images: [{ url: 'https://assets.easybroker.com/1.jpg' }, { url: 'https://assets.easybroker.com/2.jpg' }],
  };
  const r = eb.mapear(p, { id: 'EB-XH8071', status: 'sold', updatedAt: '2026-10-23T09:33:39-06:00' }, HOY);
  assert.equal(r.estatus, 'Finalizado');
  assert.equal(r.tipo_inmueble, 'Casa');
  assert.equal(r.operacion, 'Venta');
  assert.equal(r.precio, 800000);
  assert.equal(r.precio_renta, 9000);
  assert.equal(r.colonia, '6 de Mayo');
  assert.equal(r.ciudad, 'Guasave');
  assert.equal(r.estado, 'Sinaloa');
  assert.equal(r.antiguedad, 6);
  assert.equal(r.mantenimiento, 800);
  assert.equal(r.mantenimiento_periodo, 'Mensual');
  assert.equal(r.mantenimiento_descripcion, 'Incluye vigilancia');
  assert.equal(r.fotos, '"https://assets.easybroker.com/1.jpg","https://assets.easybroker.com/2.jpg"');
});

test('EasyBroker: sin año ni mantenimiento → vacíos', () => {
  const r = eb.mapear({ location: { name: 'Centro, Monterrey, N.L.' }, operations: [] }, { id: 'EB-1', status: 'published' }, HOY);
  assert.equal(r.estatus, 'Activo');
  assert.equal(r.antiguedad, null);
  assert.equal(r.mantenimiento, null);
  assert.equal(r.mantenimiento_periodo, null);
  assert.equal(r.estado, 'Nuevo León');
});

test('Nocnok: registro → formato DotCasa', () => {
  const p = {
    code: 'NK-77', lastUpdatedAt: '2026-10-20T10:00:00Z', type: 'Warehouse', category: 'Industrial',
    isSale: false, isRent: true, rentPrice: 115000, currencyCode: 'MXN', bedrooms: 0,
    bathrooms: 4, halfBathrooms: 0, constructionSize: 1000, lotSize: 1100, levels: 1,
    geolocation: { lat: 25.71, lon: -100.47 }, postalCode: '66367', settlement: 'Parque industrial 300',
    municipality: 'Santa Catarina', state: 'Nuevo León', yearBuilt: 2026, maintenanceFee: 2500,
    pictureUrls: ['https://n/1.jpg'], description: 'Bodega',
  };
  const r = nk.mapear(p, { id: 'NK-77', status: 'published', updatedAt: p.lastUpdatedAt }, HOY);
  assert.equal(r.tipo_inmueble, 'Bodega industrial');
  assert.equal(r.operacion, 'Renta');
  assert.equal(r.precio, 115000);
  assert.equal(r.banos, 4);
  assert.equal(r.antiguedad, 0);
  assert.equal(r.mantenimiento_periodo, 'Mensual');
  assert.equal(r.estatus, 'Activo');
});
