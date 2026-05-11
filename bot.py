import asyncio
import logging
import aiohttp
import os
import time

from telegram import (
    Update,
    ReplyKeyboardMarkup,
    KeyboardButton,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)

from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters,
)

from state import load_state, save_state

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
MAX_NUMBERS = int(os.environ.get("MAX_NUMBERS", "100"))
HOURLY_LIMIT = int(os.environ.get("HOURLY_LIMIT", "400"))
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "10"))


# =====================================
# HELPERS
# =====================================

def is_admin(uid):
    state = load_state()
    return str(uid) in state["admin_ids"]



def init_user(user):
    state = load_state()
    uid = str(user.id)

    if uid not in state["users"]:
        state["users"][uid] = {
            "name": user.full_name,
            "username": user.username or "",
            "hour_count": 0,
            "hour_reset": int(time.time()) + 3600,
            "total_checked": 0,
            "joined": int(time.time()),
            "banned": False,
        }

        save_state(state)



def reset_limit(uid):
    state = load_state()
    now = int(time.time())

    if uid in state["users"]:
        if now >= state["users"][uid]["hour_reset"]:
            state["users"][uid]["hour_count"] = 0
            state["users"][uid]["hour_reset"] = now + 3600
            save_state(state)



def keyboard(uid):
    rows = [[KeyboardButton("Check Number")]]

    if is_admin(uid):
        rows.append([KeyboardButton("Set Url")])
        rows.append([KeyboardButton("User Request")])

    return ReplyKeyboardMarkup(rows, resize_keyboard=True)



def format_numbers(numbers):
    return "\n".join(f"<code>+{n}</code>" for n in numbers)


# =====================================
# API CHECKER
# =====================================

async def check_batch(session, numbers):
    state = load_state()

    api_url = state.get("api_url", "")
    api_token = state.get("api_token", "")

    if not api_url or not api_token:
        return [], []

    headers = {
        "accept": "application/json",
        "x-maytapi-key": api_token,
        "Content-Type": "application/json",
    }

    payload = {
        "numbers": numbers
    }

    try:
        async with session.post(
            api_url,
            json=payload,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=60)
        ) as response:

            if response.status != 200:
                logger.error(f"API Error Status: {response.status}")
                return [], []

            data = await response.json()

            registered = []
            unregistered = []

            for item in data.get("data", []):
                try:
                    number = item["id"]["user"]
                except:
                    number = str(item["id"]).replace("@c.us", "")

                if item.get("valid"):
                    registered.append(number)
                else:
                    unregistered.append(number)

            return registered, unregistered

    except Exception as e:
        logger.error(f"Batch Error: {e}")
        return [], []


async def run_all_batches(numbers):
    connector = aiohttp.TCPConnector(limit=100)

    all_registered = []
    all_unregistered = []

    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = []

        for i in range(0, len(numbers), BATCH_SIZE):
            batch = numbers[i:i + BATCH_SIZE]
            tasks.append(check_batch(session, batch))

        results = await asyncio.gather(*tasks)

        for registered, unregistered in results:
            all_registered.extend(registered)
            all_unregistered.extend(unregistered)

    return all_registered, all_unregistered


# =====================================
# START COMMAND
# =====================================

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    uid = str(user.id)

    init_user(user)

    state = load_state()

    if state["users"].get(uid, {}).get("banned"):
        await update.message.reply_text("❌ You are banned.")
        return

    if uid not in state["approved_users"]:
        state["pending_users"][uid] = user.full_name
        save_state(state)

        await update.message.reply_text(
            "⏳ Your access request was sent to admin."
        )

        return

    await update.message.reply_text(
        "⚡ WhatsApp Checker Bot Ready",
        reply_markup=keyboard(user.id)
    )


# =====================================
# CALLBACKS
# =====================================

async def callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    data = query.data

    state = load_state()

    if data.startswith("approve_"):
        uid = data.split("_", 1)[1]

        if uid not in state["approved_users"]:
            state["approved_users"].append(uid)

        state["pending_users"].pop(uid, None)

        save_state(state)

        await query.edit_message_text(f"✅ Approved {uid}")

    elif data.startswith("reject_"):
        uid = data.split("_", 1)[1]

        state["pending_users"].pop(uid, None)

        save_state(state)

        await query.edit_message_text(f"❌ Rejected {uid}")


# =====================================
# MAIN MESSAGE HANDLER
# =====================================

async def handle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    uid = str(user.id)
    text = update.message.text.strip()

    init_user(user)
    reset_limit(uid)

    state = load_state()

    if state["users"].get(uid, {}).get("banned"):
        await update.message.reply_text("❌ You are banned.")
        return

    # ==========================
    # ADMIN SET URL
    # ==========================

    if text == "Set Url" and is_admin(uid):
        context.user_data["set_url"] = True

        await update.message.reply_text(
            "Send Maytapi screen URL"
        )

        return

    if context.user_data.get("set_url") and is_admin(uid):
        try:
            screen_url = text

            base = screen_url.split("/screen")[0]
            token = screen_url.split("token=")[1].split("&")[0]
            api_url = base + "/checkPhones"

            state["api_url"] = api_url
            state["api_token"] = token
            state["api_screen_url"] = screen_url

            save_state(state)

            await update.message.reply_text("✅ API Updated")

        except Exception as e:
            await update.message.reply_text(f"❌ Invalid URL\n{e}")

        context.user_data["set_url"] = False
        return

    # ==========================
    # USER REQUEST PANEL
    # ==========================

    if text == "User Request" and is_admin(uid):
        if not state["pending_users"]:
            await update.message.reply_text("No pending requests")
            return

        for puid, pname in state["pending_users"].items():
            kb = InlineKeyboardMarkup([
                [
                    InlineKeyboardButton("✅ Approve", callback_data=f"approve_{puid}"),
                    InlineKeyboardButton("❌ Reject", callback_data=f"reject_{puid}"),
                ]
            ])

            await update.message.reply_text(
                f"{pname}\nID: {puid}",
                reply_markup=kb
            )

        return

    # ==========================
    # CHECK BUTTON
    # ==========================

    if text == "Check Number":
        if uid not in state["approved_users"]:
            state["pending_users"][uid] = user.full_name
            save_state(state)

            await update.message.reply_text(
                "⏳ Waiting for admin approval"
            )

            return

        context.user_data["waiting_numbers"] = True

        await update.message.reply_text(
            f"Send numbers\nMax: {MAX_NUMBERS}"
        )

        return

    # ==========================
    # PROCESS NUMBERS
    # ==========================

    if context.user_data.get("waiting_numbers"):

        raw_numbers = text.splitlines()

        numbers = []

        for n in raw_numbers:
            n = ''.join(filter(str.isdigit, n))

            if n:
                numbers.append(n)

        numbers = list(dict.fromkeys(numbers))

        if not numbers:
            await update.message.reply_text("❌ No valid numbers")
            return

        if len(numbers) > MAX_NUMBERS:
            await update.message.reply_text(
                f"❌ Max allowed {MAX_NUMBERS}"
            )
            return

        processing = await update.message.reply_text(
            "⚡ Checking numbers..."
        )

        try:
            registered, unregistered = await run_all_batches(numbers)

            state["users"][uid]["total_checked"] += len(numbers)
            state["users"][uid]["hour_count"] += len(numbers)
            save_state(state)

            response = (
                f"✅ Registered: {len(registered)}\n"
                f"❌ Unregistered: {len(unregistered)}\n\n"
            )

            if registered:
                response += "📱 Registered Numbers:\n"
                response += format_numbers(registered)

            if len(response) > 4000:
                chunks = [response[i:i+3500] for i in range(0, len(response), 3500)]

                await processing.edit_text(chunks[0], parse_mode="HTML")

                for chunk in chunks[1:]:
                    await update.message.reply_text(chunk, parse_mode="HTML")

            else:
                await processing.edit_text(response, parse_mode="HTML")

        except Exception as e:
            logger.error(f"Checker Error: {e}")
            await processing.edit_text(f"❌ Error: {e}")

        context.user_data["waiting_numbers"] = False


# =====================================
# RUN BOT
# =====================================

async def run():
    if not BOT_TOKEN:
        logger.error("BOT_TOKEN missing")
        return

    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle))

    logger.info("Bot polling started")

    await app.initialize()
    await app.start()
    await app.updater.start_polling(
        drop_pending_updates=True,
        allowed_updates=Update.ALL_TYPES,
    )

    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(run())
