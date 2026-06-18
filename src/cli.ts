import { ask } from './brain/ask';

/**
 * Consola para probar el cerebro rapido.
 * Uso: npm run ia -- "¿en que empresa trabajo?"
 */
async function main(): Promise<void> {
  const pregunta = process.argv.slice(2).join(' ').trim();
  if (!pregunta) {
    console.error('Uso: npm run ia -- "tu pregunta aqui"');
    process.exit(1);
  }

  const { respuesta, citas } = await ask(pregunta);

  console.log('\n' + respuesta + '\n');
  if (citas.length) {
    console.log('— Fuentes —');
    for (const c of citas) {
      console.log(`  [${c.fecha} #${c.id}] (score ${c.score}) ${c.fragmento}`);
    }
  }
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
