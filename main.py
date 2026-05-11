import threading
import asyncio
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)


def start_bot():
    import bot

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        loop.run_until_complete(bot.run())
    except Exception as e:
        logger.error(f"Bot crashed: {e}", exc_info=True)


def start_web():
    from web import run_web
    run_web()


if __name__ == "__main__":
    bot_thread = threading.Thread(target=start_bot, daemon=True)
    bot_thread.start()

    logger.info("Telegram bot thread started")

    start_web()
