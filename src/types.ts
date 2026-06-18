/** Tipos compartidos del modulo IA. */

/** Una intervencion hablada dentro de una conversacion (formato Bee). */
export interface Utterance {
  speaker: string; // "Jhonattan" | "Unknown" | ...
  text: string;
  spoken_at: string | null;
  start: number;
  end: number;
}

/** Conversacion cruda tal como la guarda el pipeline de Bee (*_completo.json). */
export interface RawConversation {
  id: string;
  start_time: string;
  end_time: string;
  state: string;
  summary: string;
  atmosphere: string;
  key_takeaways: string[];
  action_items: string[];
  raw_content: string;
  detailed_content?: {
    utterances?: Utterance[];
    [k: string]: unknown;
  };
}

/** Conversacion ya normalizada (1 por linea en conversaciones.jsonl). */
export interface NormalizedConversation {
  id: string;
  fecha: string; // YYYY-MM-DD (America/Caracas)
  inicio: string; // ISO
  fin: string; // ISO
  duracionMin: number;
  summary: string;
  atmosphere: string;
  key_takeaways: string[];
  action_items: string[];
  utterances: Utterance[];
  esRuido: boolean; // true si parece audio de fondo / medios
}
