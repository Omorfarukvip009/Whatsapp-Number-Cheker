"""
Shared state management — JSON file based, no database required.
Safe for single-process use on Render free tier.

FIX: ADMIN_IDS from env are merged on EVERY load, not just first run.
This means if Render wipes state.json (ephemeral filesystem), admins
are restored automatically from the environment variable.
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


def _get_env_admin_ids():
    """Always read ADMIN_IDS from env — returns list of str IDs."""
    return [
        a.strip()
        for a in os.environ.get("ADMIN_IDS", "").split(",")
        if a.strip()
    ]


def load_state() -> dict:
    with _lock:
        if not os.path.exists(STATE_FILE):
            state = dict(DEFAULT_STATE)
            # Seed admins from env on first run
            state["admin_ids"] = _get_env_admin_ids()
            # Admins are automatically approved
            for aid in state["admin_ids"]:
                if aid not in state["approved_users"]:
                    state["approved_users"].append(aid)
            _write(state)
            return state

        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Merge any missing keys from DEFAULT_STATE
            for k, v in DEFAULT_STATE.items():
                if k not in data:
                    data[k] = v

            # FIX: Always merge env ADMIN_IDS so they survive redeploys
            env_admins = _get_env_admin_ids()
            for aid in env_admins:
                if aid not in data["admin_ids"]:
                    data["admin_ids"].append(aid)
                # Admins are automatically approved
                if aid not in data["approved_users"]:
                    data["approved_users"].append(aid)

            return data
        except Exception:
            state = dict(DEFAULT_STATE)
            state["admin_ids"] = _get_env_admin_ids()
            for aid in state["admin_ids"]:
                if aid not in state["approved_users"]:
                    state["approved_users"].append(aid)
            _write(state)
            return state


def save_state(state: dict):
    with _lock:
        _write(state)


def _write(state: dict):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
