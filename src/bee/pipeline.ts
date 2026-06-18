import { config } from '../config';
import { downloadList } from './ConversacionesByFecha';
import { downloadDetailByDay } from './ConversacionesDetalleByDay';
import { normalize } from '../ingest/normalize';
import { buildIndex } from '../index/buildIndex';
import { buildHermes } from '../hermes/buildHermes';

/**
 * Pipeline de ingesta completo:
 *   1. Descarga la LISTA de conversaciones (bee conversations list)
 *   2. Descarga el DETALLE por dia (bee conversations get) -> conversaciones_por_dia
 *   3. Normaliza a data/normalized/conversaciones.jsonl (idempotente)
 *   4. Reconstruye el indice lexico
 *
 * Usa una ventana movil (ultimos BEE_LOOKBACK_DAYS dias) para que el cron
 * capture lo nuevo. Como normalize() es idempotente, solapar dias es seguro.
 */

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function runPipeline(lookbackDays = config.bee.lookbackDays): Promise<void> {
  const hoy = new Date();
  const ini = new Date(hoy.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const start = fmt(ini);
  const end = fmt(hoy);

  console.log(`\n=== Pipeline Bee → IA (${start} a ${end}) ===`);

  try {
    console.log('[1/4] Descargando lista de conversaciones...');
    const n = await downloadList(start, end);

    if (n > 0) {
      console.log('[2/4] Descargando detalle por dia...');
      await downloadDetailByDay(start, end);
    } else {
      console.log('[2/4] Sin conversaciones nuevas; salto el detalle.');
    }

    console.log('[3/5] Normalizando...');
    await normalize();

    console.log('[4/5] Reconstruyendo indice...');
    await buildIndex();

    console.log('[5/5] Actualizando memoria de Hermes (SOUL/USER/MEMORY)...');
    await buildHermes();

    console.log('=== Pipeline completado ===\n');
  } catch (e) {
    // No tumbamos el scheduler por un fallo puntual (p. ej. bee CLI sin red).
    console.error('Pipeline fallo:', e instanceof Error ? e.message : e);
    throw e;
  }
}

if (require.main === module) {
  // Permite forzar mas dias: ts-node src/bee/pipeline.ts 30
  const dias = Number(process.argv[2] ?? config.bee.lookbackDays);
  runPipeline(dias).catch(() => process.exit(1));
}
