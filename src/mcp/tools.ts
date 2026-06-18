import * as fs from 'fs/promises';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config';
import { retrieve, getConversacion } from '../index/buildIndex';
import { leerNormalizadas } from '../ingest/normalize';
import { PERSONAS_SEED } from '../profile/personas.seed';

/**
 * Registra en un McpServer las herramientas que Jia expone a Hermes.
 * Son SOLO de lectura sobre los artifacts de Jia (no llaman a Claude):
 * Hermes (que ya es el cerebro) razona con estos datos.
 */

const texto = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });

async function leerTexto(ruta: string): Promise<string> {
  try {
    return await fs.readFile(ruta, 'utf-8');
  } catch {
    return '';
  }
}

export function registerTools(server: McpServer): void {
  // 1) Buscar en las conversaciones (RAG lexico).
  server.tool(
    'buscar_conversaciones',
    'Busca en las conversaciones grabadas de Jhonattan y devuelve los fragmentos ' +
      'mas relevantes con su fecha e id. Usa esto para recordar que se dijo sobre ' +
      'un tema, persona o proyecto.',
    { query: z.string(), k: z.number().int().min(1).max(20).optional() },
    async ({ query, k }) => {
      const citas = await retrieve(query, k ?? 6);
      if (citas.length === 0) return texto('Sin resultados para: ' + query);
      const out = citas
        .map((c) => `[${c.fecha} #${c.id}] (score ${c.score})\n${c.fragmento}`)
        .join('\n\n');
      return texto(out);
    },
  );

  // 2) Detalle completo de una conversacion por id.
  server.tool(
    'conversacion',
    'Devuelve el resumen y los puntos clave de una conversacion por su id.',
    { id: z.string() },
    async ({ id }) => {
      const c = await getConversacion(id);
      if (!c) return texto('No existe la conversacion ' + id);
      const tk = c.key_takeaways.map((t) => `- ${t}`).join('\n');
      return texto(
        `[${c.fecha} #${c.id}] (${c.duracionMin} min)\n` +
          `Resumen: ${c.summary}\n${tk ? `Puntos clave:\n${tk}` : ''}`,
      );
    },
  );

  // 3) Perfil + estilo de Jhonattan (quien soy / como hablo).
  server.tool(
    'obtener_perfil',
    'Devuelve el perfil de Jhonattan (empresa, cargo, proyectos, valores) y su ' +
      'guia de estilo/voz. Usalo para responder COMO Jhonattan.',
    {},
    async () => {
      const perfil = await leerTexto(config.paths.perfilFile);
      const estilo = await leerTexto(config.paths.estiloFile);
      return texto(
        `=== PERFIL ===\n${perfil || '(genera con ia:profile)'}\n\n` +
          `=== ESTILO/VOZ ===\n${estilo || '(genera con ia:profile)'}`,
      );
    },
  );

  // 4) Buscar una persona clave por nombre o alias.
  server.tool(
    'buscar_persona',
    'Busca a una persona del entorno de Jhonattan por nombre o alias y devuelve ' +
      'su relacion, prioridad y notas. Evita confundir personas (usa los alias).',
    { nombre: z.string() },
    async ({ nombre }) => {
      const q = nombre.toLowerCase().trim();
      let personas: Array<Record<string, unknown>> = [];
      try {
        personas = JSON.parse(await leerTexto(config.paths.personasFile));
      } catch {
        /* cae a la semilla */
      }
      if (!personas.length) personas = PERSONAS_SEED as unknown as Array<Record<string, unknown>>;

      const match = personas.find((p) => {
        const claves = [String(p.nombre ?? ''), ...((p.aliases as string[]) ?? [])].map((s) =>
          s.toLowerCase(),
        );
        return claves.some((c) => c.includes(q) || q.includes(c));
      });
      if (!match) return texto(`No tengo fichada a "${nombre}".`);
      return texto(JSON.stringify(match, null, 2));
    },
  );

  // 5) Pendientes / action items recientes.
  server.tool(
    'pendientes',
    'Lista los pendientes / action items recientes extraidos de las ' +
      'conversaciones (ultimos N dias, por defecto 30).',
    { dias: z.number().int().min(1).max(365).optional() },
    async ({ dias }) => {
      const corte = Date.now() - (dias ?? 30) * 24 * 60 * 60 * 1000;
      const convs = await leerNormalizadas();
      const vistos = new Set<string>();
      const items: string[] = [];
      for (const c of convs.filter((x) => new Date(x.inicio).getTime() >= corte)) {
        for (const ai of c.action_items) {
          const key = ai.trim().toLowerCase().slice(0, 80);
          if (!key || vistos.has(key)) continue;
          vistos.add(key);
          items.push(`- ${ai.trim()}  (${c.fecha})`);
        }
      }
      return texto(items.length ? items.join('\n') : 'Sin pendientes registrados.');
    },
  );
}
