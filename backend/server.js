const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
require("dotenv").config();
const { parsePhoneInput, trimValue } = require("./phone");
const { findUserByPhone, migrateUserPhonesToE164 } = require("./users");
const { getBearerToken, hashPassword, signJwt, verifyJwt, verifyPassword } = require("./auth");

const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || process.env.CORS_ORIGIN || "*";
const JWT_SECRET = process.env.JWT_SECRET;
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"]
  }
});

async function configureRedisAdapter() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;

  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  console.log("Socket.IO Redis adapter enabled");
}

app.use(cors());
app.use(express.json());

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
);

const chatSchema = new mongoose.Schema(
  {
    participants: [{ type: String, required: true }],
    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date },
    deletedBy: [{ type: String, default: [] }],
    deleteHistory: { type: Map, of: Date, default: {} }
  },
  { timestamps: true }
);

const messageSchema = new mongoose.Schema(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true, index: true },
    senderPhone: { type: String, required: true },
    text: { type: String, required: true },
    isEdited: { type: Boolean, default: false },
    isDeletedForEveryone: { type: Boolean, default: false },
    deletedFor: [{ type: String, default: [] }]
  },
  { timestamps: true }
);

chatSchema.index({ participants: 1 });
messageSchema.index({ createdAt: 1 });

const User = mongoose.model("User", userSchema);
const Chat = mongoose.model("Chat", chatSchema);
const Message = mongoose.model("Message", messageSchema);

function requirePhone(phone, res) {
  const parsed = parsePhoneInput(phone);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return null;
  }
  return parsed.phone;
}

function getDeletedAt(chat, phone) {
  if (!chat || !chat.deleteHistory) return null;
  if (typeof chat.deleteHistory.get === "function") {
    return chat.deleteHistory.get(phone);
  }
  return chat.deleteHistory[phone];
}

function formatMessage(messageDoc) {
  return {
    id: messageDoc._id.toString(),
    chatId: messageDoc.chatId.toString(),
    senderPhone: messageDoc.senderPhone,
    text: messageDoc.isDeletedForEveryone ? "This message deleted" : messageDoc.text,
    createdAt: messageDoc.createdAt,
    isEdited: messageDoc.isEdited || false,
    isDeletedForEveryone: messageDoc.isDeletedForEveryone || false
  };
}

async function getNameMap(phones) {
  const uniquePhones = [...new Set((phones || []).map((p) => trimValue(p)).filter(Boolean))];
  if (!uniquePhones.length) return {};
  const users = await User.find({ phone: { $in: uniquePhones } }).lean();
  return users.reduce((acc, user) => {
    acc[user.phone] = user.name;
    return acc;
  }, {});
}

async function validateRegisteredPhone(phone) {
  const user = await findUserByPhone(User, phone);
  if (!user) {
    throw new Error(`User with phone ${phone} is not registered`);
  }
}

function createAuthResponse(user) {
  const token = signJwt({ phone: user.phone, name: user.name }, JWT_SECRET);
  return {
    user: { phone: user.phone, name: user.name },
    token
  };
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    const payload = verifyJwt(token, JWT_SECRET);
    const phone = requirePhone(payload.phone, res);
    if (!phone) return;

    const user = await findUserByPhone(User, phone);
    if (!user) {
      return res.status(401).json({ error: "User account no longer exists" });
    }

    req.user = { phone: user.phone, name: user.name };
    return next();
  } catch (error) {
    return res.status(401).json({ error: error.message || "Authentication failed" });
  }
}

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/api/users/register", async (req, res) => {
  try {
    const phone = requirePhone(req.body.phone, res);
    if (!phone) return;

    const name = trimValue(req.body.name) || phone;
    const passwordHash = hashPassword(req.body.password);

    const existing = await findUserByPhone(User, phone);
    if (existing) {
      return res.status(409).json({
        error: "An account with this phone number already exists. Please sign in instead."
      });
    }

    const user = await User.create({ phone, name, passwordHash });
    return res.status(201).json(createAuthResponse(user));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: "An account with this phone number already exists. Please sign in instead."
      });
    }
    return res.status(500).json({ error: error.message || "Registration failed" });
  }
});

app.post("/api/users/login", async (req, res) => {
  try {
    const phone = requirePhone(req.body.phone, res);
    if (!phone) return;

    let user = await findUserByPhone(User, phone);
    if (!user) {
      return res.status(404).json({ error: `User with phone ${phone} is not registered` });
    }
    if (!user.passwordHash) {
      return res.status(401).json({ error: "This account needs to be re-created with a password" });
    }
    if (!verifyPassword(req.body.password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid phone number or password" });
    }

    if (user.phone !== phone) {
      try {
        await User.updateOne({ _id: user._id }, { $set: { phone } });
        user = { ...user, phone };
      } catch (error) {
        if (error.code === 11000) {
          return res.status(409).json({
            error: "An account with this phone number already exists. Please sign in instead."
          });
        }
        throw error;
      }
    }

    // Prevent concurrent login if user is already connected
    if (!req.body.verifyOnly) {
      const activeSockets = await io.in(`user:${phone}`).fetchSockets();
      if (activeSockets.length > 0) {
        return res.status(403).json({ error: "This account is already logged in on another device or tab" });
      }
    }

    return res.status(200).json(createAuthResponse(user));
  } catch (error) {
    return res.status(500).json({ error: error.message || "Login failed" });
  }
});

app.get("/api/users/me", requireAuth, (req, res) => {
  return res.status(200).json({ user: req.user });
});

app.get("/api/chats", requireAuth, async (req, res) => {
  try {
    const phone = req.user.phone;

    const chats = await Chat.find({
      participants: phone,
      deletedBy: { $ne: phone }
    }).sort({ updatedAt: -1 }).lean();
    const nameMap = await getNameMap(chats.flatMap((chat) => chat.participants));
    const chatsWithPreviews = await Promise.all(chats.map(async (chat) => {
      const deletedAt = getDeletedAt(chat, phone);
      const query = {
        chatId: chat._id,
        deletedFor: { $ne: phone },
        $or: [
          { isDeletedForEveryone: { $ne: true } },
          { isDeletedForEveryone: true, senderPhone: { $ne: phone } }
        ]
      };
      if (deletedAt) {
        query.createdAt = { $gt: new Date(deletedAt) };
      }
      const latestMsg = await Message.findOne(query).sort({ createdAt: -1 }).lean();
      return {
        id: chat._id.toString(),
        participants: chat.participants,
        participantNames: chat.participants.reduce((acc, participant) => {
          acc[participant] = nameMap[participant] || participant;
          return acc;
        }, {}),
        lastMessage: latestMsg ? (latestMsg.isDeletedForEveryone ? "This message deleted" : latestMsg.text) : "",
        lastMessageAt: latestMsg ? latestMsg.createdAt : null
      };
    }));

    return res.status(200).json({ chats: chatsWithPreviews });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to load chats" });
  }
});

app.post("/api/chats", requireAuth, async (req, res) => {
  try {
    const phone = req.user.phone;

    const peerPhone = requirePhone(req.body.peerPhone, res);
    if (!peerPhone) return;

    if (phone === peerPhone) {
      return res.status(400).json({ error: "Cannot create a chat with your own number" });
    }

    await validateRegisteredPhone(phone);
    await validateRegisteredPhone(peerPhone);

    const participants = [phone, peerPhone].sort();
    let chat = await Chat.findOne({ participants });
    if (!chat) {
      chat = await Chat.create({ participants });
    } else {
      chat = await Chat.findOneAndUpdate(
        { participants },
        { $pull: { deletedBy: phone } },
        { new: true }
      );
    }

    const deletedAt = getDeletedAt(chat, phone);
    const query = {
      chatId: chat._id,
      deletedFor: { $ne: phone },
      $or: [
        { isDeletedForEveryone: { $ne: true } },
        { isDeletedForEveryone: true, senderPhone: { $ne: phone } }
      ]
    };
    if (deletedAt) {
      query.createdAt = { $gt: new Date(deletedAt) };
    }
    const latestMsg = await Message.findOne(query).sort({ createdAt: -1 }).lean();
    return res.status(200).json({
      chat: {
        id: chat._id.toString(),
        participants: chat.participants,
        lastMessage: latestMsg ? (latestMsg.isDeletedForEveryone ? "This message deleted" : latestMsg.text) : "",
        lastMessageAt: latestMsg ? latestMsg.createdAt : null
      }
    });
  } catch (error) {
    if (error.message.includes("not registered")) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message || "Failed to create chat" });
  }
});

app.get("/api/chats/:chatId/messages", requireAuth, async (req, res) => {
  try {
    const chatId = trimValue(req.params.chatId);
    const phone = req.user.phone;
    if (!chatId) {
      return res.status(400).json({ error: "chatId is required" });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat || !chat.participants.includes(phone) || (chat.deletedBy && chat.deletedBy.includes(phone))) {
      return res.status(404).json({ error: "Chat not found for this user" });
    }

    const deletedAt = getDeletedAt(chat, phone);
    const query = {
      chatId,
      deletedFor: { $ne: phone },
      $or: [
        { isDeletedForEveryone: { $ne: true } },
        { isDeletedForEveryone: true, senderPhone: { $ne: phone } }
      ]
    };
    if (deletedAt) {
      query.createdAt = { $gt: new Date(deletedAt) };
    }

    const messages = await Message.find(query).sort({ createdAt: 1 }).lean();
    const nameMap = await getNameMap(messages.map((message) => message.senderPhone));
    return res.status(200).json({
      messages: messages.map((message) => ({
        ...formatMessage(message),
        senderName: nameMap[message.senderPhone] || message.senderPhone
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to load messages" });
  }
});

app.delete("/api/chats/:chatId", requireAuth, async (req, res) => {
  try {
    const chatId = trimValue(req.params.chatId);
    const phone = req.user.phone;

    console.log(`[Delete Chat] Request to delete chat: ${chatId} by user: ${phone}`);

    if (!chatId) {
      return res.status(400).json({ error: "chatId query parameter is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      console.warn(`[Delete Chat] Invalid chatId format: ${chatId}`);
      return res.status(400).json({ error: "Invalid chat ID format" });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      console.warn(`[Delete Chat] Chat not found: ${chatId}`);
      return res.status(404).json({ error: "Chat not found" });
    }

    if (!chat.participants.includes(phone)) {
      console.warn(`[Delete Chat] Unauthorized delete request by user: ${phone} for chat: ${chatId}`);
      return res.status(403).json({ error: "You are not authorized to delete this chat" });
    }

    // Add user to deletedBy array if not already present
    if (!chat.deletedBy) {
      chat.deletedBy = [];
    }
    
    if (!chat.deletedBy.includes(phone)) {
      chat.deletedBy.push(phone);
    }

    // Record the deletion timestamp
    if (!chat.deleteHistory) {
      chat.deleteHistory = new Map();
    }
    chat.deleteHistory.set(phone, new Date());

    // Check if all participants have deleted the chat
    const allDeleted = chat.participants.every(p => chat.deletedBy.includes(p));

    if (allDeleted) {
      // Hard delete from DB since both users deleted it
      await Chat.deleteOne({ _id: chatId });
      await Message.deleteMany({ chatId });
      console.log(`[Delete Chat] All participants deleted. Hard deleted chat: ${chatId}`);
    } else {
      // Soft delete: just update the deletedBy field in Mongo
      await chat.save();
      console.log(`[Delete Chat] Soft deleted chat: ${chatId} for user: ${phone}`);
    }

    // Only notify the deleting user to update their UI
    io.to(`user:${phone}`).emit("chat_updated", { chatId, deleted: true });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(`[Delete Chat] Error deleting chat:`, error);
    return res.status(500).json({ error: error.message || "Failed to delete chat" });
  }
});

const frontendDist = path.join(__dirname, "../frontend/dist");
app.use(express.static(frontendDist));

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const payload = verifyJwt(token, JWT_SECRET);
    const parsed = parsePhoneInput(payload.phone);
    if (!parsed.ok) {
      return next(new Error(parsed.error));
    }

    const user = await findUserByPhone(User, parsed.phone);
    if (!user) {
      return next(new Error("User account no longer exists"));
    }

    socket.data.phone = user.phone;
    socket.data.name = user.name;
    return next();
  } catch (error) {
    return next(new Error(error.message || "Authentication failed"));
  }
});

io.on("connection", (socket) => {
  const phone = socket.data.phone;
  socket.data.phone = phone;
  socket.join(`user:${phone}`);
  console.log(`User connected: ${phone}`);

  socket.on("join_chat", async ({ chatId }) => {
    const id = trimValue(chatId);
    if (!id) return;
    const chat = await Chat.findById(id).lean();
    if (!chat || !chat.participants.includes(socket.data.phone)) return;
    socket.join(`chat:${id}`);
  });

  socket.on("leave_chat", ({ chatId }) => {
    const id = trimValue(chatId);
    if (!id) return;
    socket.leave(`chat:${id}`);
  });

  socket.on("send_message", async ({ chatId, text }) => {
    const id = trimValue(chatId);
    const safeText = String(text || "").trim();
    if (!id || !safeText) return;

    const chat = await Chat.findById(id);
    if (!chat || !chat.participants.includes(socket.data.phone)) return;

    const messageDoc = await Message.create({
      chatId: id,
      senderPhone: socket.data.phone,
      text: safeText
    });

    chat.lastMessage = safeText;
    chat.lastMessageAt = messageDoc.createdAt;
    if (chat.deletedBy && chat.deletedBy.length > 0) {
      chat.deletedBy = chat.deletedBy.filter(p => p === socket.data.phone);
    }
    await chat.save();

    const sender = await User.findOne({ phone: socket.data.phone }).lean();
    const message = {
      ...formatMessage(messageDoc),
      senderName: sender?.name || socket.data.phone
    };
    io.to(`chat:${id}`).emit("message", message);
    for (const participant of chat.participants) {
      io.to(`user:${participant}`).emit("chat_updated", { chatId: id });
    }
  });

  socket.on("edit_message", async ({ messageId, text }) => {
    const safeText = String(text || "").trim();
    if (!messageId || !safeText) return;

    const messageDoc = await Message.findById(messageId);
    if (!messageDoc || messageDoc.senderPhone !== socket.data.phone) return;

    messageDoc.text = safeText;
    messageDoc.isEdited = true;
    await messageDoc.save();

    // Broadcast the update to all users in the chat room
    io.to(`chat:${messageDoc.chatId}`).emit("message_edited", {
      messageId: messageDoc._id.toString(),
      text: safeText,
      isEdited: true
    });

    // Update lastMessage preview if this was the latest message
    const chat = await Chat.findById(messageDoc.chatId);
    if (chat) {
      const latestMessage = await Message.findOne({ chatId: chat._id }).sort({ createdAt: -1 });
      if (latestMessage && latestMessage._id.toString() === messageId) {
        chat.lastMessage = safeText;
        await chat.save();
        
        for (const participant of chat.participants) {
          io.to(`user:${participant}`).emit("chat_updated", { chatId: chat._id.toString() });
        }
      }
    }
  });

  socket.on("delete_message", async ({ messageId, type }) => {
    if (!messageId || !["me", "everyone"].includes(type)) return;

    const messageDoc = await Message.findById(messageId);
    if (!messageDoc) return;

    if (type === "me") {
      if (!messageDoc.deletedFor) {
        messageDoc.deletedFor = [];
      }
      if (!messageDoc.deletedFor.includes(socket.data.phone)) {
        messageDoc.deletedFor.push(socket.data.phone);
        await messageDoc.save();
      }

      // Notify the deleting user's client to remove it locally
      socket.emit("message_deleted_for_me", { messageId });

      // Update their sidebar chat list
      socket.emit("chat_updated", { chatId: messageDoc.chatId.toString() });
    } else if (type === "everyone") {
      if (messageDoc.senderPhone !== socket.data.phone) return; // Only sender can delete for everyone
      
      messageDoc.isDeletedForEveryone = true;
      messageDoc.text = "This message deleted";
      await messageDoc.save();

      // Notify everyone in the chat room to update it
      io.to(`chat:${messageDoc.chatId}`).emit("message_deleted_for_everyone", {
        messageId: messageDoc._id.toString(),
        isDeletedForEveryone: true,
        text: "This message deleted"
      });

      // Update lastMessage preview if this was the latest message
      const chat = await Chat.findById(messageDoc.chatId);
      if (chat) {
        const latestMessage = await Message.findOne({ chatId: chat._id }).sort({ createdAt: -1 });
        if (latestMessage && latestMessage._id.toString() === messageId) {
          chat.lastMessage = "This message deleted";
          await chat.save();
          
          for (const participant of chat.participants) {
            io.to(`user:${participant}`).emit("chat_updated", { chatId: chat._id.toString() });
          }
        }
      }
    }
  });

  socket.on("typing", ({ chatId }) => {
    const id = trimValue(chatId);
    if (!id) return;
    socket.to(`chat:${id}`).emit("user_typing", { chatId: id, phone: socket.data.phone });
  });

  socket.on("stop_typing", ({ chatId }) => {
    const id = trimValue(chatId);
    if (!id) return;
    socket.to(`chat:${id}`).emit("user_stop_typing", { chatId: id, phone: socket.data.phone });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.data.phone}`);
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

async function connectMongo() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI environment variable is required");
  }

  await mongoose.connect(mongoUri);
  await User.syncIndexes();
  await migrateUserPhonesToE164(User);
  console.log("MongoDB connected");
}

configureRedisAdapter()
  .then(connectMongo)
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Chat server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize server:", err);
    process.exit(1);
  });
