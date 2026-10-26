process.env.NODE_ENV = 'test';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sincronizar } from '../src/core/sync.js';
import { hash } from '../src/core/state.js';
import { parsearKeys } from '../src/core/bubble.js';

const HOY = new Date('2026-10-25T12:00:00Z');

function escenario({ lista, estadoInicial = {}, falla = null }) {
  const store = { k1: structuredClone(estadoInicial) };
  const llamadas = [];
  const detalles = [];
  const proveedores = {
    EasyBroker: {
      listar: async () => { if (falla) throw new Error(falla); return lista; },
      detalle: async (_k, it) => { detalles.push(it.id); return { public_id: it.id, status: it.status, estatus: it.status === 'sold' ? 'Finalizado' : 'Activo', updated_at: it.updatedAt, precio: it.precio ?? 100 }; },
    },
  };
  const bubble = {
    obtenerKeys: async () => [{ id: 'k1', key: 'secreta', proveedor: 'EasyBroker' }],
    upsert: async (keyId, prov, payload, opts) => { llamadas.push({ keyId, payload, opts }); return { status: 'success' }; },
  };
  const state = {
    hash, leer: async (id) => structuredClone(store[id] || {}), guardar: async (id, e) => { store[id] = e; },
    tomarLock: async () => true, soltarLock: async () => {},
  };
  return { store, llamadas, detalles, run: (o = {}) => sincronizar({ hoy: HOY, bubble, state, proveedores, ...o }) };
}

test('primera corrida: manda todo a Bubble y guarda estado', async () => {
  const s = escenario({ lista: [{ id: 'EB-1', updatedAt: 'a', status: 'published' }, { id: 'EB-2', updatedAt: 'b', status: 'published' }] });
  const r = await s.run();
  assert.equal(r.enviadas, 2);
  assert.equal(s.llamadas.length, 2);
  assert.deepEqual(Object.keys(s.store.k1).sort(), ['EB-1', 'EB-2']);
});

test('segunda corrida sin cambios: no pide detalle ni llama a Bubble', async () => {
  const s = escenario({ lista: [{ id: 'EB-1', updatedAt: 'a', status: 'published' }] });
  await s.run();
  s.llamadas.length = 0; s.detalles.length = 0;
  const r = await s.run();
  assert.equal(r.enviadas, 0);
  assert.equal(s.detalles.length, 0);
  assert.equal(s.llamadas.length, 0);
});

test('cambia el estatus: solo esa propiedad va a Bubble', async () => {
  const s = escenario({ lista: [{ id: 'EB-1', updatedAt: 'a', status: 'published' }, { id: 'EB-2', updatedAt: 'b', status: 'published' }] });
  await s.run();
  s.llamadas.length = 0;
  s.store.k1; // estado guardado
  const s2lista = [{ id: 'EB-1', updatedAt: 'a2', status: 'sold' }, { id: 'EB-2', updatedAt: 'b', status: 'published' }];
  const s2 = escenario({ lista: s2lista, estadoInicial: s.store.k1 });
  const r = await s2.run();
  assert.equal(r.enviadas, 1);
  assert.equal(s2.llamadas[0].payload.public_id, 'EB-1');
  assert.equal(s2.llamadas[0].payload.estatus, 'Finalizado');
});

test('cambia solo updated_at con el mismo contenido: no va a Bubble', async () => {
  const s = escenario({ lista: [{ id: 'EB-1', updatedAt: 'a', status: 'published' }] });
  await s.run();
  const s2 = escenario({ lista: [{ id: 'EB-1', updatedAt: 'a-nueva', status: 'published' }], estadoInicial: s.store.k1 });
  const r = await s2.run();
  assert.equal(r.enviadas, 0);
  assert.equal(s2.detalles.length, 1);
  assert.equal(s2.store.k1['EB-1'].u, 'a-nueva');
});

test('desaparece del proveedor: se manda como Finalizado y sale del estado', async () => {
  const s = escenario({ lista: [{ id: 'EB-1', updatedAt: 'a', status: 'published' }, { id: 'EB-2', updatedAt: 'b', status: 'published' }] });
  await s.run();
  const s2 = escenario({ lista: [{ id: 'EB-1', updatedAt: 'a', status: 'published' }], estadoInicial: s.store.k1 });
  const r = await s2.run();
  assert.equal(r.cerradas, 1);
  assert.equal(s2.llamadas[0].payload.public_id, 'EB-2');
  assert.equal(s2.llamadas[0].payload.estatus, 'Finalizado');
  assert.equal(s2.llamadas[0].opts.soloEstatus, true);
  assert.equal(s2.store.k1['EB-2'], undefined);
});

test('lista vacía con propiedades guardadas: no cierra nada', async () => {
  const s = escenario({ lista: [], estadoInicial: { 'EB-1': { u: 'a', s: 'published', h: 'x', y: 2026 } } });
  const r = await s.run();
  assert.equal(r.cerradas, 0);
  assert.equal(s.llamadas.length, 0);
});

test('el proveedor falla: no se cierra nada y se reporta el error', async () => {
  const s = escenario({ lista: [], estadoInicial: { 'EB-1': { u: 'a', s: 'published', h: 'x', y: 2026 } }, falla: '401 key inválida' });
  const r = await s.run();
  assert.equal(r.errores, 1);
  assert.equal(s.llamadas.length, 0);
  assert.ok(s.store.k1['EB-1']);
});

test('seed: guarda estado sin llamar a Bubble', async () => {
  const s = escenario({ lista: [{ id: 'EB-1', updatedAt: 'a', status: 'published' }] });
  const r = await s.run({ seed: true });
  assert.equal(s.llamadas.length, 0);
  assert.ok(s.store.k1['EB-1']);
  assert.equal(r.modo, 'seed');
});

test('dry: no escribe nada', async () => {
  const s = escenario({ lista: [{ id: 'EB-1', updatedAt: 'a', status: 'published' }] });
  const r = await s.run({ dry: true });
  assert.equal(s.llamadas.length, 0);
  assert.deepEqual(s.store.k1, {});
  assert.equal(r.resultados[0].cambios.length, 1);
});

test('cambio de año: vuelve a revisar para recalcular la antigüedad', async () => {
  const s = escenario({ lista: [{ id: 'EB-1', updatedAt: 'a', status: 'published' }], estadoInicial: { 'EB-1': { u: 'a', s: 'published', h: 'viejo', y: 2025 } } });
  await s.run();
  assert.equal(s.detalles.length, 1);
});

test('Bubble falla en una propiedad: no se guarda su estado (se reintenta)', async () => {
  const s = escenario({ lista: [{ id: 'EB-1', updatedAt: 'a', status: 'published' }] });
  const bubbleMalo = { obtenerKeys: async () => [{ id: 'k1', key: 'x', proveedor: 'EasyBroker' }], upsert: async () => { throw new Error('500'); } };
  const r = await s.run({ bubble: bubbleMalo });
  assert.equal(r.errores, 1);
  assert.equal(s.store.k1['EB-1'], undefined);
});

test('parsea la respuesta de keys de Bubble', () => {
  assert.deepEqual(parsearKeys('{"id":"1","key":"a","proveedor":"EasyBroker"},{"id":"2","key":"b","proveedor":"Nocnok"}').length, 2);
  assert.deepEqual(parsearKeys(''), []);
});
