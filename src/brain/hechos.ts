import * as fs from 'fs';
import { config } from '../config';

/**
 * Memoria de hechos que Jhonattan le ensena al bot ("recuerda: ...").
 * Archivo simple y editable a mano: data/profile/hechos.md (lista de bullets).
 * Se inyecta en el system prompt del cerebro (ask.ts) como verdad.
 */

/** Agrega un hecho (con fecha). No lanza. */
export function agregarHecho(texto: string): string | null {
  const t = texto.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  try {
    fs.mkdirSync(config.paths.profileDir, { recursive: true });
    const fecha = new Date().toISOString().slice(0, 10);
    fs.appendFileSync(config.paths.hechosFile, `- ${t}  _(${fecha})_\n`, 'utf-8');
    return t;
  } catch (e) {
    console.error('No se pudo guardar el hecho:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Devuelve el contenido (markdown) de los hechos, o cadena vacia. */
export function leerHechos(): string {
  try {
    return fs.readFileSync(config.paths.hechosFile, 'utf-8').trim();
  } catch {
    return '';
  }
}

/** Lista los hechos (solo las lineas de bullet). */
export function listarHechos(): string[] {
  return leerHechos()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '));
}

/** Borra el hecho n (1-based). Devuelve true si lo borro. */
export function borrarHecho(indice1: number): boolean {
  const lineas = listarHechos();
  if (!Number.isInteger(indice1) || indice1 < 1 || indice1 > lineas.length) return false;
  lineas.splice(indice1 - 1, 1);
  try {
    fs.writeFileSync(
      config.paths.hechosFile,
      lineas.length ? lineas.join('\n') + '\n' : '',
      'utf-8',
    );
    return true;
  } catch {
    return false;
  }
}
