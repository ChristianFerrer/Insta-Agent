# Insta-Agent

Agente de Telegram que automatiza la creación de posts para una cuenta de Instagram de cartoons vintage de músicos (estilo @bandtoons).

**Flujo:**
1. Pedís un post por Telegram (`/post Freddie Mercury` o lenguaje natural)
2. El agente genera imagen + caption + hashtags en estilo años 30 rubber hose
3. Recibís preview con botones para aprobar / regenerar / editar / descartar
4. Al aprobar, archiva imagen en Supabase Storage. Si Instagram está configurado, publica
5. Cada mañana (10am UTC-3) propone post basado en efemérides musicales

## Stack

- **Next.js 15** (App Router) en TypeScript
- **Vercel** — serverless + cron jobs
- **Supabase** — Postgres + Storage
- **Anthropic Claude** con tool use
- **fal.ai** (Flux dev) para generación de imágenes
- **GitHub** — repo + CI vía push-to-deploy

## Arquitectura

```
Usuario en Telegram
       ↓
Telegram Bot API ──webhook──→ Vercel Function (/api/telegram)
                                     ↓
                          ┌──────────┼───────────┐
                          ↓          ↓           ↓
                    Anthropic     fal.ai     Supabase
                                            (DB + Storage)

Vercel Cron (13:00 UTC diario) → /api/proactive → Telegram
```

El handler de Telegram responde 200 OK inmediatamente y procesa el update en background con `after()` para evitar timeouts de webhook con generaciones largas (~15s).

---

## Setup paso a paso para probar la demo E2E

### 1. Crear cuentas y credenciales

| Servicio | Qué necesitás | Costo |
|---|---|---|
| GitHub | Repo (público o privado) | Gratis |
| Vercel | Cuenta + link al repo | Gratis (Hobby) |
| Supabase | Project nuevo | Gratis |
| Telegram | Bot creado con [@BotFather](https://t.me/BotFather) | Gratis |
| Anthropic | API key en [console.anthropic.com](https://console.anthropic.com) | Pay-per-use |
| fal.ai | API key en [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) | Free tier para empezar |

Para la **demo "solo hasta preview"** podés dejar Instagram para después.

### 2. Setup de Supabase

1. Creá un proyecto nuevo en [supabase.com](https://supabase.com)
2. En el **SQL Editor**, pegá y ejecutá el contenido de `supabase/migrations/0001_initial.sql`
3. En **Storage** → crear un bucket público llamado `bandtoons`
4. En **Project Settings → API**, copiá:
   - `URL` → `SUPABASE_URL`
   - `service_role` key (la secreta, NO la anon) → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Setup de Telegram

1. Hablá con [@BotFather](https://t.me/BotFather) → `/newbot` → seguí los pasos
2. Guardá el **token** que te da → `TELEGRAM_BOT_TOKEN`
3. Obtené tu user ID con [@userinfobot](https://t.me/userinfobot) → `TELEGRAM_ALLOWED_USER_IDS` (coma-separado si son varios)
4. Generá un secreto random largo (≥8 chars) → `TELEGRAM_WEBHOOK_SECRET`

   ```bash
   openssl rand -hex 32
   ```

### 4. Deploy a Vercel

```bash
# Cloná el repo y push a tu GitHub
git remote add origin git@github.com:<tu-user>/insta-agent.git
git push -u origin main

# Importá el repo en https://vercel.com/new
# Vercel detecta Next.js automáticamente
```

En **Vercel → Settings → Environment Variables**, agregá todas las del `.env.example`:

```
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_ALLOWED_USER_IDS
ANTHROPIC_API_KEY
ANTHROPIC_MODEL              # opcional, default claude-sonnet-4-6
FAL_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET      # bandtoons
CRON_SECRET                  # otro random, mismo formato que webhook secret
```

Redeploy después de agregar las vars.

### 5. Registrar el webhook de Telegram

Una vez deployado, registrá el webhook apuntando a tu URL de Vercel:

```bash
# Localmente (con un .env.local que tenga TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET)
WEBHOOK_BASE_URL=https://tu-app.vercel.app npm run set-webhook
```

O sin scripts:
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://tu-app.vercel.app/api/telegram",
    "secret_token": "TU_WEBHOOK_SECRET",
    "allowed_updates": ["message", "callback_query"]
  }'
```

### 6. Probar el bot

En Telegram, buscá tu bot y mandá:

- `/start` → debería responder con bienvenida
- `/post Freddie Mercury` → genera propuesta
- *"hacé un post tributo a Lemmy"* → lenguaje natural
- *"generá uno de Black Sabbath"* → el agente debería preguntar si querés banda completa o un miembro

En cada propuesta, probá los 4 botones:
- **✅ Aprobar (preview)** — archiva imagen en Supabase Storage y mueve a `posts` tabla
- **🔄 Regenerar imagen** — nueva variante con la misma descripción
- **✏️ Editar caption** — siguiente mensaje reemplaza el caption
- **❌ Descartar** — borra la propuesta

### 7. (Opcional) Activar publicación a Instagram

Configurá `IG_ACCESS_TOKEN` y `IG_BUSINESS_ACCOUNT_ID` en Vercel y redeploy. El botón "Aprobar (preview)" pasa a ser "Publicar" y publica de verdad.

---

## Verificar que todo funciona

```bash
# Health check
curl https://tu-app.vercel.app/api/health
```

Devuelve:
```json
{
  "ok": true,
  "service": "insta-agent",
  "capabilities": {
    "telegram": true, "anthropic": true, "fal": true,
    "supabase": true, "instagram": false
  },
  "allowed_users": 1
}
```

## Cron job

`vercel.json` define un cron diario a las **13:00 UTC** (= 10am AR) que dispara `/api/proactive`. Vercel lo invoca con `Authorization: Bearer <CRON_SECRET>`. Para probarlo manualmente:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://tu-app.vercel.app/api/proactive
```

## Estructura

```
.
├── app/
│   ├── api/
│   │   ├── telegram/route.ts       # Webhook handler
│   │   ├── proactive/route.ts      # Cron-triggered daily suggestion
│   │   └── health/route.ts
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── agent.ts                    # Claude tool-use loop
│   ├── config.ts                   # Lazy env validation
│   ├── db.ts                       # Supabase queries
│   ├── handlers.ts                 # Telegram message/callback handlers
│   ├── prompts.ts                  # System prompts
│   ├── telegram.ts                 # Bot API client + UI
│   ├── types.ts
│   └── tools/
│       ├── image-gen.ts            # Flux via fal.ai
│       ├── caption.ts              # Caption + hashtags
│       ├── instagram.ts            # Graph API publish
│       └── ephemeris.ts            # Daily suggestions
├── data/
│   └── ephemeris.json              # Musical anniversaries dataset
├── supabase/
│   └── migrations/0001_initial.sql
├── scripts/
│   ├── set-webhook.ts
│   └── delete-webhook.ts
├── vercel.json                     # Cron + maxDuration
├── package.json
└── tsconfig.json
```

## Dev local (opcional)

Para iterar prompts/UI sin deployar a cada cambio, podés correr local con un tunnel:

```bash
npm install
cp .env.example .env.local           # llenar con credenciales
npm run dev                          # arranca en localhost:3000

# En otra terminal, exponé local con ngrok o cloudflared:
cloudflared tunnel --url http://localhost:3000

# Registrá el webhook al URL público temporal:
WEBHOOK_BASE_URL=https://abc-123.trycloudflare.com npm run set-webhook
```

## Personalizar el estilo visual

Editás `STYLE_PROMPT_BASE` en `lib/config.ts`. Ese prompt se compone con la descripción del sujeto generada por el agente.

Para una consistencia visual aún mejor, el próximo paso es entrenar una LoRA de Flux con las imágenes originales del feed del cliente y usar ese modelo en lugar de `fal-ai/flux/dev`.

## Notas

- Token de Instagram expira cada 60 días — necesita refresh manual o cron adicional
- Rate limit IG: 25 posts/día por cuenta
- Vercel Hobby permite cron solo diario (no más frecuente)
- Webhook de Telegram debe ser HTTPS — Vercel lo provee automáticamente
- Las URLs de fal.ai expiran tras ~24h, por eso al aprobar archivamos a Supabase Storage
