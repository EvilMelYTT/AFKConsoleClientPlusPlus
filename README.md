# AFK Console Client

Minecraft AFK console client for offline accounts with register/login, commands, periodic commands, AFK movement, slot click/check, and single-account send.

## Setup

1. Install Node.js (16+ recommended).
2. Install dependencies:

```bash
npm install
```

1. Edit `config.json`:
  - Set `server.host`, `server.port`, `server.version`
  - Update spawn/periodic commands if needed
2. Put usernames in `usernames.txt` (one per line, or `username:password` for auth servers).

## Run

```bash
npm start
```

Or double-click `client.bat` on Windows — it checks for Node.js and installs dependencies automatically if missing.

## Console

- If your input starts with `.` it is a **local client command** (handled by this program).
- Anything else is sent as chat/command from all active bots, with `consoleCommandDelayMs` between each account.

## Local Commands

### `.send <username> <message>`

Send a message from only one account.

Example:

```text
.send Username1 hello from only this bot
```

### `.clickslot <slotNumber> [username]`

Click a slot in the currently open GUI menu window.

- With `username`: clicks for only that bot.
- Without `username`: clicks for all active bots with `clickSlotDelayMs` delay between bots.

Examples:

```text
.clickslot 13
.clickslot 13 Username1
```

### `.checkslot <slotNumber> [username]`

Read the item in a slot in the currently open GUI menu window.

- With `username`: checks only that bot.
- Without `username`: checks all active bots.

Examples:

```text
.checkslot 13
.checkslot 13 Username1
```

### `.rejoin <username>`

Force a bot to leave and rejoin.

- If connected: the bot disconnects, waits for join scheduling rules (`joinDelayMs`), then rejoins and runs `onSpawnCommands` again.
- If disconnected or never joined yet: it queues a join attempt and runs normal spawn flow on success.

Example:

```text
.rejoin Username1
```

### `.rejoinall`

Requests rejoin for every non-stopped bot.

### `.pause` / `.resume`

Halts or resumes the join queue.

- Active connections are not affected.

### `.stop <username>`

Disconnects a bot and disables auto-reconnect.

### `.start <username>`

Re-enables a stopped bot and queues it to connect.

### `.stopall`

Stops all bots and disables auto-reconnect across the board.

### `.startall`

Re-enables all stopped bots and queues them to connect.

### `.queue`

Shows all accounts waiting in the join queue.

### `.status`

Prints active, queued, stopped, and total account counts.

### `.list [active|stopped|all]`

Lists accounts by state. Defaults to `active`.

- `active`: currently connected accounts.
- `stopped`: accounts disabled via `.stop` or `.stopall`.
- `all`: both lists.

## Config Keys

- `server.host` - server IP/domain
- `server.port` - server port (default Minecraft is 25565)
- `server.version` - protocol version (`false` to auto-detect)
- `joinDelayMs` - minimum delay between each bot joining
- `reconnectDelayMs` - base delay before a disconnected bot attempts to reconnect
- `batchSize` - how many bots to launch before pausing for `batchPauseMs`
- `batchPauseMs` - how long to pause between batches
- `consoleCommandDelayMs` - delay between each bot for normal console input
- `clickSlotDelayMs` - delay between bots for `.clickslot` when no username is provided
- `chatDisplayDelayMs` - chat merge/display delay
- `afk.*` - AFK movement/chat behavior
- `onSpawnCommandDelayMs` - spacing between `onSpawnCommands`
- `onSpawnCommands[]` - commands sent after spawn (use `/login` to auto-inject the account's password)
- `periodicCommands.enabled` - enable periodic command runner
- `periodicCommands.intervalMs` - run frequency
- `periodicCommands.commandDelayMs` - delay between periodic commands per bot
- `periodicCommands.commands[]` - commands to run periodically
