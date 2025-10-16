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
const mediaPicker = document.getElementById("media-picker");
const joinRequestModal = document.getElementById("joinRequestModal");
const joinRequestUser = document.getElementById("joinRequestUser");
const approveJoinBtn = document.getElementById("approveJoinBtn");
const denyJoinBtn = document.getElementById("denyJoinBtn");
const uploadForm = document.getElementById("uploadForm");
const killRoomBtn = document.getElementById("killRoomBtn");
const userList = document.getElementById("userList");

// State
let roomKey, username, isAdmin = false;
let pendingJoinRequest = null;
const fileUploads = {};

const GIPHY_API_KEY = "X2rfEL5mqbPjVprW2ev39QFtsE12J7Py";
let emojis = [];

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
  } else if (message.type === 'gif') {
    messageBubble.innerHTML = `<span class="font-bold">${user}:</span><img src="${message.content}" class="mt-2 rounded-lg">`;
  }

  div.appendChild(messageBubble);
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getFileIcon(fileType) {
    if (fileType.startsWith("image")) return `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l-1-1m5 5l-2-2"></path></svg>`;
    if (fileType.startsWith("video")) return `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.55a1 1 0 01.45 1.74l-4.5 3.5a1 1 0 01-1.5-.74V9a1 1 0 011.5-.74zM4 6a2 2 0 012-2h4a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"></path></svg>`;
    if (fileType === "application/pdf") return `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`;
    return `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`;
}

function createProgressCircle(progress, xhr) {
    const size = 50;
    const strokeWidth = 4;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;

    const cancelBtn = `
        <foreignObject x="0" y="0" width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" class="w-full h-full flex items-center justify-center">
                <svg class="w-5 h-5 text-white cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" onclick="cancelUpload('${xhr.messageId}')">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </div>
        </foreignObject>
    `;

    return `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="relative">
            <circle stroke-width="${strokeWidth}" stroke="rgba(255, 255, 255, 0.3)" fill="transparent" r="${radius}" cx="${size/2}" cy="${size/2}"/>
            <circle stroke-width="${strokeWidth}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke="rgb(255, 255, 255)" fill="transparent" r="${radius}" cx="${size/2}" cy="${size/2}" transform="rotate(-90 ${size/2} ${size/2})"></circle>
            ${progress < 100 ? cancelBtn : ''}
        </svg>
    `;
}

function cancelUpload(messageId) {
    if (fileUploads[messageId]) {
        fileUploads[messageId].abort();
    }
}

function displayFile(user, file, messageId) {
    const messageDiv = document.getElementById(messageId);
    const bubbleClass = user === username ? 'bg-blue-500 text-white' : 'bg-gray-700';

    const truncatedName = file.name.length > 15 ? file.name.substring(0, 10) + "..." + file.name.substring(file.name.length - 5) : file.name;

    const fileHtml = `
        <div class="flex items-center">
            <div class="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-600 mr-4">
                ${getFileIcon(file.type)}
            </div>
            <div class="overflow-hidden">
                <div class="font-medium truncate">${truncatedName}</div>
                <div class="text-sm text-gray-300">${formatBytes(file.size)} - ${file.type.split('/')[1].toUpperCase()} File</div>
            </div>
        </div>
        <div class="flex gap-2 mt-3">
            <a href="${file.path}" target="_blank" class="flex-1 text-center bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg text-sm">Open</a>
            <a href="${file.path}" download="${file.name}" class="flex-1 text-center bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg text-sm">Save As</a>
        </div>
    `;

    if (messageDiv) {
        const bubble = messageDiv.querySelector(".p-3");
        bubble.innerHTML = fileHtml;
        bubble.style.width = '320px';
    } else {
        const div = document.createElement("div");
        div.id = messageId;
        div.className = `message mb-4 flex ${user === username ? 'justify-end' : 'justify-start'}`;
        div.innerHTML = `<div class="p-3 rounded-lg max-w-xs ${bubbleClass}" style="width: 320px;">${fileHtml}</div>`;
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
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
messageInput.addEventListener("focus", () => {
    mediaPicker.style.display = "none";
});

sendBtn.onclick = () => {
  const message = messageInput.value.trim();
  if (message === "") return;
  socket.emit("chat-message", { roomKey, username, message: { type: 'text', content: message } });
  messageInput.value = "";
};

fileInput.onchange = () => {
  const file = fileInput.files[0];
  if (!file) return;

  const messageId = `file-${Date.now()}`;
  const div = document.createElement("div");
  div.className = "message mb-4 flex justify-end";
  div.id = messageId;

  const messageBubble = document.createElement("div");
  messageBubble.className = "p-3 rounded-lg max-w-xs bg-blue-500 text-white";
  messageBubble.style.width = '320px';
  
  const truncatedName = file.name.length > 15 ? file.name.substring(0, 10) + "..." + file.name.substring(file.name.length - 5) : file.name;

  const xhr = new XMLHttpRequest();
  xhr.messageId = messageId;

  const initialContent = `
    <div class="flex items-center gap-3">
        <div class="progress-circle relative w-12 h-12 flex-shrink-0 flex items-center justify-center">${createProgressCircle(0, xhr)}</div>
        <div class="overflow-hidden">
            <div class="font-medium truncate">${truncatedName}</div>
            <div class="text-sm text-gray-300 upload-status">0 Bytes / ${formatBytes(file.size)}</div>
        </div>
    </div>`;

  messageBubble.innerHTML = initialContent;
  div.appendChild(messageBubble);
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  const formData = new FormData();
  formData.append("file", file);
  
  fileUploads[messageId] = xhr;
  
  xhr.open("POST", "/upload", true);

  xhr.upload.onprogress = (e) => {
    const percent = Math.round((e.loaded / e.total) * 100);
    const progressCircleDiv = messageBubble.querySelector(".progress-circle");
    progressCircleDiv.innerHTML = createProgressCircle(percent, xhr);
    const uploadStatus = messageBubble.querySelector(".upload-status");
    uploadStatus.textContent = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;
  };

  xhr.onload = () => {
    delete fileUploads[messageId];
    if (xhr.status === 200) {
      const { path } = JSON.parse(xhr.responseText);
      if(path) {
        const fileData = { name: file.name, size: file.size, type: file.type, path };
        displayFile(username, fileData, messageId); // Immediately update UI for sender
        socket.emit("file-uploaded", { roomKey, username, file: fileData, messageId });
      }
    } else {
      if (xhr.statusText !== 'abort') {
          messageBubble.innerHTML = "File upload failed";
      } else {
        const messageToRemove = document.getElementById(messageId);
        if(messageToRemove) messageToRemove.remove();
      }
    }
  };

  xhr.send(formData);
  fileInput.value = "";
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

function toggleMediaPicker(type) {
    if (mediaPicker.style.display === "block" && mediaPicker.dataset.type === type) {
        mediaPicker.style.display = "none";
        return;
    }
    mediaPicker.style.display = "block";
    mediaPicker.dataset.type = type;
    mediaPicker.innerHTML = ""; 

    if (type === "emoji") {
        if (emojis.length === 0) {
            fetch('/emojis.json').then(res => res.json()).then(data => {
                emojis = data.map(emoji => emoji.unicode);
                renderEmojis();
            });
        } else {
            renderEmojis();
        }
    } else if (type === "gif") {
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Search for GIFs...";
        searchInput.className = "w-full p-2 rounded-lg bg-gray-700 text-white";
        searchInput.oninput = () => {
            searchGifs(searchInput.value);
        };
        mediaPicker.appendChild(searchInput);
        const resultsDiv = document.createElement("div");
        resultsDiv.className = "mt-2 grid grid-cols-3 gap-2";
        mediaPicker.appendChild(resultsDiv);
        
        function searchGifs(query) {
            fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${query}&limit=12`)
                .then(res => res.json())
                .then(data => {
                    resultsDiv.innerHTML = "";
                    data.data.forEach(gif => {
                        const img = document.createElement("img");
                        img.src = gif.images.fixed_height.url;
                        img.className = "cursor-pointer w-full";
                        img.onclick = () => {
                            socket.emit("chat-message", { roomKey, username, message: { type: 'gif', content: img.src } });
                            mediaPicker.style.display = "none";
                        };
                        resultsDiv.appendChild(img);
                    });
                });
        }

        searchGifs("trending");
    }
}

function renderEmojis() {
    mediaPicker.innerHTML = "";
    emojis.forEach(emoji => {
        const btn = document.createElement("button");
        btn.innerHTML = emoji;
        btn.className = "m-1 text-2xl";
        btn.onclick = () => { messageInput.value += emoji; };
        mediaPicker.appendChild(btn);
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
    data.files.forEach(file => displayFile(file.username, file.file, file.messageId));
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
  files.forEach((file) => displayFile(file.username, file.file, file.messageId));
});

socket.on("chat-message", ({ username, message }) => displayMessage(username, message));

socket.on("file-uploaded", ({ username: user, file, messageId }) => {
    if (user !== username) {
        displayFile(user, file, messageId);
    }
});

socket.on("user-joined", (username) => displaySystemMessage(`${username} joined the room`));
socket.on("user-left", (username) => displaySystemMessage(`${username} left the room`));
