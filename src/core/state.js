// ============================================================================
// ESTADO — lo último que se mandó a Bubble, un JSON por key en GCS.
//   { "<id externo>": { u: updated_at, s: status, h: hash del payload, y: año } }
// Permite saber qué cambió sin consultar Bubble.
// ============================================================================
import crypto from 'crypto';
import { Storage } from '@google-cloud/storage';
import { STATE_BUCKET, STATE_PREFIX, LOCK_TTL_MS } from '../shared/config.js';

let bucket;
const b = () => (bucket ??= new Storage().bucket(STATE_BUCKET));

export const hash = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 20);

export async function leer(keyId) {
  try {
    const [buf] = await b().file(`${STATE_PREFIX}/estado/${keyId}.json`).download();
    return JSON.parse(buf.toString('utf8'));
  } catch (e) {
    if (e.code === 404) return {};
    throw e;
  }
}

export async function guardar(keyId, estado) {
  await b().file(`${STATE_PREFIX}/estado/${keyId}.json`).save(JSON.stringify(estado), {
    contentType: 'application/json', resumable: false,
  });
}

export async function borrar(keyId) {
  await b().file(`${STATE_PREFIX}/estado/${keyId}.json`).delete({ ignoreNotFound: true });
}

// Lock para que dos corridas no se encimen si una tarda más de 5 minutos.
export async function tomarLock() {
  const f = b().file(`${STATE_PREFIX}/sync.lock`);
  try {
    await f.save(String(Date.now()), { preconditionOpts: { ifGenerationMatch: 0 }, resumable: false });
    return true;
  } catch (e) {
    if (e.code !== 412) throw e;
    const [buf] = await f.download().catch(() => [Buffer.from('0')]);
    if (Date.now() - Number(buf.toString()) > LOCK_TTL_MS) {
      await f.delete({ ignoreNotFound: true });
      return tomarLock();
    }
    return false;
  }
}

export async function soltarLock() {
  await b().file(`${STATE_PREFIX}/sync.lock`).delete({ ignoreNotFound: true });
}
