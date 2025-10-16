
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

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

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  res.json({ path: `/uploads/${req.file.filename}` });
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
      messages: [],
      files: [],
      pendingUsers: []
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
  
  socket.on("approve-join", ({ roomKey, userId }) => {
    const room = rooms[roomKey];
    if (!room || room.admin.id !== socket.id) return;
    const userToJoin = room.pendingUsers.find(u => u.id === userId);
    if (userToJoin) {
        room.pendingUsers = room.pendingUsers.filter(u => u.id !== userId);
        room.users.push(userToJoin);
        const userSocket = io.sockets.sockets.get(userId);
        if(userSocket) {
            userSocket.join(roomKey);
            userSocket.emit("join-approved", { 
                messages: room.messages, 
                files: room.files
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

  socket.on("chat-message", ({ roomKey, username, message }) => {
    if (rooms[roomKey]) {
        rooms[roomKey].messages.push({ username, message });
        io.to(roomKey).emit("chat-message", { username, message });
    }
  });

  socket.on("file-uploaded", ({ roomKey, username, file, messageId }) => {
    if (rooms[roomKey]) {
        rooms[roomKey].files.push({ username, file, messageId });
        io.to(roomKey).emit("file-uploaded", { username, file, messageId });
    }
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
          if(room.admin) {
            const adminSocket = io.sockets.sockets.get(room.admin.id);
            if (adminSocket) adminSocket.emit("promoted-to-admin");
          }
      }
  }

  socket.on("leave-room", ({ roomKey, username }) => handleUserLeave(roomKey, username));
  socket.on("disconnect", () => {
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
