# CONTEXT — Traspaso de sesión (Jia)

> Lee este archivo al abrir una sesión nueva de Claude Code en `C:\Proyectos\Jia`.
> Resume el porqué, el estado y los próximos pasos. Para el "cómo correr", ver `README.md`.

## Qué es
**Jia (Jhonattan IA):** asistente personal que responde y actúa **como Jhonattan**,
construido sobre las conversaciones que graba el dispositivo **Bee Computer** + su libro
*Desarrollo Personal y Superación*. Objetivo final: responder WhatsApp, hacer seguimiento de
requerimientos, atender cosas simples (pago móvil de las hijas, atender rápido a Julián), dar
reportes de servidores (solo lectura), y llegar a responder como si fuera él.

## Decisiones tomadas (no recontestar)
- **Autonomía:** borrador + aprobación. La IA *propone*, Jhonattan *aprueba*. Nada se envía/paga solo.
- **Canales:** Telegram (consola de control), WhatsApp (responder por él, Fase 3), CLI (pruebas).
- **Motor:** Google **Groq** (`llama-3.3-70b-versatile`, tier gratuito de Groq). *Cambiado desde Claude/Anthropic
  en jun-2026* porque la cuenta de Anthropic rechazaba todas las API keys (`invalid x-api-key`) pese a billing
  activo — falla confirmada en PC y en servidor limpio. El motor vive aislado en `src/llm.ts` (REST, sin SDK).
- **Proyecto propio:** se separó de `ClienteFeliz` a `C:\Proyectos\Jia` (este repo).
- **Descarga:** cron cada 6h (configurable) con ventana móvil; normalize es idempotente.
- **Privacidad:** el cerebro tiene reglas para NO exponer temas íntimos/familiares a terceros y
  marcar `[ESCALAR_A_JHONATTAN]`. Obligatorio antes de conectar WhatsApp.

## Estado actual (Fase 1 — "Perfil Jhonattan" + Q&A)
HECHO y verificado (typecheck verde):
- Pipeline de ingesta: `src/bee/` (lista + detalle) → `src/bee/pipeline.ts`.
- Cron cada 6h: `src/scheduler.ts`.
- Normalizador idempotente: `src/ingest/normalize.ts` (251 convs procesadas en origen; 208 sin ruido).
- Índice léxico + retrieve: `src/index/buildIndex.ts` (verificado: 208 convs, ~19.9k vocabulario).
- Cerebro: `src/brain/ask.ts` (Groq + perfil + citas + privacidad).
- Generador de perfil: `src/profile/buildProfile.ts` + semilla `personas.seed.ts`.
- Interfaces: `src/cli.ts`, `src/telegram/bot.ts`.
- Libro como fuente de estilo: `data/profile/libro.md`.

PENDIENTE (requiere claves del usuario):
- Poner `GROQ_API_KEY` en `.env` y correr `npm run ia:profile` (genera perfil/personas/estilo).
- Probar `npm run ia -- "..."`.
- (Opcional) Telegram: `TELEGRAM_IA_BOT_TOKEN` + `TELEGRAM_JHONATTAN_CHAT_ID` → `npm run ia:bot`.
- Backfill real con el CLI `bee` autenticado: `npm run bee:download 120`.

## Gente clave (ya fichada en src/profile/personas.seed.ts)
- **Yul** — pareja (NO confundir con "Dani/Daniela").
- **Julián** — directiva, prioridad alta. **Yasmín** — directiva.
- **Alexander Ramírez** — par, líder de Desarrollo, relación tensa (empresas propias Way/Pinga).
- **Isael** — equipo (pagos RD/landing), cercano, asistencia irregular.
- **Pablo Gutiérrez** — equipo backend/infra (servidores, túneles SSH, conciliación SAE). Último
  proyecto: backend de conciliación (duplicados banco 6 díg vs SAE 8 díg, BD histórica).
- **José Solet** (alias Soleta/consoleto) — equipo, kioscos/caja automática de pago.

## Próximos pasos (fases siguientes — ver plan completo)
- **Fase 2:** seguimiento de requerimientos (action_items con estado + recordatorios por Telegram).
- **Fase 3:** responder WhatsApp en modo borrador (clasificar remitente, redactar, aprobar).
- **Fase 4:** reportes solo-lectura de servidores. **Fase 5:** pago móvil con aprobación. **Fase 6:** nube.

## Limpieza pendiente
- En `ClienteFeliz` quedó una COPIA de este módulo (`src/ia/`, scripts Bee, deps en package.json).
  Cuando Jia se confirme, borrar eso de ClienteFeliz. (Se dejó por seguridad/reversibilidad.)

## Referencias
- Plan completo (Fases 1–6): `C:\Users\ASUS\.claude\plans\necesito-un-plan-concreto-structured-fox.md`
- Comandos y estructura: `README.md`
