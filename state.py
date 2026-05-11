"""
Shared state management — JSON file based, no database required.
Safe for single-process use on Render free tier.
"""

import json
import os
import threading

STATE_FILE = os.environ.get("STATE_FILE", "state.json")
_lock = threading.Lock()

DEFAULT_STATE = {
    "admin_ids": [],        # list of str user IDs
    "approved_users": [],   # list of str user IDs
    "pending_users": {},    # uid -> name
    "users": {},            # uid -> user record
    "api_url": "",
    "api_token": "",
    "api_screen_url": "",
}


def load_state() -> dict:
    with _lock:
        if not os.path.exists(STATE_FILE):
            # Seed admin IDs from env on first run
            state = dict(DEFAULT_STATE)
            state["admin_ids"] = [
                a.strip()
                for a in os.environ.get("ADMIN_IDS", "").split(",")
                if a.strip()
            ]
            _write(state)
            return state

        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Merge any missing keys from DEFAULT_STATE
            for k, v in DEFAULT_STATE.items():
                if k not in data:
                    data[k] = v
            return data
        except Exception:
            state = dict(DEFAULT_STATE)
            _write(state)
            return state


def save_state(state: dict):
    with _lock:
        _write(state)


def _write(state: dict):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
