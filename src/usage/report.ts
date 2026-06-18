import { config } from '../config';
import { notify } from '../notify/ntfy';
import { resumirDesde, Resumen } from './tracker';

/**
 * Control de gastos del API: arma un reporte de las ultimas 6h + del dia +
 * acumulado total, y lo notifica por ntfy. Si el dia supera el presupuesto,
 * la notificacion va con prioridad alta.
 *
 * CLI:  npm run ia:gastos
 * Cron: lo dispara el scheduler cada 6h (COSTOS_CRON).
 */

function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function inicioDelDiaCaracas(): number {
  // 00:00 hora Caracas (UTC-4) de hoy, en ms epoch.
  const ahora = new Date();
  const caracas = new Date(ahora.getTime() - 4 * 60 * 60 * 1000);
  const y = caracas.getUTCFullYear();
  const m = caracas.getUTCMonth();
  const d = caracas.getUTCDate();
  return Date.UTC(y, m, d, 4, 0, 0); // 04:00 UTC == 00:00 Caracas
}

function lineaModelos(r: Resumen): string {
  const partes = Object.entries(r.porModelo).map(
    ([m, v]) => `  ${m}: ${v.llamadas} llam · ${usd(v.costoUSD)}`,
  );
  return partes.length ? partes.join('\n') : '  (sin uso)';
}

export interface ReporteGastos {
  ultimas6h: Resumen;
  hoy: Resumen;
  total: Resumen;
  superoPresupuesto: boolean;
  texto: string;
}

export function construirReporte(): ReporteGastos {
  const ahora = Date.now();
  const ultimas6h = resumirDesde(ahora - 6 * 60 * 60 * 1000);
  const hoy = resumirDesde(inicioDelDiaCaracas());
  const total = resumirDesde(0);

  const presupuesto = config.costos.presupuestoDiarioUSD;
  const superoPresupuesto = hoy.costoUSD > presupuesto;

  const texto =
    `Gasto API Jia\n` +
    `Ultimas 6h: ${usd(ultimas6h.costoUSD)} (${ultimas6h.llamadas} llamadas)\n` +
    `Hoy: ${usd(hoy.costoUSD)} / presupuesto ${usd(presupuesto)}` +
    (superoPresupuesto ? '  ⚠️ SUPERADO' : '') +
    `\n` +
    `Total acumulado: ${usd(total.costoUSD)} (${total.llamadas} llamadas)\n` +
    `Tokens hoy: in ${hoy.inputTokens} · out ${hoy.outputTokens} · cache ${hoy.cacheTokens}\n` +
    `Por modelo (hoy):\n${lineaModelos(hoy)}`;

  return { ultimas6h, hoy, total, superoPresupuesto, texto };
}

/** Construye el reporte y lo manda por ntfy. Devuelve el texto. */
export async function reportarGastos(): Promise<string> {
  const r = construirReporte();
  await notify(r.texto, {
    title: r.superoPresupuesto ? 'Gasto API: PRESUPUESTO SUPERADO' : 'Gasto API (6h)',
    priority: r.superoPresupuesto ? 5 : 3,
    tags: r.superoPresupuesto ? ['warning', 'money'] : ['money'],
  });
  return r.texto;
}

if (require.main === module) {
  reportarGastos()
    .then((t) => console.log(t))
    .catch((e) => {
      console.error('Error en reporte de gastos:', e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
