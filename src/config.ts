import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

/**
 * Configuracion central del modulo IA ("Jhonattan IA").
 * Todas las claves se leen de .env (nunca hardcodeadas).
 */
export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',

  // Modelos: opus para razonar/responder, haiku para clasificar/normalizar barato.
  models: {
    reasoning: process.env.IA_MODEL_REASONING ?? 'claude-opus-4-8',
    cheap: process.env.IA_MODEL_CHEAP ?? 'claude-haiku-4-5-20251001',
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

  // ntfy para notificaciones push. Servidor privado con token (Bearer) o ntfy.sh.
  ntfy: {
    server: process.env.NTFY_SERVER ?? 'https://ntfy.sh',
    topic: process.env.NTFY_TOPIC ?? '',
    token: process.env.NTFY_TOKEN ?? '', // token write-only (servidor privado Fibex)
  },

  paths: {
    root: process.cwd(),
    // Fuentes que ya genera el pipeline de Bee.
    conversacionesPorDia: path.join(process.cwd(), 'conversaciones_por_dia'),
    conversacionesDescargadas: path.join(process.cwd(), 'conversaciones_descargadas'),
    // Artefactos del modulo IA.
    dataDir: path.join(process.cwd(), 'data'),
    normalizedDir: path.join(process.cwd(), 'data', 'normalized'),
    normalizedFile: path.join(process.cwd(), 'data', 'normalized', 'conversaciones.jsonl'),
    profileDir: path.join(process.cwd(), 'data', 'profile'),
    perfilFile: path.join(process.cwd(), 'data', 'profile', 'perfil.json'),
    personasFile: path.join(process.cwd(), 'data', 'profile', 'personas.json'),
    estiloFile: path.join(process.cwd(), 'data', 'profile', 'estilo.md'),
    libroFile: path.join(process.cwd(), 'data', 'profile', 'libro.md'),
    indexDir: path.join(process.cwd(), 'data', 'index'),
    indexFile: path.join(process.cwd(), 'data', 'index', 'lexico.json'),
    usageDir: path.join(process.cwd(), 'data', 'usage'),
    usageFile: path.join(process.cwd(), 'data', 'usage', 'usage.jsonl'),
    // Salida para Hermes Agent: los 3 archivos de su memoria built-in.
    hermesDir: path.join(process.cwd(), 'data', 'hermes'),
    soulFile: path.join(process.cwd(), 'data', 'hermes', 'SOUL.md'),
    userFile: path.join(process.cwd(), 'data', 'hermes', 'USER.md'),
    memoryFile: path.join(process.cwd(), 'data', 'hermes', 'MEMORY.md'),
  },
} as const;

/** Lanza un error claro si falta una clave requerida. */
export function requireConfig(keys: Array<'anthropic' | 'telegram'>): void {
  const missing: string[] = [];
  if (keys.includes('anthropic') && !config.anthropicApiKey) {
    missing.push('ANTHROPIC_API_KEY');
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
