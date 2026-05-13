const express = require("express");
const axios = require("axios");
const { Telegraf, Markup } = require("telegraf");

// =========================
// ENV
// =========================
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.log("BOT_TOKEN missing");
  process.exit(1);
}

if (!WEBHOOK_DOMAIN) {
  console.log("WEBHOOK_DOMAIN missing");
  process.exit(1);
}

// =========================
// BOT INIT
// =========================
const bot = new Telegraf(BOT_TOKEN);

// =========================
// EXPRESS APP
// =========================
const app = express();
app.use(bot.webhookCallback("/telegraf"));

app.get("/", (req, res) => {
  res.send("✅ Bot Running (Webhook Mode)");
});

// =========================
// MEMORY
// =========================
const users = {};
const approvedUsers = new Set();
const pendingUsers = {};

let API_URL =
  process.env.API_URL ||
  "https://api.maytapi.com/api/default/checkPhones";

let API_TOKEN = process.env.API_TOKEN || "default_token";

// =========================
// USER INIT
// =========================
function initUser(user) {
  const uid = String(user.id);

  if (!users[uid]) {
    users[uid] = {
      name: user.first_name || "Unknown",
      hour_count: 0,
      hour_reset: Date.now() + 3600000,
      waiting: false,
      set_url: false
    };
  }
}

// =========================
// RESET LIMIT
// =========================
function resetLimit(uid) {
  if (Date.now() > users[uid].hour_reset) {
    users[uid].hour_count = 0;
    users[uid].hour_reset = Date.now() + 3600000;
  }
}

// =========================
// KEYBOARD
// =========================
function keyboard(uid) {
  const rows = [["Check Number"]];

  if (Number(uid) === 5948588400) {
    rows.push(["Set Url"]);
    rows.push(["User Request"]);
  }

  return Markup.keyboard(rows).resize();
}

// =========================
// FORMAT
// =========================
function format(numbers) {
  return numbers.map(n => `<code>+${n}</code>`).join("\n");
}

// =========================
// API CHECK
// =========================
async function checkBatch(numbers) {
  const res = await axios.post(
    API_URL,
    { numbers },
    {
      headers: {
        accept: "application/json",
        "x-maytapi-key": API_TOKEN,
        "Content-Type": "application/json"
      },
      timeout: 60000
    }
  );

  const reg = [];
  const unreg = [];

  for (const item of res.data.data || []) {
    let number;

    try {
      number = item.id.user;
    } catch {
      number = String(item.id).replace("@c.us", "");
    }

    if (item.valid) reg.push(number);
    else unreg.push(number);
  }

  return { reg, unreg };
}

// =========================
// BATCH RUN
// =========================
async function runAll(numbers) {
  let reg = [];
  let unreg = [];

  for (let i = 0; i < numbers.length; i += 10) {
    const batch = numbers.slice(i, i + 10);
    const res = await checkBatch(batch);

    reg = reg.concat(res.reg);
    unreg = unreg.concat(res.unreg);
  }

  return { reg, unreg };
}

// =========================
// START
// =========================
bot.start(async (ctx) => {
  initUser(ctx.from);
  await ctx.reply("Welcome", keyboard(ctx.from.id));
});

// =========================
// CALLBACKS
// =========================
bot.action(/approve_(.+)/, async (ctx) => {
  const uid = ctx.match[1];

  approvedUsers.add(uid);
  delete pendingUsers[uid];

  await ctx.editMessageText(`✅ Approved ${uid}`);
});

bot.action(/reject_(.+)/, async (ctx) => {
  const uid = ctx.match[1];

  delete pendingUsers[uid];

  await ctx.editMessageText(`❌ Rejected ${uid}`);
});

// =========================
// MAIN HANDLER
// =========================
bot.on("text", async (ctx) => {
  const user = ctx.from;
  const uid = String(user.id);
  const text = ctx.message.text.trim();

  initUser(user);
  resetLimit(uid);

  // -------------------
  // SET URL
  // -------------------
  if (text === "Set Url" && user.id === 5948588400) {
    users[uid].set_url = true;
    return ctx.reply("Send full API URL");
  }

  if (users[uid].set_url && user.id === 5948588400) {
    try {
      const base = text.split("/screen")[0];
      const token = text.split("token=")[1].split("&")[0];

      API_URL = `${base}/checkPhones`;
      API_TOKEN = token;

      await ctx.reply("✅ API Updated");
    } catch {
      await ctx.reply("❌ Invalid URL");
    }

    users[uid].set_url = false;
    return;
  }

  // -------------------
  // CHECK NUMBER
  // -------------------
  if (text === "Check Number") {
    if (!approvedUsers.has(uid) && user.id !== 5948588400) {
      pendingUsers[uid] = user.first_name;

      return ctx.reply("❌ Access denied\nRequest sent to admin");
    }

    users[uid].waiting = true;
    return ctx.reply("Send numbers (max 100)");
  }

  // -------------------
  // PROCESS NUMBERS
  // -------------------
  if (users[uid].waiting) {
    let numbers = [];

    for (let line of text.split("\n")) {
      line = line.replace(/\s+/g, "");
      if (line.startsWith("+")) line = line.slice(1);
      if (/^\d+$/.test(line)) numbers.push(line);
    }

    if (!numbers.length) return ctx.reply("No valid numbers");
    if (numbers.length > 100) return ctx.reply("Max 100 numbers");

    if (user.id !== 5948588400) {
      const remain = 400 - users[uid].hour_count;
      if (numbers.length > remain)
        return ctx.reply(`Limit exceeded: ${remain}`);
    }

    await ctx.reply(`Checking ${numbers.length} numbers...`);

    const result = await runAll(numbers);

    users[uid].hour_count += numbers.length;
    users[uid].waiting = false;

    if (result.reg.length)
      await ctx.replyWithHTML(
        "✅ Registered\n\n" + format(result.reg)
      );

    if (result.unreg.length)
      await ctx.replyWithHTML(
        "❌ Not Registered\n\n" + format(result.unreg)
      );
  }
});

// =========================
// WEBHOOK SETUP
// =========================
async function startWebhook() {
  const url = `${WEBHOOK_DOMAIN}/telegraf`;
  await bot.telegram.setWebhook(url);
  console.log("Webhook set:", url);
}

// =========================
// SERVER START
// =========================
app.listen(PORT, async () => {
  console.log("Server running on", PORT);
  await startWebhook();
});
