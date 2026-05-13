// ==========================================
// TELEGRAM BOT - NODEJS VERSION
// WITH USER REQUEST SYSTEM
// RENDER READY
// ==========================================

const express = require("express");
const axios = require("axios");

const {
  Telegraf,
  Markup
} = require("telegraf");

// ==========================================
// ENV
// ==========================================
const BOT_TOKEN = process.env.BOT_TOKEN;

const ADMIN_ID = 5948588400;

let API_URL =
  process.env.API_URL ||
  "https://api.maytapi.com/api/default/checkPhones";

let API_TOKEN =
  process.env.API_TOKEN ||
  "default_token";

// ==========================================
// CHECK TOKEN
// ==========================================
if (!BOT_TOKEN) {
  console.log("BOT_TOKEN Missing");
  process.exit(1);
}

// ==========================================
// BOT
// ==========================================
const bot = new Telegraf(BOT_TOKEN);

// ==========================================
// MEMORY
// ==========================================
const users = {};

const approvedUsers = new Set();

const pendingUsers = {};

// ==========================================
// INIT USER
// ==========================================
function initUser(user) {

  const uid = String(user.id);

  if (!users[uid]) {

    users[uid] = {

      name:
        user.first_name ||
        user.username ||
        "Unknown",

      hour_count: 0,

      hour_reset:
        Math.floor(Date.now() / 1000) + 3600,

      waiting: false,

      set_url: false
    };
  }
}

// ==========================================
// RESET LIMIT
// ==========================================
function resetLimit(uid) {

  const now =
    Math.floor(Date.now() / 1000);

  if (
    now >= users[uid].hour_reset
  ) {

    users[uid].hour_count = 0;

    users[uid].hour_reset =
      now + 3600;
  }
}

// ==========================================
// KEYBOARD
// ==========================================
function getKeyboard(uid) {

  const rows = [
    ["Check Number"]
  ];

  if (Number(uid) === ADMIN_ID) {

    rows.push(["Set Url"]);

    rows.push(["User Request"]);
  }

  return Markup.keyboard(rows)
    .resize();
}

// ==========================================
// FORMAT NUMBERS
// ==========================================
function formatNumbers(numbers) {

  return numbers
    .map(
      n => `<code>+${n}</code>`
    )
    .join("\n");
}

// ==========================================
// API CHECK
// ==========================================
async function checkBatch(numbers) {

  const headers = {

    accept: "application/json",

    "x-maytapi-key":
      API_TOKEN,

    "Content-Type":
      "application/json"
  };

  const response =
    await axios.post(

      API_URL,

      {
        numbers
      },

      {
        headers,
        timeout: 60000
      }
    );

  const data =
    response.data;

  const reg = [];
  const unreg = [];

  for (
    const item of data.data || []
  ) {

    let number;

    try {

      number =
        item.id.user;

    } catch {

      number = String(
        item.id
      ).replace("@c.us", "");
    }

    if (
      item.valid === true
    ) {

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
// RUN ALL BATCHES
// ==========================================
async function runAllBatches(numbers) {

  let allReg = [];

  let allUnreg = [];

  for (
    let i = 0;
    i < numbers.length;
    i += 10
  ) {

    const batch =
      numbers.slice(
        i,
        i + 10
      );

    const result =
      await checkBatch(batch);

    allReg = [
      ...allReg,
      ...result.reg
    ];

    allUnreg = [
      ...allUnreg,
      ...result.unreg
    ];
  }

  return {

    reg: allReg,

    unreg: allUnreg
  };
}

// ==========================================
// START COMMAND
// ==========================================
bot.start(async ctx => {

  const user = ctx.from;

  initUser(user);

  await ctx.reply(

    "Welcome",

    getKeyboard(user.id)
  );
});

// ==========================================
// APPROVE USER
// ==========================================
bot.action(
  /approve_(.+)/,

  async ctx => {

    const uid =
      ctx.match[1];

    approvedUsers.add(uid);

    delete pendingUsers[uid];

    await ctx.editMessageText(
      `✅ Approved ${uid}`
    );

    try {

      await ctx.telegram.sendMessage(

        uid,

        "✅ Your access approved"
      );

    } catch {}
  }
);

// ==========================================
// REJECT USER
// ==========================================
bot.action(
  /reject_(.+)/,

  async ctx => {

    const uid =
      ctx.match[1];

    delete pendingUsers[uid];

    await ctx.editMessageText(
      `❌ Rejected ${uid}`
    );

    try {

      await ctx.telegram.sendMessage(

        uid,

        "❌ Your request rejected"
      );

    } catch {}
  }
);

// ==========================================
// TEXT HANDLER
// ==========================================
bot.on(
  "text",

  async ctx => {

    try {

      const user =
        ctx.from;

      const uid =
        String(user.id);

      const text =
        ctx.message.text.trim();

      initUser(user);

      resetLimit(uid);

      // ==========================================
      // SET URL
      // ==========================================
      if (
        text === "Set Url" &&
        user.id === ADMIN_ID
      ) {

        users[uid].set_url = true;

        return ctx.reply(
          "Send full API URL"
        );
      }

      if (
        users[uid].set_url &&
        user.id === ADMIN_ID
      ) {

        try {

          const url =
            text;

          const base =
            url.split(
              "/screen"
            )[0];

          const token =
            url
              .split(
                "token="
              )[1]
              .split("&")[0];

          API_URL =
            `${base}/checkPhones`;

          API_TOKEN =
            token;

          await ctx.reply(
            "✅ API Updated"
          );

        } catch {

          await ctx.reply(
            "❌ Invalid URL"
          );
        }

        users[uid].set_url = false;

        return;
      }

      // ==========================================
      // USER REQUEST PANEL
      // ==========================================
      if (
        text ===
          "User Request" &&
        user.id === ADMIN_ID
      ) {

        const pendingIds =
          Object.keys(
            pendingUsers
          );

        if (
          pendingIds.length === 0
        ) {

          return ctx.reply(
            "No pending users"
          );
        }

        for (
          const puid of pendingIds
        ) {

          const name =
            pendingUsers[puid];

          await ctx.reply(

            `User: ${name}\nID: ${puid}`,

            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "✅ Allow",
                  `approve_${puid}`
                ),

                Markup.button.callback(
                  "❌ Reject",
                  `reject_${puid}`
                )
              ]
            ])
          );
        }

        return;
      }

      // ==========================================
      // CHECK NUMBER BUTTON
      // ==========================================
      if (
        text ===
        "Check Number"
      ) {

        if (
          !approvedUsers.has(
            uid
          ) &&
          user.id !== ADMIN_ID
        ) {

          pendingUsers[uid] =
            user.first_name ||
            "Unknown";

          await ctx.reply(

            "❌ Access denied\nRequest sent to admin"
          );

          try {

            await ctx.telegram.sendMessage(

              ADMIN_ID,

              `New User Request:\n${user.first_name}\n${uid}`,

              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text:
                          "✅ Allow",

                        callback_data:
                          `approve_${uid}`
                      },

                      {
                        text:
                          "❌ Reject",

                        callback_data:
                          `reject_${uid}`
                      }
                    ]
                  ]
                }
              }
            );

          } catch (e) {

            console.log(
              e.message
            );
          }

          return;
        }

        users[uid].waiting =
          true;

        return ctx.reply(
          "Send numbers (max 100)"
        );
      }

      // ==========================================
      // PROCESS NUMBERS
      // ==========================================
      if (
        users[uid].waiting
      ) {

        let numbers = [];

        for (
          let line of text.split(
            "\n"
          )
        ) {

          line = line
            .trim()
            .replace(
              /\s+/g,
              ""
            );

          if (
            line.startsWith("+")
          ) {

            line =
              line.substring(
                1
              );
          }

          if (
            /^\d+$/.test(
              line
            )
          ) {

            numbers.push(
              line
            );
          }
        }

        // ==========================================
        // NO VALID
        // ==========================================
        if (
          numbers.length === 0
        ) {

          return ctx.reply(
            "No valid numbers"
          );
        }

        // ==========================================
        // MAX 100
        // ==========================================
        if (
          numbers.length > 100
        ) {

          return ctx.reply(
            "Max 100 numbers"
          );
        }

        // ==========================================
        // USER LIMIT
        // ==========================================
        if (
          user.id !== ADMIN_ID
        ) {

          const remain =
            400 -
            users[uid]
              .hour_count;

          if (
            numbers.length >
            remain
          ) {

            return ctx.reply(

              `Limit exceeded\nRemaining: ${remain}`
            );
          }
        }

        // ==========================================
        // START CHECKING
        // ==========================================
        await ctx.reply(

          `Checking ${numbers.length} numbers...`
        );

        try {

          const result =
            await runAllBatches(
              numbers
            );

          // ==========================================
          // UPDATE LIMIT
          // ==========================================
          if (
            user.id !== ADMIN_ID
          ) {

            users[
              uid
            ].hour_count +=
              numbers.length;
          }

          // ==========================================
          // REGISTERED
          // ==========================================
          if (
            result.reg.length >
            0
          ) {

            await ctx.replyWithHTML(

              `✅ <b>Registered Numbers</b>\n\n${formatNumbers(result.reg)}`
            );
          }

          // ==========================================
          // UNREGISTERED
          // ==========================================
          if (
            result.unreg
              .length > 0
          ) {

            await ctx.replyWithHTML(

              `❌ <b>Not Registered Numbers</b>\n\n${formatNumbers(result.unreg)}`
            );
          }

        } catch (e) {

          console.log(e);

          await ctx.reply(

            `Error: ${e.message}`
          );
        }

        users[uid].waiting =
          false;

        return;
      }

    } catch (e) {

      console.log(e);

      try {

        await ctx.reply(

          `Error: ${e.message}`
        );

      } catch {}
    }
  }
);

// ==========================================
// EXPRESS SERVER
// ==========================================
const app = express();

app.get(
  "/",

  (req, res) => {

    res.send(
      "Bot Running"
    );
  }
);

// ==========================================
// PORT
// ==========================================
const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,

  () => {

    console.log(
      `Web Server Running On Port ${PORT}`
    );
  }
);

// ==========================================
// START BOT
// ==========================================
bot.launch();

console.log(
  "BOT STARTED"
);

// ==========================================
// STOP
// ==========================================
process.once(
  "SIGINT",

  () =>
    bot.stop(
      "SIGINT"
    )
);

process.once(
  "SIGTERM",

  () =>
    bot.stop(
      "SIGTERM"
    )
);
