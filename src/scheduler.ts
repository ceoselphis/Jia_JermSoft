import * as cron from 'node-cron';
import { config } from './config';
import { runPipeline } from './bee/pipeline';
import { reportarGastos } from './usage/report';

/**
 * Scheduler de Jia: descarga + procesa las conversaciones cada 6 horas.
 *
 * Uso:
 *   npm run scheduler   (desarrollo, ts-node)
 *   npm start           (produccion, dist/scheduler.js)
 *
 * Config (en .env): BEE_CRON (default cada 6 horas), BEE_LOOKBACK_DAYS (default 2).
 */
async function main(): Promise<void> {
  if (!cron.validate(config.bee.cron)) {
    throw new Error(`BEE_CRON invalido: "${config.bee.cron}"`);
  }

  console.log('Jia scheduler iniciado.');
  console.log(`  Cron: ${config.bee.cron} (${config.bee.timezone})`);
  console.log(`  Ventana: ultimos ${config.bee.lookbackDays} dias`);

  // Corrida inicial al arrancar (para no esperar 6h la primera vez).
  runPipeline().catch(() => console.error('La corrida inicial fallo (continuo agendado).'));

  cron.schedule(
    config.bee.cron,
    () => {
      console.log(`\n[${new Date().toISOString()}] Disparando pipeline programado...`);
      runPipeline().catch(() => console.error('La corrida programada fallo.'));
    },
    { timezone: config.bee.timezone },
  );

  // Control de gastos del API: reporte por ntfy cada 6h.
  if (cron.validate(config.costos.cron)) {
    console.log(`  Reporte de gastos: ${config.costos.cron} (${config.costos.timezone})`);
    cron.schedule(
      config.costos.cron,
      () => {
        console.log(`\n[${new Date().toISOString()}] Enviando reporte de gastos...`);
        reportarGastos().catch(() => console.error('El reporte de gastos fallo.'));
      },
      { timezone: config.costos.timezone },
    );
  } else {
    console.warn(`COSTOS_CRON invalido: "${config.costos.cron}" (omito reporte de gastos)`);
  }

  // Mantener el proceso vivo.
  process.stdin.resume();
}

main().catch((e) => {
  console.error('No se pudo iniciar el scheduler:', e instanceof Error ? e.message : e);
  process.exit(1);
});
