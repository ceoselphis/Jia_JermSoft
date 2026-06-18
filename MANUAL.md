# Manual de operación — Jia

Guía paso a paso para correr Jia (Jhonattan IA).

## Paso 0 · Requisitos (una sola vez)
- **Node.js** → `node -v`
- **CLI `bee`** autenticado → `bee --version`
- **API key de Claude** → ya en `.env`
- **ntfy** (servidor Fibex) → ya en `.env`

## Paso 1 · Abrir el proyecto
```powershell
cd C:\Proyectos\Jia
```

## Paso 2 · Instalar dependencias (solo la 1ª vez)
```powershell
npm install
```

## Paso 3 · Confirmar que `bee` está logueado
```powershell
bee conversations list
```
Si pide login, reautentica y repite.

## Paso 4 · Descarga inicial (backfill — el número = días hacia atrás)
```powershell
npm run bee:download 120
```
Hace: lista → detalle → normalizar → indexar. Idempotente (no duplica).

## Paso 5 · Generar el perfil (usa Claude)
```powershell
npm run ia:profile
```
Crea `data/profile/perfil.json`, `personas.json`, `estilo.md`. Revísalos una vez.

## Paso 6 · Probar el Q&A
```powershell
npm run ia -- "¿quién es Pablo y cuál fue su último proyecto?"
npm run ia -- "dame un consejo para mi equipo de desarrollo"
```

## Paso 7 · Notificaciones de gasto (teléfono)
1. App **ntfy** → Default server: `https://ntfy.thomas-talk.me`
2. Subscribe to topic: `fibex-jia-99`
3. Prueba: `npm run ia:gastos`

## Paso 8 · Dejar el agente corriendo (cron)
```powershell
npm run scheduler
```
Descarga + procesa cada 6h, y reporte de gasto cada 6h. Corre una vez al arrancar.
Detener: `Ctrl + C`.

---

## Uso diario
| Quiero… | Comando |
|---|---|
| Preguntarle algo | `npm run ia -- "tu pregunta"` |
| Ver mi gasto ahora | `npm run ia:gastos` |
| Forzar descarga ya | `npm run bee:download` |
| Regenerar perfil | `npm run ia:profile` |
| Dejar todo automático | `npm run scheduler` |
| Bot de Telegram (opcional) | `npm run ia:bot` |

## Producción (opcional)
```powershell
npm run build
npm start          # corre dist/scheduler.js
```

## Problemas comunes
- **"Faltan variables de entorno"** → revisa `.env` (ANTHROPIC_API_KEY, NTFY_*).
- **La descarga no baja nada** → `bee conversations list`; si pide login, reautentica.
- **No llega la notificación** → server `https://ntfy.thomas-talk.me`, topic `fibex-jia-99`.
- **Error de cuota/tokens de Claude** → revisa saldo en console.anthropic.com.

## Configuración (.env)
| Variable | Para qué |
|---|---|
| `ANTHROPIC_API_KEY` | Motor Claude (obligatorio) |
| `NTFY_SERVER` / `NTFY_TOPIC` / `NTFY_TOKEN` | Notificaciones de gasto |
| `BEE_LOOKBACK_DAYS` | Días por corrida del cron (default 2) |
| `BEE_CRON` / `COSTOS_CRON` | Frecuencia (default cada 6h) |
| `COSTOS_PRESUPUESTO_DIARIO_USD` | Alerta si se supera (default 5) |
| `TELEGRAM_IA_BOT_TOKEN` / `TELEGRAM_JHONATTAN_CHAT_ID` | Bot (opcional) |
