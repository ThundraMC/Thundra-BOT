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
// /UNMUTE COMMAND
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
// REGISTER COMMAND
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

    // Register only the server version
    await rest.put(
      Routes.applicationGuildCommands(
        client.user.id,
        SERVER_ID
      ),
      {
        body: [unmuteCommand.toJSON()]
      }
    );

    console.log("✅ Old commands removed!");
    console.log("✅ /unmute registered!");

  } catch (error) {
    console.error("❌ Command registration failed:", error);
  }
});

// ====================
// COMMAND HANDLER
// ====================

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

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
});

// ====================
// LOGIN
// ====================

client.login(process.env.TOKEN);
