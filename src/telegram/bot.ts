import TelegramBot from 'node-telegram-bot-api';
import { config, requireConfig } from '../config';
import { ask } from '../brain/ask';
import { agregarHecho, listarHechos, borrarHecho } from '../brain/hechos';

/**
 * Bot de Telegram = tu consola de control privada.
 * Solo responde al chat del dueno (TELEGRAM_JHONATTAN_CHAT_ID).
 *
 * Uso: npm run ia:bot
 */
async function main(): Promise<void> {
  requireConfig(['llm', 'telegram']);
  const owner = String(config.telegram.ownerChatId);
  const bot = new TelegramBot(config.telegram.botToken, { polling: true });

  console.log('Jhonattan IA (Telegram) escuchando. Solo respondera al chat autorizado.');

  bot.on('message', async (msg) => {
    const chatId = String(msg.chat.id);

    // Whitelist: ignora a cualquiera que no sea el dueno.
    if (chatId !== owner) {
      await bot.sendMessage(
        chatId,
        'Este asistente es privado. (Tu chat_id: ' + chatId + ')',
      );
      return;
    }

    const texto = (msg.text ?? '').trim();
    if (!texto) return;
    if (texto === '/start' || texto === '/ayuda') {
      await bot.sendMessage(
        chatId,
        'Soy Jhonattan IA. Preguntame lo que quieras sobre tu vida, trabajo o gente, ' +
          'y te respondo con citas a tus conversaciones.\n\n' +
          'Memoria:\n' +
          '• "recuerda: <algo>" — lo aprendo y lo uso de aqui en adelante.\n' +
          '• /hechos — lista lo que me has ensenado.\n' +
          '• /olvida <n> — borra el hecho numero n.',
      );
      return;
    }

    // --- Memoria: aprender un hecho ---
    const low = texto.toLowerCase();
    let hecho = '';
    if (low.startsWith('/recuerda ')) hecho = texto.slice(10);
    else if (low.startsWith('recuerda que ')) hecho = texto.slice(13);
    else if (low.startsWith('recuerda:')) hecho = texto.slice(9);
    if (hecho.trim()) {
      const guardado = agregarHecho(hecho);
      await bot.sendMessage(
        chatId,
        guardado ? `✅ Anotado y aprendido:\n"${guardado}"` : 'No pude guardar eso, intenta de nuevo.',
      );
      return;
    }

    // --- Memoria: listar hechos ---
    if (low === '/hechos' || low === '/recuerdos') {
      const lista = listarHechos();
      await bot.sendMessage(
        chatId,
        lista.length
          ? 'Esto es lo que me has ensenado:\n\n' +
              lista.map((l, i) => `${i + 1}. ${l.replace(/^- /, '')}`).join('\n')
          : 'Todavia no me has ensenado nada. Usa "recuerda: <algo>".',
      );
      return;
    }

    // --- Memoria: olvidar un hecho ---
    if (low.startsWith('/olvida ')) {
      const n = parseInt(texto.slice(8).trim(), 10);
      const ok = borrarHecho(n);
      await bot.sendMessage(
        chatId,
        ok ? `🗑️ Olvidado el hecho #${n}.` : `No encontre el hecho #${n}. Usa /hechos para ver la lista.`,
      );
      return;
    }

    try {
      await bot.sendChatAction(chatId, 'typing');
      const { respuesta, citas } = await ask(texto);
      let salida = respuesta;
      if (citas.length) {
        salida +=
          '\n\n— Fuentes —\n' +
          citas.map((c) => `[${c.fecha} #${c.id}]`).join('  ');
      }
      await bot.sendMessage(chatId, salida);
    } catch (e) {
      await bot.sendMessage(
        chatId,
        'Error procesando tu pregunta: ' + (e instanceof Error ? e.message : String(e)),
      );
    }
  });

  bot.on('polling_error', (e) => console.error('polling_error:', e.message));
}

main().catch((e) => {
  console.error('Error arrancando el bot:', e instanceof Error ? e.message : e);
  process.exit(1);
});
