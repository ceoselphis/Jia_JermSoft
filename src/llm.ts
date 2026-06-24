import { config, requireConfig } from './config';
import { recordUsage } from './usage/tracker';

/**
 * Capa de modelo de Jia. Motor: Google Gemini (API REST nativa, sin SDK).
 * Mantiene la misma interfaz que usaba el resto del proyecto: complete() y
 * completeJson(). Cambiar de proveedor = cambiar solo este archivo.
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface LlmOptions {
  system?: string;
  model?: string;
  maxTokens?: number;
  /** Etiqueta para atribuir el gasto (p. ej. "ask", "profile"). */
  contexto?: string;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string; status?: string };
}

/** Llama a Gemini, registra el uso/costo, y devuelve el texto plano. */
export async function complete(prompt: string, opts: LlmOptions = {}): Promise<string> {
  requireConfig(['gemini']);
  const model = opts.model ?? config.models.reasoning;

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: opts.maxTokens ?? 2048 },
  };
  if (opts.system) body.system_instruction = { parts: [{ text: opts.system }] };

  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': config.geminiApiKey,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok || data.error) {
    const msg = data.error?.message ?? JSON.stringify(data).slice(0, 300);
    throw new Error(`Gemini API ${res.status}: ${msg}`);
  }

  const u = data.usageMetadata ?? {};
  recordUsage(
    model,
    { input_tokens: u.promptTokenCount ?? 0, output_tokens: u.candidatesTokenCount ?? 0 },
    opts.contexto ?? 'desconocido',
  );

  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
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
