import TelegramBot from 'node-telegram-bot-api';
import { config, requireConfig } from '../config';
import { ask } from '../brain/ask';

/**
 * Bot de Telegram = tu consola de control privada.
 * Solo responde al chat del dueno (TELEGRAM_JHONATTAN_CHAT_ID).
 *
 * Uso: npm run ia:bot
 */
async function main(): Promise<void> {
  requireConfig(['gemini', 'telegram']);
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
    if (texto === '/start') {
      await bot.sendMessage(
        chatId,
        'Soy Jhonattan IA. Preguntame lo que quieras sobre tu vida, trabajo o gente, ' +
          'y te respondo con citas a tus conversaciones.',
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
