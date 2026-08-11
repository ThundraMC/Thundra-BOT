require("dotenv").config();

const express = require("express");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

// ============================
// WEB SERVER FOR RENDER
// ============================

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Thundra Bot is online!");
});

app.listen(PORT, () => {
  console.log("Web server running on port " + PORT);
});

// ============================
// DISCORD CLIENT
// ============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ============================
// SETTINGS
// ============================

const SERVER_ID = "1531632541377757224";
const SERVER_NAME = "Thundra SMP";
const INVITE_LINK = "https://discord.gg/aebQ8RNSgW";
const SERVER_IP = "ThundraPVP.aternos.me";

const MEMBER_ROLE_NAME = "👤・Member";
const ADMIN_ROLE_NAME = "🛡️・Admin";

// ============================
// STORAGE
// ============================

const spam = new Map();
const repeatedMessages = new Map();
const repeatedPings = new Map();
const warnings = new Map();
const afkUsers = new Map();

// ============================
// RANDOM RESPONSES
// ============================

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
  "I'm good! How are you?",
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
  "The Thundra SMP IP is **" + SERVER_IP + "**.",
  "Sure! The IP is **" + SERVER_IP + "**.",
  "Here you go: **" + SERVER_IP + "**",
  "Want to join? Use **" + SERVER_IP + "**.",
  "The Minecraft server address is **" + SERVER_IP + "**.",
  "Yep, the IP is **" + SERVER_IP + "**. Come join us!",
  "Server IP: **" + SERVER_IP + "**",
  "It's **" + SERVER_IP + "**. See you there!"
];

function randomResponse(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// ============================
// TEXT HELPERS
// ============================

function cleanText(text) {
  return text
    .toLowerCase()
    .replace(/<@!?\d+>/g, " ")
    .replace(/[.,!?;:'"`()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDisplayName(member, user) {
  if (member && member.nickname) {
    return member.nickname;
  }

  if (member && member.displayName) {
    return member.displayName;
  }

  if (user && user.globalName) {
    return user.globalName;
  }

  if (user) {
    return user.username;
  }

  return "Player";
}

// ============================
// EMOJI / CHARACTER SPAM
// ============================

function isCharacterSpam(text) {
  if (!text) return false;

  const cleaned = text.replace(/\s/g, "");

  if (cleaned.length < 10) {
    return false;
  }

  // Repeated letters, numbers, symbols, or Unicode characters
  if (/(.)\1{7,}/u.test(cleaned)) {
    return true;
  }

  // Check repeated Unicode characters including emojis
  const chars = Array.from(cleaned);

  let consecutive = 1;

  for (let i = 1; i < chars.length; i++) {
    if (chars[i] === chars[i - 1]) {
      consecutive++;

      if (consecutive >= 8) {
        return true;
      }
    } else {
      consecutive = 1;
    }
  }

  return false;
}

// ============================
// PATTERN SPAM
// ============================

function isPatternSpam(text) {
  if (!text) return false;

  const cleaned = text.replace(/\s/g, "");

  if (cleaned.length < 12) {
    return false;
  }

  const chars = Array.from(cleaned);

  // Detect patterns like:
  // HIHIHIHIHI
  // 😂🤣😂🤣😂🤣
  // 😣😣😣😣😣😣
  for (let patternLength = 1; patternLength <= 4; patternLength++) {
    if (chars.length < patternLength * 6) {
      continue;
    }

    const pattern = chars
      .slice(0, patternLength)
      .join("");

    let repeated = true;

    for (
      let i = patternLength;
      i < chars.length;
      i += patternLength
    ) {
      const current = chars
        .slice(i, i + patternLength)
        .join("");

      if (current !== pattern) {
        repeated = false;
        break;
      }
    }

    if (repeated) {
      return true;
    }
  }

  // Detect a large amount of emojis
  const emojiLike = chars.filter((char) => {
    const code = char.codePointAt(0);

    return (
      (code >= 0x1f300 && code <= 0x1faff) ||
      (code >= 0x2600 && code <= 0x27bf)
    );
  });

  if (emojiLike.length >= 15) {
    return true;
  }

  return false;
}

// ============================
// GREETING DETECTION
// ============================

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
    return new RegExp(
      "\\b" + word + "[a-z]*\\b",
      "i"
    ).test(text);
  });
}

// ============================
// HOW ARE YOU
// ============================

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

  return patterns.some((pattern) =>
    text.includes(pattern)
  );
}

// ============================
// IP DETECTION
// ============================

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

// ============================
// BOT NAME ONLY
// ============================

function isBotNameOnly(text) {
  return (
    text === "thundra bot" ||
    text === "thundrabot"
  );
}

// ============================
// MUTE DM
// ============================

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

// ============================
// MUTE END DM
// ============================

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

// ============================
// AUTO MUTE
// ============================

async function autoMute(member, reason) {
  try {
    await member.timeout(
      5 * 60 * 1000,
      reason
    );

    await sendMuteDM(
      member.user,
      "5 minutes",
      reason
    );

    setTimeout(() => {
      sendMuteOverDM(member.user);
    }, 5 * 60 * 1000);

    return true;
  } catch (error) {
    console.error("Auto mute error:", error);
    return false;
  }
}

// ============================
// MESSAGE HANDLER
// ============================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const text = cleanText(message.content);
  const now = Date.now();

  // ============================
  // REMOVE AFK WHEN THEY TALK
  // ============================

  if (afkUsers.has(message.author.id)) {
    afkUsers.delete(message.author.id);

    const authorName = getDisplayName(
      message.member,
      message.author
    );

    try {
      await message.channel.send(
        authorName + " is no longer AFK."
      );
    } catch (error) {
      console.log("Could not send AFK removal message.");
    }
  }

  // ============================
  // AFK PING SYSTEM
  // ============================

  if (message.mentions.users.size > 0) {
    for (const [userId] of message.mentions.users) {
      if (userId === client.user.id) {
        continue;
      }

      if (afkUsers.has(userId)) {
        const afkData = afkUsers.get(userId);

        let mentionedMember = null;
        let mentionedUser = null;

        try {
          mentionedMember =
            await message.guild.members.fetch(userId);
        } catch (error) {
          mentionedMember = null;
        }

        try {
          mentionedUser =
            await client.users.fetch(userId);
        } catch (error) {
          mentionedUser = null;
        }

        const afkName = getDisplayName(
          mentionedMember,
          mentionedUser
        );

        // Only the person who pinged them gets this
        try {
          await message.author.send(
            afkName +
              " is AFK: " +
              afkData.reason
          );
        } catch (error) {
          console.log(
            "Could not DM " +
              message.author.tag +
              " about AFK user."
          );
        }

        break;
      }
    }
  }

  // ============================
  // BOT IP
  // ============================

  if (isIpQuestion(text)) {
    await message.reply(
      randomResponse(ipResponses)
    );

    return;
  }

  // ============================
  // HOW ARE YOU
  // ============================

  if (isHowAreYou(text)) {
    await message.reply(
      randomResponse(howAreYouResponses)
    );

    return;
  }

  // ============================
  // BOT MENTION + GREETING
  // ============================

  const botWasMentioned =
    message.mentions.has(client.user);

  if (
    (text.includes("thundra bot") ||
      botWasMentioned) &&
    isGreeting(text)
  ) {
    await message.reply(
      randomResponse(greetingResponses)
    );

    return;
  }

  // ============================
  // BOT NAME ONLY / ONLY PING
  // ============================

  if (
    isBotNameOnly(text) ||
    (botWasMentioned && text === "")
  ) {
    await message.reply(
      randomResponse(botResponses)
    );

    return;
  }

  // ============================
  // REPEATED CHARACTER / EMOJI SPAM
  // ============================

  if (
    isCharacterSpam(message.content) ||
    isPatternSpam(message.content)
  ) {
    try {
      await message.delete();
    } catch (error) {
      console.log("Could not delete spam message.");
    }

    const muted = await autoMute(
      message.member,
      "Excessive repeated characters, emojis, or patterns"
    );

    if (muted) {
      await message.channel.send(
        message.author +
          " was muted for 5 minutes for excessive repeated characters, emojis, or patterns."
      );
    }

    spam.delete(message.author.id);
    repeatedMessages.delete(message.author.id);
    repeatedPings.delete(message.author.id);

    return;
  }

  // ============================
  // 5 MESSAGES / 5 SECONDS
  // ============================

  const messages =
    spam.get(message.author.id) || [];

  const recent = messages.filter(
    (time) => now - time < 5000
  );

  recent.push(now);

  spam.set(
    message.author.id,
    recent
  );

  if (recent.length >= 5) {
    const muted = await autoMute(
      message.member,
      "Spamming: 5 messages in 5 seconds"
    );

    if (muted) {
      await message.channel.send(
        message.author +
          " was muted for 5 minutes for spamming."
      );
    }

    spam.delete(message.author.id);
    repeatedMessages.delete(message.author.id);
    repeatedPings.delete(message.author.id);

    return;
  }

  // ============================
  // 3 IDENTICAL MESSAGES
  // ============================

  const previous =
    repeatedMessages.get(
      message.author.id
    );

  if (
    previous &&
    previous.content === message.content
  ) {
    previous.count++;
  } else {
    repeatedMessages.set(
      message.author.id,
      {
        content: message.content,
        count: 1
      }
    );
  }

  const repeated =
    repeatedMessages.get(
      message.author.id
    );

  if (repeated.count >= 3) {
    const muted = await autoMute(
      message.member,
      "Sending the same message 3 times in a row"
    );

    if (muted) {
      await message.channel.send(
        message.author +
          " was muted for 5 minutes for repeating the same message 3 times."
      );
    }

    spam.delete(message.author.id);
    repeatedMessages.delete(message.author.id);
    repeatedPings.delete(message.author.id);

    return;
  }

  // ============================
  // SAME PERSON PINGED 3 TIMES
  // ============================

  if (message.mentions.users.size > 0) {
    const mentionedUserIds =
      Array.from(
        message.mentions.users.keys()
      ).sort();

    const mentionKey =
      mentionedUserIds.join(",");

    const previousPing =
      repeatedPings.get(
        message.author.id
      );

    if (
      previousPing &&
      previousPing.mentionKey ===
        mentionKey
    ) {
      previousPing.count++;
    } else {
      repeatedPings.set(
        message.author.id,
        {
          mentionKey: mentionKey,
          count: 1
        }
      );
    }

    const pingData =
      repeatedPings.get(
        message.author.id
      );

    if (pingData.count >= 3) {
      const muted = await autoMute(
        message.member,
        "Mentioning the same person 3 times in a row"
      );

      if (muted) {
        await message.channel.send(
          message.author +
            " was muted for 5 minutes for repeatedly pinging the same person."
        );
      }

      spam.delete(message.author.id);
      repeatedMessages.delete(message.author.id);
      repeatedPings.delete(message.author.id);

      return;
    }
  } else {
    repeatedPings.delete(
      message.author.id
    );
  }
});

// ============================
// WARNINGS
// ============================

function getWarnings(userId) {
  return warnings.get(userId) || [];
}

// ============================
// /AFK
// ============================

const afkCommand =
  new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set yourself as AFK")
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Why are you AFK?")
        .setRequired(true)
    );

// ============================
// /UNMUTE
// ============================

const unmuteCommand =
  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove a timeout from a member")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Select the member to unmute")
        .setRequired(true)
    );

// ============================
// /WARN
// ============================

const warnCommand =
  new SlashCommandBuilder()
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

// ============================
// /WARNINGS
// ============================

const warningsCommand =
  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View a member's warnings")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Select the member")
        .setRequired(true)
    );

// ============================
// /MUTE
// ============================

const muteCommand =
  new SlashCommandBuilder()
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

// ============================
// /BAN
// ============================

const banCommand =
  new SlashCommandBuilder()
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

// ============================
// /UNBAN
// ============================

const unbanCommand =
  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user")
    .addStringOption((option) =>
      option
        .setName("userid")
        .setDescription("Discord user ID")
        .setRequired(true)
    );

// ============================
// /KICK
// ============================

const kickCommand =
  new SlashCommandBuilder()
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

// ============================
// REGISTER COMMANDS
// ============================

client.once("ready", async () => {
  console.log(
    "Logged in as " +
      client.user.tag
  );

  const rest =
    new REST({ version: "10" })
      .setToken(process.env.TOKEN);

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
          afkCommand.toJSON(),
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
    console.log("All commands registered!");
  } catch (error) {
    console.error(
      "Command registration failed:",
      error
    );
  }
});

// ============================
// COMMAND HANDLER
// ============================

client.on(
  "interactionCreate",
  async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    let member;

    try {
      member =
        await interaction.guild.members.fetch(
          interaction.user.id
        );
    } catch (error) {
      console.error(
        "Could not fetch command user:",
        error
      );

      await interaction.reply({
        content:
          "I couldn't check your server roles.",
        ephemeral: true
      });

      return;
    }

    const isAdminRole =
      member.roles.cache.some(
        (role) =>
          role.name === ADMIN_ROLE_NAME
      );

    const isMemberRole =
      member.roles.cache.some(
        (role) =>
          role.name === MEMBER_ROLE_NAME
      );

    // ============================
    // MEMBERS + ADMINS ONLY /AFK
    // ============================

    if (
      interaction.commandName !== "afk" &&
      (isAdminRole || isMemberRole)
    ) {
      await interaction.reply({
        content:
          "You can only use `/afk` with your current role.",
        ephemeral: true
      });

      return;
    }

    // ============================
    // /AFK
    // ============================

    if (
      interaction.commandName === "afk"
    ) {
      if (
        !isAdminRole &&
        !isMemberRole
      ) {
        await interaction.reply({
          content:
            "You need the 👤・Member or 🛡️・Admin role to use `/afk`.",
          ephemeral: true
        });

        return;
      }

      const reason =
        interaction.options.getString(
          "reason"
        );

      afkUsers.set(
        interaction.user.id,
        {
          reason: reason,
          timestamp: Date.now()
        }
      );

      // PRIVATE CONFIRMATION
      await interaction.reply({
        content:
          "You are now AFK: " +
          reason,
        ephemeral: true
      });

      // PUBLIC MESSAGE
      const displayName =
        getDisplayName(
          interaction.member,
          interaction.user
        );

      await interaction.channel.send(
        displayName +
          " is now AFK."
      );

      return;
    }

    // ============================
    // /UNMUTE
    // ============================

    if (
      interaction.commandName === "unmute"
    ) {
      const user =
        interaction.options.getUser("user");

      try {
        const targetMember =
          await interaction.guild.members.fetch(
            user.id
          );

        await targetMember.timeout(
          null,
          "Manual unmute"
        );

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
          console.log(
            "Could not DM " +
              user.tag
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

    // ============================
    // /WARN
    // ============================

    if (
      interaction.commandName === "warn"
    ) {
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
        moderator:
          interaction.user.id,
        date: new Date()
      });

      warnings.set(
        user.id,
        userWarnings
      );

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
        console.log(
          "Could not DM " +
            user.tag
        );
      }

      return;
    }

    // ============================
    // /WARNINGS
    // ============================

    if (
      interaction.commandName === "warnings"
    ) {
      const user =
        interaction.options.getUser("user");

      const userWarnings =
        getWarnings(user.id);

      if (userWarnings.length === 0) {
        await interaction.reply(
          user +
            " has no warnings."
        );

        return;
      }

      let text =
        "Warnings for " +
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

    // ============================
    // /MUTE
    // ============================

    if (
      interaction.commandName === "mute"
    ) {
      const user =
        interaction.options.getUser("user");

      const duration =
        interaction.options.getString(
          "duration"
        );

      const reason =
        interaction.options.getString(
          "reason"
        ) ||
        "No reason provided";

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
      }

      if (unit === "m") {
        milliseconds =
          amount *
          60 *
          1000;
      }

      if (unit === "h") {
        milliseconds =
          amount *
          60 *
          60 *
          1000;
      }

      if (unit === "d") {
        milliseconds =
          amount *
          24 *
          60 *
          60 *
          1000;
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
        const targetMember =
          await interaction.guild.members.fetch(
            user.id
          );

        await targetMember.timeout(
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

    // ============================
    // /BAN
    // ============================

    if (
      interaction.commandName === "ban"
    ) {
      const user =
        interaction.options.getUser("user");

      const reason =
        interaction.options.getString(
          "reason"
        ) ||
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

    // ============================
    // /UNBAN
    // ============================

    if (
      interaction.commandName === "unban"
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
          "User " +
            userId +
            " has been unbanned."
        );

        try {
          const user =
            await client.users.fetch(
              userId
            );

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

    // ============================
    // /KICK
    // ============================

    if (
      interaction.commandName === "kick"
    ) {
      const user =
        interaction.options.getUser("user");

      const reason =
        interaction.options.getString(
          "reason"
        ) ||
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
        const targetMember =
          await interaction.guild.members.fetch(
            user.id
          );

        await targetMember.kick(
          reason
        );

        await interaction.reply(
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

// ============================
// LOGIN
// ============================

client.login(process.env.TOKEN);

