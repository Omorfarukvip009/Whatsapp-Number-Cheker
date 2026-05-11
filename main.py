# ==========================================
# TELEGRAM BOT - ULTRA FAST + WEB STATUS
# ==========================================
# FEATURES:
# ✅ Ultra Fast aiohttp
# ✅ Parallel Batch Checking
# ✅ Multiple Admins
# ✅ User Approval System
# ✅ Dynamic API Switching
# ✅ Uptime Counter
# ✅ Render Web Service Ready
# ✅ +Number Support
# ✅ Clean Monospace Output
# ✅ 400/hour Limit
# ✅ No Database
# ==========================================

import os
import time
import asyncio
import logging
import aiohttp

from flask import Flask
from threading import Thread

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

# ==========================================
# CONFIG
# ==========================================
BOT_TOKEN = "YOUR_BOT_TOKEN"

# MULTIPLE ADMINS
ADMIN_IDS = {
    5948588400,
    1234567890
}

# DEFAULT API
API_URL = "https://api.maytapi.com/api/default/checkPhones"
API_TOKEN = "default_token"

# LIMITS
MAX_NUMBERS = 100
HOURLY_LIMIT = 400
BATCH_SIZE = 10

# ==========================================
# LOGGING
# ==========================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# ==========================================
# MEMORY
# ==========================================
users = {}
approved_users = set()
pending_users = {}

# ==========================================
# WEB SERVER
# ==========================================
app_web = Flask(__name__)

BOT_STATUS = "Starting..."
START_TIME = time.time()

@app_web.route("/")
def home():

    uptime = int(time.time() - START_TIME)

    hours = uptime // 3600
    minutes = (uptime % 3600) // 60
    seconds = uptime % 60

    return f"""
    <html>
    <head>
        <title>Telegram Bot Status</title>

        <style>
            body {{
                background: #0f172a;
                color: white;
                font-family: Arial;
                text-align: center;
                padding-top: 100px;
            }}

            .box {{
                display: inline-block;
                padding: 40px;
                border-radius: 20px;
                background: #1e293b;
                box-shadow: 0 0 30px rgba(0,0,0,0.5);
            }}

            h1 {{
                color: #22c55e;
                margin-bottom: 20px;
            }}

            p {{
                font-size: 20px;
            }}
        </style>
    </head>

    <body>

        <div class="box">
            <h1>⚡ Telegram Bot Running</h1>

            <p>Status: {BOT_STATUS}</p>

            <p>Uptime:</p>

            <h2>
                {hours}h {minutes}m {seconds}s
            </h2>
        </div>

    </body>
    </html>
    """

def run_web():
    port = int(os.environ.get("PORT", 10000))
    app_web.run(host="0.0.0.0", port=port)

# ==========================================
# HELPERS
# ==========================================
def is_admin(uid):
    return uid in ADMIN_IDS

def init_user(user):

    uid = str(user.id)

    if uid not in users:
        users[uid] = {
            "name": user.full_name,
            "hour_count": 0,
            "hour_reset": int(time.time()) + 3600
        }

def reset_limit(uid):

    now = int(time.time())

    if now >= users[uid]["hour_reset"]:
        users[uid]["hour_count"] = 0
        users[uid]["hour_reset"] = now + 3600

def keyboard(uid):

    rows = [[KeyboardButton("Check Number")]]

    if is_admin(uid):
        rows.append([KeyboardButton("Set Url")])
        rows.append([KeyboardButton("User Request")])

    return ReplyKeyboardMarkup(rows, resize_keyboard=True)

def format_numbers(numbers):
    return "\n".join(f"<code>+{n}</code>" for n in numbers)

# ==========================================
# API CHECK
# ==========================================
async def check_batch(session, numbers):

    global API_URL, API_TOKEN

    headers = {
        "accept": "application/json",
        "x-maytapi-key": API_TOKEN,
        "Content-Type": "application/json"
    }

    try:

        async with session.post(
            API_URL,
            json={"numbers": numbers},
            headers=headers,
            timeout=30
        ) as response:

            data = await response.json()

            reg = []
            unreg = []

            for item in data.get("data", []):

                try:
                    number = item["id"]["user"]
                except:
                    number = str(item["id"]).replace("@c.us", "")

                if item.get("valid", False):
                    reg.append(number)
                else:
                    unreg.append(number)

            return reg, unreg

    except:
        return [], []

# ==========================================
# FAST MULTI BATCH
# ==========================================
async def run_all_batches(numbers):

    all_reg = []
    all_unreg = []

    connector = aiohttp.TCPConnector(limit=100)

    async with aiohttp.ClientSession(connector=connector) as session:

        tasks = []

        for i in range(0, len(numbers), BATCH_SIZE):

            batch = numbers[i:i+BATCH_SIZE]

            tasks.append(
                check_batch(session, batch)
            )

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

    await update.message.reply_text(
        "✅ Bot Ready",
        reply_markup=keyboard(user.id)
    )

# ==========================================
# CALLBACKS
# ==========================================
async def callback(update: Update, context: ContextTypes.DEFAULT_TYPE):

    query = update.callback_query

    await query.answer()

    data = query.data

    # APPROVE
    if data.startswith("approve_"):

        uid = data.split("_")[1]

        approved_users.add(uid)

        pending_users.pop(uid, None)

        await query.edit_message_text(
            f"✅ Approved: {uid}"
        )

    # REJECT
    elif data.startswith("reject_"):

        uid = data.split("_")[1]

        pending_users.pop(uid, None)

        await query.edit_message_text(
            f"❌ Rejected: {uid}"
        )

# ==========================================
# MAIN HANDLE
# ==========================================
async def handle(update: Update, context: ContextTypes.DEFAULT_TYPE):

    global API_URL, API_TOKEN

    user = update.effective_user

    uid = str(user.id)

    text = update.message.text.strip()

    init_user(user)

    reset_limit(uid)

    # ======================================
    # SET URL
    # ======================================
    if text == "Set Url" and is_admin(user.id):

        context.user_data["set_url"] = True

        await update.message.reply_text(
            "Send full screen URL"
        )
        return

    # PROCESS URL
    if context.user_data.get("set_url") and is_admin(user.id):

        try:

            url = text

            base = url.split("/screen")[0]

            token = url.split("token=")[1].split("&")[0]

            API_URL = base + "/checkPhones"

            API_TOKEN = token

            await update.message.reply_text(
                "✅ API Updated Successfully"
            )

        except:

            await update.message.reply_text(
                "❌ Invalid URL"
            )

        context.user_data["set_url"] = False

        return

    # ======================================
    # USER REQUEST PANEL
    # ======================================
    if text == "User Request" and is_admin(user.id):

        if not pending_users:

            await update.message.reply_text(
                "No pending users"
            )

            return

        for puid, name in pending_users.items():

            kb = InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        "✅ Allow",
                        callback_data=f"approve_{puid}"
                    ),

                    InlineKeyboardButton(
                        "❌ Reject",
                        callback_data=f"reject_{puid}"
                    )
                ]
            ])

            await update.message.reply_text(
                f"👤 {name}\n🆔 {puid}",
                reply_markup=kb
            )

        return

    # ======================================
    # CHECK BUTTON
    # ======================================
    if text == "Check Number":

        # ACCESS CHECK
        if uid not in approved_users and not is_admin(user.id):

            pending_users[uid] = user.full_name

            await update.message.reply_text(
                "❌ Access denied\nRequest sent to admins"
            )

            kb = InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        "✅ Allow",
                        callback_data=f"approve_{uid}"
                    ),

                    InlineKeyboardButton(
                        "❌ Reject",
                        callback_data=f"reject_{uid}"
                    )
                ]
            ])

            for admin_id in ADMIN_IDS:

                try:

                    await context.bot.send_message(
                        chat_id=admin_id,

                        text=(
                            f"🔔 New User Request\n\n"
                            f"👤 Name: {user.full_name}\n"
                            f"🆔 ID: {uid}"
                        ),

                        reply_markup=kb
                    )

                except:
                    pass

            return

        context.user_data["waiting_numbers"] = True

        await update.message.reply_text(
            "📥 Send numbers line by line\nMax 100 numbers"
        )

        return

    # ======================================
    # PROCESS NUMBERS
    # ======================================
    if context.user_data.get("waiting_numbers"):

        numbers = []

        for line in text.splitlines():

            line = line.strip()

            line = line.replace(" ", "")
            line = line.replace("-", "")
            line = line.replace("(", "")
            line = line.replace(")", "")

            if line.startswith("+"):
                line = line[1:]

            if line.isdigit():
                numbers.append(line)

        # REMOVE DUPLICATES
        numbers = list(dict.fromkeys(numbers))

        if not numbers:

            await update.message.reply_text(
                "❌ No valid numbers"
            )

            return

        if len(numbers) > MAX_NUMBERS:

            await update.message.reply_text(
                f"❌ Max {MAX_NUMBERS} numbers"
            )

            return

        # LIMIT
        if not is_admin(user.id):

            remain = HOURLY_LIMIT - users[uid]["hour_count"]

            if len(numbers) > remain:

                await update.message.reply_text(
                    f"❌ Hourly limit exceeded\nRemaining: {remain}"
                )

                return

        # START CHECK
        start_time = time.time()

        processing = await update.message.reply_text(
            f"⚡ Checking {len(numbers)} numbers..."
        )

        try:

            reg, unreg = await run_all_batches(numbers)

            # UPDATE LIMIT
            if not is_admin(user.id):
                users[uid]["hour_count"] += len(numbers)

            elapsed = round(time.time() - start_time, 2)

            response_text = (
                f"⚡ <b>Completed in {elapsed}s</b>\n\n"
            )

            # REGISTERED
            if reg:
                response_text += (
                    "✅ <b>Registered Numbers</b>\n\n"
                    + format_numbers(reg)
                )

            # UNREGISTERED
            if unreg:
                response_text += (
                    "\n\n❌ <b>Not Registered Numbers</b>\n\n"
                    + format_numbers(unreg)
                )

            if not reg and not unreg:
                response_text += "No results"

            # TELEGRAM MESSAGE LIMIT
            if len(response_text) > 4000:

                chunks = [
                    response_text[i:i+4000]
                    for i in range(0, len(response_text), 4000)
                ]

                await processing.delete()

                for chunk in chunks:

                    await update.message.reply_text(
                        chunk,
                        parse_mode="HTML"
                    )

            else:

                await processing.edit_text(
                    response_text,
                    parse_mode="HTML"
                )

        except Exception as e:

            await processing.edit_text(
                f"❌ Error:\n{e}"
            )

        context.user_data["waiting_numbers"] = False

# ==========================================
# MAIN
# ==========================================
def main():

    global BOT_STATUS

    # START WEB SERVER
    Thread(target=run_web).start()

    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(
        CommandHandler("start", start)
    )

    app.add_handler(
        CallbackQueryHandler(callback)
    )

    app.add_handler(
        MessageHandler(
            filters.TEXT & ~filters.COMMAND,
            handle
        )
    )

    BOT_STATUS = "Online ✅"

    print("⚡ ULTRA FAST BOT STARTED")

    app.run_polling(
        drop_pending_updates=True
    )

# ==========================================
# RUN
# ==========================================
if __name__ == "__main__":
    main()
