// This script handles the real-time chat functionality using Socket.io.
// The message scrolling is handled by the browser's default behavior with the new flexbox layout.

document.addEventListener('DOMContentLoaded', () => {
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
    const fileBtn = document.getElementById("fileBtn");
    const emojiBtn = document.getElementById("emojiBtn");
    const mediaPicker = document.getElementById("media-picker");
    const joinRequestModal = document.getElementById("joinRequestModal");
    const joinRequestUser = document.getElementById("joinRequestUser");
    const approveJoinBtn = document.getElementById("approveJoinBtn");
    const denyJoinBtn = document.getElementById("denyJoinBtn");
    const uploadForm = document.getElementById("uploadForm");
    const killRoomBtn = document.getElementById("killRoomBtn");
    const userList = document.getElementById("userList");
    const cancelUploadModal = document.getElementById("cancelUploadModal");
    const confirmCancelBtn = document.getElementById("confirmCancelBtn");
    const denyCancelBtn = document.getElementById("denyCancelBtn");
    const previewModal = document.getElementById("previewModal");
    const previewContent = document.getElementById("previewContent");
    const closePreview = document.getElementById("closePreview");
    const userCount = document.getElementById("userCount");

    // Mobile user sidebar elements
    const mobileUsersBtn = document.getElementById("mobileUsersBtn");
    const mobileUserSidebar = document.getElementById("mobileUserSidebar");
    const mobileUserBackdrop = document.getElementById("mobileUserBackdrop");
    const closeMobileSidebar = document.getElementById("closeMobileSidebar");
    const mobileUserList = document.getElementById("mobileUserList");
    const mobileUserCount = document.getElementById("mobileUserCount");
    const mobileUserCountText = document.getElementById("mobileUserCountText");

    // Warning modals
    const leaveChatModal = document.getElementById("leaveChatModal");
    const confirmLeaveBtn = document.getElementById("confirmLeaveBtn");
    const cancelLeaveBtn = document.getElementById("cancelLeaveBtn");
    const endRoomModal = document.getElementById("endRoomModal");
    const confirmEndRoomBtn = document.getElementById("confirmEndRoomBtn");
    const cancelEndRoomBtn = document.getElementById("cancelEndRoomBtn");
    const removeUserModal = document.getElementById("removeUserModal");
    const confirmRemoveUserBtn = document.getElementById("confirmRemoveUserBtn");
    const cancelRemoveUserBtn = document.getElementById("cancelRemoveUserBtn");
    const removeUserText = document.getElementById("removeUserText");


    // State
    let roomKey, username, isAdmin = false;
    let userToRemove = null; // Store user info for removal
    let pendingJoinRequest = null;
    let uploadToCancel = null;
    const fileUploads = {};
    let emojis = [];
    let fileToSend = null;
    let lastMessageUser = null;

    // Production-grade typing indicator state
    let isTyping = false;
    let typingTimeout = null;
    const typingUsers = new Map(); // userId -> username
    const typingSafetyTimeouts = new Map(); // userId -> timeout

    // Track current room users for seen status filtering
    const currentRoomUsers = new Set();

    // Track tab visibility for proper seen status
    let isTabVisible = !document.hidden;
    const pendingSeenMessages = new Set(); // Messages to mark as seen when tab becomes visible

    // Media paste state
    const pastedMedia = []; // Array to hold {file, objectUrl} before sending
    const MAX_MEDIA_ITEMS = 10;
    let mediaPasteEnabled = true; // Disable when limit reached

    // Audio recording state
    let audioRecorder = null;
    let isRecording = false;
    let recordingTimer = null;
    let recordingStartTime = null;
    let audioPreviewBlob = null;
    let audioDuration = 0;
    const recordingUsers = new Map(); // userId -> username (for recording indicator)
    let recordingIndicatorActive = false;

    // Reply to message state
    let replyContext = null; // { messageId, sender, previewText, previewType, originalMessage }

    // Audio recording UI elements
    const recordBtn = document.getElementById("recordBtn");
    const recordingTimerUI = document.getElementById("recordingTimer");
    const recordingIndicator = document.getElementById("recordingIndicator");

    // Voice Chat State
    let localStream = null;
    let peers = {}; // socketId -> RTCPeerConnection
    const voiceContainer = document.getElementById("voice-container");
    const videoGrid = document.getElementById("video-grid");
    // Ensure we are selecting the correct buttons
    const joinVoiceBtn = document.getElementById("joinVoiceBtn");
    const joinVideoBtn = document.getElementById("joinVideoBtn");
    const leaveVoiceBtn = document.getElementById("leaveVoiceBtn");

    // STUN Servers for ICE candidates
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    // Event Listeners for Room Management
    if (createRoomBtn) {
        createRoomBtn.addEventListener("click", () => {
            username = usernameInput.value.trim();
            roomKey = roomKeyInput.value.trim();
            if (!username || !roomKey) return alert("Enter username and room key!");
            console.log("Creating room:", roomKey, "User:", username);
            socket.emit("create-room", { roomKey, username });
        });
    }

    if (joinRoomBtn) {
        joinRoomBtn.addEventListener("click", () => {
            username = usernameInput.value.trim();
            roomKey = roomKeyInput.value.trim();
            if (!username || !roomKey) return alert("Enter username and room key!");
            console.log("Joining room:", roomKey, "User:", username);
            socket.emit("join-room", { roomKey, username });
        });
    }

    // Helper to save session
    function saveSession() {
        localStorage.setItem("roomKey", roomKey);
        localStorage.setItem("username", username);
        localStorage.setItem("isAdmin", isAdmin);
    }

    // Reply preview bar elements
    const replyPreviewBar = document.getElementById("replyPreviewBar");
    const replyCancelBtn = document.getElementById("replyCancelBtn");

    // Functions
    function showChatScreen() {
        joinScreen.style.display = "none";
        chatScreen.style.display = "flex";
        document.body.classList.add("chat-active");
    }

    function displaySystemMessage(message) {
        const div = document.createElement("div");
        div.className = "system-message";
        div.innerText = message;
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        lastMessageUser = null;
    }

    function displayMessage(user, message, id, seenBy = [], replyTo = null) {
        // If message already exists (e.g. from file upload flow), don't duplicate, just update if needed
        if (id && document.getElementById(id)) {
            const existingMsg = document.getElementById(id);
            // Update seen status if needed
            const seenStatus = existingMsg.querySelector('.seen-status');
            if (seenStatus) {
                const otherViewers = seenBy.filter(u => u !== username);
                if (otherViewers.length > 0) {
                    seenStatus.textContent = `Seen by ${otherViewers.join(", ")}`;
                    seenStatus.classList.add('visible');
                }
            }
            return;
        }

        const isConsecutive = lastMessageUser === user;

        const bubbleClass = user === username ? 'sent-message' : 'received-message';
        const alignmentClass = user === username ? 'justify-end' : 'justify-start';

        const wrapper = document.createElement("div");
        // Instagram-like grouping: tighter spacing for same user, larger when sender changes
        wrapper.className = `message flex flex-col ${user === username ? 'items-end' : 'items-start'} ${isConsecutive ? 'same-user' : 'new-user'}`;

        const messageRow = document.createElement("div");
        // Keep row alignment across full width for left/right alignment
        messageRow.className = `flex flex-col w-full ${alignmentClass} message-row`;

        const messageBubble = document.createElement("div");

        // Build quoted reply HTML if present
        let quotedReplyHtml = '';
        if (replyTo) {
            quotedReplyHtml = `
                    <div class="quoted-reply" onclick="scrollToMessage('${replyTo.messageId}')">
                        <div class="quoted-sender">~${replyTo.sender}</div>
                        <div class="quoted-preview">${replyTo.previewText || 'Message'}</div>
                    </div>
                `;
        }

        let contentHtml = '';
        if (message.type === 'text') {
            messageBubble.className = `${bubbleClass}`;
            // Escape HTML but preserve line breaks
            const escapedContent = message.content
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
            contentHtml = escapedContent;
        } else if (message.type === 'sticker') {
            // Stickers have no bubble - just the image
            messageBubble.className = 'sticker-bubble';
            contentHtml = `
                    <div class="relative group">
                        <img src="${message.content}" class="sticker-message" loading="lazy">
                        <a href="${message.content}" download="sticker-${Date.now()}.png" class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
                            <i class="fas fa-download"></i>
                        </a>
                    </div>`;
        } else {
            messageBubble.className = `${bubbleClass} message-bubble-media`;
            if (message.type === 'gif') {
                contentHtml = `
                    <div class="relative group">
                        <img src="${message.content}" class="message-file-preview" loading="lazy">
                        <a href="${message.content}" download="gif-${Date.now()}.gif" class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
                            <i class="fas fa-download"></i>
                        </a>
                    </div>`;
            } else if (message.type === 'image') {
                contentHtml = `
                    <div class="relative group">
                        <img src="${message.content}" class="message-file-preview" loading="lazy">
                        <a href="${message.content}" download="image-${Date.now()}.jpg" class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
                            <i class="fas fa-download"></i>
                        </a>
                    </div>`;
            } else if (message.type === 'video') {
                contentHtml = `
                    <div class="relative group">
                        <video src="${message.content}" class="message-file-preview" controls></video>
                        <a href="${message.content}" download="video-${Date.now()}.mp4" class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
                            <i class="fas fa-download"></i>
                        </a>
                    </div>`;
            } else if (message.type === 'audio') {
                // Don't override bubbleClass for audio - let it stay as sender/receiver class
                contentHtml = `
                    <div class="flex items-center gap-3">
                        <i class="fas fa-microphone text-lg"></i>
                        <audio controls class="flex-1" style="height: 32px; max-width: 200px;">
                            <source src="${message.content}" type="audio/webm">
                        </audio>
                        <a href="${message.content}" download="audio-${Date.now()}.webm" class="text-white hover:text-purple-200" title="Download">
                            <i class="fas fa-download"></i>
                        </a>
                    </div>`;
            }
        }
        if (!isConsecutive) {
            if (user === username) {
                // Sender side - No "You" label, just content
                if (message.type === 'text') {
                    messageBubble.innerHTML = quotedReplyHtml + `<span class="text-sm leading-relaxed">${contentHtml}</span>`;
                } else {
                    messageBubble.innerHTML = quotedReplyHtml + contentHtml;
                }

                messageRow.appendChild(messageBubble);
            } else {
                // Receiver side - Show username only (no icon)
                const displayName = `~${user}`;
                if (message.type === 'text') {
                    messageBubble.innerHTML = `<span class="font-semibold text-xs mb-1 block opacity-90">${displayName}</span>` + quotedReplyHtml + `<span class="text-sm leading-relaxed">${contentHtml}</span>`;
                } else {
                    messageBubble.innerHTML = quotedReplyHtml + contentHtml;
                }

                messageRow.appendChild(messageBubble);
            }
        } else {
            messageBubble.innerHTML = quotedReplyHtml + (message.type === 'text' ? `<span class="text-sm leading-relaxed">${contentHtml}</span>` : contentHtml);
            messageRow.appendChild(messageBubble);
        }

        wrapper.appendChild(messageRow);

        // Add Seen Status (will be shown/hidden based on whether this is the last message)
        const seenStatus = document.createElement("div");
        seenStatus.className = "seen-status";
        seenStatus.setAttribute('data-msg-user', user);
        wrapper.appendChild(seenStatus);

        if (id) {
            wrapper.id = id;
            if (user !== username) {
                // Only mark as seen if tab is visible (user is actually viewing)
                if (isTabVisible) {
                    socket.emit("mark-seen", { roomKey, messageId: id, username });
                } else {
                    // Queue to mark as seen when user returns to tab
                    pendingSeenMessages.add(id);
                }
            }
        }

        messagesDiv.appendChild(wrapper);

        // Update seen status display - only show on last message from sender
        if (user === username && seenBy && seenBy.length > 0) {
            updateSeenStatusDisplay(user, seenBy);
        }

        // Smooth scroll
        messagesDiv.scrollTo({
            top: messagesDiv.scrollHeight,
            behavior: 'smooth'
        });

        lastMessageUser = user;
    }

    // Unified Call Functions (Voice & Video)

    if (joinVoiceBtn) {
        joinVoiceBtn.addEventListener("click", () => joinCall(false));
    }
    if (joinVideoBtn) {
        joinVideoBtn.addEventListener("click", () => joinCall(true));
    }
    if (leaveVoiceBtn) {
        leaveVoiceBtn.addEventListener("click", leaveVoice);
    }

    async function joinCall(videoEnabled) {
        console.log(`Join ${videoEnabled ? 'Video' : 'Voice'} Clicked`);
        try {
            const constraints = {
                audio: true,
                video: videoEnabled
            };

            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log("Local stream acquired");

            // Toggle Buttons
            if (joinVoiceBtn) joinVoiceBtn.classList.add("hidden");
            if (joinVideoBtn) joinVideoBtn.classList.add("hidden");

            if (leaveVoiceBtn) {
                leaveVoiceBtn.classList.remove("hidden");
                leaveVoiceBtn.style.display = 'flex';
                // Update text based on mode
                const textSpan = leaveVoiceBtn.querySelector('.full-text');
                if (textSpan) textSpan.textContent = videoEnabled ? "Leave Video" : "Leave Voice";
            }

            // Show video grid if video enabled
            if (videoEnabled && videoGrid) {
                videoGrid.innerHTML = ''; // Clear previous
                videoGrid.classList.remove("hidden");

                // Add local video preview
                const localWrapper = document.createElement('div');
                localWrapper.className = "relative group bg-black rounded-xl overflow-hidden aspect-video transform scale-x-[-1]"; // Mirror local

                const localVideo = document.createElement('video');
                localVideo.srcObject = localStream;
                localVideo.autoplay = true;
                localVideo.muted = true; // Mute local to prevent feedback
                localVideo.className = "w-full h-full object-cover";

                // Label
                const label = document.createElement('div');
                label.className = "absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded-md text-xs text-white transform scale-x-[-1]"; // Un-mirror text
                label.textContent = "You";

                localWrapper.appendChild(localVideo);
                localWrapper.appendChild(label);
                videoGrid.appendChild(localWrapper);
            }

            // Notify server - distinct events could be used, or just 'join-voice' with metadata
            // For now, re-using 'join-voice' but logic on client side handles tracks
            // Ideally server should know to broadcast to video-peers, but current server logic 
            // likely just broadcasts 'voice-users' to everyone in room.
            // Since WebRTC negotiation handles tracks, this might just work if we just add tracks!

            console.log("Emitting join-voice for room:", roomKey);
            socket.emit("join-voice", { roomKey });
        } catch (err) {
            console.error("Error accessing media devices:", err);
            alert("Could not access media devices: " + err.message);
        }
    }

    function leaveVoice() {
        console.log("Leaving call");
        // Stop local stream
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        // Close all peer connections
        Object.values(peers).forEach(peer => peer.close());
        peers = {};

        // Remove elements
        if (voiceContainer) voiceContainer.innerHTML = "";
        if (videoGrid) {
            videoGrid.innerHTML = "";
            videoGrid.classList.add("hidden");
        }

        // UI Reset
        if (joinVoiceBtn) joinVoiceBtn.classList.remove("hidden");
        if (joinVideoBtn) joinVideoBtn.classList.remove("hidden");

        if (leaveVoiceBtn) {
            leaveVoiceBtn.classList.add("hidden");
            leaveVoiceBtn.style.display = 'none';
        }

        // Notify server
        socket.emit("leave-voice", { roomKey });
    }

    // Creating a peer connection
    function createPeerConnection(targetSocketId, initiate) {
        console.log(`Creating peer connection to ${targetSocketId}. Initiate: ${initiate}`);
        if (peers[targetSocketId]) return peers[targetSocketId];

        const pc = new RTCPeerConnection(rtcConfig);
        peers[targetSocketId] = pc;

        // Add local stream tracks to PeerConnection
        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`Sending ICE candidate to ${targetSocketId}`);
                socket.emit("voice-signal", {
                    to: targetSocketId,
                    signal: { type: "candidate", candidate: event.candidate }
                });
            }
        };

        // Handle remote stream
        pc.ontrack = (event) => {
            console.log(`Received remote track ${event.track.kind} from ${targetSocketId}`);
            const stream = event.streams[0];

            if (event.track.kind === 'video') {
                // Video Track -> Add to Video Grid
                let vidWrapper = document.getElementById(`video-${targetSocketId}`);
                if (!vidWrapper) {
                    vidWrapper = document.createElement('div');
                    vidWrapper.id = `video-${targetSocketId}`;
                    vidWrapper.className = "relative group bg-black rounded-xl overflow-hidden aspect-video";

                    const vidEl = document.createElement('video');
                    vidEl.id = `vid-el-${targetSocketId}`;
                    vidEl.autoplay = true;
                    vidEl.className = "w-full h-full object-cover";

                    // Label placeholder (we might not have username easily here unless passed)
                    // But we can update it if we have a map

                    vidWrapper.appendChild(vidEl);
                    if (videoGrid) {
                        videoGrid.classList.remove("hidden"); // Ensure visible
                        videoGrid.appendChild(vidWrapper);
                    }
                }
                const vidEl = document.getElementById(`vid-el-${targetSocketId}`);
                if (vidEl) vidEl.srcObject = stream;

            } else if (event.track.kind === 'audio') {
                // Audio Track -> Add to Voice Container (hidden)
                let audioEl = document.getElementById(`audio-${targetSocketId}`);
                if (!audioEl) {
                    audioEl = document.createElement("audio");
                    audioEl.id = `audio-${targetSocketId}`;
                    audioEl.autoplay = true;
                    if (voiceContainer) voiceContainer.appendChild(audioEl);
                }
                audioEl.srcObject = stream;
            }
        };

        // If initiating, create offer
        if (initiate) {
            pc.createOffer().then(offer => {
                console.log(`Created offer for ${targetSocketId}`);
                pc.setLocalDescription(offer);
                socket.emit("voice-signal", {
                    to: targetSocketId,
                    signal: { type: "offer", offer }
                });
            });
        }

        return pc;
    }

    // Socket listeners for Voice
    socket.on("voice-users", (users) => {
        console.log("Received existing voice users:", users);
        // Connect to all existing users
        users.forEach(userId => {
            if (userId !== socket.id) {
                createPeerConnection(userId, true);
            }
        });
    });

    socket.on("user-joined-voice", (userId) => {
        console.log("User joined voice:", userId);
    });

    socket.on("user-left-voice", (userId) => {
        console.log("User left voice:", userId);
        if (peers[userId]) {
            peers[userId].close();
            delete peers[userId];
        }
        // Remove audio
        const audioEl = document.getElementById(`audio-${userId}`);
        if (audioEl) audioEl.remove();

        // Remove video
        const vidWrapper = document.getElementById(`video-${userId}`);
        if (vidWrapper) vidWrapper.remove();

        // Hide grid if empty (except local)
        // logic to check if grid has other videos... 
    });

    socket.on("voice-signal", async ({ from, signal }) => {
        console.log(`Received signal type ${signal.type} from ${from}`);
        if (from === socket.id) return;

        let pc = peers[from];
        if (!pc) {
            pc = createPeerConnection(from, false);
        }

        if (signal.type === "offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("voice-signal", {
                to: from,
                signal: { type: "answer", answer }
            });
        } else if (signal.type === "answer") {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
        } else if (signal.type === "candidate") {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (e) {
                console.error("Error adding ice candidate", e);
            }
        }
    });

    // Handle existing leave logic
    if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
            // Also leave voice if active
            if (localStream) leaveVoice();
        });
    } else {
        console.error("Leave Chat Button NOT FOUND");
    }

    // Also handle window unload
    window.addEventListener("beforeunload", () => {
        if (localStream) leaveVoice();
    });

    // Start of Socket Event Listeners

    socket.on("room-created", ({ isAdmin: adminStatus }) => {
        isAdmin = adminStatus;
        saveSession();
        showChatScreen();
        displaySystemMessage(`Room created! Share key: ${roomKey}`);
    });

    socket.on("room-exists", (msg) => {
        alert(msg);
    });

    socket.on("room-not-found", (msg) => {
        alert(msg || "Room not found");
        // Clear session if room doesn't exist
        localStorage.removeItem("roomKey");
        localStorage.removeItem("username");
        localStorage.removeItem("isAdmin");
    });

    socket.on("join-request-sent", (msg) => {
        alert(msg);
    });

    socket.on("admin-offline", (msg) => {
        alert(msg);
    });

    socket.on("join-approved", ({ messages }) => {
        saveSession();
        showChatScreen();
        messages.forEach(msg => {
            if (msg.file) {
                displayFile(msg.username, msg.file, msg.id, msg.seenBy);
            } else {
                displayMessage(msg.username, msg.message, msg.id, msg.seenBy, msg.replyTo);
            }
        });
        displaySystemMessage("You joined the room.");
    });

    socket.on("join-denied", (msg) => {
        alert(msg);
    });

    socket.on("join-request", ({ userId, username }) => {
        joinRequestUser.innerText = `${username} wants to join.`;
        joinRequestModal.classList.remove("hidden");
        pendingJoinRequest = userId;
    });

    approveJoinBtn.onclick = () => {
        if (pendingJoinRequest) {
            socket.emit("approve-join", { roomKey, userId: pendingJoinRequest });
            joinRequestModal.classList.add("hidden");
            pendingJoinRequest = null;
        }
    };

    denyJoinBtn.onclick = () => {
        if (pendingJoinRequest) {
            socket.emit("deny-join", { roomKey, userId: pendingJoinRequest });
            joinRequestModal.classList.add("hidden");
            pendingJoinRequest = null;
        }
    };

    socket.on("update-user-list", (users) => {
        updateUserList(users);
    });

    socket.on("user-joined", (username) => {
        displaySystemMessage(`${username} joined the room.`);
    });

    socket.on("user-left", (username) => {
        displaySystemMessage(`${username} left the room.`);
    });

    socket.on("user-removed", () => {
        alert("You have been removed from the room.");
        location.reload();
    });

    socket.on("room-killed", () => {
        alert("The admin has ended the room.");
        location.reload();
    });

    socket.on("room-inactive", (msg) => {
        alert(msg);
        location.reload();
    });

    socket.on("promoted-to-admin", () => {
        isAdmin = true;
        killRoomBtn.classList.remove("hidden");
        displaySystemMessage("You are now the admin of this room.");
        saveSession();
    });

    socket.on("chat-message", (entry) => {
        displayMessage(entry.username, entry.message, entry.id, entry.seenBy, entry.replyTo);
    });

    socket.on("file-uploaded", (entry) => {
        displayFile(entry.username, entry.file, entry.id, entry.seenBy);
    });

    socket.on("message-seen-update", ({ messageId, seenBy }) => {
        // Update the specific message's seen status data-attribute or UI
        const msgElement = document.getElementById(messageId);
        if (msgElement) {
            const seenStatus = msgElement.querySelector('.seen-status');
            // We only update the text if it's currently relevant (processed in display/update logic)
            // But simpler is to re-run the display logic filter

            // Update the internal seenBy if we were tracking it in memory (we aren't really, just DOM)
            // But we need to update the sender's view
        }

        // To properly update "Seen by X, Y", we need to know who sent the message
        // The easiest way with current functions is to re-evaluate the "Seen by" label
        // We'll traverse all messages to update the display
        const allMessages = messagesDiv.querySelectorAll('.message');
        // This is a bit heavy but ensures correctness with the 'last message only' rule
        // Optimization: trigger a debounced update or specific update

        // Quick fix: Update the specific message's seen list visually
        // For simplicity in this vanilla JS app, we can re-call updateSeenStatusDisplay 
        // if we know the user. 
        // Let's just update the specific message for now if it's the sender
        if (msgElement) {
            // Find who sent it
            // Check class
            const isSender = msgElement.querySelector('.sent-message');
            if (isSender) {
                updateSeenStatusDisplay(username, seenBy);
            }
        }
    });

    // Typing Indicators
    socket.on("user-typing-start", ({ userId, username: typerName }) => {
        typingUsers.set(userId, typerName);

        // Clear safety timeout if exists
        if (typingSafetyTimeouts.has(userId)) {
            clearTimeout(typingSafetyTimeouts.get(userId));
        }

        // Set safety timeout (3s) to remove indicator even if stop event missed
        const safetyTimeout = setTimeout(() => {
            typingUsers.delete(userId);
            typingSafetyTimeouts.delete(userId);
            updateTypingIndicator();
        }, 3000);

        typingSafetyTimeouts.set(userId, safetyTimeout);
        updateTypingIndicator();
    });

    socket.on("user-typing-stop", ({ userId }) => {
        typingUsers.delete(userId);
        if (typingSafetyTimeouts.has(userId)) {
            clearTimeout(typingSafetyTimeouts.get(userId));
            typingSafetyTimeouts.delete(userId);
        }
        updateTypingIndicator();
    });

    function updateTypingIndicator() {
        const typingIndicator = document.getElementById("typingIndicator");
        const users = Array.from(typingUsers.values());

        if (users.length > 0 && !recordingIndicatorActive) {
            const text = formatTypingText(users);
            typingIndicator.querySelector(".typing-text").textContent = text;
            typingIndicator.classList.remove("hidden");
            // Scroll to bottom to show indicator
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        } else {
            typingIndicator.classList.add("hidden");
        }
    }

    // Recording Indicators
    socket.on("user-recording-start", ({ userId, username: recorderName }) => {
        recordingUsers.set(userId, recorderName);
        updateRecordingIndicator();
    });

    socket.on("user-recording-stop", ({ userId }) => {
        recordingUsers.delete(userId);
        updateRecordingIndicator();
    });

    function updateRecordingIndicator() {
        // Priority over typing
        const indicator = document.getElementById("recordingIndicator");
        const typingIndicator = document.getElementById("typingIndicator");
        const users = Array.from(recordingUsers.values());

        if (users.length > 0) {
            recordingIndicatorActive = true;
            typingIndicator.classList.add("hidden"); // Hide typing

            const text = users.length === 1
                ? `${users[0]} is recording audio...`
                : `${users.length} people are recording...`;

            indicator.querySelector(".recording-text").textContent = text;
            indicator.classList.remove("hidden");
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        } else {
            recordingIndicatorActive = false;
            indicator.classList.add("hidden");
            // Re-show typing if active
            updateTypingIndicator();
        }
    }

    // Attempt to restore session
    restoreSession();

    socket.on("room-created", ({ isAdmin: adminStatus }) => {
        isAdmin = adminStatus;
        saveSession();
        showChatScreen();
        displaySystemMessage(`Room created! Share key: ${roomKey}`);
    });

    socket.on("room-exists", (msg) => {
        alert(msg);
    });

    socket.on("room-not-found", (msg) => {
        alert(msg || "Room not found");
        // Clear session if room doesn't exist
        localStorage.removeItem("roomKey");
        localStorage.removeItem("username");
        localStorage.removeItem("isAdmin");
    });

    socket.on("join-request-sent", (msg) => {
        alert(msg);
    });

    socket.on("admin-offline", (msg) => {
        alert(msg);
    });

    socket.on("join-approved", ({ messages }) => {
        saveSession();
        showChatScreen();
        messages.forEach(msg => {
            if (msg.file) {
                displayFile(msg.username, msg.file, msg.id, msg.seenBy);
            } else {
                displayMessage(msg.username, msg.message, msg.id, msg.seenBy, msg.replyTo);
            }
        });
        displaySystemMessage("You joined the room.");
    });

    socket.on("join-denied", (msg) => {
        alert(msg);
    });

    socket.on("join-request", ({ userId, username }) => {
        joinRequestUser.innerText = `${username} wants to join.`;
        joinRequestModal.classList.remove("hidden");
        pendingJoinRequest = userId;
    });

    approveJoinBtn.onclick = () => {
        if (pendingJoinRequest) {
            socket.emit("approve-join", { roomKey, userId: pendingJoinRequest });
            joinRequestModal.classList.add("hidden");
            pendingJoinRequest = null;
        }
    };

    denyJoinBtn.onclick = () => {
        if (pendingJoinRequest) {
            socket.emit("deny-join", { roomKey, userId: pendingJoinRequest });
            joinRequestModal.classList.add("hidden");
            pendingJoinRequest = null;
        }
    };

    socket.on("update-user-list", (users) => {
        updateUserList(users);
    });

    socket.on("user-joined", (username) => {
        displaySystemMessage(`${username} joined the room.`);
    });

    socket.on("user-left", (username) => {
        displaySystemMessage(`${username} left the room.`);
    });

    socket.on("user-removed", () => {
        alert("You have been removed from the room.");
        location.reload();
    });

    socket.on("room-killed", () => {
        alert("The admin has ended the room.");
        location.reload();
    });

    socket.on("room-inactive", (msg) => {
        alert(msg);
        location.reload();
    });

    socket.on("promoted-to-admin", () => {
        isAdmin = true;
        killRoomBtn.classList.remove("hidden");
        displaySystemMessage("You are now the admin of this room.");
        saveSession();
    });

    socket.on("chat-message", (entry) => {
        displayMessage(entry.username, entry.message, entry.id, entry.seenBy, entry.replyTo);
    });

    socket.on("file-uploaded", (entry) => {
        displayFile(entry.username, entry.file, entry.id, entry.seenBy);
    });

    socket.on("message-seen-update", ({ messageId, seenBy }) => {
        // Update the specific message's seen status data-attribute or UI
        const msgElement = document.getElementById(messageId);
        if (msgElement) {
            const seenStatus = msgElement.querySelector('.seen-status');
            // We only update the text if it's currently relevant (processed in display/update logic)
            // But simpler is to re-run the display logic filter

            // Update the internal seenBy if we were tracking it in memory (we aren't really, just DOM)
            // But we need to update the sender's view
        }

        // To properly update "Seen by X, Y", we need to know who sent the message
        // The easiest way with current functions is to re-evaluate the "Seen by" label
        // We'll traverse all messages to update the display
        const allMessages = messagesDiv.querySelectorAll('.message');
        // This is a bit heavy but ensures correctness with the 'last message only' rule
        // Optimization: trigger a debounced update or specific update

        // Quick fix: Update the specific message's seen list visually
        // For simplicity in this vanilla JS app, we can re-call updateSeenStatusDisplay 
        // if we know the user. 
        // Let's just update the specific message for now if it's the sender
        if (msgElement) {
            // Find who sent it
            // Check class
            const isSender = msgElement.querySelector('.sent-message');
            if (isSender) {
                updateSeenStatusDisplay(username, seenBy);
            }
        }
    });

    // Typing Indicators
    socket.on("user-typing-start", ({ userId, username: typerName }) => {
        typingUsers.set(userId, typerName);

        // Clear safety timeout if exists
        if (typingSafetyTimeouts.has(userId)) {
            clearTimeout(typingSafetyTimeouts.get(userId));
        }

        // Set safety timeout (3s) to remove indicator even if stop event missed
        const safetyTimeout = setTimeout(() => {
            typingUsers.delete(userId);
            typingSafetyTimeouts.delete(userId);
            updateTypingIndicator();
        }, 3000);

        typingSafetyTimeouts.set(userId, safetyTimeout);
        updateTypingIndicator();
    });

    socket.on("user-typing-stop", ({ userId }) => {
        typingUsers.delete(userId);
        if (typingSafetyTimeouts.has(userId)) {
            clearTimeout(typingSafetyTimeouts.get(userId));
            typingSafetyTimeouts.delete(userId);
        }
        updateTypingIndicator();
    });

    function updateTypingIndicator() {
        const typingIndicator = document.getElementById("typingIndicator");
        const users = Array.from(typingUsers.values());

        if (users.length > 0 && !recordingIndicatorActive) {
            const text = formatTypingText(users);
            typingIndicator.querySelector(".typing-text").textContent = text;
            typingIndicator.classList.remove("hidden");
            // Scroll to bottom to show indicator
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        } else {
            typingIndicator.classList.add("hidden");
        }
    }

    // Recording Indicators
    socket.on("user-recording-start", ({ userId, username: recorderName }) => {
        recordingUsers.set(userId, recorderName);
        updateRecordingIndicator();
    });

    socket.on("user-recording-stop", ({ userId }) => {
        recordingUsers.delete(userId);
        updateRecordingIndicator();
    });

    function updateRecordingIndicator() {
        // Priority over typing
        const indicator = document.getElementById("recordingIndicator");
        const typingIndicator = document.getElementById("typingIndicator");
        const users = Array.from(recordingUsers.values());

        if (users.length > 0) {
            recordingIndicatorActive = true;
            typingIndicator.classList.add("hidden"); // Hide typing

            const text = users.length === 1
                ? `${users[0]} is recording audio...`
                : `${users.length} people are recording...`;

            indicator.querySelector(".recording-text").textContent = text;
            indicator.classList.remove("hidden");
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        } else {
            recordingIndicatorActive = false;
            indicator.classList.add("hidden");
            // Re-show typing if active
            updateTypingIndicator();
        }
    }

    // Attempt to restore session
    restoreSession();

    if (joinVoiceBtn) {
        joinVoiceBtn.addEventListener("click", joinVoice);
    } else {
        console.error("Join Voice Button NOT FOUND");
    }

    async function joinVoice() {
        console.log("Join Voice Clicked");
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            console.log("Local stream acquired");

            // Toggle Buttons
            if (joinVoiceBtn) joinVoiceBtn.classList.add("hidden");
            if (leaveVoiceBtn) {
                leaveVoiceBtn.classList.remove("hidden");
                // Force display flex class
                leaveVoiceBtn.style.display = 'flex';
            }

            // Notify server
            console.log("Emitting join-voice for room:", roomKey);
            socket.emit("join-voice", { roomKey });
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone by user: " + err.message);
        }
    }

    function leaveVoice() {
        console.log("Leaving voice");
        // Stop local stream
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        // Close all peer connections
        Object.values(peers).forEach(peer => peer.close());
        peers = {};

        // Remove audio elements
        if (voiceContainer) voiceContainer.innerHTML = "";

        // UI Reset
        if (joinVoiceBtn) joinVoiceBtn.classList.remove("hidden");
        if (leaveVoiceBtn) {
            leaveVoiceBtn.classList.add("hidden");
            leaveVoiceBtn.style.display = 'none';
        }

        // Notify server
        socket.emit("leave-voice", { roomKey });
    }

    // Creating a peer connection
    function createPeerConnection(targetSocketId, initiate) {
        console.log(`Creating peer connection to ${targetSocketId}. Initiate: ${initiate}`);
        if (peers[targetSocketId]) return peers[targetSocketId];

        const pc = new RTCPeerConnection(rtcConfig);
        peers[targetSocketId] = pc;

        // Add local stream
        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`Sending ICE candidate to ${targetSocketId}`);
                socket.emit("voice-signal", {
                    to: targetSocketId,
                    signal: { type: "candidate", candidate: event.candidate }
                });
            }
        };

        // Handle remote stream
        pc.ontrack = (event) => {
            console.log(`Received remote track from ${targetSocketId}`);
            let audioElement = document.getElementById(`audio-${targetSocketId}`);
            if (!audioElement) {
                audioElement = document.createElement("audio");
                audioElement.id = `audio-${targetSocketId}`;
                audioElement.autoplay = true;
                if (voiceContainer) voiceContainer.appendChild(audioElement);
            }
            audioElement.srcObject = event.streams[0];
        };

        // If initiating, create offer
        if (initiate) {
            pc.createOffer().then(offer => {
                console.log(`Created offer for ${targetSocketId}`);
                pc.setLocalDescription(offer);
                socket.emit("voice-signal", {
                    to: targetSocketId,
                    signal: { type: "offer", offer }
                });
            });
        }

        return pc;
    }

    // Socket listeners for Voice
    socket.on("voice-users", (users) => {
        console.log("Received existing voice users:", users);
        // Connect to all existing users
        users.forEach(userId => {
            if (userId !== socket.id) {
                createPeerConnection(userId, true);
            }
        });
    });

    socket.on("user-joined-voice", (userId) => {
        console.log("User joined voice:", userId);
    });

    socket.on("user-left-voice", (userId) => {
        console.log("User left voice:", userId);
        if (peers[userId]) {
            peers[userId].close();
            delete peers[userId];
        }
        const audioEl = document.getElementById(`audio-${userId}`);
        if (audioEl) audioEl.remove();
    });

    socket.on("voice-signal", async ({ from, signal }) => {
        console.log(`Received signal type ${signal.type} from ${from}`);
        // If message is from self, ignore (shouldn't happen with correct server logic)
        if (from === socket.id) return;

        let pc = peers[from];
        if (!pc) {
            pc = createPeerConnection(from, false);
        }

        if (signal.type === "offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("voice-signal", {
                to: from,
                signal: { type: "answer", answer }
            });
        } else if (signal.type === "answer") {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
        } else if (signal.type === "candidate") {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (e) {
                console.error("Error adding ice candidate", e);
            }
        }
    });

    // Handle existing leave logic
    // The original code had this inside displayMessage, which is incorrect.
    // It should be here, within the DOMContentLoaded scope.
    if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
            // Also leave voice if active
            if (localStream) leaveVoice();
        });
    } else {
        console.error("Leave Chat Button NOT FOUND");
    }

    // Also handle window unload
    window.addEventListener("beforeunload", () => {
        if (localStream) leaveVoice();
    });



    const messageRow = document.createElement("div");
    // Helper function to update seen status - only show on last message from a user
    function updateSeenStatusDisplay(user, seenBy) {
        // Find all messages from this user
        const allMessages = messagesDiv.querySelectorAll('.message');
        let lastMessageFromUser = null;

        // Find the last message from this specific user
        for (let i = allMessages.length - 1; i >= 0; i--) {
            const msg = allMessages[i];
            const seenStatus = msg.querySelector('.seen-status');
            if (seenStatus && seenStatus.getAttribute('data-msg-user') === user) {
                if (!lastMessageFromUser) {
                    lastMessageFromUser = msg;
                } else {
                    // Hide seen status on all previous messages from this user
                    seenStatus.classList.remove('visible');
                    seenStatus.textContent = '';
                }
            }
        }

        // Show seen status only on the last message
        if (lastMessageFromUser) {
            const seenStatus = lastMessageFromUser.querySelector('.seen-status');
            // Filter to show only users who are still in the room AND not the current user
            const otherViewers = seenBy.filter(u => u !== username && currentRoomUsers.has(u));
            if (seenStatus && otherViewers.length > 0) {
                seenStatus.textContent = `Seen by ${otherViewers.join(", ")}`;
                seenStatus.classList.add('visible');
            } else if (seenStatus) {
                // Hide if no valid viewers
                seenStatus.classList.remove('visible');
                seenStatus.textContent = '';
            }
        }
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function getMimeType(file) {
        if (file.type) {
            return file.type;
        }
        const extension = file.name.split('.').pop().toLowerCase();
        switch (extension) {
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
            case 'png':
                return 'image/png';
            case 'gif':
                return 'image/gif';
            case 'mp4':
                return 'video/mp4';
            case 'pdf':
                return 'application/pdf';
            default:
                return 'application/octet-stream';
        }
    }

    function getFriendlyFileType(mimeType, fileName) {
        // Extract extension from filename
        const extension = fileName.split('.').pop().toLowerCase();

        // Map MIME types and extensions to friendly names
        if (mimeType.includes('wordprocessingml') || extension === 'docx') {
            return 'Word Doc';
        }
        if (mimeType.includes('spreadsheetml') || extension === 'xlsx') {
            return 'Excel Sheet';
        }
        if (mimeType.includes('presentationml') || extension === 'pptx') {
            return 'PowerPoint';
        }
        if (mimeType === 'application/pdf' || extension === 'pdf') {
            return 'PDF';
        }
        if (mimeType.startsWith('image/')) {
            return 'Image';
        }
        if (mimeType.startsWith('video/')) {
            return 'Video';
        }
        if (mimeType.startsWith('audio/')) {
            return 'Audio';
        }
        if (mimeType.includes('text/') || extension === 'txt') {
            return 'Text File';
        }
        if (extension === 'zip' || extension === 'rar' || extension === '7z') {
            return 'Archive';
        }

        // Default: use extension or generic
        return extension ? extension.toUpperCase() : 'File';
    }

    function getFileIcon(file) {
        const fileType = getMimeType(file);
        if (fileType.startsWith("image")) return `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l-1-1m5 5l-2-2"></path></svg>`;
        if (fileType.startsWith("video")) return `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.55a1 1 0 01.45 1.74l-4.5 3.5a1 1 0 01-1.5-.74V9a1 1 0 011.5-.74zM4 6a2 2 0 012-2h4a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"></path></svg>`;
        if (fileType === "application/pdf") return `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`;
        return `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`;
    }

    // Auto-resize textarea with production bug fixes
    function autoResizeTextarea() {
        requestAnimationFrame(() => {
            // Reset height to 'auto' to get accurate scrollHeight (prevents infinite growth)
            messageInput.style.height = 'auto';

            const minHeight = 40;
            const maxHeight = 150;
            const scrollHeight = messageInput.scrollHeight;

            // Clamp between min and max
            const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
            messageInput.style.height = newHeight + 'px';

            // Enable overflow scrolling only when max height is reached
            if (scrollHeight > maxHeight) {
                messageInput.style.overflowY = 'auto';
            } else {
                messageInput.style.overflowY = 'hidden';
            }
        });
    }

    // Render media previews
    function renderMediaPreviews() {
        const previewContainer = document.getElementById('mediaPreviews');

        if (pastedMedia.length === 0) {
            previewContainer.classList.add('hidden');
            previewContainer.innerHTML = '';
            mediaPasteEnabled = true;
            return;
        }

        previewContainer.classList.remove('hidden');
        previewContainer.innerHTML = '';

        // Display count
        if (pastedMedia.length > 0) {
            const countDiv = document.createElement('div');
            countDiv.className = 'media-preview-count';
            countDiv.textContent = `${pastedMedia.length} / ${MAX_MEDIA_ITEMS} media item${pastedMedia.length !== 1 ? 's' : ''}`;
            previewContainer.appendChild(countDiv);
        }

        // Display each media item
        pastedMedia.forEach((mediaItem, index) => {
            const itemDiv = document.createElement('div');

            // Audio items get special styling
            if (mediaItem.type === 'audio' || mediaItem.file.type.startsWith('audio')) {
                itemDiv.className = 'media-preview-item audio-preview-item';

                // Create audio element with native controls
                const audioElement = document.createElement('audio');
                audioElement.src = mediaItem.objectUrl;
                audioElement.controls = true;
                audioElement.className = 'audio-preview-player';

                // Add duration display if available
                if (mediaItem.duration) {
                    const durationDiv = document.createElement('div');
                    durationDiv.className = 'audio-preview-duration';
                    durationDiv.innerHTML = `<i class="fas fa-microphone"></i> ${formatRecordingTime(Math.floor(mediaItem.duration))}`;
                    itemDiv.appendChild(durationDiv);
                }

                itemDiv.appendChild(audioElement);
            } else {
                itemDiv.className = 'media-preview-item';

                // Create thumbnail for images/videos
                const thumbnail = document.createElement(mediaItem.file.type.startsWith('video') ? 'video' : 'img');
                thumbnail.src = mediaItem.objectUrl;
                thumbnail.className = 'media-preview-thumbnail';
                if (mediaItem.file.type.startsWith('video')) {
                    thumbnail.muted = true;
                }

                itemDiv.appendChild(thumbnail);
            }

            // Create remove button (works for all media types)
            const removeBtn = document.createElement('button');
            removeBtn.className = 'media-remove-btn';
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
            removeBtn.onclick = (e) => {
                e.preventDefault();
                removeMediaPreview(index);
            };

            itemDiv.appendChild(removeBtn);
            previewContainer.appendChild(itemDiv);
        });

        // Show limit warning if at max
        if (pastedMedia.length >= MAX_MEDIA_ITEMS) {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'media-preview-limit-warning';
            warningDiv.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>Maximum 10 items reached. Remove items to add more.';
            previewContainer.appendChild(warningDiv);
            mediaPasteEnabled = false;
        } else {
            mediaPasteEnabled = true;
        }
    }

    // Remove media preview with URL cleanup
    function removeMediaPreview(index) {
        if (index >= 0 && index < pastedMedia.length) {
            // Revoke object URL to prevent memory leak
            URL.revokeObjectURL(pastedMedia[index].objectUrl);

            // Remove from array
            pastedMedia.splice(index, 1);

            // Re-render
            renderMediaPreviews();
        }
    }

    function formatTypingText(users) {
        if (!users || users.length === 0) return "";
        if (users.length === 1) return `${users[0]} is typing...`;
        if (users.length === 2) return `${users[0]} and ${users[1]} are typing...`;
        const last = users.pop();
        return `${users.join(", ")} and ${last} are typing...`;
    }

    // ======== AUDIO RECORDING FUNCTIONS ========

    // Check if we can start recording (browser support + media limit)
    function checkCanRecord() {
        if (!AudioRecorder.isSupported()) {
            alert('Audio recording not supported in this browser');
            return false;
        }

        const currentMediaCount = pastedMedia.length + (audioPreviewBlob ? 1 : 0);
        if (currentMediaCount >= MAX_MEDIA_ITEMS) {
            alert(`Media limit reached (${MAX_MEDIA_ITEMS}/${MAX_MEDIA_ITEMS}). Remove items to record audio.`);
            return false;
        }

        return true;
    }

    // Start audio recording
    async function startAudioRecording() {
        if (!checkCanRecord()) return;

        // Initialize recorder if not already done
        if (!audioRecorder) {
            audioRecorder = new AudioRecorder({ maxDuration: 120 }); // 2 minutes
        }

        const started = await audioRecorder.startRecording({
            onStop: async (blob, duration) => {
                // Recording stopped - add to media strip
                audioPreviewBlob = blob;
                audioDuration = duration;

                // Emit stop event to server
                socket.emit('recording:stop', { roomKey, userId: socket.id });

                // Reset UI
                isRecording = false;
                recordBtn.classList.remove('recording');
                recordBtn.querySelector('i').className = 'fas fa-microphone';
                recordingTimerUI.classList.add('hidden');

                // Stop timer
                if (recordingTimer) {
                    clearInterval(recordingTimer);
                    recordingTimer = null;
                }

                // Hide recording UI
                hideRecordingUI();

                // Add audio to media strip (check limit first)
                const currentMediaCount = pastedMedia.length;
                if (currentMediaCount >= MAX_MEDIA_ITEMS) {
                    alert(`Media limit reached (${MAX_MEDIA_ITEMS}/${MAX_MEDIA_ITEMS}). Remove items to add audio.`);
                    // Cleanup
                    if (audioRecorder) {
                        audioRecorder.cleanup();
                    }
                    audioPreviewBlob = null;
                    audioDuration = 0;
                    return;
                }

                // Create audio file from blob
                const audioFile = new File([blob], `audio-${Date.now()}.webm`, {
                    type: blob.type || 'audio/webm'
                });

                // Create object URL for preview
                const objectUrl = URL.createObjectURL(blob);

                // Add to media array with metadata
                pastedMedia.push({
                    file: audioFile,
                    objectUrl: objectUrl,
                    type: 'audio',
                    duration: duration
                });

                // Render media previews
                renderMediaPreviews();

                // Re-enable message input
                messageInput.disabled = false;
                messageInput.placeholder = 'Type a message...';
                messageInput.focus();

                // Resume typing indicator if user is typing
                if (messageInput.value.trim().length > 0 && !isTyping) {
                    socket.emit('typing:start', { roomKey, userId: socket.id, username });
                    isTyping = true;
                }

                // Reset audio state
                audioPreviewBlob = null;
                audioDuration = 0;

                // Cleanup recorder to release microphone
                if (audioRecorder) {
                    audioRecorder.cleanup();
                }
            },
            onMaxDuration: () => {
                console.log('Max recording duration reached - preview shown (NOT auto-sent)');
            },
            onError: (type, message) => {
                alert(message);
                isRecording = false;
                recordBtn.classList.remove('recording');
                recordBtn.querySelector('i').className = 'fas fa-microphone';
                recordingTimerUI.classList.add('hidden');
                if (recordingTimer) {
                    clearInterval(recordingTimer);
                    recordingTimer = null;
                }
            }
        });

        if (started) {
            isRecording = true;
            recordingStartTime = Date.now();

            // Update UI
            recordBtn.classList.add('recording');
            recordBtn.querySelector('i').className = 'fas fa-stop';
            recordBtn.title = 'Stop recording';
            recordingTimerUI.classList.remove('hidden');

            // Disable message input during recording
            messageInput.disabled = true;
            messageInput.placeholder = 'Recording audio...';

            // Suppress typing indicator
            if (isTyping) {
                socket.emit('typing:stop', { roomKey, userId: socket.id });
                isTyping = false;
                if (typingTimeout) clearTimeout(typingTimeout);
            }

            // Emit recording start to server
            socket.emit('recording:start', { roomKey, userId: socket.id, username });

            // Show WhatsApp-style recording UI
            showRecordingUI();

            // Start timer UI (for the small timer in composer)
            recordingTimer = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
                recordingTimerUI.querySelector('.recording-time').textContent = formatRecordingTime(elapsed);
            }, 1000);
        }
    }

    // Stop audio recording
    function stopAudioRecording() {
        if (audioRecorder && isRecording) {
            audioRecorder.stopRecording();
            // onStop callback will handle the rest
        }
    }

    // Format seconds as MM:SS
    function formatRecordingTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // Show recording UI (appears when recording starts, not after)
    let recordingUIInterval = null;
    let recordingPaused = false;
    let pausedDuration = 0;

    function showRecordingUI() {
        // Remove any existing UI
        hideRecordingUI();

        // Hide main send button to prevent duplicates
        const mainSendBtn = document.getElementById('sendBtn');
        if (mainSendBtn) {
            mainSendBtn.style.display = 'none';
        }

        // Create recording UI
        const recordingUI = document.createElement('div');
        recordingUI.className = 'audio-recording-ui';
        recordingUI.id = 'audioRecordingUI';

        recordingUI.innerHTML = `
            <div class="audio-recording-container">
                <!-- Timer (Top Left) -->
                <div class="recording-timer-display" id="recordingTimerDisplay">00:00</div>

                <!-- Center Area (Waveform + Pause Button) -->
                <div class="recording-center-area">
                    <div class="recording-waveform" id="recordingWaveform"></div>
                    <button class="recording-pause-btn" id="recordingPauseBtn" title="Pause">
                        <i class="fas fa-pause"></i>
                    </button>
                </div>

                <!-- Delete Button (Below Timer) -->
                <button class="recording-delete-btn" id="recordingDeleteBtn" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>

                <!-- Send Button (Right) -->
                <button class="recording-send-btn" id="recordingSendBtn" title="Send">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        `;

        // Append to chat input container instead of body
        const chatInputContainer = document.getElementById('chat-input-container');
        chatInputContainer.insertBefore(recordingUI, chatInputContainer.firstChild);

        // Generate waveform
        generateRecordingWaveform();

        // Setup controls
        setupRecordingControls();

        // Start timer
        recordingStartTime = Date.now();
        recordingPaused = false;
        pausedDuration = 0;
        updateRecordingTimer();
    }

    // Generate recording waveform
    function generateRecordingWaveform() {
        const waveform = document.getElementById('recordingWaveform');
        if (!waveform) return;

        waveform.innerHTML = '';
        const barCount = 50; // More bars for ECG effect

        for (let i = 0; i < barCount; i++) {
            const bar = document.createElement('div');
            bar.className = 'recording-waveform-bar';

            // Random heights for visual variety
            const height = Math.random() * 80 + 20;
            bar.style.height = `${height}%`;

            // Animate bars with staggered timing (ECG effect)
            bar.style.animation = `waveformPulseRecording ${0.8 + Math.random() * 0.6}s ease-in-out infinite`;
            bar.style.animationDelay = `${Math.random() * 0.3}s`;

            waveform.appendChild(bar);
        }
    }

    // Update recording timer
    function updateRecordingTimer() {
        const timerDisplay = document.getElementById('recordingTimerDisplay');
        if (!timerDisplay) return;

        if (!recordingPaused && isRecording) {
            const elapsed = Math.floor((Date.now() - recordingStartTime - pausedDuration) / 1000);
            timerDisplay.textContent = formatRecordingTime(elapsed);
            recordingUIInterval = setTimeout(updateRecordingTimer, 1000);
        }
    }

    // Setup recording controls
    function setupRecordingControls() {
        const pauseBtn = document.getElementById('recordingPauseBtn');
        const deleteBtn = document.getElementById('recordingDeleteBtn');
        const sendBtn = document.getElementById('recordingSendBtn');
        const waveform = document.getElementById('recordingWaveform');

        // Pause/Resume button
        pauseBtn.onclick = () => {
            if (recordingPaused) {
                // Resume
                audioRecorder.resumeRecording();
                pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                pauseBtn.classList.remove('paused');
                pauseBtn.title = 'Pause';
                recordingPaused = false;

                // Resume animation
                const bars = waveform.querySelectorAll('.recording-waveform-bar');
                bars.forEach(bar => bar.classList.remove('paused'));

                // Restart timer
                recordingStartTime = Date.now() - pausedDuration;
                updateRecordingTimer();
            } else {
                // Pause
                audioRecorder.pauseRecording();
                pauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                pauseBtn.classList.add('paused');
                pauseBtn.title = 'Resume';
                recordingPaused = true;
                pausedDuration = Date.now() - recordingStartTime;

                // Stop animation
                const bars = waveform.querySelectorAll('.recording-waveform-bar');
                bars.forEach(bar => bar.classList.add('paused'));

                // Stop timer update
                if (recordingUIInterval) {
                    clearTimeout(recordingUIInterval);
                    recordingUIInterval = null;
                }
            }
        };

        // Delete button
        deleteBtn.onclick = () => {
            if (confirm('Discard this recording?')) {
                stopAudioRecording();
                hideRecordingUI();
            }
        };

        // Send button
        sendBtn.onclick = async () => {
            // Set flag to send immediately after recording stops
            if (audioRecorder && isRecording) {
                shouldSendAudioAfterStop = true;
                audioRecorder.stopRecording();
                // onStop callback will handle sending based on the flag
            }
        };
    }

    // Hide recording UI
    function hideRecordingUI() {
        const recordingUI = document.getElementById('audioRecordingUI');
        if (recordingUI) {
            recordingUI.remove();
        }

        // Show main send button again
        const mainSendBtn = document.getElementById('sendBtn');
        if (mainSendBtn) {
            mainSendBtn.style.display = '';
        }

        if (recordingUIInterval) {
            clearTimeout(recordingUIInterval);
            recordingUIInterval = null;
        }
    }





    // Update recording indicator display
    function updateRecordingIndicator() {
        const count = recordingUsers.size;

        if (count === 0) {
            recordingIndicator.classList.add('hidden');
            recordingIndicatorActive = false;
            // Resume typing indicator if hidden
            if (typingUsers.size > 0) {
                updateTypingIndicator();
            }
            return;
        }

        recordingIndicatorActive = true;

        // Hide typing indicator (recording takes priority)
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.classList.add('hidden');
        }

        recordingIndicator.classList.remove('hidden');
        const recordingText = recordingIndicator.querySelector('.recording-text');
        if (!recordingText) return;

        const users = Array.from(recordingUsers.values());

        if (count === 1) {
            recordingText.textContent = `${users[0]} is recording an audio...`;
        } else if (count === 2) {
            recordingText.textContent = `${users[0]} and ${users[1]} are recording audio...`;
        } else {
            recordingText.textContent = 'Several people are recording audio...';
        }
    }

    // ======== REPLY TO MESSAGE FUNCTIONS ========

    // Set reply context (prevents nested replies by pointing to original)
    function setReplyContext(messageData) {
        // If replying to a reply, point to the original message instead
        const targetMessageId = messageData.replyTo?.messageId || messageData.id;
        const targetSender = messageData.replyTo?.sender || messageData.username;
        const targetMessage = messageData.replyTo?.originalMessage || messageData.message;

        replyContext = {
            messageId: targetMessageId,
            sender: targetSender,
            previewText: getReplyPreview(targetMessage),
            previewType: targetMessage.type || 'text',
            originalMessage: targetMessage
        };

        showReplyPreview();
    }

    // Clear reply context
    function clearReplyContext() {
        replyContext = null;
        hideReplyPreview();
    }

    // Get preview text from message object
    function getReplyPreview(message) {
        if (!message) return 'Message';

        if (message.type === 'text') {
            // Truncate long text
            const text = message.content || '';
            return text.length > 50 ? text.substring(0, 50) + '...' : text;
        } else if (message.type === 'image') {
            return '📷 Photo';
        } else if (message.type === 'video') {
            return '🎥 Video';
        } else if (message.type === 'audio') {
            return '🎙️ Audio';
        } else if (message.type === 'gif') {
            return '📺 GIF';
        } else if (message.type === 'sticker') {
            return '🎨 Sticker';
        } else {
            return '📎 File';
        }
    }

    // Show reply preview bar
    function showReplyPreview() {
        if (!replyContext || !replyPreviewBar) return;

        const senderEl = replyPreviewBar.querySelector('.reply-sender');
        const previewEl = replyPreviewBar.querySelector('.reply-preview');

        if (senderEl) senderEl.textContent = `Replying to ~${replyContext.sender}`;
        if (previewEl) previewEl.textContent = replyContext.previewText;

        replyPreviewBar.classList.remove('hidden');
    }

    // Hide reply preview bar
    function hideReplyPreview() {
        if (replyPreviewBar) {
            replyPreviewBar.classList.add('hidden');
        }
    }

    // Scroll to original message (for clicking quoted replies)
    function scrollToMessage(messageId) {
        const messageElement = document.getElementById(messageId);
        if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Highlight briefly
            messageElement.classList.add('message-highlight');
            setTimeout(() => {
                messageElement.classList.remove('message-highlight');
            }, 2000);
        } else {
            // Message not found (deleted or not loaded)
            displaySystemMessage('⚠️ Original message unavailable');
        }
    }

    function createProgressCircle(progress, messageId) {
        const size = 50;
        const strokeWidth = 4;
        const radius = (size - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (progress / 100) * circumference;

        const cancelBtn = `
        <foreignObject x="0" y="0" width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" class="w-full h-full flex items-center justify-center">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </div>
        </foreignObject>
    `;

        return `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="relative cursor-pointer" onclick="promptCancelUpload('${messageId}')">
            <circle stroke-width="${strokeWidth}" stroke="rgba(255, 255, 255, 0.3)" fill="transparent" r="${radius}" cx="${size / 2}" cy="${size / 2}"/>
            <circle stroke-width="${strokeWidth}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke="rgb(255, 255, 255)" fill="transparent" r="${radius}" cx="${size / 2}" cy="${size / 2}" transform="rotate(-90 ${size / 2} ${size / 2})"></circle>
            ${progress < 100 ? cancelBtn : ''}
        </svg>
    `;
    }

    window.promptCancelUpload = function (messageId) {
        uploadToCancel = messageId;
        cancelUploadModal.classList.remove("hidden");
    }

    function cancelUpload(messageId) {
        if (fileUploads[messageId]) {
            fileUploads[messageId].abort();
        }
    }

    function displayFile(user, file, messageId, seenBy = []) {
        const messageDiv = document.getElementById(messageId);
        const bubbleClass = user === username ? 'sent-message' : 'received-message';
        const alignmentClass = user === username ? 'justify-end' : 'justify-start';

        const fileType = getMimeType(file);

        let fileHtml;
        let bubbleExtraClass = "";

        if (fileType.startsWith('image') || fileType.startsWith('video')) {
            bubbleExtraClass = "message-bubble-media";
            if (fileType.startsWith('image')) {
                fileHtml = `
                    <div class="relative group">
                        <img src="${file.path}" class="message-file-preview" loading="lazy">
                        <a href="${file.path}" download="${file.name}" class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
                            <i class="fas fa-download"></i>
                        </a>
                    </div>`;
            } else {
                fileHtml = `
                    <div class="relative group">
                        <video src="${file.path}" class="message-file-preview" controls></video>
                        <a href="${file.path}" download="${file.name}" class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
                            <i class="fas fa-download"></i>
                        </a>
                    </div>`;
            }
        } else {
            // Apply fixed-width class for document files
            bubbleExtraClass = "file-document-bubble";
            const truncatedName = file.name.length > 20 ? file.name.substring(0, 15) + "..." + file.name.substring(file.name.length - 5) : file.name;
            const friendlyType = getFriendlyFileType(fileType, file.name);
            const subTextColor = user === username ? 'text-purple-100/70' : 'text-slate-400';

            // Create tooltip with full file information
            const fullFileInfo = `${file.name} (${formatBytes(file.size)})`;

            fileHtml = `
            <div class="flex items-center p-2" title="${fullFileInfo}">
                <div class="w-14 h-14 flex-shrink-0 flex items-center justify-center rounded-xl bg-slate-700/50 mr-4 border border-slate-600/50">
                    ${getFileIcon(file)}
                </div>
                <div class="overflow-hidden flex-1">
                    <div class="font-semibold text-sm truncate ${user === username ? 'text-white' : 'text-slate-200'}" title="${file.name}">${truncatedName}</div>
                    <div class="text-xs ${subTextColor} mt-1">${formatBytes(file.size)} • ${friendlyType}</div>
                </div>
            </div>
            <div class="flex gap-2 mt-3 px-2 pb-2">
                <a href="${file.path}" target="_blank" class="flex-1 text-center bg-slate-700/50 hover:bg-slate-600/50 text-white py-2.5 px-4 rounded-lg text-sm font-medium transition-all border border-slate-600/50">
                    <i class="fas fa-external-link-alt mr-2"></i>Open
                </a>
                <a href="${file.path}" download="${file.name}" class="flex-1 text-center bg-purple-600/50 hover:bg-purple-600/70 text-white py-2.5 px-4 rounded-lg text-sm font-medium transition-all border border-purple-500/30">
                    <i class="fas fa-download mr-2"></i>Save
                </a>
            </div>
        `;
        }

        if (messageDiv) {
            // Message already exists (from upload progress), just update content
            const bubble = messageDiv.querySelector(".sent-message") || messageDiv.querySelector(".received-message");
            if (bubble) {
                bubble.innerHTML = fileHtml;
                if (bubbleExtraClass) {
                    bubble.classList.add(bubbleExtraClass);
                }
            }
            // Update lastMessageUser even when updating existing message
            lastMessageUser = user;
        } else {
            // Create new message element
            const wrapper = document.createElement("div");
            wrapper.id = messageId;
            wrapper.className = `message flex flex-col ${user === username ? 'items-end' : 'items-start'} ${lastMessageUser === user ? 'same-user' : 'new-user'}`;

            const messageRow = document.createElement("div");
            messageRow.className = `flex items-end w-full ${alignmentClass} message-row`;

            const messageBubble = document.createElement("div");
            messageBubble.className = `${bubbleClass} ${bubbleExtraClass || ''}`;
            messageBubble.innerHTML = fileHtml;
            messageRow.appendChild(messageBubble);

            wrapper.appendChild(messageRow);

            const seenStatus = document.createElement("div");
            seenStatus.className = "seen-status";
            seenStatus.setAttribute('data-msg-user', user);
            wrapper.appendChild(seenStatus);

            if (messageId && user !== username) {
                // Only mark as seen if tab is visible
                if (isTabVisible) {
                    socket.emit("mark-seen", { roomKey, messageId, username });
                } else {
                    // Queue to mark as seen when user returns to tab
                    pendingSeenMessages.add(messageId);
                }
            }

            messagesDiv.appendChild(wrapper);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            // Update seen status display - only show on last message from sender
            if (user === username && seenBy && seenBy.length > 0) {
                updateSeenStatusDisplay(user, seenBy);
            }

            // Update lastMessageUser for new messages
            lastMessageUser = user;
        }
    }

    function updateUserList(users) {
        userList.innerHTML = "";
        userCount.textContent = users.length;

        // Update mobile user counts
        if (mobileUserCount) mobileUserCount.textContent = users.length;
        if (mobileUserCountText) mobileUserCountText.textContent = users.length;

        // Update current room users Set for seen status filtering
        currentRoomUsers.clear();
        users.forEach(user => {
            currentRoomUsers.add(user.username);

            const li = document.createElement("li");
            li.className = "flex items-center justify-between p-3 bg-slate-800/30 rounded-xl hover:bg-slate-800/50 transition-all";

            const userInfo = document.createElement("div");
            userInfo.className = "flex items-center space-x-3";

            const userName = document.createElement("span");
            userName.className = "font-medium";
            userName.textContent = user.username + (user.id === socket.id ? " (You)" : "");

            userInfo.appendChild(userName);
            li.appendChild(userInfo);

            if (isAdmin && user.id !== socket.id) {
                const removeBtn = document.createElement("button");
                removeBtn.innerHTML = '<i class="fas fa-user-minus"></i>';
                removeBtn.className = "text-red-400 hover:text-red-300 hover:bg-red-500/20 p-2 rounded-lg transition-all";
                removeBtn.title = "Remove user";
                removeBtn.onclick = () => {
                    // Show custom modal with user info
                    userToRemove = { id: user.id, username: user.username };
                    removeUserText.textContent = `Are you sure you want to remove ${user.username} from the room?`;
                    removeUserModal.classList.remove("hidden");
                };
                li.appendChild(removeBtn);
            }
            userList.appendChild(li);
        });

        // Update mobile user list
        if (mobileUserList) {
            mobileUserList.innerHTML = "";
            users.forEach(user => {
                const li = document.createElement("li");
                li.className = "flex items-center justify-between p-3 bg-slate-800/30 rounded-xl hover:bg-slate-800/50 transition-all";

                const userInfo = document.createElement("div");
                userInfo.className = "flex items-center space-x-3";

                const userName = document.createElement("span");
                userName.className = "font-medium";
                userName.textContent = user.username + (user.id === socket.id ? " (You)" : "");

                userInfo.appendChild(userName);
                li.appendChild(userInfo);

                if (isAdmin && user.id !== socket.id) {
                    const removeBtn = document.createElement("button");
                    removeBtn.innerHTML = '<i class="fas fa-user-minus"></i>';
                    removeBtn.className = "text-red-400 hover:text-red-300 hover:bg-red-500/20 p-2 rounded-lg transition-all";
                    removeBtn.title = "Remove user";
                    removeBtn.onclick = () => {
                        // Show custom modal with user info
                        userToRemove = { id: user.id, username: user.username };
                        removeUserText.textContent = `Are you sure you want to remove ${user.username} from the room?`;
                        removeUserModal.classList.remove("hidden");
                        // Close mobile sidebar when showing modal
                        closeMobileSidebar.click();
                    };
                    li.appendChild(removeBtn);
                }
                mobileUserList.appendChild(li);
            });
        }
    }

    // Confirm remove user
    confirmRemoveUserBtn.onclick = () => {
        if (userToRemove) {
            socket.emit("remove-user", { roomKey, userId: userToRemove.id });
            userToRemove = null;
        }
        removeUserModal.classList.add("hidden");
    };

    // Cancel remove user
    cancelRemoveUserBtn.onclick = () => {
        userToRemove = null;
        removeUserModal.classList.add("hidden");
    };

    function uploadFile(file) {
        fileToSend = file;
        messageInput.value = `Pasted file: ${file.name}. Press send to upload.`;
        messageInput.disabled = true;
    }


    function sendFile(file) {
        const messageId = `file-${Date.now()}`;

        // Create wrapper to match displayMessage structure
        const wrapper = document.createElement("div");
        wrapper.className = "message flex flex-col items-end";
        wrapper.id = messageId;

        // Create messageRow with w-full for proper sizing
        const messageRow = document.createElement("div");
        messageRow.className = "flex items-end w-full justify-end";

        const messageBubble = document.createElement("div");
        messageBubble.className = "sent-message text-white file-document-bubble";

        const truncatedName = file.name.length > 15 ? file.name.substring(0, 10) + "..." + file.name.substring(file.name.length - 5) : file.name;

        const xhr = new XMLHttpRequest();
        xhr.messageId = messageId;

        const initialContent = `
    <div class="flex items-center gap-4 p-2">
        <div class="progress-circle relative w-14 h-14 flex-shrink-0 flex items-center justify-center">${createProgressCircle(0, messageId)}</div>
        <div class="overflow-hidden flex-1">
            <div class="font-semibold text-sm truncate text-white">${truncatedName}</div>
            <div class="text-xs text-purple-200/70 upload-status mt-1">0 Bytes / ${formatBytes(file.size)}</div>
        </div>
    </div>`;

        messageBubble.innerHTML = initialContent;
        messageRow.appendChild(messageBubble);
        wrapper.appendChild(messageRow);
        messagesDiv.appendChild(wrapper);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        const formData = new FormData();
        formData.append("file", file);

        fileUploads[messageId] = xhr;

        xhr.open("POST", "/upload", true);

        xhr.upload.onprogress = (e) => {
            const percent = Math.round((e.loaded / e.total) * 100);
            const progressCircleDiv = messageBubble.querySelector(".progress-circle");
            progressCircleDiv.innerHTML = createProgressCircle(percent, messageId);
            const uploadStatus = messageBubble.querySelector(".upload-status");
            uploadStatus.textContent = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;
        };

        xhr.onabort = () => {
            const messageToRemove = document.getElementById(messageId);
            if (messageToRemove) {
                messageToRemove.remove();
            }
            delete fileUploads[messageId];
        }

        xhr.onload = () => {
            delete fileUploads[messageId];
            if (xhr.status === 200) {
                console.log("Upload success, parsing response...");
                try {
                    const response = JSON.parse(xhr.responseText);
                    console.log("Parsed response:", response);
                    const { path } = response;
                    if (path) {
                        const fileData = {
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            path
                        };

                        const fileMimeType = getMimeType(file);

                        // Send images and videos as chat messages (like GIFs) for better integration
                        if (fileMimeType.startsWith('image') || fileMimeType.startsWith('video')) {
                            const messageType = fileMimeType.startsWith('image') ? 'image' : 'video';
                            // Remove the progress message and send as regular chat message
                            const messageToRemove = document.getElementById(messageId);
                            if (messageToRemove) {
                                messageToRemove.remove();
                            }
                            // Display immediately for sender to ensure correct alignment
                            displayMessage(username, {
                                type: messageType,
                                content: path
                            }, messageId, [], null);

                            // Also emit to server to broadcast to other users
                            if (roomKey && username) {
                                socket.emit("chat-message", {
                                    roomKey,
                                    username,
                                    id: messageId,
                                    message: {
                                        type: messageType,
                                        content: path
                                    },
                                    seenBy: []
                                });
                            }
                        } else {
                            // For other files, use the file-uploaded event
                            displayFile(username, fileData, messageId, []);
                            if (roomKey && username) {
                                socket.emit("file-uploaded", {
                                    roomKey,
                                    username,
                                    file: fileData,
                                    messageId: messageId,
                                    seenBy: []
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error processing upload response:", error);
                    alert("Error processing upload: " + error.message); // Visible alert
                    messageBubble.innerHTML = '<div class="text-red-400 text-sm">Upload processing failed</div>';
                }
            } else {
                if (xhr.status !== 0) {
                    messageBubble.innerHTML = '<div class="text-red-400 text-sm">File upload failed</div>';
                    alert("Upload failed with status: " + xhr.status); // Visible alert
                }
            }
        };

        xhr.onerror = () => {
            delete fileUploads[messageId];
            messageBubble.innerHTML = '<div class="text-red-400 text-sm">Upload error occurred</div>';
        };

        xhr.send(formData);
    }

    function saveSession() {
        localStorage.setItem("roomKey", roomKey);
        localStorage.setItem("username", username);
        localStorage.setItem("isAdmin", isAdmin);
    }

    function restoreSession() {
        const savedRoomKey = localStorage.getItem("roomKey");
        const savedUsername = localStorage.getItem("username");
        const savedIsAdmin = localStorage.getItem("isAdmin");

        if (savedRoomKey && savedUsername) {
            roomKey = savedRoomKey;
            username = savedUsername;
            isAdmin = savedIsAdmin === 'true';

            // Show/hide End Room button based on admin status
            if (isAdmin) {
                killRoomBtn.classList.remove("hidden");
            } else {
                killRoomBtn.classList.add("hidden");
            }

            socket.emit("rejoin-room", { roomKey, username, isAdmin });
        }
    }

    // Event Listeners
    createRoomBtn.onclick = () => {
        roomKey = roomKeyInput.value.trim();
        username = usernameInput.value.trim();
        if (!roomKey || !username) return alert("Please enter a username and a room key.");
        socket.emit("create-room", {
            roomKey,
            username
        });
    };

    joinRoomBtn.onclick = () => {
        roomKey = roomKeyInput.value.trim();
        username = usernameInput.value.trim();
        if (!roomKey || !username) return alert("Please enter a username and a room key.");
        socket.emit("join-room", {
            roomKey,
            username
        });
    };

    leaveBtn.onclick = () => {
        // Show custom modal instead of confirm dialog
        leaveChatModal.classList.remove("hidden");
    };

    // Confirm leave chat
    confirmLeaveBtn.onclick = () => {
        leaveChatModal.classList.add("hidden");

        // Clear typing state on leave
        if (isTyping) {
            socket.emit("typing:stop", { roomKey, userId: socket.id });
            isTyping = false;
        }
        if (typingTimeout) clearTimeout(typingTimeout);
        typingUsers.clear();
        typingSafetyTimeouts.forEach(t => clearTimeout(t));
        typingSafetyTimeouts.clear();

        // Cleanup mobile keyboard handler
        if (window.cleanupMobileKeyboard) {
            window.cleanupMobileKeyboard();
        }

        socket.emit("leave-room", { roomKey, username });
        localStorage.removeItem("roomKey");
        localStorage.removeItem("username");
        localStorage.removeItem("isAdmin");

        chatScreen.style.display = "none";
        joinScreen.style.display = "flex";
        messagesDiv.innerHTML = "";
        roomKeyInput.value = "";
        isAdmin = false;
        document.body.classList.remove("chat-active");
        lastMessageUser = null;
    };

    // Cancel leave chat
    cancelLeaveBtn.onclick = () => {
        leaveChatModal.classList.add("hidden");
    };

    killRoomBtn.onclick = () => {
        if (isAdmin) {
            // Show custom modal
            endRoomModal.classList.remove("hidden");
        }
    };

    // Confirm end room
    confirmEndRoomBtn.onclick = () => {
        endRoomModal.classList.add("hidden");
        socket.emit("kill-room", { roomKey });
    };

    // Cancel end room
    cancelEndRoomBtn.onclick = () => {
        endRoomModal.classList.add("hidden");
    };

    // Mobile sidebar toggle
    if (mobileUsersBtn) {
        mobileUsersBtn.onclick = () => {
            mobileUserSidebar.classList.remove("translate-x-full");
            mobileUserBackdrop.classList.remove("hidden");
        };
    }

    if (closeMobileSidebar) {
        closeMobileSidebar.onclick = () => {
            mobileUserSidebar.classList.add("translate-x-full");
            mobileUserBackdrop.classList.add("hidden");
        };
    }

    if (mobileUserBackdrop) {
        mobileUserBackdrop.onclick = () => {
            mobileUserSidebar.classList.add("translate-x-full");
            mobileUserBackdrop.classList.add("hidden");
        };
    }

    messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    messageInput.addEventListener("input", () => {
        // Auto-resize textarea
        autoResizeTextarea();

        // Only emit if there's content and we're in a room
        if (!roomKey || !username) return;

        const hasContent = messageInput.value.trim().length > 0;

        // Emit typing:start only once when typing begins
        if (!isTyping && hasContent) {
            socket.emit("typing:start", {
                roomKey,
                userId: socket.id,
                username
            });
            isTyping = true;
        }

        // Reset debounce timer on each keystroke
        if (typingTimeout) clearTimeout(typingTimeout);

        // If field is empty, stop typing immediately
        if (!hasContent && isTyping) {
            socket.emit("typing:stop", { roomKey, userId: socket.id });
            isTyping = false;
            return;
        }

        // Auto-stop after 2 seconds of inactivity
        typingTimeout = setTimeout(() => {
            if (isTyping) {
                socket.emit("typing:stop", { roomKey, userId: socket.id });
                isTyping = false;
            }
        }, 2000);
    });


    messageInput.addEventListener("focus", () => {
        mediaPicker.style.display = "none";
    });

    messageInput.addEventListener('paste', async (event) => {
        if (!mediaPasteEnabled) {
            // Don't prevent default - allow text paste even when media limit reached
            return;
        }

        const items = event.clipboardData?.items;
        if (!items) return;

        let hasMediaFiles = false;
        const newMediaItems = [];

        // Loop through clipboard items
        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // Check item.kind === "file" to ignore text-only paste
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (!file) continue;

                // Only accept images and videos
                if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
                    hasMediaFiles = true;

                    // Check if adding this would exceed limit
                    if (pastedMedia.length + newMediaItems.length < MAX_MEDIA_ITEMS) {
                        // Create object URL for preview
                        const objectUrl = URL.createObjectURL(file);
                        newMediaItems.push({ file, objectUrl });
                    } else {
                        // Limit reached - show warning
                        console.warn('Media paste limit reached');
                        break;
                    }
                }
            }
        }

        // If we found media files, prevent default paste and add to preview
        if (hasMediaFiles && newMediaItems.length > 0) {
            event.preventDefault();

            // Add new items to pastedMedia array
            pastedMedia.push(...newMediaItems);

            // Render previews
            renderMediaPreviews();
        }
    });

    // Drag and drop file upload with overlay
    const dragDropOverlay = document.getElementById('dragDropOverlay');
    let dragCounter = 0;

    // Prevent default drag behaviors on the entire document
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    // Show overlay when dragging files over the chat screen
    chatScreen.addEventListener('dragenter', (e) => {
        // Only show for files, not text
        if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
            dragCounter++;
            dragDropOverlay.classList.remove('hidden');
        }
    }, false);

    chatScreen.addEventListener('dragleave', (e) => {
        dragCounter--;
        if (dragCounter === 0) {
            dragDropOverlay.classList.add('hidden');
        }
    }, false);

    // Handle dropped files
    chatScreen.addEventListener('drop', (e) => {
        dragCounter = 0;
        dragDropOverlay.classList.add('hidden');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            // Handle multiple files
            Array.from(files).forEach(file => {
                uploadFile(file);
            });
        }
    }, false);



    sendBtn.onclick = async () => {
        // Stop typing when sending message
        if (isTyping) {
            socket.emit("typing:stop", { roomKey, userId: socket.id });
            isTyping = false;
            if (typingTimeout) clearTimeout(typingTimeout);
        }

        if (fileToSend) {
            sendFile(fileToSend);
            fileToSend = null;
            messageInput.value = "";
            messageInput.disabled = false;
            autoResizeTextarea(); // Reset height
            messageInput.focus();
            return;
        }

        const message = messageInput.value.trim();
        const hasMedia = pastedMedia.length > 0;

        // Require either text or media
        if (message === "" && !hasMedia) return;

        // Helper function to upload a single media file with progress tracking
        const uploadMediaFile = async (mediaItem, index, onProgress) => {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const formData = new FormData();
                formData.append('file', mediaItem.file);

                const startTime = Date.now();

                xhr.open('POST', '/upload', true);

                // Track upload progress
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable && onProgress) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        const elapsed = (Date.now() - startTime) / 1000; // seconds
                        const speed = elapsed > 0 ? e.loaded / elapsed : 0; // bytes per second

                        onProgress(index, {
                            loaded: e.loaded,
                            total: e.total,
                            percent: percent,
                            speed: speed
                        });
                    }
                };

                xhr.onload = () => {
                    if (xhr.status === 200) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            resolve({ success: true, path: data.path, file: mediaItem.file });
                        } catch (error) {
                            reject({ success: false, error: 'Failed to parse response' });
                        }
                    } else {
                        reject({ success: false, error: `Upload failed with status ${xhr.status}` });
                    }
                };

                xhr.onerror = () => {
                    reject({ success: false, error: 'Network error during upload' });
                };

                xhr.send(formData);
            });
        };

        // Upload media with concurrency limit (3 at a time)
        const uploadWithConcurrency = async (items, limit = 3) => {
            const results = [];
            const executing = [];

            // Progress handler to update UI
            const handleProgress = (index, progressData) => {
                const mediaPreviewItems = document.querySelectorAll('#mediaPreviews .media-preview-item');
                if (mediaPreviewItems[index]) {
                    const item = mediaPreviewItems[index];

                    // Check if progress overlay exists, if not create it
                    let progressOverlay = item.querySelector('.upload-progress-overlay');
                    if (!progressOverlay) {
                        progressOverlay = document.createElement('div');
                        progressOverlay.className = 'upload-progress-overlay';
                        item.appendChild(progressOverlay);
                    }

                    // Calculate speed in KB/s or MB/s
                    const speedKB = progressData.speed / 1024;
                    const speedDisplay = speedKB > 1024
                        ? `${(speedKB / 1024).toFixed(2)} MB/s`
                        : `${speedKB.toFixed(2)} KB/s`;

                    // Update progress overlay content
                    progressOverlay.innerHTML = `
                        <div class="progress-content">
                            <div class="progress-circle-small">${progressData.percent}%</div>
                            <div class="upload-stats">
                                <div class="upload-size">${formatBytes(progressData.loaded)} / ${formatBytes(progressData.total)}</div>
                                <div class="upload-speed">${speedDisplay}</div>
                            </div>
                        </div>
                    `;
                }
            };

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const promise = uploadMediaFile(item, i, handleProgress).then(result => {
                    // Remove progress overlay on completion
                    const mediaPreviewItems = document.querySelectorAll('#mediaPreviews .media-preview-item');
                    if (mediaPreviewItems[i]) {
                        const progressOverlay = mediaPreviewItems[i].querySelector('.upload-progress-overlay');
                        if (progressOverlay) {
                            progressOverlay.remove();
                        }
                    }

                    executing.splice(executing.indexOf(promise), 1);
                    return result;
                }).catch(error => {
                    // Remove progress overlay on error
                    const mediaPreviewItems = document.querySelectorAll('#mediaPreviews .media-preview-item');
                    if (mediaPreviewItems[i]) {
                        const progressOverlay = mediaPreviewItems[i].querySelector('.upload-progress-overlay');
                        if (progressOverlay) {
                            progressOverlay.remove();
                        }
                    }

                    executing.splice(executing.indexOf(promise), 1);
                    return error;
                });

                results.push(promise);
                executing.push(promise);

                if (executing.length >= limit) {
                    await Promise.race(executing);
                }
            }

            return Promise.allSettled(results);
        };

        // Upload all media files (images/videos/audio from media strip)
        let uploadedMedia = [];

        if (pastedMedia.length > 0) {
            const uploadResults = await uploadWithConcurrency(pastedMedia, 3);

            // Process results - only keep successful uploads
            uploadedMedia = uploadResults
                .filter(result => result.status === 'fulfilled' && result.value.success)
                .map(result => result.value);

            // Show warning if some uploads failed
            const failedCount = uploadResults.length - uploadedMedia.length;
            if (failedCount > 0) {
                console.warn(`${failedCount} media upload(s) failed`);
            }
        }

        // Send text message if present
        if (message !== "") {
            const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const messagePayload = {
                roomKey,
                username,
                id: messageId,
                message: { type: 'text', content: message },
                seenBy: []
            };

            // Add reply context if present
            if (replyContext) {
                messagePayload.replyTo = {
                    messageId: replyContext.messageId,
                    sender: replyContext.sender,
                    previewText: replyContext.previewText
                };
            }

            socket.emit("chat-message", messagePayload);
        }

        // Send media messages (images, videos, audio)
        for (const media of uploadedMedia) {
            let messageType = 'video'; // default

            if (media.file.type.startsWith('image')) {
                messageType = 'image';
            } else if (media.file.type.startsWith('audio')) {
                messageType = 'audio';
            } else if (media.file.type.startsWith('video')) {
                messageType = 'video';
            }

            const messageId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

            const messagePayload = {
                roomKey,
                username,
                id: messageId,
                message: {
                    type: messageType,
                    content: media.path
                },
                seenBy: []
            };

            // Add reply context if present (only to first media item)
            if (replyContext) {
                messagePayload.replyTo = {
                    messageId: replyContext.messageId,
                    sender: replyContext.sender,
                    previewText: replyContext.previewText
                };
            }

            // Display immediately for sender to ensure correct alignment
            displayMessage(username, {
                type: messageType,
                content: media.path
            }, messageId, [], replyContext ? messagePayload.replyTo : null);

            // Also emit to server to broadcast to other users
            socket.emit("chat-message", messagePayload);
        }

        // Cleanup: revoke all object URLs
        pastedMedia.forEach(item => {
            if (item.objectUrl) {
                URL.revokeObjectURL(item.objectUrl);
            }
        });

        // Clear state
        pastedMedia.length = 0; // Clear array
        clearReplyContext(); // Clear reply mode

        messageInput.value = "";
        autoResizeTextarea(); // Reset height
        renderMediaPreviews(); // Hide preview strip
        messageInput.focus();
    };


    fileInput.onchange = () => {
        const files = Array.from(fileInput.files);
        if (files.length === 0) return;

        const mediaFiles = [];
        const otherFiles = [];

        // Separate media from other file types
        for (const file of files) {
            if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
                mediaFiles.push(file);
            } else {
                otherFiles.push(file);
            }
        }

        // Add media files to preview (up to limit)
        for (const file of mediaFiles) {
            if (pastedMedia.length >= MAX_MEDIA_ITEMS) {
                console.warn('Media limit reached, some files not added');
                break;
            }
            const objectUrl = URL.createObjectURL(file);
            pastedMedia.push({ file, objectUrl });
        }

        // Render previews if media was added
        if (mediaFiles.length > 0) {
            renderMediaPreviews();
        }

        // Send other files immediately (PDFs, docs, etc.)
        for (const file of otherFiles) {
            sendFile(file);
        }

        // Clear input to allow selecting same files again
        fileInput.value = "";
    };

    // File button triggers file input
    fileBtn.onclick = () => {
        fileInput.click();
    };

    // Record button toggles audio recording
    recordBtn.onclick = () => {
        if (isRecording) {
            stopAudioRecording();
        } else {
            startAudioRecording();
        }
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

    confirmCancelBtn.onclick = () => {
        if (uploadToCancel) {
            cancelUpload(uploadToCancel);
            uploadToCancel = null;
        }
        cancelUploadModal.classList.add("hidden");
    };

    denyCancelBtn.onclick = () => {
        uploadToCancel = null;
        cancelUploadModal.classList.add("hidden");
    };

    emojiBtn.onclick = () => toggleMediaPicker();

    function toggleMediaPicker() {
        if (mediaPicker.style.display === "block") {
            mediaPicker.style.display = "none";
            return;
        }
        mediaPicker.style.display = "block";
        mediaPicker.innerHTML = "";

        // Create tabs container
        const tabsContainer = document.createElement("div");
        tabsContainer.className = "flex border-b border-slate-700/50 mb-4";

        const emojiTab = document.createElement("button");
        emojiTab.className = "flex-1 py-2 px-4 text-sm font-semibold text-slate-300 hover:text-purple-400 border-b-2 border-transparent hover:border-purple-500/50 transition-colors";
        emojiTab.textContent = "Emoji";
        emojiTab.onclick = () => showEmojiPicker();

        const gifTab = document.createElement("button");
        gifTab.className = "flex-1 py-2 px-4 text-sm font-semibold text-slate-300 hover:text-purple-400 border-b-2 border-transparent hover:border-purple-500/50 transition-colors";
        gifTab.textContent = "GIF";
        gifTab.onclick = () => showGifPicker();

        tabsContainer.appendChild(emojiTab);
        tabsContainer.appendChild(gifTab);
        mediaPicker.appendChild(tabsContainer);

        // Content area
        const contentArea = document.createElement("div");
        contentArea.id = "media-picker-content";
        mediaPicker.appendChild(contentArea);

        // Show emoji by default
        showEmojiPicker();

        function showEmojiPicker() {
            emojiTab.classList.add("border-purple-500", "text-purple-400");
            emojiTab.classList.remove("border-transparent", "text-slate-300");
            gifTab.classList.remove("border-purple-500", "text-purple-400");
            gifTab.classList.add("border-transparent", "text-slate-300");

            contentArea.innerHTML = "";
            if (emojis.length === 0) {
                fetch('/emojis.json').then(res => res.json()).then(data => {
                    emojis = data.map(emoji => emoji.unicode);
                    renderEmojis();
                });
            } else {
                renderEmojis();
            }
        }

        function showGifPicker() {
            gifTab.classList.add("border-purple-500", "text-purple-400");
            gifTab.classList.remove("border-transparent", "text-slate-300");
            emojiTab.classList.remove("border-purple-500", "text-purple-400");
            emojiTab.classList.add("border-transparent", "text-slate-300");

            contentArea.innerHTML = "";
            const searchInput = document.createElement("input");
            searchInput.type = "text";
            searchInput.placeholder = "Search for GIFs...";
            searchInput.className = "w-full p-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 mb-3";
            searchInput.oninput = () => {
                searchGifs(searchInput.value);
            };
            contentArea.appendChild(searchInput);

            const resultsDiv = document.createElement("div");
            resultsDiv.className = "mt-3 grid grid-cols-3 gap-3";
            resultsDiv.id = "gif-results";
            contentArea.appendChild(resultsDiv);

            function searchGifs(query) {
                fetch(`/api/gifs?query=${query || "trending"}`)
                    .then(res => res.json())
                    .then(data => {
                        const gifResults = document.getElementById("gif-results");
                        if (gifResults) {
                            gifResults.innerHTML = "";
                            data.data.forEach(gif => {
                                const img = document.createElement("img");
                                img.src = gif.images.fixed_height.url;
                                img.className = "cursor-pointer w-full rounded-lg hover:opacity-80 transition-opacity";
                                img.loading = "lazy";
                                img.onclick = () => {
                                    socket.emit("chat-message", { roomKey, username, message: { type: 'gif', content: img.src } });
                                    mediaPicker.style.display = "none";
                                };
                                gifResults.appendChild(img);
                            });
                        }
                    });
            }

            searchGifs("trending");
        }
    }

    function renderEmojis() {
        const contentArea = document.getElementById("media-picker-content");
        if (!contentArea) return;

        contentArea.innerHTML = "";
        const emojiGrid = document.createElement("div");
        emojiGrid.className = "grid grid-cols-8 gap-2";
        emojis.forEach(emoji => {
            const btn = document.createElement("button");
            btn.innerHTML = emoji;
            btn.className = "text-2xl hover:scale-125 transition-transform p-2 rounded-lg hover:bg-slate-700/50 active:scale-100";
            btn.onclick = () => {
                messageInput.value += emoji;
                messageInput.focus();
            };
            emojiGrid.appendChild(btn);
        });
        contentArea.appendChild(emojiGrid);
    }

    function openPreview(src, type) {
        previewModal.classList.remove('hidden');
        if (type.startsWith('image') || type === 'gif') {
            previewContent.innerHTML = `<img src="${src}" class="max-w-full max-h-[90vh] object-contain">`;
        } else if (type.startsWith('video')) {
            previewContent.innerHTML = `<video src="${src}" controls autoplay class="max-w-full max-h-[90vh]"></video>`;
        }
    }

    closePreview.onclick = () => {
        previewModal.classList.add('hidden');
        previewContent.innerHTML = "";
    };

    messagesDiv.addEventListener('click', (e) => {
        if (e.target.classList.contains('message-file-preview')) {
            let type;
            if (e.target.tagName === 'IMG') {
                type = e.target.src.endsWith('.gif') ? 'gif' : 'image/png';
            } else if (e.target.tagName === 'VIDEO') {
                type = 'video/mp4';
            }
            openPreview(e.target.src, type);
        }
    });

    function handleMobileKeyboard() {
        // Check for visualViewport support
        if (!window.visualViewport) {
            console.warn('visualViewport not supported, keyboard handling may be limited');
            return;
        }

        const chatScreen = document.getElementById('chatScreen');
        const messagesDiv = document.getElementById('messages');

        if (!chatScreen) return;

        let isAtBottom = true;

        function updateViewportHeight() {
            // Get the visual viewport height (excludes keyboard)
            const viewportHeight = window.visualViewport.height;

            // Set CSS variable for dynamic height
            document.documentElement.style.setProperty('--vvh', `${viewportHeight}px`);

            // If user was at bottom before keyboard opened, keep them at bottom
            if (messagesDiv && isAtBottom) {
                requestAnimationFrame(() => {
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                });
            }
        }

        function checkScrollPosition() {
            if (!messagesDiv) return;
            // Check if user is at bottom (within 100px threshold)
            const threshold = 100;
            isAtBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < threshold;
        }

        // Listen to scroll to track if user is at bottom
        if (messagesDiv) {
            messagesDiv.addEventListener('scroll', checkScrollPosition);
        }

        // Listen to resize events (keyboard open/close)
        window.visualViewport.addEventListener('resize', updateViewportHeight);
        window.visualViewport.addEventListener('scroll', updateViewportHeight);

        // Initial call
        updateViewportHeight();

        // Cleanup function (call when leaving chat)
        window.cleanupMobileKeyboard = function () {
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', updateViewportHeight);
                window.visualViewport.removeEventListener('scroll', updateViewportHeight);
            }
            if (messagesDiv) {
                messagesDiv.removeEventListener('scroll', checkScrollPosition);
            }
            document.documentElement.style.removeProperty('--vvh');
        };
    }

    // ======== REPLY GESTURE HANDLERS ========

    // Reply cancel button handler
    if (replyCancelBtn) {
        replyCancelBtn.onclick = () => {
            clearReplyContext();
        };
    }

    // Gesture state
    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false;
    let longPressTimeout = null;
    let lastClickTime = 0;
    let lastClickedMessage = null;

    // Event delegation for message gestures
    if (messagesDiv) {
        // Touch start - for swipe and long-press detection
        messagesDiv.addEventListener('touchstart', (e) => {
            const messageBubble = e.target.closest('.sent-message, .received-message');
            if (!messageBubble) return;

            const messageWrapper = messageBubble.closest('.message');
            if (!messageWrapper || !messageWrapper.id) return;

            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            isSwiping = false;

            longPressTimeout = setTimeout(() => {
                if (!isSwiping) {
                    const messageData = extractMessageData(messageWrapper);
                    if (messageData) {
                        setReplyContext(messageData);
                        if (navigator.vibrate) {
                            navigator.vibrate(50);
                        }
                    }
                }
            }, 400);
        }, { passive: true });

        // Touch move - for swipe detection
        messagesDiv.addEventListener('touchmove', (e) => {
            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }

            const messageBubble = e.target.closest('.sent-message, .received-message');
            if (!messageBubble) return;

            const touchX = e.touches[0].clientX;
            const touchY = e.touches[0].clientY;
            const deltaX = touchStartX - touchX;
            const deltaY = Math.abs(touchStartY - touchY);

            // If vertical scroll is dominant, don't swipe
            if (deltaY > 10 && deltaY > Math.abs(deltaX)) {
                isSwiping = false;
                return;
            }

            if (deltaX >= 30) {
                e.preventDefault();
                isSwiping = true;
                const messageWrapper = messageBubble.closest('.message');
                if (messageWrapper && !messageWrapper.classList.contains('message-swipe-active')) {
                    messageWrapper.classList.add('message-swipe-active');
                }
            }
        });

        // Touch end - finalize swipe or cancel long-press
        messagesDiv.addEventListener('touchend', (e) => {
            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }

            const messageBubble = e.target.closest('.sent-message, .received-message');
            if (!messageBubble) return;

            const messageWrapper = messageBubble.closest('.message');
            if (!messageWrapper || !messageWrapper.id) return;

            if (isSwiping && messageWrapper.classList.contains('message-swipe-active')) {
                const messageData = extractMessageData(messageWrapper);
                if (messageData) {
                    setReplyContext(messageData);
                    // Vibrate if supported
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                }
            }

            // Remove swipe animation
            messageWrapper.classList.remove('message-swipe-active');
            isSwiping = false;
        }, { passive: true });

        // Double-click handler for desktop
        messagesDiv.addEventListener('click', (e) => {
            const messageBubble = e.target.closest('.sent-message, .received-message');
            if (!messageBubble) return;

            const messageWrapper = messageBubble.closest('.message');
            if (!messageWrapper || !messageWrapper.id) return;

            const now = Date.now();
            const timeSinceLastClick = now - lastClickTime;

            // Double-click detected (within 300ms)
            if (timeSinceLastClick < 300 && lastClickedMessage === messageWrapper.id) {
                const messageData = extractMessageData(messageWrapper);
                if (messageData) {
                    setReplyContext(messageData);
                }
                lastClickTime = 0;
                lastClickedMessage = null;
            } else {
                lastClickTime = now;
                lastClickedMessage = messageWrapper.id;
            }
        });
    }

    // Extract message data from DOM element
    function extractMessageData(messageWrapper) {
        const messageId = messageWrapper.id;
        const seenStatus = messageWrapper.querySelector('.seen-status');
        const sender = seenStatus ? seenStatus.getAttribute('data-msg-user') : username;

        // Find message bubble to check quotedReply
        const quotedReply = messageWrapper.querySelector('.quoted-reply');
        const messageBubble = messageWrapper.querySelector('.sent-message, .received-message');

        if (!messageBubble) return null;

        // Extract text content or determine media type
        let message = { type: 'text', content: '' };

        if (messageBubble.querySelector('.sticker-message')) {
            message = { type: 'sticker', content: '' };
        } else if (messageBubble.querySelector('img')) {
            message = { type: 'image', content: '' };
        } else if (messageBubble.querySelector('video')) {
            message = { type: 'video', content: '' };
        } else if (messageBubble.querySelector('audio')) {
            message = { type: 'audio', content: '' };
        } else {
            // Extract text
            const textSpan = messageBubble.querySelector('.text-sm');
            message.content = textSpan ? textSpan.textContent : messageBubble.textContent;
        }

        const result = {
            id: messageId,
            username: sender,
            message: message
        };

        // If this message has a quoted reply, extract replyTo data
        if (quotedReply) {
            const quotedSender = quotedReply.querySelector('.quoted-sender');
            const quotedPreview = quotedReply.querySelector('.quoted-preview');
            result.replyTo = {
                sender: quotedSender ? quotedSender.textContent.replace('~', '') : '',
                previewText: quotedPreview ? quotedPreview.textContent : '',
                messageId: messageId // This would need proper tracking
            };
        }

        return result;
    }

    restoreSession();

    // Track tab visibility for proper "seen" status
    document.addEventListener('visibilitychange', () => {
        isTabVisible = !document.hidden;

        // When user returns to tab, mark all pending messages as seen
        if (isTabVisible && pendingSeenMessages.size > 0) {
            pendingSeenMessages.forEach(messageId => {
                socket.emit("mark-seen", { roomKey, messageId, username });
            });
            pendingSeenMessages.clear();
        }
    });

    // Socket.io Handlers
    socket.on("room-created", (data) => {
        isAdmin = data.isAdmin;
        if (isAdmin) killRoomBtn.classList.remove("hidden");
        saveSession();
        showChatScreen();
        displaySystemMessage("You created the room and are now the admin.");
    });

    socket.on("join-approved", (data) => {
        messagesDiv.innerHTML = "";
        lastMessageUser = null;

        // Sort messages by timestamp to maintain chronological order
        const messages = data.messages || [];
        messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        // Display messages in chronological order
        messages.forEach(msg => {
            if (msg.file) {
                // This is a file message
                displayFile(msg.username, msg.file, msg.id || msg.messageId, msg.seenBy || []);
            } else {
                // This is a text/media message
                displayMessage(msg.username, msg.message, msg.id || msg.messageId, msg.seenBy || []);
            }
        });

        saveSession();
        showChatScreen();
        displaySystemMessage("Your request was approved. Welcome to the room!");
    });

    socket.on("promoted-to-admin", () => {
        isAdmin = true;
        killRoomBtn.classList.remove("hidden");
        saveSession();
        displaySystemMessage("The previous admin left. You are the new admin!");
    });

    // Handle forced disconnections without leave prompt
    socket.on("room-inactive", (message) => {
        // Room closed due to inactivity - skip leave prompt
        if (window.cleanupMobileKeyboard) {
            window.cleanupMobileKeyboard();
        }
        localStorage.removeItem("roomKey");
        localStorage.removeItem("username");
        localStorage.removeItem("isAdmin");
        chatScreen.style.display = "none";
        joinScreen.style.display = "flex";
        messagesDiv.innerHTML = "";
        isAdmin = false;
        killRoomBtn.classList.add("hidden");
        document.body.classList.remove("chat-active");
        alert(message);
    });

    socket.on("user-removed", () => {
        // Removed by admin - skip leave prompt
        if (window.cleanupMobileKeyboard) {
            window.cleanupMobileKeyboard();
        }
        localStorage.removeItem("roomKey");
        localStorage.removeItem("username"); localStorage.removeItem("isAdmin");
        chatScreen.style.display = "none";
        joinScreen.style.display = "flex";
        messagesDiv.innerHTML = "";
        isAdmin = false;
        killRoomBtn.classList.add("hidden");
        document.body.classList.remove("chat-active");
        alert("You have been removed from the room by the admin.");
    });

    socket.on("update-user-list", (users) => updateUserList(users));

    socket.on("room-killed", () => {
        alert("The admin has ended the room.");
        leaveBtn.click();
    });

    socket.on("user-removed", () => {
        alert("You have been removed from the room by the admin.");
        leaveBtn.click();
    });

    socket.on("room-inactive", (message) => {
        alert(message || "Room has been closed due to inactivity.");
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
        messagesDiv.innerHTML = "";
        lastMessageUser = null;
        messages.forEach((msg) => displayMessage(msg.username, msg.message, msg.id || msg.messageId, msg.seenBy || [], msg.replyTo || null));
        files.forEach((file) => displayFile(file.username, file.file, file.id || file.messageId, file.seenBy || []));
    });

    socket.on("chat-message", (msg) => displayMessage(msg.username, msg.message, msg.id, msg.seenBy || [], msg.replyTo || null));

    // Production-grade typing indicator handlers
    socket.on("user-typing-start", ({ userId, username: typingUsername }) => {
        // Never show own typing indicator
        if (userId === socket.id) return;

        // Add user to typing Map
        typingUsers.set(userId, typingUsername);
        updateTypingIndicator();

        // Safety timeout: auto-remove after 3s if no stop received
        if (typingSafetyTimeouts.has(userId)) {
            clearTimeout(typingSafetyTimeouts.get(userId));
        }
        const timeout = setTimeout(() => {
            typingUsers.delete(userId);
            typingSafetyTimeouts.delete(userId);
            updateTypingIndicator();
        }, 3000);
        typingSafetyTimeouts.set(userId, timeout);
    });

    socket.on("user-typing-stop", ({ userId }) => {
        typingUsers.delete(userId);
        if (typingSafetyTimeouts.has(userId)) {
            clearTimeout(typingSafetyTimeouts.get(userId));
            typingSafetyTimeouts.delete(userId);
        }
        updateTypingIndicator();
    });

    // Update typing indicator display
    function updateTypingIndicator() {
        const indicator = document.getElementById("typingIndicator");
        const count = typingUsers.size;

        // Hide if recording indicator is active (recording takes priority)
        if (recordingIndicatorActive) {
            if (indicator) {
                indicator.classList.add('hidden');
            }
            return;
        }

        if (count === 0) {
            if (indicator) {
                indicator.classList.add("hidden");
            }
            return;
        }

        if (!indicator) return; // Element not yet created

        indicator.classList.remove("hidden");
        const typingText = indicator.querySelector(".typing-text");
        if (!typingText) return;

        const users = Array.from(typingUsers.values());

        // Instagram-like text formatting
        if (count === 1) {
            typingText.textContent = `${users[0]} is typing`;
        } else if (count === 2) {
            typingText.textContent = `${users[0]} and ${users[1]} are typing`;
        } else {
            typingText.textContent = "Several people are typing";
        }
    }

    // Recording indicator socket handlers
    socket.on("user-recording-start", ({ userId, username: recordingUsername }) => {
        // Never show own recording indicator
        if (userId === socket.id) return;

        // Add user to recording Map
        recordingUsers.set(userId, recordingUsername);
        updateRecordingIndicator();
    });

    socket.on("user-recording-stop", ({ userId }) => {
        recordingUsers.delete(userId);
        updateRecordingIndicator();
    });

    socket.on("message-seen-update", ({ messageId, seenBy }) => {
        const msgEnv = document.getElementById(messageId);
        if (msgEnv) {
            const seenStatus = msgEnv.querySelector('.seen-status');
            if (seenStatus) {
                const msgUser = seenStatus.getAttribute('data-msg-user');
                // Update seen status display for this user (will handle showing only on last message)
                updateSeenStatusDisplay(msgUser, seenBy);
            }
        }
    });


    socket.on("file-uploaded", ({ id, username: user, file, seenBy = [] }) => {
        // Don't display if message already exists (uploader already displayed it)
        if (document.getElementById(id)) {
            return;
        }
        // Display for all users (server broadcasts to everyone)
        displayFile(user, file, id, seenBy);
    });

    socket.on("user-joined", (username) => displaySystemMessage(`${username} joined the room`));
    socket.on("user-left", (username) => displaySystemMessage(`${username} left the room`));
});
