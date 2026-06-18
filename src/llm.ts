import Anthropic from '@anthropic-ai/sdk';
import { config, requireConfig } from './config';
import { recordUsage } from './usage/tracker';

let client: Anthropic | null = null;

/** Cliente Anthropic perezoso (se crea solo cuando hace falta). */
export function getClient(): Anthropic {
  requireConfig(['anthropic']);
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

export interface LlmOptions {
  system?: string;
  model?: string;
  maxTokens?: number;
  /** Etiqueta para atribuir el gasto (p. ej. "ask", "profile"). */
  contexto?: string;
}

/** Llama a Claude, registra el uso/costo, y devuelve el texto plano. */
export async function complete(prompt: string, opts: LlmOptions = {}): Promise<string> {
  const model = opts.model ?? config.models.reasoning;
  // Nota: opus-4-8 / 4.7 NO aceptan `temperature` (devuelven 400). No la enviamos.
  const res = await getClient().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.system,
    messages: [{ role: 'user', content: prompt }],
  });

  recordUsage(model, res.usage, opts.contexto ?? 'desconocido');

  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/** Como complete() pero parsea la respuesta como JSON (tolera fences ```json). */
export async function completeJson<T>(prompt: string, opts: LlmOptions = {}): Promise<T> {
  const raw = await complete(prompt, opts);
  const limpio = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(limpio) as T;
  } catch {
    // Ultimo intento: extraer el primer bloque {...} o [...] balanceado-ish.
    const match = limpio.match(/[[{][\s\S]*[\]}]/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error(`La respuesta no es JSON valido:\n${raw.slice(0, 500)}`);
  }
}
