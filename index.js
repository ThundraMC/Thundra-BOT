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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const SERVER_ID = "1531632541377757224";
const SERVER_NAME = "Thundra SMP";
const INVITE_LINK = "https://discord.gg/aebQ8RNSgW";
const SERVER_IP = "ThundraPVP.aternos.me";

// ====================
// STORAGE
// ====================

const spam = new Map();
const repeatedMessages = new Map();
const warnings = new Map();

// ====================
// RANDOM RESPONSES
// ====================

const greetingResponses = [
  "Hey there! wsp",
  "Yooo what's good?",
  "Heeey! What's up?",
  "Yo yo!",
  "Hiii! What's up?",
  "Ayy what's good?",
  "Hello hello!",
  "Yooo wassup",
  "Heyyy there!",
  "What's poppin?",
  "Yo! What's happening?",
  "Sup bro",
  "Hiiiii!",
  "Hey! How's it going?",
  "Yooo!"
];

const howAreYouResponses = [
  "I'm doing great! How about you?",
  "I'm chilling, what's good?",
  "I'm doing pretty good ngl.",
  "I'm good bro, just chilling in the server.",
  "Doing great! Thanks for asking.",
  "I'm chilling. How are you?",
  "Pretty good over here!",
  "I'm doing amazing today.",
  "All good on my end!",
  "I'm alive and ready to help.",
  "Doing good! What about you?",
  "I'm chilling like always.",
  "Pretty damn good, thanks for asking.",
  "I'm doing great. What can I help you with?",
  "I'm doing good!"
];

const botResponses = [
  "Hii!",
  "Hey there!",
  "Yo! What's up?",
  "How can I help you?",
  "What's good?",
  "I'm here!",
  "Yes? What's up?",
  "What's happening?",
  "Hii, what do you need?",
  "Yo yo!",
  "I'm listening.",
  "What can I do for you?",
  "Hey! Need something?",
  "Sup!",
  "You called?",
  "What's up bro?",
  "Hello there!",
  "I'm right here!",
  "Need some help?",
  "What's good?"
];

const ipResponses = [
  "The server IP is **" + SERVER_IP + "**.",
  "You looking for the server IP? It's **" + SERVER_IP + "**.",
  "The Thundra SMP IP is **" + SERVER_IP + "**.",
  "Sure! The IP is **" + SERVER_IP + "**.",
  "Here you go: **" + SERVER_IP + "**",
  "Want to join? Use **" + SERVER_IP + "**.",
  "The Minecraft server address is **" + SERVER_IP + "**.",
  "Yep, the IP is **" + SERVER_IP + "**. Come join us!",
  "Server IP: **" + SERVER_IP + "**",
  "It's **" + SERVER_IP + "**. See you there!"
];

// ====================
// RANDOM RESPONSE
// ====================

function randomResponse(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// ====================
// CLEAN MESSAGE
// ====================

function cleanText(text) {
  return text
    .toLowerCase()
    .replace(/<@!?\d+>/g, " ")
    .replace(/[.,!?;:'"`()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ====================
// GREETING DETECTOR
// ====================

function isGreeting(text) {
  const greetings = [
    "hi",
    "hii",
    "hiii",
    "hiiii",
    "hiiiii",
    "hello",
    "helloo",
    "hellooo",
    "helloooo",
    "hey",
    "heyy",
    "heyyy",
    "heyyyy",
    "yo",
    "yoo",
    "yooo",
    "yoooo",
    "sup",
    "wassup",
    "whatsup",
    "howdy"
  ];

  return greetings.some((word) => {
    return new RegExp("\\b" + word + "[a-z]*\\b", "i").test(text);
  });
}

// ====================
// HOW ARE YOU DETECTOR
// ====================

function isHowAreYou(text) {
  const patterns = [
    "how are you",
    "how r you",
    "how r u",
    "how are u",
    "how you doing",
    "how you doin",
    "how are ya",
    "how r ya",
    "how u doing",
    "how are thundra bot",
    "how r thundra bot",
    "how are you thundra bot",
    "how r u thundra bot",
    "how are u thundra bot"
  ];

  return patterns.some((pattern) => text.includes(pattern));
}

// ====================
// IP DETECTOR
// ====================

function isIpQuestion(text) {
  const hasBotName =
    text.includes("thundra bot") ||
    text.includes("thundrabot");

  const ipWords = [
    "ip",
    "server ip",
    "servers ip",
    "server address",
    "servers address",
    "server adress",
    "servers adress",
    "minecraft ip",
    "minecraft server ip"
  ];

  const askingForIp = ipWords.some((word) =>
    text.includes(word)
  );

  return hasBotName && askingForIp;
}

// ====================
// BOT NAME DETECTOR
// ====================

function isBotNameOnly(text) {
  return (
    text === "thundra bot" ||
    text === "thundrabot"
  );
}

// ====================
// MUTE DM
// ====================

async function sendMuteDM(user, duration, reason) {
  try {
    await user.send(
      "You were muted in " +
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
    console.log("Could not DM " + user.tag);
  }
}

// ====================
// MUTE OVER DM
// ====================

async function sendMuteOverDM(user) {
  try {
    await user.send(
      "Your mute is over in " +
        SERVER_NAME +
        ".\n\n" +
        "You can talk again now.\n\n" +
        "Server: " +
        INVITE_LINK
    );
  } catch (error) {
    console.log("Could not DM " + user.tag);
  }
}

// ====================
// MESSAGE HANDLER
// ====================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const text = cleanText(message.content);
  const botWasMentioned = message.mentions.has(client.user);

  // ====================
  // IP
  // ====================

  if (isIpQuestion(text)) {
    await message.reply(randomResponse(ipResponses));
    return;
  }

  // ====================
  // HOW ARE YOU
  // ====================

  if (isHowAreYou(text)) {
    await message.reply(randomResponse(howAreYouResponses));
    return;
  }

  // ====================
  // GREETING WITH BOT
  // ====================

  if (
    (text.includes("thundra bot") || botWasMentioned) &&
    isGreeting(text)
  ) {
    await message.reply(randomResponse(greetingResponses));
    return;
  }

  // ====================
  // BOT NAME / PING
  // ====================

  if (botWasMentioned || isBotNameOnly(text)) {
    await message.reply(randomResponse(botResponses));
    return;
  }

  // ====================
  // ANTI-SPAM
  // ====================

  const now = Date.now();

  const messages = spam.get(message.author.id) || [];

  const recent = messages.filter(
    (time) => now - time < 5000
  );

  recent.push(now);
  spam.set(message.author.id, recent);

  if (recent.length >= 5) {
    try {
      await message.member.timeout(
        5 * 60 * 1000,
        "Anti-spam"
      );

      await message.channel.send(
        message.author +
          " was timed out for 5 minutes for spamming."
      );

      await sendMuteDM(
        message.author,
        "5 minutes",
        "Spamming"
      );

      setTimeout(() => {
        sendMuteOverDM(message.author);
      }, 5 * 60 * 1000);

      spam.delete(message.author.id);
      repeatedMessages.delete(message.author.id);

      return;
    } catch (error) {
      console.error("Anti-spam error:", error);
    }
  }

  // ====================
  // REPEATED MESSAGE
  // ====================

  const previous = repeatedMessages.get(message.author.id);

  if (
    previous &&
    previous.content === message.content
  ) {
    previous.count++;
  } else {
    repeatedMessages.set(message.author.id, {
      content: message.content,
      count: 1
    });
  }

  const repeated = repeatedMessages.get(message.author.id);

  if (repeated.count >= 3) {
    try {
      await message.member.timeout(
        5 * 60 * 1000,
        "Repeated messages"
      );

      await message.channel.send(
        message.author +
          " was timed out for 5 minutes for sending the same message 3 times in a row."
      );

      await sendMuteDM(
        message.author,
        "5 minutes",
        "Sending the same message 3 times in a row"
      );

      setTimeout(() => {
        sendMuteOverDM(message.author);
      }, 5 * 60 * 1000);

      spam.delete(message.author.id);
      repeatedMessages.delete(message.author.id);
    } catch (error) {
      console.error("Repeated message error:", error);
    }
  }
});

// ====================
// WARNING SYSTEM
// ====================

function getWarnings(userId) {
  return warnings.get(userId) || [];
}

// ====================
// /UNMUTE
// ====================

const unmuteCommand = new SlashCommandBuilder()
  .setName("unmute")
  .setDescription("Remove a timeout from a member")
  .addUserOption((option) =>
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
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Select the member to warn")
      .setRequired(true)
  )
  .addStringOption((option) =>
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
  .addUserOption((option) =>
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
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Select the member to mute")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("duration")
      .setDescription("Example: 30s, 5m, 1h, 1d")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for the mute")
      .setRequired(false)
  );

// ====================
// /BAN
// ====================

const banCommand = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Ban a member")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Select the member to ban")
      .setRequired(true)
  )
  .addStringOption((option) =>
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
  .addStringOption((option) =>
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
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Select the member to kick")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("reason")
      .setDescription("Reason for the kick")
      .setRequired(false)
  );

// ====================
// REGISTER COMMANDS
// ====================

client.once("ready", async () => {
  console.log("Logged in as " + client.user.tag);

  const rest = new REST({ version: "10" })
    .setToken(process.env.TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
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
          kickCommand.toJSON()
        ]
      }
    );

    console.log("Old commands removed!");
    console.log("All moderation commands registered!");
  } catch (error) {
    console.error(
      "Command registration failed:",
      error
    );
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
      const member =
        await interaction.guild.members.fetch(user.id);

      await member.timeout(null, "Manual unmute");

      await interaction.reply(
        user +
          " has been unmuted."
      );

      try {
        await user.send(
          "You were unmuted in " +
            SERVER_NAME +
            ".\n\n" +
            "A moderator removed your mute.\n\n" +
            "Server: " +
            INVITE_LINK
        );
      } catch (error) {
        console.log("Could not DM " + user.tag);
      }
    } catch (error) {
      console.error("Unmute error:", error);

      await interaction.reply({
        content: "I could not unmute that user.",
        ephemeral: true
      });
    }

    return;
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
      user +
        " has been warned.\n" +
        "Reason: " +
        reason +
        "\n" +
        "Total warnings: " +
        userWarnings.length
    );

    try {
      await user.send(
        "You received a warning in " +
          SERVER_NAME +
          ".\n\n" +
          "Reason: " +
          reason +
          "\n" +
          "Total warnings: " +
          userWarnings.length +
          "\n\n" +
          "Server: " +
          INVITE_LINK
      );
    } catch (error) {
      console.log("Could not DM " + user.tag);
    }

    return;
  }

  // ====================
  // /WARNINGS
  // ====================

  if (interaction.commandName === "warnings") {
    const user = interaction.options.getUser("user");
    const userWarnings = getWarnings(user.id);

    if (userWarnings.length === 0) {
      await interaction.reply(
        user + " has no warnings."
      );

      return;
    }

    let text =
      "Warnings for " +
      user +
      "\n\n";

    userWarnings.forEach((warning, index) => {
      text +=
        index +
        1 +
        ". " +
        warning.reason +
        "\n";
    });

    await interaction.reply(text);

    return;
  }

  // ====================
  // /MUTE
  // ====================

  if (interaction.commandName === "mute") {
    const user = interaction.options.getUser("user");
    const duration =
      interaction.options.getString("duration");

    const reason =
      interaction.options.getString("reason") ||
      "No reason provided";

    const match =
      duration.match(/^(\d+)(s|m|h|d)$/i);

    if (!match) {
      await interaction.reply({
        content:
          "Invalid duration. Use 30s, 5m, 1h, or 1d.",
        ephemeral: true
      });

      return;
    }

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    let milliseconds = 0;

    if (unit === "s") {
      milliseconds = amount * 1000;
    }

    if (unit === "m") {
      milliseconds = amount * 60 * 1000;
    }

    if (unit === "h") {
      milliseconds =
        amount * 60 * 60 * 1000;
    }

    if (unit === "d") {
      milliseconds =
        amount * 24 * 60 * 60 * 1000;
    }

    if (
      milliseconds >
      28 * 24 * 60 * 60 * 1000
    ) {
      await interaction.reply({
        content:
          "Maximum mute duration is 28 days.",
        ephemeral: true
      });

      return;
    }

    try {
      const member =
        await interaction.guild.members.fetch(user.id);

      await member.timeout(
        milliseconds,
        "Muted by " +
          interaction.user.tag +
          ": " +
          reason
      );

      await interaction.reply(
        user +
          " has been muted for " +
          duration +
          ".\n" +
          "Reason: " +
          reason
      );

      await sendMuteDM(
        user,
        duration,
        reason
      );

      setTimeout(() => {
        sendMuteOverDM(user);
      }, milliseconds);
    } catch (error) {
      console.error("Mute error:", error);

      await interaction.reply({
        content:
          "I could not mute that user.",
        ephemeral: true
      });
    }

    return;
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
      await user.send(
        "You were banned from " +
          SERVER_NAME +
          ".\n\n" +
          "Reason: " +
          reason +
          "\n\n" +
          "Server: " +
          INVITE_LINK
      );
    } catch (error) {
      console.log(
        "Could not DM " +
          user.tag +
          " before banning."
      );
    }

    try {
      await interaction.guild.members.ban(
        user.id,
        {
          reason: reason
        }
      );

      await interaction.reply(
        user +
          " has been banned.\n" +
          "Reason: " +
          reason
      );
    } catch (error) {
      console.error("Ban error:", error);

      await interaction.reply({
        content:
          "I could not ban that user.",
        ephemeral: true
      });
    }

    return;
  }

  // ====================
  // /UNBAN
  // ====================

  if (interaction.commandName === "unban") {
    const userId =
      interaction.options.getString("userid");

    try {
      await interaction.guild.members.unban(
        userId,
        "Unbanned by " +
          interaction.user.tag
      );

      await interaction.reply(
        "User " +
          userId +
          " has been unbanned."
      );

      try {
        const user =
          await client.users.fetch(userId);

        await user.send(
          "You were unbanned from " +
            SERVER_NAME +
            ".\n\n" +
            "A moderator has removed your ban.\n\n" +
            "Server: " +
            INVITE_LINK
        );
      } catch (error) {
        console.log(
          "Could not DM user " +
            userId
        );
      }
    } catch (error) {
      console.error("Unban error:", error);

      await interaction.reply({
        content:
          "I could not unban that user. Check the ID and make sure they are banned.",
        ephemeral: true
      });
    }

    return;
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
      await user.send(
        "You were kicked from " +
          SERVER_NAME +
          ".\n\n" +
          "Reason: " +
          reason +
          "\n\n" +
          "Server: " +
          INVITE_LINK
      );
    } catch (error) {
      console.log(
        "Could not DM " +
          user.tag +
          " before kicking."
      );
    }

    try {
      const member =
        await interaction.guild.members.fetch(user.id);

      await member.kick(reason);

      await interaction.reply(
        user +
          " has been kicked.\n" +
          "Reason: " +
          reason
      );
    } catch (error) {
      console.error("Kick error:", error);

      await interaction.reply({
        content:
          "I could not kick that user.",
        ephemeral: true
      });
    }

    return;
  }
});

// ====================
// LOGIN
// ====================

client.login(process.env.TOKEN);
