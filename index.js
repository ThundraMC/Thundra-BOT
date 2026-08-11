const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Discord bot is online!");
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const SERVER_ID = "1531632541377757224";

// ====================
// ANTI-SPAM
// ====================

const spam = new Map();
const repeatedMessages = new Map();

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.member) return;

  const now = Date.now();

  // ====================
  // NORMAL ANTI-SPAM
  // ====================

  const messages = spam.get(message.author.id) || [];

  const recent = messages.filter(time => now - time < 5000);
  recent.push(now);

  spam.set(message.author.id, recent);

  // 5 messages in 5 seconds = 5 minute timeout
  if (recent.length >= 5) {
    try {
      await message.member.timeout(
        5 * 60 * 1000,
        "Anti-spam"
      );

      await message.channel.send(
        `🚫 ${message.author} was timed out for **5 minutes** for spamming.`
      );

      spam.delete(message.author.id);
      repeatedMessages.delete(message.author.id);

      return;

    } catch (error) {
      console.error("❌ Couldn't timeout user:", error);
    }
  }

  // ====================
  // REPEATED MESSAGE ANTI-SPAM
  // ====================

  const previous = repeatedMessages.get(message.author.id);

  if (previous && previous.content === message.content) {
    previous.count++;
  } else {
    repeatedMessages.set(message.author.id, {
      content: message.content,
      count: 1
    });
  }

  const repeated = repeatedMessages.get(message.author.id);

  // 3 messages in a row that are EXACTLY the same
  if (repeated.count >= 3) {
    try {
      await message.member.timeout(
        5 * 60 * 1000,
        "Repeated messages"
      );

      await message.channel.send(
        `🚫 ${message.author} was timed out for **5 minutes** for sending the same message 3 times in a row.`
      );

      spam.delete(message.author.id);
      repeatedMessages.delete(message.author.id);

    } catch (error) {
      console.error("❌ Couldn't timeout user:", error);
    }
  }
});

// ====================
// WARNINGS STORAGE
// ====================

const warnings = new Map();

function getWarnings(userId) {
  return warnings.get(userId) || [];
}

// ====================
// /UNMUTE
// ====================

const unmuteCommand = new SlashCommandBuilder()
  .setName("unmute")
  .setDescription("Remove a timeout from a member")
  .addUserOption(option =>
    option
      .setName("user")
      .setDescription("Select the member to unmute")
      .setRequired(true)
  );

// ====================
// /WARN
// ====================

const warnCommand = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Warn a member")
  .addUserOption(option =>
    option
      .setName("user")
      .setDescription("Select the member to warn")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("reason")
      .setDescription("Reason for the warning")
      .setRequired(true)
  );

// ====================
// /WARNINGS
// ====================

const warningsCommand = new SlashCommandBuilder()
  .setName("warnings")
  .setDescription("View a member's warnings")
  .addUserOption(option =>
    option
      .setName("user")
      .setDescription("Select the member")
      .setRequired(true)
  );

// ====================
// /MUTE
// ====================

const muteCommand = new SlashCommandBuilder()
  .setName("mute")
  .setDescription("Mute a member")
  .addUserOption(option =>
    option
      .setName("user")
      .setDescription("Select the member to mute")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("duration")
      .setDescription("Example: 30s, 5m, 1h, 1d")
      .setRequired(true)
  );

// ====================
// /BAN
// ====================

const banCommand = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Ban a member")
  .addUserOption(option =>
    option
      .setName("user")
      .setDescription("Select the member to ban")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("reason")
      .setDescription("Reason for the ban")
      .setRequired(false)
  );

// ====================
// /UNBAN
// ====================

const unbanCommand = new SlashCommandBuilder()
  .setName("unban")
  .setDescription("Unban a user")
  .addStringOption(option =>
    option
      .setName("userid")
      .setDescription("Discord user ID")
      .setRequired(true)
  );

// ====================
// /KICK
// ====================

const kickCommand = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Kick a member")
  .addUserOption(option =>
    option
      .setName("user")
      .setDescription("Select the member to kick")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("reason")
      .setDescription("Reason for the kick")
      .setRequired(false)
  );

// ====================
// REGISTER COMMANDS
// ====================

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" })
    .setToken(process.env.TOKEN);

  try {
    // Delete old global commands
    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: []
      }
    );

    // Register server commands
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
          kickCommand.toJSON()
        ]
      }
    );

    console.log("✅ Old commands removed!");
    console.log("✅ All moderation commands registered!");

  } catch (error) {
    console.error("❌ Command registration failed:", error);
  }
});

// ====================
// COMMAND HANDLER
// ====================

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // ====================
  // /UNMUTE
  // ====================

  if (interaction.commandName === "unmute") {
    const user = interaction.options.getUser("user");

    try {
      const member = await interaction.guild.members.fetch(user.id);

      await member.timeout(null, "Manual unmute");

      await interaction.reply(
        `🔊 ${user} has been **unmuted**.`
      );

    } catch (error) {
      console.error("❌ Unmute error:", error);

      await interaction.reply({
        content: "❌ I couldn't unmute that user.",
        ephemeral: true
      });
    }
  }

  // ====================
  // /WARN
  // ====================

  if (interaction.commandName === "warn") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");

    const userWarnings = getWarnings(user.id);

    userWarnings.push({
      reason: reason,
      moderator: interaction.user.id,
      date: new Date()
    });

    warnings.set(user.id, userWarnings);

    await interaction.reply(
      `⚠️ ${user} has been **warned**.\n` +
      `**Reason:** ${reason}\n` +
      `**Total warnings:** ${userWarnings.length}`
    );
  }

  // ====================
  // /WARNINGS
  // ====================

  if (interaction.commandName === "warnings") {
    const user = interaction.options.getUser("user");
    const userWarnings = getWarnings(user.id);

    if (userWarnings.length === 0) {
      return interaction.reply(
        `📋 ${user} has **no warnings**.`
      );
    }

    let text = `📋 **Warnings for ${user}**\n\n`;

    userWarnings.forEach((warning, index) => {
      text += `**${index + 1}.** ${warning.reason}\n`;
    });

    await interaction.reply(text);
  }

  // ====================
  // /MUTE
  // ====================

  if (interaction.commandName === "mute") {
    const user = interaction.options.getUser("user");
    const duration = interaction.options.getString("duration");

    const match = duration.match(/^(\d+)(s|m|h|d)$/i);

    if (!match) {
      return interaction.reply({
        content:
          "❌ Invalid duration. Use `30s`, `5m`, `1h`, or `1d`.",
        ephemeral: true
      });
    }

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    let milliseconds;

    if (unit === "s") milliseconds = amount * 1000;
    if (unit === "m") milliseconds = amount * 60 * 1000;
    if (unit === "h") milliseconds = amount * 60 * 60 * 1000;
    if (unit === "d") milliseconds = amount * 24 * 60 * 60 * 1000;

    // Discord timeout maximum = 28 days
    if (milliseconds > 28 * 24 * 60 * 60 * 1000) {
      return interaction.reply({
        content: "❌ Maximum mute duration is **28 days**.",
        ephemeral: true
      });
    }

    try {
      const member = await interaction.guild.members.fetch(user.id);

      await member.timeout(
        milliseconds,
        `Muted by ${interaction.user.tag}`
      );

      await interaction.reply(
        `🔇 ${user} has been muted for **${duration}**.`
      );

    } catch (error) {
      console.error("❌ Mute error:", error);

      await interaction.reply({
        content: "❌ I couldn't mute that user.",
        ephemeral: true
      });
    }
  }

  // ====================
  // /BAN
  // ====================

  if (interaction.commandName === "ban") {
    const user = interaction.options.getUser("user");
    const reason =
      interaction.options.getString("reason") ||
      "No reason provided";

    try {
      await interaction.guild.members.ban(user.id, {
        reason: reason
      });

      await interaction.reply(
        `🔨 ${user} has been **banned**.\n` +
        `**Reason:** ${reason}`
      );

    } catch (error) {
      console.error("❌ Ban error:", error);

      await interaction.reply({
        content: "❌ I couldn't ban that user.",
        ephemeral: true
      });
    }
  }

  // ====================
  // /UNBAN
  // ====================

  if (interaction.commandName === "unban") {
    const userId = interaction.options.getString("userid");

    try {
      await interaction.guild.members.unban(
        userId,
        `Unbanned by ${interaction.user.tag}`
      );

      await interaction.reply(
        `🔓 User **${userId}** has been **unbanned**.`
      );

    } catch (error) {
      console.error("❌ Unban error:", error);

      await interaction.reply({
        content:
          "❌ I couldn't unban that user. Check the ID and make sure they're banned.",
        ephemeral: true
      });
    }
  }

  // ====================
  // /KICK
  // ====================

  if (interaction.commandName === "kick") {
    const user = interaction.options.getUser("user");
    const reason =
      interaction.options.getString("reason") ||
      "No reason provided";

    try {
      const member = await interaction.guild.members.fetch(user.id);

      await member.kick(reason);

      await interaction.reply(
        `👢 ${user} has been **kicked**.\n` +
        `**Reason:** ${reason}`
      );

    } catch (error) {
      console.error("❌ Kick error:", error);

      await interaction.reply({
        content: "❌ I couldn't kick that user.",
        ephemeral: true
      });
    }
  }
});

// ====================
// LOGIN
// ====================

client.login(process.env.TOKEN);
