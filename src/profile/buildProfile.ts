import * as fs from 'fs/promises';
import { config } from '../config';
import { completeJson } from '../llm';
import { leerNormalizadas } from '../ingest/normalize';
import { PERSONAS_SEED, PersonaSeed } from './personas.seed';

/**
 * Construye la "fuente de verdad" sobre Jhonattan corriendo Claude sobre los
 * resumenes normalizados + su libro. Genera:
 *   - data/profile/perfil.json    (hechos estables)
 *   - data/profile/personas.json  (directorio de gente clave)
 *   - data/profile/estilo.md      (guia de voz/tono)
 *
 * Uso: npm run ia:profile
 * Estos archivos se REVISAN a mano una vez (la transcripcion tiene ruido).
 */

interface Persona {
  nombre: string;
  aliases: string[];
  relacion: string; // pareja | familia | directiva | par | equipo | colega | ...
  prioridad: 'alta' | 'media' | 'baja';
  confianza: 'alta' | 'media' | 'baja';
  conflicto: 'alto' | 'medio' | 'bajo' | 'ninguno';
  notas: string;
}

interface ProfileBundle {
  perfil: Record<string, unknown>;
  personas: Persona[];
  estilo_markdown: string;
}

/** Arma un corpus compacto de resumenes para no gastar tokens de mas. */
function corpusResumenes(
  convs: Awaited<ReturnType<typeof leerNormalizadas>>,
): string {
  return convs
    .map((c) => {
      const tk = c.key_takeaways.slice(0, 2).join(' | ');
      const sum = c.summary.replace(/\s+/g, ' ').slice(0, 280);
      return `[${c.fecha} #${c.id}] ${sum}${tk ? ` · ${tk}` : ''}`;
    })
    .join('\n');
}

const INSTRUCCIONES = `Eres un analista que construye un PERFIL preciso de una persona llamada Jhonattan,
a partir de (a) resumenes de sus conversaciones grabadas y (b) el libro que el mismo escribio.

Te doy dos fuentes. Devuelve UNICAMENTE un JSON valido con esta forma exacta:
{
  "perfil": {
    "nombre": string,
    "empresa": string,
    "grupo_corporativo": string,
    "cargo": string,
    "rol_resumen": string,
    "proyectos": string[],
    "ubicaciones": string[],
    "familia": string,
    "pareja": string,
    "valores": string[],
    "rasgos": string[]
  },
  "personas": [
    {
      "nombre": string,
      "aliases": string[],
      "relacion": "pareja|familia|directiva|par|equipo|colega|amigo|proveedor|otro",
      "prioridad": "alta|media|baja",
      "confianza": "alta|media|baja",
      "conflicto": "alto|medio|bajo|ninguno",
      "notas": string
    }
  ],
  "estilo_markdown": string
}

Reglas:
- Basate SOLO en la evidencia de las fuentes. Si algo es inferido y no seguro, dilo en "notas".
- En "personas" incluye a la gente clave que aparezca (pareja, familia/hijas, directiva, equipo,
  pares). Marca "prioridad":"alta" para directiva y personas a las que debe atender rapido.
- Usa "aliases" para desambiguar nombres que se confunden (p. ej. distinguir a la pareja de
  otra persona con nombre parecido). No mezcles dos personas distintas en una.
- "estilo_markdown": una guia breve (200-400 palabras) de la VOZ de Jhonattan para imitarlo:
  tono, muletillas, metaforas que usa, como motiva, como confronta. Apoyate en el libro.
- NO inventes datos que no esten en las fuentes.`;

/** Claves normalizadas (nombre + aliases) para detectar si una persona ya existe. */
function clavesDe(p: { nombre: string; aliases?: string[] }): string[] {
  return [p.nombre, ...(p.aliases ?? [])].map((s) => s.toLowerCase().trim());
}

/**
 * Garantiza que TODA persona de la semilla quede en el resultado.
 * Si el LLM ya la incluyo (por nombre o alias), conserva la version del LLM
 * pero fusiona los aliases de la semilla. Si no, la agrega tal cual.
 */
function mergeSeed(deLlm: Persona[]): Persona[] {
  const out = [...deLlm];
  for (const seed of PERSONAS_SEED) {
    const seedKeys = new Set(clavesDe(seed));
    const existente = out.find((p) => clavesDe(p).some((k) => seedKeys.has(k)));
    if (existente) {
      // Fusionar aliases sin duplicar.
      const alias = new Set([...(existente.aliases ?? []), ...seed.aliases, existente.nombre]);
      alias.delete(existente.nombre);
      existente.aliases = [...alias];
    } else {
      out.push(seed as Persona);
    }
  }
  return out;
}

export async function buildProfile(): Promise<void> {
  await fs.mkdir(config.paths.profileDir, { recursive: true });

  const convsAll = await leerNormalizadas(); // sin ruido
  if (convsAll.length === 0) {
    throw new Error('No hay conversaciones normalizadas. Corre primero: npm run ia:normalize');
  }
  // Limite de tokens del proveedor (Groq free = 12k TPM): usar las N mas recientes.
  const MAX = Number(process.env.PROFILE_MAX_CONVS ?? 45);
  const convs = [...convsAll].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, MAX);

  let libro = '';
  try {
    libro = await fs.readFile(config.paths.libroFile, 'utf-8');
  } catch {
    console.warn('Aviso: no se encontro data/profile/libro.md (se construira sin el libro).');
  }

  const prompt =
    `${INSTRUCCIONES}\n\n` +
    `===== PERSONAS YA VERIFICADAS (inclúyelas SI o SI, completa y respeta sus aliases) =====\n` +
    `${JSON.stringify(PERSONAS_SEED, null, 2)}\n\n` +
    `===== FUENTE 1: RESUMENES DE CONVERSACIONES (${convs.length} mas recientes de ${convsAll.length}) =====\n` +
    `${corpusResumenes(convs)}\n\n` +
    `===== FUENTE 2: LIBRO DE JHONATTAN (estilo/valores) =====\n` +
    `${libro.slice(0, 5000)}`;

  console.log(`Generando perfil con ${convs.length} conversaciones... (esto consume tokens)`);

  const bundle = await completeJson<ProfileBundle>(prompt, {
    model: config.llm.models.reasoning,
    maxTokens: 2200,
    contexto: 'profile',
  });

  await fs.writeFile(
    config.paths.perfilFile,
    JSON.stringify(bundle.perfil, null, 2),
    'utf-8',
  );
  const personasFinal = mergeSeed(bundle.personas ?? []);
  await fs.writeFile(
    config.paths.personasFile,
    JSON.stringify(personasFinal, null, 2),
    'utf-8',
  );
  await fs.writeFile(config.paths.estiloFile, bundle.estilo_markdown.trim() + '\n', 'utf-8');

  console.log('Perfil generado:');
  console.log(`  - ${config.paths.perfilFile}`);
  console.log(`  - ${config.paths.personasFile} (${personasFinal.length} personas)`);
  console.log(`  - ${config.paths.estiloFile}`);
  console.log('\nIMPORTANTE: revisa estos archivos a mano (la transcripcion tiene ruido).');
}

if (require.main === module) {
  buildProfile().catch((e) => {
    console.error('Error en buildProfile:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
