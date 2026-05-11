// ==========================================
// TELEGRAM BOT - NODEJS FULL FINAL
// ==========================================

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");

// ==========================================
// CONFIG
// ==========================================
const BOT_TOKEN = process.env.BOT_TOKEN;

// MULTIPLE ADMINS
const ADMIN_IDS = [5948588400, 6786393087];

// DEFAULT API
let API_URL = "https://api.maytapi.com/api/default/checkPhones";
let API_TOKEN = "default_token";

// ==========================================
// EXPRESS SERVER (UPTIME)
// ==========================================
const app = express();

const START_TIME = Date.now();

app.get("/", (req, res) => {

    const uptime = Math.floor((Date.now() - START_TIME) / 1000);

    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    res.send(`
        <html>
        <head>
            <title>Telegram Bot</title>
            <style>
                body{
                    background:#111;
                    color:#fff;
                    font-family:Arial;
                    text-align:center;
                    padding-top:100px;
                }

                .box{
                    width:350px;
                    margin:auto;
                    background:#1e1e1e;
                    padding:30px;
                    border-radius:20px;
                    box-shadow:0 0 20px rgba(0,255,0,0.3);
                }

                h1{
                    color:#00ff88;
                }

                p{
                    font-size:20px;
                }
            </style>
        </head>
        <body>

            <div class="box">
                <h1>BOT RUNNING ✅</h1>
                <p>Uptime:</p>
                <p>
                    ${hours}h ${minutes}m ${seconds}s
                </p>
            </div>

        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`WEB SERVER RUNNING ON ${PORT}`);
});

// ==========================================
// BOT
// ==========================================
const bot = new TelegramBot(BOT_TOKEN, {
    polling: true
});

// ==========================================
// MEMORY
// ==========================================
const users = {};
const approvedUsers = new Set();
const pendingUsers = {};

const waitingUsers = {};
const setUrlUsers = {};

// ==========================================
// FUNCTIONS
// ==========================================
function isAdmin(uid) {
    return ADMIN_IDS.includes(uid);
}

function initUser(user) {

    const uid = String(user.id);

    if (!users[uid]) {

        users[uid] = {
            name: user.first_name || "Unknown",
            hour_count: 0,
            hour_reset: Math.floor(Date.now() / 1000) + 3600
        };
    }
}

function resetLimit(uid) {

    const now = Math.floor(Date.now() / 1000);

    if (now >= users[uid].hour_reset) {

        users[uid].hour_count = 0;
        users[uid].hour_reset = now + 3600;
    }
}

// ==========================================
// KEYBOARD
// ==========================================
function keyboard(uid) {

    const rows = [
        [{ text: "Check Number" }]
    ];

    if (isAdmin(uid)) {

        rows.push([{ text: "Set Url" }]);
        rows.push([{ text: "User Request" }]);
    }

    return {
        keyboard: rows,
        resize_keyboard: true
    };
}

// ==========================================
// FORMAT NUMBERS
// ==========================================
function formatNumbers(numbers) {

    return numbers
        .map(n => `<code>+${n}</code>`)
        .join("\n");
}

// ==========================================
// CHECK API
// ==========================================
async function checkBatch(numbers) {

    const headers = {
        accept: "application/json",
        "x-maytapi-key": API_TOKEN,
        "Content-Type": "application/json"
    };

    const response = await axios.post(
        API_URL,
        { numbers },
        {
            headers,
            timeout: 60000
        }
    );

    const data = response.data;

    const reg = [];
    const unreg = [];

    for (const item of data.data || []) {

        let number;

        try {
            number = item.id.user;
        } catch {
            number = String(item.id).replace("@c.us", "");
        }

        if (item.valid === true) {
            reg.push(number);
        } else {
            unreg.push(number);
        }
    }

    return {
        reg,
        unreg
    };
}

// ==========================================
// RUN BATCHES
// ==========================================
async function runAllBatches(numbers) {

    let allReg = [];
    let allUnreg = [];

    for (let i = 0; i < numbers.length; i += 10) {

        const batch = numbers.slice(i, i + 10);

        const { reg, unreg } =
            await checkBatch(batch);

        allReg = [...allReg, ...reg];
        allUnreg = [...allUnreg, ...unreg];
    }

    return {
        reg: allReg,
        unreg: allUnreg
    };
}

// ==========================================
// START
// ==========================================
bot.onText(/\/start/, async (msg) => {

    const user = msg.from;

    initUser(user);

    await bot.sendMessage(
        msg.chat.id,
        "Welcome",
        {
            reply_markup: keyboard(user.id)
        }
    );
});

// ==========================================
// CALLBACKS
// ==========================================
bot.on("callback_query", async (query) => {

    const data = query.data;

    // APPROVE
    if (data.startsWith("approve_")) {

        const uid = data.split("_")[1];

        approvedUsers.add(uid);

        delete pendingUsers[uid];

        await bot.editMessageText(
            `✅ Approved ${uid}`,
            {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            }
        );
    }

    // REJECT
    else if (data.startsWith("reject_")) {

        const uid = data.split("_")[1];

        delete pendingUsers[uid];

        await bot.editMessageText(
            `❌ Rejected ${uid}`,
            {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            }
        );
    }

    await bot.answerCallbackQuery(query.id);
});

// ==========================================
// MAIN MESSAGE HANDLER
// ==========================================
bot.on("message", async (msg) => {

    if (!msg.text) return;

    if (msg.text.startsWith("/start")) return;

    const user = msg.from;
    const uid = String(user.id);
    const text = msg.text.trim();

    initUser(user);
    resetLimit(uid);

    // ======================================
    // SET URL
    // ======================================
    if (text === "Set Url" && isAdmin(user.id)) {

        setUrlUsers[uid] = true;

        await bot.sendMessage(
            msg.chat.id,
            "Send full API screen URL"
        );

        return;
    }

    // ======================================
    // SAVE URL
    // ======================================
    if (setUrlUsers[uid] && isAdmin(user.id)) {

        try {

            const url = text;

            const base =
                url.split("/screen")[0];

            const token =
                url.split("token=")[1]
                .split("&")[0];

            API_URL =
                `${base}/checkPhones`;

            API_TOKEN = token;

            await bot.sendMessage(
                msg.chat.id,
                "✅ API Updated"
            );

        } catch {

            await bot.sendMessage(
                msg.chat.id,
                "❌ Invalid URL"
            );
        }

        delete setUrlUsers[uid];

        return;
    }

    // ======================================
    // USER REQUEST PANEL
    // ======================================
    if (
        text === "User Request" &&
        isAdmin(user.id)
    ) {

        const keys =
            Object.keys(pendingUsers);

        if (keys.length === 0) {

            await bot.sendMessage(
                msg.chat.id,
                "No pending users"
            );

            return;
        }

        for (const puid of keys) {

            const name =
                pendingUsers[puid];

            await bot.sendMessage(
                msg.chat.id,
                `User: ${name}\nID: ${puid}`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "✅ Allow",
                                    callback_data:
                                        `approve_${puid}`
                                },
                                {
                                    text: "❌ Reject",
                                    callback_data:
                                        `reject_${puid}`
                                }
                            ]
                        ]
                    }
                }
            );
        }

        return;
    }

    // ======================================
    // CHECK NUMBER BUTTON
    // ======================================
    if (text === "Check Number") {

        if (
            !approvedUsers.has(uid) &&
            !isAdmin(user.id)
        ) {

            pendingUsers[uid] =
                user.first_name || "Unknown";

            await bot.sendMessage(
                msg.chat.id,
                "❌ Access denied\nRequest sent to admin"
            );

            for (const adminId of ADMIN_IDS) {

                await bot.sendMessage(
                    adminId,
                    `New User Request:\n${user.first_name}\n${uid}`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "✅ Allow",
                                        callback_data:
                                            `approve_${uid}`
                                    },
                                    {
                                        text: "❌ Reject",
                                        callback_data:
                                            `reject_${uid}`
                                    }
                                ]
                            ]
                        }
                    }
                );
            }

            return;
        }

        waitingUsers[uid] = true;

        await bot.sendMessage(
            msg.chat.id,
            "Send numbers (max 100)"
        );

        return;
    }

    // ======================================
    // PROCESS NUMBERS
    // ======================================
    if (waitingUsers[uid]) {

        let numbers = [];

        for (let line of text.split("\n")) {

            line = line.trim()
                .replace(/ /g, "");

            if (line.startsWith("+")) {
                line = line.substring(1);
            }

            if (/^\d+$/.test(line)) {
                numbers.push(line);
            }
        }

        // NO VALID
        if (numbers.length === 0) {

            await bot.sendMessage(
                msg.chat.id,
                "No valid numbers"
            );

            return;
        }

        // MAX LIMIT
        if (numbers.length > 100) {

            await bot.sendMessage(
                msg.chat.id,
                "Max 100 numbers"
            );

            return;
        }

        // USER LIMIT
        if (!isAdmin(user.id)) {

            const remain =
                400 -
                users[uid].hour_count;

            if (numbers.length > remain) {

                await bot.sendMessage(
                    msg.chat.id,
                    `Limit exceeded.\nRemaining: ${remain}`
                );

                return;
            }
        }

        await bot.sendMessage(
            msg.chat.id,
            `Checking ${numbers.length} numbers...`
        );

        try {

            const {
                reg,
                unreg
            } = await runAllBatches(numbers);

            // SAVE LIMIT
            if (!isAdmin(user.id)) {
                users[uid].hour_count +=
                    numbers.length;
            }

            // REGISTERED
            if (reg.length > 0) {

                await bot.sendMessage(
                    msg.chat.id,
                    `✅ <b>Registered Numbers</b>\n\n${formatNumbers(reg)}`,
                    {
                        parse_mode: "HTML"
                    }
                );
            }

            // UNREGISTERED
            if (unreg.length > 0) {

                await bot.sendMessage(
                    msg.chat.id,
                    `❌ <b>Not Registered Numbers</b>\n\n${formatNumbers(unreg)}`,
                    {
                        parse_mode: "HTML"
                    }
                );
            }

        } catch (e) {

            await bot.sendMessage(
                msg.chat.id,
                `Error:\n${e.message}`
            );
        }

        delete waitingUsers[uid];
    }
});

console.log("BOT STARTED");
