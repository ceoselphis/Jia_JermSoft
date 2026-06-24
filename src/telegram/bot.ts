import TelegramBot from 'node-telegram-bot-api';
import { config, requireConfig } from '../config';
import { ask, construirSystemChat } from '../brain/ask';
import { completeSession } from '../llm';
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

  // Memoria de conversacion por chat: sessionId del CLI de Claude (contexto/loop).
  const sesiones = new Map<string, { sessionId?: string }>();

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
        'Soy Jia, tu asistente. Conversamos con HILO: recuerdo lo que hablamos y te ayudo ' +
          'con lo que sea (desarrollo, ideas, decisiones).\n\n' +
          'Comandos:\n' +
          '• /nuevo — empezar una conversacion desde cero (borra el hilo).\n' +
          '• /buscar <pregunta> — busca en tus conversaciones de Bee y responde con citas.\n' +
          '• "recuerda: <algo>" — lo aprendo para siempre.\n' +
          '• /hechos — lista lo aprendido · /olvida <n> — borra el hecho n.',
      );
      return;
    }

    // --- Reiniciar el hilo de conversacion ---
    if (texto === '/nuevo' || texto === '/reset') {
      sesiones.delete(chatId);
      await bot.sendMessage(chatId, '🔄 Conversacion reiniciada. Empecemos de cero.');
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

    // --- /buscar: Q&A sobre las conversaciones de Bee, con citas (sin memoria de hilo) ---
    if (low.startsWith('/buscar ')) {
      const q = texto.slice(8).trim();
      try {
        await bot.sendChatAction(chatId, 'typing');
        const { respuesta, citas } = await ask(q);
        let salida = respuesta;
        if (citas.length) {
          salida += '\n\n— Fuentes —\n' + citas.map((c) => `[${c.fecha} #${c.id}]`).join('  ');
        }
        await bot.sendMessage(chatId, salida);
      } catch (e) {
        await bot.sendMessage(chatId, 'Error en la busqueda: ' + (e instanceof Error ? e.message : String(e)));
      }
      return;
    }

    // --- Conversacion normal CON MEMORIA (loop): mantiene el hilo via sesion ---
    try {
      await bot.sendChatAction(chatId, 'typing');
      const st = sesiones.get(chatId) ?? {};
      // El system prompt (identidad de Jia) solo en el primer turno; luego la sesion lo conserva.
      const system = st.sessionId ? undefined : await construirSystemChat();
      const { text, sessionId } = await completeSession(texto, {
        sessionId: st.sessionId,
        system,
        contexto: 'chat',
      });
      sesiones.set(chatId, { sessionId: sessionId ?? st.sessionId });
      await bot.sendMessage(chatId, text || '(sin respuesta)');
    } catch (e) {
      await bot.sendMessage(
        chatId,
        'Error procesando tu mensaje: ' + (e instanceof Error ? e.message : String(e)),
      );
    }
  });

  bot.on('polling_error', (e) => console.error('polling_error:', e.message));
}

main().catch((e) => {
  console.error('Error arrancando el bot:', e instanceof Error ? e.message : e);
  process.exit(1);
});
