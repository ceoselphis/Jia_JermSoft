import { config } from '../config';

/**
 * Notificaciones push via ntfy.sh (sin auth: solo publicas a un "topic").
 * Suscribete al topic en la app ntfy de tu telefono para recibirlas.
 */

export interface NtfyOptions {
  title?: string;
  priority?: 1 | 2 | 3 | 4 | 5; // 5 = urgente
  tags?: string[]; // emojis/keywords, p. ej. ["money", "warning"]
}

/** Envia una notificacion. No lanza si falla (no debe tumbar el cron). */
export async function notify(mensaje: string, opts: NtfyOptions = {}): Promise<boolean> {
  if (!config.ntfy.topic) {
    console.warn('NTFY_TOPIC no configurado; omito notificacion.');
    return false;
  }
  const url = `${config.ntfy.server.replace(/\/$/, '')}/${config.ntfy.topic}`;
  const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8' };
  if (config.ntfy.token) headers['Authorization'] = `Bearer ${config.ntfy.token}`;
  if (opts.title) headers['Title'] = sanitizeHeader(opts.title);
  if (opts.priority) headers['Priority'] = String(opts.priority);
  if (opts.tags?.length) headers['Tags'] = opts.tags.join(',');

  try {
    const res = await fetch(url, { method: 'POST', headers, body: mensaje });
    if (!res.ok) {
      console.error(`ntfy respondio ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Error enviando ntfy:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Los headers HTTP no admiten saltos de linea ni no-ASCII; los limpiamos. */
function sanitizeHeader(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7E]/g, '').slice(0, 200);
}
