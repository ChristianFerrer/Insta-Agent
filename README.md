# Insta-Agent

Agente de Telegram que automatiza la creación de posts para una cuenta de Instagram de cartoons vintage de músicos (estilo @bandtoons).

**Flujo:**
1. Pedís un post por Telegram (`/post Freddie Mercury` o lenguaje natural).
2. El agente genera imagen + caption + hashtags en estilo años 30 rubber hose.
3. Recibís preview con botones para aprobar / regenerar / editar / descartar.
4. Al aprobar, publica automáticamente en Instagram vía Graph API.
5. Cada mañana te propone post basado en efemérides musicales.

## Stack

- Python 3.11+
- python-telegram-bot v21
- Anthropic SDK (Claude con tool use)
- fal.ai (Flux dev para imágenes)
- Instagram Graph API
- SQLite (historial y propuestas pendientes)
- APScheduler (sugerencias proactivas diarias)

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Editar .env con tus credenciales
python main.py
```

## Credenciales necesarias

1. **Telegram Bot** — creá uno con [@BotFather](https://t.me/BotFather), obtené el token.
2. **Tu user ID de Telegram** — sacalo con [@userinfobot](https://t.me/userinfobot). Va en `TELEGRAM_ALLOWED_USER_IDS` (lista coma-separada de IDs autorizados).
3. **Anthropic API key** — desde [console.anthropic.com](https://console.anthropic.com).
4. **fal.ai key** — desde [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys).
5. **Instagram Graph API:**
   - Cuenta Instagram tipo Business o Creator
   - Vinculada a una página de Facebook
   - App de Facebook con permisos `instagram_basic`, `instagram_content_publish`, `pages_show_list`
   - Long-lived access token (60 días — habrá que renovarlo)
   - Business account ID (lo conseguís con un GET a `/me/accounts`)

## Comandos del bot

| Comando | Acción |
|---|---|
| `/start` | Bienvenida y ayuda |
| `/post <banda>` | Generar propuesta de post |
| `/historial` | Últimos 10 posts publicados |
| `/help` | Ayuda |

También entiende lenguaje natural: *"hacé un post tributo a Lemmy"*, *"generá algo de Black Sabbath"*.

## Estructura

```
.
├── main.py                  # Entry point
├── src/
│   ├── bot.py               # Handlers de Telegram + UI
│   ├── agent.py             # Orquestación con Claude tool use
│   ├── config.py            # Settings + style constants
│   ├── prompts.py           # System prompts
│   ├── db.py                # SQLite layer
│   ├── scheduler.py         # Job diario de efemérides
│   └── tools/
│       ├── image_gen.py     # Flux / fal.ai
│       ├── caption.py       # Caption + hashtags
│       ├── instagram.py     # Graph API publish
│       └── ephemeris.py     # Lookup + selección de efemérides
├── data/
│   └── ephemeris.json       # Aniversarios y cumpleaños musicales
├── requirements.txt
└── .env.example
```

## Personalización del estilo visual

Toda la identidad visual está concentrada en `src/config.py`:

- `STYLE_PROMPT_BASE`: el prompt maestro que define el look (años 30, rubber hose, sepia, etc.)
- `NEGATIVE_PROMPT`: lo que se evita
- `IMAGE_SIZE`: dimensiones de salida (`square_hd` = 1024×1024)

Para refinar más el estilo, editás `STYLE_PROMPT_BASE`. Para un upgrade mayor (consistencia perfecta), entrenar una LoRA sobre el feed existente y reemplazar el modelo en `src/tools/image_gen.py`.

## Roadmap próximo

- LoRA fine-tune sobre el feed real del cliente para consistencia visual perfecta
- IP-Adapter o image-to-image para mejor parecido de caras famosas
- Soporte de carruseles (varios músicos en un post)
- Programación de publicaciones (no solo "publicar ahora")
- Métricas: traer likes/comments del post después de publicar
- Migración SQLite → Postgres/Supabase si escala a múltiples cuentas

## Notas operativas

- Token de Instagram expira cada 60 días. Implementar refresh o renovar manualmente.
- Rate limit IG: 25 posts/día por cuenta.
- El bot guarda propuestas en `pending_proposals`; al aprobar se mueven a `posts`.
