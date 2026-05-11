"""
main.py — Entry point for Render
Starts the Flask web dashboard in a background thread,
then runs the Telegram bot in the main thread.
"""

import threading
import logging
import os

logger = logging.getLogger(__name__)


def start_web():
    from web import run_web
    logger.info("Starting web dashboard...")
    run_web()


def start_bot():
    from bot import main
    logger.info("Starting Telegram bot...")
    main()


if __name__ == "__main__":
    # Web dashboard in background thread
    web_thread = threading.Thread(target=start_web, daemon=True)
    web_thread.start()

    # Bot runs in main thread (blocking)
    start_bot()
