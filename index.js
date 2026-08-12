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

  // Remove Discord mentions
  expression = expression.replace(/<@!?\d+>/g, " ");

  // Remove Thundra Bot regardless of capitalization
  expression = expression.replace(/thundra\s*bot/gi, " ");

  // Remove common question phrases
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

  // Multiplication words
  expression = expression
    .replace(/\bmultiplied\s+by\b/gi, "*")
    .replace(/\bmultiply\s+by\b/gi, "*")
    .replace(/\bmultiplication\b/gi, "*")
    .replace(/\bmultiplied\b/gi, "*")
    .replace(/\bmultiply\b/gi, "*")
    .replace(/\btimes\b/gi, "*");

  // "x" multiplication
  expression = expression.replace(
    /(\d)\s*x\s*(?=\d)/gi,
    "$1*"
  );

  // Division words
  expression = expression
    .replace(/\bdivided\s+by\b/gi, "/")
    .replace(/\bdivide\s+by\b/gi, "/")
    .replace(/\bdivided\b/gi, "/")
    .replace(/\bdivide\b/gi, "/")
    .replace(/\bover\b/gi, "/");

  // Addition words
  expression = expression
    .replace(/\bplus\b/gi, "+")
    .replace(/\badd\b/gi, "+")
    .replace(/\badded\s+to\b/gi, "+");

  // Subtraction words
  expression = expression
    .replace(/\bminus\b/gi, "-")
    .replace(/\bsubtract\b/gi, "-")
    .replace(/\bsubtracted\s+by\b/gi, "-");

  // Modulo
  expression = expression
    .replace(/\bmodulo\b/gi, "%")
    .replace(/\bmod\b/gi, "%");

  // Math symbols
  expression = expression
    .replace(/×/g, "*")
    .replace(/✕/g, "*")
    .replace(/✖/g, "*")
    .replace(/·/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/–/g, "-")
    .replace(/—/g, "-");

  // ====================
  // PERCENTAGES
  // ====================

  // Example:
  // 20% of 150
  // 20 percent of 150

  const percentageMatch = expression.match(
    /(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:of)\s*(\d+(?:\.\d+)?)/i
  );

  if (percentageMatch) {
    const percent = Number(percentageMatch[1]);
    const number = Number(percentageMatch[2]);

    return (percent / 100) * number;
  }

  // ====================
  // REMOVE LEFTOVER WORDS
  // ====================

  expression = expression
    .replace(/\bwhat\b/gi, " ")
    .replace(/\banswer\b/gi, " ")
    .replace(/\bresult\b/gi, " ")
    .replace(/\bquestion\b/gi, " ");

  // ====================
  // CLEAN EXPRESSION
  // ====================

  expression = expression.replace(
    /[^0-9+\-*/().%^]/g,
    ""
  );

  if (!expression) {
    return null;
  }

  // Must contain a number
  if (!/\d/.test(expression)) {
    return null;
  }

  // Must contain a math operator
  if (!/[+\-*/%^]/.test(expression)) {
    return null;
  }

  // Prevent division by zero
  if (
    /\/\s*0+(?:\.0*)?(?:$|[+\-*/%^])/g.test(
      expression
    )
  ) {
    return null;
  }

  // Prevent huge expressions
  if (expression.length > 200) {
    return null;
  }

  // Prevent repeated operators
  if (
    /[+\-*/%^]{3,}/.test(expression)
  ) {
    return null;
  }

  try {
    // Convert ^ into exponentiation
    expression = expression.replace(/\^/g, "**");

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

  // HIIIIIIIIIIII
  if (/(.)\1{7,}/us.test(compact)) {
    return true;
  }

  // Same emoji/character repeated many times
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

  // HIHIHIHIHI
  // LOLLOLLOL
  // ABCABCABC

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
// SLASH COMMANDS
// ====================

const unmuteCommand =
  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription(
      "Remove a timeout from a member"
    )
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription(
          "Select the member to unmute"
        )
        .setRequired(true)
    );

const warnCommand =
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription(
          "Select the member to warn"
        )
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription(
          "Reason for the warning"
        )
        .setRequired(true)
    );

const warningsCommand =
  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription(
      "View a member's warnings"
    )
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription(
          "Select the member"
        )
        .setRequired(true)
    );

const muteCommand =
  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription(
          "Select the member to mute"
        )
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("duration")
        .setDescription(
          "Example: 30s, 5m, 1h, 1d"
        )
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription(
          "Reason for the mute"
        )
        .setRequired(false)
    );

const banCommand =
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription(
          "Select the member to ban"
        )
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription(
          "Reason for the ban"
        )
        .setRequired(false)
    );

const unbanCommand =
  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user")
    .addStringOption(option =>
      option
        .setName("userid")
        .setDescription(
          "Discord user ID"
        )
        .setRequired(true)
    );

const kickCommand =
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription(
          "Select the member to kick"
        )
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription(
          "Reason for the kick"
        )
        .setRequired(false)
    );

const afkCommand =
  new SlashCommandBuilder()
    .setName("afk")
    .setDescription(
      "Set your AFK status"
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription(
          "Why you are AFK"
        )
        .setRequired(true)
    );

// ====================
// REGISTER COMMANDS
// ====================

client.once("ready", async () => {
  console.log(
    "Logged in as " + client.user.tag
  );

  const rest = new REST({
    version: "10"
  }).setToken(process.env.TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(
        client.user.id
      ),
      {
        body: []
      }
    );

    await rest.put(
      Routes.applicationGuildCommands(
        client.user.id,
        SERVER_ID
      ),
      {
        body: [
          unmuteCommand.toJSON(),
          warnCommand.toJSON(),
          warningsCommand.toJSON(),
          muteCommand.toJSON(),
          banCommand.toJSON(),
          unbanCommand.toJSON(),
          kickCommand.toJSON(),
          afkCommand.toJSON()
        ]
      }
    );

    console.log(
      "Commands registered successfully."
    );
  } catch (error) {
    console.error(
      "Command registration failed:",
      error
    );
  }
});

// ====================
// MESSAGE HANDLER
// ====================

client.on(
  "messageCreate",
  async message => {
    if (message.author.bot) {
      return;
    }

    if (
      !message.guild ||
      !message.member
    ) {
      return;
    }

    const now = Date.now();
    const authorId =
      message.author.id;
    const content =
      message.content || "";

    // ====================
    // REMOVE AFK WHEN THEY TALK
    // ====================

    if (afkUsers.has(authorId)) {
      const oldAfk =
        afkUsers.get(authorId);

      afkUsers.delete(authorId);

      if (oldAfk.timer) {
        clearTimeout(oldAfk.timer);
      }

      const name =
        displayName(message.member);

      await message.channel.send({
        content:
          name +
          " is no longer AFK.",
        allowedMentions: {
          users: [],
          roles: [],
          repliedUser: false
        }
      });
    }

    // ====================
    // AFK PING CHECK
    // ====================

    for (
      const [userId, afk]
      of afkUsers
    ) {
      if (
        message.mentions.users.has(
          userId
        )
      ) {
        try {
          const member =
            await message.guild.members
              .fetch(userId)
              .catch(() => null);

          const name =
            displayName(
              member || afk.user
            );

          // Sends ONLY in the server channel.
          // Does NOT DM.
          // Does NOT ping the AFK person.

          await message.channel.send({
            content:
              name +
              " is AFK: " +
              afk.reason,
            allowedMentions: {
              users: [],
              roles: [],
              repliedUser: false
            }
          });
        } catch (error) {
          console.error(
            "Couldn't send AFK response:",
            error
          );
        }

        break;
      }
    }

    // ====================
    // BOT NAME / MENTION
    // ====================

    const botMentioned =
      message.mentions.users.has(
        client.user.id
      );

    const hasThundraBot =
      /thundra\s*bot/i.test(
        content
      );

    // ====================
    // MATH
    // ====================

    const mathResult =
      solveMath(content);

    if (
      mathResult !== null &&
      (
        botMentioned ||
        hasThundraBot
      )
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

    // ====================
    // BOT RESPONSES
    // ====================

    const cleaned =
      cleanText(content);

    const botUsername =
      cleanText(
        client.user.username
      );

    const botMember =
      message.guild.members.me;

    const botDisplayName =
      cleanText(
        botMember
          ? botMember.displayName
          : client.user.username
      );

    const hasBotName =
      cleaned.includes(
        botUsername
      ) ||
      cleaned.includes(
        botDisplayName
      ) ||
      hasThundraBot;

    const words =
      cleaned
        .split(" ")
        .filter(Boolean);

    const onlyBotPing =
      botMentioned &&
      words.length === 0;

    const greetingWords = [
      "hi",
      "hii",
      "hiii",
      "hiiii",
      "hiiiii",
      "hello",
      "helloo",
      "hellooo",
      "hey",
      "heyy",
      "heyyy",
      "yo",
      "yoo",
      "yooo",
      "sup",
      "wsp",
      "wassup",
      "what's up",
      "whats up"
    ];

    const howAreYou =
      /\bhow\s*(are|r)\s*(you|u)\b/i.test(
        cleaned
      ) ||
      /\bhru\b/i.test(cleaned);

    const asksIp =
      /\b(ip|server ip|servers ip|server's ip|server address|address)\b/i.test(
        cleaned
      );

    const asksHelp =
      /\b(help|need help|can you help|can u help|could you help|could u help)\b/i.test(
        cleaned
      );

    const saysGreeting =
      greetingWords.some(word =>
        cleaned === word ||
        cleaned.startsWith(
          word + " "
        )
      );

    if (
      botMentioned ||
      hasBotName
    ) {
      // ====================
      // SERVER IP
      // ====================

      if (asksIp) {
        await message.reply({
          content:
            "The server IP is **ThundraPVP.aternos.me**",
          allowedMentions: {
            repliedUser: false
          }
        });

        return;
      }

      // ====================
      // HOW ARE YOU
      // ====================

      if (howAreYou) {
        await message.reply({
          content:
            getHowAreYouResponse(),
          allowedMentions: {
            repliedUser: false
          }
        });

        return;
      }

      // ====================
      // HELP
      // ====================

      if (asksHelp) {
        await message.reply({
          content:
            getHelpResponse(),
          allowedMentions: {
            repliedUser: false
          }
        });

        return;
      }

      // ====================
      // GREETING
      // ====================

      if (
        saysGreeting ||
        onlyBotPing
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
    }

    // ====================
    // 5 MESSAGES IN 5 SECONDS
    // ====================

    const previousMessages =
      spam.get(authorId) || [];

    const recent =
      previousMessages.filter(
        time =>
          now - time < 5000
      );

    recent.push(now);

    spam.set(
      authorId,
      recent
    );

    if (
      recent.length >= 5
    ) {
      try {
        const duration =
          5 * 60 * 1000;

        await muteMember(
          message.member,
          duration,
          "Spamming"
        );

        const name =
          displayName(
            message.member
          );

        await message.channel.send({
          content:
            "🚫 " +
            name +
            " was timed out for 5 minutes for spamming.",
          allowedMentions: {
            users: [],
            roles: []
          }
        });

        spam.delete(
          authorId
        );

        repeatedMessages.delete(
          authorId
        );

        repeatedPings.delete(
          authorId
        );

        return;
      } catch (error) {
        console.error(
          "Couldn't timeout user:",
          error
        );
      }
    }

    // ====================
    // 3 IDENTICAL MESSAGES
    // ====================

    const previous =
      repeatedMessages.get(
        authorId
      );

    if (
      previous &&
      previous.content === content
    ) {
      previous.count++;
    } else {
      repeatedMessages.set(
        authorId,
        {
          content:
            content,
          count: 1
        }
      );
    }

    const repeated =
      repeatedMessages.get(
        authorId
      );

    if (
      repeated.count >= 3
    ) {
      try {
        const duration =
          5 * 60 * 1000;

        await muteMember(
          message.member,
          duration,
          "Repeated messages"
        );

        const name =
          displayName(
            message.member
          );

        await message.channel.send({
          content:
            "🚫 " +
            name +
            " was timed out for 5 minutes for sending the same message 3 times in a row.",
          allowedMentions: {
            users: [],
            roles: []
          }
        });

        spam.delete(
          authorId
        );

        repeatedMessages.delete(
          authorId
        );

        repeatedPings.delete(
          authorId
        );

        return;
      } catch (error) {
        console.error(
          "Couldn't timeout user:",
          error
        );
      }
    }

    // ====================
    // 3 SAME PINGS IN A ROW
    // ====================

    const mentionedUsers =
      message.mentions.users.filter(
        user =>
          user.id !==
          client.user.id
      );

    const pingIds =
      mentionedUsers
        .map(user => user.id)
        .sort()
        .join(",");

    if (pingIds) {
      const previousPing =
        repeatedPings.get(
          authorId
        );

      if (
        previousPing &&
        previousPing.ids ===
          pingIds &&
        now -
          previousPing.time <
          30000
      ) {
        previousPing.count++;
        previousPing.time =
          now;
      } else {
        repeatedPings.set(
          authorId,
          {
            ids:
              pingIds,
            count: 1,
            time:
              now
          }
        );
      }

      const currentPing =
        repeatedPings.get(
          authorId
        );

      if (
        currentPing.count >= 3
      ) {
        try {
          const duration =
            5 * 60 * 1000;

          await muteMember(
            message.member,
            duration,
            "Pinging the same person 3 times in a row"
          );

          const name =
            displayName(
              message.member
            );

          await message.channel.send({
            content:
              "🚫 " +
              name +
              " was timed out for 5 minutes for repeatedly pinging the same person.",
            allowedMentions: {
              users: [],
              roles: []
            }
          });

          spam.delete(
            authorId
          );

          repeatedMessages.delete(
            authorId
          );

          repeatedPings.delete(
            authorId
          );

          return;
        } catch (error) {
          console.error(
            "Couldn't timeout user:",
            error
          );
        }
      }
    } else {
      repeatedPings.delete(
        authorId
      );
    }

    // ====================
    // REPEATED LETTER / EMOJI SPAM
    // ====================

    if (
      isRepeatedCharacterSpam(
        content
      ) ||
      isRepeatedPatternSpam(
        content
      )
    ) {
      try {
        const duration =
          5 * 60 * 1000;

        await muteMember(
          message.member,
          duration,
          "Repeated characters or spam pattern"
        );

        const name =
          displayName(
            message.member
          );

        await message.channel.send({
          content:
            "🚫 " +
            name +
            " was timed out for 5 minutes for spam.",
          allowedMentions: {
            users: [],
            roles: []
          }
        });

        spam.delete(
          authorId
        );

        repeatedMessages.delete(
          authorId
        );

        repeatedPings.delete(
          authorId
        );

        return;
      } catch (error) {
        console.error(
          "Couldn't timeout user:",
          error
        );
      }
    }
  }
);

// ====================
// COMMAND HANDLER
// ====================

client.on(
  "interactionCreate",
  async interaction => {
    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    const member =
      interaction.member;

    const commandName =
      interaction.commandName;

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
            "❌ I couldn't unban that user. Check the ID and make sure they're banned.",
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
