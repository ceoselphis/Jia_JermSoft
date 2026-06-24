import { config, requireConfig } from './config';
import { recordUsage } from './usage/tracker';

/**
 * Capa de modelo de Jia. Motor: Groq (API compatible con OpenAI).
 * Mantiene la misma interfaz para el resto del proyecto: complete() y
 * completeJson(). Cambiar de proveedor compatible-OpenAI (Groq, OpenRouter,
 * DeepSeek...) = solo cambiar LLM_BASE_URL y la API key en .env.
 */

export interface LlmOptions {
  system?: string;
  model?: string;
  maxTokens?: number;
  /** Etiqueta para atribuir el gasto (p. ej. "ask", "profile"). */
  contexto?: string;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string } | string;
}

/** Llama al modelo (Groq / OpenAI-compatible), registra uso/costo, devuelve texto. */
export async function complete(prompt: string, opts: LlmOptions = {}): Promise<string> {
  requireConfig(['llm']);
  const model = opts.model ?? config.llm.models.reasoning;

  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens ?? 2048 }),
  });

  const data = (await res.json().catch(() => ({}))) as ChatResponse;
  if (!res.ok || data.error) {
    const msg =
      typeof data.error === 'string'
        ? data.error
        : data.error?.message ?? JSON.stringify(data).slice(0, 300);
    throw new Error(`LLM API ${res.status}: ${msg}`);
  }

  const u = data.usage ?? {};
  recordUsage(
    model,
    { input_tokens: u.prompt_tokens ?? 0, output_tokens: u.completion_tokens ?? 0 },
    opts.contexto ?? 'desconocido',
  );

  return (data.choices?.[0]?.message?.content ?? '').trim();
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
    const match = limpio.match(/[[{][\s\S]*[\]}]/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error(`La respuesta no es JSON valido:\n${raw.slice(0, 500)}`);
  }
}
