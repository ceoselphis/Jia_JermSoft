import * as fs from 'fs/promises';
import { config } from '../config';
import { complete } from '../llm';
import { retrieve, getConversacion, Cita } from '../index/buildIndex';
import { leerHechos } from './hechos';

/**
 * El "cerebro": responde como Jhonattan, con citas a sus conversaciones,
 * respetando reglas de privacidad.
 *
 * ask(pregunta) -> { respuesta, citas[] }
 */

export interface RespuestaIA {
  respuesta: string;
  citas: Cita[];
}

async function leerArchivoOpcional(ruta: string): Promise<string> {
  try {
    return await fs.readFile(ruta, 'utf-8');
  } catch {
    return '';
  }
}

/** Construye el system prompt con perfil + estilo + reglas de privacidad. */
async function construirSystem(): Promise<string> {
  const [perfil, personas, estilo] = await Promise.all([
    leerArchivoOpcional(config.paths.perfilFile),
    leerArchivoOpcional(config.paths.personasFile),
    leerArchivoOpcional(config.paths.estiloFile),
  ]);

  return `Eres "Jhonattan IA": un asistente que responde COMO SI FUERAS Jhonattan, en primera persona.
Hablas su idioma (espanol venezolano), con su tono y sus valores.

== GUIA DE VOZ (imita este estilo) ==
${estilo || '(sin guia de estilo todavia; se directo, motivador y orientado a la accion)'}

== PERFIL (hechos sobre ti) ==
${perfil || '(sin perfil)'}

== PERSONAS CLAVE (tu gente; usa aliases para no confundir) ==
${personas || '(sin directorio de personas)'}

== HECHOS QUE JHONATTAN TE HA ENSENADO (memoria; trátalos como VERDAD) ==
${leerHechos() || '(todavia no te ha ensenado hechos; puede hacerlo con "recuerda: ...")'}

== REGLAS (obligatorias) ==
1. Responde con base en el CONTEXTO de conversaciones, el PERFIL y los HECHOS que te ha ensenado.
   Los HECHOS son verdad aunque no aparezcan en las conversaciones. Si no hay evidencia en
   ninguna de las tres fuentes, dilo ("no tengo registro de eso") en vez de inventar.
2. CITA tus fuentes: cuando afirmes algo que viene de una conversacion, menciona la fecha
   (formato [YYYY-MM-DD #id]) que aparece en el contexto.
3. PRIVACIDAD: si la pregunta toca temas intimos, familiares, de salud, conflictos personales
   o tu vida privada (pareja, fidelidad, hijas, dinero personal), NO expongas detalles.
   Responde con prudencia y marca al final la linea: "[ESCALAR_A_JHONATTAN]".
   Esto es clave porque en el futuro esta IA respondera a terceros.
4. No reveles datos sensibles de terceros (telefonos, cedulas, montos) salvo que sea
   estrictamente necesario y la pregunta sea legitima.
5. Se conciso y util. Si te piden un consejo, responde con la voz del libro (accion, constancia).`;
}

/** Expande cada cita con un poco mas de texto de la conversacion (summary). */
async function construirContexto(citas: Cita[]): Promise<string> {
  const bloques: string[] = [];
  for (const cita of citas) {
    const conv = await getConversacion(cita.id);
    if (!conv) continue;
    const tk = conv.key_takeaways.slice(0, 5).map((t) => `  - ${t}`).join('\n');
    bloques.push(
      `[${conv.fecha} #${conv.id}] (duracion ${conv.duracionMin} min)\n` +
        `Resumen: ${conv.summary}\n` +
        (tk ? `Puntos clave:\n${tk}` : ''),
    );
  }
  return bloques.join('\n\n---\n\n');
}

export async function ask(pregunta: string, k = 6): Promise<RespuestaIA> {
  const citas = await retrieve(pregunta, k);
  const contexto = citas.length
    ? await construirContexto(citas)
    : '(sin conversaciones relevantes encontradas)';
  const system = await construirSystem();

  const prompt =
    `PREGUNTA: ${pregunta}\n\n` +
    `===== CONTEXTO: conversaciones relevantes =====\n${contexto}\n\n` +
    `Responde en primera persona como Jhonattan, citando fechas [YYYY-MM-DD #id] cuando uses ` +
    `informacion del contexto. Si toca temas privados, aplica la regla de privacidad.`;

  const respuesta = await complete(prompt, {
    model: config.llm.models.reasoning,
    maxTokens: 1500,
    system,
    contexto: 'ask',
  });

  return { respuesta, citas };
}
