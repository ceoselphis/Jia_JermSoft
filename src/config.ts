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
  // Motor: Google Gemini (clave de Google AI Studio). Tier gratuito para empezar.
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  // (Legado) Anthropic — ya no se usa, se mantiene para compatibilidad de .env.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',

  // Modelos: flash para razonar/responder, flash para clasificar/normalizar barato.
  // Gratis en AI Studio. Se pueden sobreescribir con IA_MODEL_REASONING / IA_MODEL_CHEAP.
  models: {
    reasoning: process.env.IA_MODEL_REASONING ?? 'gemini-2.5-flash',
    cheap: process.env.IA_MODEL_CHEAP ?? 'gemini-2.5-flash',
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
    indexDir: path.join(ROOT, 'data', 'index'),
    indexFile: path.join(ROOT, 'data', 'index', 'lexico.json'),
    usageDir: path.join(ROOT, 'data', 'usage'),
    usageFile: path.join(ROOT, 'data', 'usage', 'usage.jsonl'),
    // Salida para Hermes Agent: los 3 archivos de su memoria built-in.
    hermesDir: path.join(ROOT, 'data', 'hermes'),
    soulFile: path.join(ROOT, 'data', 'hermes', 'SOUL.md'),
    userFile: path.join(ROOT, 'data', 'hermes', 'USER.md'),
    memoryFile: path.join(ROOT, 'data', 'hermes', 'MEMORY.md'),
  },
} as const;

/** Lanza un error claro si falta una clave requerida. */
export function requireConfig(keys: Array<'gemini' | 'telegram'>): void {
  const missing: string[] = [];
  if (keys.includes('gemini') && !config.geminiApiKey) {
    missing.push('GEMINI_API_KEY');
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
