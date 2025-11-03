import { EventEmitter } from "events";
import type { BaileysEventMap } from "baileys";
import Pino from "pino";
import path from "path";
import qrcode from "qr-image";
import * as glob from "glob";
import fs from "fs";
import readline from "readline";
import open from "open";
import NodeCache from "@cacheable/node-cache";

import {
  ShardOptions,
  ShardConfig,
  ConnectionUpdate,
} from "../Types/index";

import ShardInfo from "../Utils/ShardInfo";
import ShardError from "../Utils/Error";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  PHONENUMBER_MCC,
  proto,
  getAggregateVotesInPollMessage,
  delay,
  encodeWAM,
  BinaryInfo,
  Boom,
} from "baileys";

const logger = Pino(
  {
    level: "info",
    formatters: { level: (label) => ({ level: label }) },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    base: { pid: false, hostname: false },
  },
  Pino.destination("./baileys-shard-logs.txt")
);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text: string) => new Promise<string>((resolve) => rl.question(text, resolve));

type AsyncFunction = (...args: any[]) => Promise<any>;

function wrapShardError(fn: AsyncFunction, shardId: string, code: string = "UNKNOWN"): AsyncFunction {
  return async (...args: any[]): Promise<any> => {
    try {
      return await fn(...args);
    } catch (err: any) {
      const shardErr = err instanceof ShardError ? err : new ShardError(err.message, code);
      throw shardErr;
    }
  };
}

export default class ShardManager extends EventEmitter {
  #sessionDirectory: string = "./sessions";
  #shards: Map<string, any> = new Map();
  #shardsInfo: Map<string, ShardInfo> = new Map();
  #stores: Map<string, any> = new Map();
  #msgRetryCounterCaches: Map<string, NodeCache> = new Map();
  private _patched?: boolean;

  constructor(config: ShardConfig = {}) {
    super();
    this.#sessionDirectory = config?.session || this.#sessionDirectory;
    this.cleanupCorruptSessions().catch((err) => {
      logger.error(`Failed to cleanup sessions on startup: ${err}`);
    });
  }

  async checkSessionStatus(sessionDirectory: string): Promise<{
    exists: boolean;
    registered: boolean;
    valid: boolean;
    reason?: string;
  }> {
    try {
      const credsPath = path.join(sessionDirectory, "creds.json");
      if (!fs.existsSync(sessionDirectory) || !fs.existsSync(credsPath)) {
        return { exists: false, registered: false, valid: false };
      }

      const raw = fs.readFileSync(credsPath, "utf8");
      let creds: any;
      try {
        creds = JSON.parse(raw);
      } catch (e) {
        return { exists: true, registered: false, valid: false, reason: "Corrupt JSON" };
      }

      const isRegistered = creds?.registered === true;
      const requiredFields = ["noiseKey", "pairingEphemeralKeyPair", "signedIdentityKey", "signedPreKey"];
      const hasRequiredFields = requiredFields.every((f) => creds?.[f]);

      return {
        exists: true,
        registered: isRegistered,
        valid: isRegistered && hasRequiredFields,
        reason: !hasRequiredFields ? "Missing required fields" : undefined,
      };
    } catch (err) {
      return { exists: true, registered: false, valid: false, reason: `Check error: ${err}` };
    }
  }

  async validateAndCleanSession(sessionDirectory: string): Promise<void> {
    try {
      const status = await this.checkSessionStatus(sessionDirectory);
      if (status.valid && status.registered) {
        logger.info(`Session is valid and registered, keeping: ${sessionDirectory}`);
        return;
      }
      if (status.exists && (!status.registered || !status.valid)) {
        logger.warn(`Cleaning invalid session (${status.reason}): ${sessionDirectory}`);
        fs.rmSync(sessionDirectory, { recursive: true, force: true });
      }
    } catch (err) {
      logger.error(`validateAndCleanSession error: ${err}`);
      if (fs.existsSync(sessionDirectory)) {
        fs.rmSync(sessionDirectory, { recursive: true, force: true });
      }
    }
  }

  async cleanupCorruptSessions(): Promise<void> {
    try {
      const sessions = glob.sync(this.#sessionDirectory + "/*");
      for (const sessionPath of sessions) {
        await this.validateAndCleanSession(sessionPath);
      }
    } catch (error) {
      logger.error(`Error during session cleanup: ${error}`);
    }
  }

  private async setupMobileRegistration(sock: any, phoneNumber: string) {
    const { registration } = sock.authState.creds || { registration: {} };

    if (!registration.phoneNumber) {
      registration.phoneNumber = phoneNumber;
    }

    const libPhonenumber = await import("libphonenumber-js");
    const phone = libPhonenumber.parsePhoneNumber(registration.phoneNumber);
    if (!phone?.isValid()) {
      throw new Error("Invalid phone number: " + registration.phoneNumber);
    }

    registration.phoneNumber = phone.format("E.164");
    registration.phoneNumberCountryCode = phone.countryCallingCode;
    registration.phoneNumberNationalNumber = phone.nationalNumber;
    const mcc = PHONENUMBER_MCC[phone.countryCallingCode];
    if (!mcc) {
      throw new Error("Could not find MCC for phone number: " + registration.phoneNumber);
    }
    registration.phoneNumberMobileCountryCode = mcc;

    const enterCode = async () => {
      try {
        const code = await question("Please enter the one time code:\n");
        const response = await sock.register(code.replace(/["']/g, "").trim());
        console.log("Successfully registered your phone number.");
        console.log(response);
        rl.close();
      } catch (error) {
        console.error("Failed to register. Please try again.\n", error);
        await askForOTP();
      }
    };

    const enterCaptcha = async () => {
      const response = await sock.requestRegistrationCode({ ...registration, method: "captcha" });
      const pathCaptcha = path.join(__dirname, `captcha_${Date.now()}.png`);
      fs.writeFileSync(pathCaptcha, Buffer.from(response.image_blob!, "base64"));
      open(pathCaptcha);
      const code = await question("Please enter the captcha code:\n");
      fs.unlinkSync(pathCaptcha);
      registration.captcha = code.replace(/["']/g, "").trim().toLowerCase();
    };

    const askForOTP = async () => {
      if (!registration.method) {
        await delay(2000);
        let code = await question('How would you like to receive the code? "sms" or "voice"\n');
        code = code.replace(/["']/g, "").trim().toLowerCase();
        if (code !== "sms" && code !== "voice") return await askForOTP();
        registration.method = code;
      }

      try {
        await sock.requestRegistrationCode(registration);
        await enterCode();
      } catch (error: any) {
        console.error("Failed to request code.\n", error);
        if (error?.reason === "code_checkpoint") await enterCaptcha();
        await askForOTP();
      }
    };

    askForOTP();
  }

  private async sendMessageWTyping(sock: any, msg: any, jid: string) {
    await sock.presenceSubscribe(jid);
    await delay(500);
    await sock.sendPresenceUpdate("composing", jid);
    await delay(2000);
    await sock.sendPresenceUpdate("paused", jid);
    await sock.sendMessage(jid, msg);
  }

  private setupShardEventHandlers(sock: any, id: string, saveCreds: any, options: ShardOptions) {
    this.#shards.set(id, sock);
    this.#shardsInfo.set(
      id,
      new ShardInfo({
        id,
        index: this.#shards.size,
        total: this.#shards.size,
        phoneNumber: options?.phoneNumber || null,
        status: "initializing",
      })
    );

    const useStore = !process.argv.includes("--no-store");
    const doReplies = !process.argv.includes("--no-reply");
    const usePairingCode = process.argv.includes("--use-pairing-code");
    const useMobile = process.argv.includes("--mobile");

    // === STORE & CACHE ===
    const msgRetryCounterCache = new NodeCache();
    this.#msgRetryCounterCaches.set(id, msgRetryCounterCache);

    const store = useStore ? makeInMemoryStore({ logger }) : undefined;
    if (store) {
      const storePath = `./baileys_store_${id}.json`;
      store.readFromFile(storePath);
      setInterval(() => store.writeToFile(storePath), 10_000);
      this.#stores.set(id, store);
      store.bind(sock.ev);
    }

    // === GET MESSAGE FOR POLL ===
    const getMessage = async (key: any): Promise<any> => {
      if (store) {
        const msg = await store.loadMessage(key.remoteJid!, key.id!);
        return msg?.message || undefined;
      }
      return proto.Message.fromObject({});
    };

    // === FORWARD EVENTS ===
    const forwardEvents: Array<keyof BaileysEventMap> = [
      "messages.upsert",
      "messages.update",
      "messages.delete",
      "messages.reaction",
      "message-receipt.update",
      "messaging-history.set",
      "chats.upsert",
      "chats.update",
      "chats.delete",
      "blocklist.set",
      "blocklist.update",
      "call",
      "contacts.upsert",
      "contacts.update",
      "groups.upsert",
      "groups.update",
      "group-participants.update",
      "presence.update",
    ];

    forwardEvents.forEach((ev) => {
      sock.ev.on(ev, (data: any) => {
        this.emit(ev, { shardId: id, sock, data });
      });
    });

    sock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
        this.emit("creds.update", { shardId: id, sock });
      } catch (err: any) {
        logger.error(`Failed to save creds for ${id}: ${err.message}`);
      }
    });

    sock.ev.on("connection.update", async (update: ConnectionUpdate) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const image = qrcode.imageSync(qr, { type: "png", size: 10, margin: 1 });
        this.emit("login.update", { shardId: id, state: "connecting", type: "qr", image });
      }

      if (connection === "open") {
        const isRegistered = sock.authState.creds.registered;
        if (!isRegistered) {
          logger.warn(`Shard ${id} connected but not registered`);
          this.emit("login.update", { shardId: id, state: "logged_out", reason: "Not registered" });
          return this.recreateShard({ id, ...options, clearSession: true });
        }
        this.#shardsInfo.get(id)?.update({ status: "connected" });
        this.emit("login.update", { shardId: id, state: "connected" });
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (!shouldReconnect) {
          this.#shardsInfo.get(id)?.update({ status: "logged_out" });
          this.emit("login.update", { shardId: id, state: "logged_out", reason: "Logged out" });
          return this.recreateShard({ id, ...options, clearSession: true });
        }

        this.#shardsInfo.get(id)?.update({ status: "disconnected" });
        this.emit("login.update", { shardId: id, state: "disconnected", reason: "Reconnecting..." });
        setTimeout(() => this.recreateShard({ id, ...options }), 5000);
      }
    });

    // === PAIRING CODE ===
    if (usePairingCode && !sock.authState.creds.registered && options.phoneNumber) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(options.phoneNumber);
          this.emit("login.update", { shardId: id, state: "connecting", type: "pairing", code });
        } catch (err: any) {
          this.emit("shard.error", { shardId: id, error: new ShardError(err.message, "PAIRING_FAILED") });
        }
      }, 3000);
    }

    // === MOBILE REGISTRATION ===
    if (useMobile && !sock.authState.creds.registered && options.phoneNumber) {
      setTimeout(() => this.setupMobileRegistration(sock, options.phoneNumber!), 3000);
    }

    // === AUTO REPLY (like example.ts) ===
    sock.ev.on("messages.upsert", async (m: any) => {
      if (m.type !== "notify" || !doReplies) return;
      for (const msg of m.messages) {
        if (!msg.key.fromMe && msg.key.remoteJid) {
          console.log(`Replying to ${msg.key.remoteJid}`);
          await sock.readMessages([msg.key]);
          await this.sendMessageWTyping(sock, { text: "Hello there!" }, msg.key.remoteJid);
        }
      }
    });

    // === POLL UPDATES ===
    sock.ev.on("messages.update", async (updates: any) => {
      for (const { key, update } of updates) {
        if (update.pollUpdates) {
          const pollCreation = await getMessage(key);
          if (pollCreation) {
            console.log("Poll update:", getAggregateVotesInPollMessage({ message: pollCreation, pollUpdates: update.pollUpdates }));
          }
        }
      }
    });
  }

  async createShard(options: ShardOptions = {}): Promise<{ id: string; sock: any }> {
    const baileys = await import("baileys");
    const { version } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join(".")}`);

    const id = options?.id || `shard-${this.#shards.size + 1}`;
    const sessionDirectory = path.join(this.#sessionDirectory, id);

    if (this.#shards.has(id)) {
      const info = this.#shardsInfo.get(id);
      if (info?.status === "connected" || info?.status === "initializing") {
        logger.info(`Shard ${id} already active`);
        return { id, sock: this.#shards.get(id) };
      }
    }

    const sessionStatus = await this.checkSessionStatus(sessionDirectory);
    if (sessionStatus.exists && !sessionStatus.valid) {
      await this.validateAndCleanSession(sessionDirectory);
    }

    let { state, saveCreds } = await useMultiFileAuthState(sessionDirectory);

    if (!state.creds.registered) {
      if (fs.existsSync(sessionDirectory)) {
        fs.rmSync(sessionDirectory, { recursive: true, force: true });
      }
      const fresh = await useMultiFileAuthState(sessionDirectory);
      state = fresh.state;
      saveCreds = fresh.saveCreds;
    }

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: !options?.phoneNumber,
      msgRetryCounterCache: this.#msgRetryCounterCaches.get(id) || new NodeCache(),
      generateHighQualityLinkPreview: true,
      ...options?.socket,
    });

    this.setupShardEventHandlers(sock, id, saveCreds, options);
    return { id, sock };
  }

  async recreateShard(options: {
    id: string;
    clearSession?: boolean;
    retryCount?: number;
    forceRecreate?: boolean;
  } & Partial<ShardOptions>): Promise<{ id: string; sock: any }> {
    // ... (same as before, no change needed)
    const { id, clearSession = false, retryCount = 0, forceRecreate = false, ...rest } = options;
    const maxRetries = 3;

    try {
      const sessionDirectory = path.join(this.#sessionDirectory, id);
      const oldSock = this.#shards.get(id);

      if (oldSock) {
        try {
          if (oldSock.ws) oldSock.ws.close();
          if (typeof oldSock.end === "function") oldSock.end();
        } catch (e) {}
        this.#shards.delete(id);
        this.#shardsInfo.delete(id);
      }

      if (clearSession || forceRecreate) {
        if (fs.existsSync(sessionDirectory)) {
          fs.rmSync(sessionDirectory, { recursive: true, force: true });
        }
      }

      await delay(2000);
      return await this.createShard({ id, ...rest });
    } catch (err: any) {
      if (retryCount < maxRetries) {
        await delay(5000 * (retryCount + 1));
        return this.recreateShard({ ...options, retryCount: retryCount + 1, clearSession: retryCount >= 2 });
      }
      throw new ShardError(`Recreate failed after ${maxRetries} attempts`, "RECREATE_FAILED");
    }
  }

  async connect(id: string): Promise<{ id: string; sock: any }> {
    return wrapShardError(this.recreateShard.bind(this), id)({ id });
  }

  async stopShard(id: string): Promise<boolean> {
    const sock = this.#shards.get(id);
    if (!sock) throw new ShardError(`Shard ${id} not found`, "SHARD_NOT_FOUND");

    try {
      if (sock.ws) sock.ws.close();
      if (typeof sock.end === "function") sock.end();
      this.#shards.delete(id);
      this.#shardsInfo.get(id)?.update({ status: "stopped" });
      return true;
    } catch (err: any) {
      throw new ShardError(`Stop failed: ${err.message}`, "STOP_FAILED");
    }
  }

  async loadAllShards(): Promise<string[]> {
    const sessions = glob.sync(this.#sessionDirectory + "/*");
    const ids: string[] = [];

    for (const dir of sessions) {
      const shardId = path.basename(dir);
      try {
        const { id } = await this.createShard({ id: shardId });
        ids.push(id);
      } catch (err: any) {
        this.emit("shard.error", { shardId, error: new ShardError(err.message, "LOAD_FAILED") });
      }
    }
    return ids;
  }

  socket(id: string): any | undefined {
    return this.#shards.get(id);
  }

  shard(id: string): EventEmitter | null {
    const sock = this.#shards.get(id);
    if (!sock) return null;
    const emitter = new EventEmitter();
    this.onAny((event, payload) => {
      if (payload?.shardId === id) emitter.emit(event, payload);
    });
    return emitter;
  }

  onAny(listener: (event: string, ...args: any[]) => void): void {
    if (this._patched) return;
    const origEmit = this.emit;
    this.emit = (event: string | symbol, ...args: any[]) => {
      listener(event as string, ...args);
      return origEmit.call(this, event, ...args);
    };
    this._patched = true;
  }

  getShardInfo(id: string): ShardInfo | null {
    return this.#shardsInfo.get(id) || null;
  }

  getAllShardInfo(): ShardInfo[] {
    return Array.from(this.#shardsInfo.values());
  }
}
