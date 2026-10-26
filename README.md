# dotcasa-integraciones

Sincronización **unidireccional** EasyBroker / Nocnok → DotCasa (Bubble).

Cloud Scheduler llama `POST /sync` cada 5 minutos. El servicio:

1. Pide a Bubble las keys (`int_api_keys`).
2. Por cada key lee el listado ligero del proveedor.
3. Compara contra el estado de la corrida anterior (un JSON por key en GCS).
4. Solo para lo nuevo o lo que cambió: pide el detalle, lo mapea y llama
   `int_upsert_propiedad` en Bubble.
5. Lo que ya no viene en el listado se manda como **Finalizado**.

Bubble solo trabaja cuando algo cambió. En una corrida sin cambios hace
1 llamada (las keys) y nada más.

```
src/
  providers/        un archivo por proveedor (listar + detalle → formato DotCasa)
    easybroker.js
    nocnok.js
    index.js        registro; el nombre debe coincidir con Api_keys.Proveedor
  core/
    mapping.js      estatus, estados, antigüedad, mantenimiento, fotos
    sync.js         la corrida
    state.js        estado y lock en GCS
    bubble.js       los dos endpoints de Bubble
test/               npm test (con datos simulados)
```

## Reglas de mapeo

| Campo | Regla |
|---|---|
| Estatus | published → Activo · not_published → Borrador · reserved/suspended/flagged/disapproved → En pausa · sold/rented → Finalizado · ya no existe → Finalizado |
| Antigüedad | año actual − año de construcción (2026 → 0). Sin año → vacío. Se recalcula sola cada enero |
| Mantenimiento | monto > 0 → `Mantenimiento_periodo = Mensual`; sin monto → vacío. EasyBroker `expenses` → `Mantenimiento_descripcion` |
| Estado | abreviaturas a nombre completo (N.L. → Nuevo León, etc.) |
| Fotos | se mandan como firma `"url1","url2"`; Bubble solo reprocesa si cambió |

El límite de publicaciones del plan, el aviso, slug/URL/SEO, fotos y PDF
siguen en Bubble dentro de `int_upsert_propiedad`.

## Variables de entorno

| Variable | Ejemplo |
|---|---|
| `SYNC_API_KEY` | una cadena larga aleatoria; Cloud Scheduler la manda en `x-api-key` |
| `BUBBLE_WF_URL` | test: `https://app.dotcasa.com.mx/version-test/api/1.1/wf` · live: `https://app.dotcasa.com.mx/api/1.1/wf` |
| `BUBBLE_API_TOKEN` | Bubble → Settings → API → API Tokens |
| `STATE_BUCKET` | `dotcasa-integraciones-estado` |
| `STATE_PREFIX` | opcional, `integraciones` (usa `integraciones-test` para test) |
| `CONCURRENCY` | opcional, `4` |

## Despliegue

```bash
PROJECT=<tu-proyecto>
REGION=us-central1
SYNC_KEY=$(openssl rand -hex 24)

# 1. Bucket para el estado
gcloud storage buckets create gs://dotcasa-integraciones-estado --project=$PROJECT --location=$REGION

# 2. Cloud Run (desde esta carpeta)
gcloud run deploy dotcasa-integraciones --source . --project=$PROJECT --region=$REGION \
  --allow-unauthenticated --max-instances=1 --memory=512Mi --timeout=900 \
  --set-env-vars="SYNC_API_KEY=$SYNC_KEY,BUBBLE_WF_URL=https://app.dotcasa.com.mx/version-test/api/1.1/wf,BUBBLE_API_TOKEN=<token>,STATE_BUCKET=dotcasa-integraciones-estado,STATE_PREFIX=integraciones-test"

# 3. Permiso del servicio sobre el bucket
SA=$(gcloud run services describe dotcasa-integraciones --region=$REGION --format='value(spec.template.spec.serviceAccountName)')
gcloud storage buckets add-iam-policy-binding gs://dotcasa-integraciones-estado --member="serviceAccount:$SA" --role=roles/storage.objectAdmin

URL=$(gcloud run services describe dotcasa-integraciones --region=$REGION --format='value(status.url)')
```

`--allow-unauthenticated` solo deja pasar la petición; sin el header
`x-api-key` correcto el servicio responde 401.

## Corte desde el sync viejo de Bubble

```bash
# a) Ver qué haría, sin escribir nada
curl -s -X POST "$URL/sync?dry=1" -H "x-api-key: $SYNC_KEY" | jq '.resultados[] | {proveedor, listadas, cambios: (.cambios|length)}'

# b) Primera corrida real (manda todo una vez a Bubble)
curl -s -X POST "$URL/sync" -H "x-api-key: $SYNC_KEY" | jq '{enviadas, cerradas, errores}'
#    Con muchas propiedades (>200) usa ?seed=1: guarda el estado sin
#    llamar a Bubble, porque el sync viejo ya lo dejó al día.

# c) Apagar el sync viejo de Bubble (int_sync_cron) y crear el cron nuevo
gcloud scheduler jobs create http dotcasa-integraciones-sync --project=$PROJECT --location=$REGION \
  --schedule="*/5 * * * *" --time-zone="America/Monterrey" \
  --uri="$URL/sync" --http-method=POST --headers="x-api-key=$SYNC_KEY" \
  --attempt-deadline=900s
```

Para pasar a live: deploy de Bubble a live y cambiar `BUBBLE_WF_URL` y
`STATE_PREFIX=integraciones` en Cloud Run.

## Operación

- Logs: Cloud Logging, `resource.labels.service_name="dotcasa-integraciones"`.
  Cada corrida deja un `Sync terminado` con enviadas, cerradas y errores.
- Forzar que una key se reprocese completa: borrar
  `gs://<bucket>/<prefix>/estado/<id de la key>.json`.
- Una sola key: `POST /sync?key=<id de Api_keys>`.
- Si una corrida tarda más de 5 min, la siguiente se salta (lock en GCS).
- Si el proveedor falla o regresa la lista vacía, no se cierra nada.

## Agregar un proveedor

1. `src/providers/<nombre>.js` con `listar(key)` → `[{ id, updatedAt, status }]`
   y `detalle(key, item)` → objeto con los campos de `CAMPOS` (usa `normalizar`).
2. Registrarlo en `src/providers/index.js` con el mismo texto que vaya en
   `Api_keys.Proveedor`.
3. `npm test`.

No hay que tocar Bubble.
