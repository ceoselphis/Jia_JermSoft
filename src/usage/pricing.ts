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
  'claude-opus-4-8': {
    inputPerM: 5.0,
    outputPerM: 25.0,
    cacheReadPerM: 0.5, // 5.0 * 0.1
    cacheWritePerM: 6.25, // 5.0 * 1.25
  },
  'claude-haiku-4-5': {
    inputPerM: 1.0,
    outputPerM: 5.0,
    cacheReadPerM: 0.1,
    cacheWritePerM: 1.25,
  },
};

/** Resuelve el precio de un modelo (tolera sufijos de fecha, p. ej. -20251001). */
export function pricingFor(model: string): ModelPricing {
  if (PRICES[model]) return PRICES[model];
  // Coincidencia por prefijo conocido.
  for (const key of Object.keys(PRICES)) {
    if (model.startsWith(key)) return PRICES[key];
  }
  // Desconocido: usar opus como conservador (no subestimar el gasto).
  return PRICES['claude-opus-4-8'];
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
