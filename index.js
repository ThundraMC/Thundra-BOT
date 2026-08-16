require("dotenv").config();

const express = require("express");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

// ====================
// RENDER WEB SERVER
// ====================

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Thundra Bot is online!");
});
===
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
// DISCORD CONNECTION DEBUG
// ====================

client.on("clientReady", () => {
  console.log(`✅ Discord connected as ${client.user.tag}`);
});

client.on("shardDisconnect", (event, shardId) => {
  console.log(`🔴 Discord disconnected. Shard: ${shardId}`, event.code);
});

client.on("shardReconnecting", (shardId) => {
  console.log(`🟡 Discord reconnecting. Shard: ${shardId}`);
});

client.on("shardResume", (shardId, replayedEvents) => {
  console.log(`🟢 Discord connection resumed. Shard: ${shardId}`);
});

process.on("unhandledRejection", error => {
  console.error("❌ Unhandled Promise Rejection:", error);
});

process.on("uncaughtException", error => {
  console.error("❌ Uncaught Exception:", error);
});
// ====================
// SETTINGS
// ====================

const SERVER_ID = "1531632541377757224";
const SERVER_NAME = "Thundra SMP";
const CONSOLE_CHANNEL_ID = "1537574569291030661";
const INVITE_LINK = "https://discord.gg/aebQ8RNSgW";

const MEMBER_ROLE_NAME = "👤・Member";
const ADMIN_ROLE_NAME = "🛡️・Admin";

// Change this to your welcome channel name or ID
const WELCOME_CHANNEL_NAME = "1533902298806358167";

// ====================
// CONSOLE LOGGING
// ====================

const botLogs = [];

async function logToConsole(type, message) {
  const now = new Date();

  const logEntry = {
    timestamp: now,
    type,
    message
  };

  botLogs.push(logEntry);

  if (botLogs.length > 5000) {
    botLogs.shift();
  }

  try {
    const channel = await client.channels.fetch(CONSOLE_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) return;

    const time = now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit"
    });

    let icon = "📋";

    if (type === "MESSAGE") icon = "💬";
    if (type === "COMMAND") icon = "⚡";
    if (type === "MODERATION") icon = "🛡️";

    await channel.send(
      `${icon} **[${time}]** ${message}`
    );

  } catch (error) {
    console.error("Console logging error:", error);
  }
}

// ====================
// DATA
// ====================

const spam = new Map();
const repeatedMessages = new Map();
const repeatedPings = new Map();
const warnings = new Map();
const afkUsers = new Map();
const cooldowns = new Map();

// ====================
// COOLDOWN HELPER
// ====================

const COOLDOWN_MS = 2500;

function isOnCooldown(userId) {
  const now = Date.now();
  const last = cooldowns.get(userId) || 0;
  if (now - last < COOLDOWN_MS) return true;
  cooldowns.set(userId, now);
  return false;
}

// ====================
// DISPLAY NAME
// ====================

function displayName(memberOrUser) {
  if (memberOrUser?.displayName) return memberOrUser.displayName;
  if (memberOrUser?.globalName) return memberOrUser.globalName;
  if (memberOrUser?.username) return memberOrUser.username;
  return "User";
}

// ====================
// ROLE CHECKS
// ====================

function hasAllowedBasicRole(member) {
  if (!member?.roles?.cache) return false;
  return member.roles.cache.some(r => r.name === MEMBER_ROLE_NAME || r.name === ADMIN_ROLE_NAME);
}

function hasAdminRole(member) {
  if (!member?.roles?.cache) return false;
  return member.roles.cache.some(r => r.name === ADMIN_ROLE_NAME);
}

// ====================
// DURATION PARSER
// ====================

function parseDuration(duration) {
  const match = duration.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "s") return amount * 1000;
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  if (unit === "d") return amount * 24 * 60 * 60 * 1000;
  return null;
}

function formatDuration(ms) {
  if (ms % (24 * 60 * 60 * 1000) === 0) return ms / (24 * 60 * 60 * 1000) + " day(s)";
  if (ms % (60 * 60 * 1000) === 0) return ms / (60 * 60 * 1000) + " hour(s)";
  if (ms % (60 * 1000) === 0) return ms / (60 * 1000) + " minute(s)";
  return Math.round(ms / 1000) + " second(s)";
}

// ====================
// DM HELPERS
// ====================

async function sendMuteDM(user, duration, reason) {
  try {
    await user.send(
      `🔇 You were muted in ${SERVER_NAME}.\n\nDuration: ${duration}\nReason: ${reason}\n\nServer: ${INVITE_LINK}`
    );
  } catch {
    console.log("Couldn't DM " + user.tag);
  }
}

async function sendMuteOverDM(user) {
  try {
    await user.send(
      `🔊 Your mute is over in ${SERVER_NAME}.\n\nYou can talk again now.\n\nServer: ${INVITE_LINK}`
    );
  } catch {
    console.log("Couldn't DM " + user.tag);
  }
}

async function muteMember(member, durationMs, reason) {
  await member.timeout(durationMs, reason);
  await sendMuteDM(member.user, formatDuration(durationMs), reason);
}

// ====================
// TEXT HELPERS
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
  expression = expression.replace(/thundra\s*bot/gi, " ");

  const wordReplacements = [
    [/\bwhat\s+is\b/gi, " "], [/\bwhat's\b/gi, " "], [/\bwhats\b/gi, " "],
    [/\bwhat\s+does\b/gi, " "], [/\bwhat\s+would\b/gi, " "],
    [/\bcalculate\b/gi, " "], [/\bcalculation\b/gi, " "], [/\bsolve\b/gi, " "],
    [/\banswer\b/gi, " "], [/\bplease\b/gi, " "],
    [/\bcan\s+you\b/gi, " "], [/\bcan\s+u\b/gi, " "],
    [/\bcould\s+you\b/gi, " "], [/\bcould\s+u\b/gi, " "],
    [/\bhow\s+much\s+is\b/gi, " "], [/\bequals?\s+to\b/gi, " "],
    [/\bequals\b/gi, " "], [/\bequal\b/gi, " "], [/\bis\b/gi, " "]
  ];

  for (const [pattern, replacement] of wordReplacements) {
    expression = expression.replace(pattern, replacement);
  }

  expression = expression
    .replace(/\bmultiplied\s+by\b/gi, "*").replace(/\bmultiply\s+by\b/gi, "*")
    .replace(/\bmultiplication\b/gi, "*").replace(/\bmultiplied\b/gi, "*")
    .replace(/\bmultiply\b/gi, "*").replace(/\btimes\b/gi, "*");

  expression = expression.replace(/(\d)\s*x\s*(?=\d)/gi, "$1*");

  expression = expression
    .replace(/\bdivided\s+by\b/gi, "/").replace(/\bdivide\s+by\b/gi, "/")
    .replace(/\bdivided\b/gi, "/").replace(/\bdivide\b/gi, "/").replace(/\bover\b/gi, "/");

  expression = expression
    .replace(/\bplus\b/gi, "+").replace(/\badd\b/gi, "+").replace(/\badded\s+to\b/gi, "+");

  expression = expression
    .replace(/\bminus\b/gi, "-").replace(/\bsubtract\b/gi, "-")
    .replace(/\bsubtracted\s+by\b/gi, "-");

  expression = expression
    .replace(/\bmodulo\b/gi, "%").replace(/\bmod\b/gi, "%");

  expression = expression
    .replace(/×/g, "*").replace(/✕/g, "*").replace(/✖/g, "*").replace(/·/g, "*")
    .replace(/÷/g, "/").replace(/−/g, "-").replace(/–/g, "-").replace(/—/g, "-");

  const percentageMatch = expression.match(
    /(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:of)\s*(\d+(?:\.\d+)?)/i
  );
  if (percentageMatch) {
    return (Number(percentageMatch[1]) / 100) * Number(percentageMatch[2]);
  }

  expression = expression
    .replace(/\bwhat\b/gi, " ").replace(/\banswer\b/gi, " ")
    .replace(/\bresult\b/gi, " ").replace(/\bquestion\b/gi, " ");

  expression = expression.replace(/[^0-9+\-*/().%^]/g, "");

  if (!expression) return null;
  if (!/\d/.test(expression)) return null;
  if (!/[+\-*/%^]/.test(expression)) return null;
  if (expression.length > 200) return null;
  if (/[+\-*/%^]{3,}/.test(expression)) return null;
  if (/\/0+(?:\.0*)?(?:$|[+\-*/%^])/g.test(expression)) return null;

  try {
    const result = Function('"use strict"; return (' + expression + ")")();
    if (typeof result !== "number" || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

// ====================
// SPAM DETECTION
// ====================

function isRepeatedCharacterSpam(text) {
  if (!text) return false;
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 10) return false;
  if (/(.)\1{7,}/us.test(compact)) return true;
  const chars = Array.from(compact);
  if (chars.length >= 12 && new Set(chars).size === 1) return true;
  return false;
}

function isRepeatedPatternSpam(text) {
  if (!text) return false;
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 12) return false;

  for (let size = 1; size <= 4; size++) {
    if (compact.length < size * 4) continue;
    const pattern = compact.slice(0, size);
    let valid = true;
    for (let i = 0; i < compact.length; i += size) {
      if (compact.slice(i, i + size) !== pattern) { valid = false; break; }
    }
    if (valid) return true;
  }
  return false;
}

// ====================
// RANDOM HELPER
// ====================

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ====================
// BOT RESPONSES
// ====================

function getBotGreeting() {
  return getRandom([
    "Hey there! wsp", "Hii! What's up?", "Yo yo, what's good?", "Ayy, what's up?",
    "Hey! How can I help you?", "Yoo, I'm here.", "Hiii, what's happening?",
    "Yo! Need something?", "Heyyy, what's good?", "Wsp! I'm here.",
    "Yo, what's going on?", "Hii hii!", "Ayy, you called?", "What's up?"
  ]);
}

function getHowAreYouResponse() {
  return getRandom([
    "I'm doing good, thanks for asking!", "Pretty chill rn, how about you?",
    "I'm good! Just keeping the server alive.", "Doing great! What's up with you?",
    "All good over here.", "I'm vibing, thanks for asking.",
    "Good good. What are we getting into today?", "I'm doing pretty good!",
    "Can't complain, I'm chilling.", "I'm good bro, what's up?"
  ]);
}

function getHelpResponse() {
  return (
    "Here's everything I can do:\n\n" +
    "🧮 **Math** — ask me any calculation\n" +
    "🎱 **8ball** — ask me anything with a `?` after mentioning me\n" +
    "✂️ **Rock Paper Scissors** — say `rps rock`, `rps paper`, or `rps scissors`\n" +
    "🪙 **Coin flip** — say `flip a coin` or `coin flip`\n" +
    "🎲 **Roll dice** — say `roll a dice` or use `/roll`\n" +
    "⭐ **Rate** — say `rate [anything]` and I'll give it a score\n" +
    "🔥 **Roast** — say `roast me` if you're feeling brave\n" +
    "💐 **Compliment** — say `compliment me`\n" +
    "🤔 **Would you rather** — say `would you rather`\n\n" +
    "**Slash Commands:**\n" +
    "`/ping` `/serverinfo` `/userinfo` `/coinflip` `/roll`\n" +
    "`/afk` `/mute` `/unmute` `/ban` `/unban` `/kick` `/warn` `/warnings` `/clearwarnings`\n\n" +
    "Just mention me or say 'Thundra Bot' and I'll respond!"
  );
}

function getLoveResponse() {
  return getRandom([
    "Aww, love you too.", "Love you too bro.", "❤️ right back at you.",
    "W love.", "You're real for that.", "Ayy, appreciate you."
  ]);
}

function getBotQuestionResponse() {
  return getRandom([
    "I'm Thundra Bot, your server's little helper.", "I'm Thundra Bot. What did you need?",
    "Just your friendly neighborhood Thundra Bot.", "I'm the bot around here.",
    "Thundra Bot reporting for duty."
  ]);
}

function getThanksResponse() {
  return getRandom(["No problem!", "Anytime.", "You got it.", "Of course!", "Np bro.", "Always."]);
}

function getJokeResponse() {
  return getRandom([
    "Why did the Minecraft player bring a ladder? To get to the next level.",
    "I would tell you a UDP joke, but you might not get it.",
    "Why did the creeper cross the road? To get closer to the player.",
    "My code never crashes. It just takes unexpected vacations.",
    "Why don't bots ever get tired? We have no sleep schedule.",
    "I asked my dog what two minus two is. He said nothing.",
    "Why do programmers prefer dark mode? Because light attracts bugs.",
    "There are 10 kinds of people: those who understand binary and those who don't.",
    "Why did the scarecrow win an award? Because he was outstanding in his field.",
    "I told my computer I needed a break. Now it won't stop sending me Kit-Kat ads."
  ]);
}

function getComplimentResponse() {
  return getRandom([
    "Aww thank you, that genuinely made my day!",
    "You're too kind, I appreciate that a lot!",
    "That's really sweet, thank you!",
    "Aww stop it 😊 you're great too!",
    "That means a lot, seriously. Thank you!"
  ]);
}

function getInsultResponse() {
  return getRandom([
    "Aw that's a bit mean but I still like you lol.",
    "Ouch! I'll let that slide, no hard feelings.",
    "That hurt a little but I forgive you 😅",
    "Hey, I'm doing my best over here! Still love u tho."
  ]);
}

function getBoredomResponse() {
  return getRandom([
    "Bored? Try `rps rock` and beat me at rock paper scissors!",
    "Boredom hits different. Ask me `would you rather` or say `roast me` if you're brave lol.",
    "I'm literally always here if you're bored. Try asking me to `rate` something!",
    "Tell me something interesting! Or say `flip a coin` if you can't decide something."
  ]);
}

function getOpinionResponse() {
  return getRandom([
    "Honestly? I think whatever feels right to you is probably the move. I'm rooting for you!",
    "I mean, I'd say go with your gut on that one. You know the situation better than I do!",
    "That's a tough call. I don't wanna steer you wrong but I think both options have merit — what's your gut say?",
    "Lowkey I think you already know the answer, you just need someone to back you up lol. You got this."
  ]);
}

function getShouldIResponse() {
  return getRandom([
    "That's really up to you, but if it feels right and it's not hurting anyone — go for it!",
    "Honestly? If your gut says yes, probably yes. I believe in you.",
    "I can't make that call for you but I think you've got good judgment. Trust yourself!",
    "Hmm, hard to say without knowing everything. What's making you second guess it?"
  ]);
}

function getAdviceResponse() {
  return getRandom([
    "I'm here for you! Tell me more about what's going on and I'll do my best to help.",
    "Of course, what's up? I'll try my best to help out.",
    "Yeah let's figure this out together. What's the situation?",
    "I got you. What's going on?"
  ]);
}

function getAgreementResponse() {
  return getRandom([
    "Right?? Exactly.", "Facts, couldn't agree more.", "Yeah no you're totally right.",
    "100% agree.", "Exactly my thoughts lol.", "Bro facts.", "No cap."
  ]);
}

function getWhatIsResponse(subject) {
  return getRandom([
    `Hmm, ${subject}? I'm not a full encyclopedia but it's worth looking up on Google for a solid answer!`,
    `Good question! I'd check Wikipedia or Google for "${subject}" — you'll get a way better answer than me lol.`,
    `I kinda know about ${subject} but I don't wanna give you wrong info. Google it real quick!`,
    `Oh that's a good one. For "${subject}" specifically I'd point you to Google or Wikipedia.`
  ]);
}

function getHowToResponse(subject) {
  return getRandom([
    `For "${subject}" — I'd honestly Google that step by step, YouTube tutorials are great for that too!`,
    `Hmm, how to ${subject}... a quick Google or YouTube search will get you a full guide way faster than I can explain.`,
    `That's a bit outside what I can walk you through, but searching "${subject} tutorial" on YouTube should sort you out!`,
    `Good question! For something like that I'd look it up on Google, there's usually an easy guide out there.`
  ]);
}

function getWhyResponse() {
  return getRandom([
    "Ooh, a why question. Honestly I'm not sure of the full answer — got more context?",
    "That's a deep one lol. I don't have a perfect answer but if you give me more details I can try!",
    "Why questions are tough! Can you tell me a bit more about what you mean?",
    "Hmm, not 100% sure on that one. Could you explain a bit more?"
  ]);
}

function getSmartFallback(content) {
  if (/\?/.test(content)) {
    return getRandom([
      "Hmm, that's a good question. I'm not 100% sure — could you give me a bit more context?",
      "Ooh I'm not totally sure about that one. For a proper answer I'd Google it, but I'm happy to chat!",
      "That's a tough one for me to answer fully, but I'm here if you wanna talk it through!",
      "I wish I had a perfect answer! Try Googling it for the best info.",
      "Not my area of expertise lol. But I'm listening if you wanna explain more!"
    ]);
  }

  return getRandom([
    "I hear you! What's on your mind?",
    "Say more, I'm listening!",
    "Interesting! Tell me more.",
    "I'm here! What's going on?",
    "Noted! Anything I can help with?",
    "I got you. What do you need?"
  ]);
}

// ====================
// 8BALL
// ====================

function get8BallResponse() {
  return getRandom([
    "🎱 It is certain.", "🎱 Without a doubt.", "🎱 Yes, definitely.",
    "🎱 You may rely on it.", "🎱 As I see it, yes.", "🎱 Most likely.",
    "🎱 Outlook good.", "🎱 Signs point to yes.", "🎱 Reply hazy, try again.",
    "🎱 Ask again later.", "🎱 Better not tell you now.", "🎱 Cannot predict now.",
    "🎱 Don't count on it.", "🎱 My reply is no.", "🎱 My sources say no.",
    "🎱 Outlook not so good.", "🎱 Very doubtful.", "🎱 Absolutely not lol.",
    "🎱 Bro... no.", "🎱 The stars say yes but I say maybe."
  ]);
}

// ====================
// ROCK PAPER SCISSORS
// ====================

function playRPS(userChoice) {
  const choices = ["rock", "paper", "scissors"];
  const botChoice = getRandom(choices);
  const emojis = { rock: "🪨", paper: "📄", scissors: "✂️" };

  let result;
  if (userChoice === botChoice) {
    result = "It's a tie! 🤝";
  } else if (
    (userChoice === "rock" && botChoice === "scissors") ||
    (userChoice === "paper" && botChoice === "rock") ||
    (userChoice === "scissors" && botChoice === "paper")
  ) {
    result = "You win! 🎉 gg";
  } else {
    result = "I win! 😎 better luck next time";
  }

  return `${emojis[userChoice]} vs ${emojis[botChoice]} — ${result}`;
}

// ====================
// COIN FLIP
// ====================

function flipCoin() {
  return getRandom(["🪙 Heads!", "🪙 Tails!"]);
}

// ====================
// RATE
// ====================

function rateThings(subject) {
  const score = Math.floor(Math.random() * 11);
  const comments = {
    0: "lol not even close, sorry 💀",
    1: "yikes... 😬",
    2: "it's a rough one fr",
    3: "could be worse I guess",
    4: "below average but it's something",
    5: "right in the middle, not bad not great",
    6: "actually decent!",
    7: "pretty solid ngl",
    8: "okay that's genuinely good",
    9: "lowkey amazing fr",
    10: "GOATED. absolute perfection 🐐"
  };
  return `I rate **${subject}** a **${score}/10** — ${comments[score]}`;
}

// ====================
// ROASTS
// ====================

function getRoast() {
  return getRandom([
    "You're like a cloud. When you disappear, it's a beautiful day. ☀️",
    "I'd roast you harder but my parents told me not to burn trash.",
    "You're proof that even evolution makes mistakes sometimes.",
    "Calling you an idiot would be an insult to idiots.",
    "I'd explain it to you but I left my crayons at home.",
    "You're not stupid, you just have bad luck thinking.",
    "If brains were dynamite, you wouldn't have enough to blow your hat off.",
    "You're a grey sprinkle on a rainbow cupcake.",
    "I've seen better heads on a cauliflower.",
    "You have the energy of a participation trophy."
  ]);
}

// ====================
// COMPLIMENTS
// ====================

function getUserCompliment() {
  return getRandom([
    "You're genuinely one of the coolest people in this server. Facts.",
    "I don't say this to everyone but you've got great vibes. 💯",
    "You're lowkey awesome, hope you know that.",
    "Okay but real talk, you seem like a really solid person.",
    "You're built different in the best way possible. Keep being you.",
    "Honestly? You're the kind of person that makes the server better just by being here.",
    "W human. The world needs more people like you.",
    "You're not just cool, you're genuinely kind too. That's rare."
  ]);
}

// ====================
// WOULD YOU RATHER
// ====================

function getWouldYouRather() {
  return getRandom([
    "Would you rather fight one horse-sized duck 🦆 or 100 duck-sized horses 🐴?",
    "Would you rather have no internet for a year or no food for a month?",
    "Would you rather be able to fly but only at walking speed, or be super fast but only on the ground?",
    "Would you rather always speak in rhymes or always speak in questions?",
    "Would you rather know when you're going to die or how you're going to die?",
    "Would you rather lose all your memories or never be able to make new ones?",
    "Would you rather have unlimited battery on your phone or unlimited data forever?",
    "Would you rather be able to talk to animals or speak every human language?",
    "Would you rather it always be summer or always be your favorite season but twice as extreme?",
    "Would you rather have Minecraft graphics in real life or real life graphics in Minecraft?"
  ]);
}

// ====================
// IQ CHECK
// ====================

function isIQQuestion(text) {
  const t = text.toLowerCase().replace(/[?!.,]/g, " ").replace(/\s+/g, " ").trim();
  return (
    /\bhow\s+many\s+iq\b/.test(t) || /\bhow\s+much\s+iq\b/.test(t) ||
    /\bwhat\s+is\s+your\s+iq\b/.test(t) || /\bwhat\s+is\s+ur\s+iq\b/.test(t) ||
    /\bwhats\s+your\s+iq\b/.test(t) || /\bwhats\s+ur\s+iq\b/.test(t) ||
    /\bwhat'?s\s+your\s+iq\b/.test(t) || /\bwhat'?s\s+ur\s+iq\b/.test(t) ||
    /\byour\s+iq\b/.test(t) || /\bur\s+iq\b/.test(t) ||
    /\bhow\s+smart\s+are\s+you\b/.test(t) || /\bhow\s+smart\s+r\s+you\b/.test(t) ||
    /\bhow\s+smart\s+are\s+u\b/.test(t)
  );
}

// ====================
// DISCORD READY
// ====================
client.once("clientReady", async () => {
  console.log("Logged in as " + client.user.tag);
  console.log("Thundra Bot is online.");

  client.user.setPresence({
    status: "online",
    activities: [
      {
        name: "Thundra SMP",
        type: 0
      }
    ]
  });

  console.log("Bot status:", client.presence?.status);
  client.user.setPresence({
    status: "online",
    activities: [
      {
        name: "Thundra SMP",
        type: 0
      }
    ]
  });
  console.log("Logged in as " + client.user.tag);
  console.log("Thundra Bot is online.");


  const commands = [
    new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Check the bot's latency"),

    new SlashCommandBuilder()
      .setName("serverinfo")
      .setDescription("Show info about this server"),

    new SlashCommandBuilder()
      .setName("userinfo")
      .setDescription("Show info about a user")
      .addUserOption(o =>
        o.setName("user")
          .setDescription("User to look up")
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("coinflip")
      .setDescription("Flip a coin"),

    new SlashCommandBuilder()
      .setName("roll")
      .setDescription("Roll a dice")
      .addIntegerOption(o =>
        o.setName("sides")
          .setDescription("Number of sides (default 6)")
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("afk")
      .setDescription("Set your AFK status")
      .addStringOption(o =>
        o.setName("reason")
          .setDescription("Why are you AFK?")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("unmute")
      .setDescription("Unmute a member")
      .addUserOption(o =>
        o.setName("user")
          .setDescription("User to unmute")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("warn")
      .setDescription("Warn a member")
      .addUserOption(o =>
        o.setName("user")
          .setDescription("User to warn")
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("reason")
          .setDescription("Reason for warning")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("checkwarnings")
      .setDescription("View a member's warnings")
      .addUserOption(o =>
        o.setName("user")
          .setDescription("User to check")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("clearwarnings")
      .setDescription("Clear all warnings for a member")
      .addUserOption(o =>
        o.setName("user")
          .setDescription("User to clear warnings for")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("mute")
      .setDescription("Mute a member")
      .addUserOption(o =>
        o.setName("user")
          .setDescription("User to mute")
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("duration")
          .setDescription("Example: 30s, 5m, 1h, 1d")
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("reason")
          .setDescription("Reason for mute")
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a member")
      .addUserOption(o =>
        o.setName("user")
          .setDescription("User to ban")
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("reason")
          .setDescription("Reason for ban")
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("unban")
      .setDescription("Unban a user")
      .addStringOption(o =>
        o.setName("userid")
          .setDescription("Discord user ID")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Kick a member")
      .addUserOption(o =>
        o.setName("user")
          .setDescription("User to kick")
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("reason")
          .setDescription("Reason for kick")
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("log")
      .setDescription("Find logs from a specific date and time")
      .addIntegerOption(o =>
        o.setName("day")
          .setDescription("Day of the month")
          .setMinValue(1)
          .setMaxValue(31)
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("month")
          .setDescription("Start typing a month")
          .setAutocomplete(true)
          .setRequired(true)
      )
      .addStringOption(o =>
        o.setName("time")
          .setDescription("24-hour time, example: 13:01")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Set up server features")
      .addSubcommand(sub =>
        sub
          .setName("ticket")
          .setDescription("Set up the ticket system")
      )

  ].map(c => c.toJSON());

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(client.user.id, SERVER_ID),
      { body: commands }
    );

    console.log("Slash commands registered.");
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
});

// ====================
// MEMBER JOIN — WELCOME
// ====================

client.on("guildMemberAdd", async member => {
  const channel = member.guild.channels.cache.find(
    c => c.name === WELCOME_CHANNEL_NAME && c.isTextBased()
  );
  if (!channel) return;

  const welcomeMessages = [
    `Hey ${member}! Welcome to **${SERVER_NAME}**! Glad you're here 👋`,
    `${member} just joined the server! Welcome to **${SERVER_NAME}** 🎉`,
    `Welcome ${member}! Hope you enjoy your time in **${SERVER_NAME}**!`,
    `Ayy ${member} is here! Welcome to **${SERVER_NAME}** 🙌`,
    `${member} pulled up! Welcome to **${SERVER_NAME}**, make yourself at home.`
  ];

  await channel.send(getRandom(welcomeMessages));
});

// ====================
// SLASH COMMAND HANDLER
// ====================

client.on("interactionCreate", async interaction => {

  // ====================
  // /LOG AUTOCOMPLETE
  // ====================

  if (interaction.isAutocomplete()) {
    if (interaction.commandName === "log") {

      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
      ];

      const focused = interaction.options.getFocused().toLowerCase();

      const filtered = months
        .filter(month => month.toLowerCase().startsWith(focused))
        .slice(0, 25);

      await interaction.respond(
        filtered.map(month => ({
          name: month,
          value: month
        }))
      );
    }

    return;
  }

  if (
  !interaction.isChatInputCommand() &&
  !interaction.isButton() &&
  !interaction.isStringSelectMenu() &&
  !interaction.isModalSubmit()
) return;

 // ====================
// /SETUP TICKET
// ====================

if (
  interaction.isChatInputCommand() &&
  interaction.commandName === "setup" &&
  interaction.options.getSubcommand() === "ticket"
) {
  const member = interaction.member;

  const isOwnerOrCoOwner = member?.roles?.cache?.some(role =>
    role.name === "👑・Owner" ||
    role.name === "⚜️・Co-Owner"
  );

  if (!isOwnerOrCoOwner) {
    await interaction.reply({
      content: "❌ Only the Owner or Co-Owner can set up tickets.",
      ephemeral: true
    });
    return;
  }

  const ticketButton = new ButtonBuilder()
    .setCustomId("open_ticket")
    .setLabel("Open Ticket")
    .setEmoji("🎫")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder()
    .addComponents(ticketButton);

  const embed = new EmbedBuilder()
    .setTitle("🎫 Thundra SMP Support")
    .setDescription(
      "Need help? Click **Open Ticket** below to create a private support ticket.\n\n" +
      "Please only open a ticket if you actually need support."
    );

  await interaction.channel.send({
    embeds: [embed],
    components: [row]
  });

  await interaction.reply({
    content: "✅ Ticket panel has been set up!",
    ephemeral: true
  });

  return;
}
    // ====================
  // OPEN TICKET BUTTON
  // ====================

  if (interaction.isButton() && interaction.customId === "open_ticket") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_reason")
      .setPlaceholder("Choose what you need support for...")
      .addOptions(
        {
          label: "Report Player",
          description: "Report a player for breaking the rules.",
          value: "report_player",
          emoji: "🚩"
        },
        {
          label: "Ban Appeal",
          description: "Appeal a ban from Thundra SMP.",
          value: "ban_appeal",
          emoji: "📝"
        },
        {
          label: "Report Bug or Exploit",
          description: "Report a bug or exploit.",
          value: "report_bug",
          emoji: "🛠️"
        }
      );

    const row = new ActionRowBuilder()
      .addComponents(menu);

    await interaction.reply({
      content: "**What do you need support for?**",
      components: [row],
      ephemeral: true
    });

    return;
  }

    // ====================
  // TICKET REASON SELECT
  // ====================

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "ticket_reason"
  ) {
    const reason = interaction.values[0];

    const proofMenu = new StringSelectMenuBuilder()
      .setCustomId(`ticket_proof_${reason}`)
      .setPlaceholder("Do you have proof?")
      .addOptions(
        {
          label: "Yes, I do",
          description: "I have screenshots or a video.",
          value: "yes",
          emoji: "✅"
        },
        {
          label: "No, I don't",
          description: "I don't have screenshots or a video.",
          value: "no",
          emoji: "❌"
        }
      );

    const row = new ActionRowBuilder()
      .addComponents(proofMenu);

    await interaction.update({
      content: "**Do you have proof? Screenshots or video?**",
      components: [row]
    });

    return;
  }

    // ====================
  // TICKET PROOF SELECT
  // ====================

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId.startsWith("ticket_proof_")
  ) {
    const proof = interaction.values[0];
    const reason = interaction.customId.replace("ticket_proof_", "");

    const modal = new ModalBuilder()
      .setCustomId(`ticket_name_${reason}_${proof}`)
      .setTitle("🎫 Ticket Information");

    const usernameInput = new TextInputBuilder()
      .setCustomId("minecraft_username")
      .setLabel("What is your in-game name?")
      .setPlaceholder("Enter your Minecraft username")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(32);

    const row = new ActionRowBuilder()
      .addComponents(usernameInput);

    modal.addComponents(row);

    await interaction.showModal(modal);

    return;
  }

    // ====================
  // TICKET NAME MODAL
  // ====================

  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith("ticket_name_")
  ) {
    const parts = interaction.customId.split("_");

    const reason = parts[2];
    const proof = parts[3];

    const minecraftUsername =
      interaction.fields.getTextInputValue("minecraft_username");

    const reasonNames = {
      report_player: "🚩 Report Player",
      ban_appeal: "📝 Ban Appeal",
      report_bug: "🛠️ Report Bug or Exploit"
    };

    const proofText = proof === "yes"
      ? "✅ Yes, I have proof."
      : "❌ No, I don't have proof.";

    const guild = interaction.guild;

    const existingTicket = guild.channels.cache.find(
      channel =>
        channel.name === `ticket-${interaction.user.username.toLowerCase()}` &&
        channel.type === ChannelType.GuildText
    );

    if (existingTicket) {
      await interaction.reply({
        content: `❌ You already have an open ticket: ${existingTicket}`,
        ephemeral: true
      });
      return;
    }

    const ticketChannel = await guild.channels.create({
  name: `ticket-${interaction.user.username}`,
  type: ChannelType.GuildText,
  parent: "1537888242119082146",
  permissionOverwrites: [
    {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: guild.roles.cache.find(
            role => role.name === "👑・Owner"
          )?.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: guild.roles.cache.find(
            role => role.name === "⚜️・Co-Owner"
          )?.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: guild.roles.cache.find(
            role => role.name === "🛡️・Admin"
          )?.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ].filter(permission => permission.id)
    });

    const ticketEmbed = new EmbedBuilder()
      .setTitle("🎫 Thundra SMP Support Ticket")
      .addFields(
        {
          name: "👤 User",
          value: `${interaction.user}`,
          inline: true
        },
        {
          name: "🎮 In-Game Name",
          value: minecraftUsername,
          inline: true
        },
        {
          name: "📌 Reason",
          value: reasonNames[reason] || "Unknown",
          inline: false
        },
        {
          name: "📸 Proof",
          value: proofText,
          inline: false
        }
      )
      .setDescription(
        "A staff member will be with you shortly.\n\n" +
        "Please provide any additional information or proof here."
      );

 const closeButton = new ButtonBuilder()
  .setCustomId("close_ticket")
  .setLabel("Close Ticket")
  .setEmoji("🔒")
  .setStyle(ButtonStyle.Danger);

const closeRow = new ActionRowBuilder()
  .addComponents(closeButton);

await ticketChannel.send({
  content: `${interaction.user} <@&${guild.roles.cache.find(
    role => role.name === "🛡️・Admin"
  )?.id || ""}>`,
  embeds: [ticketEmbed],
  components: [closeRow]
});

    await interaction.reply({
      content: `✅ Your ticket has been created: ${ticketChannel}`,
      ephemeral: true
    });

    return;
  }

  // ====================
// CLOSE TICKET
// ====================

// ====================
// CLOSE TICKET
// ====================

if (
  interaction.isButton() &&
  interaction.customId === "close_ticket"
) {
  const member = interaction.member;

  const canCloseTicket = member?.roles?.cache?.some(role =>
    role.name === "👑・Owner" ||
    role.name === "⚜️・Co-Owner" ||
    role.name === "🛡️・Admin"
  );

  if (!canCloseTicket) {
    await interaction.reply({
      content: "❌ Only Admins, Co-Owners, and Owners can close tickets.",
      ephemeral: true
    });
    return;
  }

  const confirmButton = new ButtonBuilder()
    .setCustomId("confirm_close_ticket")
    .setLabel("Yes, Close")
    .setEmoji("🔒")
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId("cancel_close_ticket")
    .setLabel("Cancel")
    .setEmoji("❌")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder()
    .addComponents(confirmButton, cancelButton);

  await interaction.reply({
    content: "⚠️ **Are you sure you want to close this ticket?**",
    components: [row]
  });

  return;
}

// ====================
// CONFIRM CLOSE TICKET
// ====================

if (
  interaction.isButton() &&
  interaction.customId === "confirm_close_ticket"
) {
  const member = interaction.member;

  const canCloseTicket = member?.roles?.cache?.some(role =>
    role.name === "👑・Owner" ||
    role.name === "⚜️・Co-Owner" ||
    role.name === "🛡️・Admin"
  );

  if (!canCloseTicket) {
    await interaction.reply({
      content: "❌ Only Admins, Co-Owners, and Owners can close tickets.",
      ephemeral: true
    });
    return;
  }

  await interaction.update({
    content: "🔒 **Ticket closing in 5 seconds...**",
    components: []
  });

  setTimeout(async () => {
    try {
      await interaction.channel.delete();
    } catch (error) {
      console.error("Failed to close ticket:", error);
    }
  }, 5000);

  return;
}

// ====================
// CANCEL CLOSE TICKET
// ====================

if (
  interaction.isButton() &&
  interaction.customId === "cancel_close_ticket"
) {
  await interaction.update({
    content: "✅ Ticket close cancelled.",
    components: []
  });

  return;
}
  // ====================
  // COMMAND LOGGING
  // ====================

  const options = interaction.options.data
    .map(option => {
      if (option.user) return `${option.name}: ${option.user.tag}`;
      return `${option.name}: ${option.value ?? ""}`;
    })
    .join(", ");

  logToConsole(
    "COMMAND",
    `👤 **${interaction.user.tag}** used \`/${interaction.commandName}\`${options ? ` — ${options}` : ""}`
  );

  const commandName = interaction.commandName;
const member = interaction.member;

// ====================
// COMMAND PERMISSIONS
// ====================

const publicCommands = [
  "ping",
  "afk",
  "serverinfo",
  "userinfo",
  "coinflip",
  "roll"
];

const adminCommands = [
  "unmute",
  "warnings",
  "warn"
];

const ownerCommands = [
  "ban",
  "clearwarnings",
  "unban",
  "kick",
  "mute"
];

const OWNER_ROLE = "👑・Owner";
const COOWNER_ROLE = "⚜️・Co-Owner";
const ADMIN_ROLE = "🛡️・Admin";

const hasOwnerRole =
  member?.roles?.cache?.some(r =>
    r.name === OWNER_ROLE || r.name === COOWNER_ROLE
  );

const hasAdminCommandRole =
  member?.roles?.cache?.some(r =>
    r.name === OWNER_ROLE ||
    r.name === COOWNER_ROLE ||
    r.name === ADMIN_ROLE
  );

if (publicCommands.includes(commandName)) {
  // allowed
} else if (adminCommands.includes(commandName)) {
  if (!hasAdminCommandRole) {
    await interaction.reply({
      content: "❌ You need the Admin, Co-Owner, or Owner role to use this command.",
      ephemeral: true
    });
    return;
  }
} else if (ownerCommands.includes(commandName)) {
  if (!hasOwnerRole) {
    await interaction.reply({
      content: "❌ Only the Owner or Co-Owner can use this command.",
      ephemeral: true
    });
    return;
  }
}

// /PING
  if (commandName === "ping") {
    const sent = await interaction.reply({ content: "Pinging...", fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);
    await interaction.editReply(`🏓 Pong!\nBot latency: **${latency}ms**\nAPI latency: **${apiLatency}ms**`);
    return;
  }

  // /SERVERINFO
  if (commandName === "serverinfo") {
    const guild = interaction.guild;
    await guild.fetch();

    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: "👑 Owner", value: `<@${guild.ownerId}>`, inline: true },
        { name: "👥 Members", value: `${guild.memberCount}`, inline: true },
        { name: "📅 Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: "💬 Channels", value: `${guild.channels.cache.size}`, inline: true },
        { name: "🎭 Roles", value: `${guild.roles.cache.size}`, inline: true },
        { name: "😀 Emojis", value: `${guild.emojis.cache.size}`, inline: true }
      )
      .setColor(0x5865f2)
      .setFooter({ text: `ID: ${guild.id}` });

    await interaction.reply({ embeds: [embed] });
    return;
  }

  // /USERINFO
  if (commandName === "userinfo") {
    const user = interaction.options.getUser("user") || interaction.user;
    const target = await interaction.guild.members.fetch(user.id).catch(() => null);

    const embed = new EmbedBuilder()
      .setTitle(displayName(target || user))
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "🏷️ Username", value: user.username, inline: true },
        { name: "🆔 ID", value: user.id, inline: true },
        { name: "📅 Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`, inline: true }
      )
      .setColor(0x5865f2);

    if (target) {
      embed.addFields(
        { name: "📥 Joined Server", value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>`, inline: true },
        { name: "🎭 Roles", value: target.roles.cache.filter(r => r.name !== "@everyone").map(r => r.name).join(", ") || "None", inline: false }
      );
    }

    await interaction.reply({ embeds: [embed] });
    return;
  }

  // /COINFLIP
  if (commandName === "coinflip") {
    await interaction.reply(flipCoin());
    return;
  }

  // /ROLL
  if (commandName === "roll") {
    const sides = interaction.options.getInteger("sides") || 6;
    if (sides < 2 || sides > 1000) {
      await interaction.reply({ content: "❌ Sides must be between 2 and 1000.", ephemeral: true });
      return;
    }
    const result = Math.floor(Math.random() * sides) + 1;
    await interaction.reply(`🎲 You rolled a **${result}** (d${sides})`);
    return;
  }

  // /AFK
  if (commandName === "afk") {
    const reason = interaction.options.getString("reason", true);
    const oldAfk = afkUsers.get(interaction.user.id);
    if (oldAfk?.timer) clearTimeout(oldAfk.timer);

    const timer = setTimeout(() => afkUsers.delete(interaction.user.id), 7 * 24 * 60 * 60 * 1000);
    afkUsers.set(interaction.user.id, { reason, user: interaction.user, timer });

    await interaction.reply({ content: "You are now AFK: " + reason, ephemeral: true });
    await interaction.channel.send({
      content: displayName(member) + " is now AFK.",
      allowedMentions: { users: [], roles: [] }
    });
    return;
  }

  // /UNMUTE
  if (commandName === "unmute") {
    const user = interaction.options.getUser("user", true);
    try {
      const target = await interaction.guild.members.fetch(user.id);
      await target.timeout(null, "Manual unmute");
      await interaction.reply(`🔊 ${displayName(target)} has been unmuted.`);
      await user.send(`🔊 You were unmuted in ${SERVER_NAME}.`).catch(() => {});
    } catch (error) {
      console.error("Unmute error:", error);
      if (!interaction.replied) await interaction.reply({ content: "❌ I couldn't unmute that user.", ephemeral: true });
    }
    return;
  }

  // /WARN
  if (commandName === "warn") {
    const user = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true);
    const userWarnings = warnings.get(user.id) || [];
    userWarnings.push({ reason, moderator: interaction.user.id, date: new Date() });
    warnings.set(user.id, userWarnings);

    await interaction.reply(`⚠️ ${user.username} has been warned.\nReason: ${reason}\nTotal warnings: ${userWarnings.length}`);
    await user.send(`⚠️ You received a warning in ${SERVER_NAME}.\n\nReason: ${reason}\nTotal warnings: ${userWarnings.length}`).catch(() => {});
    return;
  }

  // /WARNINGS
  if (commandName === "warnings") {
    const user = interaction.options.getUser("user", true);
    const userWarnings = warnings.get(user.id) || [];

    if (userWarnings.length === 0) {
      await interaction.reply(user.username + " has no warnings.");
      return;
    }

    let text = `📋 Warnings for ${user.username}\n\n`;
    userWarnings.forEach((w, i) => { text += `**${i + 1}.** ${w.reason}\n`; });
    await interaction.reply({
  content: text,
  ephemeral: true
});
    return;
  }

  // /CLEARWARNINGS
  if (commandName === "clearwarnings") {
    const user = interaction.options.getUser("user", true);
    const had = (warnings.get(user.id) || []).length;
    warnings.delete(user.id);
    await interaction.reply(
      had > 0
        ? `🗑️ Cleared **${had}** warning(s) for ${user.username}.`
        : `${user.username} had no warnings to clear.`
    );
    return;
  }

  // /MUTE
  if (commandName === "mute") {
    const user = interaction.options.getUser("user", true);
    const durationText = interaction.options.getString("duration", true);
    const reason = interaction.options.getString("reason") || "No reason provided";
    const milliseconds = parseDuration(durationText);

    if (!milliseconds) {
      await interaction.reply({ content: "❌ Invalid duration. Use 30s, 5m, 1h, or 1d.", ephemeral: true });
      return;
    }
    if (milliseconds > 28 * 24 * 60 * 60 * 1000) {
      await interaction.reply({ content: "❌ Maximum mute duration is 28 days.", ephemeral: true });
      return;
    }

    try {
      const target = await interaction.guild.members.fetch(user.id);
      await target.timeout(milliseconds, `Muted by ${interaction.user.tag}: ${reason}`);
      await interaction.reply(`🔇 ${displayName(target)} has been muted for ${durationText}.\nReason: ${reason}`);
      await sendMuteDM(user, durationText, reason);
      setTimeout(() => sendMuteOverDM(user), milliseconds);
    } catch (error) {
      console.error("Mute error:", error);
      if (!interaction.replied) await interaction.reply({ content: "❌ I couldn't mute that user.", ephemeral: true });
    }
    return;
  }

  // /BAN
  if (commandName === "ban") {
    const user = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") || "No reason provided";
    await user.send(`🔨 You were banned from ${SERVER_NAME}.\n\nReason: ${reason}\n\nServer: ${INVITE_LINK}`).catch(() => {});
    try {
      await interaction.guild.members.ban(user.id, { reason });
      await interaction.reply(`🔨 ${user.username} has been banned.\nReason: ${reason}`);
    } catch (error) {
      console.error("Ban error:", error);
      if (!interaction.replied) await interaction.reply({ content: "❌ I couldn't ban that user.", ephemeral: true });
    }
    return;
  }

  // /UNBAN
  if (commandName === "unban") {
    const userId = interaction.options.getString("userid", true);
    try {
      await interaction.guild.members.unban(userId, `Unbanned by ${interaction.user.tag}`);
      await interaction.reply(`🔓 User ${userId} has been unbanned.`);
    } catch (error) {
      console.error("Unban error:", error);
      if (!interaction.replied) await interaction.reply({ content: "❌ I couldn't unban that user.", ephemeral: true });
    }
    return;
  }

  // /KICK
  if (commandName === "kick") {
    const user = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") || "No reason provided";
    await user.send(`👢 You were kicked from ${SERVER_NAME}.\n\nReason: ${reason}\n\nServer: ${INVITE_LINK}`).catch(() => {});
    try {
      const target = await interaction.guild.members.fetch(user.id);
      await target.kick(reason);
      await interaction.reply(`👢 ${displayName(target)} has been kicked.\nReason: ${reason}`);
    } catch (error) {
      console.error("Kick error:", error);
      if (!interaction.replied) await interaction.reply({ content: "❌ I couldn't kick that user.", ephemeral: true });
    }
    return;
  }
});

// ====================
// MESSAGE CREATE
// ====================

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  const member = message.member;
  const content = message.content || "";
  const cleaned = cleanText(content);

  // ====================
  // AUTOMATIC 5-MINUTE MUTE
  // ====================

  const racistWordPattern = /\b(?:n+ig+g+a|n+ig+g+e+r|n+g+a)\b/i;

  if (racistWordPattern.test(content)) {
    try {
      if (member?.moderatable) {
        await member.timeout(
          5 * 60 * 1000,
          "Automatic 5-minute mute for racist language"
        );

        await logToConsole(
          "MODERATION",
          `🛡️ **${displayName(member)}** was automatically muted for 5 minutes for racist language.`
        );
      }
    } catch (error) {
      console.error("Automatic mute error:", error);
    }

    return;
  }
  // ====================
  // MESSAGE LOGGING
  // ====================

  if (message.channel.id !== CONSOLE_CHANNEL_ID) {
  logToConsole(
    "MESSAGE",
    `**${displayName(member)}** • <#${message.channel.id}> • ${content.slice(0, 1000)}`
  );
}
  // Only respond to direct pings, never replies
  const botMentioned =
  client.user &&
  message.mentions.users.has(client.user.id) &&
  !message.reference;
    !message.reference;

  // AFK RETURN
  if (afkUsers.has(message.author.id)) {
    const afkData = afkUsers.get(message.author.id);

    if (afkData?.timer) {
      clearTimeout(afkData.timer);
    }

    afkUsers.delete(message.author.id);

    await message.channel.send(
      displayName(member) + " is no longer AFK."
    );
  }

  // AFK PING CHECK
  for (const mentionedUser of message.mentions.users.values()) {
    if (mentionedUser.id === message.author.id) continue;
    if (!afkUsers.has(mentionedUser.id)) continue;

    const afkData = afkUsers.get(mentionedUser.id);
    let afkMember = null;
    try { afkMember = await message.guild.members.fetch(mentionedUser.id); } catch { afkMember = null; }
 const reply = await message.reply({
  content:
    displayName(afkMember || mentionedUser) +
    " is AFK: " +
    afkData.reason
});

setTimeout(() => {
  reply.delete().catch(() => {});
}, 5000);
  }

  // AUTO-MOD: BLOCK DISCORD INVITE LINKS (non-admins)
  if (
    /discord\.(gg|com\/invite)\/\S+/i.test(content) &&
    !hasAdminRole(member)
  ) {
    try { await message.delete(); } catch {}
    await message.channel.send({
      content: `${displayName(member)}, posting invite links is not allowed here.`,
      allowedMentions: { users: [], roles: [] }
    });
    return;
  }

  // REPEATED CHARACTER / PATTERN SPAM
  if (isRepeatedCharacterSpam(content) || isRepeatedPatternSpam(content)) {
    const now = Date.now();
    const userData = spam.get(message.author.id) || { count: 0, last: 0 };

    if (now - userData.last < 15000) userData.count++;
    else userData.count = 1;
    userData.last = now;
    spam.set(message.author.id, userData);

    try { await message.delete(); } catch {}

    if (userData.count >= 2) {
      try {
        await muteMember(member, 5 * 60 * 1000, "Repeated spam");
        await message.channel.send(displayName(member) + " has been muted for 5 minutes for spam.");
      } catch (error) { console.error("Spam mute error:", error); }
      spam.delete(message.author.id);
    }

    return;
  }

  // REPEATED SAME MESSAGE
  const normalizedMessage = content.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalizedMessage.length > 0) {
    const now = Date.now();
    const data = repeatedMessages.get(message.author.id) || { message: "", count: 0, last: 0 };

    if (data.message === normalizedMessage && now - data.last < 15000) data.count++;
    else { data.message = normalizedMessage; data.count = 1; }
    data.last = now;
    repeatedMessages.set(message.author.id, data);

    if (data.count >= 3) {
      try { await message.delete(); } catch {}
      try {
        await muteMember(member, 5 * 60 * 1000, "Repeated messages");
        await message.channel.send(displayName(member) + " has been muted for 5 minutes for repeated messages.");
      } catch (error) { console.error("Repeated message mute error:", error); }
      repeatedMessages.delete(message.author.id);
      return;
    }
  }

  // REPEATED PINGS
  if (message.mentions.users.size > 0) {
    for (const target of message.mentions.users.values()) {
      if (target.id === message.author.id) continue;

      const key = message.author.id + ":" + target.id;
      const now = Date.now();
      const pingData = repeatedPings.get(key) || { count: 0, last: 0 };

      if (now - pingData.last < 15000) pingData.count++;
      else pingData.count = 1;
      pingData.last = now;
      repeatedPings.set(key, pingData);

      if (pingData.count >= 3) {
        try {
          await muteMember(member, 5 * 60 * 1000, "Repeatedly pinging the same person");
          await message.channel.send(displayName(member) + " has been muted for 5 minutes for repeated pinging.");
        } catch (error) { console.error("Ping mute error:", error); }
        repeatedPings.delete(key);
        return;
      }
    }
  }

  if (!botMentioned) return;

  // COOLDOWN CHECK
  if (isOnCooldown(message.author.id)) return;

  // Typing indicator
  await message.channel.sendTyping();

  const reply = async (text) =>
    message.reply({ content: text, allowedMentions: { repliedUser: false } });

  const c = cleaned;

  // MATH
  const mathResult = solveMath(content);
  if (mathResult !== null) return reply(`🧮 The answer is **${mathResult}**`);

  // IQ
  if (isIQQuestion(content)) return reply("https://klipy.com/gifs/iq-smart");

  // ROCK PAPER SCISSORS
  const rpsMatch = c.match(/\brps\s+(rock|paper|scissors)\b/i);
  if (rpsMatch) return reply(playRPS(rpsMatch[1].toLowerCase()));

  if (/\b(rock|paper|scissors)\b/i.test(c) && /\bplay\b/i.test(c)) {
    const choice = c.match(/\b(rock|paper|scissors)\b/i)[1].toLowerCase();
    return reply(playRPS(choice));
  }

  // COIN FLIP
  if (/\b(flip\s+a?\s*coin|coin\s*flip|heads\s+or\s+tails|toss\s+a?\s*coin)\b/i.test(c))
    return reply(flipCoin());

  // ROLL DICE (message)
  if (/\b(roll\s+a?\s*(dice|die|d6)|roll\s+\d+)\b/i.test(c)) {
    const sides = 6;
    return reply(`🎲 You rolled a **${Math.floor(Math.random() * sides) + 1}**`);
  }

  // RATE
  const rateMatch = c.match(/\brate\s+(.+)/i);
  if (rateMatch) return reply(rateThings(rateMatch[1].trim()));

  // ROAST ME
  if (/\broast\s+(me|yourself)\b/i.test(c)) return reply(getRoast());

  // COMPLIMENT ME / SOMEONE
  if (/\bcompliment\s+(me|yourself)\b/i.test(c)) return reply(getUserCompliment());

  // WOULD YOU RATHER
  if (/\bwould\s+you\s+rather\b/i.test(c)) return reply(getWouldYouRather());

  // HOW ARE YOU
  if (/\bhow\s+(are|r)\s+(you|u)\b/i.test(c)) return reply(getHowAreYouResponse());

  // LOVE
  if (/\b(i\s+love\s+you|love\s+you|luv\s+you|luv\s+u)\b/i.test(c)) return reply(getLoveResponse());

  // THANKS
  if (/\b(thanks|thank\s+you|thx|ty|tysm|thank\s+u)\b/i.test(c)) return reply(getThanksResponse());

  // COMPLIMENTS (toward the bot)
  if (/\b(you('?re| are) (amazing|awesome|great|cool|the best|so smart|smart|helpful|nice|sweet)|good bot|best bot|nice bot)\b/i.test(c))
    return reply(getComplimentResponse());

  // INSULTS
  if (/\b(you (suck|are (dumb|stupid|useless|trash|bad))|shut up|dumb bot|stupid bot|bad bot|hate you)\b/i.test(c))
    return reply(getInsultResponse());

  // BORED
  if (/\b(i('?m| am) bored|so bored|bored as|nothing to do)\b/i.test(c))
    return reply(getBoredomResponse());

  // JOKE
  if (/\b(tell\s+(me\s+)?(a\s+)?joke|joke)\b/i.test(c)) return reply(getJokeResponse());

  // WHO ARE YOU
  if (/\b(who\s+are\s+you|what\s+are\s+you|what\s+is\s+your\s+name|whats\s+your\s+name|your\s+name)\b/i.test(c))
    return reply(getBotQuestionResponse());

  // ARE YOU A BOT / AI
  if (/\b(are\s+you\s+(a\s+)?(bot|ai|robot)|you\s+a\s+bot|ur\s+a\s+bot|are\s+you\s+an\s+ai)\b/i.test(c))
    return reply("Yeah bro, I'm literally Thundra Bot. A bot, but I try my best to be helpful!");

  // ARE YOU ONLINE / ALIVE
  if (/\b(are\s+you\s+online|you\s+online|r\s+you\s+online|u\s+online|you\s+there|anyone\s+there|you\s+alive|are\s+you\s+alive|you\s+working|are\s+you\s+working)\b/i.test(c))
    return reply("Yep, alive and online! What do you need?");

  // HELP
  if (/\b(help(\s+me)?|what\s+can\s+you\s+do|what\s+do\s+you\s+do|your\s+commands)\b/i.test(c))
    return reply(getHelpResponse());

  // GOOD MORNING / AFTERNOON / NIGHT
  if (/\b(good\s+morning|good\s+afternoon|good\s+night|gm|gn|goodnight)\b/i.test(c))
    return reply(getRandom([
      "Good morning! Hope your day goes well 🌅",
      "Morning! Have a great one ☀️",
      "Good night! Get some rest 🌙",
      "Gn! Sleep well 💤",
      "Good afternoon! Hope the day's been good so far!"
    ]));

  // GREETINGS
  if (/\b(hi+|hello|hey+|yo+|wsp|sup|wassup|whats\s+up|what'?s\s+up)\b/i.test(c))
    return reply(getBotGreeting());

  // SHOULD I
  if (/\bshould\s+(i|we)\b/i.test(c)) return reply(getShouldIResponse());

  // WHAT DO YOU THINK / OPINION
  if (/\b(what\s+do\s+you\s+think|what'?s\s+your\s+(opinion|take|thoughts?)|do\s+you\s+think)\b/i.test(c))
    return reply(getOpinionResponse());

  // ADVICE / NEED HELP
  if (/\b(can\s+you\s+(help|give\s+(me\s+)?advice)|need\s+(help|advice)|got\s+a\s+problem|i\s+need\s+help)\b/i.test(c))
    return reply(getAdviceResponse());

  // WHAT TIME / DAY / DATE
  if (/\bwhat\s+(time|day|date)(\s+(is\s+it|is\s+today))?\b/i.test(c))
    return reply(getRandom([
      "I don't have access to the clock unfortunately, but your device will tell you!",
      "Not sure what time it is on your end — check your phone or PC!",
      "I wish I knew lol, check your device for the time!"
    ]));

  // FAVORITE
  if (/\b(what'?s?\s+your\s+fav(ou?rite)?|do\s+you\s+(like|have\s+a\s+fav))\b/i.test(c))
    return reply(getRandom([
      "As a bot I don't really have favorites, but I'd pick whatever keeps this server running smoothly lol.",
      "I like helping people out, if that counts!",
      "Honestly? I just enjoy being here and chatting with everyone.",
      "My favorite is when everyone in the server is chill and having a good time lol."
    ]));

  // AGREEMENT
  if (/\b(i\s+agree|same|facts|fr|for\s+real|no\s+cap|exactly|true|real\s+talk|lowkey)\b/i.test(c))
    return reply(getAgreementResponse());

  // CAN YOU (general)
  if (/\bcan\s+(you|u)\b/i.test(c))
    return reply(getRandom([
      "I'll do my best! What do you need?",
      "I can try! What's up?",
      "Maybe! Tell me more and I'll see what I can do.",
      "Depends lol — what do you need?"
    ]));

  // HOW TO / HOW DO I
  if (/\bhow\s+(do\s+(i|u|we)|to|can\s+(i|u|we))\b/i.test(c)) {
    const subject = c.replace(/\bhow\s+(do\s+(i|u|we)|to|can\s+(i|u|we))\s*/i, "").trim();
    return reply(getHowToResponse(subject || "that"));
  }

  // WHO IS
  if (/\bwho\s+(is|was|are|were)\b/i.test(c)) {
    const subject = c.replace(/\bwho\s+(is|was|are|were)\s*/i, "").replace(/[?]/g, "").trim();
    return reply(getRandom([
      `Hmm, I'm not sure about "${subject}" specifically — try Googling them for the full story!`,
      `I don't have a great answer on "${subject}" but Google will!`,
      `"${subject}"? I think you'd get a better answer on Google for that one tbh.`
    ]));
  }

  // WHAT IS / WHAT ARE
  if (/\bwhat\s+(is|are|was|were)\b/i.test(c)) {
    const subject = c.replace(/\bwhat\s+(is|are|was|were)\s*/i, "").replace(/[?]/g, "").trim();
    return reply(getWhatIsResponse(subject || "that"));
  }

  // WHY
  if (/^\s*why\b/i.test(c) || /\bwhy\s+(is|are|do|does|did|would|can|can't|won't)\b/i.test(c))
    return reply(getWhyResponse());

  // WHEN
  if (/\bwhen\s+(is|are|was|were|did|will|does)\b/i.test(c))
    return reply(getRandom([
      "That I'm not sure about — dates and times aren't really my thing lol. Google should have it!",
      "Hmm, not sure on that one. Quick Google search should tell you exactly!",
      "I wish I knew! Google or Discord announcements would be your best bet."
    ]));

  // 8BALL — catch-all for questions
  if (/\?/.test(content) && /\b(will|should|is|are|do|does|can|would|could|am|has|have|did)\b/i.test(c))
    return reply(get8BallResponse());

  // SMART FALLBACK — never goes silent
  return reply(getSmartFallback(content));
});

// ====================
// ERROR HANDLER
// ====================

client.on("error", error => {
  console.error("Discord client error:", error);
});

// ====================
// TOKEN CHECK + LOGIN
// ====================

if (!process.env.TOKEN) {
  console.error("TOKEN is missing from environment variables.");
  process.exit(1);
}

client.login(process.env.TOKEN)
  .then(() => console.log("Discord login successful!"))
  .catch(error => console.error("Discord login failed:", error));
