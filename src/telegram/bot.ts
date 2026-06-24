import TelegramBot from 'node-telegram-bot-api';
import * as fs from 'fs';
import * as path from 'path';
import { config, requireConfig } from '../config';
import { ask, construirSystemChat, construirSystemDev } from '../brain/ask';
import { completeSession, agentSession } from '../llm';
import { agregarHecho, listarHechos, borrarHecho } from '../brain/hechos';

interface Estado {
  mode: 'chat' | 'dev';
  sessionId?: string;
  proyecto?: string;
  cwd?: string;
}

/** Envia texto largo partido en trozos (Telegram limita ~4096 chars). */
async function enviarLargo(bot: TelegramBot, chatId: string, texto: string): Promise<void> {
  const t = texto || '(sin respuesta)';
  const MAX = 3900;
  for (let i = 0; i < t.length; i += MAX) {
    await bot.sendMessage(chatId, t.slice(i, i + MAX));
  }
}

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

  // Estado por chat: modo (chat/dev), sesion de Claude (contexto/loop) y proyecto.
  const estados = new Map<string, Estado>();
  const getEstado = (id: string): Estado => estados.get(id) ?? { mode: 'chat' };

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
        'Soy Jia, tu asistente con memoria de conversacion.\n\n' +
          '💬 Modo charla (por defecto): te ayudo con ideas, decisiones, dudas — recuerdo el hilo.\n' +
          '🛠️ Modo desarrollo: construyo proyectos de verdad (creo/edito archivos, ejecuto).\n\n' +
          'Comandos:\n' +
          '• /proyecto <nombre> — entra a MODO DESARROLLO en un workspace.\n' +
          '• /proyectos — lista tus proyectos.\n' +
          '• /salir — vuelve al modo charla.\n' +
          '• /nuevo — reinicia el hilo actual.\n' +
          '• /buscar <pregunta> — busca en tus conversaciones de Bee (con citas).\n' +
          '• "recuerda: <algo>" · /hechos · /olvida <n>',
      );
      return;
    }

    // --- Reiniciar el hilo de conversacion ---
    if (texto === '/nuevo' || texto === '/reset') {
      const e = getEstado(chatId);
      estados.set(chatId, { ...e, sessionId: undefined });
      await bot.sendMessage(chatId, '🔄 Hilo reiniciado.' + (e.mode === 'dev' ? ` (sigues en proyecto "${e.proyecto}")` : ''));
      return;
    }

    // --- Entrar a MODO DESARROLLO en un proyecto ---
    if (low.startsWith('/proyecto ')) {
      const nombre = texto.slice(10).trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
      if (!nombre) {
        await bot.sendMessage(chatId, 'Dale un nombre: /proyecto mi-app');
        return;
      }
      const cwd = path.join(config.paths.proyectosDir, nombre);
      try {
        fs.mkdirSync(cwd, { recursive: true });
      } catch (e) {
        await bot.sendMessage(chatId, 'No pude crear el workspace: ' + (e instanceof Error ? e.message : String(e)));
        return;
      }
      const nuevo = fs.readdirSync(cwd).length === 0;
      estados.set(chatId, { mode: 'dev', proyecto: nombre, cwd, sessionId: undefined });
      await bot.sendMessage(
        chatId,
        `🛠️ MODO DESARROLLO · proyecto "${nombre}"\n${cwd}\n${nuevo ? '(workspace nuevo)' : '(workspace existente)'}\n\nDime qué construir. Ej: "crea una API REST en Node con un endpoint /health". (/salir para volver a charla)`,
      );
      return;
    }

    // --- Listar proyectos ---
    if (low === '/proyectos') {
      let lista: string[] = [];
      try {
        lista = fs.readdirSync(config.paths.proyectosDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
      } catch { /* dir no existe aun */ }
      await bot.sendMessage(
        chatId,
        lista.length ? 'Tus proyectos:\n' + lista.map((p) => `• ${p}`).join('\n') + '\n\nEntra con /proyecto <nombre>.' : 'Aun no tienes proyectos. Crea uno con /proyecto <nombre>.',
      );
      return;
    }

    // --- Salir del modo desarrollo ---
    if (low === '/salir') {
      estados.set(chatId, { mode: 'chat' });
      await bot.sendMessage(chatId, '💬 De vuelta en modo charla.');
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

    // --- Mensaje normal: segun el modo (charla o desarrollo), con memoria de hilo ---
    const st = getEstado(chatId);
    try {
      await bot.sendChatAction(chatId, 'typing');
      // El system prompt solo en el 1er turno; luego la sesion de Claude lo conserva.
      let res;
      if (st.mode === 'dev' && st.cwd) {
        const system = st.sessionId ? undefined : await construirSystemDev(st.proyecto ?? 'proyecto');
        res = await agentSession(texto, { sessionId: st.sessionId, system, cwd: st.cwd, contexto: 'proyecto' });
      } else {
        const system = st.sessionId ? undefined : await construirSystemChat();
        res = await completeSession(texto, { sessionId: st.sessionId, system, contexto: 'chat' });
      }
      estados.set(chatId, { ...st, sessionId: res.sessionId ?? st.sessionId });
      await enviarLargo(bot, chatId, res.text);
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
