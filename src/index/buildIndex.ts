import * as fs from 'fs/promises';
import { config } from '../config';
import { leerNormalizadas } from '../ingest/normalize';
import { NormalizedConversation } from '../types';

/**
 * Indice de busqueda lexico (v1, sin embeddings). Suficiente para ~250 convs.
 * - retrieve(pregunta) -> top-K conversaciones con una cita (id, fecha, fragmento).
 *
 * buildIndex() solo valida los datos y reporta estadisticas; la busqueda corre
 * en memoria sobre el JSONL normalizado.
 *
 * Uso: npm run ia:index
 */

const STOPWORDS = new Set(
  ('a al algo ante asi aun aunque cada como con contra cual cuando de del desde donde dos el ella ' +
    'ellas ellos en entre era eran es esa ese eso esta estan este esto fue han hay la las le les lo ' +
    'los mas me mi mis mucho muy ni no nos o os para pero por porque que quien se si sin sobre solo ' +
    'son su sus tan te tu tus un una unas uno unos y ya yo q mr de').split(/\s+/),
);

/** Normaliza texto: minusculas, sin acentos, solo palabras. */
export function tokens(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export interface Cita {
  id: string;
  fecha: string;
  fragmento: string;
  score: number;
}

/** Texto buscable de una conversacion (pondera lo que dijo Jhonattan). */
function textoBuscable(c: NormalizedConversation): string {
  const jho = c.utterances
    .filter((u) => u.speaker === 'Jhonattan')
    .map((u) => u.text)
    .join(' ');
  return [
    c.summary,
    c.summary, // peso x2 al resumen (mas limpio que utterances)
    c.key_takeaways.join(' '),
    c.action_items.join(' '),
    jho,
  ].join(' ');
}

/** Devuelve un fragmento del summary alrededor del primer termino que matchea. */
function fragmento(c: NormalizedConversation, terminos: Set<string>): string {
  const base = c.summary || c.key_takeaways[0] || '';
  const palabras = base.split(/\s+/);
  const idx = palabras.findIndex((p) => terminos.has(tokens(p)[0]));
  if (idx < 0) return base.slice(0, 200).trim();
  const ini = Math.max(0, idx - 12);
  return (ini > 0 ? '...' : '') + palabras.slice(ini, ini + 30).join(' ').trim() + '...';
}

let cache: NormalizedConversation[] | null = null;
async function cargar(): Promise<NormalizedConversation[]> {
  if (!cache) cache = await leerNormalizadas();
  return cache;
}

/** Recupera las top-K conversaciones mas relevantes a la pregunta. */
export async function retrieve(pregunta: string, k = 6): Promise<Cita[]> {
  const convs = await cargar();
  const qTokens = tokens(pregunta);
  if (qTokens.length === 0) return [];
  const qSet = new Set(qTokens);

  const scored = convs.map((c) => {
    const docTokens = tokens(textoBuscable(c));
    let score = 0;
    const tf: Record<string, number> = {};
    for (const t of docTokens) tf[t] = (tf[t] ?? 0) + 1;
    for (const q of qSet) score += tf[q] ?? 0;
    return { c, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => ({
      id: s.c.id,
      fecha: s.c.fecha,
      fragmento: fragmento(s.c, qSet),
      score: s.score,
    }));
}

/** Devuelve el texto completo (summary + utterances) de una conversacion por id. */
export async function getConversacion(
  id: string,
): Promise<NormalizedConversation | undefined> {
  const convs = await cargar();
  return convs.find((c) => c.id === id);
}

export async function buildIndex(): Promise<void> {
  const convs = await leerNormalizadas();
  await fs.mkdir(config.paths.indexDir, { recursive: true });

  const vocab = new Set<string>();
  let totalTokens = 0;
  for (const c of convs) {
    const ts = tokens(textoBuscable(c));
    totalTokens += ts.length;
    for (const t of ts) vocab.add(t);
  }

  const stats = {
    conversaciones: convs.length,
    vocabulario: vocab.size,
    tokensTotales: totalTokens,
    generado: new Date().toISOString(),
  };
  await fs.writeFile(config.paths.indexFile, JSON.stringify(stats, null, 2), 'utf-8');
  console.log('Indice lexico validado:', stats);
}

if (require.main === module) {
  buildIndex().catch((e) => {
    console.error('Error en buildIndex:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
