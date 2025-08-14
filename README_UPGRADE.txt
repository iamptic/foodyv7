Foody Upgrade (from MVP+LK+REG baseline)

Use this exact structure on Railway:
  BACKEND root dir: backend
  WEB     root dir: web
  BOT     root dir: BOT

Start commands:
  backend: uvicorn main:app --host 0.0.0.0 --port $PORT
  web:     node server.js
  BOT:     python main.py

Env (project/vars):
  # Web runtime for config.js
  FOODY_API=https://foodyback-production.up.railway.app
  # Backend
  DATABASE_URL=postgresql://postgres:...@postgres.railway.internal:5432/railway
  RUN_MIGRATIONS=1
  CORS_ORIGINS=https://foodyweb-production.up.railway.app,https://foodybot-production.up.railway.app
  RECOVERY_SECRET=foodyDevRecover123
  # R2 storage if needed
  R2_ENDPOINT=...
  R2_BUCKET=foody
  R2_ACCESS_KEY_ID=...
  R2_SECRET_ACCESS_KEY=...
  # Bot
  BOT_TOKEN=...
  WEBHOOK_SECRET=foodySecret123
  WEBAPP_PUBLIC=https://foodyweb-production.up.railway.app
  MERCHANT_URL=https://foodyweb-production.up.railway.app/web/merchant/

Notes:
- backend/main.py startup was patched to await bootstrap migrations (no race on new DB).
- robust bootstrap_sql.py handles legacy schemas safely.
- web/server.js already has SPA fallback under '/web/*'.
- web/web/merchant/apiGuard.js added — wrap API calls to avoid forced logout on server 5xx.
- BOT/ directory added with aiogram 3 bot and two buttons (/start).
