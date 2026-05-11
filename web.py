"""
Web Dashboard for WhatsApp Checker Bot
Flask app — runs via Gunicorn (production WSGI server)
"""

import os
import time
import threading
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from state import load_state, save_state

app = Flask(__name__)
app.secret_key = os.environ.get("DASHBOARD_SECRET", "change-me-in-production-123")

DASHBOARD_PASSWORD = os.environ.get("DASHBOARD_PASSWORD", "admin123")


# ==========================================
# AUTH
# ==========================================
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("logged_in"):
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        if request.form.get("password") == DASHBOARD_PASSWORD:
            session["logged_in"] = True
            return redirect(url_for("dashboard"))
        error = "Invalid password"
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ==========================================
# DASHBOARD
# ==========================================
@app.route("/")
@login_required
def dashboard():
    state = load_state()
    now = int(time.time())

    users = []
    for uid, u in state["users"].items():
        reset_in = max(0, u.get("hour_reset", now) - now)
        users.append({
            "uid": uid,
            "name": u.get("name", "Unknown"),
            "username": u.get("username", ""),
            "total_checked": u.get("total_checked", 0),
            "hour_count": u.get("hour_count", 0),
            "reset_in_min": reset_in // 60,
            "banned": u.get("banned", False),
            "approved": uid in state["approved_users"],
            "is_admin": uid in state["admin_ids"],
            "joined": u.get("joined", 0),
        })

    users.sort(key=lambda x: x["total_checked"], reverse=True)

    stats = {
        "total_users": len(state["users"]),
        "approved_count": len(state["approved_users"]),
        "pending_count": len(state["pending_users"]),
        "admin_count": len(state["admin_ids"]),
        "banned_count": sum(1 for u in state["users"].values() if u.get("banned")),
        "total_checked": sum(u.get("total_checked", 0) for u in state["users"].values()),
        "api_set": bool(state.get("api_url")),
        "api_url": state.get("api_url", ""),
        "api_screen_url": state.get("api_screen_url", ""),
    }

    pending = [
        {"uid": uid, "name": name}
        for uid, name in state["pending_users"].items()
    ]

    admins = [
        {
            "uid": uid,
            "name": state["users"].get(uid, {}).get("name", uid),
            "username": state["users"].get(uid, {}).get("username", ""),
        }
        for uid in state["admin_ids"]
    ]

    return render_template(
        "dashboard.html",
        stats=stats,
        users=users,
        pending=pending,
        admins=admins,
        api_url=state.get("api_url", ""),
        api_screen_url=state.get("api_screen_url", ""),
        api_token_set=bool(state.get("api_token")),
    )


# ==========================================
# API ENDPOINTS (JSON)
# ==========================================

@app.route("/api/approve/<uid>", methods=["POST"])
@login_required
def approve_user(uid):
    state = load_state()
    if uid not in state["approved_users"]:
        state["approved_users"].append(uid)
    state["pending_users"].pop(uid, None)
    save_state(state)
    return jsonify({"ok": True, "message": f"User {uid} approved"})


@app.route("/api/reject/<uid>", methods=["POST"])
@login_required
def reject_user(uid):
    state = load_state()
    state["pending_users"].pop(uid, None)
    save_state(state)
    return jsonify({"ok": True, "message": f"User {uid} rejected"})


@app.route("/api/ban/<uid>", methods=["POST"])
@login_required
def ban_user(uid):
    state = load_state()
    if uid in state["users"]:
        state["users"][uid]["banned"] = True
    if uid in state["approved_users"]:
        state["approved_users"].remove(uid)
    save_state(state)
    return jsonify({"ok": True, "message": f"User {uid} banned"})


@app.route("/api/unban/<uid>", methods=["POST"])
@login_required
def unban_user(uid):
    state = load_state()
    if uid in state["users"]:
        state["users"][uid]["banned"] = False
    save_state(state)
    return jsonify({"ok": True, "message": f"User {uid} unbanned"})


@app.route("/api/remove_user/<uid>", methods=["POST"])
@login_required
def remove_user(uid):
    state = load_state()
    state["users"].pop(uid, None)
    if uid in state["approved_users"]:
        state["approved_users"].remove(uid)
    state["pending_users"].pop(uid, None)
    if uid in state["admin_ids"]:
        state["admin_ids"].remove(uid)
    save_state(state)
    return jsonify({"ok": True, "message": f"User {uid} removed"})


@app.route("/api/add_admin", methods=["POST"])
@login_required
def add_admin():
    data = request.get_json()
    uid = str(data.get("uid", "")).strip()
    if not uid or not uid.isdigit():
        return jsonify({"ok": False, "message": "Invalid user ID"})
    state = load_state()
    if uid not in state["admin_ids"]:
        state["admin_ids"].append(uid)
    if uid not in state["approved_users"]:
        state["approved_users"].append(uid)
    save_state(state)
    return jsonify({"ok": True, "message": f"Admin {uid} added"})


@app.route("/api/remove_admin/<uid>", methods=["POST"])
@login_required
def remove_admin(uid):
    state = load_state()
    if uid in state["admin_ids"]:
        state["admin_ids"].remove(uid)
    save_state(state)
    return jsonify({"ok": True, "message": f"Admin {uid} removed"})


@app.route("/api/update_api", methods=["POST"])
@login_required
def update_api():
    data = request.get_json()
    screen_url = data.get("screen_url", "").strip()
    if not screen_url:
        return jsonify({"ok": False, "message": "URL is empty"})
    try:
        base = screen_url.split("/screen")[0]
        token = screen_url.split("token=")[1].split("&")[0]
        api_url = base + "/checkPhones"
        state = load_state()
        state["api_url"] = api_url
        state["api_token"] = token
        state["api_screen_url"] = screen_url
        save_state(state)
        return jsonify({"ok": True, "message": "API updated", "api_url": api_url})
    except Exception as e:
        return jsonify({"ok": False, "message": f"Invalid URL: {e}"})


@app.route("/api/clear_api", methods=["POST"])
@login_required
def clear_api():
    state = load_state()
    state["api_url"] = ""
    state["api_token"] = ""
    state["api_screen_url"] = ""
    save_state(state)
    return jsonify({"ok": True, "message": "API cleared"})


@app.route("/api/stats")
@login_required
def api_stats():
    state = load_state()
    return jsonify({
        "total_users": len(state["users"]),
        "approved": len(state["approved_users"]),
        "pending": len(state["pending_users"]),
        "admins": len(state["admin_ids"]),
        "total_checked": sum(u.get("total_checked", 0) for u in state["users"].values()),
        "api_configured": bool(state.get("api_url")),
    })


# ==========================================
# RUN via Gunicorn (production WSGI)
# ==========================================
def run_web(host="0.0.0.0", port=None):
    import gunicorn.app.base

    port = port or int(os.environ.get("PORT", 5000))

    class StandaloneApp(gunicorn.app.base.BaseApplication):
        def __init__(self, application, options=None):
            self.options = options or {}
            self.application = application
            super().__init__()

        def load_config(self):
            for key, value in self.options.items():
                self.cfg.set(key.lower(), value)

        def load(self):
            return self.application

    options = {
        "bind": f"{host}:{port}",
        "workers": 1,       # must be 1 — shares state file with bot thread
        "threads": 4,
        "timeout": 60,
        "loglevel": "warning",
        "accesslog": "-",
    }

    StandaloneApp(app, options).run()


if __name__ == "__main__":
    run_web()
