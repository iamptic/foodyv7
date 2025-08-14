import os
import logging
from fastapi import FastAPI, Request
from aiogram import Bot, Dispatcher, types
from aiogram.types import Update, WebAppInfo
from aiogram.filters import Command
from aiogram.utils.keyboard import InlineKeyboardBuilder

logging.basicConfig(level=logging.INFO)

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "webhook")

# Публичная витрина (MiniApp для покупателей)
WEBAPP_PUBLIC = os.getenv("WEBAPP_PUBLIC", "https://foodyweb-production.up.railway.app")
# ЛК ресторана (MiniApp для ресторанов)
MERCHANT_URL = os.getenv("MERCHANT_URL", f"{WEBAPP_PUBLIC.rstrip('/')}/web/merchant/")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
app = FastAPI()

def main_menu_kb() -> types.InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="🛍 Витрина (MiniApp)", web_app=WebAppInfo(url=WEBAPP_PUBLIC))
    kb.button(text="🏪 Ресторан (ЛК)", web_app=WebAppInfo(url=MERCHANT_URL))
    kb.adjust(1)
    return kb.as_markup()

@dp.message(Command("start"))
async def start_handler(message: types.Message):
    text = (
        "Привет! Это Foody 👋\n\n"
        "• Покупатели — открывайте витрину (MiniApp).\n"
        "• Рестораны — вход в личный кабинет по кнопке ниже."
    )
    await message.answer(text, reply_markup=main_menu_kb())

@dp.message(Command("merchant"))
async def merchant_handler(message: types.Message):
    await message.answer("Личный кабинет ресторана:", reply_markup=main_menu_kb())

@app.post(f"/{WEBHOOK_SECRET}")
async def telegram_webhook(request: Request):
    data = await request.json()
    update = Update.model_validate(data)
    await dp.feed_update(bot, update)
    return {"ok": True}

@app.get("/health")
async def health():
    return {"ok": True, "webapp_public": WEBAPP_PUBLIC, "merchant_url": MERCHANT_URL}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
