import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { costoUSD, TokenUsage } from './pricing';

/**
 * Registra cada llamada a Claude (tokens + costo estimado) en un libro mayor
 * append-only: data/usage/usage.jsonl. Lo usa el reporte de gastos cada 6h.
 */

export interface UsageEntry {
  ts: string; // ISO
  model: string;
  contexto: string; // de donde salio la llamada (ask, profile, ...)
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  costoUSD: number;
}

function ensureDir(): void {
  fs.mkdirSync(config.paths.usageDir, { recursive: true });
}

/** Anota una llamada. No lanza: el tracking nunca debe tumbar la app. */
export function recordUsage(
  model: string,
  usage: TokenUsage,
  contexto = 'desconocido',
): void {
  try {
    ensureDir();
    const entry: UsageEntry = {
      ts: new Date().toISOString(),
      model,
      contexto,
      input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      costoUSD: costoUSD(model, usage),
    };
    fs.appendFileSync(config.paths.usageFile, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (e) {
    console.error('No se pudo registrar uso:', e instanceof Error ? e.message : e);
  }
}

/** Lee todas las entradas del libro mayor. */
export function leerUsage(): UsageEntry[] {
  try {
    const contenido = fs.readFileSync(config.paths.usageFile, 'utf-8');
    const out: UsageEntry[] = [];
    for (const linea of contenido.split('\n')) {
      const l = linea.trim();
      if (!l) continue;
      try {
        out.push(JSON.parse(l) as UsageEntry);
      } catch {
        /* ignorar linea corrupta */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export interface Resumen {
  desde: string;
  llamadas: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  costoUSD: number;
  porModelo: Record<string, { llamadas: number; costoUSD: number }>;
  porContexto: Record<string, { llamadas: number; costoUSD: number }>;
}

/** Agrega el gasto desde un instante dado (ms epoch). */
export function resumirDesde(desdeMs: number): Resumen {
  const entries = leerUsage().filter((e) => new Date(e.ts).getTime() >= desdeMs);
  const r: Resumen = {
    desde: new Date(desdeMs).toISOString(),
    llamadas: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheTokens: 0,
    costoUSD: 0,
    porModelo: {},
    porContexto: {},
  };
  for (const e of entries) {
    r.llamadas++;
    r.inputTokens += e.input;
    r.outputTokens += e.output;
    r.cacheTokens += e.cacheWrite + e.cacheRead;
    r.costoUSD += e.costoUSD;
    (r.porModelo[e.model] ??= { llamadas: 0, costoUSD: 0 });
    r.porModelo[e.model].llamadas++;
    r.porModelo[e.model].costoUSD += e.costoUSD;
    (r.porContexto[e.contexto] ??= { llamadas: 0, costoUSD: 0 });
    r.porContexto[e.contexto].llamadas++;
    r.porContexto[e.contexto].costoUSD += e.costoUSD;
  }
  return r;
}

export const PATH_INFO = path.basename(config.paths.usageFile);
