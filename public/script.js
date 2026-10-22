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
    const fileRoomScreen = document.getElementById("fileRoomScreen");
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

    // Theme toggle elements
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    const themeToggleIcon = document.getElementById("themeToggleIcon");
    const themeToggleText = document.getElementById("themeToggleText");


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

    // Reply preview bar elements
    const replyPreviewBar = document.getElementById("replyPreviewBar");
    const replyCancelBtn = document.getElementById("replyCancelBtn");

    // Stable hash helper for sender name color
    function getSenderColor(name) {
        const isLight = document.body.classList.contains('light-mode');
        if (isLight) {
            const lightColors = ['#d95305', '#b43b02', '#c2410c', '#9a3412', '#a16207'];
            let hash = 0;
            for (let i = 0; i < (name || '').length; i++) {
                hash = name.charCodeAt(i) + ((hash << 5) - hash);
            }
            return lightColors[Math.abs(hash) % lightColors.length];
        }
        const colors = ['#ffb682', '#ffd9bd', '#ffffff', '#ff9150'];
        let hash = 0;
        for (let i = 0; i < (name || '').length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }

    // Theme application and toggle logic
    function applyTheme(theme) {
        if (theme === 'light') {
            document.body.classList.add('light-mode');
            if (themeToggleIcon) themeToggleIcon.className = "fas fa-moon text-xs";
            if (themeToggleText) themeToggleText.textContent = "Dark";
            if (themeToggleBtn) themeToggleBtn.title = "Switch to dark mode";
        } else {
            document.body.classList.remove('light-mode');
            if (themeToggleIcon) themeToggleIcon.className = "fas fa-sun text-xs";
            if (themeToggleText) themeToggleText.textContent = "Light";
            if (themeToggleBtn) themeToggleBtn.title = "Switch to light mode";
        }
    }

    // Initialize theme: Landing hero is strictly dark mode
    const savedTheme = localStorage.getItem('anon_chat_theme') || 'dark';
    const isInsideRoom = (chatScreen && chatScreen.style.display !== 'none' && chatScreen.style.display !== '') || 
                         (fileRoomScreen && fileRoomScreen.style.display !== 'none' && fileRoomScreen.style.display !== '');
    if (isInsideRoom) {
        applyTheme(savedTheme);
    } else {
        document.body.classList.remove('light-mode');
    }

    if (themeToggleBtn) {
        themeToggleBtn.onclick = () => {
            const isLight = document.body.classList.contains('light-mode');
            const newTheme = isLight ? 'dark' : 'light';
            localStorage.setItem('anon_chat_theme', newTheme);
            applyTheme(newTheme);
        };
    }

    // Time formatting helper (e.g. "10:45 am")
    function formatMsgTime(timestamp) {
        const d = timestamp ? new Date(timestamp) : new Date();
        let hours = d.getHours();
        let minutes = d.getMinutes();
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12;
        hours = hours ? hours : 12;
        minutes = minutes < 10 ? '0' + minutes : minutes;
        return `${hours}:${minutes} ${ampm}`;
    }

    // Helper to get message container target (inner centered container)
    function getMessagesTarget() {
        return document.getElementById("messagesInner") || messagesDiv;
    }

    // Helper to clear messages container while preserving day chip
    function clearMessages() {
        const inner = document.getElementById("messagesInner");
        if (inner) {
            inner.innerHTML = '<div class="day-chip-wrapper" id="dayChip"><span class="day-chip">Today</span></div>';
        } else {
            messagesDiv.innerHTML = "";
        }
    }

    // Helper to ensure day chip exists in messages container
    function ensureDayChip() {
        const target = getMessagesTarget();
        if (!target.querySelector('.day-chip-wrapper')) {
            const dayWrapper = document.createElement('div');
            dayWrapper.className = 'day-chip-wrapper';
            dayWrapper.id = 'dayChip';
            dayWrapper.innerHTML = '<span class="day-chip">Today</span>';
            target.prepend(dayWrapper);
        }
    }

    // Unified Exit button state (End group for admin, Leave for member)
    function updateExitButton() {
        if (!leaveBtn) return;
        const btnText = leaveBtn.querySelector(".header-btn-text");
        const btnIcon = leaveBtn.querySelector("i");
        if (isAdmin) {
            leaveBtn.title = "End group";
            leaveBtn.classList.add("header-btn-danger");
            if (btnText) btnText.textContent = "End group";
            if (btnIcon) btnIcon.className = "fas fa-trash-alt text-xs";
        } else {
            leaveBtn.title = "Leave chat";
            leaveBtn.classList.remove("header-btn-danger");
            if (btnText) btnText.textContent = "Leave";
            if (btnIcon) btnIcon.className = "fas fa-sign-out-alt text-xs";
        }
        if (killRoomBtn) {
            killRoomBtn.classList.add("hidden");
        }
    }

    // Functions
    function showLandingScreen() {
        document.documentElement.classList.remove("loading-file-room");
        document.documentElement.classList.remove("chat-active");
        chatScreen.style.display = "none";
        if (fileRoomScreen) fileRoomScreen.style.display = "none";
        joinScreen.style.display = "";
        document.body.classList.remove("chat-active");
        document.body.classList.remove("light-mode");
    }

    function showChatScreen() {
        document.documentElement.classList.remove("loading-file-room");
        try { localStorage.removeItem("anon_file_room_id"); } catch (e) {}
        joinScreen.style.display = "none";
        if (fileRoomScreen) fileRoomScreen.style.display = "none";
        chatScreen.style.display = "flex";
        document.documentElement.classList.add("chat-active");
        document.body.classList.add("chat-active");
        updateExitButton();
        handleMobileKeyboard();
        ensureDayChip();
        const maskedKeyEl = document.getElementById("maskedRoomKey");
        if (maskedKeyEl && roomKey) {
            maskedKeyEl.textContent = "•".repeat(Math.min(Math.max(roomKey.length, 6), 10));
        }
        const savedTheme = localStorage.getItem('anon_chat_theme') || 'dark';
        applyTheme(savedTheme);
    }

    function showFileRoomScreen() {
        document.documentElement.classList.remove("loading-file-room");
        document.documentElement.classList.remove("chat-active");
        joinScreen.style.display = "none";
        chatScreen.style.display = "none";
        if (fileRoomScreen) fileRoomScreen.style.display = "flex";
        document.body.classList.remove("chat-active");
        const savedTheme = localStorage.getItem('anon_chat_theme') || 'dark';
        applyTheme(savedTheme);
    }

    function displaySystemMessage(message) {
        const div = document.createElement("div");
        div.className = "system-message";
        div.innerText = message;
        getMessagesTarget().appendChild(div);
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

        if (isConsecutive) {
            wrapper.classList.add("consecutive");
        }

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
                <div class="flex items-center gap-3 py-0.5">
                    <i class="fas fa-microphone text-base ${user === username ? 'text-black' : 'text-[#ffb682]'}"></i>
                    <audio controls class="flex-1" style="height: 32px; max-width: 200px;">
                        <source src="${message.content}" type="audio/webm">
                    </audio>
                    <a href="${message.content}" download="audio-${Date.now()}.webm" class="${user === username ? 'text-black hover:opacity-75' : 'text-white hover:text-[#ffb682]'}" title="Download">
                        <i class="fas fa-download"></i>
                    </a>
                </div>`;
            }
        }

        const msgTimeHtml = `<span class="msg-time">${formatMsgTime(message.timestamp || Date.now())}</span>`;
        let senderHtml = '';
        if (!isConsecutive && user !== username) {
            senderHtml = `<div class="msg-sender" style="color: ${getSenderColor(user)};">${user}</div>`;
        }

        if (message.type === 'text') {
            messageBubble.innerHTML = senderHtml + quotedReplyHtml + `<span class="msg-text">${contentHtml}</span>` + msgTimeHtml;
        } else {
            messageBubble.innerHTML = senderHtml + quotedReplyHtml + contentHtml + msgTimeHtml;
        }
        messageRow.appendChild(messageBubble);

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

        getMessagesTarget().appendChild(wrapper);

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

    // Helper function to update seen status - only show on last message from a user
    function updateSeenStatusDisplay(user, seenBy) {
        // Find all messages from this user
        const allMessages = getMessagesTarget().querySelectorAll('.message');
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

        if (typeof updateSendButtonState === 'function') {
            updateSendButtonState();
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
            const subTextColor = user === username ? 'text-black/70' : 'text-[#9a9a9a]';

            // Create tooltip with full file information
            const fullFileInfo = `${file.name} (${formatBytes(file.size)})`;

            fileHtml = `
            <div class="file-card-content flex items-center p-1" title="${fullFileInfo}">
                <div class="file-icon-box w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-lg mr-3">
                    ${getFileIcon(file)}
                </div>
                <div class="overflow-hidden flex-1">
                    <div class="file-title font-semibold text-sm truncate" title="${file.name}">${truncatedName}</div>
                    <div class="file-subtitle text-xs mt-0.5">${formatBytes(file.size)} • ${friendlyType}</div>
                </div>
            </div>
            <div class="flex gap-2 mt-2 pt-1">
                <a href="${file.path}" target="_blank" class="file-action-btn file-btn-open flex-1 text-center py-2 px-3 rounded-lg text-xs font-semibold transition-colors">
                    <i class="fas fa-external-link-alt mr-1.5"></i>Open
                </a>
                <a href="${file.path}" download="${file.name}" class="file-action-btn file-btn-save flex-1 text-center py-2 px-3 rounded-lg text-xs font-semibold transition-colors">
                    <i class="fas fa-download mr-1.5"></i>Save
                </a>
            </div>
        `;
        }

        const msgTimeHtml = `<span class="msg-time">${formatMsgTime(Date.now())}</span>`;
        let senderHtml = '';
        if (lastMessageUser !== user && user !== username) {
            senderHtml = `<div class="msg-sender" style="color: ${getSenderColor(user)};">${user}</div>`;
        }

        if (messageDiv) {
            // Message already exists (from upload progress), just update content
            const bubble = messageDiv.querySelector(".sent-message") || messageDiv.querySelector(".received-message");
            if (bubble) {
                bubble.innerHTML = senderHtml + fileHtml + msgTimeHtml;
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
            messageBubble.innerHTML = senderHtml + fileHtml + msgTimeHtml;
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

            getMessagesTarget().appendChild(wrapper);
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

        // Wire header online user count
        const headerOnlineCount = document.getElementById("headerOnlineCount");
        if (headerOnlineCount) headerOnlineCount.textContent = users.length;

        // Update mobile user counts
        if (mobileUserCount) mobileUserCount.textContent = users.length;
        if (mobileUserCountText) mobileUserCountText.textContent = users.length;

        // Update current room users Set for seen status filtering
        currentRoomUsers.clear();
        users.forEach(user => {
            currentRoomUsers.add(user.username);
            const isSelf = user.id === socket.id;

            const li = document.createElement("li");
            li.className = "user-row";

            const userInfo = document.createElement("div");
            userInfo.className = "flex items-center gap-2.5 min-w-0";

            const avatar = document.createElement("div");
            avatar.className = `user-avatar ${isSelf ? 'is-self' : ''}`;
            avatar.textContent = (user.username || '?').charAt(0).toUpperCase();

            const userName = document.createElement("span");
            userName.className = "text-[14px] font-medium text-white truncate";
            userName.textContent = user.username + (isSelf ? " (You)" : "");

            userInfo.appendChild(avatar);
            userInfo.appendChild(userName);

            if (user.isAdmin) {
                const adminTag = document.createElement("span");
                adminTag.className = "admin-tag";
                adminTag.textContent = "Admin";
                userInfo.appendChild(adminTag);
            }

            li.appendChild(userInfo);

            if (isAdmin && !isSelf) {
                const removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.innerHTML = '<i class="fas fa-user-minus"></i>';
                removeBtn.className = "user-remove-btn";
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
                const isSelf = user.id === socket.id;

                const li = document.createElement("li");
                li.className = "user-row";

                const userInfo = document.createElement("div");
                userInfo.className = "flex items-center gap-2.5 min-w-0";

                const avatar = document.createElement("div");
                avatar.className = `user-avatar ${isSelf ? 'is-self' : ''}`;
                avatar.textContent = (user.username || '?').charAt(0).toUpperCase();

                const userName = document.createElement("span");
                userName.className = "text-[14px] font-medium text-white truncate";
                userName.textContent = user.username + (isSelf ? " (You)" : "");

                userInfo.appendChild(avatar);
                userInfo.appendChild(userName);

                if (user.isAdmin) {
                    const adminTag = document.createElement("span");
                    adminTag.className = "admin-tag";
                    adminTag.textContent = "Admin";
                    userInfo.appendChild(adminTag);
                }

                li.appendChild(userInfo);

                if (isAdmin && !isSelf) {
                    const removeBtn = document.createElement("button");
                    removeBtn.type = "button";
                    removeBtn.innerHTML = '<i class="fas fa-user-minus"></i>';
                    removeBtn.className = "user-remove-btn";
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
        messageBubble.className = "sent-message file-document-bubble";

        const truncatedName = file.name.length > 15 ? file.name.substring(0, 10) + "..." + file.name.substring(file.name.length - 5) : file.name;

        const xhr = new XMLHttpRequest();
        xhr.messageId = messageId;

        const initialContent = `
    <div class="flex items-center gap-4 p-2">
        <div class="progress-circle relative w-14 h-14 flex-shrink-0 flex items-center justify-center">${createProgressCircle(0, messageId)}</div>
        <div class="overflow-hidden flex-1">
            <div class="font-semibold text-sm truncate text-black">${truncatedName}</div>
            <div class="text-xs text-black/70 upload-status mt-1">0 Bytes / ${formatBytes(file.size)}</div>
        </div>
    </div>`;

        messageBubble.innerHTML = initialContent;
        messageRow.appendChild(messageBubble);
        wrapper.appendChild(messageRow);
        getMessagesTarget().appendChild(wrapper);
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

            updateExitButton();

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

    function performLeaveRoom(emitLeave = true) {
        if (leaveChatModal) leaveChatModal.classList.add("hidden");
        if (endRoomModal) endRoomModal.classList.add("hidden");

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

        if (emitLeave && roomKey && username) {
            socket.emit("leave-room", { roomKey, username });
        }

        localStorage.removeItem("roomKey");
        localStorage.removeItem("username");
        localStorage.removeItem("isAdmin");

        showLandingScreen();
        clearMessages();
        roomKeyInput.value = "";
        isAdmin = false;
        updateExitButton();
        if (killRoomBtn) killRoomBtn.classList.add("hidden");
        lastMessageUser = null;
    }

    leaveBtn.onclick = () => {
        if (isAdmin) {
            // Admin clicking single exit button triggers End group
            if (endRoomModal) endRoomModal.classList.remove("hidden");
        } else {
            // Member clicking single exit button triggers Leave
            if (leaveChatModal) leaveChatModal.classList.remove("hidden");
        }
    };

    // Confirm leave chat
    confirmLeaveBtn.onclick = () => {
        performLeaveRoom(true);
    };

    // Cancel leave chat
    cancelLeaveBtn.onclick = () => {
        leaveChatModal.classList.add("hidden");
    };

    if (killRoomBtn) {
        killRoomBtn.onclick = () => {
            if (isAdmin && endRoomModal) {
                endRoomModal.classList.remove("hidden");
            }
        };
    }

    // Confirm end room - single confirmation, redirects directly to landing page
    confirmEndRoomBtn.onclick = () => {
        const currentKey = roomKey;
        socket.emit("kill-room", { roomKey: currentKey });
        performLeaveRoom(false);
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

    // Copy room key handler for invite card
    const copyRoomKeyBtn = document.getElementById("copyRoomKeyBtn");
    if (copyRoomKeyBtn) {
        copyRoomKeyBtn.onclick = () => {
            if (!roomKey) return;
            navigator.clipboard.writeText(roomKey).then(() => {
                const originalText = copyRoomKeyBtn.textContent;
                copyRoomKeyBtn.textContent = "Copied!";
                setTimeout(() => {
                    copyRoomKeyBtn.textContent = originalText;
                }, 1500);
            }).catch(err => {
                console.error("Failed to copy room key:", err);
            });
        };
    }

    // Send button disabled state helper
    function updateSendButtonState() {
        const hasText = messageInput && messageInput.value.trim().length > 0;
        const hasMedia = (typeof pastedMedia !== 'undefined' && pastedMedia.length > 0) || fileToSend !== null;
        if (sendBtn) {
            sendBtn.disabled = !hasText && !hasMedia;
        }
    }

    // Initialize send button state
    updateSendButtonState();

    messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    messageInput.addEventListener("input", () => {
        // Auto-resize textarea
        autoResizeTextarea();
        updateSendButtonState();

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
        updateSendButtonState();
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

    emojiBtn.onclick = (e) => {
        e.stopPropagation();
        toggleMediaPicker();
    };

    function toggleMediaPicker() {
        const isHidden = mediaPicker.classList.contains("hidden");
        if (!isHidden) {
            mediaPicker.classList.add("hidden");
            return;
        }
        mediaPicker.classList.remove("hidden");
        mediaPicker.style.display = "";
        mediaPicker.innerHTML = "";

        // Create tabs container
        const tabsContainer = document.createElement("div");
        tabsContainer.className = "flex border-b border-[#2a2a2a] mb-4";

        const emojiTab = document.createElement("button");
        emojiTab.className = "flex-1 py-2 px-4 text-sm font-semibold text-[#9a9a9a] hover:text-white border-b-2 border-transparent transition-colors";
        emojiTab.textContent = "Emoji";
        emojiTab.onclick = () => showEmojiPicker();

        const gifTab = document.createElement("button");
        gifTab.className = "flex-1 py-2 px-4 text-sm font-semibold text-[#9a9a9a] hover:text-white border-b-2 border-transparent transition-colors";
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
            emojiTab.classList.add("border-[#ff7320]", "text-[#ff7320]");
            emojiTab.classList.remove("border-transparent", "text-[#9a9a9a]");
            gifTab.classList.remove("border-[#ff7320]", "text-[#ff7320]");
            gifTab.classList.add("border-transparent", "text-[#9a9a9a]");

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
            gifTab.classList.add("border-[#ff7320]", "text-[#ff7320]");
            gifTab.classList.remove("border-transparent", "text-[#9a9a9a]");
            emojiTab.classList.remove("border-[#ff7320]", "text-[#ff7320]");
            emojiTab.classList.add("border-transparent", "text-[#9a9a9a]");

            contentArea.innerHTML = "";
            const searchInput = document.createElement("input");
            searchInput.type = "text";
            searchInput.placeholder = "Search for GIFs...";
            searchInput.className = "w-full p-2.5 rounded-lg bg-[#242424] border border-[#333333] text-white placeholder-[#808080] focus:outline-none focus:border-[#ffb682] mb-3 text-sm";
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
                                    mediaPicker.classList.add("hidden");
                                };
                                gifResults.appendChild(img);
                            });
                        }
                    });
            }

            searchGifs("trending");
        }
    }

    // Dismiss media picker when clicking outside or pressing Escape
    document.addEventListener("click", (e) => {
        if (mediaPicker && !mediaPicker.classList.contains("hidden")) {
            if (!mediaPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
                mediaPicker.classList.add("hidden");
            }
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (mediaPicker && !mediaPicker.classList.contains("hidden")) {
                mediaPicker.classList.add("hidden");
            }
        }
    });

    function renderEmojis() {
        const contentArea = document.getElementById("media-picker-content");
        if (!contentArea) return;

        contentArea.innerHTML = "";
        const emojiGrid = document.createElement("div");
        emojiGrid.className = "grid grid-cols-8 gap-2";
        emojis.forEach(emoji => {
            const btn = document.createElement("button");
            btn.innerHTML = emoji;
            btn.className = "text-2xl p-2 rounded-lg hover:bg-[#2c2c2c] transition-colors cursor-pointer";
            btn.onclick = () => {
                messageInput.value += emoji;
                messageInput.focus();
                updateSendButtonState();
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
        if (window.cleanupMobileKeyboard) {
            window.cleanupMobileKeyboard();
        }

        const chatScreen = document.getElementById('chatScreen');
        const messagesDiv = document.getElementById('messages');
        const messageInput = document.getElementById('messageInput');
        const chatHeader = document.getElementById('chat-header');

        if (!chatScreen) return;

        let isAtBottom = true;

        function checkScrollPosition() {
            if (!messagesDiv) return;
            const threshold = 100;
            isAtBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < threshold;
        }

        function scrollMessagesToBottom(instant = false) {
            if (!messagesDiv) return;
            requestAnimationFrame(() => {
                if (instant) {
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                } else {
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                }
            });
        }

        function updateViewportHeight() {
            if (!chatScreen || chatScreen.style.display === "none") return;

            let viewportHeight = window.innerHeight;
            let offsetTop = 0;

            if (window.visualViewport) {
                viewportHeight = window.visualViewport.height;
                offsetTop = window.visualViewport.offsetTop || 0;
            }

            document.documentElement.style.setProperty('--vvh', `${viewportHeight}px`);
            chatScreen.style.height = `${viewportHeight}px`;
            chatScreen.style.top = `${offsetTop}px`;

            // Enforce window scroll position at (0, 0)
            if (window.scrollY !== 0 || window.scrollX !== 0) {
                window.scrollTo(0, 0);
            }

            // If user was at bottom before keyboard opened, keep them at bottom
            if (messagesDiv && isAtBottom) {
                requestAnimationFrame(() => {
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                });
            }
        }

        function onInputFocus() {
            window.scrollTo(0, 0);
            setTimeout(() => {
                window.scrollTo(0, 0);
                updateViewportHeight();
                scrollMessagesToBottom(true);
            }, 50);
            setTimeout(() => {
                window.scrollTo(0, 0);
                updateViewportHeight();
                scrollMessagesToBottom(true);
            }, 250);
        }

        function onInputBlur() {
            setTimeout(() => {
                window.scrollTo(0, 0);
                updateViewportHeight();
            }, 100);
        }

        function preventTouchHeader(e) {
            e.preventDefault();
        }

        function preventWindowScroll() {
            if (document.documentElement.classList.contains("chat-active") || document.body.classList.contains("chat-active")) {
                if (window.scrollY !== 0 || window.scrollX !== 0) {
                    window.scrollTo(0, 0);
                }
            }
        }

        // Listen to scroll to track if user is at bottom
        if (messagesDiv) {
            messagesDiv.addEventListener('scroll', checkScrollPosition, { passive: true });
        }

        // Listen to resize and scroll events (keyboard open/close)
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', updateViewportHeight);
            window.visualViewport.addEventListener('scroll', updateViewportHeight);
        }
        window.addEventListener('resize', updateViewportHeight);
        window.addEventListener('scroll', preventWindowScroll, { passive: true });

        if (messageInput) {
            messageInput.addEventListener('focus', onInputFocus);
            messageInput.addEventListener('blur', onInputBlur);
        }

        if (chatHeader) {
            chatHeader.addEventListener('touchmove', preventTouchHeader, { passive: false });
        }

        // Initial call
        updateViewportHeight();

        // Cleanup function (call when leaving chat)
        window.cleanupMobileKeyboard = function () {
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', updateViewportHeight);
                window.visualViewport.removeEventListener('scroll', updateViewportHeight);
            }
            window.removeEventListener('resize', updateViewportHeight);
            window.removeEventListener('scroll', preventWindowScroll);
            if (messagesDiv) {
                messagesDiv.removeEventListener('scroll', checkScrollPosition);
            }
            if (messageInput) {
                messageInput.removeEventListener('focus', onInputFocus);
                messageInput.removeEventListener('blur', onInputBlur);
            }
            if (chatHeader) {
                chatHeader.removeEventListener('touchmove', preventTouchHeader);
            }
            document.documentElement.style.removeProperty('--vvh');
            if (chatScreen) {
                chatScreen.style.height = '';
                chatScreen.style.top = '';
            }
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
        updateExitButton();
        if (killRoomBtn) killRoomBtn.classList.add("hidden");
        saveSession();
        showChatScreen();
        displaySystemMessage("You created the room and are now the admin.");
    });

    socket.on("join-approved", (data) => {
        clearMessages();
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

        updateExitButton();
        saveSession();
        showChatScreen();
        displaySystemMessage("Your request was approved. Welcome to the room!");
    });

    socket.on("promoted-to-admin", () => {
        isAdmin = true;
        updateExitButton();
        if (killRoomBtn) killRoomBtn.classList.add("hidden");
        saveSession();
        displaySystemMessage("The previous admin left. You are the new admin!");
    });

    const roomInactiveModal = document.getElementById("roomInactiveModal");
    const roomInactiveText = document.getElementById("roomInactiveText");
    const roomInactiveOkBtn = document.getElementById("roomInactiveOkBtn");

    const roomEndedNoticeModal = document.getElementById("roomEndedNoticeModal");
    const roomEndedNoticeOkBtn = document.getElementById("roomEndedNoticeOkBtn");
    const userRemovedNoticeModal = document.getElementById("userRemovedNoticeModal");
    const userRemovedNoticeOkBtn = document.getElementById("userRemovedNoticeOkBtn");

    if (roomEndedNoticeOkBtn) {
        roomEndedNoticeOkBtn.addEventListener("click", () => {
            if (roomEndedNoticeModal) roomEndedNoticeModal.classList.add("hidden");
            performLeaveRoom(false);
        });
    }

    if (userRemovedNoticeOkBtn) {
        userRemovedNoticeOkBtn.addEventListener("click", () => {
            if (userRemovedNoticeModal) userRemovedNoticeModal.classList.add("hidden");
            performLeaveRoom(false);
        });
    }

    if (roomInactiveOkBtn) {
        roomInactiveOkBtn.addEventListener("click", () => {
            if (roomInactiveModal) roomInactiveModal.classList.add("hidden");
            performLeaveRoom(false);
        });
    }

    // Handle room closed due to inactivity (30 minutes) using in-UI modal
    socket.on("room-inactive", (message) => {
        if (chatScreen.style.display === "none") return;

        const text = typeof message === "string" ? message : (message?.message || "Room has been closed due to 30 minutes of inactivity.");
        if (roomInactiveText) roomInactiveText.textContent = text;
        if (roomInactiveModal) {
            roomInactiveModal.classList.remove("hidden");
        } else {
            performLeaveRoom(false);
        }
    });

    socket.on("user-removed", () => {
        if (chatScreen.style.display === "none") return;

        if (userRemovedNoticeModal) {
            userRemovedNoticeModal.classList.remove("hidden");
        } else {
            performLeaveRoom(false);
        }
    });

    socket.on("update-user-list", (users) => updateUserList(users));

    socket.on("room-killed", () => {
        // If already left or on landing page, do nothing
        if (chatScreen.style.display === "none") return;

        // Show the in-UI modal card to the member
        if (roomEndedNoticeModal) {
            roomEndedNoticeModal.classList.remove("hidden");
        } else {
            performLeaveRoom(false);
        }
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
        clearMessages();
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

    // ============================================================
    // ANIMATED LIVE CHAT IN LANDING SAMPLE PREVIEW
    // ============================================================
    function initLandingChatAnimation() {
        const demoList = document.getElementById("demoBubblesList");
        if (!demoList) return;

        // Rich pool of realistic, anonymous chat messages
        const conversationPool = [
            { sender: "cosmic_owl", text: "Joined! Loving this secret room.", isSelf: false },
            { sender: "quiet_otter", text: "Ready to share the file? 📂", isSelf: false },
            { sender: "you as nightjar", text: "Uploading the zip archive now.", isSelf: true },
            { sender: "paper_fox", text: "Download finished. Zero server logs?", isSelf: false },
            { sender: "quiet_otter", text: "None. End-to-end and ephemeral ✨", isSelf: false },
            { sender: "neon_ghost", text: "Hey folks, just dropped in.", isSelf: false },
            { sender: "you as nightjar", text: "Welcome neon_ghost!", isSelf: true },
            { sender: "neon_ghost", text: "Room self-destructs after we leave, right?", isSelf: false },
            { sender: "paper_fox", text: "Yep, wiped completely in 30 mins.", isSelf: false },
            { sender: "cosmic_owl", text: "Clean and private. Just how it should be 🔒", isSelf: false },
            { sender: "you as nightjar", text: "No accounts, no email, just pure chat.", isSelf: true },
            { sender: "quiet_otter", text: "Anyone tested the voice notes yet? 🎙️", isSelf: false },
            { sender: "paper_fox", text: "Working crisp on mobile and desktop.", isSelf: false },
            { sender: "silver_badger", text: "Got the key from team. All clear here?", isSelf: false },
            { sender: "you as nightjar", text: "All clear! Everything deletes on close.", isSelf: true },
            { sender: "quiet_otter", text: "Got the key. Is everyone in?", isSelf: false },
            { sender: "paper_fox", text: "Two more coming. Give it a minute.", isSelf: false },
            { sender: "you as nightjar", text: "Fine by me. I'll wait.", isSelf: true }
        ];

        let currentIndex = 3;
        const MAX_ITEMS = 3;

        function addNextDemoMessage() {
            // Only animate if user is on the landing page and window tab is visible
            if (chatScreen && chatScreen.style.display !== "none") return;
            if (document.hidden) return;

            const msgData = conversationPool[currentIndex % conversationPool.length];
            currentIndex++;

            const item = document.createElement("div");
            item.className = `demo-bubble-item animate-enter ${msgData.isSelf ? "text-right" : ""}`;

            const sender = document.createElement("div");
            sender.className = "demo-sender-label";
            sender.textContent = msgData.sender;

            const bubble = document.createElement("div");
            bubble.className = msgData.isSelf ? "demo-bubble-orange" : "demo-bubble-dark";
            bubble.textContent = msgData.text;

            item.appendChild(sender);
            item.appendChild(bubble);

            // Smoothly collapse and slide out oldest item if max items reached
            const activeItems = demoList.querySelectorAll(".demo-bubble-item:not(.demo-exiting)");
            if (activeItems.length >= MAX_ITEMS) {
                const oldest = activeItems[0];
                oldest.classList.add("demo-exiting");

                // Get exact computed height before initiating smooth collapse
                const currentHeight = oldest.offsetHeight;
                oldest.style.maxHeight = currentHeight + "px";
                oldest.style.overflow = "hidden";
                oldest.style.transition = "max-height 0.58s cubic-bezier(0.16, 1, 0.3, 1), margin-bottom 0.58s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.42s ease, transform 0.58s cubic-bezier(0.16, 1, 0.3, 1)";

                // Force reflow so transition begins from current rendered height
                oldest.offsetHeight;

                // Seamlessly collapse height and margins to 0 with deceleration curve
                oldest.style.opacity = "0";
                oldest.style.transform = "translateY(-14px) scale(0.93)";
                oldest.style.maxHeight = "0px";
                oldest.style.marginBottom = "0px";
                oldest.style.paddingTop = "0px";
                oldest.style.paddingBottom = "0px";

                setTimeout(() => {
                    if (oldest.parentNode) {
                        oldest.parentNode.removeChild(oldest);
                    }
                }, 600);
            }

            demoList.appendChild(item);
        }

        // Random pacing between 2.6s and 4.2s for authentic conversation feel
        function scheduleNextMessage() {
            const delay = Math.floor(Math.random() * 1600) + 2600;
            setTimeout(() => {
                addNextDemoMessage();
                scheduleNextMessage();
            }, delay);
        }

        scheduleNextMessage();
    }

    initLandingChatAnimation();

    // ============================================================
    // ANONYMOUS FILE SHARING ROOMS & DUAL TILE CAROUSEL CONTROLLER
    // ============================================================
    (function initAnonymousFileSharing() {
        const MAX_BYTES = 500 * 1024 * 1024; // 500 MB total limit

        // Toast notification helper
        function showToast(message, duration = 3000) {
            const toast = document.getElementById("toastNotification");
            if (!toast) return;
            toast.textContent = message;
            toast.classList.add("show");
            if (toast._timeout) clearTimeout(toast._timeout);
            toast._timeout = setTimeout(() => {
                toast.classList.remove("show");
            }, duration);
        }

        // Copy text helper
        function copyText(text, successMsg = "Copied to clipboard!") {
            if (!text) return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    showToast(successMsg);
                }).catch(() => {
                    fallbackCopy(text, successMsg);
                });
            } else {
                fallbackCopy(text, successMsg);
            }
        }

        function fallbackCopy(text, successMsg) {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand("copy");
                showToast(successMsg);
            } catch (err) {
                showToast("Failed to copy");
            }
            document.body.removeChild(ta);
        }

        // Format bytes helper
        function formatBytes(bytes, decimals = 1) {
            if (!bytes || bytes === 0) return '0 B';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        }

        // File icon helper
        function getFileIconClass(name = "", mime = "") {
            const ext = name.split('.').pop().toLowerCase();
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext) || mime.startsWith('image/')) {
                return 'fas fa-file-image';
            }
            if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext) || mime.startsWith('video/')) {
                return 'fas fa-file-video';
            }
            if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext) || mime.startsWith('audio/')) {
                return 'fas fa-file-audio';
            }
            if (ext === 'pdf' || mime === 'application/pdf') {
                return 'fas fa-file-pdf';
            }
            if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
                return 'fas fa-file-zipper';
            }
            if (['js', 'ts', 'html', 'css', 'json', 'py', 'java', 'cpp', 'c', 'php'].includes(ext)) {
                return 'fas fa-file-code';
            }
            if (['doc', 'docx'].includes(ext)) {
                return 'fas fa-file-word';
            }
            if (['xls', 'xlsx', 'csv'].includes(ext)) {
                return 'fas fa-file-excel';
            }
            return 'fas fa-file-lines';
        }

        // ------------------------------------------------------------
        // 1. DUAL TILE CAROUSEL CONTROLLER (Switches every 30 seconds)
        // ------------------------------------------------------------
        const pillFileSharing = document.getElementById("pillFileSharing");
        const pillSampleChat = document.getElementById("pillSampleChat");
        const carouselTrack = document.getElementById("carouselTrack");
        const carouselTimerProgress = document.getElementById("carouselTimerProgress");
        const carouselViewport = document.getElementById("carouselViewport");

        let activeSlide = 0; // 0 = Sample Chat (First), 1 = File Sharing (Second)
        const CYCLE_TIME_MS = 30 * 1000; // 30 seconds
        let cycleStartTime = Date.now();
        let carouselInterval = null;
        let isCarouselPaused = false;

        function goToSlide(index, resetTimer = true) {
            activeSlide = index === 0 ? 0 : 1;
            if (carouselTrack) {
                carouselTrack.style.transform = activeSlide === 0 ? "translateX(0%)" : "translateX(-50%)";
            }
            if (pillSampleChat) {
                pillSampleChat.classList.toggle("active", activeSlide === 0);
                pillSampleChat.setAttribute("aria-selected", activeSlide === 0);
            }
            if (pillFileSharing) {
                pillFileSharing.classList.toggle("active", activeSlide === 1);
                pillFileSharing.setAttribute("aria-selected", activeSlide === 1);
            }

            if (resetTimer) {
                cycleStartTime = Date.now();
                if (carouselTimerProgress) carouselTimerProgress.style.width = "0%";
            }
        }

        if (pillSampleChat) {
            pillSampleChat.addEventListener("click", () => goToSlide(0, true));
        }
        if (pillFileSharing) {
            pillFileSharing.addEventListener("click", () => goToSlide(1, true));
        }

        // Auto-switch carousel every 30 seconds with continuous progress bar
        function startCarouselAutoTimer() {
            cycleStartTime = Date.now();
            if (carouselInterval) clearInterval(carouselInterval);

            carouselInterval = setInterval(() => {
                // Do not auto-cycle if user is inside a room, if tab is hidden, or if interacting with inputs
                if (document.hidden) return;
                if (chatScreen && chatScreen.style.display !== "none") return;
                if (fileRoomScreen && fileRoomScreen.style.display !== "none") return;
                if (isCarouselPaused) return;

                const elapsed = Date.now() - cycleStartTime;
                const percent = Math.min(100, (elapsed / CYCLE_TIME_MS) * 100);

                if (carouselTimerProgress) {
                    carouselTimerProgress.style.width = `${percent}%`;
                }

                if (elapsed >= CYCLE_TIME_MS) {
                    // Switch to other slide smoothly
                    const nextSlide = activeSlide === 0 ? 1 : 0;
                    goToSlide(nextSlide, true);
                }
            }, 250);
        }

        startCarouselAutoTimer();

        // Pause auto-cycle when hovering over carousel or typing in inputs
        if (carouselViewport) {
            carouselViewport.addEventListener("mouseenter", () => { isCarouselPaused = true; });
            carouselViewport.addEventListener("mouseleave", () => { isCarouselPaused = false; });
        }

        const landingTileKeyInput = document.getElementById("landingTileKeyInput");
        if (landingTileKeyInput) {
            landingTileKeyInput.addEventListener("focus", () => { isCarouselPaused = true; });
            landingTileKeyInput.addEventListener("blur", () => { isCarouselPaused = false; });
        }

        // Mobile touch swipe support for the carousel
        if (carouselViewport) {
            let touchStartX = 0;
            let touchEndX = 0;
            carouselViewport.addEventListener("touchstart", (e) => {
                touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });

            carouselViewport.addEventListener("touchend", (e) => {
                touchEndX = e.changedTouches[0].screenX;
                const diff = touchEndX - touchStartX;
                if (diff < -50) {
                    // Swipe left -> go to slide 1 (Chat)
                    goToSlide(1, true);
                } else if (diff > 50) {
                    // Swipe right -> go to slide 0 (Files)
                    goToSlide(0, true);
                }
            }, { passive: true });
        }

        // ------------------------------------------------------------
        // 2. LANDING RIGHT PANEL MODE SELECTOR (Chat vs File Room)
        // ------------------------------------------------------------
        const tabChatRoomMode = document.getElementById("tabChatRoomMode");
        const tabFileRoomMode = document.getElementById("tabFileRoomMode");
        const panelChatRoom = document.getElementById("panelChatRoom");
        const panelFileRoom = document.getElementById("panelFileRoom");

        if (tabChatRoomMode && tabFileRoomMode) {
            tabChatRoomMode.addEventListener("click", () => {
                tabChatRoomMode.classList.add("active");
                tabFileRoomMode.classList.remove("active");
                if (panelChatRoom) panelChatRoom.classList.remove("hidden");
                if (panelFileRoom) panelFileRoom.classList.add("hidden");
            });

            tabFileRoomMode.addEventListener("click", () => {
                tabFileRoomMode.classList.add("active");
                tabChatRoomMode.classList.remove("active");
                if (panelFileRoom) panelFileRoom.classList.remove("hidden");
                if (panelChatRoom) panelChatRoom.classList.add("hidden");
            });
        }

        // ------------------------------------------------------------
        // 3. FILE UPLOADS: CREATE ROOM & ADD TO EXISTING ROOM
        // ------------------------------------------------------------
        let activeFileRoom = null;
        let inactivityInterval = null;
        let inactivitySecondsRemaining = 30 * 60; // 30 minutes in seconds

        function touchInactivity() {
            inactivitySecondsRemaining = 30 * 60;
            updateInactivityDisplay();
            if (activeFileRoom) {
                socket.emit("touch-file-room", { roomId: activeFileRoom.roomId });
            }
        }

        function updateInactivityDisplay() {
            const el = document.getElementById("fileRoomCountdown");
            if (!el) return;
            const mins = Math.floor(inactivitySecondsRemaining / 60);
            const secs = inactivitySecondsRemaining % 60;
            el.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        function startInactivityCountdown() {
            if (inactivityInterval) clearInterval(inactivityInterval);
            inactivitySecondsRemaining = 30 * 60;
            updateInactivityDisplay();

            inactivityInterval = setInterval(() => {
                inactivitySecondsRemaining--;
                updateInactivityDisplay();

                if (inactivitySecondsRemaining <= 0) {
                    clearInterval(inactivityInterval);
                    handleFileRoomExpired();
                }
            }, 1000);
        }

        function handleFileRoomExpired() {
            const roomInactiveModal = document.getElementById("roomInactiveModal");
            const roomInactiveText = document.getElementById("roomInactiveText");
            if (roomInactiveText) {
                roomInactiveText.textContent = "This file sharing room has expired and been deleted after 30 minutes of inactivity.";
            }
            if (roomInactiveModal) {
                roomInactiveModal.classList.remove("hidden");
            }
            leaveFileRoom(false);
        }

        // Upload files to create a brand new room
        function uploadFilesToCreateRoom(files) {
            if (!files || files.length === 0) return;

            let totalBytes = 0;
            for (let i = 0; i < files.length; i++) {
                totalBytes += files[i].size;
            }

            if (totalBytes > MAX_BYTES) {
                showToast("Total files size exceeds 500 MB limit.");
                return;
            }

            const formData = new FormData();
            for (let i = 0; i < files.length; i++) {
                formData.append("files", files[i]);
            }

            // Progress indicators
            const landingProgress = document.getElementById("landingTileUploadProgress");
            const landingProgressBar = document.getElementById("landingTileProgressBar");
            const landingProgressPercent = document.getElementById("landingTileProgressPercent");
            const landingProgressText = document.getElementById("landingTileProgressText");

            if (landingProgress) landingProgress.classList.remove("hidden");
            if (landingProgressBar) landingProgressBar.style.width = "0%";
            if (landingProgressPercent) landingProgressPercent.textContent = "0%";
            if (landingProgressText) landingProgressText.textContent = `Uploading ${files.length} file(s)...`;

            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/file-rooms/create-and-upload", true);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    if (landingProgressBar) landingProgressBar.style.width = `${pct}%`;
                    if (landingProgressPercent) landingProgressPercent.textContent = `${pct}%`;
                }
            };

            xhr.onload = () => {
                if (landingProgress) landingProgress.classList.add("hidden");

                if (xhr.status === 200) {
                    try {
                        const res = JSON.parse(xhr.responseText);
                        if (res.success && res.room) {
                            try {
                                localStorage.setItem("anon_file_room_creator_" + res.room.roomId, "true");
                            } catch (e) {}
                            res.room.isCreator = true;
                            openFileRoom(res.room);
                            showToast(`Room created! Key: ${res.room.roomKey}`);
                        }
                    } catch (e) {
                        showToast("Failed to process room creation.");
                    }
                } else {
                    try {
                        const err = JSON.parse(xhr.responseText);
                        showToast(err.error || `Upload failed (Status ${xhr.status})`);
                    } catch (e) {
                        showToast(`Upload failed with status ${xhr.status}`);
                    }
                }
            };

            xhr.onerror = () => {
                if (landingProgress) landingProgress.classList.add("hidden");
                showToast("Network error during file upload.");
            };

            xhr.send(formData);
        }

        // Upload additional files to an existing active room
        function uploadFilesToExistingRoom(files) {
            if (!activeFileRoom || !files || files.length === 0) return;

            let addedBytes = 0;
            for (let i = 0; i < files.length; i++) {
                addedBytes += files[i].size;
            }

            if (activeFileRoom.totalSizeBytes + addedBytes > MAX_BYTES) {
                const remaining = Math.max(0, MAX_BYTES - activeFileRoom.totalSizeBytes);
                showToast(`Storage limit exceeded. Only ${formatBytes(remaining)} remaining of 500 MB.`);
                return;
            }

            const formData = new FormData();
            for (let i = 0; i < files.length; i++) {
                formData.append("files", files[i]);
            }

            const progressBox = document.getElementById("roomUploadProgressBox");
            const progressBar = document.getElementById("roomUploadProgressBar");
            const progressPercent = document.getElementById("roomUploadPercent");
            const progressFileName = document.getElementById("roomUploadFileName");

            if (progressBox) progressBox.classList.remove("hidden");
            if (progressBar) progressBar.style.width = "0%";
            if (progressPercent) progressPercent.textContent = "0%";
            if (progressFileName) progressFileName.textContent = `Uploading ${files.length} file(s)...`;

            const xhr = new XMLHttpRequest();
            xhr.open("POST", `/api/file-rooms/${activeFileRoom.roomId}/upload`, true);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    if (progressBar) progressBar.style.width = `${pct}%`;
                    if (progressPercent) progressPercent.textContent = `${pct}%`;
                }
            };

            xhr.onload = () => {
                if (progressBox) progressBox.classList.add("hidden");

                if (xhr.status === 200) {
                    try {
                        const res = JSON.parse(xhr.responseText);
                        if (res.success && res.room) {
                            updateFileRoomUI(res.room);
                            touchInactivity();
                            showToast("Files added successfully!");
                        }
                    } catch (e) {
                        showToast("Error processing upload response.");
                    }
                } else {
                    try {
                        const err = JSON.parse(xhr.responseText);
                        showToast(err.error || `Upload failed with status ${xhr.status}`);
                    } catch (e) {
                        showToast(`Upload failed with status ${xhr.status}`);
                    }
                }
            };

            xhr.onerror = () => {
                if (progressBox) progressBox.classList.add("hidden");
                showToast("Network error uploading files.");
            };

            xhr.send(formData);
        }

        // ------------------------------------------------------------
        // 4. OPEN & MANAGE FILE SHARING ROOM
        // ------------------------------------------------------------
        function openFileRoom(roomData) {
            document.documentElement.classList.remove("loading-file-room");
            let isCreator = false;
            try {
                isCreator = localStorage.getItem("anon_file_room_creator_" + roomData.roomId) === "true";
            } catch (e) {}
            roomData.isCreator = isCreator;
            activeFileRoom = roomData;
            try {
                localStorage.setItem("anon_file_room_id", roomData.roomId);
            } catch (e) {}
            showFileRoomScreen();
            updateFileRoomUI(roomData);
            startInactivityCountdown();

            // Connect socket room for live sync
            socket.emit("join-file-room", { roomId: roomData.roomId });

            // Update URL without reloading page if not already matching
            const targetPath = `/share/${roomData.roomId}`;
            if (window.location.pathname !== targetPath) {
                window.history.pushState({ type: "file-room", roomId: roomData.roomId }, "", targetPath);
            }
        }

        function updateFileRoomUI(roomData) {
            activeFileRoom = roomData;

            // Room Key
            const keyEl = document.getElementById("fileRoomKeyDisplay");
            if (keyEl) keyEl.textContent = roomData.roomKey || roomData.roomId;

            // Storage Meter (Up to 500 MB)
            const storageText = document.getElementById("fileRoomStorageText");
            const storageBar = document.getElementById("fileRoomStorageBar");
            const usedBytes = roomData.totalSizeBytes || 0;
            const pct = Math.min(100, Math.round((usedBytes / MAX_BYTES) * 100));

            if (storageText) {
                storageText.textContent = `${formatBytes(usedBytes)} / 500 MB`;
            }
            if (storageBar) {
                storageBar.style.width = `${pct}%`;
                if (pct > 90) {
                    storageBar.style.background = "#ef4444";
                } else {
                    storageBar.style.background = "linear-gradient(to right, #ff7320, #ffb682)";
                }
            }

            // QR Code
            const qrImg = document.getElementById("fileRoomQrImg");
            if (qrImg && roomData.qrCodeDataUrl) {
                qrImg.src = roomData.qrCodeDataUrl;
            }

            // Badge
            const badge = document.getElementById("fileRoomCountBadge");
            const files = roomData.files || [];
            if (badge) badge.textContent = files.length;

            // Render items
            renderFileItems(files);
        }

        function renderFileItems(files) {
            const listEl = document.getElementById("fileRoomItemsList");
            const emptyState = document.getElementById("fileRoomEmptyState");
            if (!listEl) return;

            listEl.innerHTML = "";

            if (!files || files.length === 0) {
                if (emptyState) {
                    listEl.appendChild(emptyState);
                    emptyState.classList.remove("hidden");
                }
                return;
            }

            files.forEach(file => {
                const item = document.createElement("div");
                item.className = "file-item-card";

                const iconBox = document.createElement("div");
                iconBox.className = "file-item-icon";
                iconBox.innerHTML = `<i class="${getFileIconClass(file.name, file.mimeType)}"></i>`;

                const infoBox = document.createElement("div");
                infoBox.className = "file-item-info";

                const titleEl = document.createElement("div");
                titleEl.className = "file-item-name";
                titleEl.textContent = file.name;
                titleEl.title = file.name;

                const metaEl = document.createElement("div");
                metaEl.className = "file-item-meta";
                const dateStr = file.uploadedAt ? new Date(file.uploadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                metaEl.textContent = `${formatBytes(file.size)} · ${dateStr}`;

                infoBox.appendChild(titleEl);
                infoBox.appendChild(metaEl);

                // Actions
                const actionsBox = document.createElement("div");
                actionsBox.className = "file-item-actions";

                const dlBtn = document.createElement("a");
                dlBtn.className = "btn-file-dl";
                dlBtn.href = `/api/file-rooms/${activeFileRoom.roomId}/files/${file.id}/download`;
                dlBtn.setAttribute("download", file.name);
                dlBtn.innerHTML = '<i class="fas fa-download text-xs"></i><span>Download</span>';
                dlBtn.onclick = () => {
                    touchInactivity();
                    activeDownloadsCount++;
                    setTimeout(() => {
                        activeDownloadsCount = Math.max(0, activeDownloadsCount - 1);
                    }, 25000);
                };

                const delBtn = document.createElement("button");
                delBtn.type = "button";
                delBtn.className = "btn-file-del";
                delBtn.title = "Delete file";
                delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                delBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    confirmDeleteFile(file.id, file.name);
                };

                actionsBox.appendChild(dlBtn);
                actionsBox.appendChild(delBtn);

                item.appendChild(iconBox);
                item.appendChild(infoBox);
                item.appendChild(actionsBox);

                listEl.appendChild(item);
            });
        }

        // Delete File Modal & Handler
        let fileIdToDelete = null;
        const deleteFileModal = document.getElementById("deleteFileModal");
        const deleteFileModalText = document.getElementById("deleteFileModalText");
        const cancelDeleteFileBtn = document.getElementById("cancelDeleteFileBtn");
        const confirmDeleteFileBtn = document.getElementById("confirmDeleteFileBtn");

        function confirmDeleteFile(fileId, fileName) {
            fileIdToDelete = fileId;
            if (deleteFileModalText) {
                deleteFileModalText.textContent = `Are you sure you want to delete "${fileName}"? This cannot be undone.`;
            }
            if (deleteFileModal) {
                deleteFileModal.classList.remove("hidden");
            }
        }

        if (deleteFileModal) {
            deleteFileModal.addEventListener("click", (e) => {
                if (e.target === deleteFileModal) {
                    deleteFileModal.classList.add("hidden");
                    fileIdToDelete = null;
                }
            });
        }

        if (cancelDeleteFileBtn) {
            cancelDeleteFileBtn.onclick = (e) => {
                if (e) e.stopPropagation();
                if (deleteFileModal) deleteFileModal.classList.add("hidden");
                fileIdToDelete = null;
            };
        }

        if (confirmDeleteFileBtn) {
            confirmDeleteFileBtn.onclick = (e) => {
                if (e) e.stopPropagation();
                if (!activeFileRoom || !fileIdToDelete) return;
                const fileId = fileIdToDelete;
                if (deleteFileModal) deleteFileModal.classList.add("hidden");

                fetch(`/api/file-rooms/${activeFileRoom.roomId}/files/${fileId}`, {
                    method: "DELETE"
                })
                .then(r => r.json())
                .then(data => {
                    fileIdToDelete = null;
                    if (data.success && data.room) {
                        updateFileRoomUI(data.room);
                        touchInactivity();
                        showToast("File deleted from room.");
                    } else {
                        showToast(data.error || "Failed to delete file.");
                    }
                })
                .catch(() => {
                    fileIdToDelete = null;
                    showToast("Error deleting file.");
                });
            };
        }

        // Open Room by Identifier (Room ID or Room Key)
        function openFileRoomByIdentifier(identifier, isDirectOrSaved = false) {
            if (!identifier) {
                if (isDirectOrSaved) {
                    document.documentElement.classList.remove("loading-file-room");
                    try { localStorage.removeItem("anon_file_room_id"); } catch (e) {}
                } else {
                    showToast("Please enter a room key or ID.");
                }
                return;
            }

            fetch(`/api/file-rooms/${encodeURIComponent(identifier.trim())}`)
                .then(r => r.json())
                .then(data => {
                    document.documentElement.classList.remove("loading-file-room");
                    if (data.success && data.room) {
                        openFileRoom(data.room);
                    } else {
                        if (isDirectOrSaved) {
                            try { localStorage.removeItem("anon_file_room_id"); } catch (e) {}
                            if (window.location.pathname.startsWith("/share/")) {
                                window.history.replaceState({}, "", "/");
                            }
                            showLandingScreen();
                        }
                        showToast(data.error || "File sharing room not found or expired.");
                    }
                })
                .catch(() => {
                    document.documentElement.classList.remove("loading-file-room");
                    if (isDirectOrSaved) {
                        try { localStorage.removeItem("anon_file_room_id"); } catch (e) {}
                        if (window.location.pathname.startsWith("/share/")) {
                            window.history.replaceState({}, "", "/");
                        }
                        showLandingScreen();
                    }
                    showToast("Error connecting to file room.");
                });
        }

        function leaveFileRoom(updateUrl = true) {
            document.documentElement.classList.remove("loading-file-room");
            if (exitVaultModal) exitVaultModal.classList.add("hidden");
            if (vaultEndedNoticeModal) vaultEndedNoticeModal.classList.add("hidden");
            try {
                localStorage.removeItem("anon_file_room_id");
            } catch (e) {}
            if (activeFileRoom) {
                socket.emit("leave-file-room", { roomId: activeFileRoom.roomId });
            }
            if (inactivityInterval) clearInterval(inactivityInterval);
            activeFileRoom = null;
            activeDownloadsCount = 0;
            if (updateUrl) {
                window.history.pushState({}, "", "/");
            }
            showLandingScreen();
        }

        // ------------------------------------------------------------
        // 5. EVENT LISTENERS ON LANDING PAGE & ROOM PAGE
        // ------------------------------------------------------------
        // Landing Tile File Dropzone & Browse
        const landingTileDropzone = document.getElementById("landingTileDropzone");
        const landingTileFileInput = document.getElementById("landingTileFileInput");
        const landingTileBrowseBtn = document.getElementById("landingTileBrowseBtn");

        if (landingTileBrowseBtn && landingTileFileInput) {
            landingTileBrowseBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                landingTileFileInput.click();
            });
        }

        if (landingTileDropzone && landingTileFileInput) {
            landingTileDropzone.addEventListener("click", () => {
                landingTileFileInput.click();
            });

            landingTileDropzone.addEventListener("dragover", (e) => {
                e.preventDefault();
                landingTileDropzone.classList.add("dragover");
            });

            landingTileDropzone.addEventListener("dragleave", () => {
                landingTileDropzone.classList.remove("dragover");
            });

            landingTileDropzone.addEventListener("drop", (e) => {
                e.preventDefault();
                landingTileDropzone.classList.remove("dragover");
                if (e.dataTransfer && e.dataTransfer.files) {
                    uploadFilesToCreateRoom(e.dataTransfer.files);
                }
            });

            landingTileFileInput.addEventListener("change", (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    uploadFilesToCreateRoom(e.target.files);
                    e.target.value = "";
                }
            });
        }

        // Landing Tile "Open Key"
        const landingTileOpenKeyBtn = document.getElementById("landingTileOpenKeyBtn");
        if (landingTileOpenKeyBtn && landingTileKeyInput) {
            landingTileOpenKeyBtn.addEventListener("click", () => {
                openFileRoomByIdentifier(landingTileKeyInput.value);
            });
            landingTileKeyInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    openFileRoomByIdentifier(landingTileKeyInput.value);
                }
            });
        }

        // Right Panel Upload Button & File Input
        const rightPanelUploadBtn = document.getElementById("rightPanelUploadBtn");
        const rightPanelFileInput = document.getElementById("rightPanelFileInput");
        if (rightPanelUploadBtn && rightPanelFileInput) {
            rightPanelUploadBtn.addEventListener("click", () => {
                rightPanelFileInput.click();
            });
            rightPanelFileInput.addEventListener("change", (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    uploadFilesToCreateRoom(e.target.files);
                    e.target.value = "";
                }
            });
        }

        // Right Panel "Open File Room" button
        const rightPanelJoinFileRoomBtn = document.getElementById("rightPanelJoinFileRoomBtn");
        const rightPanelRoomKey = document.getElementById("rightPanelRoomKey");
        if (rightPanelJoinFileRoomBtn && rightPanelRoomKey) {
            rightPanelJoinFileRoomBtn.addEventListener("click", () => {
                openFileRoomByIdentifier(rightPanelRoomKey.value);
            });
            rightPanelRoomKey.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    openFileRoomByIdentifier(rightPanelRoomKey.value);
                }
            });
        }

        // Room Page: Add more files dropzone
        const roomAddDropArea = document.getElementById("roomAddDropArea");
        const roomAddFileInput = document.getElementById("roomAddFileInput");
        if (roomAddDropArea && roomAddFileInput) {
            roomAddDropArea.addEventListener("click", () => {
                roomAddFileInput.click();
            });

            roomAddDropArea.addEventListener("dragover", (e) => {
                e.preventDefault();
                roomAddDropArea.classList.add("border-[#ffb682]");
            });

            roomAddDropArea.addEventListener("dragleave", () => {
                roomAddDropArea.classList.remove("border-[#ffb682]");
            });

            roomAddDropArea.addEventListener("drop", (e) => {
                e.preventDefault();
                roomAddDropArea.classList.remove("border-[#ffb682]");
                if (e.dataTransfer && e.dataTransfer.files) {
                    uploadFilesToExistingRoom(e.dataTransfer.files);
                }
            });

            roomAddFileInput.addEventListener("change", (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    uploadFilesToExistingRoom(e.target.files);
                    e.target.value = "";
                }
            });
        }

        // Room Page: "Share" Button (strictly labelled "Share")
        const btnShareFileRoom = document.getElementById("btnShareFileRoom");
        if (btnShareFileRoom) {
            btnShareFileRoom.addEventListener("click", async () => {
                if (!activeFileRoom) return;
                touchInactivity();

                const roomUrl = `${window.location.origin}/share/${activeFileRoom.roomId}`;
                const sharePayload = {
                    title: "Anon File Vault",
                    text: `Access files in room: ${activeFileRoom.roomKey}`,
                    url: roomUrl
                };

                if (navigator.share) {
                    try {
                        await navigator.share(sharePayload);
                    } catch (err) {
                        if (err.name !== "AbortError") {
                            copyText(roomUrl, "Room link copied to clipboard!");
                        }
                    }
                } else {
                    copyText(roomUrl, "Room link copied to clipboard!");
                }
            });
        }

        // Room Page: "Copy Link" direct button
        const btnCopyFileRoomLink = document.getElementById("btnCopyFileRoomLink");
        if (btnCopyFileRoomLink) {
            btnCopyFileRoomLink.addEventListener("click", () => {
                if (!activeFileRoom) return;
                touchInactivity();
                const roomUrl = `${window.location.origin}/share/${activeFileRoom.roomId}`;
                copyText(roomUrl, "Room link copied to clipboard!");
            });
        }

        // Room Page: "Copy Key" button
        const copyFileRoomKeyBtn = document.getElementById("copyFileRoomKeyBtn");
        if (copyFileRoomKeyBtn) {
            copyFileRoomKeyBtn.addEventListener("click", () => {
                if (!activeFileRoom) return;
                touchInactivity();
                copyText(activeFileRoom.roomKey, "Room key copied to clipboard!");
            });
        }

        // Room Page: Download QR Code
        const btnDownloadQr = document.getElementById("btnDownloadQr");
        const fileRoomQrImg = document.getElementById("fileRoomQrImg");
        if (btnDownloadQr && fileRoomQrImg) {
            btnDownloadQr.addEventListener("click", () => {
                if (!fileRoomQrImg.src) return;
                touchInactivity();
                const a = document.createElement("a");
                a.href = fileRoomQrImg.src;
                a.download = `qr-${activeFileRoom ? activeFileRoom.roomKey : 'room'}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
        }

        // Room Page: Refresh files list button
        const btnRefreshFiles = document.getElementById("btnRefreshFiles");
        if (btnRefreshFiles) {
            btnRefreshFiles.addEventListener("click", () => {
                if (!activeFileRoom) return;
                touchInactivity();
                fetch(`/api/file-rooms/${activeFileRoom.roomId}`)
                    .then(r => r.json())
                    .then(data => {
                        if (data.success && data.room) {
                            updateFileRoomUI(data.room);
                            showToast("Files refreshed.");
                        }
                    });
            });
        }

        // Room Page: Theme toggle button
        const fileRoomThemeToggleBtn = document.getElementById("fileRoomThemeToggleBtn");
        const fileRoomThemeToggleIcon = document.getElementById("fileRoomThemeToggleIcon");
        const fileRoomThemeToggleText = document.getElementById("fileRoomThemeToggleText");

        if (fileRoomThemeToggleBtn) {
            fileRoomThemeToggleBtn.addEventListener("click", () => {
                const isLight = document.body.classList.contains('light-mode');
                const newTheme = isLight ? 'dark' : 'light';
                localStorage.setItem('anon_chat_theme', newTheme);
                applyTheme(newTheme);
                if (fileRoomThemeToggleIcon) fileRoomThemeToggleIcon.className = newTheme === 'light' ? "fas fa-moon text-xs" : "fas fa-sun text-xs";
                if (fileRoomThemeToggleText) fileRoomThemeToggleText.textContent = newTheme === 'light' ? "Dark" : "Light";
            });
        }

        // Exit / End Vault Warning Logic
        let activeDownloadsCount = 0;
        const exitVaultModal = document.getElementById("exitVaultModal");
        const exitVaultModalTitle = document.getElementById("exitVaultModalTitle");
        const exitVaultModalText = document.getElementById("exitVaultModalText");
        const cancelExitVaultBtn = document.getElementById("cancelExitVaultBtn");
        const confirmExitVaultBtn = document.getElementById("confirmExitVaultBtn");

        const vaultEndedNoticeModal = document.getElementById("vaultEndedNoticeModal");
        const vaultEndedNoticeOkBtn = document.getElementById("vaultEndedNoticeOkBtn");

        if (cancelExitVaultBtn) {
            cancelExitVaultBtn.addEventListener("click", () => {
                if (exitVaultModal) exitVaultModal.classList.add("hidden");
            });
        }

        if (exitVaultModal) {
            exitVaultModal.addEventListener("click", (e) => {
                if (e.target === exitVaultModal) {
                    exitVaultModal.classList.add("hidden");
                }
            });
        }

        if (confirmExitVaultBtn) {
            confirmExitVaultBtn.addEventListener("click", () => {
                if (!activeFileRoom) return;
                const roomId = activeFileRoom.roomId;
                const isCreator = activeFileRoom.isCreator;
                if (exitVaultModal) exitVaultModal.classList.add("hidden");

                if (isCreator) {
                    // Creator ends the vault: delete completely and broadcast
                    fetch(`/api/file-rooms/${roomId}`, {
                        method: "DELETE"
                    })
                    .finally(() => {
                        try {
                            localStorage.removeItem("anon_file_room_creator_" + roomId);
                        } catch (e) {}
                        activeDownloadsCount = 0;
                        showToast("Vault ended and closed.");
                        leaveFileRoom(true);
                    });
                } else {
                    // Member leaving while downloading
                    activeDownloadsCount = 0;
                    leaveFileRoom(true);
                }
            });
        }

        // Room Page: Home / Exit button
        const fileRoomHomeBtn = document.getElementById("fileRoomHomeBtn");
        if (fileRoomHomeBtn) {
            fileRoomHomeBtn.addEventListener("click", () => {
                if (!activeFileRoom) {
                    leaveFileRoom(true);
                    return;
                }

                if (activeFileRoom.isCreator) {
                    // Creator exiting: Show "Are you sure to end the vault"
                    if (exitVaultModalTitle) exitVaultModalTitle.textContent = "Are you sure to end the vault?";
                    if (exitVaultModalText) exitVaultModalText.textContent = "Ending this vault will immediately close the room and delete all shared files for everyone.";
                    if (confirmExitVaultBtn) {
                        confirmExitVaultBtn.textContent = "End Vault";
                        confirmExitVaultBtn.className = "modal-btn-danger";
                    }
                    if (exitVaultModal) exitVaultModal.classList.remove("hidden");
                } else {
                    // Other members in the room: only show warning if currently downloading any file
                    if (activeDownloadsCount > 0) {
                        if (exitVaultModalTitle) exitVaultModalTitle.textContent = "Are you sure to leave the vault?";
                        if (exitVaultModalText) exitVaultModalText.textContent = "You are currently downloading a file. Leaving now may interrupt your download.";
                        if (confirmExitVaultBtn) {
                            confirmExitVaultBtn.textContent = "Leave Vault";
                            confirmExitVaultBtn.className = "modal-btn-danger";
                        }
                        if (exitVaultModal) exitVaultModal.classList.remove("hidden");
                    } else {
                        // Not downloading: exit directly without popup
                        leaveFileRoom(true);
                    }
                }
            });
        }

        // Socket events for real-time live sync of file rooms
        socket.on("file-room-updated", (updatedRoom) => {
            if (activeFileRoom && activeFileRoom.roomId === updatedRoom.roomId) {
                const wasCreator = activeFileRoom.isCreator;
                updateFileRoomUI(updatedRoom);
                activeFileRoom.isCreator = wasCreator;
            }
        });

        socket.on("file-room-expired", (message) => {
            if (activeFileRoom) {
                handleFileRoomExpired();
            }
        });

        socket.on("file-vault-ended", (message) => {
            if (activeFileRoom) {
                if (exitVaultModal) exitVaultModal.classList.add("hidden");
                if (vaultEndedNoticeModal) {
                    vaultEndedNoticeModal.classList.remove("hidden");
                } else {
                    showToast(message || "The creator has ended this vault.");
                    leaveFileRoom(false);
                }
            }
        });

        if (vaultEndedNoticeOkBtn) {
            vaultEndedNoticeOkBtn.addEventListener("click", () => {
                if (vaultEndedNoticeModal) vaultEndedNoticeModal.classList.add("hidden");
                leaveFileRoom(false);
            });
        }

        // ------------------------------------------------------------
        // 6. DIRECT URL CHECK ON LOAD (/share/:identifier or ?share=...)
        // ------------------------------------------------------------
        function checkDirectShareUrl() {
            const pathname = window.location.pathname;
            const searchParams = new URLSearchParams(window.location.search);

            if (pathname.startsWith("/share/")) {
                const id = pathname.replace("/share/", "").split("/")[0].trim();
                if (id) {
                    openFileRoomByIdentifier(id, true);
                    return;
                }
            }

            if (searchParams.has("share")) {
                const id = searchParams.get("share").trim();
                if (id) {
                    openFileRoomByIdentifier(id, true);
                    return;
                }
            }

            if (searchParams.has("fileRoom")) {
                const id = searchParams.get("fileRoom").trim();
                if (id) {
                    openFileRoomByIdentifier(id, true);
                    return;
                }
            }

            let savedFileRoom = null;
            try {
                savedFileRoom = localStorage.getItem("anon_file_room_id");
            } catch (e) {}

            if (savedFileRoom && (pathname === "/" || pathname === "")) {
                openFileRoomByIdentifier(savedFileRoom, true);
                return;
            }

            document.documentElement.classList.remove("loading-file-room");
        }

        // Handle popstate for back/forward navigation
        window.addEventListener("popstate", (e) => {
            if (e.state && e.state.type === "file-room" && e.state.roomId) {
                openFileRoomByIdentifier(e.state.roomId, true);
            } else if (window.location.pathname.startsWith("/share/")) {
                const id = window.location.pathname.replace("/share/", "").split("/")[0].trim();
                if (id) {
                    openFileRoomByIdentifier(id, true);
                } else {
                    leaveFileRoom(false);
                }
            } else if (fileRoomScreen && fileRoomScreen.style.display !== "none") {
                leaveFileRoom(false);
            }
        });

        checkDirectShareUrl();
    })();
});