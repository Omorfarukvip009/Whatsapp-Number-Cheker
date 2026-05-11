"""
main.py — Entry point for Render
Runs the Telegram bot in a background thread (non-daemon so it stays alive),
and Waitress web dashboard in the main thread.
"""

import threading
import asyncio
import logging
import os
import signal
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def start_bot():
    """Run bot in its own dedicated event loop — avoids asyncio conflicts."""
    import bot
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(bot.run())
    except Exception as e:
        logger.error(f"Bot crashed: {e}", exc_info=True)
    finally:
        loop.close()


def start_web():
    from web import run_web
    logger.info("Starting web dashboard...")
    run_web()


if __name__ == "__main__":
    # FIX: daemon=False so the bot thread is NOT killed when web starts
    bot_thread = threading.Thread(target=start_bot, daemon=False, name="BotThread")
    bot_thread.start()
    logger.info("Bot thread started")

    # Web runs in main thread
    start_web()
