require("dotenv").config();

const express = require("express");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

// ====================
// RENDER WEB SERVER
// ====================

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Thundra Bot is online!");
});

app.listen(PORT, () => {
  console.log("Web server running on port " + PORT);
});

// ====================
// DISCORD CLIENT
// ====================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ====================
// SETTINGS
// ====================

const SERVER_ID = "1531632541377757224";
const SERVER_NAME = "Thundra SMP";
const INVITE_LINK = "https://discord.gg/aebQ8RNSgW";

const MEMBER_ROLE_NAME = "👤・Member";
const ADMIN_ROLE_NAME = "🛡️・Admin";

// ====================
// DATA
// ====================

const spam = new Map();
const repeatedMessages = new Map();
const repeatedPings = new Map();
const warnings = new Map();
const afkUsers = new Map();

// ====================
// DISPLAY NAME
// ====================

function displayName(memberOrUser) {
  if (memberOrUser && memberOrUser.displayName) {
    return memberOrUser.displayName;
  }

  if (memberOrUser && memberOrUser.globalName) {
    return memberOrUser.globalName;
  }

  if (memberOrUser && memberOrUser.username) {
    return memberOrUser.username;
  }

  return "User";
}

// ====================
// ROLE CHECK
// ====================

function hasAllowedBasicRole(member) {
  if (!member || !member.roles || !member.roles.cache) {
    return false;
  }

  return member.roles.cache.some(
    role =>
      role.name === MEMBER_ROLE_NAME ||
      role.name === ADMIN_ROLE_NAME
  );
}

// ====================
// DURATION PARSER
// ====================

function parseDuration(duration) {
  const match = duration.match(/^(\d+)(s|m|h|d)$/i);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "s") {
    return amount * 1000;
  }

  if (unit === "m") {
    return amount * 60 * 1000;
  }

  if (unit === "h") {
    return amount * 60 * 60 * 1000;
  }

  if (unit === "d") {
    return amount * 24 * 60 * 60 * 1000;
  }

  return null;
}

// ====================
// FORMAT DURATION
// ====================

function formatDuration(ms) {
  if (ms % (24 * 60 * 60 * 1000) === 0) {
    return ms / (24 * 60 * 60 * 1000) + " day(s)";
  }

  if (ms % (60 * 60 * 1000) === 0) {
    return ms / (60 * 60 * 1000) + " hour(s)";
  }

  if (ms % (60 * 1000) === 0) {
    return ms / (60 * 1000) + " minute(s)";
  }

  return Math.round(ms / 1000) + " second(s)";
}

// ====================
// MUTE DM
// ====================

async function sendMuteDM(user, duration, reason) {
  try {
    await user.send(
      "🔇 You were muted in " +
      SERVER_NAME +
      ".\n\n" +
      "Duration: " +
      duration +
      "\n" +
      "Reason: " +
      reason +
      "\n\n" +
      "Server: " +
      INVITE_LINK
    );
  } catch (error) {
    console.log("Couldn't DM " + user.tag);
  }
}

// ====================
// UNMUTE DM
// ====================

async function sendMuteOverDM(user) {
  try {
    await user.send(
      "🔊 Your mute is over in " +
      SERVER_NAME +
      ".\n\n" +
      "You can talk again now.\n\n" +
      "Server: " +
      INVITE_LINK
    );
  } catch (error) {
    console.log("Couldn't DM " + user.tag);
  }
}

// ====================
// AUTOMATIC MUTE
// ====================

async function muteMember(member, durationMs, reason) {
  await member.timeout(durationMs, reason);

  await sendMuteDM(
    member.user,
    formatDuration(durationMs),
    reason
  );
}

// ====================
// CLEAN TEXT
// ====================

function cleanText(text) {
  return text
    .toLowerCase()
    .replace(/<@!?\d+>/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ====================
// MATH SOLVER
// ====================

function solveMath(text) {
  let expression = text;

  expression = expression.replace(/<@!?\d+>/g, " ");

  expression = expression.replace(
    /thundra\s*bot/gi,
    " "
  );

  expression = expression
    .replace(/\bwhat\s+is\b/gi, " ")
    .replace(/\bwhat's\b/gi, " ")
    .replace(/\bwhats\b/gi, " ")
    .replace(/\bwhat\s+does\b/gi, " ")
    .replace(/\bwhat\s+would\b/gi, " ")
    .replace(/\bcalculate\b/gi, " ")
    .replace(/\bcalculation\b/gi, " ")
    .replace(/\bsolve\b/gi, " ")
    .replace(/\banswer\b/gi, " ")
    .replace(/\bplease\b/gi, " ")
    .replace(/\bcan\s+you\b/gi, " ")
    .replace(/\bcan\s+u\b/gi, " ")
    .replace(/\bcould\s+you\b/gi, " ")
    .replace(/\bcould\s+u\b/gi, " ")
    .replace(/\bhow\s+much\s+is\b/gi, " ")
    .replace(/\bequals?\s+to\b/gi, " ")
    .replace(/\bequal\s+to\b/gi, " ")
    .replace(/\bequals\b/gi, " ")
    .replace(/\bequal\b/gi, " ")
    .replace(/\bis\b/gi, " ");

  expression = expression
    .replace(/\bmultiplied\s+by\b/gi, "*")
    .replace(/\bmultiply\s+by\b/gi, "*")
    .replace(/\bmultiplication\b/gi, "*")
    .replace(/\bmultiplied\b/gi, "*")
    .replace(/\bmultiply\b/gi, "*")
    .replace(/\btimes\b/gi, "*");

  expression = expression.replace(
    /(\d)\s*x\s*(?=\d)/gi,
    "$1*"
  );

  expression = expression
    .replace(/\bdivided\s+by\b/gi, "/")
    .replace(/\bdivide\s+by\b/gi, "/")
    .replace(/\bdivided\b/gi, "/")
    .replace(/\bdivide\b/gi, "/")
    .replace(/\bover\b/gi, "/");

  expression = expression
    .replace(/\bplus\b/gi, "+")
    .replace(/\badd\b/gi, "+")
    .replace(/\badded\s+to\b/gi, "+");

  expression = expression
    .replace(/\bminus\b/gi, "-")
    .replace(/\bsubtract\b/gi, "-")
    .replace(/\bsubtracted\s+by\b/gi, "-");

  expression = expression
    .replace(/\bmodulo\b/gi, "%")
    .replace(/\bmod\b/gi, "%");

  expression = expression
    .replace(/×/g, "*")
    .replace(/✕/g, "*")
    .replace(/✖/g, "*")
    .replace(/·/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/–/g, "-")
    .replace(/—/g, "-");

  const percentageMatch = expression.match(
    /(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:of)\s*(\d+(?:\.\d+)?)/i
  );

  if (percentageMatch) {
    const percent = Number(percentageMatch[1]);
    const number = Number(percentageMatch[2]);

    return (percent / 100) * number;
  }

  expression = expression
    .replace(/\bwhat\b/gi, " ")
    .replace(/\banswer\b/gi, " ")
    .replace(/\bresult\b/gi, " ")
    .replace(/\bquestion\b/gi, " ");

  expression = expression.replace(
    /[^0-9+\-*/().%^]/g,
    ""
  );

  if (!expression) {
    return null;
  }

  if (!/\d/.test(expression)) {
    return null;
  }

  if (!/[+\-*/%^]/.test(expression)) {
    return null;
  }

  if (
    /\/\s*0+(?:\.0*)?(?:$|[+\-*/%^])/g.test(
      expression
    )
  ) {
    return null;
  }

  if (expression.length > 200) {
    return null;
  }

  if (/[+\-*/%^]{3,}/.test(expression)) {
    return null;
  }

  try {
    expression = expression.replace(
      /\^/g,
      "**"
    );

    const result = Function(
      '"use strict"; return (' +
      expression +
      ")"
    )();

    if (
      typeof result !== "number" ||
      !Number.isFinite(result)
    ) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

// ====================
// REPEATED CHARACTER SPAM
// ====================

function isRepeatedCharacterSpam(text) {
  if (!text) {
    return false;
  }

  const compact = text.replace(/\s+/g, "");

  if (compact.length < 10) {
    return false;
  }

  if (/(.)\1{7,}/us.test(compact)) {
    return true;
  }

  const chars = Array.from(compact);

  if (chars.length >= 12) {
    const unique = new Set(chars);

    if (unique.size === 1) {
      return true;
    }
  }

  return false;
}

// ====================
// REPEATED PATTERN SPAM
// ====================

function isRepeatedPatternSpam(text) {
  if (!text) {
    return false;
  }

  const compact = text.replace(/\s+/g, "");

  if (compact.length < 12) {
    return false;
  }

  for (let size = 1; size <= 4; size++) {
    if (compact.length < size * 4) {
      continue;
    }

    const pattern = compact.slice(0, size);
    let valid = true;

    for (
      let i = 0;
      i < compact.length;
      i += size
    ) {
      if (
        compact.slice(i, i + size) !==
        pattern
      ) {
        valid = false;
        break;
      }
    }

    if (valid) {
      return true;
    }
  }

  return false;
}

// ====================
// BOT RESPONSES
// ====================

function getBotGreeting() {
  const responses = [
    "Hey there! wsp",
    "Hii! What's up?",
    "Yo yo, what's good?",
    "Ayy, what's up?",
    "Hey! How can I help you?",
    "Yoo, I'm here.",
    "Hiii, what's happening?",
    "Yo! Need something?",
    "Heyyy, what's good?",
    "Wsp! I'm here.",
    "Yo, what's going on?",
    "Hii hii!",
    "Ayy, you called?",
    "What's up?"
  ];

  return responses[
    Math.floor(
      Math.random() * responses.length
    )
  ];
}

function getHowAreYouResponse() {
  const responses = [
    "I'm doing good, thanks for asking!",
    "Pretty chill rn, how about you?",
    "I'm good! Just keeping the server alive.",
    "Doing great! What's up with you?",
    "All good over here.",
    "I'm vibing, thanks for asking.",
    "Good good. What are we getting into today?",
    "I'm doing pretty good!",
    "Can't complain, I'm chilling.",
    "I'm good bro, what's up?"
  ];

  return responses[
    Math.floor(
      Math.random() * responses.length
    )
  ];
}

function getHelpResponse() {
  const responses = [
    "How can I help you?",
    "Need something? I'm here.",
    "What's up? What do you need?",
    "Yeah? Tell me what you need.",
    "I'm listening. What's up?",
    "What can I do for you?",
    "Need some help?",
    "What's the move?"
  ];

  return responses[
    Math.floor(
      Math.random() * responses.length
    )
  ];
}

// ====================
// IQ RESPONSES
// ====================

function isIQQuestion(text) {
  const t = text
    .toLowerCase()
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    /\bhow\s+many\s+iq\b/.test(t) ||
    /\bhow\s+much\s+iq\b/.test(t) ||
    /\bwhat\s+is\s+your\s+iq\b/.test(t) ||
    /\bwhat\s+is\s+ur\s+iq\b/.test(t) ||
    /\bwhats\s+your\s+iq\b/.test(t) ||
    /\bwhats\s+ur\s+iq\b/.test(t) ||
    /\bwhat'?s\s+your\s+iq\b/.test(t) ||
    /\bwhat'?s\s+ur\s+iq\b/.test(t) ||
    /\byour\s+iq\b/.test(t) ||
    /\bur\s+iq\b/.test(t) ||
    /\bhow\s+smart\s+are\s+you\b/.test(t) ||
    /\bhow\s+smart\s+r\s+you\b/.test(t) ||
    /\bhow\s+smart\s+are\s+u\b/.test(t)
  );
}

function getLoveResponse() {
  const responses = [
    "Aww, love you too.",
    "Love you too bro.",
    "❤️ right back at you.",
    "W love.",
    "You're real for that.",
    "Ayy, appreciate you."
  ];

  return responses[
    Math.floor(
      Math.random() * responses.length
    )
  ];
}

function getBotQuestionResponse() {
  const responses = [
    "I'm Thundra Bot, your server's little helper.",
    "I'm Thundra Bot. What did you need?",
    "Just your friendly neighborhood Thundra Bot.",
    "I'm the bot around here.",
    "Thundra Bot reporting for duty."
  ];

  return responses[
    Math.floor(
      Math.random() * responses.length
    )
  ];
}

function getThanksResponse() {
  const responses = [
    "No problem!",
    "Anytime.",
    "You got it.",
    "Of course!",
    "Np bro.",
    "Always."
  ];

  return responses[
    Math.floor(
      Math.random() * responses.length
    )
  ];
}

function getJokeResponse() {
  const responses = [
    "Why did the Minecraft player bring a ladder? To get to the next level.",
    "I would tell you a UDP joke, but you might not get it.",
    "Why did the creeper cross the road? To get closer to the player.",
    "My code never crashes. It just takes unexpected vacations.",
    "Why don't bots ever get tired? We have no sleep schedule."
  ];

  return responses[
    Math.floor(
      Math.random() * responses.length
    )
  ];
}

// ====================
// DISCORD READY
// ====================

client.once("ready", async () => {
  console.log(
    "Logged in as " +
    client.user.tag
  );

  console.log(
    "Thundra Bot is online."
  );

  client.user.setActivity(
    "Thundra SMP",
    {
      type: 0
    }
  );

  // ====================
  // SLASH COMMANDS
  // ====================

  const commands = [
    new SlashCommandBuilder()
      .setName("afk")
      .setDescription("Set your AFK status")
      .addStringOption(option =>
        option
          .setName("reason")
          .setDescription("Why are you AFK?")
          .setRequired(true)
      )
  ].map(command =>
    command.toJSON()
  );

  try {
    const rest = new REST({
      version: "10"
    }).setToken(
      process.env.TOKEN
    );

    await rest.put(
      Routes.applicationGuildCommands(
        client.user.id,
        SERVER_ID
      ),
      {
        body: commands
      }
    );

    console.log(
      "Slash commands registered."
    );
  } catch (error) {
    console.error(
      "Failed to register slash commands:",
      error
    );
  }
});

// ====================
// SLASH COMMAND HANDLER
// ====================

client.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    // ====================
    // AFK
    // ====================

    if (
      interaction.commandName ===
      "afk"
    ) {
      const member =
        interaction.member;

      if (
        !member ||
        !hasAllowedBasicRole(member)
      ) {
        await interaction.reply({
          content:
            "❌ You need the " +
            MEMBER_ROLE_NAME +
            " role to use `/afk`.",
          ephemeral: true
        });

        return;
      }

      const reason =
        interaction.options.getString(
          "reason"
        );

      if (!reason) {
        await interaction.reply({
          content:
            "❌ You need to provide an AFK reason.",
          ephemeral: true
        });

        return;
      }

      afkUsers.set(
        interaction.user.id,
        {
          reason: reason,
          since: Date.now()
        }
      );

      // Private confirmation
      await interaction.reply({
        content:
          "You are now AFK: " +
          reason,
        ephemeral: true
      });

      // Public AFK announcement
      await interaction.channel.send(
        displayName(member) +
        " is now AFK."
      );

      return;
    }
  }
);

// ====================
// MESSAGE CREATE
// ====================

client.on(
  "messageCreate",
  async message => {
    if (message.author.bot) {
      return;
    }

    if (!message.guild) {
      return;
    }

    const member =
      message.member;

    const content =
      message.content || "";

    const cleaned =
      cleanText(content);

    const botMentioned =
      message.mentions.users.has(
        client.user.id
      );

    const hasThundraBot =
      /\bthundra\s*bot\b/i.test(
        content
      );

    // ====================
    // AFK RETURN
    // ====================

    if (
      afkUsers.has(
        message.author.id
      )
    ) {
      const afkData =
        afkUsers.get(
          message.author.id
        );

      afkUsers.delete(
        message.author.id
      );

      await message.channel.send(
        displayName(member) +
        " is no longer AFK."
      );
    }

    // ====================
    // AFK PING CHECK
    // ====================

    for (
      const mentionedUser of
      message.mentions.users.values()
    ) {
      if (
        mentionedUser.id ===
        message.author.id
      ) {
        continue;
      }

      if (
        !afkUsers.has(
          mentionedUser.id
        )
      ) {
        continue;
      }

      const afkData =
        afkUsers.get(
          mentionedUser.id
        );

      let afkMember = null;

      try {
        afkMember =
          await message.guild.members.fetch(
            mentionedUser.id
          );
      } catch {
        afkMember = null;
      }

      const name =
        displayName(
          afkMember ||
          mentionedUser
        );

      // IMPORTANT:
      // This is a normal channel message.
      // Discord does not support ephemeral
      // messageCreate responses.
      await message.channel.send(
        name +
        " is AFK: " +
        afkData.reason
      );
    }

    // ====================
    // REPEATED CHARACTER SPAM
    // ====================

    if (
      isRepeatedCharacterSpam(
        content
      ) ||
      isRepeatedPatternSpam(
        content
      )
    ) {
      const now = Date.now();

      const userData =
        spam.get(
          message.author.id
        ) || {
          count: 0,
          last: 0
        };

      if (
        now - userData.last <
        15000
      ) {
        userData.count++;
      } else {
        userData.count = 1;
      }

      userData.last = now;

      spam.set(
        message.author.id,
        userData
      );

      if (
        userData.count >= 2
      ) {
        try {
          await message.delete();
        } catch {}

        try {
          await muteMember(
            member,
            5 * 60 * 1000,
            "Repeated spam"
          );

          await message.channel.send(
            displayName(member) +
            " has been muted for 5 minutes for spam."
          );
        } catch (error) {
          console.error(
            "Spam mute error:",
            error
          );
        }

        spam.delete(
          message.author.id
        );

        return;
      }

      try {
        await message.delete();
      } catch {}

      return;
    }

    // ====================
    // REPEATED SAME MESSAGE
    // ====================

    const normalizedMessage =
      content
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    if (
      normalizedMessage.length > 0
    ) {
      const now = Date.now();

      const data =
        repeatedMessages.get(
          message.author.id
        ) || {
          message: "",
          count: 0,
          last: 0
        };

      if (
        data.message ===
          normalizedMessage &&
        now - data.last < 15000
      ) {
        data.count++;
      } else {
        data.message =
          normalizedMessage;
        data.count = 1;
      }

      data.last = now;

      repeatedMessages.set(
        message.author.id,
        data
      );

      if (
        data.count >= 3
      ) {
        try {
          await message.delete();
        } catch {}

        try {
          await muteMember(
            member,
            5 * 60 * 1000,
            "Repeated messages"
          );

          await message.channel.send(
            displayName(member) +
            " has been muted for 5 minutes for repeated messages."
          );
        } catch (error) {
          console.error(
            "Repeated message mute error:",
            error
          );
        }

        repeatedMessages.delete(
          message.author.id
        );

        return;
      }
    }

    // ====================
    // REPEATED PINGS
    // ====================

    if (
      message.mentions.users.size >
      0
    ) {
      for (
        const target of
        message.mentions.users.values()
      ) {
        if (
          target.id ===
          message.author.id
        ) {
          continue;
        }

        const key =
          message.author.id +
          ":" +
          target.id;

        const now = Date.now();

        const pingData =
          repeatedPings.get(
            key
          ) || {
            count: 0,
            last: 0
          };

        if (
          now - pingData.last <
          15000
        ) {
          pingData.count++;
        } else {
          pingData.count = 1;
        }

        pingData.last = now;

        repeatedPings.set(
          key,
          pingData
        );

        if (
          pingData.count >= 3
        ) {
          try {
            await muteMember(
              member,
              5 * 60 * 1000,
              "Repeatedly pinging the same person"
            );

            await message.channel.send(
              displayName(member) +
              " has been muted for 5 minutes for repeated pinging."
            );
          } catch (error) {
            console.error(
              "Ping mute error:",
              error
            );
          }

          repeatedPings.delete(
            key
          );

          return;
        }
      }
    }

    // ====================
    // MATH
    // ====================

    if (
      botMentioned ||
      hasThundraBot
    ) {
      const mathResult =
        solveMath(content);

      if (
        mathResult !== null
      ) {
        await message.reply({
          content:
            "🧮 The answer is **" +
            mathResult +
            "**",
          allowedMentions: {
            repliedUser: false
          }
        });

        return;
      }
    }

    // ====================
    // IQ
    // ====================

    if (
      (botMentioned ||
        hasThundraBot) &&
      isIQQuestion(content)
    ) {
      await message.reply({
        content:
          "https://klipy.com/gifs/iq-smart",
        allowedMentions: {
          repliedUser: false
        }
      });

      return;
    }

    // ====================
    // BOT RESPONSES
    // ====================

    if (
      botMentioned ||
      hasThundraBot
    ) {
      // --------------------
      // HOW ARE YOU
      // --------------------

      if (
        /\bhow\s+(are|r)\s+(you|u)\b/i.test(
          cleaned
        )
      ) {
        await message.reply({
          content:
            getHowAreYouResponse(),
          allowedMentions: {
            repliedUser: false
          }
        });

        return;
      }

      // --------------------
      // LOVE
      // --------------------

      if (
        /\b(i\s+love\s+you|love\s+you|luv\s+you|luv\s+u)\b/i.test(
          cleaned
        )
      ) {
        await message.reply({
          content:
            getLoveResponse(),
          allowedMentions: {
            repliedUser: false
          }
        });

        return;
      }

      // --------------------
      // THANKS
      // --------------------

      if (
        /\b(thanks|thank\s+you|thx|ty|tysm|thank\s+u)\b/i.test(
          cleaned
        )
      ) {
        await message.reply({
          content:
            getThanksResponse(),
          allowedMentions: {
            repliedUser: false
          }
        });

        return;
      }

      // --------------------
      // JOKE
      // --------------------

      if (
        /\b(tell\s+me\s+a\s+joke|tell\s+a\s+joke|joke)\b/i.test(
          cleaned
        )
      ) {
        await message.reply({
          content:
            getJokeResponse(),
          allowedMentions: {
            repliedUser: false
          }
        });

        return;
      }

      // --------------------
      // WHO ARE YOU
      // --------------------

      if (
        /\b(who\s+are\s+you|what\s+are\s+you|what\s+is\s+your\s+name|whats\s+your\s+name)\b/i.test(
          cleaned
        )
      ) {
        await message.reply({
          content:
            getBotQuestionResponse(),
          allowedMentions: {
            repliedUser: false
          }
        });

        return;
      }

      // --------------------
      // ARE YOU AI
      // --------------------

      if (
        /\b(are\s+you\s+a\s+bot|are\s+you\s+ai|are\s+you\s+an\s+ai|you\s+a\s+bot|ur\s+a\s+bot)\b/i.test(
          cleaned
        )
      ) {
        await message.reply({
          content:
            "Yeah bro, I'm literally Thundra Bot.",
          allowedMentions: {
            repliedUser: false
          }
        });

        return;
      }

      // --------------------
      // ARE YOU ONLINE
      // --------------------

      if (
        /\b(are\s+you\s+online|you\s+online|r\s+you\s+online|u\s+online)\b/i.test(
          cleaned
        )
      ) {
        await message.reply({
          content:
            "Yep, I'm online and chilling.",
          allowedMentions: {
            repliedUser: false
          }
        });

        return;
      }

      // --------------------
      // HELP
      // --------------------

      if (
        /\b(help|help\s+me|what\s+can\s+you\s+do|what\s+do\s+you\s+do)\b/i.test(
          cleaned
        )
      ) {
        await message.reply({
          content:
            getHelpResponse(),
          allowedMentions: {
            repliedUser: false
          }
        });

        return;
      }

      // --------------------
      // GREETINGS
      // --------------------

      if (
        /\b(hi|hii|hiii|hello|hey|heyy|heyyy|yo|yoo|yooo|wsp|sup|wassup|whats\s+up|what'?s\s+up)\b/i.test(
          cleaned
        )
      ) {
        await message.reply({
          content:
            getBotGreeting(),
          allowedMentions: {
            repliedUser: false
          }
        });

        return;
      }

        // ====================
    // MEMBER / ADMIN COMMAND LIMIT
    // ====================

    if (
      commandName !== "afk" &&
      hasAllowedBasicRole(
        member
      )
    ) {
      await interaction.reply({
        content:
          "❌ You can only use `/afk`.",
        ephemeral: true
      });

      return;
    }

    // ====================
    // /AFK
    // ====================

    if (
      commandName === "afk"
    ) {
      const reason =
        interaction.options.getString(
          "reason",
          true
        );

      const oldAfk =
        afkUsers.get(
          interaction.user.id
        );

      if (
        oldAfk &&
        oldAfk.timer
      ) {
        clearTimeout(
          oldAfk.timer
        );
      }

      const name =
        displayName(member);

      const timer =
        setTimeout(
          () => {
            afkUsers.delete(
              interaction.user.id
            );
          },
          7 *
            24 *
            60 *
            60 *
            1000
        );

      afkUsers.set(
        interaction.user.id,
        {
          reason:
            reason,
          user:
            interaction.user,
          timer:
            timer
        }
      );

      // Only the person using /afk sees this.
      await interaction.reply({
        content:
          "You are now AFK: " +
          reason,
        ephemeral: true
      });

      // Everyone sees this.
      await interaction.channel.send({
        content:
          name +
          " is now AFK.",
        allowedMentions: {
          users: [],
          roles: []
        }
      });

      return;
    }

    // ====================
    // /UNMUTE
    // ====================

    if (
      commandName ===
      "unmute"
    ) {
      const user =
        interaction.options.getUser(
          "user",
          true
        );

      try {
        const target =
          await interaction.guild.members.fetch(
            user.id
          );

        await target.timeout(
          null,
          "Manual unmute"
        );

        const name =
          displayName(target);

        await interaction.reply(
          "🔊 " +
          name +
          " has been unmuted."
        );

        await user
          .send(
            "🔊 You were unmuted in " +
            SERVER_NAME +
            "."
          )
          .catch(
            () => {}
          );
      } catch (error) {
        console.error(
          "Unmute error:",
          error
        );

        await interaction.reply({
          content:
            "❌ I couldn't unmute that user.",
          ephemeral: true
        });
      }

      return;
    }

    // ====================
    // /WARN
    // ====================

    if (
      commandName ===
      "warn"
    ) {
      const user =
        interaction.options.getUser(
          "user",
          true
        );

      const reason =
        interaction.options.getString(
          "reason",
          true
        );

      const userWarnings =
        warnings.get(
          user.id
        ) || [];

      userWarnings.push({
        reason:
          reason,
        moderator:
          interaction.user.id,
        date:
          new Date()
      });

      warnings.set(
        user.id,
        userWarnings
      );

      await interaction.reply(
        "⚠️ " +
        user.username +
        " has been warned.\n" +
        "Reason: " +
        reason +
        "\n" +
        "Total warnings: " +
        userWarnings.length
      );

      await user
        .send(
          "⚠️ You received a warning in " +
          SERVER_NAME +
          ".\n\n" +
          "Reason: " +
          reason +
          "\n" +
          "Total warnings: " +
          userWarnings.length
        )
        .catch(
          () => {}
        );

      return;
    }

    // ====================
    // /WARNINGS
    // ====================

    if (
      commandName ===
      "warnings"
    ) {
      const user =
        interaction.options.getUser(
          "user",
          true
        );

      const userWarnings =
        warnings.get(
          user.id
        ) || [];

      if (
        userWarnings.length ===
        0
      ) {
        await interaction.reply(
          user.username +
          " has no warnings."
        );

        return;
      }

      let text =
        "📋 Warnings for " +
        user.username +
        "\n\n";

      userWarnings.forEach(
        (
          warning,
          index
        ) => {
          text +=
            "**" +
            (index + 1) +
            ".** " +
            warning.reason +
            "\n";
        }
      );

      await interaction.reply(
        text
      );

      return;
    }

    // ====================
    // /MUTE
    // ====================

    if (
      commandName ===
      "mute"
    ) {
      const user =
        interaction.options.getUser(
          "user",
          true
        );

      const durationText =
        interaction.options.getString(
          "duration",
          true
        );

      const reason =
        interaction.options.getString(
          "reason"
        ) ||
        "No reason provided";

      const milliseconds =
        parseDuration(
          durationText
        );

      if (!milliseconds) {
        await interaction.reply({
          content:
            "❌ Invalid duration. Use 30s, 5m, 1h, or 1d.",
          ephemeral: true
        });

        return;
      }

      if (
        milliseconds >
        28 *
          24 *
          60 *
          60 *
          1000
      ) {
        await interaction.reply({
          content:
            "❌ Maximum mute duration is 28 days.",
          ephemeral: true
        });

        return;
      }

      try {
        const target =
          await interaction.guild.members.fetch(
            user.id
          );

        await target.timeout(
          milliseconds,
          "Muted by " +
            interaction.user
              .tag +
            ": " +
            reason
        );

        const name =
          displayName(target);

        await interaction.reply(
          "🔇 " +
          name +
          " has been muted for " +
          durationText +
          ".\n" +
          "Reason: " +
          reason
        );

        await sendMuteDM(
          user,
          durationText,
          reason
        );

        setTimeout(
          () => {
            sendMuteOverDM(
              user
            );
          },
          milliseconds
        );
      } catch (error) {
        console.error(
          "Mute error:",
          error
        );

        await interaction.reply({
          content:
            "❌ I couldn't mute that user.",
          ephemeral: true
        });
      }

      return;
    }

    // ====================
    // /BAN
    // ====================

    if (
      commandName ===
      "ban"
    ) {
      const user =
        interaction.options.getUser(
          "user",
          true
        );

      const reason =
        interaction.options.getString(
          "reason"
        ) ||
        "No reason provided";

      await user
        .send(
          "🔨 You were banned from " +
          SERVER_NAME +
          ".\n\n" +
          "Reason: " +
          reason +
          "\n\n" +
          "Server: " +
          INVITE_LINK
        )
        .catch(
          () => {}
        );

      try {
        await interaction.guild.members.ban(
          user.id,
          {
            reason:
              reason
          }
        );

        await interaction.reply(
          "🔨 " +
          user.username +
          " has been banned.\n" +
          "Reason: " +
          reason
        );
      } catch (error) {
        console.error(
          "Ban error:",
          error
        );

        await interaction.reply({
          content:
            "❌ I couldn't ban that user.",
          ephemeral: true
        });
      }

      return;
    }

    // ====================
    // /UNBAN
    // ====================

    if (
      commandName ===
      "unban"
    ) {
      const userId =
        interaction.options.getString(
          "userid",
          true
        );

      try {
        await interaction.guild.members.unban(
          userId,
          "Unbanned by " +
            interaction.user
              .tag
        );

        await interaction.reply(
          "🔓 User " +
          userId +
          " has been unbanned."
        );
      } catch (error) {
        console.error(
          "Unban error:",
          error
        );

        await interaction.reply({
          content:
            "❌ I couldn't unban that user.",
          ephemeral: true
        });
      }

      return;
    }

        // ====================
    // /KICK
    // ====================

    if (
      commandName ===
      "kick"
    ) {
      const user =
        interaction.options.getUser(
          "user",
          true
        );

      const reason =
        interaction.options.getString(
          "reason"
        ) ||
        "No reason provided";

      await user
        .send(
          "👢 You were kicked from " +
          SERVER_NAME +
          ".\n\n" +
          "Reason: " +
          reason +
          "\n\n" +
          "Server: " +
          INVITE_LINK
        )
        .catch(
          () => {}
        );

      try {
        const target =
          await interaction.guild.members.fetch(
            user.id
          );

        const name =
          displayName(target);

        await target.kick(
          reason
        );

        await interaction.reply(
          "👢 " +
          name +
          " has been kicked.\n" +
          "Reason: " +
          reason
        );
      } catch (error) {
        console.error(
          "Kick error:",
          error
        );

        await interaction.reply({
          content:
            "❌ I couldn't kick that user.",
          ephemeral: true
        });
      }

      return;
    }
  }
);

// ====================
// DISCORD ERROR
// ====================

client.on(
  "error",
  error => {
    console.error(
      "Discord client error:",
      error
    );
  }
);

// ====================
// TOKEN CHECK
// ====================

if (!process.env.TOKEN) {
  console.error(
    "TOKEN is missing from environment variables."
  );

  process.exit(1);
}

// ====================
// LOGIN
// ====================

client.login(
  process.env.TOKEN
);
