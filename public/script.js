const socket = io();

// DOM Elements
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const leaveBtn = document.getElementById("leaveBtn");
const roomKeyInput = document.getElementById("roomKey");
const usernameInput = document.getElementById("username");
const chatScreen = document.getElementById("chatScreen");
const joinScreen = document.getElementById("joinScreen");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const messagesDiv = document.getElementById("messages");
const fileInput = document.getElementById("fileInput");
const emojiBtn = document.getElementById("emojiBtn");
const gifBtn = document.getElementById("gifBtn");
const stickerBtn = document.getElementById("stickerBtn");
const mediaPicker = document.getElementById("media-picker");
const joinRequestModal = document.getElementById("joinRequestModal");
const joinRequestUser = document.getElementById("joinRequestUser");
const approveJoinBtn = document.getElementById("approveJoinBtn");
const denyJoinBtn = document.getElementById("denyJoinBtn");
const uploadForm = document.getElementById("uploadForm");
const progressBar = document.getElementById("progress-bar");
const progressContainer = document.getElementById("progress-container");
const killRoomBtn = document.getElementById("killRoomBtn");
const userList = document.getElementById("userList");

// State
let roomKey, username, isAdmin = false;
let pendingJoinRequest = null;

const GIPHY_API_KEY = "X2rfEL5mqbPjVprW2ev39QFtsE12J7Py";
const emojis = ["😀", "😂", "😍", "🤔", "😴", "😢", "😠", "😎", "😮", "🤯"];
const stickers = ["/stickers/sticker1.png", "/stickers/sticker2.png", "/stickers/sticker3.png"];

// Functions
function showChatScreen() {
    joinScreen.style.display = "none";
    chatScreen.style.display = "flex";
}

function displaySystemMessage(message) {
    const div = document.createElement("div");
    div.className = "message italic mb-2 text-gray-400 text-center";
    div.innerText = message;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displayMessage(user, message) {
  const div = document.createElement("div");
  div.className = "message mb-4 flex";
  const messageBubble = document.createElement("div");
  messageBubble.className = "p-3 rounded-lg max-w-xs";

  if (user === username) {
    div.classList.add("justify-end");
    messageBubble.classList.add("bg-blue-500", "text-white");
  } else {
    div.classList.add("justify-start");
    messageBubble.classList.add("bg-gray-700");
  }
  
  if (message.type === 'text') {
    messageBubble.innerHTML = `<span class="font-bold">${user}:</span> ${message.content}`;
  } else if (message.type === 'gif' || message.type === 'sticker') {
    messageBubble.innerHTML = `<span class="font-bold">${user}:</span><img src="${message.content}" class="mt-2 rounded-lg">`;
  }

  div.appendChild(messageBubble);
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displayFile(user, path) {
  const div = document.createElement("div");
  div.className = "message mb-4 flex";
  const bubbleClass = user === username ? 'bg-blue-500 text-white' : 'bg-gray-700';
  div.classList.add(user === username ? "justify-end" : "justify-start");
  div.innerHTML = `<div class="p-3 rounded-lg max-w-xs ${bubbleClass}"><span class="font-bold">${user} uploaded a file:</span> <a href="${path}" target="_blank" class="text-green-400 underline">${path.split('-').slice(1).join('-')}</a></div>`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateUserList(users) {
    userList.innerHTML = "";
    users.forEach(user => {
        const li = document.createElement("li");
        li.textContent = user.username + (user.id === socket.id ? " (You)" : "");
        userList.appendChild(li);
    });
}

// Event Listeners
createRoomBtn.onclick = () => {
    roomKey = roomKeyInput.value.trim();
    username = usernameInput.value.trim();
    if (!roomKey || !username) return alert("Please enter a username and a room key.");
    socket.emit("create-room", { roomKey, username });
};

joinRoomBtn.onclick = () => {
    roomKey = roomKeyInput.value.trim();
    username = usernameInput.value.trim();
    if (!roomKey || !username) return alert("Please enter a username and a room key.");
    socket.emit("join-room", { roomKey, username });
};

leaveBtn.onclick = () => {
  socket.emit("leave-room", { roomKey, username });
  chatScreen.style.display = "none";
  joinScreen.style.display = "flex";
  messagesDiv.innerHTML = "";
  roomKeyInput.value = "";
  isAdmin = false;
};

killRoomBtn.onclick = () => {
    if(isAdmin) {
        socket.emit("kill-room", { roomKey });
    }
};

messageInput.addEventListener("keydown", (e) => e.key === "Enter" && sendBtn.click());

sendBtn.onclick = () => {
  const message = messageInput.value.trim();
  if (message === "") return;
  socket.emit("chat-message", { roomKey, username, message: { type: 'text', content: message } });
  messageInput.value = "";
};

fileInput.onchange = () => {
  const file = fileInput.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append("file", file);
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload", true);
  xhr.upload.onprogress = (e) => {
    progressBar.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
    progressContainer.classList.remove('hidden');
  };
  xhr.onload = () => {
    if (xhr.status === 200) {
      const { path } = JSON.parse(xhr.responseText);
      if(path) socket.emit("file-uploaded", { roomKey, username, path });
    }
    setTimeout(() => {
        progressContainer.classList.add('hidden');
        progressBar.style.width = '0%';
    }, 1000);
  };
  xhr.send(formData);
};

approveJoinBtn.onclick = () => {
    if (pendingJoinRequest) {
        socket.emit("approve-join", { roomKey, userId: pendingJoinRequest.userId });
        joinRequestModal.classList.add("hidden");
        pendingJoinRequest = null;
    }
};

denyJoinBtn.onclick = () => {
    if (pendingJoinRequest) {
        socket.emit("deny-join", { roomKey, userId: pendingJoinRequest.userId });
        joinRequestModal.classList.add("hidden");
        pendingJoinRequest = null;
    }
};

emojiBtn.onclick = () => toggleMediaPicker("emoji");
gifBtn.onclick = () => toggleMediaPicker("gif");
stickerBtn.onclick = () => toggleMediaPicker("sticker");

function toggleMediaPicker(type) {
    if (mediaPicker.style.display === "block" && mediaPicker.dataset.type === type) {
        mediaPicker.style.display = "none";
        return;
    }
    mediaPicker.style.display = "block";
    mediaPicker.dataset.type = type;
    mediaPicker.innerHTML = ""; 

    if (type === "emoji") {
        emojis.forEach(emoji => {
            const btn = document.createElement("button");
            btn.innerHTML = emoji;
            btn.className = "m-1 text-2xl";
            btn.onclick = () => { messageInput.value += emoji; };
            mediaPicker.appendChild(btn);
        });
    } else if (type === "sticker") {
        stickers.forEach(sticker => {
            const img = document.createElement("img");
            img.src = sticker;
            img.className = "m-2 w-24 h-24 cursor-pointer inline-block";
            img.onclick = () => {
                socket.emit("chat-message", { roomKey, username, message: { type: 'sticker', content: sticker } });
                toggleMediaPicker();
            };
            mediaPicker.appendChild(img);
        });
    } else if (type === "gif") {
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Search for GIFs...";
        searchInput.className = "w-full p-2 rounded-lg bg-gray-700 text-white";
        searchInput.onkeydown = e => e.key === "Enter" && searchGifs(searchInput.value);
        mediaPicker.appendChild(searchInput);
        const resultsDiv = document.createElement("div");
        resultsDiv.className = "mt-2 grid grid-cols-3 gap-2";
        mediaPicker.appendChild(resultsDiv);
        searchGifs("trending");
    }
}

function searchGifs(query) {
    fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${query}&limit=12`)
        .then(res => res.json())
        .then(data => {
            const resultsDiv = mediaPicker.querySelector("div");
            resultsDiv.innerHTML = "";
            data.data.forEach(gif => {
                const img = document.createElement("img");
                img.src = gif.images.fixed_height.url;
                img.className = "cursor-pointer w-full";
                img.onclick = () => {
                    socket.emit("chat-message", { roomKey, username, message: { type: 'gif', content: img.src } });
                    toggleMediaPicker(); 
                };
                resultsDiv.appendChild(img);
            });
        });
}

// Socket.io Handlers
socket.on("room-created", (data) => {
    isAdmin = data.isAdmin;
    if(isAdmin) killRoomBtn.classList.remove("hidden");
    showChatScreen();
    displaySystemMessage("You created the room and are now the admin.");
});

socket.on("join-approved", (data) => {
    messagesDiv.innerHTML = "";
    data.messages.forEach(msg => displayMessage(msg.username, msg.message));
    data.files.forEach(file => displayFile(file.username, file.path));
    showChatScreen();
    displaySystemMessage("Your request was approved. Welcome to the room!");
});

socket.on("promoted-to-admin", () => {
    isAdmin = true;
    killRoomBtn.classList.remove("hidden");
    displaySystemMessage("The previous admin left. You are the new admin!");
});

socket.on("update-user-list", (users) => updateUserList(users));

socket.on("room-killed", () => {
    alert("The admin has ended the room.");
    leaveBtn.click();
});

socket.on("room-exists", (m) => alert(m));
socket.on("room-not-found", (m) => alert(m));
socket.on("admin-offline", (m) => alert(m));
socket.on("join-request-sent", (m) => alert(m));
socket.on("join-denied", (m) => alert(m));

socket.on("join-request", ({ userId, username: requestingUsername }) => {
    if (isAdmin) {
        pendingJoinRequest = { userId, username: requestingUsername };
        joinRequestUser.innerText = `${requestingUsername} wants to join the room.`;
        joinRequestModal.classList.remove("hidden");
    }
});

socket.on("chat-history", ({ messages, files }) => {
  messages.forEach((msg) => displayMessage(msg.username, msg.message));
  files.forEach((file) => displayFile(file.username, file.path));
});

socket.on("chat-message", ({ username, message }) => displayMessage(username, message));
socket.on("file-uploaded", ({ username, path }) => displayFile(username, path));
socket.on("user-joined", (username) => displaySystemMessage(`${username} joined the room`));
socket.on("user-left", (username) => displaySystemMessage(`${username} left the room`));
