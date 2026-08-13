require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const OpenAI = require("openai");

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
// OPENAI CLIENT
// ====================

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const conversationHistory = new Map();

const MAX_HISTORY = 20;
const HISTORY_EXPIRY_MS = 30 * 60 * 1000;

const AI_SYSTEM_PROMPT = `
You are Thundra Bot, the friendly helper for Thundra SMP — a Minecraft Discord server.

Your personality:
- Casual, warm, and genuinely helpful
- Gen-Z vibe — chill, a little funny, never robotic
- Short replies by default (this is Discord, not an essay)
- Only go longer if the question actually needs it
- Never use bullet points or headers unless specifically asked
- You care about the people you talk to

Rules:
- Keep it PG — no inappropriate, offensive, or harmful content
- Don't pretend to be human if directly asked; admit you're a bot but a friendly one
- If someone asks you to ban/kick/mute someone, tell them to use the slash commands (/ban, /kick, /mute)
- You can answer general knowledge questions, give advice, chat, help with problems, whatever — just be real about what you don't know
- Don't make up facts. If you're unsure, say so and suggest Googling it
- Keep responses under ~200 words unless the question genuinely needs more
`.trim();

async function getAIResponse(userId, userMessage) {
  let history = conversationHistory.get(userId);
  const now = Date.now();

  if (!history || now - history.lastActive > HISTORY_EXPIRY_MS) {
    history = { messages: [], lastActive: now };
  } else {
    history.lastActive = now;
  }

  history.messages.push({ role: "user", content: userMessage });

  while (history.messages.length > MAX_HISTORY) {
    history.messages.shift();
  }

  conversationHistory.set(userId, history);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: AI_SYSTEM_PROMPT },
      ...history.messages
    ],
    max_tokens: 400,
    temperature: 0.85
  });

  const reply = response.choices[0].message.content.trim();

  history.messages.push({ role: "assistant", content: reply });

  while (history.messages.length > MAX_HISTORY) {
    history.messages.shift();
  }

  return reply;
}

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

const WELCOME_CHANNEL_NAME = "general";

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
// COOLDOWN
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
// DISCORD READY
// ====================

client.once("ready", async () => {
  console.log("Logged in as " + client.user.tag);
  console.log("Thundra Bot is online.");

  client.user.setActivity("Thundra SMP", { type: 0 });

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
      .addUserOption(o => o.setName("user").setDescription("User to look up").setRequired(false)),

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
      .setName("clearwarnings").setDescription("Clear all warnings for a member")
      .addUserOption(o => o.setName("user").setDescription("User to clear warnings for").setRequired(true)),

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
  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;
  const member = interaction.member;

  const publicCommands = ["ping", "serverinfo", "userinfo"];

  if (!publicCommands.includes(commandName) && !hasAllowedBasicRole(member)) {
    await interaction.reply({
      content: `❌ You need the ${MEMBER_ROLE_NAME} role to use bot commands.`,
      ephemeral: true
    });
    return;
  }

  const adminCommands = ["unmute", "warn", "warnings", "clearwarnings", "mute", "ban", "unban", "kick"];

  if (adminCommands.includes(commandName) && !hasAdminRole(member)) {
    await interaction.reply({
      content: `❌ You need the ${ADMIN_ROLE_NAME} role to use this command.`,
      ephemeral: true
    });
    return;
  }

  // /PING
  if (commandName === "ping") {
    const sent = await interaction.reply({ content: "Pinging...", fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong!\nBot latency: **${latency}ms**\nAPI latency: **${Math.round(client.ws.ping)}ms**`);
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

  // AUTO-MOD: BLOCK DISCORD INVITE LINKS (non-admins)
  if (/discord\.(gg|com\/invite)\/\S+/i.test(content) && !hasAdminRole(member)) {
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

  // ====================
  // TRIGGER CHECK
  // Only respond to @mentions or replies to the bot
  // ====================

  const botMentioned = client.user && message.mentions.users.has(client.user.id);

  const isReplyToBot = message.reference
    ? await message.channel.messages.fetch(message.reference.messageId)
        .then(ref => ref.author.id === client.user.id)
        .catch(() => false)
    : false;

  if (!botMentioned && !isReplyToBot) return;

  // COOLDOWN CHECK
  if (isOnCooldown(message.author.id)) return;

  // Typing indicator
  await message.channel.sendTyping();

  const reply = async (text) =>
    message.reply({ content: text, allowedMentions: { repliedUser: false } });

  // MATH — handle before AI so it's instant and accurate
  const mathResult = solveMath(content);
  if (mathResult !== null) return reply(`🧮 The answer is **${mathResult}**`);

  // EVERYTHING ELSE → OPENAI
  const cleanedForAI = content
    .replace(/<@!?\d+>/g, "")
    .trim();

  try {
    const aiReply = await getAIResponse(message.author.id, cleanedForAI || content);

    if (aiReply.length <= 2000) return reply(aiReply);

    // Split long responses at 2000 char limit
    const chunks = aiReply.match(/[\s\S]{1,1990}(?:\s|$)/g) || [aiReply];
    await reply(chunks[0]);
    for (let i = 1; i < chunks.length; i++) {
      await message.channel.send({ content: chunks[i], allowedMentions: { users: [], roles: [] } });
    }

  } catch (error) {
    console.error("OpenAI error:", error);
    await reply("Sorry, my brain glitched for a sec 😅 Try again in a moment!");
  }
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

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is missing from environment variables.");
  process.exit(1);
}

client.login(process.env.TOKEN);
