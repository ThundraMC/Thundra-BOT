require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");

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
    "I can help with a lot! Here's what I do:\n" +
    "🧮 **Math** — just ask me any calculation\n" +
    "💬 **Chat** — talk to me, ask questions, whatever's on your mind\n" +
    "🛡️ **Moderation** — admins can use `/mute`, `/ban`, `/kick`, `/warn` and more\n" +
    "💤 **AFK** — set yourself AFK with `/afk`\n\n" +
    "Just mention me or say 'Thundra Bot' and I'll do my best to help!"
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
    "Why don't bots ever get tired? We have no sleep schedule."
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
    "Bored? Same honestly. Wanna talk about something? I'm all ears.",
    "Boredom hits different. Chat with me, what's on your mind?",
    "I'm literally always here if you're bored lol. What's up?",
    "Tell me something interesting then! Or ask me anything, I'll try my best."
  ]);
}

function getOpinionResponse() {
  return getRandom([
    "Honestly? I think whatever feels right to you is probably the move. I'm just a bot so my opinion is limited lol, but I'm rooting for you!",
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
    "Hmm, hard to say without knowing everything about the situation. What's making you second guess it?"
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
    "100% agree.", "Exactly my thoughts lol."
  ]);
}

function getWhatIsResponse(subject) {
  return getRandom([
    `Hmm, ${subject}? I'm not a full encyclopedia but from what I know, it's worth looking it up on Google for a solid answer! I'm still learning too.`,
    `Good question! I don't have a full database, but I'd check Wikipedia or Google for "${subject}" — you'll get a way better answer than me lol.`,
    `I kinda know about ${subject} but I don't wanna give you wrong info. Google it real quick, should pop right up!`,
    `Oh that's a good one. For "${subject}" specifically I'd point you to Google or Wikipedia — they'll explain it way better than I can.`
  ]);
}

function getHowToResponse(subject) {
  return getRandom([
    `For "${subject}" — I'd honestly Google that step by step, YouTube tutorials are great for that kind of thing too!`,
    `Hmm, how to ${subject}... I think the best move is a quick Google or YouTube search. You'll find a full guide way faster than I can explain it.`,
    `That's a bit outside what I can walk you through fully, but searching "${subject} tutorial" on Google or YouTube should get you sorted!`,
    `Good question! For something like that I'd look it up on Google, there's usually a super easy guide out there.`
  ]);
}

function getWhyResponse() {
  return getRandom([
    "Ooh, a why question. Honestly I'm not sure of the full answer but I'd love to help figure it out — got more context?",
    "That's a deep one lol. I don't have a perfect answer but if you give me more details I can try my best!",
    "Why questions are tough! I'm not always sure but I'll try — can you tell me a bit more about what you mean?",
    "Hmm, not 100% sure on that one. Could you explain a bit more so I can try to help properly?"
  ]);
}

function getSmartFallback(content) {
  if (/\?/.test(content)) {
    return getRandom([
      "Hmm, that's a good question. I'm not 100% sure but I'll try my best — could you give me a bit more context?",
      "Ooh I'm not totally sure about that one. For a proper answer I'd Google it, but I'm happy to chat about it!",
      "That's a tough one for me to answer fully, but I'm here if you wanna talk it through!",
      "I wish I had a perfect answer for you! I'm not sure on that one — try Googling it for the best info.",
      "Hmm, not my area of expertise lol. But I'm listening if you wanna explain more!"
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

client.once("ready", async () => {
  console.log("Logged in as " + client.user.tag);
  console.log("Thundra Bot is online.");

  client.user.setActivity("Thundra SMP", { type: 0 });

  const commands = [
    new SlashCommandBuilder()
      .setName("afk").setDescription("Set your AFK status")
      .addStringOption(o => o.setName("reason").setDescription("Why are you AFK?").setRequired(true)),

    new SlashCommandBuilder()
      .setName("unmute").setDescription("Unmute a member")
      .addUserOption(o => o.setName("user").setDescription("User to unmute").setRequired(true)),

    new SlashCommandBuilder()
      .setName("warn").setDescription("Warn a member")
      .addUserOption(o => o.setName("user").setDescription("User to warn").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason for warning").setRequired(true)),

    new SlashCommandBuilder()
      .setName("warnings").setDescription("View a member's warnings")
      .addUserOption(o => o.setName("user").setDescription("User to check").setRequired(true)),

    new SlashCommandBuilder()
      .setName("mute").setDescription("Mute a member")
      .addUserOption(o => o.setName("user").setDescription("User to mute").setRequired(true))
      .addStringOption(o => o.setName("duration").setDescription("Example: 30s, 5m, 1h, 1d").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason for mute").setRequired(false)),

    new SlashCommandBuilder()
      .setName("ban").setDescription("Ban a member")
      .addUserOption(o => o.setName("user").setDescription("User to ban").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason for ban").setRequired(false)),

    new SlashCommandBuilder()
      .setName("unban").setDescription("Unban a user")
      .addStringOption(o => o.setName("userid").setDescription("Discord user ID").setRequired(true)),

    new SlashCommandBuilder()
      .setName("kick").setDescription("Kick a member")
      .addUserOption(o => o.setName("user").setDescription("User to kick").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason for kick").setRequired(false))

  ].map(c => c.toJSON());

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationGuildCommands(client.user.id, SERVER_ID), { body: commands });
    console.log("Slash commands registered.");
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
});

// ====================
// SLASH COMMAND HANDLER
// ====================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;
  const member = interaction.member;

  if (!hasAllowedBasicRole(member)) {
    await interaction.reply({
      content: `❌ You need the ${MEMBER_ROLE_NAME} role to use bot commands.`,
      ephemeral: true
    });
    return;
  }

  const adminCommands = ["unmute", "warn", "warnings", "mute", "ban", "unban", "kick"];

  if (adminCommands.includes(commandName) && !hasAdminRole(member)) {
    await interaction.reply({
      content: `❌ You need the ${ADMIN_ROLE_NAME} role to use this command.`,
      ephemeral: true
    });
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
    await interaction.reply(text);
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
  const botMentioned = client.user && message.mentions.users.has(client.user.id);
  const hasThundraBot = /\bthundra\s*bot\b/i.test(content);

  // AFK RETURN
  if (afkUsers.has(message.author.id)) {
    const afkData = afkUsers.get(message.author.id);
    if (afkData?.timer) clearTimeout(afkData.timer);
    afkUsers.delete(message.author.id);
    await message.channel.send(displayName(member) + " is no longer AFK.");
  }

  // AFK PING CHECK
  for (const mentionedUser of message.mentions.users.values()) {
    if (mentionedUser.id === message.author.id) continue;
    if (!afkUsers.has(mentionedUser.id)) continue;

    const afkData = afkUsers.get(mentionedUser.id);
    let afkMember = null;
    try { afkMember = await message.guild.members.fetch(mentionedUser.id); } catch { afkMember = null; }
    await message.channel.send(displayName(afkMember || mentionedUser) + " is AFK: " + afkData.reason);
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

  if (!botMentioned && !hasThundraBot) return;

  // Typing indicator — makes it feel like the bot is thinking
  await message.channel.sendTyping();

  const reply = async (text) =>
    message.reply({ content: text, allowedMentions: { repliedUser: false } });

  const c = cleaned;

  // MATH
  const mathResult = solveMath(content);
  if (mathResult !== null) return reply(`🧮 The answer is **${mathResult}**`);

  // IQ
  if (isIQQuestion(content)) return reply("https://klipy.com/gifs/iq-smart");

  // HOW ARE YOU
  if (/\bhow\s+(are|r)\s+(you|u)\b/i.test(c)) return reply(getHowAreYouResponse());

  // LOVE
  if (/\b(i\s+love\s+you|love\s+you|luv\s+you|luv\s+u)\b/i.test(c)) return reply(getLoveResponse());

  // THANKS
  if (/\b(thanks|thank\s+you|thx|ty|tysm|thank\s+u)\b/i.test(c)) return reply(getThanksResponse());

  // COMPLIMENTS
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
      "As a bot I don't really have favorites but if I did, I'd probably pick whatever keeps this server running smoothly lol.",
      "I like helping people out, if that counts as a favorite thing!",
      "Honestly? I just enjoy being here and chatting with everyone. That's enough for me.",
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
      "That I'm not sure about — dates and times aren't really my thing lol. Google should have it though!",
      "Hmm, not sure on that one. Quick Google search should tell you exactly!",
      "I wish I knew! Google or Discord announcements would be your best bet for that."
    ]));

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

client.login(process.env.TOKEN);
