// ============================================================================
// DOTCASA-INTEGRACIONES — sync unidireccional EasyBroker/Nocnok → Bubble
// Lo dispara Cloud Scheduler cada 5 minutos con POST /sync.
// ============================================================================
import { logger } from './src/shared/logger.js';
import crypto from 'crypto';
import express from 'express';
import { PORT, SYNC_API_KEY } from './src/shared/config.js';
import { sincronizar } from './src/core/sync.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const autorizado = (req) => {
  const k = String(req.get('x-api-key') || '');
  return k.length === SYNC_API_KEY.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(SYNC_API_KEY));
};

// POST /sync            corrida normal
// POST /sync?seed=1     guarda estado sin llamar a Bubble (corte inicial)
// POST /sync?dry=1      no escribe nada; regresa lo que cambiaría
// POST /sync?key=<id>   solo esa key de Api_keys
app.post('/sync', async (req, res, next) => {
  if (!autorizado(req)) return res.status(401).json({ error: 'No autorizado' });
  try {
    const r = await sincronizar({
      seed: req.query.seed === '1',
      dry: req.query.dry === '1',
      soloKey: req.query.key || null,
    });
    res.status(r.ok ? 200 : 409).json(r);
  } catch (e) { next(e); }
});

app.get('/health', (req, res) => res.json({ service: 'dotcasa-integraciones', status: 'ok' }));

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada', path: req.path }));
app.use((err, req, res, next) => {
  logger.error('Error no controlado', { path: req.path, error: err.message, stack: err.stack });
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error interno del servidor', message: err.message });
});

process.on('unhandledRejection', (r) => logger.error('unhandledRejection', { error: r?.message || String(r) }));

app.listen(PORT, '0.0.0.0', () => logger.info(`dotcasa-integraciones en puerto ${PORT}`));
