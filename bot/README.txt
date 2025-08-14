Railway (BOT):
Root directory: BOT
Start command: python main.py
ENV:
  BOT_TOKEN=...
  WEBHOOK_SECRET=foodySecret123
  WEBAPP_PUBLIC=https://foodyweb-production.up.railway.app
  MERCHANT_URL=https://foodyweb-production.up.railway.app/web/merchant/
Webhook:
  https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<your-bot>.up.railway.app/<WEBHOOK_SECRET>
