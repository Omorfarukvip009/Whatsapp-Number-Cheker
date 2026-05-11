const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');

// ==========================================
// CONFIG
// ==========================================
const BOT_TOKEN = process.env.BOT_TOKEN;

const ADMIN_IDS = [
  5948588400,
  1234567890
];

let API_URL = 'https://api.maytapi.com/api/default/checkPhones';
let API_TOKEN = 'default_token';

const MAX_NUMBERS = 100;
const HOURLY_LIMIT = 400;
const BATCH_SIZE = 10;

// ==========================================
// TELEGRAM BOT
// ==========================================
const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

// ==========================================
// EXPRESS WEB SERVER
// ==========================================
const app = express();

const START_TIME = Date.now();
let BOT_STATUS = 'Online ✅';

app.get('/', (req, res) => {

  const uptime = Math.floor((Date.now() - START_TIME) / 1000);

  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;

  res.send(`
  <html>
  <head>
    <title>Telegram Bot Status</title>

    <style>
      body {
        background: #0f172a;
        color: white;
        font-family: Arial;
        text-align: center;
        padding-top: 100px;
      }

      .box {
        display: inline-block;
        background: #1e293b;
        padding: 40px;
        border-radius: 20px;
        box-shadow: 0 0 30px rgba(0,0,0,0.4);
      }

      h1 {
        color: #22c55e;
      }
    </style>
  </head>

  <body>

    <div class="box">
      <h1>⚡ Telegram Bot Running</h1>

      <p>Status: ${BOT_STATUS}</p>

      <h2>
        ${hours}h ${minutes}m ${seconds}s
      </h2>
    </div>

  </body>
  </html>
  `);
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Web server running on ${PORT}`);
});

// ==========================================
// MEMORY
// ==========================================
const users = {};
const approvedUsers = new Set();
const pendingUsers = {};
const waitingNumbers = new Set();
const waitingUrl = new Set();

// ==========================================
// HELPERS
// ==========================================
function isAdmin(id) {
  return ADMIN_IDS.includes(id);
}

function initUser(msg) {

  const uid = String(msg.from.id);

  if (!users[uid]) {
    users[uid] = {
      name: msg.from.first_name || 'Unknown',
      hour_count: 0,
      hour_reset: Date.now() + 3600000
    };
  }
}

function resetLimit(uid) {

  if (Date.now() >= users[uid].hour_reset) {
    users[uid].hour_count = 0;
    users[uid].hour_reset = Date.now() + 3600000;
  }
}

function keyboard(id) {

  const rows = [
    ['Check Number']
  ];

  if (isAdmin(id)) {
    rows.push(['Set Url']);
    rows.push(['User Request']);
  }

  return {
    keyboard: rows,
    resize_keyboard: true
  };
}

function formatNumbers(numbers) {

  return numbers
    .map(n => `<code>+${n}</code>`)
    .join('\n');
}

function splitArray(array, size) {

  const result = [];

  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }

  return result;
}

// ==========================================
// FAST API CHECK
// ==========================================
async function checkBatch(numbers) {

  try {

    const response = await axios.post(
      API_URL,
      {
        numbers
      },
      {
        headers: {
          accept: 'application/json',
          'x-maytapi-key': API_TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: 30000
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
        number = String(item.id).replace('@c.us', '');
      }

      if (item.valid) {
        reg.push(number);
      } else {
        unreg.push(number);
      }
    }

    return {
      reg,
      unreg
    };

  } catch {

    return {
      reg: [],
      unreg: []
    };
  }
}

// ==========================================
// PARALLEL CHECKER
// ==========================================
async function runAllBatches(numbers) {

  const batches = splitArray(numbers, BATCH_SIZE);

  const results = await Promise.all(
    batches.map(batch => checkBatch(batch))
  );

  let allReg = [];
  let allUnreg = [];

  for (const result of results) {
    allReg.push(...result.reg);
    allUnreg.push(...result.unreg);
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

  initUser(msg);

  await bot.sendMessage(
    msg.chat.id,
    '✅ Bot Ready',
    {
      reply_markup: keyboard(msg.from.id)
    }
  );
});

// ==========================================
// CALLBACKS
// ==========================================
bot.on('callback_query', async (query) => {

  const data = query.data;

  if (data.startsWith('approve_')) {

    const uid = data.split('_')[1];

    approvedUsers.add(uid);
    delete pendingUsers[uid];

    await bot.editMessageText(
      `✅ Approved: ${uid}`,
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id
      }
    );
  }

  else if (data.startsWith('reject_')) {

    const uid = data.split('_')[1];

    delete pendingUsers[uid];

    await bot.editMessageText(
      `❌ Rejected: ${uid}`,
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id
      }
    );
  }
});

// ==========================================
// MESSAGE HANDLER
// ==========================================
bot.on('message', async (msg) => {

  if (!msg.text || msg.text.startsWith('/start')) {
    return;
  }

  initUser(msg);

  const uid = String(msg.from.id);

  resetLimit(uid);

  const text = msg.text.trim();

  // =====================================
  // SET URL
  // =====================================
  if (text === 'Set Url' && isAdmin(msg.from.id)) {

    waitingUrl.add(uid);

    return bot.sendMessage(
      msg.chat.id,
      'Send full screen URL'
    );
  }

  if (waitingUrl.has(uid) && isAdmin(msg.from.id)) {

    try {

      const base = text.split('/screen')[0];
      const token = text.split('token=')[1].split('&')[0];

      API_URL = base + '/checkPhones';
      API_TOKEN = token;

      await bot.sendMessage(
        msg.chat.id,
        '✅ API Updated Successfully'
      );

    } catch {

      await bot.sendMessage(
        msg.chat.id,
        '❌ Invalid URL'
      );
    }

    waitingUrl.delete(uid);

    return;
  }

  // =====================================
  // USER REQUEST PANEL
  // =====================================
  if (text === 'User Request' && isAdmin(msg.from.id)) {

    const entries = Object.entries(pendingUsers);

    if (!entries.length) {

      return bot.sendMessage(
        msg.chat.id,
        'No pending users'
      );
    }

    for (const [puid, name] of entries) {

      await bot.sendMessage(
        msg.chat.id,
        `👤 ${name}\n🆔 ${puid}`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '✅ Allow',
                  callback_data: `approve_${puid}`
                },
                {
                  text: '❌ Reject',
                  callback_data: `reject_${puid}`
                }
              ]
            ]
          }
        }
      );
    }

    return;
  }

  // =====================================
  // CHECK NUMBER BUTTON
  // =====================================
  if (text === 'Check Number') {

    if (!approvedUsers.has(uid) && !isAdmin(msg.from.id)) {

      pendingUsers[uid] = msg.from.first_name || 'Unknown';

      await bot.sendMessage(
        msg.chat.id,
        '❌ Access denied\nRequest sent to admins'
      );

      for (const adminId of ADMIN_IDS) {

        try {

          await bot.sendMessage(
            adminId,
            `🔔 New User Request\n\n👤 Name: ${msg.from.first_name}\n🆔 ID: ${uid}`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: '✅ Allow',
                      callback_data: `approve_${uid}`
                    },
                    {
                      text: '❌ Reject',
                      callback_data: `reject_${uid}`
                    }
                  ]
                ]
              }
            }
          );

        } catch {}
      }

      return;
    }

    waitingNumbers.add(uid);

    return bot.sendMessage(
      msg.chat.id,
      '📥 Send numbers line by line\nMax 100 numbers'
    );
  }

  // =====================================
  // PROCESS NUMBERS
  // =====================================
  if (waitingNumbers.has(uid)) {

    let numbers = text
      .split('\n')
      .map(x => x
        .trim()
        .replace(/\s+/g, '')
        .replace(/[-()]/g, '')
        .replace(/^\+/, '')
      )
      .filter(x => /^\d+$/.test(x));

    numbers = [...new Set(numbers)];

    if (!numbers.length) {

      return bot.sendMessage(
        msg.chat.id,
        '❌ No valid numbers'
      );
    }

    if (numbers.length > MAX_NUMBERS) {

      return bot.sendMessage(
        msg.chat.id,
        `❌ Max ${MAX_NUMBERS} numbers`
      );
    }

    if (!isAdmin(msg.from.id)) {

      const remain = HOURLY_LIMIT - users[uid].hour_count;

      if (numbers.length > remain) {

        return bot.sendMessage(
          msg.chat.id,
          `❌ Hourly limit exceeded\nRemaining: ${remain}`
        );
      }
    }

    const start = Date.now();

    const processing = await bot.sendMessage(
      msg.chat.id,
      `⚡ Checking ${numbers.length} numbers...`
    );

    try {

      const result = await runAllBatches(numbers);

      if (!isAdmin(msg.from.id)) {
        users[uid].hour_count += numbers.length;
      }

      const elapsed = ((Date.now() - start) / 1000).toFixed(2);

      let responseText = `⚡ <b>Completed in ${elapsed}s</b>\n\n`;

      if (result.reg.length) {

        responseText +=
          '✅ <b>Registered Numbers</b>\n\n' +
          formatNumbers(result.reg);
      }

      if (result.unreg.length) {

        responseText +=
          '\n\n❌ <b>Not Registered Numbers</b>\n\n' +
          formatNumbers(result.unreg);
      }

      if (!result.reg.length && !result.unreg.length) {
        responseText += 'No results';
      }

      if (responseText.length > 4000) {

        const chunks = responseText.match(/.{1,4000}/gs);

        await bot.deleteMessage(
          msg.chat.id,
          processing.message_id
        );

        for (const chunk of chunks) {

          await bot.sendMessage(
            msg.chat.id,
            chunk,
            {
              parse_mode: 'HTML'
            }
          );
        }

      } else {

        await bot.editMessageText(
          responseText,
          {
            chat_id: msg.chat.id,
            message_id: processing.message_id,
            parse_mode: 'HTML'
          }
        );
      }

    } catch (e) {

      await bot.editMessageText(
        `❌ Error:\n${e.message}`,
        {
          chat_id: msg.chat.id,
          message_id: processing.message_id
        }
      );
    }

    waitingNumbers.delete(uid);
  }
});

// ==========================================
// START
// ==========================================
console.log('⚡ Ultra Fast Node.js Bot Started');
