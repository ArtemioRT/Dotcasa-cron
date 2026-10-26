// ============================================================================
// CONFIGURACIÓN — variables de entorno
// ============================================================================
import 'dotenv/config';

const req = (name) => {
  const v = process.env[name];
  if (!v && process.env.NODE_ENV !== 'test') {
    console.error(`❌ Falta la variable de entorno ${name}`);
    process.exit(1);
  }
  return v;
};

export const PORT = process.env.PORT || 8080;

// Llave que Cloud Scheduler manda en el header x-api-key
export const SYNC_API_KEY = req('SYNC_API_KEY');

// Workflow API de Bubble, sin la barra final. Ejemplos:
//   test: https://app.dotcasa.com.mx/version-test/api/1.1/wf
//   live: https://app.dotcasa.com.mx/api/1.1/wf
export const BUBBLE_WF_URL = (req('BUBBLE_WF_URL') || '').replace(/\/+$/, '');
export const BUBBLE_API_TOKEN = req('BUBBLE_API_TOKEN');

// Bucket donde se guarda el estado de la última corrida (un JSON por key)
export const STATE_BUCKET = req('STATE_BUCKET');
export const STATE_PREFIX = process.env.STATE_PREFIX || 'integraciones';

// Cuántas propiedades se procesan en paralelo hacia Bubble / proveedores
export const CONCURRENCY = Number(process.env.CONCURRENCY || 4);

// Un lock más viejo que esto se considera abandonado (corrida que murió)
export const LOCK_TTL_MS = Number(process.env.LOCK_TTL_MS || 20 * 60 * 1000);

export const HTTP_TIMEOUT_MS = 30_000;
