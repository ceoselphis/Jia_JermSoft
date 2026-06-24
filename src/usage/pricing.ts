/**
 * Precios oficiales de Claude (USD por 1M de tokens).
 * Fuente: documentacion de Anthropic (claude-api). Actualiza si cambian.
 *
 * Cache: lectura ~0.1x del input; escritura ~1.25x (TTL 5 min).
 */
export interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM: number;
  cacheWritePerM: number;
}

const PRICES: Record<string, ModelPricing> = {
  // --- Groq (USD por 1M tokens). Tier gratuito = $0; aqui se estima el de pago. ---
  'llama-3.3-70b-versatile': { inputPerM: 0.59, outputPerM: 0.79, cacheReadPerM: 0, cacheWritePerM: 0 },
  'llama-3.1-8b-instant': { inputPerM: 0.05, outputPerM: 0.08, cacheReadPerM: 0, cacheWritePerM: 0 },
  'openai/gpt-oss-120b': { inputPerM: 0.15, outputPerM: 0.6, cacheReadPerM: 0, cacheWritePerM: 0 },
  // --- Claude vía CLI (suscripcion). Estimacion como API (la suscripcion lo cubre). ---
  sonnet: { inputPerM: 3.0, outputPerM: 15.0, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  haiku: { inputPerM: 1.0, outputPerM: 5.0, cacheReadPerM: 0.1, cacheWritePerM: 1.25 },
  opus: { inputPerM: 15.0, outputPerM: 75.0, cacheReadPerM: 1.5, cacheWritePerM: 18.75 },
  // --- (Legado) por si quedan entradas viejas en usage.jsonl ---
  'gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5, cacheReadPerM: 0.075, cacheWritePerM: 0.3833 },
  'claude-opus-4-8': { inputPerM: 5.0, outputPerM: 25.0, cacheReadPerM: 0.5, cacheWritePerM: 6.25 },
};

/** Resuelve el precio de un modelo (tolera sufijos de fecha/variantes). */
export function pricingFor(model: string): ModelPricing {
  if (PRICES[model]) return PRICES[model];
  // Coincidencia por prefijo conocido.
  for (const key of Object.keys(PRICES)) {
    if (model.startsWith(key)) return PRICES[key];
  }
  // Desconocido: usar llama-70b como referencia (motor actual).
  return PRICES['llama-3.3-70b-versatile'];
}

export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Calcula el costo en USD de una llamada a partir de su usage. */
export function costoUSD(model: string, usage: TokenUsage): number {
  const p = pricingFor(model);
  const inp = (usage.input_tokens ?? 0) * p.inputPerM;
  const out = (usage.output_tokens ?? 0) * p.outputPerM;
  const cw = (usage.cache_creation_input_tokens ?? 0) * p.cacheWritePerM;
  const cr = (usage.cache_read_input_tokens ?? 0) * p.cacheReadPerM;
  return (inp + out + cw + cr) / 1_000_000;
}
