// ============================================================================
// REGISTRO DE PROVEEDORES — para agregar uno nuevo:
//   1. crea src/providers/<nombre>.js con listar(key) y detalle(key, item)
//   2. regístralo aquí con el mismo texto que va en Api_keys.Proveedor
// ============================================================================
import * as easybroker from './easybroker.js';
import * as nocnok from './nocnok.js';

export const PROVEEDORES = {
  EasyBroker: easybroker,
  Nocnok: nocnok,
};
