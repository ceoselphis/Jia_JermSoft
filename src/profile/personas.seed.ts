/**
 * Semilla de personas conocidas (verificadas a mano sobre las conversaciones).
 * buildProfile inyecta esto como pista y GARANTIZA que queden en personas.json
 * con sus aliases, para que la IA no confunda nombres (p. ej. Yul != Dani).
 *
 * Si descubres mas datos, edita aqui: es la fuente curada.
 */
export interface PersonaSeed {
  nombre: string;
  aliases: string[];
  relacion: string;
  prioridad: 'alta' | 'media' | 'baja';
  confianza: 'alta' | 'media' | 'baja';
  conflicto: 'alto' | 'medio' | 'bajo' | 'ninguno';
  notas: string;
}

export const PERSONAS_SEED: PersonaSeed[] = [
  {
    nombre: 'Yul',
    aliases: ['amor'],
    relacion: 'pareja',
    prioridad: 'alta',
    confianza: 'alta',
    conflicto: 'ninguno',
    notas:
      'Pareja de Jhonattan (le dice "amor"). NO confundir con "Dani/Daniela", que es otra persona.',
  },
  {
    nombre: 'Julián',
    aliases: ['Julian'],
    relacion: 'directiva',
    prioridad: 'alta',
    confianza: 'alta',
    conflicto: 'ninguno',
    notas: 'Directiva/liderazgo ejecutivo. Persona a atender con prioridad y rapidez.',
  },
  {
    nombre: 'Yasmín',
    aliases: ['Yasmin', 'señora Yasmín'],
    relacion: 'directiva',
    prioridad: 'alta',
    confianza: 'media',
    conflicto: 'bajo',
    notas: 'Directiva/liderazgo ejecutivo de FIBEX.',
  },
  {
    nombre: 'Alexander Ramírez',
    aliases: ['Alexander', 'Alex'],
    relacion: 'par',
    prioridad: 'media',
    confianza: 'media',
    conflicto: 'alto',
    notas:
      'Líder del equipo de Desarrollo (contraparte de Jhonattan, que lleva Infraestructura/Innovación). ' +
      'Relación tensa: no comparte info, no sube a repos, falta a reuniones, interfiere con el equipo de Jhonattan. ' +
      'Tiene empresas propias (Way, Pinga). Entró a la empresa ~8 de marzo de 2026.',
  },
  {
    nombre: 'Isael',
    aliases: ['Izael'],
    relacion: 'equipo',
    prioridad: 'media',
    confianza: 'alta',
    conflicto: 'bajo',
    notas:
      'Desarrollador del equipo de Jhonattan (página de pagos RD, landing pages). Cercano; Jhonattan lo ' +
      'mentorea y defiende frente a Alexander. Punto débil: asistencia/constancia irregular.',
  },
  {
    nombre: 'Pablo Gutiérrez',
    aliases: ['Pablo'],
    relacion: 'equipo',
    prioridad: 'media',
    confianza: 'alta',
    conflicto: 'bajo',
    notas:
      'Desarrollador backend / infraestructura del equipo (~4 años en la empresa). Maneja servidores, ' +
      'credenciales (Ubuntu, PPK), túneles SSH a las BD (MasterDB 10.10.10.16, ADDB 10.10.10.15) y la ' +
      'conciliación de pagos SAE. Último proyecto: backend de conciliación (duplicados banco 6 díg vs SAE 8 díg, ' +
      'super-duplicados, BD histórica). Pendiente recurrente: falta a reuniones.',
  },
  {
    nombre: 'José Solet',
    aliases: ['José Soleta', 'Jose Solet', 'Soleta', 'consoleto'],
    relacion: 'equipo',
    prioridad: 'media',
    confianza: 'media',
    conflicto: 'bajo',
    notas:
      'Desarrollador del equipo, encargado de los kioscos / caja automática de pago. Reporta incidencias ' +
      '(pagos rechazados de kioscos). Jhonattan mandó auditar su código. NO confundir con "José William".',
  },
];
