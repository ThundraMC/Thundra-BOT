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
  res.send("Discord bot is online!");
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
    GatewayIntentBits.MessageContent
  ]
});

const SERVER_ID = "1531632541377757224";
const SERVER_NAME = "Thundra SMP";
const INVITE_LINK = "https://discord.gg/aebQ8RNSgW";

// ====================
// DATA
// ====================

const spam = new Map();
const repeatedMessages = new Map();
const warnings = new Map();

// ====================
// GREETING RESPONSES
// ====================

const greetingResponses = [
  "hey there! wsp",
  "yooo what's good",
  "heyyy what's up?",
  "yo yo",
  "hiii :3 wsp",
  "ayeee what's good",
  "hello hello",
  "yooo wassup",
  "heyyy, how we doing?",
  "yo! what's poppin",
  "hey hey!",
  "sup bro",
  "hiiiii, what's up?",
  "yo what's good",
  "heyyy there!",
  "what's good?",
  "yooo, hey!",
  "hii! what's up?",
  "hey bro, wsp?",
  "yo yo, what's happening?"
];

const greetingWords = [
  "hi",
  "hii",
  "hiii",
  "hiiii",
  "hiiiii",
  "hiiiiii",
  "hello",
  "helloo",
  "hellooo",
  "helloooo",
  "hellooooo",
  "hey",
  "heyy",
  "heyyy",
  "heyyyy",
  "heyyyyy",
  "yo",
  "yoo",
  "yooo",
  "yoooo",
  "yooooo",
  "sup",
  "wassup",
  "whatsup",
  "what's up",
  "howdy"
];

// ====================
// GREETING DETECTOR
// ====================

function isBotGreeting(message) {
  let text = message.content.toLowerCase();

  const botWasMentioned = message.mentions.has(client.user);

  // Remove Discord mentions
  text = text.replace(/<@!?\d+>/g, " ");

  // Remove punctuation
  text = text.replace(/[.,!?;:'"`()[\]{}]/g, " ");

  // Normalize spaces
  text = text.replace(/\s+/g, " ").trim();

  // If bot was mentioned, only require a greeting
  if (botWasMentioned) {
    return greetingWords.some((greeting) => {
      return (
        text === greeting ||
        text.startsWith(greeting + " ") ||
        text.endsWith(" " + greeting) ||
        text.includes(" " + greeting + " ")
      );
    });
  }

  // Without a mention, require "thundra bot"
  if (!text.includes("thundra bot")) {
    return false;
  }

  // Remove bot name
  const withoutBotName = text
    .replace(/thundra bot/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return greetingWords.some((greeting) => {
    return (
      withoutBotName === greeting ||
      withoutBotName.startsWith(greeting + " ") ||
      withoutBotName.endsWith(" " + greeting) ||
      withoutBotName.includes(" " + greeting + " ")
    );
  });
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
    console.log("Could not DM " + user.tag);
  }
}

// ====================
// MUTE OVER DM
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
    console.log("Could not DM " + user.tag);
  }
}

// ====================
// MESSAGE HANDLER
// ====================

client.on("messageCreate", async (message) => {
  // DEBUG LOG
  console.log("MESSAGE RECEIVED:", message.content);

  if (message.author.bot) return;
  if (!message.member) return;

  // ====================
  // BOT GREETINGS
  // ====================

  if (isBotGreeting(message)) {
    const response =
      greetingResponses[
        Math.floor(Math.random() * greetingResponses.length)
      ];

    try {
      await message.reply(response);
    } catch (error) {
      console.error("Greeting reply error:", error);
    }

    return;
  }

  const now = Date.now();

  // ====================
  // 5 MESSAGES / 5 SECONDS
  // ====================

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
        "🚫 " +
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
      console.error(
        "Could not timeout user:",
        error
      );
    }
  }

  // ====================
  // 3 IDENTICAL MESSAGES
  // ====================

  const previous = repeatedMessages.get(
    message.author.id
  );

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

  const repeated = repeatedMessages.get(
    message.author.id
  );

  if (repeated.count >= 3) {
    try {
      await message.member.timeout(
        5 * 60 * 1000,
        "Repeated messages"
      );

      await message.channel.send(
        "🚫 " +
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
      console.error(
        "Could not timeout user:",
        error
      );
    }
  }
});

// ====================
// WARNINGS
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
  console.log(
    "Logged in as " + client.user.tag
  );

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
    console.log(
      "All moderation commands registered!"
    );
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

client.on(
  "interactionCreate",
  async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    // ====================
    // /UNMUTE
    // ====================

    if (interaction.commandName === "unmute") {
      const user =
        interaction.options.getUser("user");

      try {
        const member =
          await interaction.guild.members.fetch(
            user.id
          );

        await member.timeout(
          null,
          "Manual unmute"
        );

        await interaction.reply(
          "🔊 " +
            user +
            " has been unmuted."
        );

        try {
          await user.send(
            "🔊 You were unmuted in " +
              SERVER_NAME +
              ".\n\n" +
              "A moderator removed your mute.\n\n" +
              "Server: " +
              INVITE_LINK
          );
        } catch (error) {
          console.log(
            "Could not DM " + user.tag
          );
        }
      } catch (error) {
        console.error(
          "Unmute error:",
          error
        );

        await interaction.reply({
          content:
            "I could not unmute that user.",
          ephemeral: true
        });
      }

      return;
    }

    // ====================
    // /WARN
    // ====================

    if (interaction.commandName === "warn") {
      const user =
        interaction.options.getUser("user");

      const reason =
        interaction.options.getString(
          "reason"
        );

      const userWarnings =
        getWarnings(user.id);

      userWarnings.push({
        reason: reason,
        moderator: interaction.user.id,
        date: new Date()
      });

      warnings.set(
        user.id,
        userWarnings
      );

      await interaction.reply(
        "⚠️ " +
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
          "⚠️ You received a warning in " +
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
        console.log(
          "Could not DM " + user.tag
        );
      }

      return;
    }

    // ====================
    // /WARNINGS
    // ====================

    if (
      interaction.commandName ===
      "warnings"
    ) {
      const user =
        interaction.options.getUser("user");

      const userWarnings =
        getWarnings(user.id);

      if (userWarnings.length === 0) {
        await interaction.reply(
          "📋 " +
            user +
            " has no warnings."
        );

        return;
      }

      let text =
        "📋 Warnings for " +
        user +
        "\n\n";

      userWarnings.forEach(
        (warning, index) => {
          text +=
            index +
            1 +
            ". " +
            warning.reason +
            "\n";
        }
      );

      await interaction.reply(text);

      return;
    }

    // ====================
    // /MUTE
    // ====================

    if (interaction.commandName === "mute") {
      const user =
        interaction.options.getUser("user");

      const duration =
        interaction.options.getString(
          "duration"
        );

      const reason =
        interaction.options.getString(
          "reason"
        ) || "No reason provided";

      const match =
        duration.match(
          /^(\d+)(s|m|h|d)$/i
        );

      if (!match) {
        await interaction.reply({
          content:
            "Invalid duration. Use 30s, 5m, 1h, or 1d.",
          ephemeral: true
        });

        return;
      }

      const amount =
        parseInt(match[1]);

      const unit =
        match[2].toLowerCase();

      let milliseconds = 0;

      if (unit === "s") {
        milliseconds =
          amount * 1000;
      } else if (unit === "m") {
        milliseconds =
          amount * 60 * 1000;
      } else if (unit === "h") {
        milliseconds =
          amount * 60 * 60 * 1000;
      } else if (unit === "d") {
        milliseconds =
          amount * 24 * 60 * 60 * 1000;
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
            "Maximum mute duration is 28 days.",
          ephemeral: true
        });

        return;
      }

      try {
        const member =
          await interaction.guild.members.fetch(
            user.id
          );

        await member.timeout(
          milliseconds,
          "Muted by " +
            interaction.user.tag +
            ": " +
            reason
        );

        await interaction.reply(
          "🔇 " +
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
        console.error(
          "Mute error:",
          error
        );

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
      const user =
        interaction.options.getUser("user");

      const reason =
        interaction.options.getString(
          "reason"
        ) || "No reason provided";

      try {
        await user.send(
          "🔨 You were banned from " +
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
          "Could not DM " + user.tag
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
          "🔨 " +
            user +
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
            "I could not ban that user.",
          ephemeral: true
        });
      }

      return;
    }

    // ====================
    // /UNBAN
    // ====================

    if (
      interaction.commandName ===
      "unban"
    ) {
      const userId =
        interaction.options.getString(
          "userid"
        );

      try {
        await interaction.guild.members.unban(
          userId,
          "Unbanned by " +
            interaction.user.tag
        );

        await interaction.reply(
          "🔓 User " +
            userId +
            " has been unbanned."
        );

        try {
          const user =
            await client.users.fetch(
              userId
            );

          await user.send(
            "🔓 You were unbanned from " +
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
        console.error(
          "Unban error:",
          error
        );

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

    if (
      interaction.commandName ===
      "kick"
    ) {
      const user =
        interaction.options.getUser("user");

      const reason =
        interaction.options.getString(
          "reason"
        ) || "No reason provided";

      try {
        await user.send(
          "👢 You were kicked from " +
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
          "Could not DM " + user.tag
        );
      }

      try {
        const member =
          await interaction.guild.members.fetch(
            user.id
          );

        await member.kick(reason);

        await interaction.reply(
          "👢 " +
            user +
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
            "I could not kick that user.",
          ephemeral: true
        });
      }

      return;
    }
  }
);

// ====================
// LOGIN
// ====================

client.login(process.env.TOKEN);
