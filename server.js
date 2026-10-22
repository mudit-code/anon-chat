
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const fetch = require("node-fetch");
const crypto = require("crypto");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/share", express.static(path.join(__dirname, "public")));

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

const GIPHY_API_KEY = "X2rfEL5mqbPjVprW2ev39QFtsE12J7Py";

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  res.json({ path: `/uploads/${req.file.filename}` });
});

app.get("/api/gifs", async (req, res) => {
  const { query } = req.query;
  const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${query}&limit=12`;
  try {
    const response = await fetch(url);
    const json = await response.json();
    res.json(json);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch GIFs" });
  }
});

app.use("/uploads", express.static(uploadDir));

// ============================================================
// ANONYMOUS FILE SHARING ROOMS - BACKEND & STORAGE
// ============================================================
const fileRoomsDir = path.join(__dirname, "uploads", "file-rooms");
if (!fs.existsSync(fileRoomsDir)) fs.mkdirSync(fileRoomsDir, { recursive: true });

const MAX_ROOM_STORAGE_BYTES = 500 * 1024 * 1024; // 500 MB strictly enforced on backend

// IP Rate limiter for anonymous file room uploads
const fileUploadRateLimits = new Map();
const checkUploadRateLimit = (ip) => {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes window
  const maxReqs = 40;
  const record = fileUploadRateLimits.get(ip) || [];
  const valid = record.filter(t => now - t < windowMs);
  if (valid.length >= maxReqs) return false;
  valid.push(now);
  fileUploadRateLimits.set(ip, valid);
  return true;
};

// Storage helper functions
function getRoomMetadata(roomId) {
  if (!roomId || typeof roomId !== "string") return null;
  const metaPath = path.join(fileRoomsDir, roomId, "metadata.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    const content = fs.readFileSync(metaPath, "utf8");
    return JSON.parse(content);
  } catch (e) {
    console.error("Error reading room metadata:", e);
    return null;
  }
}

function saveRoomMetadata(roomId, metadata) {
  const roomDir = path.join(fileRoomsDir, roomId);
  if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });
  const metaPath = path.join(roomDir, "metadata.json");
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf8");
}

function generateRoomKey() {
  const prefixes = ["vault", "shard", "drop", "ghost", "cipher", "nexus", "cloud", "prism", "secret", "orbit", "echo", "pulse"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = crypto.randomBytes(3).toString("hex").slice(0, 5);
  return `${prefix}-${suffix}`;
}

function findRoomByIdOrKey(identifier) {
  if (!identifier) return null;
  const clean = identifier.trim().toLowerCase();

  // 1. Direct match by roomId / folder
  const direct = getRoomMetadata(identifier.trim());
  if (direct) return direct;

  // 2. Search all rooms by roomKey or roomId
  try {
    const entries = fs.readdirSync(fileRoomsDir);
    for (const entry of entries) {
      const meta = getRoomMetadata(entry);
      if (meta) {
        if (meta.roomId.toLowerCase() === clean || (meta.roomKey && meta.roomKey.toLowerCase() === clean)) {
          return meta;
        }
      }
    }
  } catch (e) {
    console.error("Error searching file rooms:", e);
  }
  return null;
}

function deleteFileRoom(roomId, reason = "expired") {
  const roomDir = path.join(fileRoomsDir, roomId);
  if (fs.existsSync(roomDir)) {
    try {
      fs.rmSync(roomDir, { recursive: true, force: true });
      console.log(`Deleted file room ${roomId} (reason: ${reason}).`);
    } catch (e) {
      console.error(`Error deleting file room ${roomId}:`, e);
    }
  }
  if (reason === "ended") {
    io.to("file-room-" + roomId).emit("file-vault-ended", "The creator has ended this vault. All files have been erased.");
  } else {
    io.to("file-room-" + roomId).emit("file-room-expired", "This file room has expired due to 30 minutes of inactivity.");
  }
}

// Multer storage for file sharing rooms
const fileRoomMulterStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const roomId = req.params.roomId || req.generatedRoomId;
    const roomDir = path.join(fileRoomsDir, roomId);
    if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });
    cb(null, roomDir);
  },
  filename: (req, file, cb) => {
    const originalName = file.originalname || "unnamed";
    const safeName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileId = `f_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    cb(null, `${fileId}-${safeName}`);
  }
});

const uploadFileRoom = multer({
  storage: fileRoomMulterStorage,
  limits: { fileSize: MAX_ROOM_STORAGE_BYTES }
});

// API: Create new room and upload initial file(s)
app.post("/api/file-rooms/create-and-upload", (req, res, next) => {
  if (!checkUploadRateLimit(req.ip)) {
    return res.status(429).json({ error: "Too many upload attempts. Please wait a moment." });
  }
  req.generatedRoomId = crypto.randomBytes(8).toString("hex");
  next();
}, uploadFileRoom.array("files", 30), async (req, res) => {
  const roomId = req.generatedRoomId;
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ error: "No files were selected for upload." });
  }

  const totalUploadedBytes = files.reduce((acc, f) => acc + f.size, 0);
  if (totalUploadedBytes > MAX_ROOM_STORAGE_BYTES) {
    files.forEach(f => {
      if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    });
    return res.status(400).json({ error: "Total files size exceeds 500 MB limit." });
  }

  const now = Date.now();
  const roomKey = generateRoomKey();
  const fileEntries = files.map(f => {
    const fileId = f.filename.split("-")[0];
    return {
      id: fileId,
      name: f.originalname,
      storedName: f.filename,
      size: f.size,
      mimeType: f.mimetype || "application/octet-stream",
      uploadedAt: now
    };
  });

  const metadata = {
    roomId,
    roomKey,
    createdAt: now,
    lastActivity: now,
    totalSizeBytes: totalUploadedBytes,
    maxSizeBytes: MAX_ROOM_STORAGE_BYTES,
    files: fileEntries
  };

  saveRoomMetadata(roomId, metadata);

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const roomUrl = `${baseUrl}/share/${roomId}`;
  let qrCodeDataUrl = "";
  try {
    qrCodeDataUrl = await QRCode.toDataURL(roomUrl, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" }
    });
  } catch (e) {
    console.error("QR Code generation error:", e);
  }

  res.json({
    success: true,
    room: {
      ...metadata,
      roomUrl,
      qrCodeDataUrl
    }
  });
});

// API: Add more file(s) to an existing room
app.post("/api/file-rooms/:roomId/upload", (req, res, next) => {
  if (!checkUploadRateLimit(req.ip)) {
    return res.status(429).json({ error: "Too many upload attempts. Please wait a moment." });
  }
  const room = getRoomMetadata(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: "File room not found or has expired." });
  }
  next();
}, uploadFileRoom.array("files", 30), async (req, res) => {
  const roomId = req.params.roomId;
  const room = getRoomMetadata(roomId);
  if (!room) {
    if (req.files) req.files.forEach(f => fs.existsSync(f.path) && fs.unlinkSync(f.path));
    return res.status(404).json({ error: "Room not found or has expired." });
  }

  const newFiles = req.files || [];
  if (newFiles.length === 0) {
    return res.status(400).json({ error: "No files were selected for upload." });
  }

  const addedBytes = newFiles.reduce((acc, f) => acc + f.size, 0);
  if (room.totalSizeBytes + addedBytes > MAX_ROOM_STORAGE_BYTES) {
    newFiles.forEach(f => fs.existsSync(f.path) && fs.unlinkSync(f.path));
    const remaining = Math.max(0, MAX_ROOM_STORAGE_BYTES - room.totalSizeBytes);
    const remainingMB = (remaining / (1024 * 1024)).toFixed(1);
    return res.status(400).json({
      error: `Storage limit exceeded. This room has ${remainingMB} MB remaining out of 500 MB.`
    });
  }

  const now = Date.now();
  const newEntries = newFiles.map(f => {
    const fileId = f.filename.split("-")[0];
    return {
      id: fileId,
      name: f.originalname,
      storedName: f.filename,
      size: f.size,
      mimeType: f.mimetype || "application/octet-stream",
      uploadedAt: now
    };
  });

  room.files = [...room.files, ...newEntries];
  room.totalSizeBytes += addedBytes;
  room.lastActivity = now;
  saveRoomMetadata(roomId, room);

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const roomUrl = `${baseUrl}/share/${roomId}`;
  let qrCodeDataUrl = "";
  try {
    qrCodeDataUrl = await QRCode.toDataURL(roomUrl, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" }
    });
  } catch (e) {}

  const payload = { ...room, roomUrl, qrCodeDataUrl };
  io.to("file-room-" + roomId).emit("file-room-updated", payload);
  res.json({ success: true, room: payload });
});

// API: Get room details by room ID or room Key
app.get("/api/file-rooms/:identifier", async (req, res) => {
  const room = findRoomByIdOrKey(req.params.identifier);
  if (!room) {
    return res.status(404).json({ error: "File sharing room not found or has expired." });
  }

  room.lastActivity = Date.now();
  saveRoomMetadata(room.roomId, room);

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const roomUrl = `${baseUrl}/share/${room.roomId}`;
  let qrCodeDataUrl = "";
  try {
    qrCodeDataUrl = await QRCode.toDataURL(roomUrl, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" }
    });
  } catch (e) {}

  res.json({
    success: true,
    room: {
      ...room,
      roomUrl,
      qrCodeDataUrl
    }
  });
});

// API: Delete an individual file from a room
app.delete("/api/file-rooms/:roomId/files/:fileId", (req, res) => {
  const { roomId, fileId } = req.params;
  const room = getRoomMetadata(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found or has expired." });
  }

  const fileIndex = room.files.findIndex(f => f.id === fileId);
  if (fileIndex === -1) {
    return res.status(404).json({ error: "File not found in room." });
  }

  const targetFile = room.files[fileIndex];
  const filePath = path.join(fileRoomsDir, roomId, targetFile.storedName);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.error("Error deleting file from disk:", e);
    }
  }

  room.totalSizeBytes = Math.max(0, room.totalSizeBytes - targetFile.size);
  room.files.splice(fileIndex, 1);
  room.lastActivity = Date.now();
  saveRoomMetadata(roomId, room);

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const roomUrl = `${baseUrl}/share/${roomId}`;
  const payload = { ...room, roomUrl };
  io.to("file-room-" + roomId).emit("file-room-updated", payload);

  res.json({ success: true, room: payload });
});

// API: Secure download of an individual file
app.get("/api/file-rooms/:roomId/files/:fileId/download", (req, res) => {
  const { roomId, fileId } = req.params;
  const room = getRoomMetadata(roomId);
  if (!room) {
    return res.status(404).send("File sharing room not found or has expired.");
  }

  const file = room.files.find(f => f.id === fileId);
  if (!file) {
    return res.status(404).send("File not found in room.");
  }

  const filePath = path.join(fileRoomsDir, roomId, file.storedName);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(fileRoomsDir)) || !fs.existsSync(filePath)) {
    return res.status(404).send("File not found on server.");
  }

  // Refresh room activity on download
  room.lastActivity = Date.now();
  saveRoomMetadata(roomId, room);

  res.download(filePath, file.name);
});

// API: End / delete entire file vault by creator
app.delete("/api/file-rooms/:roomId", (req, res) => {
  const { roomId } = req.params;
  const room = getRoomMetadata(roomId);
  if (!room) {
    return res.status(404).json({ error: "Vault not found or has already expired." });
  }

  deleteFileRoom(roomId, "ended");
  res.json({ success: true, message: "Vault ended and erased." });
});

// Direct link handler for /share/:identifier
app.get(["/share/:identifier", "/share"], (req, res, next) => {
  if (req.params.identifier && req.params.identifier.includes(".")) {
    return next();
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

let rooms = {};

const updateUserList = (roomKey) => {
  if (rooms[roomKey]) {
    io.to(roomKey).emit("update-user-list", rooms[roomKey].users);
  }
};

const touchRoom = (roomKey) => {
  if (rooms[roomKey]) {
    rooms[roomKey].lastActivity = Date.now();
  }
};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create-room", ({ roomKey, username }) => {
    if (rooms[roomKey]) return socket.emit("room-exists", "This room key is already taken.");
    socket.join(roomKey);
    rooms[roomKey] = {
      admin: { id: socket.id, username },
      users: [{ id: socket.id, username }],
      messages: [], // Unified storage for all messages (text, images, videos, files)
      pendingUsers: [],
      typingUsers: new Set(),
      lastActivity: Date.now()
    };
    socket.emit("room-created", { isAdmin: true });
    updateUserList(roomKey);
  });

  socket.on("join-room", ({ roomKey, username }) => {
    const room = rooms[roomKey];
    if (!room) return socket.emit("room-not-found", "This room does not exist.");
    const adminSocket = io.sockets.sockets.get(room.admin.id);
    if (adminSocket) {
      room.pendingUsers.push({ id: socket.id, username });
      adminSocket.emit("join-request", { userId: socket.id, username });
      socket.emit("join-request-sent", "Your request to join has been sent.");
    } else {
      socket.emit("admin-offline", "The admin of this room is currently offline.");
    }
  });

  socket.on('rejoin-room', ({ roomKey, username, isAdmin }) => {
    let room = rooms[roomKey];

    // Scenario 1: Room does not exist (was deleted because empty)
    if (!room) {
      // Only recreate if the user claims to be the admin
      if (isAdmin) {
        socket.join(roomKey);
        rooms[roomKey] = {
          admin: { id: socket.id, username },
          users: [{ id: socket.id, username }],
          messages: [],
          pendingUsers: [],
          typingUsers: new Set(),
          lastActivity: Date.now()
        };
        socket.emit("room-created", { isAdmin: true });
        socket.emit('chat-history', {
          messages: []
        });
        updateUserList(roomKey);
        return;
      } else {
        // If not admin, we can't recreate the room
        socket.emit('room-not-found');
        return;
      }
    }

    // Scenario 2: Room exists
    const user = room.users.find(u => u.username === username);

    if (user) {
      // User is already in the list (maybe opened a second tab, or quick reconnect)
      user.id = socket.id;
      socket.join(roomKey);
      // If this user was the admin, update the admin socket id too
      if (room.admin.username === username) {
        room.admin.id = socket.id;
        socket.emit("promoted-to-admin");
      }
      socket.emit('join-approved', {
        messages: room.messages
      });
      updateUserList(roomKey);
    } else {
      // User was removed from the list (disconnect), put them back in
      const newUser = { id: socket.id, username };
      room.users.push(newUser);
      socket.join(roomKey);

      // If they were the admin, restore their status
      if (isAdmin && (!room.admin || room.admin.username === username)) {
        room.admin = newUser;
        socket.emit("promoted-to-admin");
      }

      socket.emit('join-approved', {
        messages: room.messages
      });
      io.to(roomKey).emit("user-joined", username);
      updateUserList(roomKey);
    }
  });

  socket.on("approve-join", ({ roomKey, userId }) => {
    const room = rooms[roomKey];
    if (!room || room.admin.id !== socket.id) return;
    const userToJoin = room.pendingUsers.find(u => u.id === userId);
    if (userToJoin) {
      room.pendingUsers = room.pendingUsers.filter(u => u.id !== userId);
      room.users.push(userToJoin);
      const userSocket = io.sockets.sockets.get(userId);
      if (userSocket) {
        userSocket.join(roomKey);
        userSocket.emit("join-approved", {
          messages: room.messages
        });
        io.to(roomKey).emit("user-joined", userToJoin.username);
        updateUserList(roomKey);
      }
    }
  });

  socket.on("deny-join", ({ roomKey, userId }) => {
    const room = rooms[roomKey];
    if (room && room.admin.id === socket.id) {
      room.pendingUsers = room.pendingUsers.filter(u => u.id !== userId);
      const userSocket = io.sockets.sockets.get(userId);
      if (userSocket) userSocket.emit("join-denied", "Your request to join was denied.");
    }
  });

  socket.on("kill-room", ({ roomKey }) => {
    const room = rooms[roomKey];
    if (room && room.admin.id === socket.id) {
      // Notify other participants in the room
      socket.to(roomKey).emit("room-killed");
      delete rooms[roomKey];
    }
  });

  socket.on("remove-user", ({ roomKey, userId }) => {
    const room = rooms[roomKey];
    if (room && room.admin.id === socket.id) {
      const userToRemove = room.users.find(u => u.id === userId);
      if (userToRemove) {
        const userSocket = io.sockets.sockets.get(userId);
        if (userSocket) {
          userSocket.emit("user-removed");
          userSocket.leave(roomKey);
        }
        room.users = room.users.filter(u => u.id !== userId);
        io.to(roomKey).emit("user-left", userToRemove.username);
        updateUserList(roomKey);
      }
    }
  });

  socket.on("chat-message", ({ roomKey, username, message, id, replyTo }) => {
    if (rooms[roomKey]) {
      const msgId = id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const entry = {
        id: msgId,
        username,
        message,
        timestamp: Date.now(),
        seenBy: [],
        ...(replyTo && { replyTo }) // Only add replyTo if present
      };
      rooms[roomKey].messages.push(entry);
      rooms[roomKey].lastActivity = Date.now();
      io.to(roomKey).emit("chat-message", entry);
    }
  });

  socket.on("mark-seen", ({ roomKey, messageId, username }) => {
    touchRoom(roomKey);
    const room = rooms[roomKey];
    if (!room) return;
    const msg = room.messages.find((m) => m.id === messageId);
    if (msg && !msg.seenBy.includes(username)) {
      msg.seenBy.push(username);
      io.to(roomKey).emit("message-seen-update", { messageId, seenBy: msg.seenBy });
    }
  });

  socket.on("file-uploaded", ({ roomKey, username, file, messageId }) => {
    if (rooms[roomKey]) {
      const entry = {
        id: messageId,
        username,
        file,
        timestamp: Date.now(),
        seenBy: []
      };
      rooms[roomKey].messages.push(entry);
      rooms[roomKey].lastActivity = Date.now();
      io.to(roomKey).emit("file-uploaded", entry);
    }
  });

  // Production-grade typing indicators
  socket.on("typing:start", ({ roomKey, userId, username }) => {
    touchRoom(roomKey);
    const room = rooms[roomKey];
    if (!room) return;

    // Store user info on socket for disconnect cleanup
    socket.data = socket.data || {};
    socket.data.roomKey = roomKey;
    socket.data.userId = userId;
    socket.data.username = username;

    // Broadcast to all OTHER users in room (not sender)
    socket.to(roomKey).emit("user-typing-start", { userId, username });
  });

  socket.on("typing:stop", ({ roomKey, userId }) => {
    const room = rooms[roomKey];
    if (!room) return;

    // Broadcast to all OTHER users in room (not sender)
    socket.to(roomKey).emit("user-typing-stop", { userId });
  });

  // Audio recording indicators
  socket.on("recording:start", ({ roomKey, userId, username }) => {
    touchRoom(roomKey);
    const room = rooms[roomKey];
    if (!room) return;

    // Store recording state AND roomKey in socket.data for disconnect cleanup
    socket.data = socket.data || {};
    socket.data.isRecording = true;
    socket.data.recordingRoomKey = roomKey;
    socket.data.userId = userId;
    socket.data.username = username;

    // Broadcast to all OTHER users in room (not sender)
    socket.to(roomKey).emit("user-recording-start", { userId, username });
  });

  socket.on("room-activity", ({ roomKey }) => {
    touchRoom(roomKey);
  });

  socket.on("recording:stop", ({ roomKey, userId }) => {
    const room = rooms[roomKey];
    if (!room) return;

    // Clear recording state
    if (socket.data) {
      socket.data.isRecording = false;
      socket.data.recordingRoomKey = null;
    }

    // Broadcast to all OTHER users in room (not sender)
    socket.to(roomKey).emit("user-recording-stop", { userId });
  });

  const handleUserLeave = (roomKey, username) => {
    if (!rooms[roomKey]) return;
    const room = rooms[roomKey];
    socket.leave(roomKey);
    room.users = room.users.filter(u => u.id !== socket.id);

    if (room.users.length === 0) {
      delete rooms[roomKey];
      return;
    }

    io.to(roomKey).emit("user-left", username);
    updateUserList(roomKey);

    if (room.admin.id === socket.id) {
      room.admin = room.users[0];
      if (room.admin) {
        const adminSocket = io.sockets.sockets.get(room.admin.id);
        if (adminSocket) adminSocket.emit("promoted-to-admin");
      }
    }
  }

  socket.on("leave-room", ({ roomKey, username }) => handleUserLeave(roomKey, username));
  socket.on("disconnect", () => {
    // Clean up recording indicator if user was recording
    if (socket.data?.isRecording && socket.data?.recordingRoomKey) {
      socket.to(socket.data.recordingRoomKey).emit("user-recording-stop", {
        userId: socket.data.userId
      });
    }

    // Auto-cleanup typing indicator on disconnect
    if (socket.data && socket.data.roomKey && socket.data.userId) {
      socket.to(socket.data.roomKey).emit("user-typing-stop", {
        userId: socket.data.userId
      });
    }

    for (const roomKey in rooms) {
      const user = rooms[roomKey].users.find(u => u.id === socket.id);
      if (user) {
        handleUserLeave(roomKey, user.username);
        break;
      }
    }
    console.log("User disconnected:", socket.id);
  });

  // Socket handlers for anonymous file sharing rooms
  socket.on("join-file-room", ({ roomId }) => {
    if (roomId) {
      socket.join("file-room-" + roomId);
    }
  });

  socket.on("leave-file-room", ({ roomId }) => {
    if (roomId) {
      socket.leave("file-room-" + roomId);
    }
  });

  socket.on("touch-file-room", ({ roomId }) => {
    if (roomId) {
      const meta = getRoomMetadata(roomId);
      if (meta) {
        meta.lastActivity = Date.now();
        saveRoomMetadata(roomId, meta);
      }
    }
  });
});

// Clean up inactive rooms after 30 minutes of complete inactivity
setInterval(() => {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds

  // 1. Clean up inactive chat rooms
  for (const roomKey in rooms) {
    const room = rooms[roomKey];
    if (now - room.lastActivity > thirtyMinutes) {
      console.log(`Deleting inactive chat room: ${roomKey} (inactive for ${Math.round((now - room.lastActivity) / 1000 / 60)} minutes)`);
      io.to(roomKey).emit("room-inactive", "Room has been closed due to 30 minutes of inactivity.");
      delete rooms[roomKey];
    }
  }

  // 2. Clean up inactive anonymous file sharing rooms
  try {
    if (fs.existsSync(fileRoomsDir)) {
      const folders = fs.readdirSync(fileRoomsDir);
      for (const folder of folders) {
        const meta = getRoomMetadata(folder);
        if (meta && (now - meta.lastActivity > thirtyMinutes)) {
          console.log(`Deleting inactive file room: ${folder} (inactive for ${Math.round((now - meta.lastActivity) / 1000 / 60)} minutes)`);
          deleteFileRoom(folder);
        }
      }
    }
  } catch (e) {
    console.error("Error during file room cleanup interval:", e);
  }
}, 30 * 1000); // Check every 30 seconds

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
