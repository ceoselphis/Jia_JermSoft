# Despliegue de Jia en el servidor (junto a Hermes)

Pasos en orden para correr Jia en el **mismo servidor que Hermes Agent**.
Copia/pega tal cual. Requiere un **VPS** con acceso SSH (no sirve hosting compartido).

> Regla de oro: los secretos (`GEMINI_API_KEY`, tokens) se ponen **solo** en el
> `.env` del servidor. Nunca en Git ni en el chat.

---

## 1. Clonar e instalar
```bash
git clone https://github.com/ceoselphis/Jia_JermSoft.git jia
cd jia
npm install
npm run build
```

## 2. Configurar secretos (.env)
```bash
cp .env.example .env
nano .env          # o vi .env
```
Completa al menos:
```
GEMINI_API_KEY=AIza...                # tu clave de Google Gemini (gratis en aistudio.google.com/apikey)
NTFY_SERVER=https://ntfy.thomas-talk.me
NTFY_TOPIC=fibex-jia-99
NTFY_TOKEN=tk_...                     # token write-only de ntfy
HERMES_HOME=/root/.hermes             # carpeta HOME de Hermes (ver paso 5)
```

## 3. Instalar y autenticar el CLI `bee` (lo usa el cron para descargar)
```bash
# instala el CLI bee segun su doc (ej. npm i -g @beeai/cli) y luego:
bee conversations list
# si pide login, autentica y vuelve a probar
```
> Si `bee` no se puede autenticar en el servidor, el cron de descarga debe
> quedarse en tu PC; en ese caso, ver "Plan B" abajo.

## 4. Carga inicial (backfill) + perfil
```bash
npm run bee:download 120     # descarga ~120 dias de conversaciones
npm run ia:profile           # genera perfil/personas/estilo (usa Gemini)
```

## 5. Conectar la memoria a Hermes
Averigua la carpeta HOME de Hermes (donde esta `SOUL.md`):
```bash
hermes config | grep -i home    # o busca donde vive SOUL.md
```
Pon esa ruta en `.env` → `HERMES_HOME=...` y genera la memoria:
```bash
npm run ia:hermes            # escribe SOUL.md/USER.md/MEMORY.md en HERMES_HOME
```

## 6. Conectar Jia como herramienta MCP de Hermes
```bash
hermes mcp add jia --command node --args dist/mcp/server.js
hermes mcp list              # verifica que aparece "jia"
```
> Alternativa por URL: `npm run mcp:http` (queda en http://localhost:8787/mcp) y
> luego `hermes mcp add jia --url http://localhost:8787/mcp`. La de `--command`
> (stdio) es mas simple: Hermes arranca Jia solo.

## 7. Dejar el cron 24/7 (descarga + gastos cada 6h)
Con **pm2** (recomendado, sobrevive reinicios):
```bash
npm i -g pm2
pm2 start npm --name jia-scheduler -- run scheduler
pm2 save
pm2 startup        # sigue la instruccion que imprime (para auto-arranque)
```
O simple con nohup:
```bash
nohup npm run scheduler > scheduler.log 2>&1 &
```

## 8. Modelo de Hermes
```bash
hermes model       # elige el modelo por defecto de Hermes
```
> Nota: Hermes es un agente aparte con su propio motor. Si lo pones en Claude necesita una API
> key de Anthropic activa (la nuestra está inválida — ver `CONTEXT.md`). Jia ya NO usa Anthropic: corre con Gemini.

---

## Verificacion
```bash
hermes mcp list                         # debe listar "jia"
npm run ia -- "¿quien es Pablo?"        # Q&A directo de Jia (sanity check)
npm run ia:gastos                       # te llega el reporte por ntfy
pm2 status                              # jia-scheduler "online"
```
En Hermes, pregunta algo como *"busca en mis conversaciones que dije de Pablo"*:
deberia llamar a la tool `buscar_conversaciones` de Jia.

---

## Actualizar el codigo despues
```bash
cd jia
git pull
npm install
npm run build
pm2 restart jia-scheduler
```

---

## Plan B — si `bee` NO se puede autenticar en el servidor
- El **cron de descarga** se queda en tu PC (donde `bee` ya esta logueado).
- Tu PC genera los artifacts y los **empuja** al servidor (scp a la carpeta de Jia
  en el server, o el MCP de Jia corre en tu PC con un tunel). Pidelo y lo cableo.
