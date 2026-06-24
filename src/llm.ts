import { spawn } from 'child_process';
import { config, requireConfig } from './config';
import { recordUsage } from './usage/tracker';

/**
 * Capa de modelo de Jia. Dos backends (config.llm.backend):
 *   - 'claude-cli' : usa el CLI `claude -p` (suscripcion Claude del servidor). Sin API key.
 *   - 'http'       : API compatible-OpenAI (Groq por defecto). Fallback.
 * Mantiene la interfaz: complete() y completeJson().
 */

export interface LlmOptions {
  system?: string;
  model?: string;
  maxTokens?: number;
  /** Etiqueta para atribuir el gasto (p. ej. "ask", "profile"). */
  contexto?: string;
}

// ---------- Backend: Claude CLI (suscripcion) ----------
function completeViaClaudeCli(prompt: string, opts: LlmOptions): Promise<string> {
  const model = opts.model ?? config.llm.models.reasoning;
  const args = ['-p', '--output-format', 'json', '--model', model];
  if (opts.system) args.push('--append-system-prompt', opts.system);

  return new Promise((resolve, reject) => {
    const child = spawn(config.llm.claudeBin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 180_000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`No se pudo ejecutar claude CLI: ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) {
        return reject(new Error(`claude CLI salio ${code}: ${err.slice(0, 300)}`));
      }
      try {
        const data = JSON.parse(out);
        if (data.is_error) {
          return reject(new Error(`claude CLI error: ${String(data.result).slice(0, 300)}`));
        }
        const u = data.usage ?? {};
        recordUsage(
          model,
          {
            input_tokens: u.input_tokens ?? 0,
            output_tokens: u.output_tokens ?? 0,
            cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
          },
          opts.contexto ?? 'desconocido',
        );
        resolve(String(data.result ?? '').trim());
      } catch (e) {
        reject(new Error(`Respuesta no-JSON de claude CLI: ${out.slice(0, 300)}`));
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// ---------- Backend: HTTP compatible-OpenAI (Groq) ----------
interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string } | string;
}

async function completeViaHttp(prompt: string, opts: LlmOptions): Promise<string> {
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

/** Llama al modelo segun el backend configurado y devuelve el texto plano. */
export async function complete(prompt: string, opts: LlmOptions = {}): Promise<string> {
  requireConfig(['llm']);
  if (config.llm.backend === 'claude-cli') return completeViaClaudeCli(prompt, opts);
  return completeViaHttp(prompt, opts);
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
