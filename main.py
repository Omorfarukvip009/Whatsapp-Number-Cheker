"""
main.py — Entry point for Render
Starts the Telegram bot in a background thread,
then runs Waitress (web dashboard) in the main thread.
Waitress is thread-safe and works in any thread context.
Gunicorn requires the main thread — that's why we flipped it.
"""

import threading
import logging
import os

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def start_bot():
    from bot import main
    logger.info("Starting Telegram bot...")
    main()


def start_web():
    from web import run_web
    logger.info("Starting web dashboard...")
    run_web()


if __name__ == "__main__":
    # Bot runs in background thread
    bot_thread = threading.Thread(target=start_bot, daemon=True)
    bot_thread.start()

    # Web (Waitress) runs in main thread — no signal issues
    start_web()
