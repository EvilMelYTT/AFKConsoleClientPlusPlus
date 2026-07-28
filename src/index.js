const fs = require("fs");
const path = require("path");
const readline = require("readline");
const mineflayer = require("mineflayer");
require("dotenv").config();

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "config.json");

function timestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function logLine(message, label = "SYSTEM") {
  const parts = [`[${timestamp()}]`, `[${label}]`];
  parts.push(message);
  console.log(parts.join(" "));
}

function loadAccountsFromFile(filePath, defaultAuth) {
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.join(ROOT, filePath);

  if (!fs.existsSync(absolute)) {
    throw new Error(`Accounts file not found: ${absolute}`);
  }

  const lines = fs
    .readFileSync(absolute, "utf8")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  return lines.map((username) => ({
    username,
    auth: defaultAuth || "offline"
  }));
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      "Missing config.json."
    );
  }

  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const config = JSON.parse(raw);

  if (!config.server?.host) {
    throw new Error("config.server.host is required.");
  }
  if (config.accountsFile) {
    const parsed = loadAccountsFromFile(
      config.accountsFile,
      config.defaultAuth || "offline"
    );
    config.accounts = parsed;
  }

  if (!Array.isArray(config.accounts) || config.accounts.length === 0) {
    throw new Error("config.accounts must contain at least one account.");
  }

  return config;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createChatRelay(displayDelayMs = 3000) {
  const bufferedMessages = new Map();
  let flushTimer = null;

  function flush() {
    for (const entry of bufferedMessages.values()) {
      const suffix = entry.count > 1 ? ` (x${entry.count})` : "";
      logLine(`<${entry.username}> ${entry.message}${suffix}`, "CHAT");
    }
    bufferedMessages.clear();
    flushTimer = null;
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, displayDelayMs);
  }

  function handleChat(username, message) {
    const normalizedUser = String(username || "").trim();
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) return;

    const bufferKey = `${normalizedUser}|${normalizedMessage}`;
    const existing = bufferedMessages.get(bufferKey);
    if (existing) {
      existing.count += 1;
    } else {
      bufferedMessages.set(bufferKey, {
        username: normalizedUser,
        message: normalizedMessage,
        count: 1
      });
    }
    scheduleFlush();
  }

  return {
    handleChat
  };
}

function createJoinCoordinator(joinDelayMs) {
  let chain = Promise.resolve();
  let nextAllowedJoinAt = Date.now();
  let lastSuccessfulJoinAt = 0;

  function scheduleJoin(label, reason, earliestJoinAt, connectFn) {
    chain = chain
      .then(async () => {
        const now = Date.now();
        const retryReadyAt = Number(earliestJoinAt) || now;
        const successGateAt = lastSuccessfulJoinAt
          ? lastSuccessfulJoinAt + joinDelayMs
          : now;
        const scheduledAt = Math.max(nextAllowedJoinAt, retryReadyAt, successGateAt);
        const waitMs = Math.max(0, scheduledAt - now);

        if (waitMs > 0) {
          logLine(`Waiting ${waitMs}ms before ${reason}`, label);
          await sleep(waitMs);
        }

        nextAllowedJoinAt = Date.now() + joinDelayMs;
        connectFn();
      })
      .catch((err) => {
        logLine(`Join scheduling error: ${err.message}`, label);
      });

    return chain;
  }

  function markSuccessfulJoin() {
    lastSuccessfulJoinAt = Date.now();
    nextAllowedJoinAt = Math.max(nextAllowedJoinAt, lastSuccessfulJoinAt + joinDelayMs);
  }

  return {
    scheduleJoin,
    markSuccessfulJoin
  };
}

function randomYaw() {
  return Math.random() * Math.PI * 2;
}

function randomPitch() {
  return (Math.random() - 0.5) * 0.8;
}

function setupAfk(bot, afkConfig) {
  if (!afkConfig?.enabled) return () => {};

  const timers = [];

  if ((afkConfig.jumpEveryMs || 0) > 0) {
    timers.push(
      setInterval(() => {
        if (!bot.entity) return;
        bot.setControlState("jump", true);
        setTimeout(() => bot.setControlState("jump", false), 350);
      }, afkConfig.jumpEveryMs)
    );
  }

  if ((afkConfig.lookAroundEveryMs || 0) > 0) {
    timers.push(
      setInterval(() => {
        if (!bot.entity) return;
        bot.look(randomYaw(), randomPitch(), true).catch(() => {});
      }, afkConfig.lookAroundEveryMs)
    );
  }

  if ((afkConfig.chatEveryMs || 0) > 0 && afkConfig.chatMessage) {
    timers.push(
      setInterval(() => {
        try {
          bot.chat(afkConfig.chatMessage);
        } catch (_) {}
      }, afkConfig.chatEveryMs)
    );
  }

  return () => timers.forEach((timer) => clearInterval(timer));
}

function createAndManageBot(account, config, activeBots, joinCoordinator, chatRelay) {
  const label = account.username;
  let hasRunFirstJoinCommands = false;
  const reconnectDelayMs = Number(config.reconnectDelayMs) || 5000;

  const connect = (reason = "join attempt") => {
    logLine("Connecting...", label);

    const bot = mineflayer.createBot({
      host: config.server.host,
      port: config.server.port || 25565,
      username: account.username,
      auth: account.auth || "offline",
      version: config.server.version || false
    });

    let cleanupAfk = () => {};

    bot.once("spawn", async () => {
      logLine("Spawned in world", label);
      joinCoordinator.markSuccessfulJoin();
      activeBots.set(label, bot);
      cleanupAfk = setupAfk(bot, config.afk);

      if (
        !hasRunFirstJoinCommands &&
        Array.isArray(config.onSpawnCommands) &&
        config.onSpawnCommands.length
      ) {
        const delayMs = Number(config.onSpawnCommandDelayMs) || 3000;
        hasRunFirstJoinCommands = true;

        for (const command of config.onSpawnCommands) {
          if (typeof command !== "string" || !command.trim()) continue;
          try {
            await sleep(delayMs);
            bot.chat(command);
            logLine(`Sent: ${command}`, label);
          } catch (_) {}
        }
      }
    });

    bot.on("kicked", (reason) => {
      logLine(`Kicked: ${reason}`, label);
    });

    bot.on("error", (err) => {
      logLine(`Error: ${err.message}`, label);
    });

    bot.on("chat", (username, message) => {
      chatRelay.handleChat(username, message);
    });

    bot.on("end", () => {
      cleanupAfk();
      if (activeBots.get(label) === bot) {
        activeBots.delete(label);
      }
      logLine(`Disconnected. Queueing reconnect (base delay ${reconnectDelayMs}ms)...`, label);
      joinCoordinator.scheduleJoin(
        label,
        "reconnect",
        Date.now() + reconnectDelayMs,
        () => connect("reconnect")
      );
    });
  };

  joinCoordinator.scheduleJoin(label, "initial join", Date.now(), () => connect("initial join"));
}

function setupConsoleChat(activeBots, sendDelayMs) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let sendQueue = Promise.resolve();

  logLine(
    `Type a message and press Enter to send from connected bots (staggered ${sendDelayMs}ms per account).`
  );

  rl.on("line", (line) => {
    const message = String(line || "").trim();
    if (!message) return;

    sendQueue = sendQueue
      .then(async () => {
        const targets = Array.from(activeBots.entries());
        if (!targets.length) {
          logLine(`No active bots available for: ${message}`);
          return;
        }

        logLine(
          `Queueing command for ${targets.length} bot(s) with ${sendDelayMs}ms spacing: ${message}`
        );

        let sentCount = 0;
        for (let i = 0; i < targets.length; i += 1) {
          const [username, bot] = targets[i];
          try {
            bot.chat(message);
            sentCount += 1;
            logLine(`Sent command (${sentCount}/${targets.length}): ${message}`, username);
          } catch (err) {
            logLine(`Failed to send: ${err.message}`, username);
          }

          if (i < targets.length - 1) {
            await sleep(sendDelayMs);
          }
        }

        logLine(`Command completed: sent to ${sentCount}/${targets.length} bot(s): ${message}`);
      })
      .catch((err) => {
        logLine(`Command queue error: ${err.message}`);
      });
  });
}

async function main() {
  const config = loadConfig();
  const joinDelay = Number(config.joinDelayMs) || 3000;
  const consoleCommandDelayMs = Number(config.consoleCommandDelayMs) || 3000;
  const chatDisplayDelayMs = Number(config.chatDisplayDelayMs) || 3000;
  const activeBots = new Map();
  const joinCoordinator = createJoinCoordinator(joinDelay);
  const chatRelay = createChatRelay(chatDisplayDelayMs);

  logLine(
    `Starting ${config.accounts.length} bot(s) -> ${config.server.host}:${config.server.port || 25565} | version ${config.server.version || "auto"}`
  );
  logLine(`Join delay: ${joinDelay}ms | Reconnect: ${config.reconnectDelayMs || 5000}ms`);
  logLine(`Chat display delay: ${chatDisplayDelayMs}ms (duplicates combined)`);
  setupConsoleChat(activeBots, consoleCommandDelayMs);

  for (let i = 0; i < config.accounts.length; i += 1) {
    logLine(
      `Launching bot ${i + 1}/${config.accounts.length}`,
      config.accounts[i].username
    );
    createAndManageBot(config.accounts[i], config, activeBots, joinCoordinator, chatRelay);
  }
}

main().catch((err) => {
  logLine(err.message);
  process.exit(1);
});
