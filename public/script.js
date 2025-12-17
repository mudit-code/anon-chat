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

    function displayMessage(user, message, id, seenBy = []) {
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
        messageRow.className = `flex items-end w-full ${alignmentClass} message-row`;

        const messageBubble = document.createElement("div");

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
            messageBubble.className = `message-bubble-media`;
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
            }
        }
        if (!isConsecutive) {
            if (user === username) {
                // Sender side - No "You" label, just content
                if (message.type === 'text') {
                    messageBubble.innerHTML = `<span class="text-sm leading-relaxed">${contentHtml}</span>`;
                } else {
                    messageBubble.innerHTML = contentHtml;
                }

                messageRow.appendChild(messageBubble);
            } else {
                // Receiver side - Show username only (no icon)
                const displayName = `~${user}`;
                if (message.type === 'text') {
                    messageBubble.innerHTML = `<span class="font-semibold text-xs mb-1 block opacity-90">${displayName}</span><span class="text-sm leading-relaxed">${contentHtml}</span>`;
                } else {
                    messageBubble.innerHTML = contentHtml;
                }

                messageRow.appendChild(messageBubble);
            }
        } else {
            messageBubble.innerHTML = message.type === 'text' ? `<span class="text-sm leading-relaxed">${contentHtml}</span>` : contentHtml;
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
            itemDiv.className = 'media-preview-item';

            // Create thumbnail
            const thumbnail = document.createElement(mediaItem.file.type.startsWith('video') ? 'video' : 'img');
            thumbnail.src = mediaItem.objectUrl;
            thumbnail.className = 'media-preview-thumbnail';
            if (mediaItem.file.type.startsWith('video')) {
                thumbnail.muted = true;
            }

            // Create remove button
            const removeBtn = document.createElement('button');
            removeBtn.className = 'media-remove-btn';
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
            removeBtn.onclick = (e) => {
                e.preventDefault();
                removeMediaPreview(index);
            };

            itemDiv.appendChild(thumbnail);
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
                            // Send as chat message - server will broadcast to all users including sender
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

        // Helper function to upload a single media file
        const uploadMediaFile = async (mediaItem) => {
            const formData = new FormData();
            formData.append('file', mediaItem.file);

            try {
                const response = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`Upload failed with status ${response.status}`);
                }

                const data = await response.json();
                return { success: true, path: data.path, file: mediaItem.file };
            } catch (error) {
                console.error('Media upload failed:', error);
                return { success: false, error: error.message };
            }
        };

        // Upload media with concurrency limit (3 at a time)
        const uploadWithConcurrency = async (items, limit = 3) => {
            const results = [];
            const executing = [];

            for (const item of items) {
                const promise = uploadMediaFile(item).then(result => {
                    executing.splice(executing.indexOf(promise), 1);
                    return result;
                });

                results.push(promise);
                executing.push(promise);

                if (executing.length >= limit) {
                    await Promise.race(executing);
                }
            }

            return Promise.allSettled(results);
        };

        // Upload all media files if any
        let uploadedMedia = [];
        if (hasMedia) {
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
            socket.emit("chat-message", {
                roomKey,
                username,
                id: messageId,
                message: { type: 'text', content: message },
                seenBy: []
            });
        }

        // Send media messages
        for (const media of uploadedMedia) {
            const messageType = media.file.type.startsWith('image') ? 'image' : 'video';
            const messageId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

            socket.emit("chat-message", {
                roomKey,
                username,
                id: messageId,
                message: {
                    type: messageType,
                    content: media.path
                },
                seenBy: []
            });
        }

        // Cleanup: revoke all object URLs
        pastedMedia.forEach(item => {
            URL.revokeObjectURL(item.objectUrl);
        });

        // Clear state
        pastedMedia.length = 0; // Clear array
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

    handleMobileKeyboard();

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
        messages.forEach((msg) => displayMessage(msg.username, msg.message, msg.id || msg.messageId, msg.seenBy || []));
        files.forEach((file) => displayFile(file.username, file.file, file.id || file.messageId, file.seenBy || []));
    });

    socket.on("chat-message", (msg) => displayMessage(msg.username, msg.message, msg.id, msg.seenBy || []));

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