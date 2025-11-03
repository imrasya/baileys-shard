# Baileys Shard
**The Ultimate Multi-Session WhatsApp Management Library for Node.js**

Manage multiple WhatsApp sessions with ease – **no browser automation**, **no Selenium**, just pure WebSocket + session management.  
Built for developers who want to **manage WhatsApp multi-session programmatically** using Baileys.

> ⭐️ Smart Session Protection | 🔥 Auto-Reconnection | 💬 Event Forwarding | 🧠 Built for Bots, API & Automation

***

[![NPM Version](https://img.shields.io/npm/v/baileys-shard?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/baileys-shard)
[![GitHub Stars](https://img.shields.io/github/stars/ztrdiamond/baileys-shard?style=for-the-badge&logo=github)](https://github.com/ztrdiamond/baileys-shard)
[![GitHub Repo Size](https://img.shields.io/github/repo-size/ztrdiamond/baileys-shard?style=for-the-badge&logo=github)](https://github.com/ztrdiamond/baileys-shard)
[![Last Commit](https://img.shields.io/github/last-commit/ztrdiamond/baileys-shard?style=for-the-badge&logo=git)](https://github.com/ztrdiamond/baileys-shard)
[![Commit Activity](https://img.shields.io/github/commit-activity/t/ztrdiamond/baileys-shard?style=for-the-badge&logo=github)](https://github.com/ztrdiamond/baileys-shard)

***

## 🚀 Features
ShardManager supports nearly **all Baileys features** – designed for both simple and advanced use cases

### ⚙️ Core Features
- ✅ **Lightweight** – No browser automation or Puppeteer, pure WebSocket communication
- ✅ **Multi-Session** – Manage hundreds of WhatsApp sessions in single application
- ✅ **Smart Protection** – Registered sessions are protected from auto-cleanup
- ✅ **Auto-Recovery** – Automatic reconnection on disconnect with retry mechanism

### 💬 Session Management
- 🧠 **Session Validation** – Automatically detect corrupt or invalid sessions
- 👥 **QR & Pairing Code** – Support both authentication methods
- 📝 **Event Forwarding** – Forward all Baileys events with shard identification
- 🎤 **Connection State** – Real-time connection status tracking for each shard

### 🧩 Advanced Features  
- 🔍 **Session Info** – Check registered, valid status and error reasons
- 👤 **Shard Management** – Create, stop, recreate, and load multiple shards
- 🧠 **Error Handling** – Comprehensive error codes and handling

### 🖼️ Developer Experience
- 🖼️ **Event Isolation** – Listen to events from specific shard or globally
- 🎨 **TypeScript Support** – Fully typed with JSDoc for better intellisense

# Table of contents
- [Getting Started](#getting-started)
   - [Install](#install) - How to Install ShardManager Library
   - [Basic Usage](#basic-usage) - Basic Usage for single session
   - [Advanced Usage](#advanced-usage) - Advanced Usage for multi-session
- [Core Function List](#core-function-list)
   - [constructor](#constructor) - Initialize ShardManager with config
   - [createShard](#createshard) - Create new shard or reuse existing registered session
   - [recreateShard](#recreateshard) - Recreate existing shard with session protection
   - [loadAllShards](#loadallshards) - Load all existing sessions from directory
- [Session Management](#session-management)
   - [getSessionInfo](#getsessioninfo) - Check session status from specific shard
   - [checkSessionStatus](#checksessionstatus) - Low-level session validation
   - [validateAndCleanSession](#validateandcleansession) - Validate and cleanup session if needed
   - [cleanupCorruptSessions](#cleanupcorruptsessions) - Auto cleanup all corrupt sessions
- [Shard Control](#shard-control)
   - [connect](#connect) - Connect to existing shard
   - [stopShard](#stopshard) - Stop specific shard
   - [socket](#socket) - Get Baileys socket instance from shard
   - [shard](#shard) - Get EventEmitter for specific shard
- [Information & Monitoring](#information--monitoring)
   - [getShardInfo](#getshardinfo) - Get runtime information from specific shard
   - [getAllShardInfo](#getallshardinfo) - Get runtime information of all shards
- [Event System](#event-system)
   - [Event Forwarding](#event-forwarding) - How event forwarding system works
   - [Connection Events](#connection-events) - Handle connection state changes
   - [Message Events](#message-events) - Handle message events from shards
   - [Error Events](#error-events) - Handle error events with error codes
- [Issues](#issues)

# Getting Started
## Install
To install ShardManager, you can use
- using NPM (Node Package Manager)<br><br>
   ```
   npm install baileys-shard
   ```
- Using Yarn<br><br>
   ```
   yarn add baileys-shard
   ```
[Back to the Table of contents](#table-of-contents)

## Basic Usage
- CommonJS<br><br>
   ```js
   const { ShardManager } = require("baileys-shard");
   
   (async function() {
       const manager = new ShardManager({
         session: "./sessions" // directory for session storage
       });
       
       // Create shard for single bot
       const { id, sock } = await manager.createShard({
         id: "main-bot",
         phoneNumber: "6281234567890" // optional for pairing code
       });
       
       console.log(`Shard ${id} created successfully!`);
   })()
   ```
- TypeScript/ESM<br><br>
   ```ts
   import { ShardManager } from "baileys-shard";

   const manager = new ShardManager({
     session: "./sessions"
   });

   // Listen connection updates (QR & Pairing via events)
   import qrcode from "qrcode-terminal";
   manager.on("login.update", ({ shardId, state, type, code }) => {
     if (state === "connecting") {
       if (type === "qr" && code) {
         console.log(`📱 QR untuk ${shardId} — scan di ponsel:`);
         qrcode.generate(code, { small: true });
       } else if (type === "pairing" && code) {
         console.log(`🔗 Pairing code untuk ${shardId}: ${code}`);
       }
     } else if (state === "connected") {
       console.log(`${shardId} successfully connected!`);
     }
   });
   
   // Create multiple shards
   const { id: bot1 } = await manager.createShard({ id: "bot-1", phoneNumber: "6281234567890" });
   const { id: bot2 } = await manager.createShard({ id: "bot-2", phoneNumber: "6281234567891" });
   ```
[Back to the Table of contents](#table-of-contents)

## Advanced Usage
Multi-session management with auto-load and event handling:

```js
import { ShardManager } from "baileys-shard";

const manager = new ShardManager({ session: "./sessions" });

// Load all existing sessions on startup
const existingShards = await manager.loadAllShards();
console.log("Loaded existing shards:", existingShards);

// Handle messages from all shards
manager.on("messages.upsert", async ({ shardId, sock, data }) => {
  for (const msg of data.messages) {
    if (!msg.key.fromMe && msg.message?.conversation) {
      await sock.sendMessage(msg.key.remoteJid, {
        text: `Hello from ${shardId}! You said: ${msg.message.conversation}`
      });
    }
  }
});

// Handle errors with retry logic
manager.on("shard.error", async ({ shardId, error }) => {
  console.error(`Error on ${shardId}:`, error.message);
  
  if (error.code === "RECREATE_FAILED") {
    // Implement custom retry logic
    setTimeout(() => {
      manager.recreateShard({ id: shardId, clearSession: true });
    }, 10000);
  }
});

// Create bot farm
for (let i = 1; i <= 10; i++) {
  await manager.createShard({
    id: `bot-${i}`,
    phoneNumber: `62812345678${i.toString().padStart(2, '0')}`
  });
}
```
[Back to the Table of contents](#table-of-contents)

# Core Function List
> Main functions for managing shard lifecycle and session management.

- ## constructor()
   Initialize ShardManager with session directory configuration.

   ```js
   const manager = new ShardManager({
     session: "./my-sessions" // default: "./sessions"
   });
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | config | `false` | `ShardConfig` | Configuration object with session directory property |
   | config.session | `false` | `string` | Path to directory for storing session files (default: "./sessions") |

   [Back to the Table of contents](#table-of-contents)

- ## createShard()
   Create new shard or reuse existing registered session with smart session protection.

   ```js
   // Basic create
   const { id, sock } = await manager.createShard();
   
   // With custom ID and phone number  
   const { id, sock } = await manager.createShard({
     id: "my-custom-bot",
     phoneNumber: "6281234567890",
     // Tidak perlu printQRInTerminal. Tangani QR & Pairing di event "login.update".
     socket: {
       // opsi baileys lainnya
     }
   });
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | options | `false` | `ShardOptions` | Configuration for shard creation |
   | options.id | `false` | `string` | Custom shard ID, auto-generated if not provided |
   | options.phoneNumber | `false` | `string` | Phone number for pairing code authentication |
   | options.socket | `false` | `object` | Additional Baileys socket configuration |

   **Return**: `Promise<{ id: string, sock: WASocket }>` - Shard ID and Baileys socket instance

   [Back to the Table of contents](#table-of-contents)

- ## recreateShard()
   Recreate existing shard with option to force clear session. This function has built-in protection for registered sessions.

   ```js
   // Recreate without clearing session (protect registered session)
   await manager.recreateShard({ id: "my-bot" });
   
   // Force recreate with session clear
   await manager.recreateShard({ 
     id: "my-bot", 
     clearSession: true,
     forceRecreate: true 
   });
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | options | `true` | `object` | Recreate options |
   | options.id | `true` | `string` | Shard ID to recreate |
   | options.clearSession | `false` | `boolean` | Force clear session files (default: false) |
   | options.forceRecreate | `false` | `boolean` | Force recreate even if session is valid (default: false) |
   | options.retryCount | `false` | `number` | Internal retry counter (don't set manually) |

   **Return**: `Promise<{ id: string, sock: WASocket }>` - New shard instance

   [Back to the Table of contents](#table-of-contents)

- ## loadAllShards()
   Load all existing sessions from session directory and create shard for each.

   ```js
   const shardIds = await manager.loadAllShards();
   console.log("Successfully loaded shards:", shardIds);
   // Output: ["bot-1", "bot-2", "main-session"]
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | none | `false` | `null` | - |

   **Return**: `Promise<string[]>` - Array of loaded shard IDs

   [Back to the Table of contents](#table-of-contents)

# Session Management
> Functions for managing session validation, cleanup, and protection.

- ## getSessionInfo()
   Check session status from specific shard with detailed information.

   ```js
   const info = await manager.getSessionInfo("my-bot");
   console.log(info);
   // Output: { exists: true, registered: true, valid: true }
   
   // If there's an issue
   // Output: { exists: true, registered: false, valid: false, reason: "Missing required fields" }
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | id | `true` | `string` | Shard ID to check session |

   **Return**: `Promise<{ exists: boolean, registered: boolean, valid: boolean, reason?: string }>` - Session status information

   [Back to the Table of contents](#table-of-contents)

- ## checkSessionStatus()
   Low-level function to validate session files directly.

   ```js
   const status = await manager.checkSessionStatus("./sessions/my-bot");
   if (status.valid && status.registered) {
     console.log("Session is good to use");
   } else {
     console.log("Session issue:", status.reason);
   }
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | sessionDirectory | `true` | `string` | Full path to session directory |

   **Return**: `Promise<{ exists: boolean, registered: boolean, valid: boolean, reason?: string }>` - Detailed session status

   [Back to the Table of contents](#table-of-contents)

- ## validateAndCleanSession()
   Validasi sesi dan auto-cleanup jika korup atau invalid, dengan logika proteksi sesi.

   ```js
   // Membersihkan hanya jika: JSON korup, atau sesi terdaftar namun invalid.
   // Sesi yang belum terdaftar (registered=false) tidak dihapus otomatis saat reconnect.
   await manager.validateAndCleanSession("./sessions/my-bot");
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | sessionDirectory | `true` | `string` | Full path to session directory for validation |

   **Return**: `Promise<void>` - No return value

   [Back to the Table of contents](#table-of-contents)

- ## cleanupCorruptSessions()
   Auto cleanup all corrupt sessions from session directory on startup.

   ```js
   // Usually called automatically in constructor
   await manager.cleanupCorruptSessions();
   console.log("Cleanup completed");
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | none | `false` | `null` | - |

   **Return**: `Promise<void>` - No return value

   [Back to the Table of contents](#table-of-contents)

# Shard Control  
> Functions for controlling shard lifecycle and accessing shard instances.

- ## connect()
   Connect to existing shard or recreate if not exists.

   ```js
   const { id, sock } = await manager.connect("my-bot");
   console.log(`Connected to shard: ${id}`);
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | id | `true` | `string` | Shard ID to connect |

   **Return**: `Promise<{ id: string, sock: WASocket }>` - Shard connection info

   [Back to the Table of contents](#table-of-contents)

- ## stopShard()
   Stop specific shard and cleanup resources.

   ```js
   const success = await manager.stopShard("my-bot");
   if (success) {
     console.log("Shard stopped successfully");
   }
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | id | `true` | `string` | Shard ID to stop |

   **Return**: `Promise<boolean>` - Success status

   [Back to the Table of contents](#table-of-contents)

- ## socket()
   Get Baileys socket instance from specific shard for direct interaction.

   ```js
   const sock = manager.socket("my-bot");
   if (sock) {
     await sock.sendMessage("6281234567890@s.whatsapp.net", {
       text: "Hello from direct socket access!"
     });
   }
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | id | `true` | `string` | Shard ID |

   **Return**: `WASocket | undefined` - Baileys socket instance or undefined if not exists

   [Back to the Table of contents](#table-of-contents)

- ## shard()
   Get EventEmitter to listen events from specific shard only.

   ```js
   const shardEmitter = manager.shard("my-bot");
   if (shardEmitter) {
     shardEmitter.on("messages.upsert", ({ data }) => {
       console.log("Message only from my-bot:", data.messages);
     });
   }
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | id | `true` | `string` | Shard ID |

   **Return**: `EventEmitter | null` - EventEmitter instance or null if shard doesn't exist

   [Back to the Table of contents](#table-of-contents)

# Information & Monitoring
> Functions for monitoring shard status and runtime information.

- ## getShardInfo()
   Get runtime information from specific shard like status, index, and metadata.

   ```js
   const info = manager.getShardInfo("my-bot");
   console.log(info);
   // Output: { id: "my-bot", index: 1, total: 5, phoneNumber: "6281234567890", status: "connected" }
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | id | `true` | `string` | Shard ID |

   **Return**: `ShardInfo | null` - Runtime shard information or null if not exists

   [Back to the Table of contents](#table-of-contents)

- ## getAllShardInfo()
   Get runtime information from all active shards.

   ```js
   const allInfo = manager.getAllShardInfo();
   console.log(`Total active shards: ${allInfo.length}`);
   allInfo.forEach(info => {
     console.log(`${info.id}: ${info.status}`);
   });
   ```
   | Param | Require | Type | Description |  
   | --- | --- | --- | --- |  
   | none | `false` | `null` | - |

   **Return**: `ShardInfo[]` - Array of all shard runtime information

   [Back to the Table of contents](#table-of-contents)

# Event System
> Comprehensive event handling system with shard identification and error management.

## Event Forwarding
ShardManager automatically forwards all Baileys events with additional `shardId` for identification.

### Connection Events
Handle connection state changes for each shard:

```js
const qrcode = require("qrcode-terminal");

manager.on("login.update", ({ shardId, state, type, code }) => {
  switch (state) {
    case "connecting":
      if (type === "qr" && code) {
        console.log(`📱 QR siap untuk ${shardId}`);
        qrcode.generate(code, { small: true });
      } else if (type === "pairing" && code) {
        console.log(`🔗 Pairing code untuk ${shardId}: ${code}`);
      }
      break;
      
    case "connected":
      console.log(`✅ ${shardId} successfully connected`);
      break;
      
    case "disconnected":
      console.log(`⚠️ ${shardId} disconnected, akan mencoba reconnect (guard mencegah duplikasi)`);
      break;
      
    case "logged_out":
      console.log(`❌ ${shardId} logged out, session cleared`);
      break;
      
    case "creds_saved":
      console.log(`💾 Credentials ${shardId} saved`);
      break;
  }
});
```

| Property | Type | Description |  
| --- | --- | --- |  
| shardId | `string` | ID of shard experiencing update |
| state | `string` | Connection state: "connecting", "connected", "disconnected", "logged_out", "creds_saved" |
| type | `string` | Auth type: "qr" or "pairing" (only when connecting) |
| code | `string` | QR string (when type="qr") or pairing code (type="pairing") |

[Back to the Table of contents](#table-of-contents)

### Message Events
Handle message events from all shards with shard identification:

```js
manager.on("messages.upsert", async ({ shardId, sock, data }) => {
  console.log(`📨 New messages from ${shardId}`);
  
  for (const msg of data.messages) {
    if (!msg.key.fromMe && msg.message?.conversation) {
      // Reply using sock from event
      await sock.sendMessage(msg.key.remoteJid, {
        text: `Auto reply from ${shardId}: ${msg.message.conversation}`
      });
    }
  }
});

// Message update events
manager.on("messages.update", ({ shardId, data }) => {
  console.log(`📝 Message updates from ${shardId}:`, data);
});

// Message delete events  
manager.on("messages.delete", ({ shardId, data }) => {
  console.log(`🗑️ Message deleted in ${shardId}:`, data);
});
```

| Property | Type | Description |  
| --- | --- | --- |  
| shardId | `string` | ID of shard sending event |
| sock | `WASocket` | Baileys socket instance for reply/interaction |
| data | `object` | Original Baileys event data |

[Back to the Table of contents](#table-of-contents)

### Error Events
Handle errors with comprehensive error codes:

```js
manager.on("shard.error", ({ shardId, error }) => {
  console.error(`❌ Error on ${shardId}:`, error.message);
  
  // Handle based on error code
  switch (error.code) {
    case "CREATE_FAILED":
      console.log("Failed to create shard, check session directory");
      break;
      
    case "RECREATE_FAILED":
      console.log("Failed to recreate shard, implementing retry...");
      setTimeout(() => {
        manager.recreateShard({ id: shardId, clearSession: true });
      }, 10000);
      break;
      
    case "CREDS_SAVE_FAILED":
      console.log("Failed to save credentials, check file permissions");
      break;
      
    case "PAIRING_FAILED":
      console.log("Pairing failed, check phone number format");
      break;
      
    case "SHARD_NOT_FOUND":
      console.log("Shard not found, creating new one...");
      manager.createShard({ id: shardId });
      break;
      
    case "CONNECT_FAILED":
    case "STOP_FAILED":
    case "LOAD_FAILED":
    default:
      console.log("General error, check logs for details");
  }
});
```

**Available Error Codes:**
- `CREATE_FAILED` - Failed when creating shard
- `RECREATE_FAILED` - Failed when recreating shard  
- `CREDS_SAVE_FAILED` - Failed to save credentials
- `PAIRING_FAILED` - Failed pairing process
- `SHARD_NOT_FOUND` - Shard not found
- `CONNECT_FAILED` - Failed to connect to shard
- `STOP_FAILED` - Failed to stop shard
- `LOAD_FAILED` - Failed to load sessions
- `NO_SESSIONS` - No sessions found

[Back to the Table of contents](#table-of-contents)

### Other Baileys Events  
All other Baileys events are also forwarded with the same format:

```js
// Chat events
manager.on("chats.upsert", ({ shardId, data }) => {
  console.log(`New chats in ${shardId}:`, data.length);
});

manager.on("chats.update", ({ shardId, data }) => {
  console.log(`Chat updates in ${shardId}:`, data.length);
});

// Contact events
manager.on("contacts.upsert", ({ shardId, data }) => {
  console.log(`New contacts in ${shardId}:`, data.length);
});

// Group events
manager.on("groups.upsert", ({ shardId, data }) => {
  console.log(`New groups in ${shardId}:`, data.length);
});

manager.on("group-participants.update", ({ shardId, data }) => {
  console.log(`Group participant update in ${shardId}:`, data);
});

// Presence events
manager.on("presence.update", ({ shardId, data }) => {
  console.log(`Presence update in ${shardId}:`, data);
});

// Call events
manager.on("call", ({ shardId, data }) => {
  console.log(`Incoming call in ${shardId}:`, data);
});
```

**Complete Event List:**
- `messages.upsert` - New messages received
- `messages.update` - Message status updates
- `messages.delete` - Messages deleted
- `messages.reaction` - Message reactions
- `message-receipt.update` - Read receipts
- `messaging-history.set` - Message history loaded
- `chats.upsert` - New chats
- `chats.update` - Chat updates  
- `chats.delete` - Chats deleted
- `contacts.upsert` - New contacts
- `contacts.update` - Contact updates
- `groups.upsert` - New groups
- `groups.update` - Group updates
- `group-participants.update` - Group member changes
- `presence.update` - Online/offline status
- `call` - Incoming calls
- `blocklist.set` - Blocklist loaded
- `blocklist.update` - Blocklist updates
- `creds.update` - Credentials updated

[Back to the Table of contents](#table-of-contents)

# Issues
Feel free to open an issue, I hope this documentation can help you maximally and make it easier for you to use this package.

# Contributing
If you would like to contribute to this package, I would really appreciate it. You can see the [contribution guidelines here](https://github.com/ZanixonGroup/baileys-shard/blob/main/CONTRIBUTING.md) to contribute in the best way possible.
