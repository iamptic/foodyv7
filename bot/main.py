import os
import logging
from fastapi import FastAPI, Request
from aiogram import Bot, Dispatcher, types
from aiogram.types import Update
from aiogram.filters import Command

logging.basicConfig(level=logging.INFO)

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "webhook")
WEBAPP_PUBLIC = os.getenv("WEBAPP_PUBLIC", "")
BOT_WEBHOOK_URL = os.getenv("BOT_WEBHOOK_URL")  # e.g. https://foodybot-production.up.railway.app

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN env is required")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
app = FastAPI()

@dp.message(Command("start"))
async def start_handler(message: types.Message):
    await message.answer(
        "Привет! 🎉 Это Foody бот.\n\n"
        "Смотри акции и заказывай еду со скидками 🍔🥗\n\n"
        f"Витрина: {WEBAPP_PUBLIC or 'не задана (WEBAPP_PUBLIC)'}"
    )

@app.post(f"/{WEBHOOK_SECRET}")
async def telegram_webhook(request: Request):
    data = await request.json()
    update = Update.model_validate(data)
    await dp.feed_update(bot, update)
    return {"ok": True}

@app.get("/health")
async def health():
    return {"ok": True}

@app.on_event("startup")
async def on_startup():
    # Опционально: автоматически установить webhook, если задан BOT_WEBHOOK_URL
    if BOT_WEBHOOK_URL:
        try:
            ok = await bot.set_webhook(url=f"{BOT_WEBHOOK_URL}/{WEBHOOK_SECRET}")
            logging.info("Webhook set to %s -> %s", BOT_WEBHOOK_URL, ok)
        except Exception as e:
            logging.exception("Failed to set webhook: %s", e)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
