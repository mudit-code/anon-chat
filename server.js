
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const fetch = require("node-fetch");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

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

let rooms = {};

const updateUserList = (roomKey) => {
  if (rooms[roomKey]) {
    io.to(roomKey).emit("update-user-list", rooms[roomKey].users);
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
      io.to(roomKey).emit("room-killed");
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

  socket.on("chat-message", ({ roomKey, username, message, id }) => {
    if (rooms[roomKey]) {
      const msgId = id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const entry = {
        id: msgId,
        username,
        message,
        timestamp: Date.now(),
        seenBy: []
      };
      rooms[roomKey].messages.push(entry);
      rooms[roomKey].lastActivity = Date.now();
      io.to(roomKey).emit("chat-message", entry);
    }
  });

  socket.on("mark-seen", ({ roomKey, messageId, username }) => {
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
});

// Clean up inactive rooms every 30 seconds
setInterval(() => {
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000; // 10 minutes in milliseconds

  for (const roomKey in rooms) {
    const room = rooms[roomKey];
    if (now - room.lastActivity > tenMinutes) {
      console.log(`Deleting inactive room: ${roomKey} (inactive for ${Math.round((now - room.lastActivity) / 1000 / 60)} minutes)`);
      io.to(roomKey).emit("room-inactive", "Room has been closed due to 10 minutes of inactivity.");
      delete rooms[roomKey];
    }
  }
}, 30 * 1000); // Check every 30 seconds

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
