// ==========================================
// TELEGRAM BOT - NODEJS FINAL FIX
// ==========================================

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");

// ==========================================
// ENV
// ==========================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

// ==========================================
// ADMINS
// ==========================================
const ADMIN_IDS = [5948588400, 6786393087];

// ==========================================
// API CONFIG
// ==========================================
let API_URL = "https://api.maytapi.com/api/default/checkPhones";
let API_TOKEN = "default_token";

// ==========================================
// EXPRESS (UPTIME)
// ==========================================
const app = express();
const START_TIME = Date.now();

app.get("/", (req, res) => {
    const uptime = Math.floor((Date.now() - START_TIME) / 1000);

    res.send(`
        <h1>BOT RUNNING ✅</h1>
        <p>Uptime: ${uptime} seconds</p>
    `);
});

app.listen(PORT, () => {
    console.log("Web running on", PORT);
});

// ==========================================
// BOT
// ==========================================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ==========================================
// MEMORY
// ==========================================
const users = {};
const approved = new Set();
const pending = {};
const waiting = {};
const setUrl = {};

// ==========================================
// HELPERS
// ==========================================
const isAdmin = (id) => ADMIN_IDS.includes(id);

function initUser(user) {
    const id = String(user.id);
    if (!users[id]) {
        users[id] = {
            count: 0,
            reset: Date.now() + 3600000
        };
    }
}

function resetLimit(id) {
    if (Date.now() > users[id].reset) {
        users[id].count = 0;
        users[id].reset = Date.now() + 3600000;
    }
}

function format(nums) {
    return nums.map(n => `+${n}`).join("\n");
}

// ==========================================
// API FIXED REQUEST (IMPORTANT)
// ==========================================
async function checkBatch(numbers) {
    try {

        const payload = {
            numbers: numbers.map(String)
        };

        const res = await axios.post(API_URL, payload, {
            headers: {
                "accept": "application/json",
                "x-maytapi-key": API_TOKEN,
                "Content-Type": "application/json"
            },
            timeout: 60000,
            validateStatus: () => true
        });

        if (res.status !== 200) {
            console.log("API ERROR:", res.data);
            throw new Error("API failed");
        }

        const reg = [];
        const unreg = [];

        for (const item of res.data?.data || []) {

            let num = item?.id?.user || String(item?.id).replace("@c.us", "");

            if (item.valid) reg.push(num);
            else unreg.push(num);
        }

        return { reg, unreg };

    } catch (e) {
        console.log("API ERROR:", e.message);
        throw e;
    }
}

// ==========================================
// BATCH RUN
// ==========================================
async function runAll(numbers) {
    let reg = [];
    let unreg = [];

    for (let i = 0; i < numbers.length; i += 10) {
        const batch = numbers.slice(i, i + 10);
        const result = await checkBatch(batch);

        reg.push(...result.reg);
        unreg.push(...result.unreg);
    }

    return { reg, unreg };
}

// ==========================================
// START
// ==========================================
bot.onText(/\/start/, (msg) => {
    initUser(msg.from);

    bot.sendMessage(msg.chat.id, "Welcome", {
        reply_markup: {
            keyboard: [
                [{ text: "Check Number" }],
                [{ text: "Set Url" }, { text: "User Request" }]
            ],
            resize_keyboard: true
        }
    });
});

// ==========================================
// MESSAGE HANDLER
// ==========================================
bot.on("message", async (msg) => {

    if (!msg.text) return;

    const user = msg.from;
    const id = String(user.id);
    const text = msg.text.trim();

    initUser(user);
    resetLimit(id);

    // =========================
    // SET URL
    // =========================
    if (text === "Set Url" && isAdmin(user.id)) {
        setUrl[id] = true;
        return bot.sendMessage(msg.chat.id, "Send API URL");
    }

    if (setUrl[id] && isAdmin(user.id)) {
        try {
            const base = text.split("/screen")[0];
            const token = text.split("token=")[1].split("&")[0];

            API_URL = base + "/checkPhones";
            API_TOKEN = token;

            bot.sendMessage(msg.chat.id, "API Updated ✅");
        } catch {
            bot.sendMessage(msg.chat.id, "Invalid URL ❌");
        }

        delete setUrl[id];
        return;
    }

    // =========================
    // CHECK NUMBER
    // =========================
    if (text === "Check Number") {

        if (!approved.has(id) && !isAdmin(user.id)) {

            pending[id] = user.first_name;

            bot.sendMessage(msg.chat.id, "Access denied");

            return;
        }

        waiting[id] = true;
        return bot.sendMessage(msg.chat.id, "Send numbers (max 100)");
    }

    // =========================
    // PROCESS NUMBERS
    // =========================
    if (waiting[id]) {

        let numbers = text.split("\n")
            .map(n => n.replace(/\D/g, ""))
            .filter(n => n.length > 0)
            .slice(0, 100);

        if (!numbers.length)
            return bot.sendMessage(msg.chat.id, "No valid numbers");

        if (!isAdmin(user.id)) {
            const remain = 400 - users[id].count;
            if (numbers.length > remain)
                return bot.sendMessage(msg.chat.id, `Limit left: ${remain}`);
        }

        bot.sendMessage(msg.chat.id, "Checking...");

        try {
            const { reg, unreg } = await runAll(numbers);

            users[id].count += numbers.length;

            if (reg.length)
                bot.sendMessage(msg.chat.id,
                    "REGISTERED:\n" + format(reg)
                );

            if (unreg.length)
                bot.sendMessage(msg.chat.id,
                    "NOT REGISTERED:\n" + format(unreg)
                );

        } catch (e) {
            bot.sendMessage(msg.chat.id, "API ERROR");
        }

        delete waiting[id];
    }
});

console.log("BOT STARTED");
