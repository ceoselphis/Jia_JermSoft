import * as fs from 'fs/promises';
import { config } from '../config';
import { leerNormalizadas } from '../ingest/normalize';
import { PERSONAS_SEED, PersonaSeed } from '../profile/personas.seed';

/**
 * Genera los 3 archivos de memoria built-in de Hermes Agent a partir de los
 * artifacts de Jia:
 *   - SOUL.md   : identidad/voz + reglas de privacidad + politica de aprobacion
 *   - USER.md   : quien es Jhonattan (perfil) + su gente clave (personas)
 *   - MEMORY.md : hechos clave + pendientes/action items recientes
 *
 * No usa Claude: es determinista y barato. Lee perfil.json/personas.json si
 * existen; si no, cae a la semilla y al libro.
 *
 * Uso: npm run ia:hermes
 * Salida: data/hermes/{SOUL,USER,MEMORY}.md  → luego se copian a Hermes.
 */

interface Perfil {
  nombre?: string;
  empresa?: string;
  grupo_corporativo?: string;
  cargo?: string;
  rol_resumen?: string;
  proyectos?: string[];
  ubicaciones?: string[];
  familia?: string;
  pareja?: string;
  valores?: string[];
  rasgos?: string[];
}

interface Persona {
  nombre: string;
  aliases?: string[];
  relacion?: string;
  prioridad?: string;
  confianza?: string;
  conflicto?: string;
  notas?: string;
}

async function leerJson<T>(ruta: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(ruta, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function leerTexto(ruta: string): Promise<string> {
  try {
    return await fs.readFile(ruta, 'utf-8');
  } catch {
    return '';
  }
}

const REGLAS_PRIVACIDAD = `## Reglas de privacidad (OBLIGATORIAS)
1. Responde como Jhonattan, en primera persona, con su voz.
2. Si la pregunta toca temas intimos, familiares, de salud, dinero personal,
   pareja, hijas o conflictos personales: NO expongas detalles. Responde con
   prudencia y, ante un tercero, marca al final: [ESCALAR_A_JHONATTAN].
3. No reveles datos sensibles de terceros (telefonos, cedulas, montos) salvo
   que sea estrictamente necesario y la peticion sea legitima.
4. Toda accion con efecto externo (responder por mi, pagos, escribir a alguien)
   se entrega como BORRADOR para aprobacion. No la ejecutes sola.`;

function listaMd(items?: string[]): string {
  if (!items || items.length === 0) return '_(sin datos)_';
  return items.map((i) => `- ${i}`).join('\n');
}

function buildSoul(estilo: string, nombre: string): string {
  return `# SOUL — ${nombre} (Jhonattan IA)

Eres **${nombre} IA**: respondes y actuas COMO SI FUERAS ${nombre}, en primera
persona, con su tono y sus valores. Hablas espanol venezolano, directo,
motivador y orientado a la accion.

## Guia de voz (imita este estilo)
${estilo || '_(genera el estilo con `npm run ia:profile`)_'}

${REGLAS_PRIVACIDAD}

## Como respondo
- Conciso y util. Si dan un consejo, con la voz de mi libro (accion, constancia).
- Cito de donde sale la informacion cuando viene de mis conversaciones.
- Si no tengo registro de algo, lo digo; no invento.
`;
}

function buildUser(perfil: Perfil | null, personas: Persona[]): string {
  const p = perfil ?? {};
  const nombre = p.nombre ?? 'Jhonattan Ramírez';

  const personasMd = personas.length
    ? personas
        .map((per) => {
          const alias = per.aliases?.length ? ` (alias: ${per.aliases.join(', ')})` : '';
          const meta = [
            per.relacion && `relacion: ${per.relacion}`,
            per.prioridad && `prioridad: ${per.prioridad}`,
            per.conflicto && per.conflicto !== 'ninguno' && `conflicto: ${per.conflicto}`,
          ]
            .filter(Boolean)
            .join(' · ');
          return `- **${per.nombre}**${alias}${meta ? ` — ${meta}` : ''}${
            per.notas ? `\n  - ${per.notas}` : ''
          }`;
        })
        .join('\n')
    : '_(sin personas; corre `npm run ia:profile`)_';

  return `# USER — Quien soy

- **Nombre:** ${nombre}
- **Empresa:** ${p.empresa ?? 'Corporación Fibex Telecom'}${
    p.grupo_corporativo ? ` (${p.grupo_corporativo})` : ''
  }
- **Cargo:** ${p.cargo ?? 'Liderazgo de Desarrollo / Innovación'}
- **Rol:** ${p.rol_resumen ?? '_(genera con ia:profile)_'}
- **Ubicaciones:** ${(p.ubicaciones ?? []).join(', ') || '_(sin datos)_'}
- **Familia:** ${p.familia ?? '_(privado)_'}
- **Pareja:** ${p.pareja ?? '_(privado)_'}

## Mis proyectos
${listaMd(p.proyectos)}

## Mis valores
${listaMd(p.valores)}

## Mis rasgos
${listaMd(p.rasgos)}

## Mi gente clave
${personasMd}
`;
}

async function buildMemory(): Promise<string> {
  // Action items recientes (ultimos 30 dias) como pendientes, dedup.
  let pendientes: string[] = [];
  try {
    const convs = await leerNormalizadas();
    const corte = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const vistos = new Set<string>();
    const recientes = convs
      .filter((c) => new Date(c.inicio).getTime() >= corte)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    for (const c of recientes) {
      for (const ai of c.action_items) {
        const k = ai.trim().toLowerCase().slice(0, 80);
        if (!k || vistos.has(k)) continue;
        vistos.add(k);
        pendientes.push(`- [ ] ${ai.trim()}  _(${c.fecha})_`);
        if (pendientes.length >= 40) break;
      }
      if (pendientes.length >= 40) break;
    }
  } catch {
    /* sin normalizadas todavia */
  }

  return `# MEMORY — Notas y pendientes

_Actualizado: ${new Date().toISOString()}_

## Pendientes / seguimiento (de mis conversaciones recientes)
${pendientes.length ? pendientes.join('\n') : '_(sin pendientes registrados)_'}

> Nota: esta memoria la regenera Jia desde mis conversaciones. No editar a mano;
> los cambios se sobrescriben en la proxima corrida.
`;
}

export async function buildHermes(): Promise<void> {
  await fs.mkdir(config.paths.hermesDir, { recursive: true });

  const perfil = await leerJson<Perfil>(config.paths.perfilFile);
  const personasJson = await leerJson<Persona[]>(config.paths.personasFile);
  const estilo = await leerTexto(config.paths.estiloFile);

  // Personas: usar perfil generado si existe; si no, la semilla verificada.
  const personas: Persona[] =
    personasJson && personasJson.length
      ? personasJson
      : (PERSONAS_SEED as PersonaSeed[]);

  const nombre = perfil?.nombre ?? 'Jhonattan Ramírez';

  await fs.writeFile(config.paths.soulFile, buildSoul(estilo, nombre), 'utf-8');
  await fs.writeFile(config.paths.userFile, buildUser(perfil, personas), 'utf-8');
  await fs.writeFile(config.paths.memoryFile, await buildMemory(), 'utf-8');

  console.log('Archivos de Hermes generados en data/hermes/:');
  console.log(`  - SOUL.md   (identidad + voz + privacidad)`);
  console.log(`  - USER.md   (perfil + ${personas.length} personas)`);
  console.log(`  - MEMORY.md (pendientes recientes)`);
  if (!perfil) {
    console.log('\nAviso: aun no hay perfil.json. Corre `npm run ia:profile` para enriquecer USER.md.');
  }
}

if (require.main === module) {
  buildHermes().catch((e) => {
    console.error('Error en buildHermes:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
