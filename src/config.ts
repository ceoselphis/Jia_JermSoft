import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Raiz del proyecto, independiente del cwd. Asi el MCP server funciona aunque
 * Hermes lo arranque desde otra carpeta (stdio). dist/config.js -> ../ ; src via
 * ts-node -> ../ ; ambos resuelven a la raiz del repo. Se puede forzar con JIA_HOME.
 */
const ROOT = process.env.JIA_HOME ?? path.resolve(__dirname, '..');

// Cargar .env desde la raiz (no desde el cwd).
dotenv.config({ path: path.join(ROOT, '.env') });

/**
 * Configuracion central del modulo IA ("Jhonattan IA").
 * Todas las claves se leen de .env (nunca hardcodeadas).
 */
export const config = {
  // Motor: backend seleccionable.
  //   LLM_BACKEND=claude-cli -> usa el CLI `claude` (suscripcion Claude del servidor), sin key.
  //   LLM_BACKEND=http (default) -> API compatible-OpenAI (Groq). Fallback.
  llm: {
    backend: (process.env.LLM_BACKEND ?? 'http') as 'claude-cli' | 'http',
    claudeBin: process.env.CLAUDE_BIN ?? 'claude',
    apiKey: process.env.GROQ_API_KEY ?? process.env.LLM_API_KEY ?? '',
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.groq.com/openai/v1',
    models: {
      reasoning:
        process.env.IA_MODEL_REASONING ??
        (process.env.LLM_BACKEND === 'claude-cli' ? 'sonnet' : 'llama-3.3-70b-versatile'),
      cheap:
        process.env.IA_MODEL_CHEAP ??
        (process.env.LLM_BACKEND === 'claude-cli' ? 'haiku' : 'llama-3.1-8b-instant'),
    },
  },

  telegram: {
    botToken: process.env.TELEGRAM_IA_BOT_TOKEN ?? '',
    // Solo este chat puede hablar con la IA (whitelist de un solo dueno).
    ownerChatId: process.env.TELEGRAM_JHONATTAN_CHAT_ID ?? '',
  },

  bee: {
    // Cuantos dias hacia atras descarga el cron (ventana movil, idempotente).
    lookbackDays: Number(process.env.BEE_LOOKBACK_DAYS ?? 2),
    // Expresion cron de la descarga (por defecto cada 6 horas).
    cron: process.env.BEE_CRON ?? '0 */6 * * *',
    timezone: 'America/Caracas',
  },

  // Control de gastos del API.
  costos: {
    // Cron del reporte de gastos (por defecto cada 6 horas).
    cron: process.env.COSTOS_CRON ?? '0 */6 * * *',
    // Presupuesto diario en USD; si se supera, la notificacion va con alerta.
    presupuestoDiarioUSD: Number(process.env.COSTOS_PRESUPUESTO_DIARIO_USD ?? 5),
    timezone: 'America/Caracas',
  },

  // Carpeta HOME de Hermes Agent. Si se define, ia:hermes escribe
  // SOUL.md/USER.md/MEMORY.md directo ahi (memoria built-in de Hermes).
  hermesHome: process.env.HERMES_HOME ?? '',

  // ntfy para notificaciones push. Servidor privado con token (Bearer) o ntfy.sh.
  ntfy: {
    server: process.env.NTFY_SERVER ?? 'https://ntfy.sh',
    topic: process.env.NTFY_TOPIC ?? '',
    token: process.env.NTFY_TOKEN ?? '', // token write-only (servidor privado Fibex)
  },

  paths: {
    root: ROOT,
    // Fuentes que ya genera el pipeline de Bee.
    conversacionesPorDia: path.join(ROOT, 'conversaciones_por_dia'),
    conversacionesDescargadas: path.join(ROOT, 'conversaciones_descargadas'),
    // Artefactos del modulo IA.
    dataDir: path.join(ROOT, 'data'),
    normalizedDir: path.join(ROOT, 'data', 'normalized'),
    normalizedFile: path.join(ROOT, 'data', 'normalized', 'conversaciones.jsonl'),
    profileDir: path.join(ROOT, 'data', 'profile'),
    perfilFile: path.join(ROOT, 'data', 'profile', 'perfil.json'),
    personasFile: path.join(ROOT, 'data', 'profile', 'personas.json'),
    estiloFile: path.join(ROOT, 'data', 'profile', 'estilo.md'),
    libroFile: path.join(ROOT, 'data', 'profile', 'libro.md'),
    // Memoria: hechos que Jhonattan le ensena al bot ("recuerda: ...").
    hechosFile: path.join(ROOT, 'data', 'profile', 'hechos.md'),
    indexDir: path.join(ROOT, 'data', 'index'),
    indexFile: path.join(ROOT, 'data', 'index', 'lexico.json'),
    usageDir: path.join(ROOT, 'data', 'usage'),
    usageFile: path.join(ROOT, 'data', 'usage', 'usage.jsonl'),
    // Workspaces donde Jia construye proyectos en MODO DESARROLLO (agente).
    proyectosDir: process.env.PROYECTOS_DIR ?? path.resolve(ROOT, '..', 'proyectos'),
    // Salida para Hermes Agent: los 3 archivos de su memoria built-in.
    hermesDir: path.join(ROOT, 'data', 'hermes'),
    soulFile: path.join(ROOT, 'data', 'hermes', 'SOUL.md'),
    userFile: path.join(ROOT, 'data', 'hermes', 'USER.md'),
    memoryFile: path.join(ROOT, 'data', 'hermes', 'MEMORY.md'),
  },
} as const;

/** Lanza un error claro si falta una clave requerida. */
export function requireConfig(keys: Array<'llm' | 'telegram'>): void {
  const missing: string[] = [];
  // El backend claude-cli usa la suscripcion del CLI (sin key). Solo 'http' exige key.
  if (keys.includes('llm') && config.llm.backend === 'http' && !config.llm.apiKey) {
    missing.push('GROQ_API_KEY');
  }
  if (keys.includes('telegram')) {
    if (!config.telegram.botToken) missing.push('TELEGRAM_IA_BOT_TOKEN');
    if (!config.telegram.ownerChatId) missing.push('TELEGRAM_JHONATTAN_CHAT_ID');
  }
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno: ${missing.join(', ')}. ` +
        `Copia .env.example a .env y complétalas.`,
    );
  }
}
