
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const fetch = require("node-fetch");
const crypto = require("crypto");
const QRCode = require("qrcode");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);

// Allowlist for Capacitor native origins, production domain, and local development
const defaultAllowedOrigins = [
  "https://localhost",
  "capacitor://localhost",
  "https://anon-chat-jtef.onrender.com",
  "http://localhost:3000"
];

const envAllowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

const allowedOrigins = new Set([...defaultAllowedOrigins, ...envAllowedOrigins]);

function isOriginAllowed(origin) {
  // Allow requests with no Origin header (same-origin, mobile webviews, server-to-server)
  if (!origin) return true;
  return allowedOrigins.has(origin);
}

const corsOptions = {
  origin: function (origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-room-instance-id",
    "x-client-msg-id",
    "x-session-token"
  ]
};

app.use(cors(corsOptions));

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Cold-start health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: Date.now() });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/share", express.static(path.join(__dirname, "public")));

// Rate limiting & Expiry Constants (Phases 1 & 2, Rule 8)
const ROOM_TTL_MS = parseInt(process.env.ROOM_TTL_MS, 10) || (30 * 60 * 1000);
const VAULT_TTL_MS = parseInt(process.env.VAULT_TTL_MS, 10) || (30 * 60 * 1000);
const CLEANUP_INTERVAL_MS = parseInt(process.env.CLEANUP_INTERVAL_MS, 10) || (30 * 1000);

const SOCKET_BUCKET_CAPACITY = 10;
const SOCKET_BUCKET_REFILL_MS = 5000; // 10 messages per 5s
const UPLOAD_RATE_WINDOW_MS = 60 * 1000; // 1 minute
const UPLOAD_RATE_MAX_PER_MIN = 30; // 30 uploads per minute per IP
const UPLOAD_CONCURRENT_MAX_PER_IP = 5; // Max concurrent uploads per IP
const DEDUPE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TOMBSTONE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory maps for rate limiting and tombstones
const roomTombstones = new Map(); // roomInstanceId -> { instanceId, roomKey, endedAt, reason }
const ipUploadTracker = new Map(); // ip -> { timestamps: number[], inFlight: number }

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

// Upload endpoint with IP rate limiting and room instance validation
app.post("/upload", (req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const now = Date.now();
  let tracker = ipUploadTracker.get(ip);
  if (!tracker) {
    tracker = { timestamps: [], inFlight: 0 };
    ipUploadTracker.set(ip, tracker);
  }
  tracker.timestamps = tracker.timestamps.filter(t => now - t < UPLOAD_RATE_WINDOW_MS);
  if (tracker.timestamps.length >= UPLOAD_RATE_MAX_PER_MIN) {
    return res.status(429).json({ error: "Upload rate limit exceeded. Please wait a moment." });
  }
  if (tracker.inFlight >= UPLOAD_CONCURRENT_MAX_PER_IP) {
    return res.status(429).json({ error: "Too many concurrent uploads. Please wait." });
  }
  tracker.inFlight++;
  tracker.timestamps.push(now);

  const cleanup = () => {
    if (tracker) {
      tracker.inFlight = Math.max(0, tracker.inFlight - 1);
    }
  };
  res.on("finish", cleanup);
  res.on("close", cleanup);

  const roomInstanceIdHeader = req.headers["x-room-instance-id"] || req.query?.roomInstanceId;
  const roomKeyHeader = req.headers["x-room-key"] || req.query?.roomKey;
  const clientMsgIdHeader = req.headers["x-client-msg-id"] || req.query?.clientMsgId;
  const totalContentLength = Number(req.headers["content-length"]) || 0;
  let receivedBytes = 0;
  let lastProgressBroadcast = 0;

  let uploadRoom = null;
  if (roomInstanceIdHeader) {
    uploadRoom = findRoomByInstanceId(roomInstanceIdHeader);
  }
  if (!uploadRoom && roomKeyHeader && rooms[roomKeyHeader]) {
    uploadRoom = rooms[roomKeyHeader];
  }

  const onStreamData = (chunk) => {
    receivedBytes += chunk.length;
    const now = Date.now();
    if (uploadRoom && clientMsgIdHeader && (now - lastProgressBroadcast >= 200 || receivedBytes >= totalContentLength)) {
      lastProgressBroadcast = now;
      io.to(uploadRoom.roomKey).emit("media-progress", {
        roomInstanceId: roomInstanceIdHeader || uploadRoom.roomInstanceId,
        clientMsgId: clientMsgIdHeader,
        loaded: receivedBytes,
        total: totalContentLength
      });
    }
  };
  req.on("data", onStreamData);

  const onStreamAbort = () => {
    if (uploadRoom && clientMsgIdHeader && !res.headersSent) {
      io.to(uploadRoom.roomKey).emit("media-cancelled", { clientMsgId: clientMsgIdHeader });
    }
  };
  req.on("aborted", onStreamAbort);
  res.on("close", () => {
    req.off("data", onStreamData);
    if (!res.writableEnded) {
      onStreamAbort();
    }
  });

  upload.single("file")(req, res, (err) => {
    if (err) {
      cleanup();
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });

  const roomInstanceId = req.body?.roomInstanceId || req.query?.roomInstanceId || req.headers["x-room-instance-id"];
  const roomKeyParam = req.body?.roomKey || req.query?.roomKey || req.headers["x-room-key"];
  const clientMsgId = req.body?.clientMsgId || req.query?.clientMsgId || req.headers["x-client-msg-id"];

  let room = null;
  if (roomInstanceId) {
    room = findRoomByInstanceId(roomInstanceId);
  }
  if (!room && roomKeyParam && rooms[roomKeyParam]) {
    room = rooms[roomKeyParam];
  }

  if (!room && (roomInstanceId || roomKeyParam)) {
    if (req.file.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    return res.status(410).json({ error: "Room ended", code: "ROOM_ENDED" });
  }

  if (room) {
    if (!room.uploadDedupeMap) {
      room.uploadDedupeMap = new Map();
    }

    if (clientMsgId && room.uploadDedupeMap.has(clientMsgId)) {
      const cached = room.uploadDedupeMap.get(clientMsgId);
      if (req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.json(cached);
    }

    const result = {
      path: `/uploads/${req.file.filename}`,
      clientMsgId,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    };
    if (clientMsgId) {
      room.uploadDedupeMap.set(clientMsgId, { ...result, timestamp: Date.now() });
      if (room.uploadDedupeMap.size > 200) {
        const now = Date.now();
        for (const [k, v] of room.uploadDedupeMap.entries()) {
          if (now - v.timestamp > DEDUPE_TTL_MS) room.uploadDedupeMap.delete(k);
        }
      }
    }
    room.lastActivity = Date.now();
    return res.json(result);
  }

  res.json({
    path: `/uploads/${req.file.filename}`,
    clientMsgId,
    filename: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});

app.get("/api/gifs", async (req, res) => {
  if (!GIPHY_API_KEY || GIPHY_API_KEY.trim() === "") {
    return res.status(500).json({ error: "Giphy API key is not configured" });
  }
  const { query } = req.query;
  const url = (query && query.trim() !== "" && query !== "trending")
    ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=16`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=16`;
  try {
    const response = await fetch(url);
    const json = await response.json();
    if (json.meta && json.meta.status !== 200) {
      return res.status(json.meta.status).json({ error: json.meta.msg || "Giphy API error" });
    }
    res.json(json);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch GIFs" });
  }
});

app.get("/api/stickers", async (req, res) => {
  const { query } = req.query;
  const url = (query && query.trim() !== "" && query !== "trending")
    ? `https://api.giphy.com/v1/stickers/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=16`
    : `https://api.giphy.com/v1/stickers/trending?api_key=${GIPHY_API_KEY}&limit=16`;
  try {
    const response = await fetch(url);
    const json = await response.json();
    res.json(json);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stickers" });
  }
});

app.get("/.well-known/assetlinks.json", (req, res) => {
  res.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.mudit.anonchat",
        sha256_cert_fingerprints: [
          "PLACEHOLDER_RELEASE_KEYSTORE_SHA256_FINGERPRINT"
        ]
      }
    }
  ]);
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
    io.to("file-room-" + roomId).emit("file-vault-ended", {
      reason: "ended",
      message: "The creator has ended this vault. All files have been erased."
    });
  } else {
    io.to("file-room-" + roomId).emit("file-room-expired", {
      reason: "expired",
      message: "This file room has expired due to inactivity."
    });
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
    expiresAt: now + VAULT_TTL_MS,
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
    return res.status(404).json({ error: "File vault not found or has expired.", code: "VAULT_NOT_FOUND" });
  }

  const now = Date.now();
  if (now - room.lastActivity > VAULT_TTL_MS) {
    deleteFileRoom(room.roomId, "expired");
    return res.status(410).json({ error: "File vault has expired.", code: "VAULT_EXPIRED" });
  }

  room.lastActivity = now;
  room.expiresAt = now + VAULT_TTL_MS;
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
      expiresAt: room.expiresAt,
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

function findRoomByInstanceId(roomInstanceId) {
  if (!roomInstanceId) return null;
  for (const key in rooms) {
    if (rooms[key].roomInstanceId === roomInstanceId) {
      return rooms[key];
    }
  }
  return null;
}

function checkSocketRateLimit(socket, room) {
  const now = Date.now();
  let bucket = room.tokenBuckets.get(socket.id);
  if (!bucket) {
    bucket = { tokens: SOCKET_BUCKET_CAPACITY, lastRefill: now };
    room.tokenBuckets.set(socket.id, bucket);
  }
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = (elapsed / SOCKET_BUCKET_REFILL_MS) * SOCKET_BUCKET_CAPACITY;
  bucket.tokens = Math.min(SOCKET_BUCKET_CAPACITY, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    return false;
  }
  bucket.tokens -= 1;
  return true;
}

const updateUserList = (roomKey) => {
  if (rooms[roomKey]) {
    io.to(roomKey).emit("update-user-list", rooms[roomKey].users.map(u => ({ id: u.id, username: u.username })));
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
    const trimmedKey = typeof roomKey === "string" ? roomKey.trim() : "";
    const trimmedUsername = typeof username === "string" ? username.trim() : "";
    if (!trimmedKey || trimmedKey.length < 6) {
      return socket.emit("room-creation-error", "Room key must be at least 6 characters.");
    }
    if (!trimmedUsername) {
      return socket.emit("room-creation-error", "Please provide a valid codename.");
    }
    if (rooms[trimmedKey]) return socket.emit("room-exists", "This room key is already taken.");
    const roomInstanceId = crypto.randomUUID();
    const sessionToken = crypto.randomBytes(16).toString("hex");
    const memberId = crypto.randomUUID();

    socket.join(trimmedKey);
    rooms[trimmedKey] = {
      roomKey: trimmedKey,
      roomInstanceId,
      admin: { id: socket.id, username: trimmedUsername, memberId, sessionToken },
      users: [{ id: socket.id, username: trimmedUsername, memberId, sessionToken }],
      messages: [],
      pendingUsers: [],
      typingUsers: new Set(),
      lastActivity: Date.now(),
      dedupeMap: new Map(),
      tokenBuckets: new Map()
    };

    socket.emit("room-created", {
      isAdmin: true,
      roomKey: trimmedKey,
      roomInstanceId,
      sessionToken,
      memberId,
      username: trimmedUsername,
      expiresAt: Date.now() + ROOM_TTL_MS
    });
    updateUserList(trimmedKey);
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

  socket.on("resume-session", ({ roomInstanceId, sessionToken }) => {
    if (!roomInstanceId || !sessionToken) {
      return socket.emit("resume-session-response", { valid: false, reason: "invalid_params" });
    }
    const room = findRoomByInstanceId(roomInstanceId);
    if (!room) {
      const tombstone = roomTombstones.get(roomInstanceId);
      return socket.emit("resume-session-response", {
        valid: false,
        reason: tombstone ? tombstone.reason : "expired"
      });
    }

    const member = room.users.find(u => u.sessionToken === sessionToken);
    if (!member) {
      return socket.emit("resume-session-response", { valid: false, reason: "NOT_MEMBER" });
    }

    member.id = socket.id;
    if (room.admin.memberId === member.memberId) {
      room.admin.id = socket.id;
    }
    socket.join(room.roomKey);
    room.lastActivity = Date.now();

    socket.emit("resume-session-response", {
      valid: true,
      roomKey: room.roomKey,
      roomInstanceId: room.roomInstanceId,
      sessionToken: member.sessionToken,
      memberId: member.memberId,
      username: member.username,
      isAdmin: room.admin.memberId === member.memberId,
      members: room.users.map(u => ({ id: u.id, username: u.username })),
      messages: room.messages,
      expiresAt: room.lastActivity + ROOM_TTL_MS
    });

    updateUserList(room.roomKey);
  });

  socket.on("peek-room", ({ roomKey }, callback) => {
    const room = rooms[roomKey];
    const response = {
      exists: !!room,
      onlineCount: room ? room.users.length : 0,
      full: room ? room.users.length >= 50 : false
    };
    if (typeof callback === "function") {
      callback(response);
    } else {
      socket.emit("peek-room-response", response);
    }
  });

  socket.on("approve-join", ({ roomKey, userId }) => {
    const room = rooms[roomKey];
    if (!room || room.admin.id !== socket.id) return;
    const userToJoin = room.pendingUsers.find(u => u.id === userId);
    if (userToJoin) {
      room.pendingUsers = room.pendingUsers.filter(u => u.id !== userId);
      const sessionToken = crypto.randomBytes(16).toString("hex");
      const memberId = crypto.randomUUID();
      const newUser = { id: userToJoin.id, username: userToJoin.username, memberId, sessionToken };
      room.users.push(newUser);
      const userSocket = io.sockets.sockets.get(userId);
      if (userSocket) {
        userSocket.join(roomKey);
        userSocket.emit("join-approved", {
          messages: room.messages,
          roomKey,
          roomInstanceId: room.roomInstanceId,
          sessionToken,
          memberId,
          username: userToJoin.username,
          isAdmin: false,
          expiresAt: room.lastActivity + ROOM_TTL_MS
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

  socket.on("kill-room", ({ roomKey, roomInstanceId, sessionToken }) => {
    let room = rooms[roomKey];
    if (!room && roomInstanceId) {
      room = findRoomByInstanceId(roomInstanceId);
    }
    if (!room) return;
    if (room.admin.id === socket.id || (sessionToken && room.admin.sessionToken === sessionToken)) {
      const instanceId = room.roomInstanceId;
      roomTombstones.set(instanceId, {
        instanceId,
        roomKey: room.roomKey,
        endedAt: Date.now(),
        reason: "ended"
      });

      io.to(room.roomKey).emit("room-ended", { reason: "ended" });
      io.in(room.roomKey).socketsLeave(room.roomKey);
      delete rooms[room.roomKey];
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

  socket.on("chat-message", ({ roomKey, roomInstanceId, sessionToken, clientMsgId, username, message, id, replyTo }) => {
    const room = (roomInstanceId && findRoomByInstanceId(roomInstanceId)) || rooms[roomKey];
    if (!room) {
      return socket.emit("room-ended", { reason: "ended" });
    }

    if (roomInstanceId && room.roomInstanceId !== roomInstanceId) {
      return socket.emit("room-ended", { reason: "ended" });
    }

    if (!checkSocketRateLimit(socket, room)) {
      return socket.emit("rate-limited", { message: "You're sending too fast" });
    }

    if (clientMsgId && room.dedupeMap.has(clientMsgId)) {
      const existing = room.dedupeMap.get(clientMsgId);
      if (existing && existing.entry) {
        io.to(room.roomKey).emit("chat-message", existing.entry);
      }
      return;
    }

    const msgId = id || clientMsgId || `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const entry = {
      id: msgId,
      clientMsgId: clientMsgId || msgId,
      username,
      message,
      timestamp: Date.now(),
      seenBy: [],
      ...(replyTo && { replyTo })
    };

    room.messages.push(entry);
    if (clientMsgId) {
      room.dedupeMap.set(clientMsgId, { entry, timestamp: Date.now() });
      if (room.dedupeMap.size > 200) {
        const now = Date.now();
        for (const [k, v] of room.dedupeMap.entries()) {
          if (now - v.timestamp > DEDUPE_TTL_MS) room.dedupeMap.delete(k);
        }
      }
    }
    room.lastActivity = Date.now();
    io.to(room.roomKey).emit("chat-message", entry);
  });

  socket.on("file-message", (data) => {
    if (!data) return;
    const { roomKey, roomInstanceId, sessionToken, clientMsgId, username, file, replyTo, id } = data;
    const room = (roomInstanceId && findRoomByInstanceId(roomInstanceId)) || rooms[roomKey];
    if (!room) return socket.emit("room-ended", { reason: "ended" });
    if (sessionToken && !room.users.some(u => u.sessionToken === sessionToken)) return;
    if (roomInstanceId && room.roomInstanceId !== roomInstanceId) return socket.emit("room-ended", { reason: "ended" });
    if (!checkSocketRateLimit(socket, room)) return socket.emit("rate-limited", { message: "You're sending too fast" });

    if (clientMsgId && room.dedupeMap.has(clientMsgId)) {
      const existing = room.dedupeMap.get(clientMsgId);
      if (existing && existing.entry) {
        io.to(room.roomKey).emit("chat-message", existing.entry);
      }
      return;
    }

    const msgId = id || clientMsgId || `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const entry = {
      id: msgId,
      clientMsgId: clientMsgId || msgId,
      username,
      message: {
        type: 'file',
        content: file?.path || '',
        name: file?.name || 'file',
        size: file?.size || 0,
        mimeType: file?.type || ''
      },
      file,
      timestamp: Date.now(),
      seenBy: [],
      ...(replyTo && { replyTo })
    };

    room.messages.push(entry);
    if (clientMsgId) {
      room.dedupeMap.set(clientMsgId, { entry, timestamp: Date.now() });
      if (room.dedupeMap.size > 200) {
        const now = Date.now();
        for (const [k, v] of room.dedupeMap.entries()) {
          if (now - v.timestamp > DEDUPE_TTL_MS) room.dedupeMap.delete(k);
        }
      }
    }
    room.lastActivity = Date.now();
    io.to(room.roomKey).emit("chat-message", entry);
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

  socket.on("file-uploaded", ({ roomKey, roomInstanceId, sessionToken, clientMsgId, username, file, messageId }) => {
    const room = (roomInstanceId && findRoomByInstanceId(roomInstanceId)) || rooms[roomKey];
    if (!room) {
      return socket.emit("room-ended", { reason: "ended" });
    }
    if (roomInstanceId && room.roomInstanceId !== roomInstanceId) {
      return socket.emit("room-ended", { reason: "ended" });
    }
    if (!checkSocketRateLimit(socket, room)) {
      return socket.emit("rate-limited", { message: "You're sending too fast" });
    }
    if (clientMsgId && room.dedupeMap.has(clientMsgId)) {
      const existing = room.dedupeMap.get(clientMsgId);
      return socket.emit("file-uploaded", existing.entry);
    }

    const entry = {
      id: messageId || clientMsgId || `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      clientMsgId: clientMsgId || messageId,
      username,
      file,
      timestamp: Date.now(),
      seenBy: []
    };

    room.messages.push(entry);
    if (clientMsgId) {
      room.dedupeMap.set(clientMsgId, { entry, timestamp: Date.now() });
    }
    room.lastActivity = Date.now();
    io.to(room.roomKey).emit("file-uploaded", entry);
  });

  socket.on("media-start", (data) => {
    if (!data) return;
    const { roomKey, roomInstanceId, sessionToken, clientMsgId, kind, name, size, mime, width, height, durationMs } = data;
    const trimmedKey = typeof roomKey === "string" ? roomKey.trim() : "";
    const room = (roomInstanceId && findRoomByInstanceId(roomInstanceId)) || (trimmedKey && rooms[trimmedKey]);
    if (!room) return socket.emit("room-ended", { reason: "ended" });

    if (!room.pendingMedia) room.pendingMedia = new Map();
    const user = room.users.find(u => u.id === socket.id || (sessionToken && u.sessionToken === sessionToken));
    const senderUsername = (data.username && String(data.username).trim()) || (user ? user.username : (socket.username || 'Anonymous'));

    room.pendingMedia.set(clientMsgId, {
      clientMsgId,
      username: senderUsername,
      kind,
      name,
      size,
      mime,
      width,
      height,
      durationMs: durationMs || 0,
      timestamp: Date.now()
    });

    socket.to(room.roomKey).emit("media-incoming", {
      clientMsgId,
      username: senderUsername,
      kind,
      name,
      size,
      mime,
      width,
      height,
      durationMs: durationMs || 0
    });
  });

  socket.on("media-upload-progress", (data) => {
    if (!data) return;
    const { roomKey, roomInstanceId, clientMsgId, loaded, total } = data;
    const room = (roomInstanceId && findRoomByInstanceId(roomInstanceId)) || (roomKey && rooms[roomKey]);
    if (room && clientMsgId) {
      socket.to(room.roomKey).emit("media-progress", {
        roomInstanceId,
        clientMsgId,
        loaded: Number(loaded) || 0,
        total: Number(total) || 0
      });
    }
  });

  socket.on("media-cancel", (data) => {
    if (!data) return;
    const { roomKey, roomInstanceId, clientMsgId } = data;
    const room = (roomInstanceId && findRoomByInstanceId(roomInstanceId)) || rooms[roomKey];
    if (room) {
      if (room.pendingMedia) room.pendingMedia.delete(clientMsgId);
      io.to(room.roomKey).emit("media-cancelled", { clientMsgId });
    }
  });

  socket.on("react", (data) => {
    if (!data) return;
    const { roomKey, roomInstanceId, sessionToken, messageId, emoji } = data;
    const room = (roomInstanceId && findRoomByInstanceId(roomInstanceId)) || rooms[roomKey];
    if (!room) return socket.emit("room-ended", { reason: "ended" });
    if (sessionToken && !room.users.some(u => u.sessionToken === sessionToken)) return;
    if (roomInstanceId && room.roomInstanceId !== roomInstanceId) return socket.emit("room-ended", { reason: "ended" });

    const user = room.users.find(u => u.id === socket.id || (sessionToken && u.sessionToken === sessionToken));
    const username = user ? user.username : 'Anonymous';

    if (!room.reactions) room.reactions = new Map();
    if (!room.reactions.has(messageId)) {
      room.reactions.set(messageId, new Map());
    }
    const msgReactions = room.reactions.get(messageId);

    const currentEmoji = msgReactions.get(username);
    if (!emoji || currentEmoji === emoji) {
      msgReactions.delete(username);
    } else {
      msgReactions.set(username, emoji);
    }

    const reactionsObj = {};
    for (const [u, em] of msgReactions.entries()) {
      if (!reactionsObj[em]) reactionsObj[em] = [];
      reactionsObj[em].push(u);
    }

    const msg = room.messages.find(m => m.id === messageId || m.clientMsgId === messageId);
    if (msg) {
      msg.reactions = reactionsObj;
    }

    io.to(room.roomKey).emit("reactions-updated", {
      messageId,
      reactions: reactionsObj
    });
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
        user.id = null;
        updateUserList(roomKey);
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

// Clean up inactive rooms after TTL of inactivity
setInterval(() => {
  const now = Date.now();

  // 1. Clean up inactive chat rooms
  for (const roomKey in rooms) {
    const room = rooms[roomKey];
    if (now - room.lastActivity > ROOM_TTL_MS) {
      console.log(`Deleting inactive chat room: ${roomKey}`);
      const instanceId = room.roomInstanceId;
      roomTombstones.set(instanceId, {
        instanceId,
        roomKey,
        endedAt: now,
        reason: "expired"
      });
      io.to(roomKey).emit("room-ended", { reason: "expired" });
      io.in(roomKey).socketsLeave(roomKey);
      delete rooms[roomKey];
    }
  }

  // Clean old tombstones
  for (const [id, tomb] of roomTombstones.entries()) {
    if (now - tomb.endedAt > TOMBSTONE_TTL_MS) {
      roomTombstones.delete(id);
    }
  }

  // 2. Clean up inactive anonymous file sharing rooms
  try {
    if (fs.existsSync(fileRoomsDir)) {
      const folders = fs.readdirSync(fileRoomsDir);
      for (const folder of folders) {
        const meta = getRoomMetadata(folder);
        if (meta && (now - meta.lastActivity > VAULT_TTL_MS)) {
          console.log(`Deleting inactive file room: ${folder}`);
          deleteFileRoom(folder, "expired");
        }
      }
    }
  } catch (e) {
    console.error("Error during file room cleanup interval:", e);
  }
}, CLEANUP_INTERVAL_MS);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
