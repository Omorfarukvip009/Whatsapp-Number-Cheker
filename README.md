# ⚡ WhatsApp Checker Bot — Complete Setup Guide

## Project Structure

```
whatsapp-bot/
├── main.py           ← Entry point (starts bot + web together)
├── bot.py            ← Telegram bot logic
├── web.py            ← Flask web dashboard
├── state.py          ← Shared JSON state manager
├── requirements.txt  ← Python dependencies
├── render.yaml       ← Render deployment config
└── templates/
    ├── login.html    ← Dashboard login page
    └── dashboard.html← Full admin panel
```

---

## Step 1 — Create Your Telegram Bot

1. Open Telegram → search `@BotFather`
2. Send `/newbot`
3. Enter a name: e.g. `WA Checker Bot`
4. Enter a username: e.g. `wa_checker_mybot`
5. Copy the **bot token** — looks like `7123456789:AAF...`

---

## Step 2 — Get Your Telegram User ID

1. Open Telegram → search `@userinfobot`
2. Send `/start`
3. It replies with your numeric ID, e.g. `5948588400`
4. Note this — you are the first admin

---

## Step 3 — Upload to GitHub

1. Go to https://github.com → **New repository**
2. Name it `whatsapp-checker-bot`, set to **Private**
3. Upload all these files (keep folder structure: `templates/` folder included)
4. Click **Commit changes**

---

## Step 4 — Deploy on Render

### 4.1 — Create Account
Go to https://render.com → Sign up (free)

### 4.2 — New Web Service
1. Dashboard → **New** → **Web Service**
2. Connect your GitHub account
3. Select your `whatsapp-checker-bot` repository
4. Click **Connect**

### 4.3 — Configure Service

| Setting | Value |
|---|---|
| Name | `whatsapp-checker-bot` |
| Environment | `Python 3` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `python main.py` |
| Instance Type | `Free` (or Starter for always-on) |

### 4.4 — Add Persistent Disk (IMPORTANT!)
Without this, your data resets on every deploy.

1. Scroll to **Disks** section
2. Click **Add Disk**
3. Mount Path: `/data`
4. Size: `1 GB`
5. Click **Save**

### 4.5 — Set Environment Variables
Click **Environment** tab → Add these one by one:

| Key | Value | Notes |
|---|---|---|
| `BOT_TOKEN` | `7123456789:AAF...` | From BotFather |
| `ADMIN_IDS` | `5948588400,1234567890` | Comma-separated, no spaces |
| `DASHBOARD_PASSWORD` | `YourStrongPassword123` | For web dashboard login |
| `DASHBOARD_SECRET` | `any-random-secret-string-xyz` | Flask session secret |
| `MAX_NUMBERS` | `100` | Max numbers per check |
| `HOURLY_LIMIT` | `400` | Max per user per hour |
| `BATCH_SIZE` | `10` | Numbers per API batch |

### 4.6 — Deploy
Click **Deploy Web Service** → Wait 2-3 minutes for build.

You will see:
```
⚡ Bot started
Starting web dashboard...
```

---

## Step 5 — Access Web Dashboard

Your dashboard URL will be:
```
https://whatsapp-checker-bot.onrender.com
```
(Render shows the exact URL in your service page)

1. Open the URL → Login page appears
2. Enter your `DASHBOARD_PASSWORD`
3. Full admin panel opens

---

## Step 6 — Configure API (Maytapi)

### Option A — Via Web Dashboard
1. Open dashboard → **API Config** tab
2. Paste your Maytapi screen URL
3. Click **Save API Config**

### Option B — Via Telegram Bot
1. Open your bot in Telegram
2. Press **Set Url** button
3. Paste the full screen URL from Maytapi

### URL Format Expected:
```
https://app.maytapi.com/screen?token=YOUR_TOKEN&...
```
The bot automatically extracts:
- **API endpoint**: `.../checkPhones`
- **Token**: from `token=` parameter

---

## Step 7 — Test the Bot

1. Open your bot in Telegram
2. Send `/start`
3. Press **Check Number**
4. Send some phone numbers (one per line):
   ```
   +8801712345678
   8801987654321
   01612345678
   ```
5. Bot checks and replies with registered/unregistered split

---

## Dashboard Features

### Overview Tab
- Total users, approved, pending, admins, banned counts
- Total numbers checked across all users
- Top 10 users by usage

### Users Tab
- Full user table with stats
- Per-user: hourly usage, total checked, status
- Actions: Approve / Ban / Unban / Remove

### Requests Tab
- Pending access requests with Allow/Reject buttons
- Badge shows pending count in sidebar

### Admins Tab
- Add admin by Telegram ID
- Remove admin privileges
- Lists all current admins

### API Config Tab
- Shows current API endpoint status
- Update API via screen URL
- Clear API configuration

---

## Bot Commands & Buttons

| Button | Who | Action |
|---|---|---|
| `Check Number` | All approved users | Start number checking |
| `Set Url` | Admins only | Update Maytapi API |
| `User Request` | Admins only | Review pending requests |

---

## How User Approval Works

1. New user sends `/start`
2. They press **Check Number**
3. Bot says "Access denied, request sent to admins"
4. All admins receive a notification with **Allow / Reject** buttons
5. Admin taps Allow → user gets approved immediately
6. User gets a confirmation message
7. Admin can also manage users from web dashboard

---

## Hourly Limit System

- Each non-admin user has a 400/hour limit (configurable)
- Counter resets 1 hour after first check
- Dashboard shows current hour usage per user
- Admins have no limit

---

## Troubleshooting

### Bot not responding
- Check `BOT_TOKEN` is correct in env vars
- Look at Render logs: Service → Logs tab

### Dashboard not loading
- Wait 30-60 seconds after deploy (free tier spins up slowly)
- Check the service URL in Render dashboard

### Data resets on redeploy
- Make sure Disk is added at `/data` mount path
- `STATE_FILE` env var should not be set (defaults to `/data/state.json`)

### API returning no results
- Verify screen URL is pasted correctly
- Check Maytapi account is active and phone is connected
- Test API token directly in Maytapi dashboard

### Free tier goes to sleep
- Render free tier sleeps after 15 min inactivity
- Use a service like https://uptimerobot.com to ping your URL every 10 min
- Or upgrade to Starter ($7/month) for always-on

---

## Updating the Bot

1. Edit files in GitHub
2. Render auto-deploys on every push
3. Or: Render dashboard → Manual Deploy → Deploy Latest Commit

---

## Security Notes

- Set a **strong** `DASHBOARD_PASSWORD` (not `admin123`)
- Set a **random** `DASHBOARD_SECRET` (long random string)
- Keep your repository **Private**
- Never share your `BOT_TOKEN` publicly
- Admin IDs in env vars are the source of truth on first run

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOT_TOKEN` | ✅ Yes | — | Telegram bot token |
| `ADMIN_IDS` | ✅ Yes | — | Comma-separated admin IDs |
| `DASHBOARD_PASSWORD` | ✅ Yes | `admin123` | Web dashboard password |
| `DASHBOARD_SECRET` | ✅ Yes | `change-me-...` | Flask session secret |
| `MAX_NUMBERS` | No | `100` | Max numbers per request |
| `HOURLY_LIMIT` | No | `400` | Hourly check limit per user |
| `BATCH_SIZE` | No | `10` | API batch size |
| `STATE_FILE` | No | `/data/state.json` | State file path |
| `PORT` | No | `5000` | Web server port (set by Render) |
