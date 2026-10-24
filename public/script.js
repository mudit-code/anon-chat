// This script handles the real-time chat functionality using Socket.io.
// The message scrolling is handled by the browser's default behavior with the new flexbox layout.

// Backend URL configuration
function getApiBase() {
    if (typeof window !== 'undefined' && typeof window.API_BASE === 'string') {
        return window.API_BASE;
    }
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
        return 'https://anon-chat-jtef.onrender.com';
    }
    return '';
}
window.getApiBase = getApiBase;

const API_BASE = getApiBase();
const PUBLIC_WEB_URL = 'https://anon-chat-jtef.onrender.com';

function absUrl(path) {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
        return path;
    }
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const base = getApiBase();
    return base ? `${base}${cleanPath}` : cleanPath;
}
window.absUrl = absUrl;

const resolveMediaUrl = absUrl;

// ======== REUSABLE APP-STYLED DIALOG SYSTEM (Alert, Confirm, Toast) ========
let activeDialogResolver = null;

function closeAppDialog(result) {
    const modal = document.getElementById("appDialogModal");
    if (modal) modal.classList.add("hidden");
    if (activeDialogResolver) {
        const resolver = activeDialogResolver;
        activeDialogResolver = null;
        resolver(result);
    }
}

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
window.showToast = showToast;

function appAlert(message, title = "Notice") {
    return new Promise((resolve) => {
        if (activeDialogResolver) {
            closeAppDialog(false);
        }
        activeDialogResolver = resolve;

        const modal = document.getElementById("appDialogModal");
        const titleEl = document.getElementById("appDialogTitle");
        const msgEl = document.getElementById("appDialogMessage");
        const okBtn = document.getElementById("appDialogOkBtn");
        const cancelBtn = document.getElementById("appDialogCancelBtn");

        if (!modal) {
            resolve();
            return;
        }

        if (titleEl) titleEl.textContent = title || "Notice";
        if (msgEl) msgEl.textContent = typeof message === "object" ? (message?.message || JSON.stringify(message)) : String(message || "");
        if (cancelBtn) cancelBtn.classList.add("hidden");

        if (okBtn) {
            okBtn.textContent = "OK";
            okBtn.className = "modal-btn-primary";
            okBtn.onpointerdown = (e) => e.preventDefault();
            okBtn.onclick = (e) => {
                e.preventDefault();
                closeAppDialog(true);
            };
        }

        modal.onclick = (e) => {
            if (e.target === modal) {
                closeAppDialog(true);
            }
        };

        modal.classList.remove("hidden");
    });
}
window.appAlert = appAlert;

function appConfirm(message, { title = "Confirm", okText = "Confirm", cancelText = "Cancel", danger = false } = {}) {
    return new Promise((resolve) => {
        if (activeDialogResolver) {
            closeAppDialog(false);
        }
        activeDialogResolver = resolve;

        const modal = document.getElementById("appDialogModal");
        const titleEl = document.getElementById("appDialogTitle");
        const msgEl = document.getElementById("appDialogMessage");
        const okBtn = document.getElementById("appDialogOkBtn");
        const cancelBtn = document.getElementById("appDialogCancelBtn");

        if (!modal) {
            resolve(false);
            return;
        }

        if (titleEl) titleEl.textContent = title || "Confirm";
        if (msgEl) msgEl.textContent = typeof message === "object" ? (message?.message || JSON.stringify(message)) : String(message || "");

        if (cancelBtn) {
            cancelBtn.textContent = cancelText || "Cancel";
            cancelBtn.classList.remove("hidden");
            cancelBtn.onpointerdown = (e) => e.preventDefault();
            cancelBtn.onclick = (e) => {
                e.preventDefault();
                closeAppDialog(false);
            };
        }

        if (okBtn) {
            okBtn.textContent = okText || "Confirm";
            okBtn.className = danger ? "modal-btn-danger" : "modal-btn-primary";
            okBtn.onpointerdown = (e) => e.preventDefault();
            okBtn.onclick = (e) => {
                e.preventDefault();
                closeAppDialog(true);
            };
        }

        modal.onclick = (e) => {
            if (e.target === modal) {
                closeAppDialog(false);
            }
        };

        modal.classList.remove("hidden");
    });
}
window.appConfirm = appConfirm;

// ======== BUTTON BUSY / PROCESSING STATE SYSTEM (Phase 3) ========
function withBusy(button, asyncFn, options = {}) {
    if (!button) return;
    const {
        minMs = 250,
        timeoutMs = 15000,
        connectingText = "Connecting…",
        serverWakeupNotice = false
    } = options;

    if (button.dataset.isBusy === "true" || button.getAttribute("aria-busy") === "true") {
        return; // Ignore duplicate taps while busy
    }

    button.dataset.isBusy = "true";
    button.setAttribute("aria-busy", "true");

    // Preserve exact dimensions to prevent layout shift
    const rect = button.getBoundingClientRect();
    if (rect.width > 0) button.style.minWidth = `${rect.width}px`;
    if (rect.height > 0) button.style.minHeight = `${rect.height}px`;

    const originalHTML = button.innerHTML;
    const originalDisabled = button.disabled;

    const existingIcon = button.querySelector("i.fas, i.far, i.fa-solid, i.fa-regular");
    if (connectingText && button.textContent.trim().length > 0) {
        button.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-1.5 busy-spinner" aria-hidden="true"></i>${connectingText}`;
    } else if (existingIcon) {
        button.innerHTML = `<i class="fas fa-circle-notch fa-spin busy-spinner" aria-hidden="true"></i>`;
    } else {
        button.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-1.5 busy-spinner" aria-hidden="true"></i>`;
    }

    let wakeupTimer = null;
    if (serverWakeupNotice) {
        wakeupTimer = setTimeout(() => {
            if (button.dataset.isBusy === "true") {
                showToast("Waking up the server, this can take up to a minute", 5000);
            }
        }, 5000);
    }

    let timeoutOccurred = false;
    let timeoutTimer = setTimeout(() => {
        timeoutOccurred = true;
        showToast("Request timed out. Please try again.");
        cleanup();
    }, timeoutMs);

    const startTime = Date.now();

    function cleanup() {
        if (wakeupTimer) clearTimeout(wakeupTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        button.innerHTML = originalHTML;
        button.style.minWidth = "";
        button.style.minHeight = "";
        button.removeAttribute("aria-busy");
        delete button.dataset.isBusy;
        button.disabled = originalDisabled;
    }

    try {
        const result = asyncFn();
        if (result && typeof result.then === "function") {
            return result
                .then(res => {
                    const elapsed = Date.now() - startTime;
                    const remaining = Math.max(0, minMs - elapsed);
                    if (remaining > 0) {
                        return new Promise(r => setTimeout(r, remaining)).then(() => {
                            if (!timeoutOccurred) cleanup();
                            return res;
                        });
                    } else {
                        if (!timeoutOccurred) cleanup();
                        return res;
                    }
                })
                .catch(err => {
                    const elapsed = Date.now() - startTime;
                    const remaining = Math.max(0, minMs - elapsed);
                    setTimeout(() => {
                        if (!timeoutOccurred) cleanup();
                    }, remaining);
                    throw err;
                });
        } else {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, minMs - elapsed);
            setTimeout(() => {
                if (!timeoutOccurred) cleanup();
            }, remaining);
            return result;
        }
    } catch (err) {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, minMs - elapsed);
        setTimeout(() => {
            if (!timeoutOccurred) cleanup();
        }, remaining);
        throw err;
    }
}
window.withBusy = withBusy;

document.addEventListener('DOMContentLoaded', () => {
    const socket = io(API_BASE || undefined, { transports: ['websocket', 'polling'] });

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
    if (messageInput) {
        if (!('value' in messageInput)) {
            Object.defineProperty(messageInput, 'value', {
                get() {
                    return this.innerText || this.textContent || '';
                },
                set(val) {
                    if (!val) {
                        this.innerHTML = '';
                    } else {
                        this.innerText = val;
                    }
                },
                configurable: true
            });
        }
        if (!('placeholder' in messageInput)) {
            Object.defineProperty(messageInput, 'placeholder', {
                get() {
                    return this.getAttribute('data-placeholder') || '';
                },
                set(val) {
                    this.setAttribute('data-placeholder', val);
                },
                configurable: true
            });
        }
        if (!('disabled' in messageInput)) {
            Object.defineProperty(messageInput, 'disabled', {
                get() {
                    return this.getAttribute('contenteditable') === 'false';
                },
                set(val) {
                    this.setAttribute('contenteditable', val ? 'false' : 'true');
                },
                configurable: true
            });
        }
    }
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

    // Room Share elements & handler
    const shareRoomBtn = document.getElementById("shareRoomBtn");
    const shareRoomCardBtn = document.getElementById("shareRoomCardBtn");
    const mobileShareRoomBtn = document.getElementById("mobileShareRoomBtn");

    async function shareRoomLink() {
        if (!roomKey) return;
        const PUBLIC_WEB_URL = (window.location.origin && window.location.origin.startsWith('http') && !window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1'))
            ? window.location.origin
            : 'https://anon-chat-jtef.onrender.com';
        const shareUrl = `${PUBLIC_WEB_URL}/?room=${encodeURIComponent(roomKey)}`;
        const shareTitle = 'Join my Anon Chat room';
        const shareText = `Join my private encrypted room on Anon Chat: ${roomKey}`;

        // 1. Try Native Capacitor Share
        const CapShare = window.Capacitor?.Plugins?.Share;
        if (CapShare) {
            try {
                await CapShare.share({
                    title: shareTitle,
                    text: shareText,
                    url: shareUrl,
                    dialogTitle: 'Share Anon Chat Room'
                });
                return;
            } catch (err) {
                const msg = (err && err.message) ? err.message.toLowerCase() : '';
                if (msg.includes('cancel') || msg.includes('abort') || msg.includes('dismiss')) {
                    return;
                }
                console.warn('Capacitor share failed, falling back:', err);
            }
        }

        // 2. Web navigator.share
        if (navigator.share) {
            try {
                await navigator.share({
                    title: shareTitle,
                    text: shareText,
                    url: shareUrl
                });
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.warn('navigator.share failed, falling back:', err);
            }
        }

        // 3. Fallback: Copy link to clipboard
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(shareUrl);
            } else {
                const temp = document.createElement('textarea');
                temp.value = shareUrl;
                document.body.appendChild(temp);
                temp.select();
                document.execCommand('copy');
                document.body.removeChild(temp);
            }
            showToast('Room link copied to clipboard!');
        } catch (e) {
            showToast('Failed to copy link');
        }
    }

    [shareRoomBtn, shareRoomCardBtn, mobileShareRoomBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                shareRoomLink();
            });
        }
    });

    const showRoomQrBtn = document.getElementById("showRoomQrBtn");
    const mobileShowRoomQrBtn = document.getElementById("mobileShowRoomQrBtn");

    async function showRoomQrModal() {
        if (!roomKey) return;
        const currentOrigin = (window.location.origin && window.location.origin.startsWith('http') && !window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1'))
            ? window.location.origin
            : 'https://anon-chat-jtef.onrender.com';
        const shareUrl = `${currentOrigin}/?room=${encodeURIComponent(roomKey)}`;
        const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl)}&margin=8`;

        const modal = document.getElementById("appDialogModal");
        const titleEl = document.getElementById("appDialogTitle");
        const msgEl = document.getElementById("appDialogMessage");
        const okBtn = document.getElementById("appDialogOkBtn");
        const cancelBtn = document.getElementById("appDialogCancelBtn");

        if (!modal) return;

        if (titleEl) titleEl.textContent = "Room QR Code";
        if (msgEl) {
            msgEl.innerHTML = `
                <div class="flex flex-col items-center text-center p-1">
                    <div class="p-3 bg-white rounded-2xl mb-3 shadow-md">
                        <img src="${qrImgUrl}" alt="Room QR Code" class="w-48 h-48 block rounded-lg" loading="eager">
                    </div>
                    <div class="font-mono text-sm text-[#ffb682] font-bold tracking-wider mb-1">${roomKey}</div>
                    <p class="text-xs text-[#888888] mb-3">Scan with a camera or phone to join directly.</p>
                    <div class="flex gap-2 w-full mt-1">
                        <button id="qrCopyLinkBtn" type="button" class="flex-1 py-2 px-3 rounded-lg bg-[#261a12] text-[#ffb682] border border-[#ffb682]/40 text-xs font-semibold hover:bg-[#ffb682] hover:text-black transition-colors cursor-pointer">
                            <i class="fas fa-copy mr-1"></i>Copy Link
                        </button>
                        <a href="${qrImgUrl}" download="room-${roomKey}-qr.png" target="_blank" class="flex-1 py-2 px-3 rounded-lg bg-[#ff7320] text-black text-xs font-semibold hover:bg-[#ff8c42] transition-colors text-center cursor-pointer flex items-center justify-center">
                            <i class="fas fa-download mr-1"></i>Save QR
                        </a>
                    </div>
                </div>
            `;
        }
        if (cancelBtn) cancelBtn.classList.add("hidden");
        if (okBtn) {
            okBtn.textContent = "Close";
            okBtn.className = "modal-btn-primary";
            okBtn.onclick = (e) => {
                e.preventDefault();
                closeAppDialog(true);
            };
        }

        const copyBtn = document.getElementById("qrCopyLinkBtn");
        if (copyBtn) {
            copyBtn.onclick = async (e) => {
                e.preventDefault();
                try {
                    if (navigator.clipboard) await navigator.clipboard.writeText(shareUrl);
                    showToast("Room link copied to clipboard!");
                } catch (err) {
                    showToast("Failed to copy link");
                }
            };
        }

        modal.classList.remove("hidden");
    }

    [showRoomQrBtn, mobileShowRoomQrBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                showRoomQrModal();
            });
        }
    });

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
    let roomKey = null, username = null, isAdmin = false;
    let roomInstanceId = null;
    let sessionToken = null;
    let memberId = null;
    let roomExpiresAt = null;
    window.socket = socket;
    window.currentRoomKey = null;
    window.currentRoomInstanceId = null;
    let userToRemove = null; // Store user info for removal
    let pendingJoinRequest = null;
    let uploadToCancel = null;
    const fileUploads = {};
    // Rich standard emoji list ensures picker never starts blank
    let emojis = [
        "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇",
        "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚",
        "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸",
        "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️",
        "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡",
        "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓",
        "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄",
        "😯", "😦", "😧", "😮", "😲", "😴", "🤤", "😪", "😵", "😵‍💫",
        "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠",
        "😈", "👿", "💀", "☠️", "👻", "👽", "👾", "🤖", "🎃", "👋",
        "🤚", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘",
        "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊",
        "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "❤️",
        "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️",
        "💕", "💞", "💓", "💗", "💖", "💘", "💝", "🔥", "✨", "🎉",
        "🎊", "💯", "🚀", "⭐", "🌟", "💫", "⚡", "💥", "🎯", "👀"
    ];
    let fileToSend = null;
    let lastMessageUser = null;

    // Send button rate limiting & upload state
    let isSendingInProgress = false;
    let lastSendTime = 0;

    // Lightbox zoom & pan state
    let previewZoom = 1;
    let previewPanX = 0;
    let previewPanY = 0;
    let isPanning = false;
    let startPanX = 0;
    let startPanY = 0;
    let initialPinchDistance = null;
    let initialPinchZoom = 1;
    let hasPreviewDragged = false;

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
    let recordingPaused = false;
    let pausedDuration = 0;
    let pauseStartTime = 0;
    let discardRecording = false;
    let audioPreviewBlob = null;
    let audioDuration = 0;
    const recordingUsers = new Map(); // userId -> username (for recording indicator)
    let recordingIndicatorActive = false;

    // Reply to message state
    let replyContext = null; // { messageId, sender, previewText, previewType, originalMessage }

    // Composer & Audio recording UI elements
    const composerRow = document.getElementById("composerRow");
    const voiceRecordingRow = document.getElementById("voiceRecordingRow");
    const recordBtn = document.getElementById("recordBtn");
    const voiceRecordTrashBtn = document.getElementById("voiceRecordTrashBtn");
    const voiceRecordTimer = document.getElementById("voiceRecordTimer");
    const voiceLiveWaveform = document.getElementById("voiceLiveWaveform");
    const voiceRecordPauseBtn = document.getElementById("voiceRecordPauseBtn");
    const voiceRecordPauseIcon = document.getElementById("voiceRecordPauseIcon");
    const voiceRecordSendBtn = document.getElementById("voiceRecordSendBtn");
    const recordingIndicator = document.getElementById("recordingIndicator");

    // Reply preview bar elements
    const replyPreviewBar = document.getElementById("replyPreviewBar");
    const replyCancelBtn = document.getElementById("replyCancelBtn");

    function scrollMessagesToBottom(instant = false) {
        if (!messagesDiv) return;
        requestAnimationFrame(() => {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
    }

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

    // Native and web theme sync helper
    async function applyNativeTheme(isDark) {
        const themeColor = isDark ? '#000000' : '#fbfbf9';
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', themeColor);
        }
        if (window.Capacitor?.isNativePlatform?.()) {
            try {
                const statusBar = window.Capacitor.Plugins?.StatusBar;
                if (statusBar) {
                    await statusBar.setStyle({ style: isDark ? 'DARK' : 'LIGHT' });
                    await statusBar.setBackgroundColor({ color: themeColor });
                    await statusBar.setOverlaysWebView({ overlay: true });
                }
            } catch (err) {
                console.warn('Native status bar styling error:', err);
            }
        }
    }

    // Theme application and toggle logic
    function applyTheme(theme) {
        const isDark = (theme !== 'light');
        if (!isDark) {
            document.documentElement.classList.add('light-mode');
            document.body.classList.add('light-mode');
            if (themeToggleIcon) themeToggleIcon.className = "fas fa-moon text-xs";
            if (themeToggleText) themeToggleText.textContent = "Dark";
            if (themeToggleBtn) themeToggleBtn.title = "Switch to dark mode";
        } else {
            document.documentElement.classList.remove('light-mode');
            document.body.classList.remove('light-mode');
            if (themeToggleIcon) themeToggleIcon.className = "fas fa-sun text-xs";
            if (themeToggleText) themeToggleText.textContent = "Light";
            if (themeToggleBtn) themeToggleBtn.title = "Switch to light mode";
        }
        applyNativeTheme(isDark);
    }

    // Initialize theme: Landing hero is strictly dark mode
    const savedTheme = localStorage.getItem('anon_chat_theme') || 'dark';
    const isInsideRoom = (chatScreen && chatScreen.style.display !== 'none' && chatScreen.style.display !== '') || 
                         (fileRoomScreen && fileRoomScreen.style.display !== 'none' && fileRoomScreen.style.display !== '');
    if (isInsideRoom) {
        applyTheme(savedTheme);
    } else {
        document.documentElement.classList.remove('light-mode');
        document.body.classList.remove('light-mode');
        applyNativeTheme(true);
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

    // ======== PHASE 6: PENDING BUBBLES WITH PROGRESS, CANCEL, RETRY ========
    const activeUploads = new Map(); // clientMsgId -> { xhr, mediaItem, roomInstanceId }

    function createPendingMediaBubble({ file, objectUrl, clientMsgId, roomInstanceId, onCancel, onRetry, onDelete }) {
        const isVideo = file && file.type && file.type.startsWith('video');
        const isImage = file && file.type && file.type.startsWith('image');
        const isAudio = file && file.type && file.type.startsWith('audio');

        const domId = `msg-${clientMsgId}`;
        let wrapper = document.getElementById(domId);
        if (!wrapper) {
            wrapper = document.createElement("div");
            wrapper.id = domId;
            wrapper.setAttribute('data-msg-id', clientMsgId);
            wrapper.setAttribute('data-client-msg-id', clientMsgId);
            wrapper.setAttribute('data-pending', 'true');
            wrapper.setAttribute('data-room-instance-id', roomInstanceId || '');
            wrapper.className = "message flex flex-col items-end new-user pending-message";

            const messageRow = document.createElement("div");
            messageRow.className = "flex flex-col w-full justify-end message-row";

            const messageBubble = document.createElement("div");
            messageBubble.className = "sent-message message-bubble pending-bubble relative overflow-hidden border border-[#ff7320]/30";
            messageBubble.style.minWidth = "180px";

            let mediaPreviewHtml = '';
            if (isImage) {
                mediaPreviewHtml = `
                    <div class="relative w-full max-h-[260px] overflow-hidden rounded-lg bg-black/40">
                        <img src="${objectUrl}" class="w-full h-auto object-cover opacity-75 blur-[0.5px]" alt="Sending...">
                        <div class="pending-overlay absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 p-3">
                            <div class="pending-progress-ring flex items-center justify-center relative w-12 h-12">
                                <svg class="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#333333]" stroke-width="3"></circle>
                                    <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#ff7320] pending-progress-circle transition-all duration-150" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" stroke-linecap="round"></circle>
                                </svg>
                                <span class="pending-progress-text absolute font-mono text-[10px] font-bold text-white">0%</span>
                            </div>
                            <button type="button" class="pending-cancel-btn text-xs text-white/80 hover:text-white bg-black/60 hover:bg-black/80 px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors cursor-pointer" title="Cancel upload">
                                <i class="fas fa-times text-[10px]"></i>
                                <span>Cancel</span>
                            </button>
                        </div>
                    </div>
                `;
            } else if (isVideo) {
                mediaPreviewHtml = `
                    <div class="relative w-full max-h-[260px] overflow-hidden rounded-lg bg-black/40">
                        <video src="${objectUrl}" class="w-full h-auto object-cover opacity-75" muted></video>
                        <div class="pending-overlay absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 p-3">
                            <div class="pending-progress-ring flex items-center justify-center relative w-12 h-12">
                                <svg class="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#333333]" stroke-width="3"></circle>
                                    <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#ff7320] pending-progress-circle transition-all duration-150" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" stroke-linecap="round"></circle>
                                </svg>
                                <span class="pending-progress-text absolute font-mono text-[10px] font-bold text-white">0%</span>
                            </div>
                            <button type="button" class="pending-cancel-btn text-xs text-white/80 hover:text-white bg-black/60 hover:bg-black/80 px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors cursor-pointer" title="Cancel upload">
                                <i class="fas fa-times text-[10px]"></i>
                                <span>Cancel</span>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                mediaPreviewHtml = `
                    <div class="flex items-center gap-3 p-2 rounded-lg bg-black/30">
                        <i class="fas ${isAudio ? 'fa-microphone-lines' : 'fa-file'} text-2xl text-[#ffb682]"></i>
                        <div class="flex-1 min-w-0">
                            <div class="text-xs font-medium text-white truncate">${file ? file.name : 'attachment'}</div>
                            <div class="text-[10px] text-[#888888] font-mono">${formatBytes(file ? file.size : 0)}</div>
                        </div>
                        <div class="pending-progress-ring flex items-center justify-center relative w-9 h-9">
                            <svg class="w-9 h-9 transform -rotate-90" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#333333]" stroke-width="3"></circle>
                                <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#ff7320] pending-progress-circle transition-all duration-150" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" stroke-linecap="round"></circle>
                            </svg>
                            <span class="pending-progress-text absolute font-mono text-[9px] font-bold text-white">0%</span>
                        </div>
                        <button type="button" class="pending-cancel-btn w-7 h-7 rounded-full bg-black/50 hover:bg-black/80 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer" title="Cancel upload">
                            <i class="fas fa-times text-[10px]"></i>
                        </button>
                    </div>
                `;
            }

            const statusRowHtml = `
                <div class="pending-status-bar flex items-center justify-between gap-2 mt-1.5 pt-1 border-t border-white/10 text-[11px] text-[#ffb682]">
                    <div class="flex items-center gap-1.5">
                        <i class="fas fa-arrow-up animate-bounce text-[10px]"></i>
                        <span class="pending-status-label">Sending…</span>
                    </div>
                    <div class="pending-actions hidden flex items-center gap-2">
                        <button type="button" class="pending-retry-btn px-2 py-0.5 rounded bg-[#ff7320] text-black font-semibold text-[10px] hover:bg-[#ff9150] transition-colors cursor-pointer">Retry</button>
                        <button type="button" class="pending-delete-btn px-2 py-0.5 rounded bg-white/10 text-white/80 font-medium text-[10px] hover:bg-white/20 transition-colors cursor-pointer">Delete</button>
                    </div>
                </div>
            `;

            messageBubble.innerHTML = mediaPreviewHtml + statusRowHtml;
            messageRow.appendChild(messageBubble);
            wrapper.appendChild(messageRow);

            getMessagesTarget().appendChild(wrapper);
            if (typeof scrollMessagesToBottom === 'function') {
                scrollMessagesToBottom(true);
            } else if (messagesDiv) {
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
        }

        // Bind event handlers
        const cancelBtn = wrapper.querySelector('.pending-cancel-btn');
        if (cancelBtn) {
            cancelBtn.onclick = (e) => {
                e.stopPropagation();
                if (onCancel) onCancel();
            };
        }

        const retryBtn = wrapper.querySelector('.pending-retry-btn');
        if (retryBtn) {
            retryBtn.onclick = (e) => {
                e.stopPropagation();
                if (onRetry) onRetry();
            };
        }

        const deleteBtn = wrapper.querySelector('.pending-delete-btn');
        if (deleteBtn) {
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (onDelete) onDelete();
            };
        }

        return wrapper;
    }

    function updatePendingBubbleProgress(clientMsgId, percent) {
        const wrapper = document.getElementById(`msg-${clientMsgId}`);
        if (!wrapper) return;
        const circle = wrapper.querySelector('.pending-progress-circle');
        const text = wrapper.querySelector('.pending-progress-text');
        if (circle) {
            const offset = 94.2 - (94.2 * Math.min(100, Math.max(0, percent))) / 100;
            circle.style.strokeDashoffset = offset;
        }
        if (text) {
            text.textContent = `${Math.round(percent)}%`;
        }
    }

    function setPendingBubbleFailed(clientMsgId, errorMsg) {
        const wrapper = document.getElementById(`msg-${clientMsgId}`);
        if (!wrapper) return;
        wrapper.classList.add('pending-failed');
        const bubble = wrapper.querySelector('.pending-bubble');
        if (bubble) {
            bubble.classList.remove('border-[#ff7320]/30');
            bubble.classList.add('border-red-500/60', 'bg-red-950/20');
        }
        const label = wrapper.querySelector('.pending-status-label');
        if (label) {
            label.innerHTML = '<span class="text-red-400 font-medium"><i class="fas fa-exclamation-circle mr-1"></i>Failed to send</span>';
        }
        const bounceIcon = wrapper.querySelector('.pending-status-bar i.fa-arrow-up');
        if (bounceIcon) bounceIcon.classList.add('hidden');

        const actions = wrapper.querySelector('.pending-actions');
        if (actions) actions.classList.remove('hidden');

        const ring = wrapper.querySelector('.pending-progress-ring');
        if (ring) ring.classList.add('hidden');

        const cancelBtn = wrapper.querySelector('.pending-cancel-btn');
        if (cancelBtn) cancelBtn.classList.add('hidden');
    }

    function setPendingBubbleRetrying(clientMsgId) {
        const wrapper = document.getElementById(`msg-${clientMsgId}`);
        if (!wrapper) return;
        wrapper.classList.remove('pending-failed');
        const bubble = wrapper.querySelector('.pending-bubble');
        if (bubble) {
            bubble.classList.remove('border-red-500/60', 'bg-red-950/20');
            bubble.classList.add('border-[#ff7320]/30');
        }
        const label = wrapper.querySelector('.pending-status-label');
        if (label) {
            label.textContent = 'Retrying…';
        }
        const bounceIcon = wrapper.querySelector('.pending-status-bar i.fa-arrow-up');
        if (bounceIcon) bounceIcon.classList.remove('hidden');

        const actions = wrapper.querySelector('.pending-actions');
        if (actions) actions.classList.add('hidden');

        const ring = wrapper.querySelector('.pending-progress-ring');
        if (ring) ring.classList.remove('hidden');

        const cancelBtn = wrapper.querySelector('.pending-cancel-btn');
        if (cancelBtn) cancelBtn.classList.remove('hidden');

        updatePendingBubbleProgress(clientMsgId, 0);
    }

    function removePendingBubble(clientMsgId) {
        const wrapper = document.getElementById(`msg-${clientMsgId}`);
        if (wrapper) {
            wrapper.remove();
        }
    }

    function dispatchMediaUpload(mediaItem) {
        const clientMsgId = mediaItem.clientMsgId;
        const currentInstance = roomInstanceId;

        const xhr = new XMLHttpRequest();
        activeUploads.set(clientMsgId, { xhr, mediaItem, roomInstanceId: currentInstance });

        const formData = new FormData();
        formData.append('file', mediaItem.file);
        formData.append('roomInstanceId', currentInstance || '');
        formData.append('sessionToken', sessionToken || '');
        formData.append('clientMsgId', clientMsgId);

        xhr.open('POST', `${API_BASE}/upload`, true);
        xhr.setRequestHeader('x-room-instance-id', currentInstance || '');
        xhr.setRequestHeader('x-client-msg-id', clientMsgId);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                updatePendingBubbleProgress(clientMsgId, percent);
            }
        };

        xhr.onload = () => {
            if (roomInstanceId !== currentInstance) {
                removePendingBubble(clientMsgId);
                activeUploads.delete(clientMsgId);
                return;
            }

            if (xhr.status === 200) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    const fType = (mediaItem.file && mediaItem.file.type) ? mediaItem.file.type : '';
                    let messageType = 'video';
                    if (mediaItem.type === 'snap' || mediaItem.isSnap) {
                        messageType = 'snap';
                    } else if (fType.startsWith('image')) {
                        messageType = 'image';
                    } else if (fType.startsWith('audio')) {
                        messageType = 'audio';
                    } else if (fType.startsWith('video')) {
                        messageType = 'video';
                    } else {
                        messageType = 'file';
                    }

                    if (messageType === 'file') {
                        const filePayload = {
                            roomKey,
                            roomInstanceId: currentInstance,
                            sessionToken,
                            clientMsgId,
                            username,
                            id: clientMsgId,
                            file: {
                                name: mediaItem.file.name,
                                size: mediaItem.file.size,
                                type: mediaItem.file.type,
                                path: data.path
                            },
                            seenBy: []
                        };
                        displayFile(username, filePayload.file, clientMsgId, []);
                        socket.emit("file-message", filePayload);
                    } else {
                        const messagePayload = {
                            roomKey,
                            roomInstanceId: currentInstance,
                            sessionToken,
                            clientMsgId,
                            username,
                            id: clientMsgId,
                            message: {
                                type: messageType,
                                content: data.path,
                                name: mediaItem.file?.name,
                                size: mediaItem.file?.size,
                                durationMs: mediaItem.durationMs || 0
                            },
                            seenBy: []
                        };
                        renderMessageBubble({
                            username,
                            message: messagePayload.message,
                            id: clientMsgId,
                            clientMsgId,
                            seenBy: []
                        });
                        socket.emit("chat-message", messagePayload);
                    }

                    if (mediaItem.objectUrl) {
                        try { URL.revokeObjectURL(mediaItem.objectUrl); } catch (e) {}
                    }
                    activeUploads.delete(clientMsgId);
                } catch (err) {
                    setPendingBubbleFailed(clientMsgId, 'Failed to parse response');
                }
            } else {
                setPendingBubbleFailed(clientMsgId, `Server error ${xhr.status}`);
            }
        };

        xhr.onerror = () => {
            if (roomInstanceId !== currentInstance) {
                removePendingBubble(clientMsgId);
                activeUploads.delete(clientMsgId);
                return;
            }
            setPendingBubbleFailed(clientMsgId, 'Network error');
        };

        xhr.send(formData);
    }

    function renderMessageBubble(msgPayload) {
        if (!msgPayload) return null;
        const user = msgPayload.username || msgPayload.user;
        const message = (typeof msgPayload.message === 'object' && msgPayload.message !== null)
            ? msgPayload.message
            : { type: msgPayload.type || 'text', content: msgPayload.content || msgPayload.message };
        const id = msgPayload.id || msgPayload.messageId || msgPayload.clientMsgId || `msg-${Date.now()}`;
        const clientMsgId = msgPayload.clientMsgId || id;
        const seenBy = msgPayload.seenBy || [];
        const replyTo = msgPayload.replyTo || null;

        const domId = String(id).startsWith('msg-') ? String(id) : `msg-${id}`;
        let existingWrapper = document.getElementById(domId) ||
            document.querySelector(`[data-client-msg-id="${clientMsgId}"]`) ||
            document.getElementById(id);

        if (existingWrapper) {
            const isPending = existingWrapper.getAttribute('data-pending') === 'true' || existingWrapper.classList.contains('pending-message');
            if (!isPending) {
                // Update seen status if needed
                const seenStatus = existingWrapper.querySelector('.seen-status');
                if (seenStatus) {
                    const otherViewers = seenBy.filter(u => u !== username);
                    if (otherViewers.length > 0) {
                        seenStatus.textContent = `Seen by ${otherViewers.join(", ")}`;
                        seenStatus.classList.add('visible');
                    }
                }
                return existingWrapper;
            }
        }

        const isConsecutive = lastMessageUser === user;
        const bubbleClass = user === username ? 'sent-message' : 'received-message';
        const alignmentClass = user === username ? 'justify-end' : 'justify-start';

        const wrapper = document.createElement("div");
        wrapper.id = domId;
        wrapper.setAttribute('data-msg-id', id);
        wrapper.setAttribute('data-client-msg-id', clientMsgId);
        wrapper.className = `message flex flex-col ${user === username ? 'items-end' : 'items-start'} ${isConsecutive ? 'same-user' : 'new-user'}`;

        if (isConsecutive) {
            wrapper.classList.add("consecutive");
        }

        const messageRow = document.createElement("div");
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
            messageBubble.className = `${bubbleClass} message-bubble`;
            const escapedContent = (message.content || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
            contentHtml = escapedContent;
        } else if (message.type === 'sticker') {
            const mediaSrc = resolveMediaUrl(message.content);
            messageBubble.className = 'sticker-bubble message-bubble';
            contentHtml = `
                <div class="relative group">
                    <img src="${mediaSrc}" class="sticker-message" loading="lazy">
                    <a href="${mediaSrc}" download="sticker-${Date.now()}.png" class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
                        <i class="fas fa-download"></i>
                    </a>
                </div>`;
        } else {
            messageBubble.className = `${bubbleClass} message-bubble message-bubble-media`;
            const mediaSrc = resolveMediaUrl(message.content);
            if (message.type === 'gif') {
                contentHtml = `
                <div class="relative group">
                    <img src="${mediaSrc}" class="message-file-preview" loading="lazy">
                    <a href="${mediaSrc}" download="gif-${Date.now()}.gif" class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
                        <i class="fas fa-download"></i>
                    </a>
                </div>`;
            } else if (message.type === 'image') {
                const aspectStyle = (message.width && message.height) ? `style="aspect-ratio: ${message.width} / ${message.height};"` : '';
                contentHtml = `
                <div class="relative group media-container overflow-hidden rounded-xl" ${aspectStyle}>
                    <img src="${mediaSrc}" class="message-file-preview cursor-pointer" loading="lazy" ${message.width ? `width="${message.width}"` : ''} ${message.height ? `height="${message.height}"` : ''} onclick="openPreview('${mediaSrc}', 'image')" alt="Photo">
                    <a href="${mediaSrc}" download="image-${Date.now()}.jpg" class="media-download-btn absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
                        <i class="fas fa-download text-xs"></i>
                    </a>
                </div>`;
            } else if (message.type === 'video') {
                const aspectStyle = (message.width && message.height) ? `style="aspect-ratio: ${message.width} / ${message.height};"` : '';
                contentHtml = `
                <div class="relative group media-container overflow-hidden rounded-xl" ${aspectStyle}>
                    <video src="${mediaSrc}" class="message-file-preview cursor-pointer" preload="metadata" playsinline onclick="openPreview('${mediaSrc}', 'video')"></video>
                    <div class="video-play-overlay absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div class="w-12 h-12 rounded-full bg-black/60 border border-white/20 flex items-center justify-center shadow-lg text-white">
                            <i class="fas fa-play text-base ml-0.5"></i>
                        </div>
                    </div>
                    <a href="${mediaSrc}" download="video-${Date.now()}.mp4" class="media-download-btn absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
                        <i class="fas fa-download text-xs"></i>
                    </a>
                </div>`;
            } else if (message.type === 'audio') {
                contentHtml = createVoicePlayerHtml(mediaSrc, message.durationMs || 0, user === username);
            } else if (message.type === 'snap') {
                messageBubble.className = 'snap-bubble message-bubble';
                const durationLabel = message.durationMs ? `${Math.round(message.durationMs / 1000)}s` : '';
                contentHtml = `
                <div class="snap-container cursor-pointer" onclick="toggleSnapPlayback(this)">
                    <video src="${mediaSrc}" playsinline class="snap-video" loop></video>
                    <div class="snap-play-overlay">
                        <div class="w-12 h-12 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white shadow-lg">
                            <i class="fas fa-play text-sm ml-0.5"></i>
                        </div>
                    </div>
                    ${durationLabel ? `<span class="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/70 text-white text-[10px] font-mono border border-white/10">${durationLabel}</span>` : ''}
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

        if (message.type === 'audio') {
            const playerEl = messageBubble.querySelector('.voice-player');
            if (playerEl) {
                setupVoicePlayer(playerEl, message.durationMs || 0);
            }
        }

        wrapper.appendChild(messageRow);

        const seenStatus = document.createElement("div");
        seenStatus.className = "seen-status";
        seenStatus.setAttribute('data-msg-user', user);
        wrapper.appendChild(seenStatus);

        if (id && user !== username) {
            if (isTabVisible) {
                socket.emit("mark-seen", { roomKey, roomInstanceId, sessionToken, messageId: id, username });
            } else {
                pendingSeenMessages.add(id);
            }
        }

        if (existingWrapper && (existingWrapper.getAttribute('data-pending') === 'true' || existingWrapper.classList.contains('pending-message'))) {
            existingWrapper.replaceWith(wrapper);
        } else {
            getMessagesTarget().appendChild(wrapper);
        }

        if (user === username && seenBy && seenBy.length > 0) {
            updateSeenStatusDisplay(user, seenBy);
        }

        messagesDiv.scrollTo({
            top: messagesDiv.scrollHeight,
            behavior: 'smooth'
        });

        lastMessageUser = user;
        return wrapper;
    }
    window.renderMessageBubble = renderMessageBubble;

    function displayMessage(user, message, id, seenBy = [], replyTo = null) {
        return renderMessageBubble({
            username: user,
            message,
            id,
            seenBy,
            replyTo
        });
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

    // ======== UPLOAD PROGRESS BANNER HELPERS ========
    function showUploadProgress(title, percent) {
        const banner = document.getElementById("uploadProgressBanner");
        const titleEl = document.getElementById("uploadProgressTitle");
        const percentEl = document.getElementById("uploadProgressPercent");
        const barEl = document.getElementById("uploadProgressBar");
        if (!banner) return;
        banner.classList.remove("hidden");
        if (titleEl && title) titleEl.textContent = title;
        const clampedPercent = Math.max(0, Math.min(100, Math.round(percent || 0)));
        if (percentEl) percentEl.textContent = `${clampedPercent}%`;
        if (barEl) barEl.style.width = `${clampedPercent}%`;
    }

    function hideUploadProgress() {
        const banner = document.getElementById("uploadProgressBanner");
        if (banner) banner.classList.add("hidden");
    }

    // ======== REWRITTEN UNIFIED MEDIA DRAFT MODULE (PHASE 5) ========
    window.mediaDraft = {
        items: pastedMedia,
        add(files) {
            const list = Array.isArray(files) ? files : Array.from(files || []);
            let addedCount = 0;
            let limitToastShown = false;

            for (const file of list) {
                if (pastedMedia.length >= MAX_MEDIA_ITEMS) {
                    if (!limitToastShown) {
                        showToast("Attachment limit reached (10 max)");
                        limitToastShown = true;
                    }
                    break;
                }

                // De-duplicate check: name + size + lastModified
                const isDuplicate = pastedMedia.some(it => {
                    const f = it.file;
                    if (!f) return false;
                    return f.name === file.name && f.size === file.size && f.lastModified === file.lastModified;
                });
                if (isDuplicate) {
                    continue;
                }

                const id = 'draft-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
                const objectUrl = URL.createObjectURL(file);
                pastedMedia.push({
                    id,
                    file,
                    objectUrl,
                    name: file.name,
                    size: file.size,
                    type: file.type || 'application/octet-stream',
                    lastModified: file.lastModified
                });
                addedCount++;
            }

            renderMediaPreviews();
            if (typeof updateSendButtonState === 'function') updateSendButtonState();
            return addedCount;
        },
        remove(idOrIndex) {
            let index = -1;
            if (typeof idOrIndex === 'number') {
                index = idOrIndex;
            } else {
                index = pastedMedia.findIndex(it => it.id === idOrIndex);
            }
            if (index >= 0 && index < pastedMedia.length) {
                removeMediaPreview(index);
            }
        },
        clear() {
            clearAllMediaDrafts();
        },
        validate() {
            return pastedMedia.length <= MAX_MEDIA_ITEMS;
        }
    };

    function renderMediaPreviews() {
        const previewContainer = document.getElementById('mediaPreviews');
        if (!previewContainer) return;

        if (pastedMedia.length === 0) {
            previewContainer.classList.add('hidden');
            previewContainer.innerHTML = '';
            mediaPasteEnabled = true;
            if (typeof updateSendButtonState === 'function') updateSendButtonState();
            return;
        }

        previewContainer.classList.remove('hidden');
        previewContainer.innerHTML = `
            <div class="draft-tray-header">
                <div class="draft-tray-title">
                    <i class="fas fa-paperclip text-[#ffb682] text-xs"></i>
                    <span>Attachments</span>
                    <span class="draft-count-badge font-mono" id="draftCounter">${pastedMedia.length} / ${MAX_MEDIA_ITEMS}</span>
                    ${pastedMedia.length >= MAX_MEDIA_ITEMS ? '<span class="text-[11px] text-[#ff7b7b] ml-1">Limit reached</span>' : ''}
                </div>
                <button type="button" class="draft-clear-all-btn" id="draftClearAllBtn" title="Remove all attachments">
                    <i class="fas fa-trash-can text-[10px]"></i>
                    <span>Clear all</span>
                </button>
            </div>
            <div class="draft-carousel"></div>
        `;

        const clearAllBtn = previewContainer.querySelector('#draftClearAllBtn');
        if (clearAllBtn) {
            clearAllBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                clearAllMediaDrafts();
            };
        }

        const carousel = previewContainer.querySelector('.draft-carousel');

        pastedMedia.forEach((mediaItem, index) => {
            const card = document.createElement('div');
            card.className = 'draft-card';
            card.dataset.index = index;
            if (mediaItem.id) card.dataset.id = mediaItem.id;

            const isVideo = mediaItem.file && mediaItem.file.type && mediaItem.file.type.startsWith('video');
            const isImage = mediaItem.file && mediaItem.file.type && mediaItem.file.type.startsWith('image');
            const isAudio = mediaItem.file && mediaItem.file.type && mediaItem.file.type.startsWith('audio');

            let cardContent = '';
            if (isVideo) {
                cardContent = `
                    <video src="${mediaItem.objectUrl}" class="draft-card-thumb" muted></video>
                    <div class="draft-badge-video"><i class="fas fa-play text-[8px]"></i></div>
                `;
            } else if (isImage) {
                cardContent = `<img src="${mediaItem.objectUrl}" class="draft-card-thumb" alt="media draft" />`;
            } else if (isAudio) {
                cardContent = `
                    <div class="draft-card-doc">
                        <i class="fas fa-microphone-lines text-[#ffb682] text-lg"></i>
                        <span class="draft-card-doc-name">${mediaItem.file ? mediaItem.file.name : 'audio'}</span>
                        <span class="draft-card-doc-size">${formatBytes(mediaItem.file ? mediaItem.file.size : 0)}</span>
                    </div>
                `;
            } else {
                cardContent = `
                    <div class="draft-card-doc">
                        <i class="fas fa-file-lines text-[#ffb682] text-lg"></i>
                        <span class="draft-card-doc-name">${mediaItem.file ? mediaItem.file.name : 'file'}</span>
                        <span class="draft-card-doc-size">${formatBytes(mediaItem.file ? mediaItem.file.size : 0)}</span>
                    </div>
                `;
            }

            card.innerHTML = `
                ${cardContent}
                <button type="button" class="draft-remove-btn" title="Remove attachment" aria-label="Remove attachment">
                    <i class="fas fa-times"></i>
                </button>
                <div class="draft-card-progress ${mediaItem.status === 'uploading' ? '' : 'hidden'}">
                    <div class="draft-card-progress-bar" style="width: ${mediaItem.progress || 0}%;"></div>
                </div>
            `;

            // Tap thumbnail opens lightbox preview
            card.onclick = (e) => {
                if (e.target.closest('.draft-remove-btn')) return;
                if (isImage || isVideo) {
                    openPreview(mediaItem.objectUrl, isImage ? 'image' : 'video');
                }
            };

            const removeBtn = card.querySelector('.draft-remove-btn');
            if (removeBtn) {
                removeBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeMediaPreview(index);
                };
            }

            carousel.appendChild(card);
        });

        mediaPasteEnabled = (pastedMedia.length < MAX_MEDIA_ITEMS);
        if (typeof updateSendButtonState === 'function') {
            updateSendButtonState();
        }
    }

    // Remove single draft preview with URL cleanup
    function removeMediaPreview(index) {
        if (index >= 0 && index < pastedMedia.length) {
            try {
                if (pastedMedia[index].objectUrl) {
                    URL.revokeObjectURL(pastedMedia[index].objectUrl);
                }
            } catch (e) {}
            pastedMedia.splice(index, 1);
            renderMediaPreviews();
        }
    }

    // Discard all media drafts
    function clearAllMediaDrafts() {
        pastedMedia.forEach(item => {
            if (item.objectUrl) {
                try {
                    URL.revokeObjectURL(item.objectUrl);
                } catch (e) {}
            }
        });
        pastedMedia.length = 0;
        renderMediaPreviews();
    }

    function formatTypingText(users) {
        if (!users || users.length === 0) return "";
        if (users.length === 1) return `${users[0]} is typing...`;
        if (users.length === 2) return `${users[0]} and ${users[1]} are typing...`;
        const last = users.pop();
        return `${users.join(", ")} and ${last} are typing...`;
    }

    // ======== COMPACT CUSTOM VOICE PLAYER (WHATSAPP-STYLE) ========
    let activeVoicePlayerAudio = null;

    function formatVoiceTime(seconds) {
        if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    const VOICE_BAR_PRESETS = [35, 55, 75, 45, 90, 60, 40, 85, 100, 70, 50, 65, 80, 95, 45, 60, 75, 55, 85, 65, 40, 60, 45, 30];

    function generateVoiceBarsHtml() {
        return VOICE_BAR_PRESETS.map(h => `<div class="voice-bar" style="height: ${h}%;"></div>`).join('');
    }

    function createVoicePlayerHtml(mediaSrc, durationMs, isSent) {
        const formattedTotal = durationMs ? formatVoiceTime(Math.round(durationMs / 1000)) : '--:--';
        return `
        <div class="voice-player" data-src="${mediaSrc}" data-duration-ms="${durationMs || 0}">
            <button type="button" class="voice-play-btn" aria-label="Play">
                <i class="fas fa-play text-xs"></i>
            </button>
            <div class="voice-player-center">
                <div class="voice-waveform-track" role="slider" aria-label="Seek voice note" tabindex="0">
                    <div class="voice-waveform-bars">
                        ${generateVoiceBarsHtml()}
                    </div>
                </div>
                <div class="voice-player-info">
                    <span class="voice-time-current">0:00</span>
                    <span class="voice-time-total">${formattedTotal}</span>
                </div>
            </div>
            <button type="button" class="voice-speed-btn" title="Playback speed">1x</button>
            <a href="${mediaSrc}" download="voice-${Date.now()}.webm" class="voice-download-btn" title="Download audio">
                <i class="fas fa-download text-xs"></i>
            </a>
            <audio class="voice-hidden-audio" src="${mediaSrc}" preload="metadata" style="display:none;"></audio>
        </div>`;
    }

    function setupVoicePlayer(playerEl, durationMs) {
        if (!playerEl) return;
        const audio = playerEl.querySelector('audio');
        const playBtn = playerEl.querySelector('.voice-play-btn');
        const playIcon = playBtn ? playBtn.querySelector('i') : null;
        const track = playerEl.querySelector('.voice-waveform-track');
        const bars = playerEl.querySelectorAll('.voice-bar');
        const currentEl = playerEl.querySelector('.voice-time-current');
        const totalEl = playerEl.querySelector('.voice-time-total');
        const speedBtn = playerEl.querySelector('.voice-speed-btn');

        if (!audio) return;

        let totalDurationSec = durationMs ? Math.round(durationMs / 1000) : 0;

        const checkWebmDuration = () => {
            if (!totalDurationSec || totalDurationSec === 0) {
                if (!isFinite(audio.duration) || audio.duration === Infinity || audio.duration === 0) {
                    audio.currentTime = 1e101;
                    audio.ontimeupdate = function() {
                        this.ontimeupdate = null;
                        this.currentTime = 0;
                        if (isFinite(this.duration) && this.duration > 0) {
                            totalDurationSec = Math.floor(this.duration);
                            if (totalEl) totalEl.textContent = formatVoiceTime(totalDurationSec);
                        }
                    };
                } else {
                    totalDurationSec = Math.floor(audio.duration);
                    if (totalEl) totalEl.textContent = formatVoiceTime(totalDurationSec);
                }
            }
        };

        audio.addEventListener('loadedmetadata', checkWebmDuration);

        const updateUIProgress = (currentTime, duration) => {
            const d = (duration && duration > 0) ? duration : (totalDurationSec || 1);
            const progress = Math.max(0, Math.min(1, currentTime / d));
            if (currentEl) currentEl.textContent = formatVoiceTime(Math.floor(currentTime));
            const activeCount = Math.floor(progress * bars.length);
            bars.forEach((b, idx) => {
                b.classList.toggle('active', idx <= activeCount);
            });
        };

        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Only one voice message plays at a time
                if (activeVoicePlayerAudio && activeVoicePlayerAudio !== audio) {
                    activeVoicePlayerAudio.pause();
                }

                if (audio.paused) {
                    activeVoicePlayerAudio = audio;
                    checkWebmDuration();
                    audio.play().catch(err => console.warn('Audio playback error:', err));
                } else {
                    audio.pause();
                }
            });
        }

        audio.addEventListener('play', () => {
            if (playIcon) playIcon.className = 'fas fa-pause text-xs';
        });

        audio.addEventListener('pause', () => {
            if (playIcon) playIcon.className = 'fas fa-play text-xs';
        });

        audio.addEventListener('ended', () => {
            if (playIcon) playIcon.className = 'fas fa-play text-xs';
            audio.currentTime = 0;
            updateUIProgress(0, totalDurationSec);
            if (activeVoicePlayerAudio === audio) {
                activeVoicePlayerAudio = null;
            }
        });

        audio.addEventListener('timeupdate', () => {
            updateUIProgress(audio.currentTime, totalDurationSec || audio.duration);
        });

        // Tap or drag seek on waveform track
        if (track) {
            const seekFromEvent = (evt) => {
                const rect = track.getBoundingClientRect();
                const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
                const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                const d = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : totalDurationSec;
                if (d > 0) {
                    audio.currentTime = pct * d;
                    updateUIProgress(audio.currentTime, d);
                }
            };

            track.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                seekFromEvent(e);
                const onPointerMove = (ev) => seekFromEvent(ev);
                const onPointerUp = () => {
                    window.removeEventListener('pointermove', onPointerMove);
                    window.removeEventListener('pointerup', onPointerUp);
                };
                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp);
            });
        }

        // Speed toggle: 1x -> 1.5x -> 2x -> 1x
        if (speedBtn) {
            let speedIdx = 0;
            const speeds = [1, 1.5, 2];
            speedBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                speedIdx = (speedIdx + 1) % speeds.length;
                const newSpeed = speeds[speedIdx];
                audio.playbackRate = newSpeed;
                speedBtn.textContent = `${newSpeed}x`;
            });
        }
    }

    // ======== IN-PLACE WHATSAPP-STYLE VOICE RECORDER ========
    let liveAudioCtx = null;
    let liveAnalyser = null;
    let liveSource = null;
    let liveAnimFrame = null;

    function initLiveWaveform() {
        if (!voiceLiveWaveform) return;
        voiceLiveWaveform.innerHTML = '';
        const barCount = 24;
        for (let i = 0; i < barCount; i++) {
            const bar = document.createElement('div');
            bar.className = 'voice-live-waveform-bar';
            bar.style.height = '4px';
            voiceLiveWaveform.appendChild(bar);
        }
    }

    function startLiveWaveform(stream) {
        initLiveWaveform();
        if (!stream) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            if (!liveAudioCtx || liveAudioCtx.state === 'closed') {
                liveAudioCtx = new AudioContextClass();
            } else if (liveAudioCtx.state === 'suspended') {
                liveAudioCtx.resume();
            }
            liveAnalyser = liveAudioCtx.createAnalyser();
            liveAnalyser.fftSize = 64;
            liveSource = liveAudioCtx.createMediaStreamSource(stream);
            liveSource.connect(liveAnalyser);

            const bufferLength = liveAnalyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            const bars = voiceLiveWaveform ? voiceLiveWaveform.querySelectorAll('.voice-live-waveform-bar') : [];

            function renderLiveWave() {
                if (!isRecording) return;
                if (!recordingPaused && liveAnalyser) {
                    liveAnalyser.getByteFrequencyData(dataArray);
                    bars.forEach((bar, idx) => {
                        const binIndex = Math.min(idx, bufferLength - 1);
                        const val = dataArray[binIndex] || 0;
                        const height = Math.max(4, Math.round((val / 255) * 22));
                        bar.style.height = `${height}px`;
                    });
                }
                liveAnimFrame = requestAnimationFrame(renderLiveWave);
            }
            renderLiveWave();
        } catch (e) {
            console.warn('Live waveform error:', e);
        }
    }

    function stopLiveWaveform() {
        if (liveAnimFrame) {
            cancelAnimationFrame(liveAnimFrame);
            liveAnimFrame = null;
        }
        if (liveSource) {
            try { liveSource.disconnect(); } catch (_) {}
            liveSource = null;
        }
        if (liveAudioCtx && liveAudioCtx.state !== 'closed') {
            try { liveAudioCtx.close(); } catch (_) {}
            liveAudioCtx = null;
        }
        if (voiceLiveWaveform) {
            const bars = voiceLiveWaveform.querySelectorAll('.voice-live-waveform-bar');
            bars.forEach(bar => { bar.style.height = '4px'; });
        }
    }

    function formatRecordingTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // Check if recording is supported
    function checkCanRecord() {
        if (!AudioRecorder.isSupported()) {
            appAlert('Audio recording is not supported in this browser.', { title: 'Not Supported' });
            return false;
        }
        return true;
    }

    // Start audio recording - replaces composer in place
    async function startAudioRecording() {
        if (!checkCanRecord()) return;

        if (!audioRecorder) {
            audioRecorder = new AudioRecorder({ maxDuration: 180 }); // 3 minutes max
        }

        discardRecording = false;
        recordingPaused = false;
        pausedDuration = 0;

        const started = await audioRecorder.startRecording({
            onStop: async (blob, duration) => {
                stopLiveWaveform();
                if (recordingTimer) {
                    clearInterval(recordingTimer);
                    recordingTimer = null;
                }
                socket.emit('recording:stop', { roomKey, userId: socket.id });

                // Restore composer row UI
                if (voiceRecordingRow) voiceRecordingRow.classList.add('hidden');
                isRecording = false;

                if (discardRecording) {
                    discardRecording = false;
                    return;
                }

                // Send immediately as voice message (no intermediate media box)
                const effectiveDurationMs = Math.round((duration || (Date.now() - recordingStartTime - pausedDuration) / 1000) * 1000);
                await uploadAndSendVoiceNote(blob, effectiveDurationMs);
            },
            onMaxDuration: () => {
                showToast('Maximum recording length (3m) reached. Sending voice note...');
                stopAndSendRecording();
            },
            onVisibilityPause: () => {
                if (isRecording && !recordingPaused) {
                    togglePauseRecording();
                }
            },
            onError: async (type, message) => {
                await appAlert(message || 'Microphone error occurred', { title: 'Microphone Error' });
                cancelRecording();
            }
        });

        if (started) {
            isRecording = true;
            recordingStartTime = Date.now();
            pausedDuration = 0;
            recordingPaused = false;

            // In-place UI overlay: show voice recording row over composer without unmounting input
            if (voiceRecordingRow) voiceRecordingRow.classList.remove('hidden');

            if (voiceRecordPauseIcon) voiceRecordPauseIcon.className = 'fas fa-pause text-sm';
            if (voiceRecordPauseBtn) voiceRecordPauseBtn.title = 'Pause';
            if (voiceRecordTimer) voiceRecordTimer.textContent = '00:00';

            // Connect live audio waveform
            if (audioRecorder.stream) {
                startLiveWaveform(audioRecorder.stream);
            }

            // Emit socket event to notify other room members
            socket.emit('recording:start', { roomKey, userId: socket.id, username });

            // Start timer display
            recordingTimer = setInterval(() => {
                if (!recordingPaused) {
                    const elapsedSec = Math.floor((Date.now() - recordingStartTime - pausedDuration) / 1000);
                    if (voiceRecordTimer) voiceRecordTimer.textContent = formatRecordingTime(elapsedSec);
                }
            }, 500);
        }
    }

    // Discard recording immediately
    function cancelRecording() {
        discardRecording = true;
        isRecording = false;
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        stopLiveWaveform();
        if (audioRecorder && audioRecorder.isRecording) {
            audioRecorder.stopRecording();
        } else if (audioRecorder) {
            audioRecorder.cleanup();
        }
        if (voiceRecordingRow) voiceRecordingRow.classList.add('hidden');
        if (composerRow) composerRow.classList.remove('hidden');
        socket.emit('recording:stop', { roomKey, userId: socket.id });
    }

    // Pause/Resume recording
    function togglePauseRecording() {
        if (!isRecording || !audioRecorder) return;
        if (recordingPaused) {
            audioRecorder.resumeRecording();
            recordingPaused = false;
            pausedDuration += (Date.now() - pauseStartTime);
            if (voiceRecordPauseIcon) voiceRecordPauseIcon.className = 'fas fa-pause text-sm';
            if (voiceRecordPauseBtn) voiceRecordPauseBtn.title = 'Pause';
        } else {
            audioRecorder.pauseRecording();
            recordingPaused = true;
            pauseStartTime = Date.now();
            if (voiceRecordPauseIcon) voiceRecordPauseIcon.className = 'fas fa-play text-sm';
            if (voiceRecordPauseBtn) voiceRecordPauseBtn.title = 'Resume';
        }
    }

    // Stop and send recording immediately
    function stopAndSendRecording() {
        if (!isRecording || !audioRecorder) return;
        discardRecording = false;
        audioRecorder.stopRecording();
    }

    // Send voice note directly to server
    async function uploadAndSendVoiceNote(blob, durationMs) {
        if (!blob || blob.size === 0) return;
        const audioFile = new File([blob], `voice-${Date.now()}.webm`, {
            type: blob.type || 'audio/webm'
        });

        const formData = new FormData();
        formData.append('file', audioFile);

        showToast('Sending voice note...');
        try {
            const res = await fetch(`${API_BASE}/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data && data.path) {
                const messageId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                const messagePayload = {
                    roomKey,
                    username,
                    id: messageId,
                    message: {
                        type: 'audio',
                        content: data.path,
                        durationMs: durationMs || 0
                    },
                    seenBy: []
                };

                if (replyContext) {
                    messagePayload.replyTo = {
                        messageId: replyContext.messageId,
                        sender: replyContext.sender,
                        previewText: replyContext.previewText
                    };
                    clearReplyContext();
                }

                displayMessage(username, messagePayload.message, messageId, [], messagePayload.replyTo);
                socket.emit('chat-message', messagePayload);
                scrollMessagesToBottom(true);
            } else {
                showToast('Failed to upload voice note');
            }
        } catch (err) {
            console.error('Error sending voice note:', err);
            showToast('Network error sending voice note');
        }
    }

    // Wire recording row buttons
    if (voiceRecordTrashBtn) {
        voiceRecordTrashBtn.onclick = (e) => {
            e.preventDefault();
            cancelRecording();
        };
    }
    if (voiceRecordPauseBtn) {
        voiceRecordPauseBtn.onclick = (e) => {
            e.preventDefault();
            togglePauseRecording();
        };
    }
    if (voiceRecordSendBtn) {
        voiceRecordSendBtn.onclick = (e) => {
            e.preventDefault();
            stopAndSendRecording();
        };
    }

    // Handle app backgrounding while recording
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && isRecording && !recordingPaused) {
            togglePauseRecording();
        }
    });





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

    // Set reply context (targets the selected message directly)
    function setReplyContext(messageData) {
        if (!messageData) return;
        const targetMessageId = messageData.id;
        const targetSender = messageData.username;
        const targetMessage = messageData.message;

        replyContext = {
            messageId: targetMessageId,
            sender: targetSender,
            previewText: getReplyPreview(targetMessage),
            previewType: targetMessage?.type || 'text',
            originalMessage: targetMessage
        };

        showReplyPreview();
        if (messageInput) {
            messageInput.focus();
        }
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
            const text = message.content || '';
            return text.length > 60 ? text.substring(0, 60) + '...' : text;
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
        } else if (message.type === 'file') {
            return `📎 ${message.content || 'File'}`;
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
        if (!messageId) return;
        const messageElement = document.getElementById(messageId);
        if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Highlight briefly with pulse glow animation
            messageElement.classList.add('message-highlight');
            setTimeout(() => {
                messageElement.classList.remove('message-highlight');
            }, 2200);
        } else {
            // Message not found (deleted or not loaded)
            displaySystemMessage('⚠️ Original message unavailable');
        }
    }
    window.scrollToMessage = scrollToMessage;

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
            const resolvedFilePath = resolveMediaUrl(file.path);
            if (fileType.startsWith('image')) {
                fileHtml = `
                    <div class="relative group">
                        <img src="${resolvedFilePath}" class="message-file-preview" loading="lazy">
                        <a href="${resolvedFilePath}" download="${file.name}" class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
                            <i class="fas fa-download"></i>
                        </a>
                    </div>`;
            } else {
                fileHtml = `
                    <div class="relative group">
                        <video src="${resolvedFilePath}" class="message-file-preview" controls></video>
                        <a href="${resolvedFilePath}" download="${file.name}" class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Download">
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
            const resolvedDocPath = resolveMediaUrl(file.path);

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
                <a href="${resolvedDocPath}" target="_blank" class="file-action-btn file-btn-open flex-1 text-center py-2 px-3 rounded-lg text-xs font-semibold transition-colors">
                    <i class="fas fa-external-link-alt mr-1.5"></i>Open
                </a>
                <a href="${resolvedDocPath}" download="${file.name}" class="file-action-btn file-btn-save flex-1 text-center py-2 px-3 rounded-lg text-xs font-semibold transition-colors">
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

        xhr.open("POST", `${API_BASE}/upload`, true);

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
                    appAlert("Error processing upload: " + error.message); // Visible alert
                    messageBubble.innerHTML = '<div class="text-red-400 text-sm">Upload processing failed</div>';
                }
            } else {
                if (xhr.status !== 0) {
                    messageBubble.innerHTML = '<div class="text-red-400 text-sm">File upload failed</div>';
                    appAlert("Upload failed with status: " + xhr.status); // Visible alert
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
        if (roomKey && roomInstanceId && sessionToken) {
            const sessionRecord = {
                kind: 'chat',
                roomKey,
                roomInstanceId,
                sessionToken,
                memberId,
                username,
                isAdmin,
                expiresAt: roomExpiresAt,
                savedAt: Date.now()
            };
            try {
                localStorage.setItem('anon_session', JSON.stringify(sessionRecord));
            } catch (e) {}
        }
    }

    function clearSession() {
        try {
            localStorage.removeItem('anon_session');
            localStorage.removeItem('roomKey');
            localStorage.removeItem('username');
            localStorage.removeItem('isAdmin');
            localStorage.removeItem('anon_file_room_id');
        } catch (e) {}
    }

    let splashWakingTimer = null;
    let splashActionTimer = null;

    function showReconnectSplash(title = "Reconnecting…", subtitle = "Checking your previous session") {
        const splash = document.getElementById("reconnectSplash");
        const titleEl = document.getElementById("splashTitle");
        const subEl = document.getElementById("splashSubtitle");
        const wakingEl = document.getElementById("splashServerWaking");
        const actionsEl = document.getElementById("splashActions");
        if (!splash) return;

        if (titleEl) titleEl.textContent = title;
        if (subEl) subEl.textContent = subtitle;
        if (wakingEl) wakingEl.classList.add("hidden");
        if (actionsEl) actionsEl.classList.add("hidden");

        splash.classList.remove("hidden");

        if (splashWakingTimer) clearTimeout(splashWakingTimer);
        if (splashActionTimer) clearTimeout(splashActionTimer);

        splashWakingTimer = setTimeout(() => {
            if (wakingEl && !splash.classList.contains("hidden")) {
                wakingEl.classList.remove("hidden");
            }
        }, 5000);

        splashActionTimer = setTimeout(() => {
            if (actionsEl && !splash.classList.contains("hidden")) {
                actionsEl.classList.remove("hidden");
            }
        }, 90000);
    }

    function hideReconnectSplash() {
        const splash = document.getElementById("reconnectSplash");
        if (splash) splash.classList.add("hidden");
        if (splashWakingTimer) clearTimeout(splashWakingTimer);
        if (splashActionTimer) clearTimeout(splashActionTimer);
    }

    function showSessionNotice(text) {
        const notice = document.getElementById("sessionNotice");
        const noticeText = document.getElementById("sessionNoticeText");
        if (notice && noticeText) {
            noticeText.textContent = text || "Your last room has ended.";
            notice.classList.remove("hidden");
        }
    }

    const closeSessionNoticeBtn = document.getElementById("closeSessionNoticeBtn");
    if (closeSessionNoticeBtn) {
        closeSessionNoticeBtn.onclick = () => {
            const notice = document.getElementById("sessionNotice");
            if (notice) notice.classList.add("hidden");
        };
    }

    const splashRetryBtn = document.getElementById("splashRetryBtn");
    const splashFreshBtn = document.getElementById("splashFreshBtn");
    if (splashRetryBtn) {
        splashRetryBtn.onclick = () => {
            restoreSession();
        };
    }
    if (splashFreshBtn) {
        splashFreshBtn.onclick = () => {
            clearSession();
            hideReconnectSplash();
            showLandingScreen();
        };
    }

    function restoreSession() {
        let session = null;
        try {
            const stored = localStorage.getItem("anon_session");
            if (stored) session = JSON.parse(stored);
        } catch (e) {}

        if (!session) {
            clearSession();
            return;
        }

        if (session.kind === "chat") {
            if (!session.roomInstanceId || !session.sessionToken) {
                clearSession();
                return;
            }
            showReconnectSplash("Reconnecting…", "Resuming your chat room…");
            socket.emit("resume-session", {
                roomInstanceId: session.roomInstanceId,
                sessionToken: session.sessionToken
            });
        } else if (session.kind === "vault") {
            if (!session.identifier) {
                clearSession();
                return;
            }
            showReconnectSplash("Reconnecting…", "Loading file vault…");
            fetch(`${API_BASE}/api/file-rooms/${encodeURIComponent(session.identifier)}`)
                .then(res => {
                    if (!res.ok) throw new Error("Vault unavailable");
                    return res.json();
                })
                .then(data => {
                    hideReconnectSplash();
                    if (data && data.room) {
                        openFileRoomByIdentifier(session.identifier, true);
                    } else {
                        clearSession();
                        showLandingScreen();
                        showSessionNotice("That vault has expired or was deleted.");
                    }
                })
                .catch(() => {
                    hideReconnectSplash();
                    clearSession();
                    showLandingScreen();
                    showSessionNotice("That vault has expired or was deleted.");
                });
        }
    }

    // Event Listeners
    createRoomBtn.onclick = () => {
        roomKey = roomKeyInput.value.trim();
        username = usernameInput.value.trim();
        if (!roomKey || !username) {
            appAlert("Please enter a username and a room key.");
            return;
        }
        withBusy(createRoomBtn, () => {
            window.currentRoomKey = roomKey;
            socket.emit("create-room", {
                roomKey,
                username
            });
            return new Promise((resolve) => {
                const onDone = () => { cleanup(); resolve(); };
                function cleanup() {
                    socket.off("room-created", onDone);
                    socket.off("room-exists", onDone);
                }
                socket.once("room-created", onDone);
                socket.once("room-exists", onDone);
            });
        }, { serverWakeupNotice: true, connectingText: "Connecting…" });
    };

    joinRoomBtn.onclick = () => {
        roomKey = roomKeyInput.value.trim();
        username = usernameInput.value.trim();
        if (!roomKey || !username) {
            appAlert("Please enter a username and a room key.");
            return;
        }
        withBusy(joinRoomBtn, () => {
            window.currentRoomKey = roomKey;
            socket.emit("join-room", {
                roomKey,
                username
            });
            return new Promise((resolve) => {
                const onDone = () => { cleanup(); resolve(); };
                function cleanup() {
                    socket.off("join-approved", onDone);
                    socket.off("join-request-sent", onDone);
                    socket.off("room-not-found", onDone);
                    socket.off("join-rejected", onDone);
                }
                socket.once("join-approved", onDone);
                socket.once("join-request-sent", onDone);
                socket.once("room-not-found", onDone);
                socket.once("join-rejected", onDone);
            });
        }, { serverWakeupNotice: true, connectingText: "Connecting…" });
    };

    // Direct join invite card elements & handlers
    const askJoinRoomBtn = document.getElementById("askJoinRoomBtn");
    const cancelInviteBtn = document.getElementById("cancelInviteBtn");
    const inviteUsername = document.getElementById("inviteUsername");
    const inviteRoomKeyDisplay = document.getElementById("inviteRoomKeyDisplay");
    const inviteJoinStatus = document.getElementById("inviteJoinStatus");
    const panelChatRoom = document.getElementById("panelChatRoom");
    const panelJoinInvite = document.getElementById("panelJoinInvite");

    if (askJoinRoomBtn) {
        askJoinRoomBtn.onclick = () => {
            const codename = (inviteUsername ? inviteUsername.value.trim() : "") || (usernameInput ? usernameInput.value.trim() : "");
            const key = (inviteRoomKeyDisplay ? inviteRoomKeyDisplay.textContent.trim() : "") || (roomKeyInput ? roomKeyInput.value.trim() : "");

            if (!codename) {
                showToast("Please enter your codename first");
                if (inviteUsername) inviteUsername.focus();
                return;
            }
            if (!key) {
                showToast("Missing room key");
                return;
            }

            username = codename;
            roomKey = key;
            window.currentRoomKey = roomKey;
            if (usernameInput) usernameInput.value = username;
            if (roomKeyInput) roomKeyInput.value = roomKey;

            withBusy(askJoinRoomBtn, () => {
                if (inviteJoinStatus) inviteJoinStatus.classList.remove("hidden");
                socket.emit("join-room", { roomKey, username });
                return new Promise((resolve) => {
                    const onDone = () => { cleanup(); resolve(); };
                    function cleanup() {
                        socket.off("join-approved", onDone);
                        socket.off("join-request-sent", onDone);
                        socket.off("room-not-found", onDone);
                        socket.off("join-rejected", onDone);
                    }
                    socket.once("join-approved", onDone);
                    socket.once("join-request-sent", onDone);
                    socket.once("room-not-found", onDone);
                    socket.once("join-rejected", onDone);
                });
            }, { serverWakeupNotice: true, connectingText: "Connecting…" });
        };
    }

    if (cancelInviteBtn) {
        cancelInviteBtn.onclick = () => {
            if (panelJoinInvite) panelJoinInvite.classList.add("hidden");
            if (panelChatRoom) panelChatRoom.classList.remove("hidden");
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname);
            }
        };
    }

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

        // Cleanup active uploads
        if (typeof activeUploads !== 'undefined') {
            activeUploads.forEach(({ xhr }) => {
                try { xhr.abort(); } catch (e) {}
            });
            activeUploads.clear();
        }

        if (emitLeave && roomKey && username) {
            socket.emit("leave-room", { roomKey, username });
        }

        clearSession();

        showLandingScreen();
        clearMessages();
        roomKeyInput.value = "";
        isAdmin = false;
        roomKey = null;
        roomInstanceId = null;
        sessionToken = null;
        window.currentRoomKey = null;
        window.currentRoomInstanceId = null;
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
        withBusy(confirmLeaveBtn, async () => {
            performLeaveRoom(true);
        }, { minMs: 300, connectingText: "Leaving…" });
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
        withBusy(confirmEndRoomBtn, async () => {
            const currentKey = roomKey;
            socket.emit("kill-room", { roomKey: currentKey, roomInstanceId, sessionToken });
            performLeaveRoom(false);
        }, { minMs: 300, connectingText: "Ending…" });
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
                withBusy(copyRoomKeyBtn, () => new Promise(r => setTimeout(r, 1500)), {
                    minMs: 1500,
                    connectingText: '<i class="fas fa-check text-emerald-400 mr-1.5"></i>Copied!'
                });
            }).catch(err => {
                console.error("Failed to copy room key:", err);
            });
        };
    }

    const cameraBtn = document.getElementById("cameraBtn");

    // Send button & composer action state helper (WhatsApp arrangement)
    function updateSendButtonState() {
        const hasText = messageInput && (messageInput.value || messageInput.innerText || "").trim().length > 0;
        const hasMedia = (typeof pastedMedia !== 'undefined' && pastedMedia.length > 0) || fileToSend !== null;
        const hasDraft = (typeof mediaDraft !== 'undefined' && mediaDraft.items && mediaDraft.items.length > 0);
        const hasContent = hasText || hasMedia || hasDraft;

        if (cameraBtn) {
            if (hasContent) {
                cameraBtn.classList.add("hidden");
            } else {
                cameraBtn.classList.remove("hidden");
            }
        }

        if (sendBtn) {
            const sendBtnIcon = document.getElementById("sendBtnIcon") || sendBtn.querySelector("i");
            if (hasContent) {
                sendBtn.dataset.mode = "send";
                sendBtn.title = "Send message";
                sendBtn.classList.remove("mic-mode");
                sendBtn.classList.add("send-mode");
                if (sendBtnIcon) {
                    sendBtnIcon.className = "fas fa-paper-plane text-base";
                }
            } else {
                sendBtn.dataset.mode = "mic";
                sendBtn.title = "Record voice note";
                sendBtn.classList.remove("send-mode");
                sendBtn.classList.add("mic-mode");
                if (sendBtnIcon) {
                    sendBtnIcon.className = "fas fa-microphone text-base";
                }
            }
        }
    }

    // Initialize send button state
    updateSendButtonState();

    // Prevent button pointerdown from stealing focus or closing keyboard
    if (sendBtn) {
        sendBtn.addEventListener('pointerdown', (e) => e.preventDefault());
        sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
    }
    if (emojiBtn) {
        emojiBtn.addEventListener('pointerdown', (e) => e.preventDefault());
        emojiBtn.addEventListener('mousedown', (e) => e.preventDefault());
    }
    if (fileBtn) {
        fileBtn.addEventListener('pointerdown', (e) => e.preventDefault());
        fileBtn.addEventListener('mousedown', (e) => e.preventDefault());
    }
    if (cameraBtn) {
        cameraBtn.addEventListener('pointerdown', (e) => e.preventDefault());
        cameraBtn.addEventListener('mousedown', (e) => e.preventDefault());
    }
    if (recordBtn) {
        recordBtn.addEventListener('pointerdown', (e) => e.preventDefault());
        recordBtn.addEventListener('mousedown', (e) => e.preventDefault());
    }

    // ============================================================
    // PHASE 9: CAMERA BUTTON (TAP = PHOTO, HOLD = CIRCULAR SNAP)
    // ============================================================
    const cameraPhotoInput = document.getElementById("cameraPhotoInput");
    const snapRecordingOverlay = document.getElementById("snapRecordingOverlay");
    const snapRecordTimer = document.getElementById("snapRecordTimer");
    const snapRecordVideo = document.getElementById("snapRecordVideo");
    const snapRecordProgressRing = document.getElementById("snapRecordProgressRing");
    const snapSlideCancelHint = document.getElementById("snapSlideCancelHint");

    const snapReviewOverlay = document.getElementById("snapReviewOverlay");
    const snapReviewWrapper = document.getElementById("snapReviewWrapper");
    const snapReviewVideo = document.getElementById("snapReviewVideo");
    const snapReviewSoundBadge = document.getElementById("snapReviewSoundBadge");
    const snapReviewDuration = document.getElementById("snapReviewDuration");
    const snapDeleteBtn = document.getElementById("snapDeleteBtn");
    const snapSendBtn = document.getElementById("snapSendBtn");

    let cameraHoldTimer = null;
    let cameraPressStartTime = 0;
    let cameraPointerStartX = 0;
    let cameraPointerStartY = 0;
    let isCameraHolding = false;
    let isSnapCancelled = false;

    let snapMediaStream = null;
    let snapMediaRecorder = null;
    let snapRecordedChunks = [];
    let snapRecordInterval = null;
    let snapDurationMs = 0;
    let recordedSnapBlob = null;
    let recordedSnapUrl = null;

    const SNAP_MAX_DURATION_MS = 30000;
    const SNAP_RING_CIRCUMFERENCE = 766.5;

    function stopAllSnapTracks() {
        if (snapMediaStream) {
            try {
                snapMediaStream.getTracks().forEach(t => t.stop());
            } catch (e) {}
            snapMediaStream = null;
        }
        if (snapRecordVideo) {
            snapRecordVideo.srcObject = null;
        }
    }

    async function takePhoto() {
        try {
            if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins?.Camera) {
                const image = await window.Capacitor.Plugins.Camera.getPhoto({
                    quality: 85,
                    allowEditing: false,
                    resultType: 'uri',
                    source: 'CAMERA'
                });
                if (image && (image.webPath || image.path)) {
                    const res = await fetch(image.webPath);
                    const blob = await res.blob();
                    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
                    if (window.mediaDraft) {
                        window.mediaDraft.add([file]);
                    }
                }
            } else {
                if (cameraPhotoInput) {
                    cameraPhotoInput.click();
                }
            }
        } catch (err) {
            if (err && err.message && (err.message.includes('denied') || err.message.includes('permission'))) {
                if (typeof appAlert === 'function') {
                    appAlert('Camera permission was denied. Please enable camera access in settings.');
                }
            } else if (!err || !err.message || !err.message.includes('User cancelled')) {
                console.warn('Camera photo error:', err);
            }
        }
    }

    if (cameraPhotoInput) {
        cameraPhotoInput.onchange = () => {
            const files = Array.from(cameraPhotoInput.files || []);
            if (files.length > 0 && window.mediaDraft) {
                window.mediaDraft.add(files);
            }
            cameraPhotoInput.value = "";
        };
    }

    async function startSnapRecording() {
        isSnapCancelled = false;
        snapRecordedChunks = [];
        snapDurationMs = 0;

        try {
            snapMediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 }, aspectRatio: 1 },
                audio: true
            });

            if (snapRecordVideo) {
                snapRecordVideo.srcObject = snapMediaStream;
                await snapRecordVideo.play();
            }

            let mimeType = 'video/webm';
            if (typeof MediaRecorder !== 'undefined') {
                if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
                    mimeType = 'video/mp4;codecs=avc1';
                } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
                    mimeType = 'video/webm;codecs=vp9,opus';
                } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
                    mimeType = 'video/webm;codecs=vp8,opus';
                }
            }

            snapMediaRecorder = new MediaRecorder(snapMediaStream, {
                mimeType,
                videoBitsPerSecond: 800000,
                audioBitsPerSecond: 64000
            });

            snapMediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    snapRecordedChunks.push(e.data);
                }
            };

            snapMediaRecorder.onstop = () => {
                stopAllSnapTracks();
                if (isSnapCancelled) return;
                if (snapDurationMs < 1000) {
                    showToast('Hold to record');
                    return;
                }
                const blobType = snapMediaRecorder.mimeType || 'video/webm';
                recordedSnapBlob = new Blob(snapRecordedChunks, { type: blobType });
                openSnapReviewOverlay(recordedSnapBlob, snapDurationMs);
            };

            snapMediaRecorder.start(100);

            if (snapRecordingOverlay) snapRecordingOverlay.classList.remove('hidden');
            if (snapSlideCancelHint) snapSlideCancelHint.classList.remove('text-red-400');

            const startRecTime = Date.now();
            if (snapRecordProgressRing) {
                snapRecordProgressRing.style.strokeDashoffset = `${SNAP_RING_CIRCUMFERENCE}`;
            }

            snapRecordInterval = setInterval(() => {
                const elapsed = Date.now() - startRecTime;
                snapDurationMs = elapsed;
                const totalSec = Math.floor(elapsed / 1000);
                const mm = Math.floor(totalSec / 60);
                const ss = String(totalSec % 60).padStart(2, '0');
                if (snapRecordTimer) {
                    snapRecordTimer.textContent = `${mm}:${ss} / 0:30`;
                }

                const progress = Math.min(1, elapsed / SNAP_MAX_DURATION_MS);
                if (snapRecordProgressRing) {
                    snapRecordProgressRing.style.strokeDashoffset = `${SNAP_RING_CIRCUMFERENCE * (1 - progress)}`;
                }

                if (elapsed >= SNAP_MAX_DURATION_MS) {
                    stopSnapRecording();
                }
            }, 100);

        } catch (err) {
            console.warn('Snap recording init error:', err);
            isCameraHolding = false;
            stopAllSnapTracks();
            if (snapRecordingOverlay) snapRecordingOverlay.classList.add('hidden');
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                if (typeof appAlert === 'function') {
                    appAlert('Camera or microphone permission was denied. Please allow access.');
                }
            }
        }
    }

    function stopSnapRecording() {
        if (snapRecordInterval) {
            clearInterval(snapRecordInterval);
            snapRecordInterval = null;
        }
        if (snapRecordingOverlay) snapRecordingOverlay.classList.add('hidden');
        if (snapMediaRecorder && snapMediaRecorder.state === 'recording') {
            snapMediaRecorder.stop();
        } else {
            stopAllSnapTracks();
        }
    }

    function cancelSnapRecording(reason = 'Cancelled') {
        isSnapCancelled = true;
        stopSnapRecording();
        stopAllSnapTracks();
        showToast(reason);
    }

    function openSnapReviewOverlay(blob, durationMs) {
        if (recordedSnapUrl) {
            URL.revokeObjectURL(recordedSnapUrl);
        }
        recordedSnapUrl = URL.createObjectURL(blob);

        if (snapReviewVideo) {
            snapReviewVideo.src = recordedSnapUrl;
            snapReviewVideo.muted = true;
            snapReviewVideo.play().catch(() => {});
        }

        const totalSec = Math.floor(durationMs / 1000);
        const mm = Math.floor(totalSec / 60);
        const ss = String(totalSec % 60).padStart(2, '0');
        if (snapReviewDuration) {
            snapReviewDuration.textContent = `${mm}:${ss}`;
        }

        if (snapReviewSoundBadge) {
            snapReviewSoundBadge.innerHTML = '<i class="fas fa-volume-xmark"></i>';
        }

        if (snapReviewOverlay) {
            snapReviewOverlay.classList.remove('hidden');
        }
    }

    function closeSnapReviewOverlay() {
        if (snapReviewOverlay) {
            snapReviewOverlay.classList.add('hidden');
        }
        if (snapReviewVideo) {
            snapReviewVideo.pause();
            snapReviewVideo.src = "";
        }
        if (recordedSnapUrl) {
            URL.revokeObjectURL(recordedSnapUrl);
            recordedSnapUrl = null;
        }
        recordedSnapBlob = null;
    }

    if (snapReviewWrapper && snapReviewVideo) {
        snapReviewWrapper.onclick = () => {
            snapReviewVideo.muted = !snapReviewVideo.muted;
            if (snapReviewSoundBadge) {
                snapReviewSoundBadge.innerHTML = snapReviewVideo.muted
                    ? '<i class="fas fa-volume-xmark"></i>'
                    : '<i class="fas fa-volume-high text-[#ffb682]"></i>';
            }
        };
    }

    if (snapDeleteBtn) {
        snapDeleteBtn.onclick = () => {
            closeSnapReviewOverlay();
        };
    }

    if (snapSendBtn) {
        snapSendBtn.onclick = () => {
            if (!recordedSnapBlob) {
                closeSnapReviewOverlay();
                return;
            }
            const ext = recordedSnapBlob.type.includes('mp4') ? 'mp4' : 'webm';
            const snapFile = new File([recordedSnapBlob], `snap_${Date.now()}.${ext}`, {
                type: recordedSnapBlob.type || 'video/webm'
            });
            const snapDur = snapDurationMs;
            closeSnapReviewOverlay();

            if (typeof dispatchMediaUpload === 'function') {
                const clientMsgId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const objectUrl = URL.createObjectURL(snapFile);
                createPendingMediaBubble({
                    file: snapFile,
                    objectUrl,
                    clientMsgId,
                    roomInstanceId: roomInstanceId || '',
                    onCancel: () => {
                        const act = activeUploads.get(clientMsgId);
                        if (act && act.xhr) act.xhr.abort();
                        removePendingBubble(clientMsgId);
                        activeUploads.delete(clientMsgId);
                    },
                    onRetry: () => {
                        setPendingBubbleRetrying(clientMsgId);
                        dispatchMediaUpload({ file: snapFile, clientMsgId, type: 'snap', isSnap: true, durationMs: snapDur });
                    },
                    onDelete: () => {
                        removePendingBubble(clientMsgId);
                        activeUploads.delete(clientMsgId);
                    }
                });
                dispatchMediaUpload({ file: snapFile, clientMsgId, type: 'snap', isSnap: true, durationMs: snapDur });
            }
        };
    }

    function toggleSnapPlayback(container) {
        if (!container) return;
        const video = container.querySelector('.snap-video');
        const overlay = container.querySelector('.snap-play-overlay');
        if (!video) return;

        if (video.paused) {
            document.querySelectorAll('video, audio').forEach(el => {
                if (el !== video && !el.paused) el.pause();
            });
            document.querySelectorAll('.snap-play-overlay').forEach(el => el.classList.remove('playing'));
            video.play().then(() => {
                if (overlay) overlay.classList.add('playing');
            }).catch(() => {});
        } else {
            video.pause();
            if (overlay) overlay.classList.remove('playing');
        }
    }
    window.toggleSnapPlayback = toggleSnapPlayback;

    // Discard on backgrounding
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (isCameraHolding) {
                cancelSnapRecording('Backgrounded');
            }
            stopAllSnapTracks();
        }
    });

    if (cameraBtn) {
        cameraBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try {
                cameraBtn.setPointerCapture(e.pointerId);
            } catch (err) {}

            cameraPressStartTime = Date.now();
            cameraPointerStartX = e.clientX;
            cameraPointerStartY = e.clientY;
            isCameraHolding = false;
            isSnapCancelled = false;

            cameraHoldTimer = setTimeout(async () => {
                isCameraHolding = true;
                await startSnapRecording();
            }, 300);
        });

        const handlePointerMove = (e) => {
            if (isCameraHolding) {
                const dx = e.clientX - cameraPointerStartX;
                if (dx < -80 && !isSnapCancelled) {
                    cancelSnapRecording('Slide to cancel');
                }
            }
        };

        cameraBtn.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointermove', handlePointerMove);

        const handleCameraPointerEnd = (e) => {
            if (cameraHoldTimer) {
                clearTimeout(cameraHoldTimer);
                cameraHoldTimer = null;
            }

            if (!isCameraHolding) {
                takePhoto();
            } else {
                stopSnapRecording();
                isCameraHolding = false;
            }
        };

        cameraBtn.addEventListener('pointerup', handleCameraPointerEnd);
        cameraBtn.addEventListener('pointercancel', handleCameraPointerEnd);
        window.addEventListener('pointerup', (e) => {
            if (isCameraHolding) {
                handleCameraPointerEnd(e);
            }
        });
        cameraBtn.addEventListener('contextmenu', e => e.preventDefault());
    }

    const MAX_MESSAGE_LENGTH = 4000;

    messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
            return;
        }
        if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            document.execCommand('insertLineBreak');
            autoResizeTextarea();
            return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if ((messageInput.value || '').length >= MAX_MESSAGE_LENGTH) {
                e.preventDefault();
                showToast("Character limit reached");
            }
        }
    });

    messageInput.addEventListener("input", () => {
        autoResizeTextarea();
        updateSendButtonState();

        if (!roomKey || !username) return;

        const hasContent = (messageInput.value || '').trim().length > 0;

        if (!isTyping && hasContent) {
            socket.emit("typing:start", {
                roomKey,
                userId: socket.id,
                username
            });
            isTyping = true;
        }

        if (typingTimeout) clearTimeout(typingTimeout);

        if (!hasContent && isTyping) {
            socket.emit("typing:stop", { roomKey, userId: socket.id });
            isTyping = false;
            return;
        }

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

    // Helper to handle external media files from paste, drop, or keyboard insertion
    function handleMediaFilesFromExternal(files) {
        if (!files || files.length === 0) return;
        const imageFiles = Array.from(files).filter(f => f && f.type && (f.type.startsWith('image/') || f.type.includes('gif')));
        if (imageFiles.length === 0) return;

        const hasTypedText = (messageInput.value || '').trim().length > 0;
        const itemsToAdd = [];

        imageFiles.forEach(file => {
            if (pastedMedia.length + itemsToAdd.length < MAX_MEDIA_ITEMS) {
                const objectUrl = URL.createObjectURL(file);
                itemsToAdd.push({ file, objectUrl });
            }
        });

        if (itemsToAdd.length === 0) {
            showToast('Media limit reached (10 max)');
            return;
        }

        pastedMedia.push(...itemsToAdd);
        renderMediaPreviews();
        updateSendButtonState();

        if (!hasTypedText) {
            // No text typed -> send immediately through existing upload flow
            sendBtn.click();
        } else {
            // Text already typed -> keep in attachment tray
            showToast(`${itemsToAdd.length} image added to attachments`);
        }
    }

    // Paste handler supporting files, direct image URLs, and text
    messageInput.addEventListener('paste', async (event) => {
        // 1. Check for image files in clipboardData
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
            const imgFiles = Array.from(files).filter(f => f.type && (f.type.startsWith('image/') || f.type.includes('gif')));
            if (imgFiles.length > 0) {
                event.preventDefault();
                handleMediaFilesFromExternal(imgFiles);
                return;
            }
        }

        if (event.clipboardData?.items) {
            const itemFiles = [];
            for (let i = 0; i < event.clipboardData.items.length; i++) {
                const item = event.clipboardData.items[i];
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const f = item.getAsFile();
                    if (f) itemFiles.push(f);
                }
            }
            if (itemFiles.length > 0) {
                event.preventDefault();
                handleMediaFilesFromExternal(itemFiles);
                return;
            }
        }

        // 2. Check for pasted direct image/GIF URLs (Giphy, Tenor, direct .gif/.png/.webp)
        const pastedText = event.clipboardData ? event.clipboardData.getData('text/plain').trim() : '';
        const isDirectImageUrl = /^https?:\/\/.+\.(gif|webp|png|jpe?g)($|\?)/i.test(pastedText) ||
            /^https?:\/\/(media[0-9]*\.giphy\.com|c\.tenor\.com|tenor\.com\/view|i\.giphy\.com)\/.+/i.test(pastedText);

        const hasTypedText = (messageInput.value || '').trim().length > 0;
        if (isDirectImageUrl && !hasTypedText) {
            event.preventDefault();
            const isGif = pastedText.toLowerCase().includes('.gif') || pastedText.includes('giphy');
            const msgType = isGif ? 'gif' : 'image';
            const messageId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const payload = {
                roomKey,
                username,
                id: messageId,
                message: { type: msgType, content: pastedText },
                seenBy: []
            };
            if (replyContext) {
                payload.replyTo = {
                    messageId: replyContext.messageId,
                    sender: replyContext.sender,
                    previewText: replyContext.previewText
                };
                clearReplyContext();
            }
            displayMessage(username, payload.message, messageId, [], payload.replyTo);
            socket.emit("chat-message", payload);
            scrollMessagesToBottom(true);
            return;
        }

        // 3. Plain text paste: prevent rich HTML tags from leaking into contenteditable
        event.preventDefault();
        const plainText = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
        document.execCommand('insertText', false, plainText);
        autoResizeTextarea();
        updateSendButtonState();
    });

    // Handle beforeinput (e.g. keyboard GIF/sticker commit on Android WebView)
    messageInput.addEventListener('beforeinput', (e) => {
        if (e.inputType === 'insertFromPaste' || e.inputType === 'insertReplacementText' || e.inputType === 'insertFromYank') {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const imgFiles = Array.from(e.dataTransfer.files).filter(f => f.type && (f.type.startsWith('image/') || f.type.includes('gif')));
                if (imgFiles.length > 0) {
                    e.preventDefault();
                    handleMediaFilesFromExternal(imgFiles);
                    return;
                }
            }
            if (e.dataTransfer && e.dataTransfer.items) {
                const itemFiles = [];
                for (let i = 0; i < e.dataTransfer.items.length; i++) {
                    const item = e.dataTransfer.items[i];
                    if (item.kind === 'file' && item.type.startsWith('image/')) {
                        const f = item.getAsFile();
                        if (f) itemFiles.push(f);
                    }
                }
                if (itemFiles.length > 0) {
                    e.preventDefault();
                    handleMediaFilesFromExternal(itemFiles);
                }
            }
        }
    });

    // MutationObserver on messageInput to intercept image tags inserted by soft keyboards (Gboard/Samsung)
    const composerObserver = new MutationObserver((mutations) => {
        let hadImage = false;
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeName === 'IMG') {
                    hadImage = true;
                    const imgSrc = node.src;
                    node.remove();
                    if (imgSrc) {
                        if (imgSrc.startsWith('data:') || imgSrc.startsWith('blob:')) {
                            fetch(imgSrc)
                                .then(r => r.blob())
                                .then(blob => {
                                    const ext = blob.type.split('/')[1] || 'png';
                                    const file = new File([blob], `sticker-${Date.now()}.${ext}`, { type: blob.type });
                                    handleMediaFilesFromExternal([file]);
                                })
                                .catch(() => {});
                        } else {
                            // Direct URL (e.g. Giphy/Tenor from keyboard)
                            const isGif = imgSrc.includes('.gif') || imgSrc.includes('giphy');
                            const msgType = isGif ? 'gif' : 'sticker';
                            const messageId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                            const payload = {
                                roomKey,
                                username,
                                id: messageId,
                                message: { type: msgType, content: imgSrc },
                                seenBy: []
                            };
                            if (replyContext) {
                                payload.replyTo = {
                                    messageId: replyContext.messageId,
                                    sender: replyContext.sender,
                                    previewText: replyContext.previewText
                                };
                                clearReplyContext();
                            }
                            displayMessage(username, payload.message, messageId, [], payload.replyTo);
                            socket.emit("chat-message", payload);
                            scrollMessagesToBottom(true);
                        }
                    }
                }
            });
        });
        if (hadImage) {
            autoResizeTextarea();
            updateSendButtonState();
        }
    });
    if (messageInput) {
        composerObserver.observe(messageInput, { childList: true, subtree: true });
    }

    // Handle drop directly onto messageInput
    messageInput.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const imgFiles = Array.from(e.dataTransfer.files).filter(f => f.type && (f.type.startsWith('image/') || f.type.includes('gif')));
            if (imgFiles.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                handleMediaFilesFromExternal(imgFiles);
            }
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
        // WhatsApp behavior: if in mic mode, tap starts voice recording
        if (sendBtn.dataset.mode === "mic") {
            if (typeof startAudioRecording === "function") {
                startAudioRecording();
            }
            return;
        }

        // Rate limiting & anti-duplicate protection
        if (isSendingInProgress) {
            return;
        }
        const now = Date.now();
        if (now - lastSendTime < 300) {
            return;
        }
        if (sendBtn.disabled) return;

        const message = (messageInput.value || '').trim();
        const mediaToSend = [...pastedMedia];
        const hasMedia = mediaToSend.length > 0;
        if (message === "" && !hasMedia && !fileToSend) return;

        isSendingInProgress = true;
        sendBtn.setAttribute('aria-busy', 'true');
        sendBtn.dataset.isBusy = 'true';
        lastSendTime = now;
        pastedMedia.length = 0;
        renderMediaPreviews();
        updateSendButtonState();
        sendBtn.classList.add('opacity-60', 'cursor-not-allowed');

        // Stop typing indicator when sending
        if (isTyping) {
            socket.emit("typing:stop", { roomKey, roomInstanceId, sessionToken, userId: socket.id });
            isTyping = false;
            if (typingTimeout) clearTimeout(typingTimeout);
        }

        try {
            // Send media items with instant pending bubbles in chat stream
            for (const mediaItem of mediaToSend) {
                const clientMsgId = mediaItem.clientMsgId || (crypto.randomUUID ? crypto.randomUUID() : `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
                mediaItem.clientMsgId = clientMsgId;

                createPendingMediaBubble({
                    file: mediaItem.file,
                    objectUrl: mediaItem.objectUrl,
                    clientMsgId,
                    roomInstanceId,
                    onCancel: () => {
                        const active = activeUploads.get(clientMsgId);
                        if (active && active.xhr) {
                            try { active.xhr.abort(); } catch (e) {}
                        }
                        removePendingBubble(clientMsgId);
                        if (mediaItem.objectUrl) {
                            try { URL.revokeObjectURL(mediaItem.objectUrl); } catch (e) {}
                        }
                        activeUploads.delete(clientMsgId);
                    },
                    onRetry: () => {
                        setPendingBubbleRetrying(clientMsgId);
                        dispatchMediaUpload(mediaItem);
                    },
                    onDelete: () => {
                        removePendingBubble(clientMsgId);
                        if (mediaItem.objectUrl) {
                            try { URL.revokeObjectURL(mediaItem.objectUrl); } catch (e) {}
                        }
                        activeUploads.delete(clientMsgId);
                    }
                });

                dispatchMediaUpload(mediaItem);
            }

            // Send text message if present
            if (message !== "") {
                const clientMsgId = crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                const messageId = clientMsgId;
                const messagePayload = {
                    roomKey,
                    roomInstanceId,
                    sessionToken,
                    clientMsgId,
                    username,
                    id: messageId,
                    message: { type: 'text', content: message },
                    seenBy: []
                };

                if (replyContext) {
                    messagePayload.replyTo = {
                        messageId: replyContext.messageId,
                        sender: replyContext.sender,
                        previewText: replyContext.previewText
                    };
                }

                renderMessageBubble({
                    username,
                    message: messagePayload.message,
                    id: messageId,
                    clientMsgId,
                    seenBy: [],
                    replyTo: replyContext ? messagePayload.replyTo : null
                });

                socket.emit("chat-message", messagePayload);
            }

            // Clear draft state
            clearReplyContext();

            messageInput.value = "";
            autoResizeTextarea();
            renderMediaPreviews();
            messageInput.focus();
            scrollMessagesToBottom(true);
        } finally {
            isSendingInProgress = false;
            sendBtn.removeAttribute('aria-busy');
            delete sendBtn.dataset.isBusy;
            hideUploadProgress();
            sendBtn.classList.remove('opacity-60', 'cursor-not-allowed');
            updateSendButtonState();
        }
    };

    fileInput.onchange = () => {
        const files = Array.from(fileInput.files || []);
        if (files.length === 0) return;
        if (window.mediaDraft) {
            window.mediaDraft.add(files);
        }
        fileInput.value = "";
    };

    // File button triggers file input
    fileBtn.onclick = () => {
        fileInput.click();
    };

    // Record button toggles audio recording
    if (recordBtn) {
        recordBtn.onclick = () => {
            if (isRecording) {
                stopAudioRecording();
            } else {
                startAudioRecording();
            }
        };
    }
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
            scrollMessagesToBottom(true);
            return;
        }
        mediaPicker.classList.remove("hidden");
        mediaPicker.style.display = "";
        mediaPicker.innerHTML = "";
        scrollMessagesToBottom(true);

        // Create tabs container
        const tabsContainer = document.createElement("div");
        tabsContainer.className = "flex border-b border-[#2a2a2a] mb-4 flex-shrink-0";

        const emojiTab = document.createElement("button");
        emojiTab.className = "flex-1 py-2 px-3 text-sm font-semibold text-[#9a9a9a] hover:text-white border-b-2 border-transparent transition-colors";
        emojiTab.textContent = "Emoji";
        emojiTab.addEventListener("pointerdown", (e) => e.preventDefault());
        emojiTab.onclick = () => showEmojiPicker();

        const gifTab = document.createElement("button");
        gifTab.className = "flex-1 py-2 px-3 text-sm font-semibold text-[#9a9a9a] hover:text-white border-b-2 border-transparent transition-colors";
        gifTab.textContent = "GIFs";
        gifTab.addEventListener("pointerdown", (e) => e.preventDefault());
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

        function activateTab(activeTab) {
            [emojiTab, gifTab].forEach(t => {
                if (t === activeTab) {
                    t.classList.add("border-[#ff7320]", "text-[#ff7320]");
                    t.classList.remove("border-transparent", "text-[#9a9a9a]");
                } else {
                    t.classList.remove("border-[#ff7320]", "text-[#ff7320]");
                    t.classList.add("border-transparent", "text-[#9a9a9a]");
                }
            });
        }

        function showEmojiPicker() {
            activateTab(emojiTab);

            contentArea.innerHTML = "";
            renderEmojis();

            // Enrich emoji list from local emojis.json if not already loaded with full set
            if (emojis.length < 150) {
                fetch('emojis.json')
                    .then(res => res.json())
                    .then(data => {
                        if (Array.isArray(data) && data.length > 0) {
                            emojis = data.map(emoji => emoji.unicode || emoji);
                            renderEmojis();
                        }
                    })
                    .catch(() => {
                        // Standard built-in emojis are already rendered, so picker remains fully functional offline!
                    });
            }
        }

        function showGifPicker() {
            activateTab(gifTab);

            contentArea.innerHTML = "";
            const searchInput = document.createElement("input");
            searchInput.type = "text";
            searchInput.placeholder = "Search for GIFs...";
            searchInput.className = "w-full p-2.5 rounded-lg bg-[#242424] border border-[#333333] text-white placeholder-[#808080] focus:outline-none focus:border-[#ffb682] mb-3 text-sm flex-shrink-0";
            let searchTimeout = null;
            searchInput.oninput = () => {
                if (searchTimeout) clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    searchGifs(searchInput.value.trim());
                }, 300);
            };
            contentArea.appendChild(searchInput);

            const resultsDiv = document.createElement("div");
            resultsDiv.className = "mt-3 grid grid-cols-3 gap-3";
            resultsDiv.id = "gif-results";
            contentArea.appendChild(resultsDiv);

            function searchGifs(query) {
                const gifResults = document.getElementById("gif-results");
                if (gifResults) {
                    gifResults.innerHTML = '<div class="col-span-3 text-center py-8 text-xs text-[#888888]"><i class="fas fa-spinner fa-spin mr-1.5 text-sm text-[#ff7320]"></i>Loading GIFs...</div>';
                }
                const fetchUrl = absUrl(`/api/gifs?query=${encodeURIComponent(query || "trending")}`);
                fetch(fetchUrl)
                    .then(res => res.json())
                    .then(data => {
                        const targetResults = document.getElementById("gif-results");
                        if (!targetResults) return;
                        targetResults.innerHTML = "";

                        if (data && data.error) {
                            const errContainer = document.createElement("div");
                            errContainer.className = "col-span-3 text-center py-8 text-xs text-[#888888]";
                            errContainer.innerHTML = `
                                <div class="mb-2 text-[#ff7b7b]">${data.error}</div>
                                <button type="button" class="gif-retry-btn px-3 py-1 bg-[#261a12] text-[#ffb682] border border-[#ffb682]/40 rounded-lg text-xs hover:bg-[#ffb682] hover:text-black transition-colors cursor-pointer">Retry</button>
                            `;
                            errContainer.querySelector('.gif-retry-btn').onclick = () => searchGifs(query);
                            targetResults.appendChild(errContainer);
                            return;
                        }

                        if (data && data.data && data.data.length > 0) {
                            data.data.forEach(gif => {
                                const img = document.createElement("img");
                                const imgUrl = gif.images?.fixed_height?.url || gif.images?.original?.url;
                                if (!imgUrl) return;
                                img.src = imgUrl;
                                img.className = "cursor-pointer w-full h-24 object-cover rounded-lg hover:opacity-80 transition-opacity";
                                img.loading = "lazy";
                                img.addEventListener("pointerdown", (e) => e.preventDefault());
                                img.onclick = () => {
                                    const messageId = `gif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                                    const messagePayload = {
                                        roomKey,
                                        roomInstanceId,
                                        sessionToken,
                                        username,
                                        id: messageId,
                                        clientMsgId: messageId,
                                        message: { type: 'gif', content: img.src },
                                        seenBy: []
                                    };
                                    if (replyContext) {
                                        messagePayload.replyTo = {
                                            messageId: replyContext.messageId,
                                            sender: replyContext.sender,
                                            previewText: replyContext.previewText
                                        };
                                        clearReplyContext();
                                    }
                                    displayMessage(username, messagePayload.message, messageId, [], messagePayload.replyTo);
                                    socket.emit("chat-message", messagePayload);
                                    mediaPicker.classList.add("hidden");
                                    scrollMessagesToBottom(true);
                                };
                                targetResults.appendChild(img);
                            });
                        } else {
                            targetResults.innerHTML = '<div class="col-span-3 text-center py-8 text-xs text-[#888888]">No GIFs found. Try another search.</div>';
                        }
                    })
                    .catch(err => {
                        console.warn('GIF search error:', err);
                        const targetResults = document.getElementById("gif-results");
                        if (targetResults) {
                            const errContainer = document.createElement("div");
                            errContainer.className = "col-span-3 text-center py-8 text-xs text-[#888888]";
                            errContainer.innerHTML = `
                                <div class="mb-2 text-[#ff7b7b]">Couldn't load GIFs. Check connection.</div>
                                <button type="button" class="gif-retry-btn px-3 py-1 bg-[#261a12] text-[#ffb682] border border-[#ffb682]/40 rounded-lg text-xs hover:bg-[#ffb682] hover:text-black transition-colors cursor-pointer">Retry</button>
                            `;
                            errContainer.querySelector('.gif-retry-btn').onclick = () => searchGifs(query);
                            targetResults.innerHTML = "";
                            targetResults.appendChild(errContainer);
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
            btn.className = "text-2xl p-2 rounded-lg hover:bg-[#2c2c2c] transition-colors cursor-pointer select-none";
            btn.addEventListener("pointerdown", (e) => e.preventDefault());
            btn.onclick = (e) => {
                e.preventDefault();
                insertTextIntoComposer(emoji);
            };
            emojiGrid.appendChild(btn);
        });
        contentArea.appendChild(emojiGrid);
    }

    function insertTextIntoComposer(text) {
        if (!messageInput) return;
        messageInput.focus();
        if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
            document.execCommand('insertText', false, text);
        } else {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                const node = document.createTextNode(text);
                range.insertNode(node);
                range.setStartAfter(node);
                range.setEndAfter(node);
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                messageInput.value = (messageInput.value || '') + text;
            }
        }
        autoResizeTextarea();
        updateSendButtonState();
    }

    // Lightbox modal elements & gesture state (PHASE 8)
    const previewZoomIndicator = document.getElementById("previewZoomIndicator");
    const previewZoomResetBtn = document.getElementById("previewZoomResetBtn");

    previewZoom = 1;
    previewPanX = 0;
    previewPanY = 0;
    isPanning = false;
    startPanX = 0;
    startPanY = 0;
    let maxPointerMovement = 0;
    let hadMultiTouch = false;
    const activePointers = new Map();
    let initialPinchDist = 0;
    let initialPinchScale = 1;

    function clampPreviewPan(img) {
        if (!img || previewZoom <= 1) {
            previewPanX = 0;
            previewPanY = 0;
            return;
        }
        const imgW = img.offsetWidth || 300;
        const imgH = img.offsetHeight || 300;
        const scaledW = imgW * previewZoom;
        const scaledH = imgH * previewZoom;
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;

        const maxPanX = Math.max(0, (scaledW - vpW) / 2);
        const maxPanY = Math.max(0, (scaledH - vpH) / 2);

        previewPanX = Math.max(-maxPanX, Math.min(maxPanX, previewPanX));
        previewPanY = Math.max(-maxPanY, Math.min(maxPanY, previewPanY));
    }

    function applyPreviewTransform(img) {
        if (!img) return;
        clampPreviewPan(img);
        if (previewZoom <= 1) {
            previewZoom = 1;
            img.classList.remove('zoomed');
        } else {
            img.classList.add('zoomed');
        }
        img.style.transform = `translate(${previewPanX}px, ${previewPanY}px) scale(${previewZoom})`;
        if (previewZoomIndicator) {
            previewZoomIndicator.textContent = `${Math.round(previewZoom * 100)}%`;
            previewZoomIndicator.style.opacity = previewZoom > 1 ? '1' : '0';
        }
    }

    function closePreviewModal() {
        if (!previewModal) return;
        previewModal.classList.add('hidden');
        if (previewContent) previewContent.innerHTML = "";
        previewZoom = 1;
        previewPanX = 0;
        previewPanY = 0;
        isPanning = false;
        hadMultiTouch = false;
        maxPointerMovement = 0;
        activePointers.clear();
        if (previewZoomIndicator) {
            previewZoomIndicator.style.opacity = '0';
            previewZoomIndicator.textContent = '100%';
        }
    }

    function openPreview(src, type = 'image') {
        if (!previewModal || !previewContent) return;
        previewZoom = 1;
        previewPanX = 0;
        previewPanY = 0;
        isPanning = false;
        hadMultiTouch = false;
        maxPointerMovement = 0;
        activePointers.clear();

        if (previewZoomIndicator) {
            previewZoomIndicator.style.opacity = '0';
            previewZoomIndicator.textContent = '100%';
        }

        const resolvedSrc = (typeof absUrl === 'function') ? absUrl(src) : src;
        const isVid = (typeof type === 'string' && type.startsWith('video'));
        if (isVid) {
            previewContent.innerHTML = `<video src="${resolvedSrc}" controls autoplay playsinline class="max-w-[96vw] max-h-[92vh] object-contain rounded-lg"></video>`;
            if (previewZoomResetBtn) previewZoomResetBtn.classList.add('hidden');
        } else {
            previewContent.innerHTML = `<img id="previewActiveImage" src="${resolvedSrc}" class="preview-zoomable-img" draggable="false" alt="Preview">`;
            if (previewZoomResetBtn) previewZoomResetBtn.classList.remove('hidden');
        }
        previewModal.classList.remove('hidden');
    }
    window.openPreview = openPreview;
    window.closePreviewModal = closePreviewModal;

    if (closePreview) {
        closePreview.onclick = (e) => {
            e.stopPropagation();
            closePreviewModal();
        };
    }

    if (previewZoomResetBtn) {
        previewZoomResetBtn.onclick = (e) => {
            e.stopPropagation();
            const img = document.getElementById("previewActiveImage");
            previewZoom = 1;
            previewPanX = 0;
            previewPanY = 0;
            applyPreviewTransform(img);
        };
    }

    if (previewModal) {
        // Mouse Wheel Zoom toward cursor (1x to 5x)
        previewModal.addEventListener('wheel', (e) => {
            const img = document.getElementById("previewActiveImage");
            if (!img) return;
            e.preventDefault();

            const oldScale = previewZoom;
            const factor = e.deltaY < 0 ? 1.2 : 0.833;
            const newScale = Math.min(5.0, Math.max(1.0, oldScale * factor));
            if (newScale === oldScale) return;

            // Viewport center
            const cursorOffsetX = e.clientX - (window.innerWidth / 2);
            const cursorOffsetY = e.clientY - (window.innerHeight / 2);

            // Zoom toward cursor
            const scaleRatio = newScale / oldScale;
            previewPanX = cursorOffsetX - (cursorOffsetX - previewPanX) * scaleRatio;
            previewPanY = cursorOffsetY - (cursorOffsetY - previewPanY) * scaleRatio;
            previewZoom = newScale;

            applyPreviewTransform(img);
        }, { passive: false });

        // Pointer Events for Pinch, Pan, and Tap-to-Close
        previewModal.addEventListener('pointerdown', (e) => {
            if (e.target.closest('#previewZoomResetBtn') || e.target.closest('#closePreview')) return;
            const img = document.getElementById("previewActiveImage");

            activePointers.set(e.pointerId, {
                x: e.clientX,
                y: e.clientY,
                startX: e.clientX,
                startY: e.clientY
            });

            if (activePointers.size === 1) {
                maxPointerMovement = 0;
                hadMultiTouch = false;
                isPanning = previewZoom > 1;
                startPanX = previewPanX;
                startPanY = previewPanY;
                if (img && isPanning) img.classList.add('is-dragging');
            } else if (activePointers.size === 2) {
                hadMultiTouch = true;
                isPanning = false;
                const pts = Array.from(activePointers.values());
                initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                initialPinchScale = previewZoom;
            }
        });

        previewModal.addEventListener('pointermove', (e) => {
            if (!activePointers.has(e.pointerId)) return;
            const ptr = activePointers.get(e.pointerId);
            ptr.x = e.clientX;
            ptr.y = e.clientY;

            const dist = Math.hypot(ptr.x - ptr.startX, ptr.y - ptr.startY);
            if (dist > maxPointerMovement) {
                maxPointerMovement = dist;
            }

            const img = document.getElementById("previewActiveImage");
            if (!img) return;

            if (activePointers.size === 1 && isPanning && previewZoom > 1) {
                const dx = ptr.x - ptr.startX;
                const dy = ptr.y - ptr.startY;
                previewPanX = startPanX + dx;
                previewPanY = startPanY + dy;
                applyPreviewTransform(img);
            } else if (activePointers.size === 2 && initialPinchDist > 0) {
                hadMultiTouch = true;
                const pts = Array.from(activePointers.values());
                const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                const scaleFactor = currentDist / initialPinchDist;
                previewZoom = Math.min(5.0, Math.max(1.0, initialPinchScale * scaleFactor));
                applyPreviewTransform(img);
            }
        });

        const handlePointerEnd = (e) => {
            if (activePointers.has(e.pointerId)) {
                activePointers.delete(e.pointerId);
            }
            if (activePointers.size === 0) {
                const img = document.getElementById("previewActiveImage");
                if (img) img.classList.remove('is-dragging');
                isPanning = false;

                // Tap-to-close:
                // "A tap/click ANYWHERE closes it (backdrop and image, also when zoomed).
                // It's a gesture, not a tap, if the pointer moved more than ~8px or a second pointer was involved.
                // Wheel zoom never closes it. Also close on Esc, the Android Back button and the x button."
                if (!hadMultiTouch && maxPointerMovement <= 8) {
                    if (!e.target.closest('#previewZoomResetBtn') && !e.target.closest('#closePreview')) {
                        closePreviewModal();
                    }
                }
            }
        };

        previewModal.addEventListener('pointerup', handlePointerEnd);
        previewModal.addEventListener('pointercancel', handlePointerEnd);

        // Escape key closes modal
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && previewModal && !previewModal.classList.contains('hidden')) {
                closePreviewModal();
            }
        });
    }

    messagesDiv.addEventListener('click', (e) => {
        if (e.target.classList.contains('message-file-preview') || e.target.classList.contains('sticker-message')) {
            let type;
            if (e.target.tagName === 'IMG') {
                type = e.target.src.endsWith('.gif') ? 'gif' : 'image/png';
            } else if (e.target.tagName === 'VIDEO') {
                type = 'video/mp4';
            }
            openPreview(e.target.src, type || 'image/png');
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
            if (window.Capacitor?.isNativePlatform?.()) {
                // When running natively on Android, @capacitor/keyboard with resize: 'body'
                // manages viewport resizing natively without fighting layout.
                return;
            }
            if (!chatScreen || chatScreen.style.display === "none") return;

            let viewportHeight = window.innerHeight;
            let offsetTop = 0;
            const isInputActive = (document.activeElement === messageInput);

            if (window.visualViewport) {
                viewportHeight = window.visualViewport.height;
                offsetTop = window.visualViewport.offsetTop || 0;
            }

            // Keyboard is detected if input is active or visual viewport is significantly smaller than layout viewport
            const isKeyboardOpen = isInputActive || (window.visualViewport && window.visualViewport.height < window.innerHeight - 80);

            if (isKeyboardOpen) {
                document.documentElement.style.setProperty('--vvh', `${viewportHeight}px`);
                chatScreen.style.height = `${viewportHeight}px`;
                chatScreen.style.top = `${offsetTop}px`;
                chatScreen.style.bottom = 'auto';
            } else {
                document.documentElement.style.removeProperty('--vvh');
                chatScreen.style.height = '100dvh';
                chatScreen.style.top = '0px';
                chatScreen.style.bottom = '0px';
            }

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

        // On native Android, ensure latest messages remain visible when keyboard appears
        if (window.Capacitor?.isNativePlatform?.()) {
            const Keyboard = window.Capacitor.Plugins?.Keyboard;
            if (Keyboard) {
                Keyboard.addListener('keyboardDidShow', () => {
                    if (messagesDiv) {
                        requestAnimationFrame(() => {
                            messagesDiv.scrollTop = messagesDiv.scrollHeight;
                        });
                    }
                });
            }
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

    // Gesture state for swipe-to-reply & touch handling
    let touchStartX = 0;
    let touchStartY = 0;
    let activeSwipeBubble = null;
    let activeSwipeWrapper = null;
    let activeSwipeRow = null;
    let activeSwipeIcon = null;
    let isDraggingRight = false;
    let longPressTimeout = null;
    let lastClickTime = 0;
    let lastClickedMessage = null;

    function resetSwipeVisuals(bubble, icon) {
        if (bubble) {
            bubble.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
            bubble.style.transform = '';
            setTimeout(() => {
                if (bubble) bubble.style.transition = '';
            }, 250);
        }
        if (icon) {
            icon.classList.remove('visible', 'threshold-ready');
            setTimeout(() => {
                if (icon && icon.parentElement) {
                    icon.remove();
                }
            }, 220);
        }
    }

    if (messagesDiv) {
        // Dismiss soft keyboard when tapping outside composer on chat area
        messagesDiv.addEventListener('pointerdown', (e) => {
            if (document.activeElement === messageInput) {
                if (!e.target.closest('#composerRow') && !e.target.closest('#voiceRecordingRow') && !e.target.closest('#mediaDraftsTray') && !e.target.closest('#media-picker')) {
                    messageInput.blur();
                    if (window.Capacitor?.Plugins?.Keyboard) {
                        window.Capacitor.Plugins.Keyboard.hide();
                    }
                }
            }
        });

        // Touch Start
        messagesDiv.addEventListener('touchstart', (e) => {
            const messageBubble = e.target.closest('.sent-message, .received-message, .message-bubble-media, .file-document-bubble');
            if (!messageBubble) return;

            const messageWrapper = messageBubble.closest('.message');
            if (!messageWrapper || !messageWrapper.id) return;

            const messageRow = messageBubble.closest('.message-row');

            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            activeSwipeBubble = messageBubble;
            activeSwipeWrapper = messageWrapper;
            activeSwipeRow = messageRow;
            isDraggingRight = false;

            longPressTimeout = setTimeout(() => {
                if (!isDraggingRight && activeSwipeWrapper) {
                    const messageData = extractMessageData(activeSwipeWrapper);
                    if (messageData) {
                        setReplyContext(messageData);
                        if (navigator.vibrate) navigator.vibrate(30);
                    }
                }
            }, 450);
        }, { passive: true });

        // Touch Move - Visual drag right with live translation
        messagesDiv.addEventListener('touchmove', (e) => {
            if (!activeSwipeBubble || !activeSwipeWrapper) return;

            const touchX = e.touches[0].clientX;
            const touchY = e.touches[0].clientY;
            const deltaX = touchX - touchStartX; // Positive = Drag RIGHT
            const deltaY = Math.abs(touchY - touchStartY);

            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }

            if (!isDraggingRight && deltaY > 10 && deltaY > Math.abs(deltaX)) {
                return;
            }

            if (deltaX > 8) {
                isDraggingRight = true;
                if (e.cancelable) e.preventDefault();

                const moveX = Math.min(deltaX * 0.65, 68);
                activeSwipeBubble.style.transition = 'none';
                activeSwipeBubble.style.transform = `translateX(${moveX}px)`;

                if (!activeSwipeIcon && activeSwipeRow) {
                    activeSwipeIcon = activeSwipeRow.querySelector('.swipe-reply-icon');
                    if (!activeSwipeIcon) {
                        activeSwipeIcon = document.createElement('div');
                        activeSwipeIcon.className = 'swipe-reply-icon';
                        activeSwipeIcon.innerHTML = '<i class="fas fa-reply text-xs"></i>';
                        activeSwipeRow.prepend(activeSwipeIcon);
                    }
                }

                if (activeSwipeIcon) {
                    activeSwipeIcon.classList.add('visible');
                    if (moveX >= 42) {
                        if (!activeSwipeIcon.classList.contains('threshold-ready')) {
                            activeSwipeIcon.classList.add('threshold-ready');
                            if (navigator.vibrate) navigator.vibrate(25);
                        }
                    } else {
                        activeSwipeIcon.classList.remove('threshold-ready');
                    }
                }
            }
        }, { passive: false });

        // Touch End
        messagesDiv.addEventListener('touchend', (e) => {
            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }

            if (isDraggingRight && activeSwipeWrapper && activeSwipeBubble) {
                const isReady = activeSwipeIcon && activeSwipeIcon.classList.contains('threshold-ready');
                if (isReady) {
                    const messageData = extractMessageData(activeSwipeWrapper);
                    if (messageData) {
                        setReplyContext(messageData);
                        if (navigator.vibrate) navigator.vibrate(40);
                    }
                }
            }

            resetSwipeVisuals(activeSwipeBubble, activeSwipeIcon);
            activeSwipeBubble = null;
            activeSwipeWrapper = null;
            activeSwipeRow = null;
            activeSwipeIcon = null;
            isDraggingRight = false;
        }, { passive: true });

        // Touch Cancel
        messagesDiv.addEventListener('touchcancel', () => {
            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }
            resetSwipeVisuals(activeSwipeBubble, activeSwipeIcon);
            activeSwipeBubble = null;
            activeSwipeWrapper = null;
            activeSwipeRow = null;
            activeSwipeIcon = null;
            isDraggingRight = false;
        }, { passive: true });

        // Double click handler for desktop
        messagesDiv.addEventListener('dblclick', (e) => {
            const messageBubble = e.target.closest('.sent-message, .received-message, .message-bubble-media, .file-document-bubble');
            if (!messageBubble) return;
            const messageWrapper = messageBubble.closest('.message');
            if (!messageWrapper || !messageWrapper.id) return;
            const messageData = extractMessageData(messageWrapper);
            if (messageData) {
                setReplyContext(messageData);
            }
        });

        // Mouse Drag to Reply (for Desktop users)
        let mouseStartX = 0;
        let isMouseDownOnBubble = false;
        let mouseSwipeBubble = null;
        let mouseSwipeWrapper = null;
        let mouseSwipeRow = null;
        let mouseSwipeIcon = null;
        let isMouseDragging = false;

        messagesDiv.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('button, a, video, audio, input, .voice-player')) return;

            const messageBubble = e.target.closest('.sent-message, .received-message, .message-bubble-media, .file-document-bubble');
            if (!messageBubble) return;
            const messageWrapper = messageBubble.closest('.message');
            if (!messageWrapper || !messageWrapper.id) return;

            mouseStartX = e.clientX;
            isMouseDownOnBubble = true;
            isMouseDragging = false;
            mouseSwipeBubble = messageBubble;
            mouseSwipeWrapper = messageWrapper;
            mouseSwipeRow = messageBubble.closest('.message-row');
        });

        window.addEventListener('mousemove', (e) => {
            if (!isMouseDownOnBubble || !mouseSwipeBubble) return;
            const deltaX = e.clientX - mouseStartX;
            if (deltaX > 10) {
                isMouseDragging = true;
                const moveX = Math.min(deltaX * 0.65, 68);
                mouseSwipeBubble.style.transition = 'none';
                mouseSwipeBubble.style.transform = `translateX(${moveX}px)`;

                if (!mouseSwipeIcon && mouseSwipeRow) {
                    mouseSwipeIcon = mouseSwipeRow.querySelector('.swipe-reply-icon');
                    if (!mouseSwipeIcon) {
                        mouseSwipeIcon = document.createElement('div');
                        mouseSwipeIcon.className = 'swipe-reply-icon';
                        mouseSwipeIcon.innerHTML = '<i class="fas fa-reply text-xs"></i>';
                        mouseSwipeRow.prepend(mouseSwipeIcon);
                    }
                }

                if (mouseSwipeIcon) {
                    mouseSwipeIcon.classList.add('visible');
                    if (moveX >= 42) {
                        mouseSwipeIcon.classList.add('threshold-ready');
                    } else {
                        mouseSwipeIcon.classList.remove('threshold-ready');
                    }
                }
            }
        });

        window.addEventListener('mouseup', () => {
            if (isMouseDownOnBubble && mouseSwipeBubble) {
                if (isMouseDragging && mouseSwipeWrapper) {
                    const isReady = mouseSwipeIcon && mouseSwipeIcon.classList.contains('threshold-ready');
                    if (isReady) {
                        const messageData = extractMessageData(mouseSwipeWrapper);
                        if (messageData) {
                            setReplyContext(messageData);
                        }
                    }
                }
                resetSwipeVisuals(mouseSwipeBubble, mouseSwipeIcon);
            }
            isMouseDownOnBubble = false;
            isMouseDragging = false;
            mouseSwipeBubble = null;
            mouseSwipeWrapper = null;
            mouseSwipeRow = null;
            mouseSwipeIcon = null;
        });
    }

    // Extract message data from DOM element without leaking timestamps into reply description
    function extractMessageData(messageWrapper) {
        if (!messageWrapper) return null;
        const messageId = messageWrapper.id;
        
        let sender = username;
        const senderEl = messageWrapper.querySelector('.msg-sender');
        const seenStatus = messageWrapper.querySelector('.seen-status');
        if (senderEl && senderEl.textContent.trim()) {
            sender = senderEl.textContent.trim();
        } else if (seenStatus && seenStatus.getAttribute('data-msg-user')) {
            sender = seenStatus.getAttribute('data-msg-user');
        } else if (messageWrapper.querySelector('.sent-message')) {
            sender = username;
        }

        const messageBubble = messageWrapper.querySelector('.sent-message, .received-message, .message-bubble-media, .file-document-bubble, .sticker-bubble');
        if (!messageBubble) return null;

        let message = { type: 'text', content: '' };

        if (messageBubble.querySelector('.sticker-message')) {
            message = { type: 'sticker', content: '' };
        } else if (messageBubble.querySelector('video')) {
            message = { type: 'video', content: '' };
        } else if (messageBubble.querySelector('audio') || messageBubble.querySelector('.voice-player')) {
            message = { type: 'audio', content: '' };
        } else if (messageBubble.querySelector('.message-file-preview')) {
            const img = messageBubble.querySelector('img');
            message = { type: (img && img.src?.includes('.gif')) ? 'gif' : 'image', content: '' };
        } else if (messageBubble.querySelector('.file-card-content')) {
            const fileName = messageBubble.querySelector('.file-title')?.textContent?.trim() || 'Document';
            message = { type: 'file', content: fileName };
        } else {
            // Text message: isolate text content from timestamp .msg-time
            const msgText = messageBubble.querySelector('.msg-text');
            if (msgText) {
                message.content = msgText.textContent.trim();
            } else {
                const clone = messageBubble.cloneNode(true);
                clone.querySelectorAll('.msg-time, .msg-sender, .quoted-reply, .seen-status, .swipe-reply-icon, .file-action-btn')
                     .forEach(el => el.remove());
                message.content = clone.textContent.trim();
            }
        }

        return {
            id: messageId,
            username: sender,
            message: message
        };
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
        if (data && typeof data === "object") {
            roomInstanceId = data.roomInstanceId;
            sessionToken = data.sessionToken;
            memberId = data.memberId;
            roomExpiresAt = data.expiresAt;
            if (data.roomKey) roomKey = data.roomKey;
        }
        window.currentRoomKey = roomKey;
        window.currentRoomInstanceId = roomInstanceId;
        updateExitButton();
        if (killRoomBtn) killRoomBtn.classList.add("hidden");
        saveSession();
        showChatScreen();
        displaySystemMessage("You created the room and are now the admin.");
    });

    socket.on("join-approved", (data) => {
        clearMessages();
        lastMessageUser = null;
        if (data && typeof data === "object") {
            if (data.roomInstanceId) roomInstanceId = data.roomInstanceId;
            if (data.sessionToken) sessionToken = data.sessionToken;
            if (data.memberId) memberId = data.memberId;
            if (data.expiresAt) roomExpiresAt = data.expiresAt;
            if (data.roomKey) roomKey = data.roomKey;
            if (data.username) username = data.username;
        }
        window.currentRoomKey = roomKey;
        window.currentRoomInstanceId = roomInstanceId;

        const inviteJoinStatus = document.getElementById("inviteJoinStatus");
        const panelJoinInvite = document.getElementById("panelJoinInvite");
        const panelChatRoom = document.getElementById("panelChatRoom");
        if (inviteJoinStatus) inviteJoinStatus.classList.add("hidden");
        if (panelJoinInvite) panelJoinInvite.classList.add("hidden");
        if (panelChatRoom) panelChatRoom.classList.remove("hidden");

        const messages = data.messages || [];
        messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        messages.forEach(msg => {
            renderMessageBubble(msg);
        });

        updateExitButton();
        saveSession();
        showChatScreen();
        displaySystemMessage("Your request was approved. Welcome to the room!");
    });

    socket.on("resume-session-response", (res) => {
        hideReconnectSplash();
        if (res && res.valid) {
            roomKey = res.roomKey;
            roomInstanceId = res.roomInstanceId;
            sessionToken = res.sessionToken;
            memberId = res.memberId;
            username = res.username;
            isAdmin = !!res.isAdmin;
            roomExpiresAt = res.expiresAt;
            window.currentRoomKey = roomKey;
            window.currentRoomInstanceId = roomInstanceId;

            saveSession();
            updateExitButton();

            if (joinScreen) joinScreen.style.display = "none";
            if (chatScreen) chatScreen.style.display = "flex";
            if (fileRoomScreen) fileRoomScreen.style.display = "none";

            clearMessages();
            if (res.messages && Array.isArray(res.messages)) {
                res.messages.forEach(msg => {
                    renderMessageBubble(msg);
                });
            }

            if (res.members && Array.isArray(res.members)) {
                updateUserList(res.members);
            }
            scrollMessagesToBottom(true);
        } else {
            clearSession();
            if (joinScreen) joinScreen.style.display = "flex";
            if (chatScreen) chatScreen.style.display = "none";
            if (fileRoomScreen) fileRoomScreen.style.display = "none";
            showSessionNotice("Your last room has ended or expired.");
        }
    });

    socket.on("room-ended", (data) => {
        const reason = (typeof data === "object" ? data.reason : data) || "ended";
        clearSession();
        performLeaveRoom(false);
        const noticeMsg = reason === "expired" ? "Your room has expired due to inactivity." : "This room was ended by the admin.";
        showSessionNotice(noticeMsg);
    });

    socket.on("rate-limited", (data) => {
        const msg = (typeof data === "object" ? data.message : data) || "You're sending too fast";
        showToast(msg);
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

    // Handle room closed due to inactivity using in-UI modal
    socket.on("room-inactive", (message) => {
        clearSession();
        performLeaveRoom(false);
        showSessionNotice("Room has been closed due to inactivity.");
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
        clearSession();
        performLeaveRoom(false);
        showSessionNotice("This room was ended by the admin.");
    });

    function resetInviteState() {
        const inviteJoinStatus = document.getElementById("inviteJoinStatus");
        const askJoinRoomBtn = document.getElementById("askJoinRoomBtn");
        if (inviteJoinStatus) inviteJoinStatus.classList.add("hidden");
        if (askJoinRoomBtn) {
            askJoinRoomBtn.disabled = false;
            askJoinRoomBtn.classList.remove("opacity-50", "pointer-events-none");
        }
    }

    socket.on("room-exists", (m) => appAlert(m, "Room Exists"));

    socket.on("room-not-found", async (m) => {
        resetInviteState();
        const action = await appConfirm(m || "Room not found or host is offline. Would you like to create a new room instead?", {
            title: "Room Not Found",
            okText: "Create new room",
            cancelText: "Try another key"
        });
        const panelJoinInvite = document.getElementById("panelJoinInvite");
        const panelChatRoom = document.getElementById("panelChatRoom");
        if (panelJoinInvite) panelJoinInvite.classList.add("hidden");
        if (panelChatRoom) panelChatRoom.classList.remove("hidden");
        if (action && roomKeyInput) {
            setTimeout(() => createRoomBtn?.focus?.(), 200);
        } else if (roomKeyInput) {
            roomKeyInput.value = "";
            setTimeout(() => roomKeyInput.focus(), 200);
        }
    });

    socket.on("admin-offline", async (m) => {
        resetInviteState();
        await appAlert(m || "The room host is currently offline. Please ask them to open Anon Chat or try again later.", "Host Offline");
    });

    socket.on("join-request-sent", (m) => {
        const inviteJoinStatus = document.getElementById("inviteJoinStatus");
        if (!inviteJoinStatus || inviteJoinStatus.classList.contains("hidden")) {
            appAlert(m, "Join Request");
        }
    });

    socket.on("join-denied", async (m) => {
        resetInviteState();
        await appAlert(m || "The room host denied your request to join.", "Access Denied");
        const panelJoinInvite = document.getElementById("panelJoinInvite");
        const panelChatRoom = document.getElementById("panelChatRoom");
        if (panelJoinInvite) panelJoinInvite.classList.add("hidden");
        if (panelChatRoom) panelChatRoom.classList.remove("hidden");
    });

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
            xhr.open("POST", `${API_BASE}/api/file-rooms/create-and-upload`, true);

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
            xhr.open("POST", `${API_BASE}/api/file-rooms/${activeFileRoom.roomId}/upload`, true);

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
                dlBtn.href = `${API_BASE}/api/file-rooms/${activeFileRoom.roomId}/files/${file.id}/download`;
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

                fetch(`${API_BASE}/api/file-rooms/${activeFileRoom.roomId}/files/${fileId}`, {
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

            fetch(`${API_BASE}/api/file-rooms/${encodeURIComponent(identifier.trim())}`)
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
                const key = landingTileKeyInput.value.trim();
                if (!key) {
                    showToast("Please enter a room key or ID.");
                    return;
                }
                withBusy(landingTileOpenKeyBtn, async () => {
                    await openFileRoomByIdentifier(key);
                }, { serverWakeupNotice: true, connectingText: "Opening…" });
            });
            landingTileKeyInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    landingTileOpenKeyBtn.click();
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

                const roomUrl = `${PUBLIC_WEB_URL}/share/${activeFileRoom.roomId}`;
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
                const roomUrl = `${PUBLIC_WEB_URL}/share/${activeFileRoom.roomId}`;
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
                fetch(`${API_BASE}/api/file-rooms/${activeFileRoom.roomId}`)
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
                    fetch(`${API_BASE}/api/file-rooms/${roomId}`, {
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

            if (searchParams.has("room")) {
                const roomCode = searchParams.get("room").trim();
                if (roomCode) {
                    handleRoomParamPrefill(roomCode);
                }
            }

            let savedSession = null;
            try {
                const raw = localStorage.getItem("anon_session");
                if (raw) savedSession = JSON.parse(raw);
            } catch (e) {}

            if (savedSession && (pathname === "/" || pathname === "")) {
                restoreSession();
                return;
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

        function handleRoomParamPrefill(code) {
            if (!code) return;
            const cleanCode = code.trim();
            const panelChatRoom = document.getElementById("panelChatRoom");
            const panelJoinInvite = document.getElementById("panelJoinInvite");
            const inviteRoomKeyDisplay = document.getElementById("inviteRoomKeyDisplay");
            const inviteUsername = document.getElementById("inviteUsername");
            const inviteJoinStatus = document.getElementById("inviteJoinStatus");
            const askJoinRoomBtn = document.getElementById("askJoinRoomBtn");

            if (panelJoinInvite && inviteRoomKeyDisplay) {
                inviteRoomKeyDisplay.textContent = cleanCode;
                if (panelChatRoom) panelChatRoom.classList.add("hidden");
                panelJoinInvite.classList.remove("hidden");
                if (inviteJoinStatus) inviteJoinStatus.classList.add("hidden");
                if (askJoinRoomBtn) {
                    askJoinRoomBtn.disabled = false;
                    askJoinRoomBtn.classList.remove("opacity-50", "pointer-events-none");
                }

                // Prefill saved username if available
                const savedUser = localStorage.getItem("username") || (usernameInput ? usernameInput.value : "");
                if (inviteUsername) {
                    if (savedUser) inviteUsername.value = savedUser;
                    setTimeout(() => inviteUsername.focus(), 250);
                }
            } else if (roomKeyInput) {
                roomKeyInput.value = cleanCode;
                if (usernameInput) {
                    setTimeout(() => usernameInput.focus(), 250);
                }
            }
        }

        if (window.Capacitor?.Plugins?.App) {
            window.Capacitor.Plugins.App.addListener('appUrlOpen', (data) => {
                if (data && data.url) {
                    try {
                        const parsed = new URL(data.url);
                        if (parsed.searchParams.has('room')) {
                            handleRoomParamPrefill(parsed.searchParams.get('room'));
                        }
                    } catch (e) {
                        console.warn('appUrlOpen error:', e);
                    }
                }
            });
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

    // ============================================================
    // CAPACITOR NATIVE & COLD-START HANDLING
    // ============================================================

    // 1. Socket Reconnecting UI indicator
    const socketReconnectBanner = document.getElementById("socketReconnectingBanner");
    socket.on("disconnect", (reason) => {
        console.warn("Socket disconnected:", reason);
        if (socketReconnectBanner) socketReconnectBanner.classList.remove("hidden");
        try { if (socket.sendBuffer) socket.sendBuffer.length = 0; } catch (e) {}
    });
    socket.on("connect", () => {
        console.log("Socket connected:", socket.id);
        if (socketReconnectBanner) socketReconnectBanner.classList.add("hidden");

        const raw = localStorage.getItem("anon_session");
        if (raw) {
            try {
                const s = JSON.parse(raw);
                if (s && s.kind === "chat" && s.roomInstanceId && s.sessionToken) {
                    socket.emit("resume-session", {
                        roomInstanceId: s.roomInstanceId,
                        sessionToken: s.sessionToken
                    });
                }
            } catch (e) {}
        }
    });

    // 2. Cold-start backend health check
    function initServerHealthCheck() {
        const statusEl = document.getElementById("serverConnectionStatus");
        const startHealthCheckTime = Date.now();
        let isConnected = false;

        // Initially disable Create and Join buttons until backend is verified
        if (createRoomBtn) createRoomBtn.disabled = true;
        if (joinRoomBtn) joinRoomBtn.disabled = true;
        if (statusEl) {
            statusEl.classList.remove("hidden");
            statusEl.className = "mt-3 text-center text-xs font-medium py-1.5 px-3 rounded-md transition-all duration-200 bg-[#ff7320]/15 text-[#ff7320]";
            statusEl.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-1.5"></i>Connecting to server…';
        }

        async function checkHealth() {
            if (isConnected) return;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);
                const res = await fetch(`${API_BASE}/health`, { signal: controller.signal, cache: 'no-store' });
                clearTimeout(timeoutId);
                if (res.ok) {
                    isConnected = true;
                    if (createRoomBtn) createRoomBtn.disabled = false;
                    if (joinRoomBtn) joinRoomBtn.disabled = false;
                    if (statusEl) {
                        statusEl.className = "mt-3 text-center text-xs font-medium py-1.5 px-3 rounded-md transition-all duration-200 bg-emerald-500/15 text-emerald-400";
                        statusEl.innerHTML = '<i class="fas fa-check mr-1.5"></i>Connected to server';
                        setTimeout(() => {
                            statusEl.classList.add("hidden");
                        }, 1500);
                    }
                    return;
                }
            } catch (e) {
                // Backend cold-starting or not reachable yet
            }

            const elapsed = Date.now() - startHealthCheckTime;
            if (elapsed >= 90000) {
                if (statusEl) {
                    statusEl.className = "mt-3 text-center text-xs font-medium py-1.5 px-3 rounded-md transition-all duration-200 bg-red-500/15 text-red-400";
                    statusEl.innerHTML = '<i class="fas fa-triangle-exclamation mr-1.5"></i>Unable to connect to server. Please check your network connection.';
                }
            } else {
                setTimeout(checkHealth, 3000);
            }
        }

        checkHealth();
    }

    initServerHealthCheck();

    // 3. Android Native Hardware Back Button & Keyboard Tracking
    let isNativeKeyboardOpen = false;
    if (window.Capacitor?.isNativePlatform?.()) {
        const Keyboard = window.Capacitor.Plugins?.Keyboard;
        if (Keyboard) {
            Keyboard.addListener('keyboardDidShow', () => {
                isNativeKeyboardOpen = true;
                scrollMessagesToBottom(true);
            });
            Keyboard.addListener('keyboardDidHide', () => {
                isNativeKeyboardOpen = false;
                scrollMessagesToBottom(true);
            });
        }

        const App = window.Capacitor.Plugins?.App;
        if (App) {
            App.addListener('backButton', () => {
                // 1. Close app dialog modal if open
                const appDialogModal = document.getElementById("appDialogModal");
                if (appDialogModal && !appDialogModal.classList.contains("hidden")) {
                    closeAppDialog(false);
                    return;
                }
                // 2. Close media picker panel if open
                if (mediaPicker && !mediaPicker.classList.contains("hidden")) {
                    mediaPicker.classList.add("hidden");
                    scrollMessagesToBottom(true);
                    return;
                }
                // 3. Close keyboard if open
                if (isNativeKeyboardOpen || document.activeElement === messageInput) {
                    messageInput.blur();
                    if (Keyboard) {
                        Keyboard.hide();
                    }
                    isNativeKeyboardOpen = false;
                    return;
                }
                // 4. Close preview modal if open
                if (previewModal && !previewModal.classList.contains("hidden")) {
                    closePreview?.click?.();
                    return;
                }
                // 4.5 Close snap review or recording overlay if open
                if (typeof snapReviewOverlay !== 'undefined' && snapReviewOverlay && !snapReviewOverlay.classList.contains("hidden")) {
                    closeSnapReviewOverlay();
                    return;
                }
                if (typeof snapRecordingOverlay !== 'undefined' && snapRecordingOverlay && !snapRecordingOverlay.classList.contains("hidden")) {
                    cancelSnapRecording('Cancelled');
                    return;
                }
                // 5. Close user sidebar if open
                if (mobileUserSidebar && !mobileUserSidebar.classList.contains("translate-x-full")) {
                    closeMobileSidebar?.click?.();
                    return;
                }
                // 6. Close warning modals
                if (leaveChatModal && !leaveChatModal.classList.contains("hidden")) {
                    cancelLeaveBtn?.click?.();
                    return;
                }
                if (endRoomModal && !endRoomModal.classList.contains("hidden")) {
                    cancelEndRoomBtn?.click?.();
                    return;
                }
                if (cancelUploadModal && !cancelUploadModal.classList.contains("hidden")) {
                    denyCancelBtn?.click?.();
                    return;
                }
                // 7. If in chat room, trigger leave
                if (chatScreen && chatScreen.style.display !== "none" && chatScreen.style.display !== "") {
                    leaveBtn?.click?.();
                    return;
                }
                // 8. If in file room, trigger leave
                if (fileRoomScreen && fileRoomScreen.style.display !== "none" && fileRoomScreen.style.display !== "") {
                    const fileLeaveBtn = document.getElementById("fileLeaveRoomBtn") || document.getElementById("leaveFileBtn") || document.getElementById("fileRoomHomeBtn");
                    if (fileLeaveBtn) {
                        fileLeaveBtn.click();
                        return;
                    }
                }
                // 9. If on join screen, exit native app
                App.exitApp();
            });
        }
    }

    // 4. Service Worker (skip in native Capacitor environment)
    if ('serviceWorker' in navigator && !window.Capacitor?.isNativePlatform?.()) {
        // Web PWA service worker registration preserved for web browsers
    }

    // 5. Session Revalidation on lifecycle events (Phase 2)
    function revalidateCurrentSession() {
        const raw = localStorage.getItem("anon_session");
        if (!raw) return;
        try {
            const s = JSON.parse(raw);
            if (s && s.kind === "chat" && s.roomInstanceId && s.sessionToken) {
                if (socket && socket.connected) {
                    socket.emit("resume-session", {
                        roomInstanceId: s.roomInstanceId,
                        sessionToken: s.sessionToken
                    });
                }
            } else if (s && s.kind === "vault" && s.identifier) {
                fetch(`${API_BASE}/api/file-rooms/${encodeURIComponent(s.identifier)}`)
                    .then(res => {
                        if (res.status === 404 || res.status === 410) {
                            clearSession();
                            leaveFileRoom(false);
                            showSessionNotice("That vault has expired or was deleted.");
                        }
                    })
                    .catch(() => {});
            }
        } catch (e) {}
    }

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            revalidateCurrentSession();
        }
    });

    window.addEventListener("pageshow", () => {
        revalidateCurrentSession();
    });

    window.addEventListener("online", () => {
        revalidateCurrentSession();
    });

    if (window.Capacitor?.Plugins?.App) {
        window.Capacitor.Plugins.App.addListener('appStateChange', (state) => {
            if (state && state.isActive) {
                revalidateCurrentSession();
            }
        });
    }

    // 6. Dev-only Eruda in-app console (toggled by 5 taps on logo, Rule 6)
    let erudaTapCount = 0;
    let erudaTapTimer = null;
    let erudaLoaded = false;

    function handleLogoTap() {
        erudaTapCount++;
        if (erudaTapTimer) clearTimeout(erudaTapTimer);
        erudaTapTimer = setTimeout(() => {
            erudaTapCount = 0;
        }, 2500);

        if (erudaTapCount >= 5) {
            erudaTapCount = 0;
            if (erudaLoaded && window.eruda) {
                if (window.eruda._isInit) {
                    window.eruda.show();
                    showToast("Developer console opened");
                }
            } else {
                showToast("Loading developer console…");
                const script = document.createElement("script");
                script.src = "/eruda.js";
                script.onload = () => {
                    if (window.eruda) {
                        window.eruda.init();
                        window.eruda.show();
                        erudaLoaded = true;
                        showToast("Developer console enabled");
                    }
                };
                script.onerror = () => {
                    showToast("Failed to load developer console");
                };
                document.head.appendChild(script);
            }
        }
    }

    document.querySelectorAll(".header-logo, .landing-logo-img, .landing-logo-header").forEach(el => {
        el.addEventListener("click", handleLogoTap);
    });
});