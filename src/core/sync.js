// ============================================================================
// SYNC — una corrida completa
//
// Por cada key:
//   1. lista ligera del proveedor (id, updated_at, estatus)
//   2. compara contra el estado guardado → solo lo nuevo o lo que cambió
//   3. pide el detalle de esos, los mapea y, si el contenido cambió, los manda
//      a Bubble (int_upsert_propiedad)
//   4. lo que ya no viene en la lista se manda como Finalizado
//
// Modos:
//   seed → guarda el estado sin llamar a Bubble (para el corte desde el sync
//          viejo, cuando Bubble ya tiene todo al día)
//   dry  → no escribe nada; solo regresa lo que haría
// ============================================================================
import { PROVEEDORES } from '../providers/index.js';
import * as bubbleDefault from './bubble.js';
import * as stateDefault from './state.js';
import { pool } from '../shared/http.js';
import { CONCURRENCY } from '../shared/config.js';
import { logger } from '../shared/logger.js';

const sinFecha = ({ updated_at, ...resto }) => resto;

export async function sincronizarKey(k, { seed = false, dry = false, hoy = new Date(), bubble = bubbleDefault, state = stateDefault, proveedores = PROVEEDORES } = {}) {
  const prov = proveedores[k.proveedor];
  const stats = { key: k.id, proveedor: k.proveedor, listadas: 0, revisadas: 0, enviadas: 0, sinCambio: 0, cerradas: 0, errores: 0, cambios: [] };
  if (!prov) { stats.errores++; stats.error = `Proveedor desconocido: ${k.proveedor}`; return stats; }

  const estado = await state.leer(k.id);
  const lista = await prov.listar(k.key);       // si falla, no se cierra nada
  stats.listadas = lista.length;
  const year = hoy.getFullYear();
  const ids = new Set(lista.map((i) => i.id));

  const candidatos = lista.filter((it) => {
    const s = estado[it.id];
    return !s || s.u !== it.updatedAt || s.s !== it.status || s.y !== year;
  });
  stats.revisadas = candidatos.length;

  await pool(candidatos, CONCURRENCY, async (it) => {
    try {
      const payload = await prov.detalle(k.key, it, hoy);
      const h = state.hash(sinFecha(payload));
      const nuevo = { u: it.updatedAt, s: it.status, h, y: year };
      if (estado[it.id]?.h === h) { estado[it.id] = nuevo; stats.sinCambio++; return; }
      stats.cambios.push({ id: it.id, estatus: payload.estatus, nueva: !estado[it.id] });
      if (dry) return;
      if (!seed) await bubble.upsert(k.id, k.proveedor, payload);
      estado[it.id] = nuevo;
      stats.enviadas++;
    } catch (e) {
      stats.errores++;
      logger.error('Error en propiedad', { key: k.id, id: it.id, error: e.message });
    }
  });

  const faltantes = Object.keys(estado).filter((id) => !ids.has(id));
  if (lista.length === 0 && faltantes.length > 0) {
    // Una lista vacía con propiedades guardadas casi siempre es una key revocada
    // o una falla del proveedor; no se cierra nada para no dar de baja todo.
    logger.warn('Lista vacía: no se cierran propiedades', { key: k.id, guardadas: faltantes.length });
  } else {
    await pool(faltantes, CONCURRENCY, async (id) => {
      try {
        stats.cambios.push({ id, estatus: 'Finalizado', baja: true });
        if (dry) return;
        if (!seed) {
          await bubble.upsert(k.id, k.proveedor, { public_id: id, status: 'eliminada', estatus: 'Finalizado' }, { soloEstatus: true });
        }
        delete estado[id];
        stats.cerradas++;
      } catch (e) {
        stats.errores++;
        logger.error('Error al cerrar propiedad', { key: k.id, id, error: e.message });
      }
    });
  }

  if (!dry) await state.guardar(k.id, estado);
  return stats;
}

export async function sincronizar({ seed = false, dry = false, soloKey = null, hoy = new Date(), bubble = bubbleDefault, state = stateDefault, proveedores = PROVEEDORES } = {}) {
  const inicio = Date.now();
  if (!dry && !(await state.tomarLock())) return { ok: false, motivo: 'Otra corrida sigue en proceso' };
  try {
    const keys = (await bubble.obtenerKeys()).filter((k) => !soloKey || k.id === soloKey);
    const resultados = [];
    for (const k of keys) {
      try {
        resultados.push(await sincronizarKey(k, { seed, dry, hoy, bubble, state, proveedores }));
      } catch (e) {
        logger.error('Error en key', { key: k.id, proveedor: k.proveedor, error: e.message });
        resultados.push({ key: k.id, proveedor: k.proveedor, errores: 1, error: e.message });
      }
    }
    const resumen = {
      ok: true, modo: dry ? 'dry' : seed ? 'seed' : 'normal', ms: Date.now() - inicio, keys: keys.length,
      enviadas: resultados.reduce((a, r) => a + (r.enviadas || 0), 0),
      cerradas: resultados.reduce((a, r) => a + (r.cerradas || 0), 0),
      errores: resultados.reduce((a, r) => a + (r.errores || 0), 0),
      resultados,
    };
    logger.info('Sync terminado', { ...resumen, resultados: undefined });
    return resumen;
  } finally {
    if (!dry) await state.soltarLock();
  }
}
