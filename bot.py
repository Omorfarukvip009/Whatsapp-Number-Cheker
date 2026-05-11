"""
Telegram WhatsApp Checker Bot
Ultra Fast Version with Web Dashboard Support
"""

import time
import asyncio
import logging
import aiohttp
import json
import os

from telegram import (
    Update,
    ReplyKeyboardMarkup,
    KeyboardButton,
    InlineKeyboardMarkup,
    InlineKeyboardButton
)
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters
)

from state import load_state, save_state

# ==========================================
# LOGGING
# ==========================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ==========================================
# CONFIG FROM ENV
# ==========================================
BOT_TOKEN = os.environ.get("BOT_TOKEN", "YOUR_BOT_TOKEN")
MAX_NUMBERS = int(os.environ.get("MAX_NUMBERS", 100))
HOURLY_LIMIT = int(os.environ.get("HOURLY_LIMIT", 400))
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", 10))


# ==========================================
# HELPERS
# ==========================================
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
            "banned": False
        }
        save_state(state)

def reset_limit(uid):
    state = load_state()
    now = int(time.time())
    if uid in state["users"] and now >= state["users"][uid]["hour_reset"]:
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


# ==========================================
# FAST API CHECK
# ==========================================
async def check_batch(session, numbers):
    state = load_state()
    api_url = state.get("api_url", "")
    api_token = state.get("api_token", "")

    if not api_url or not api_token:
        return [], []

    headers = {
        "accept": "application/json",
        "x-maytapi-key": api_token,
        "Content-Type": "application/json"
    }

    try:
        async with session.post(
            api_url,
            json={"numbers": numbers},
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=30)
        ) as response:
            data = await response.json()
            reg = []
            unreg = []
            for item in data.get("data", []):
                try:
                    number = item["id"]["user"]
                except Exception:
                    number = str(item["id"]).replace("@c.us", "")
                if item.get("valid", False):
                    reg.append(number)
                else:
                    unreg.append(number)
            return reg, unreg
    except Exception as e:
        logger.error(f"Batch check error: {e}")
        return [], []


async def run_all_batches(numbers):
    all_reg = []
    all_unreg = []
    connector = aiohttp.TCPConnector(limit=100)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = []
        for i in range(0, len(numbers), BATCH_SIZE):
            batch = numbers[i:i + BATCH_SIZE]
            tasks.append(check_batch(session, batch))
        results = await asyncio.gather(*tasks)
        for reg, unreg in results:
            all_reg.extend(reg)
            all_unreg.extend(unreg)
    return all_reg, all_unreg


# ==========================================
# START
# ==========================================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    init_user(user)
    state = load_state()
    uid = str(user.id)

    if state["users"].get(uid, {}).get("banned", False):
        await update.message.reply_text("❌ You are banned from using this bot.")
        return

    await update.message.reply_text(
        f"👋 Welcome, {user.full_name}!\n\n⚡ WhatsApp Checker Bot is Ready.",
        reply_markup=keyboard(user.id)
    )


# ==========================================
# CALLBACKS
# ==========================================
async def callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data.startswith("approve_"):
        uid = data.split("_")[1]
        state = load_state()
        state["approved_users"].append(uid)
        state["approved_users"] = list(set(state["approved_users"]))
        state["pending_users"].pop(uid, None)
        save_state(state)
        await query.edit_message_text(f"✅ Approved: {uid}")

        try:
            await context.bot.send_message(
                chat_id=int(uid),
                text="✅ Your access has been approved! Press Check Number to start."
            )
        except Exception:
            pass

    elif data.startswith("reject_"):
        uid = data.split("_")[1]
        state = load_state()
        state["pending_users"].pop(uid, None)
        save_state(state)
        await query.edit_message_text(f"❌ Rejected: {uid}")

        try:
            await context.bot.send_message(
                chat_id=int(uid),
                text="❌ Your access request has been rejected."
            )
        except Exception:
            pass


# ==========================================
# MAIN HANDLER
# ==========================================
async def handle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    uid = str(user.id)
    text = update.message.text.strip()

    init_user(user)
    reset_limit(uid)

    state = load_state()

    # BAN CHECK
    if state["users"].get(uid, {}).get("banned", False):
        await update.message.reply_text("❌ You are banned from using this bot.")
        return

    # ======================================
    # SET URL (Admin)
    # ======================================
    if text == "Set Url" and is_admin(user.id):
        context.user_data["set_url"] = True
        await update.message.reply_text("📎 Send the full screen URL from Maytapi:")
        return

    if context.user_data.get("set_url") and is_admin(user.id):
        try:
            url = text
            base = url.split("/screen")[0]
            token = url.split("token=")[1].split("&")[0]
            api_url = base + "/checkPhones"

            state["api_url"] = api_url
            state["api_token"] = token
            state["api_screen_url"] = url
            save_state(state)

            await update.message.reply_text("✅ API Updated Successfully!")
        except Exception:
            await update.message.reply_text("❌ Invalid URL format. Try again.")

        context.user_data["set_url"] = False
        return

    # ======================================
    # USER REQUEST PANEL (Admin)
    # ======================================
    if text == "User Request" and is_admin(user.id):
        if not state["pending_users"]:
            await update.message.reply_text("📭 No pending user requests.")
            return

        for puid, pname in state["pending_users"].items():
            kb = InlineKeyboardMarkup([[
                InlineKeyboardButton("✅ Allow", callback_data=f"approve_{puid}"),
                InlineKeyboardButton("❌ Reject", callback_data=f"reject_{puid}")
            ]])
            await update.message.reply_text(
                f"👤 {pname}\n🆔 {puid}",
                reply_markup=kb
            )
        return

    # ======================================
    # CHECK NUMBER
    # ======================================
    if text == "Check Number":
        if uid not in state["approved_users"] and not is_admin(user.id):
            state["pending_users"][uid] = user.full_name
            save_state(state)

            await update.message.reply_text(
                "❌ Access denied.\n📨 Your request has been sent to admins."
            )

            kb = InlineKeyboardMarkup([[
                InlineKeyboardButton("✅ Allow", callback_data=f"approve_{uid}"),
                InlineKeyboardButton("❌ Reject", callback_data=f"reject_{uid}")
            ]])

            for admin_id in state["admin_ids"]:
                try:
                    await context.bot.send_message(
                        chat_id=int(admin_id),
                        text=(
                            f"🔔 New User Request\n\n"
                            f"👤 Name: {user.full_name}\n"
                            f"🆔 ID: {uid}\n"
                            f"@{user.username or 'no username'}"
                        ),
                        reply_markup=kb
                    )
                except Exception:
                    pass
            return

        context.user_data["waiting_numbers"] = True
        await update.message.reply_text(
            f"📥 Send phone numbers — one per line\n"
            f"Max {MAX_NUMBERS} numbers\n"
            f"With or without + prefix"
        )
        return

    # ======================================
    # PROCESS NUMBERS
    # ======================================
    if context.user_data.get("waiting_numbers"):
        numbers = []
        for line in text.splitlines():
            line = line.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
            if line.startswith("+"):
                line = line[1:]
            if line.isdigit() and len(line) >= 7:
                numbers.append(line)

        numbers = list(dict.fromkeys(numbers))

        if not numbers:
            await update.message.reply_text("❌ No valid numbers found.")
            return

        if len(numbers) > MAX_NUMBERS:
            await update.message.reply_text(f"❌ Max {MAX_NUMBERS} numbers at once.")
            return

        if not is_admin(user.id):
            remain = HOURLY_LIMIT - state["users"][uid]["hour_count"]
            if len(numbers) > remain:
                await update.message.reply_text(
                    f"⏳ Hourly limit reached.\n"
                    f"Remaining quota: {remain} numbers.\n"
                    f"Resets in: {int((state['users'][uid]['hour_reset'] - time.time()) / 60)} min"
                )
                return

        if not state.get("api_url"):
            await update.message.reply_text("❌ API not configured. Ask admin to set the URL.")
            return

        start_time = time.time()
        processing = await update.message.reply_text(f"⚡ Checking {len(numbers)} numbers...")

        try:
            reg, unreg = await run_all_batches(numbers)

            # Update stats
            state = load_state()
            if not is_admin(user.id):
                state["users"][uid]["hour_count"] += len(numbers)
            state["users"][uid]["total_checked"] += len(numbers)
            save_state(state)

            elapsed = round(time.time() - start_time, 2)
            response_text = f"⚡ <b>Done in {elapsed}s</b>\n\n"

            if reg:
                response_text += f"✅ <b>Registered ({len(reg)})</b>\n\n" + format_numbers(reg)
            if unreg:
                response_text += f"\n\n❌ <b>Not Registered ({len(unreg)})</b>\n\n" + format_numbers(unreg)
            if not reg and not unreg:
                response_text += "⚠️ No results returned. Check API configuration."

            if len(response_text) > 4000:
                chunks = [response_text[i:i + 4000] for i in range(0, len(response_text), 4000)]
                await processing.delete()
                for chunk in chunks:
                    await update.message.reply_text(chunk, parse_mode="HTML")
            else:
                await processing.edit_text(response_text, parse_mode="HTML")

        except Exception as e:
            await processing.edit_text(f"❌ Error: {e}")

        context.user_data["waiting_numbers"] = False


# ==========================================
# MAIN
# ==========================================
def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle))

    logger.info("⚡ Bot started")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
