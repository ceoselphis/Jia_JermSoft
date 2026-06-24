# Jia — Jhonattan IA

Asistente personal que responde y actúa **como Jhonattan**, construido sobre las
conversaciones que graba el dispositivo **Bee Computer** + su libro.

## Qué hace (Fase 1)
- Descarga las conversaciones de Bee **cada 6 horas** (cron).
- Las limpia/normaliza y construye un **perfil** (quién eres, tu gente, tu estilo).
- Responde preguntas **como tú, con citas** a tus conversaciones (CLI y Telegram).

> Seguridad: todo lo que tenga efecto externo (responder por ti, pagos) será **borrador +
> tu aprobación** en fases siguientes. Fase 1 es solo lectura + Q&A.

## Requisitos
- Node 18+ y el CLI `bee` ya autenticado en el sistema (lo usa el descargador).
- Una `GEMINI_API_KEY` (Google Gemini, gratis en https://aistudio.google.com/apikey). Telegram es opcional.

## Setup
```bash
cd C:\Proyectos\Jia
npm install
copy .env.example .env   # y completa GEMINI_API_KEY (y Telegram si lo usas)
```

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run scheduler` | Arranca el cron: descarga + procesa cada 6h (corre una vez al inicio). |
| `npm run bee:download` | Corre el pipeline una vez (lista → detalle → normalize → index). |
| `npm run bee:download 30` | Backfill: descarga los últimos 30 días. |
| `npm run ia:normalize` | Solo normaliza lo ya descargado. |
| `npm run ia:profile` | Genera `perfil.json`, `personas.json`, `estilo.md` (usa Gemini). |
| `npm run ia:index` | Reconstruye el índice de búsqueda. |
| `npm run ia -- "tu pregunta"` | Pregunta por consola; responde como Jhonattan con citas. |
| `npm run ia:bot` | Bot de Telegram (tu consola privada). |
| `npm start` | Producción: `dist/scheduler.js` (tras `npm run build`). |

## Estructura
```
src/
  scheduler.ts          # cron cada 6h -> runPipeline
  config.ts             # lee .env (claves, ventana, cron)
  llm.ts                # cliente Gemini (complete / completeJson)
  bee/
    ConversacionesByFecha.ts      # bee conversations list (rango dinámico)
    ConversacionesDetalleByDay.ts # bee conversations get -> por_dia
    pipeline.ts                   # list -> detalle -> normalize -> index
  ingest/normalize.ts   # limpia + dedup -> data/normalized/*.jsonl
  profile/
    buildProfile.ts     # perfil/personas/estilo (Gemini)
    personas.seed.ts    # gente verificada (Pablo, Solet, Isael, Julián...) con alias
  index/buildIndex.ts   # búsqueda léxica + retrieve()
  brain/ask.ts          # responde como Jhonattan, con privacidad y citas
  cli.ts                # consola de pruebas
  telegram/bot.ts       # consola de control privada
data/
  profile/libro.md      # tu libro (fuente de estilo)
  normalized/, index/   # artefactos generados (en .gitignore)
```

## Configuración del cron (.env)
- `BEE_CRON` — expresión cron (default `0 */6 * * *`, cada 6h).
- `BEE_LOOKBACK_DAYS` — días hacia atrás por corrida (default `2`). Normalize es idempotente.

## Primer arranque sugerido
```bash
npm install
# 1) backfill inicial (ajusta los días según tu historial)
npm run bee:download 120
# 2) genera tu perfil
npm run ia:profile
# 3) prueba
npm run ia -- "¿quién es Pablo y cuál fue su último proyecto?"
# 4) deja el cron corriendo
npm run scheduler
```
