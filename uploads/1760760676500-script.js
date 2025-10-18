const socket = window.io()

const joinBtn = document.getElementById("joinBtn")
const roomKeyInput = document.getElementById("roomKey")
const usernameInput = document.getElementById("username")
const chatScreen = document.getElementById("chatScreen")
const joinScreen = document.getElementById("joinScreen")
const messageInput = document.getElementById("messageInput")
const sendBtn = document.getElementById("sendBtn")
const messagesDiv = document.getElementById("messages")

const genKeyBtn = document.getElementById("genKeyBtn")
const copyKeyBtn = document.getElementById("copyKeyBtn")
const copyKeyBtnChat = document.getElementById("copyKeyBtnChat")
const roomKeyLabel = document.getElementById("roomKeyLabel")
const leaveBtn = document.getElementById("leaveBtn")

const fileInput = document.getElementById("fileInput")
const fileBtn = document.getElementById("fileBtn")
const uploadBtn = document.getElementById("uploadBtn")
const fileName = document.getElementById("fileName")

let roomKey, username

function randomKey(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let s = ""
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast("Room key copied")
  } catch {
    alert("Failed to copy")
  }
}

function toast(msg) {
  // lightweight inline toast
  const t = document.createElement("div")
  t.textContent = msg
  t.className = "fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-800 text-gray-100 px-3 py-1.5 rounded text-sm shadow"
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 1500)
}

function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

genKeyBtn.onclick = () => {
  roomKeyInput.value = randomKey(8)
  toast("Generated room key")
}

copyKeyBtn.onclick = () => {
  const key = roomKeyInput.value.trim()
  if (!key) return alert("No room key to copy")
  copyToClipboard(key)
}

copyKeyBtnChat.onclick = () => {
  if (!roomKey) return
  copyToClipboard(roomKey)
}

leaveBtn.onclick = () => {
  // simple reload to reset state
  window.location.reload()
}

fileBtn.onclick = () => fileInput.click()
fileInput.onchange = () => {
  fileName.textContent = fileInput.files?.[0]?.name || ""
}

joinBtn.onclick = () => {
  roomKey = roomKeyInput.value.trim()
  username = usernameInput.value.trim()
  if (!roomKey || !username) return alert("Enter both fields!")
  joinScreen.classList.add("hidden")
  chatScreen.classList.remove("hidden")
  roomKeyLabel.textContent = roomKey
  socket.emit("join-room", { roomKey, username })
  // announce self join locally
  const div = document.createElement("div")
  div.className = "italic mb-2 text-gray-400"
  div.innerText = `You joined the room`
  messagesDiv.appendChild(div)
  scrollToBottom()
}

sendBtn.onclick = () => {
  const message = messageInput.value.trim()
  if (message === "") return
  socket.emit("chat-message", { roomKey, username, message })
  messageInput.value = ""
}

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    sendBtn.onclick()
  }
})

uploadBtn.onclick = async () => {
  const file = fileInput.files?.[0]
  if (!file) return alert("Choose a file first")
  if (file.size > 10 * 1024 * 1024) return alert("File too large (max 10MB)")
  try {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/upload", { method: "POST", body: fd })
    if (!res.ok) throw new Error("Upload failed")
    const { fileUrl } = await res.json()
    socket.emit("file-shared", { roomKey, username, fileUrl })
    // reset chooser
    fileInput.value = ""
    fileName.textContent = ""
  } catch (err) {
    alert(err.message || "Upload error")
  }
}

function renderFileMessage({ username: user, fileUrl }) {
  const ext = (fileUrl.split(".").pop() || "").toLowerCase()
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)
  const container = document.createElement("div")
  container.className = "mb-2"

  const header = document.createElement("div")
  header.className = "text-sm mb-1"
  header.innerHTML = `<span class="font-bold text-blue-400">${user}:</span> shared a file`
  container.appendChild(header)

  if (isImage) {
    const a = document.createElement("a")
    a.href = fileUrl
    a.target = "_blank"
    a.rel = "noopener noreferrer"
    const img = document.createElement("img")
    img.src = fileUrl
    img.alt = `Shared by ${user}`
    img.className = "rounded-lg max-h-56 w-auto border border-gray-800"
    a.appendChild(img)
    container.appendChild(a)
  } else {
    const a = document.createElement("a")
    a.href = fileUrl
    a.target = "_blank"
    a.rel = "noopener noreferrer"
    a.download = ""
    a.className = "inline-flex items-center gap-2 px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm"
    a.innerHTML = `<span class="opacity-80">⬇</span><span>Download file</span>`
    container.appendChild(a)
  }

  messagesDiv.appendChild(container)
  scrollToBottom()
}

socket.on("chat-message", ({ username, message }) => {
  const div = document.createElement("div")
  div.classList.add("message", "mb-2")
  div.innerHTML = `<span class="font-bold text-blue-400">${username}:</span> ${message}`
  messagesDiv.appendChild(div)
  scrollToBottom()
})

socket.on("user-joined", (username) => {
  const div = document.createElement("div")
  div.classList.add("message", "italic", "mb-2", "text-gray-400")
  div.innerText = `${username} joined the room`
  messagesDiv.appendChild(div)
  scrollToBottom()
})

socket.on("file-shared", (payload) => {
  renderFileMessage(payload)
})
