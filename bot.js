const { Telegraf } = require("telegraf");
const axios = require("axios");

const User = require("./models/User");
const Config = require("./models/Config");

const bot = new Telegraf(process.env.BOT_TOKEN);

// REGISTER USER
bot.start(async (ctx) => {
  const u = ctx.from;

  const existing = await User.findOne({ userId: String(u.id) });

  if (!existing) {
    await User.create({ userId: String(u.id), name: u.first_name });
    return ctx.reply("👋 Welcome! Your request has been sent.\n⏳ Please wait for admin approval.");
  }

  // Update name only — never overwrite approval/ban status
  existing.name = u.first_name;
  await existing.save();

  if (existing.banned)   return ctx.reply("🚫 You are banned from using this bot.");
  if (existing.approved) return ctx.reply(`✅ Welcome back, ${u.first_name}!\n\nSend me phone numbers (one per line, up to 100) to check WhatsApp registration.`);
  return ctx.reply("⏳ Your account is pending approval. You'll be notified once approved.");
});

// MAIN HANDLER
bot.on("text", async (ctx) => {

  const uid = String(ctx.from.id);

  const user = await User.findOne({ userId: uid });
  const config = await Config.findOne();

  if (!user) return ctx.reply("Access denied");
  if (user.banned) return ctx.reply("🚫 You are banned");
  if (!user.approved) return ctx.reply("⏳ Not approved yet");
  if (!config) return ctx.reply("⚠️ API not configured");

  // PARSE NUMBERS
  const numbers = ctx.message.text
    .split("\n")
    .map(n => n.replace("+","").trim())
    .filter(n => /^\d+$/.test(n));

  if (!numbers.length) return ctx.reply("No valid numbers");
  if (numbers.length > 100) return ctx.reply("Max 100 numbers");

  ctx.reply(`Checking ${numbers.length} numbers...`);

  try {

    const res = await axios.post(
      config.apiUrl,
      { numbers },
      {
        headers: {
          accept: "application/json",
          "x-maytapi-key": config.apiToken,
          "Content-Type": "application/json"
        }
      }
    );

    const reg = [];
    const unreg = [];

    for (const item of res.data.data) {

      let number;

      if (typeof item.id === "object") {
        number = item.id.user;
      } else {
        number = item.id.replace("@c.us", "");
      }

      if (item.valid === true) reg.push(number);
      else unreg.push(number);
    }

    user.totalChecked += numbers.length;
    await user.save();

    if (reg.length)
      await ctx.reply("✅ Registered:\n" + reg.map(n => "+" + n).join("\n"));

    if (unreg.length)
      await ctx.reply("❌ Not Registered:\n" + unreg.map(n => "+" + n).join("\n"));

  } catch (e) {
    ctx.reply("API Error: " + e.message);
  }
});

module.exports = bot;
