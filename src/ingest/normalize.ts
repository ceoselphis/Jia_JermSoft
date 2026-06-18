import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../config';
import { NormalizedConversation, RawConversation, Utterance } from '../types';

/**
 * Normaliza las conversaciones que ya descargo el pipeline de Bee
 * (conversaciones_por_dia/*_completo.json) a un unico JSONL limpio y dedup.
 *
 * - Marca como ruido las conversaciones que son audio de fondo / medios.
 * - Limpia utterances basura (vacios, repeticiones).
 * - Idempotente: re-correr solo agrega ids nuevos.
 *
 * Uso: npm run ia:normalize
 */

// Frases que delatan audio de fondo / medios (no conversaciones reales de Jhonattan).
const NOISE_HINTS = [
  'background audio',
  'background music',
  'ambient',
  'broadcast',
  'podcast',
  'radio',
  'tv show',
  'television',
  'song lyrics',
  'commentary',
  'champions league',
  'news broadcast',
];

function esRuido(c: RawConversation): boolean {
  const haystack = `${c.summary} ${c.atmosphere}`.toLowerCase();
  return NOISE_HINTS.some((h) => haystack.includes(h));
}

/** Limpia y filtra utterances claramente inservibles. */
function limpiarUtterances(utterances: Utterance[] | undefined): Utterance[] {
  if (!Array.isArray(utterances)) return [];
  const vistos = new Set<string>();
  const out: Utterance[] = [];
  for (const u of utterances) {
    const text = (u.text ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < 2) continue; // vacio o casi vacio
    // Colapsar repeticiones exactas consecutivas (artefacto comun de transcripcion).
    const clave = `${u.speaker}|${text}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ ...u, text });
  }
  return out;
}

function fechaCaracas(iso: string): string {
  // start_time viene en ISO (UTC). Lo expresamos en America/Caracas (UTC-4) para la fecha local.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'fecha-desconocida';
  const caracas = new Date(d.getTime() - 4 * 60 * 60 * 1000);
  return caracas.toISOString().slice(0, 10);
}

function duracionMin(inicio: string, fin: string): number {
  const a = new Date(inicio).getTime();
  const b = new Date(fin).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 60000));
}

function normalizar(c: RawConversation): NormalizedConversation {
  return {
    id: String(c.id),
    fecha: fechaCaracas(c.start_time),
    inicio: c.start_time,
    fin: c.end_time,
    duracionMin: duracionMin(c.start_time, c.end_time),
    summary: (c.summary ?? '').trim(),
    atmosphere: (c.atmosphere ?? '').trim(),
    key_takeaways: Array.isArray(c.key_takeaways) ? c.key_takeaways : [],
    action_items: Array.isArray(c.action_items) ? c.action_items : [],
    utterances: limpiarUtterances(c.detailed_content?.utterances),
    esRuido: esRuido(c),
  };
}

/** Carga los ids ya presentes en el JSONL (para idempotencia). */
async function idsExistentes(): Promise<Set<string>> {
  try {
    const contenido = await fs.readFile(config.paths.normalizedFile, 'utf-8');
    const ids = new Set<string>();
    for (const linea of contenido.split('\n')) {
      const l = linea.trim();
      if (!l) continue;
      try {
        ids.add(String((JSON.parse(l) as NormalizedConversation).id));
      } catch {
        /* linea corrupta: ignorar */
      }
    }
    return ids;
  } catch {
    return new Set();
  }
}

export async function normalize(): Promise<void> {
  await fs.mkdir(config.paths.normalizedDir, { recursive: true });

  let archivos: string[] = [];
  try {
    archivos = (await fs.readdir(config.paths.conversacionesPorDia)).filter((f) =>
      f.endsWith('_completo.json'),
    );
  } catch {
    throw new Error(
      `No se encontro ${config.paths.conversacionesPorDia}. ` +
        `Corre primero el pipeline de Bee (ConversacionesDetalleByDay).`,
    );
  }

  if (archivos.length === 0) {
    console.warn('No hay archivos *_completo.json para normalizar.');
    return;
  }

  const yaExisten = await idsExistentes();
  const nuevos: NormalizedConversation[] = [];
  const vistosEnEstaCorrida = new Set<string>();

  for (const archivo of archivos.sort()) {
    const ruta = path.join(config.paths.conversacionesPorDia, archivo);
    let data: RawConversation[];
    try {
      data = JSON.parse(await fs.readFile(ruta, 'utf-8'));
    } catch (e) {
      console.warn(`Saltando ${archivo}: JSON invalido`);
      continue;
    }
    if (!Array.isArray(data)) continue;

    for (const c of data) {
      const id = String(c.id);
      if (yaExisten.has(id) || vistosEnEstaCorrida.has(id)) continue;
      vistosEnEstaCorrida.add(id);
      nuevos.push(normalizar(c));
    }
  }

  if (nuevos.length === 0) {
    console.log('Nada nuevo que normalizar (todo ya estaba en el JSONL).');
    return;
  }

  const lineas = nuevos.map((c) => JSON.stringify(c)).join('\n') + '\n';
  await fs.appendFile(config.paths.normalizedFile, lineas, 'utf-8');

  const ruido = nuevos.filter((c) => c.esRuido).length;
  console.log(
    `Normalizadas ${nuevos.length} conversaciones nuevas ` +
      `(${ruido} marcadas como ruido). Total acumulado: ${yaExisten.size + nuevos.length}.`,
  );
  console.log(`Salida: ${config.paths.normalizedFile}`);
}

/** Lee todas las conversaciones normalizadas (excluye ruido por defecto). */
export async function leerNormalizadas(
  incluirRuido = false,
): Promise<NormalizedConversation[]> {
  const contenido = await fs.readFile(config.paths.normalizedFile, 'utf-8');
  const out: NormalizedConversation[] = [];
  for (const linea of contenido.split('\n')) {
    const l = linea.trim();
    if (!l) continue;
    try {
      const c = JSON.parse(l) as NormalizedConversation;
      if (incluirRuido || !c.esRuido) out.push(c);
    } catch {
      /* ignorar */
    }
  }
  return out;
}

if (require.main === module) {
  normalize().catch((e) => {
    console.error('Error en normalize:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
