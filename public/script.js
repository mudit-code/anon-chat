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
        Object.defineProperty(messageInput, 'value', {
            get() {
                return (this.innerText || this.textContent || '').replace(/\r\n/g, '\n');
            },
            set(val) {
                if (!val) {
                    this.innerHTML = '';
                } else {
                    this.innerText = val;
                }
                try { this.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
            },
            configurable: true
        });
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

    // Room Share elements & handler (Phase 12: header share removed, people panel only)
    const shareRoomBtn = document.getElementById("shareRoomBtn");
    const shareRoomCardBtn = document.getElementById("shareRoomCardBtn");
    const mobileShareRoomBtn = document.getElementById("mobileShareRoomBtn");

    async function shareRoomLink() {
        if (!roomKey) return;
        const PUBLIC_WEB_URL = (window.location.origin && window.location.origin.startsWith('http'))
            ? window.location.origin
            : 'https://anon-chat-jtef.onrender.com';
        const shareUrl = `${PUBLIC_WEB_URL}/#join=${encodeURIComponent(roomKey)}`;
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
                withBusy(btn, async () => {
                    await shareRoomLink();
                });
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
    let roomKey = null, username = null, isAdmin = false, pendingInviteKey = null;
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
    let shouldKeepKeyboardOpen = false;
    let isUniversalBackDismissal = false;

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
    let isMediaDragging = false;

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
    // ======== PHASE B: WHATSAPP-STYLE MEDIA STREAMING, PROGRESS, AND ETA ========
    const activeUploads = new Map(); // clientMsgId -> { xhr, mediaItem, roomInstanceId, confirmTimeout }
    const incomingMediaTrackers = new Map(); // clientMsgId -> { wrapper, estimator, expireTimer }
    const activeDownloads = new Map(); // url -> { xhr }

    function createSpeedEstimator() {
        let startTime = null;
        const samples = [];

        return {
            update(loaded, total) {
                const now = Date.now();
                if (!startTime) startTime = now;
                samples.push({ time: now, loaded });
                while (samples.length > 1 && now - samples[0].time > 3500) {
                    samples.shift();
                }

                const elapsedSec = (now - startTime) / 1000;
                if (elapsedSec < 1 || samples.length < 2) {
                    return null; // Hidden until >= 1s of data
                }

                const oldest = samples[0];
                const byteDiff = loaded - oldest.loaded;
                const timeDiff = (now - oldest.time) / 1000;
                if (timeDiff <= 0 || byteDiff <= 0) return null;

                const speed = byteDiff / timeDiff; // bytes/sec
                const remainingBytes = Math.max(0, total - loaded);
                const remainingSec = remainingBytes / speed;

                if (remainingSec < 10) {
                    return '<1 min left';
                } else if (remainingSec < 60) {
                    return `${Math.round(remainingSec)} s left`;
                } else {
                    const mins = Math.max(1, Math.round(remainingSec / 60));
                    return `${mins} min left`;
                }
            }
        };
    }

    function getResolvedMime(file) {
        if (file && file.type && file.type !== 'application/octet-stream') return file.type;
        const name = (file && file.name) ? file.name.toLowerCase() : '';
        if (/\.(jpe?g|png|gif|webp|bmp|heic|heif|svg)$/i.test(name)) {
            if (name.endsWith('.png')) return 'image/png';
            if (name.endsWith('.gif')) return 'image/gif';
            if (name.endsWith('.webp')) return 'image/webp';
            return 'image/jpeg';
        }
        if (/\.(mp4|mov|webm|m4v|3gp|mkv|avi)$/i.test(name)) {
            if (name.endsWith('.webm')) return 'video/webm';
            if (name.endsWith('.mov')) return 'video/quicktime';
            return 'video/mp4';
        }
        if (/\.(mp3|wav|ogg|m4a|aac|opus)$/i.test(name)) {
            return 'audio/webm';
        }
        return (file && file.type) || 'application/octet-stream';
    }

    function createPendingMediaBubble({ file, objectUrl, clientMsgId, isSticker, roomInstanceId, onCancel, onRetry, onDelete }) {
        const mime = getResolvedMime(file);
        const isStickerMsg = isSticker || (file && file.isSticker) || false;
        const isVideo = !isStickerMsg && mime.startsWith('video');
        const isImage = !isStickerMsg && mime.startsWith('image');
        const isAudio = !isStickerMsg && mime.startsWith('audio');

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
            messageRow.className = "flex flex-row items-center w-full justify-end message-row relative group";

            const messageBubble = document.createElement("div");
            if (isStickerMsg) {
                messageBubble.className = "sticker-bubble message-bubble pending-bubble relative overflow-visible border-none bg-transparent p-0 ml-auto";
            } else if (isImage || isVideo) {
                messageBubble.className = "sent-message message-bubble message-bubble-media pending-bubble relative overflow-hidden border border-[#ff7320]/30 ml-auto";
            } else if (isAudio) {
                messageBubble.className = "sent-message message-bubble voice-message-bubble pending-bubble relative overflow-hidden border border-[#ff7320]/30 ml-auto";
                messageBubble.style.minWidth = "220px";
            } else {
                messageBubble.className = "sent-message message-bubble file-document-bubble pending-bubble relative overflow-hidden border border-[#ff7320]/30 ml-auto";
                messageBubble.style.minWidth = "200px";
            }

            let mediaPreviewHtml = '';
            if (isStickerMsg) {
                mediaPreviewHtml = `
                    <div class="relative inline-block cursor-pointer">
                        <img src="${objectUrl}" class="sticker-message opacity-85 transition-opacity duration-200" alt="Sending sticker...">
                        <!-- Centered Circular Progress Ring with X (Cancel) -->
                        <div class="pending-overlay absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-200">
                            <div class="pending-progress-ring relative w-10 h-10 flex items-center justify-center pointer-events-auto">
                                <svg class="w-10 h-10 transform -rotate-90" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="15" fill="none" class="stroke-black/50" stroke-width="3"></circle>
                                    <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#ff7320] pending-progress-circle transition-all duration-150" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" stroke-linecap="round"></circle>
                                </svg>
                                <button type="button" class="pending-cancel-btn absolute inset-0 flex items-center justify-center text-white/90 hover:text-white transition-colors cursor-pointer" title="Cancel upload">
                                    <i class="fas fa-times text-xs"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            } else if (isImage || isVideo) {
                mediaPreviewHtml = `
                    <div class="relative media-container media-fixed-frame overflow-hidden rounded-xl bg-black/60">
                        ${isImage
                            ? `<img src="${objectUrl}" class="message-file-preview w-full h-full object-cover opacity-85 transition-opacity duration-200" alt="Photo">`
                            : `<video src="${objectUrl}" class="message-file-preview w-full h-full object-cover opacity-85 transition-opacity duration-200" muted playsinline preload="auto"></video>`
                        }
                        <!-- Centered Circular Progress Ring with X (Cancel) -->
                        <div class="pending-overlay absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-200">
                            <div class="pending-progress-ring relative w-12 h-12 flex items-center justify-center pointer-events-auto">
                                <svg class="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="15" fill="none" class="stroke-black/50" stroke-width="3"></circle>
                                    <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#ff7320] pending-progress-circle transition-all duration-150" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" stroke-linecap="round"></circle>
                                </svg>
                                <button type="button" class="pending-cancel-btn absolute inset-0 flex items-center justify-center text-white/90 hover:text-white transition-colors cursor-pointer" title="Cancel upload">
                                    <i class="fas fa-times text-sm"></i>
                                </button>
                            </div>
                        </div>
                        <!-- Small chip at bottom-left: "13% · 1 min left" -->
                        <div class="pending-eta-chip absolute bottom-2 left-2 px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-sm text-white text-[11px] font-medium tracking-tight shadow-md flex items-center gap-1">
                            <span class="pending-progress-text font-bold">0%</span>
                            <span class="pending-eta-separator hidden">·</span>
                            <span class="pending-eta-text hidden"></span>
                        </div>
                    </div>
                `;
            } else if (isAudio) {
                const formattedDuration = file?.durationMs ? formatVoiceTime(Math.round(file.durationMs / 1000)) : (file?.size ? formatBytes(file.size) : 'Voice note');
                mediaPreviewHtml = `
                    <div class="voice-card-content flex items-center p-2.5 rounded-xl bg-black/30 gap-3">
                        <div class="voice-icon-box w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full bg-[#181818] border border-[#ff7320]/40 text-[#ff7320]">
                            <i class="fas fa-microphone text-base"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="file-title font-semibold text-sm text-white truncate">Voice message</div>
                            <div class="file-subtitle text-xs text-white/85 font-mono mt-0.5">${formattedDuration}</div>
                            <div class="pending-eta-chip text-[11px] text-[#ffb682] font-medium mt-0.5 flex items-center gap-1">
                                <span class="pending-progress-text font-bold">0%</span>
                                <span class="pending-eta-separator hidden">·</span>
                                <span class="pending-eta-text hidden"></span>
                            </div>
                        </div>
                        <div class="pending-progress-ring relative w-10 h-10 flex items-center justify-center flex-shrink-0">
                            <svg class="w-10 h-10 transform -rotate-90" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="15" fill="none" class="stroke-white/15" stroke-width="3"></circle>
                                <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#ff7320] pending-progress-circle transition-all duration-150" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" stroke-linecap="round"></circle>
                            </svg>
                            <button type="button" class="pending-cancel-btn absolute inset-0 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer" title="Cancel upload">
                                <i class="fas fa-times text-xs"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                mediaPreviewHtml = `
                    <div class="file-card-content flex items-center p-2 rounded-xl bg-black/30 gap-3">
                        <div class="file-icon-box w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg bg-[#181818] border border-white/10 text-[#ffb682]">
                            ${getFileIcon({ type: mime, name: file?.name })}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="file-title font-semibold text-sm text-white truncate" title="${escapeHtml(file?.name || '')}">${escapeHtml(file?.name || 'attachment')}</div>
                            <div class="file-subtitle text-xs text-white/85 font-mono mt-0.5">${formatBytes(file?.size || 0)}</div>
                            <div class="pending-eta-chip text-[11px] text-[#ffb682] font-medium mt-0.5 flex items-center gap-1">
                                <span class="pending-progress-text font-bold">0%</span>
                                <span class="pending-eta-separator hidden">·</span>
                                <span class="pending-eta-text hidden"></span>
                            </div>
                        </div>
                        <!-- Circular progress ring with X on the right -->
                        <div class="pending-progress-ring relative w-10 h-10 flex items-center justify-center flex-shrink-0">
                            <svg class="w-10 h-10 transform -rotate-90" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="15" fill="none" class="stroke-white/15" stroke-width="3"></circle>
                                <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#ff7320] pending-progress-circle transition-all duration-150" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" stroke-linecap="round"></circle>
                            </svg>
                            <button type="button" class="pending-cancel-btn absolute inset-0 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer" title="Cancel upload">
                                <i class="fas fa-times text-xs"></i>
                            </button>
                        </div>
                    </div>
                `;
            }

            const errorActionsHtml = `
                <div class="pending-actions hidden flex items-center justify-between gap-2 mt-2 pt-1 border-t border-white/10 text-xs">
                    <span class="pending-error-label text-red-400 font-medium">Failed</span>
                    <div class="flex items-center gap-2">
                        <button type="button" class="pending-retry-btn px-2.5 py-0.5 rounded bg-[#ff7320] text-black font-semibold text-xs hover:bg-[#ff9150] transition-colors cursor-pointer">Retry</button>
                        <button type="button" class="pending-delete-btn px-2.5 py-0.5 rounded bg-white/10 text-white/80 font-medium text-xs hover:bg-white/20 transition-colors cursor-pointer">Delete</button>
                    </div>
                </div>
            `;

            messageBubble.innerHTML = mediaPreviewHtml + errorActionsHtml;
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

    function updatePendingBubbleProgress(clientMsgId, percent, etaText) {
        const wrapper = document.getElementById(`msg-${clientMsgId}`) ||
            document.querySelector(`[data-client-msg-id="${clientMsgId}"]`);
        if (!wrapper) return;
        const circle = wrapper.querySelector('.pending-progress-circle');
        const texts = wrapper.querySelectorAll('.pending-progress-text');
        const sep = wrapper.querySelector('.pending-eta-separator');
        const eta = wrapper.querySelector('.pending-eta-text');
        const chip = wrapper.querySelector('.pending-eta-chip');

        const clamped = Math.max(0, Math.min(100, Math.round(percent)));
        if (circle) {
            const offset = 94.2 - (94.2 * clamped) / 100;
            circle.style.strokeDashoffset = offset;
        }
        texts.forEach(t => {
            t.textContent = `${clamped}%`;
        });

        if (clamped >= 100) {
            if (chip) {
                chip.innerHTML = '<span class="font-bold text-[#ffb682] animate-pulse">Finalizing…</span>';
            }
        } else if (etaText && eta && sep) {
            eta.textContent = etaText;
            eta.classList.remove('hidden');
            sep.classList.remove('hidden');
        }
    }

    function setPendingBubbleFailed(clientMsgId, errorMsg) {
        const wrapper = document.getElementById(`msg-${clientMsgId}`);
        if (!wrapper) return;
        wrapper.classList.add('pending-failed');
        const bubble = wrapper.querySelector('.pending-bubble');
        if (bubble) {
            if (!bubble.classList.contains('sticker-bubble')) {
                bubble.classList.remove('border-[#ff7320]/30');
                bubble.classList.add('border-red-500/60', 'bg-red-950/20');
            } else {
                bubble.style.background = 'transparent';
                bubble.style.border = 'none';
                bubble.style.boxShadow = 'none';
            }
        }
        const errorLabel = wrapper.querySelector('.pending-error-label');
        if (errorLabel) {
            errorLabel.textContent = errorMsg || 'Failed to send';
        }
        const actions = wrapper.querySelector('.pending-actions');
        if (actions) actions.classList.remove('hidden');

        const ring = wrapper.querySelector('.pending-progress-ring');
        if (ring) ring.classList.add('hidden');

        const chip = wrapper.querySelector('.pending-eta-chip');
        if (chip) chip.classList.add('hidden');
    }

    function setPendingBubbleRetrying(clientMsgId) {
        const wrapper = document.getElementById(`msg-${clientMsgId}`);
        if (!wrapper) return;
        wrapper.classList.remove('pending-failed');
        const bubble = wrapper.querySelector('.pending-bubble');
        if (bubble && !bubble.classList.contains('sticker-bubble')) {
            bubble.classList.remove('border-red-500/60', 'bg-red-950/20');
            bubble.classList.add('border-[#ff7320]/30');
        }
        const actions = wrapper.querySelector('.pending-actions');
        if (actions) actions.classList.add('hidden');

        const ring = wrapper.querySelector('.pending-progress-ring');
        if (ring) ring.classList.remove('hidden');

        const chip = wrapper.querySelector('.pending-eta-chip');
        if (chip) {
            chip.classList.remove('hidden');
            chip.innerHTML = `
                <span class="pending-progress-text font-bold">0%</span>
                <span class="pending-eta-separator hidden">·</span>
                <span class="pending-eta-text hidden"></span>
            `;
        }

        updatePendingBubbleProgress(clientMsgId, 0);
    }

    function removePendingBubble(clientMsgId) {
        const wrapper = document.getElementById(`msg-${clientMsgId}`);
        if (wrapper) {
            wrapper.remove();
        }
    }
    function finalizePendingMediaBubble(clientMsgId, messagePayload) {
        const domId = String(clientMsgId).startsWith('msg-') ? String(clientMsgId) : `msg-${clientMsgId}`;
        const wrapper = document.getElementById(domId) ||
            document.querySelector(`[data-client-msg-id="${clientMsgId}"]`) ||
            document.getElementById(clientMsgId);

        if (!wrapper) {
            renderMessageBubble(messagePayload);
            return;
        }

        const msgData = messagePayload.message || {};
        const mediaSrc = resolveMediaUrl(msgData.content);
        const mType = msgData.type || 'image';

        wrapper.classList.remove('pending-message');
        wrapper.removeAttribute('data-pending');
        wrapper.setAttribute('data-msg-id', clientMsgId);

        const bubble = wrapper.querySelector('.message-bubble');
        if (bubble) {
            bubble.classList.remove('pending-bubble', 'border-[#ff7320]/30');
            const overlay = bubble.querySelector('.pending-overlay');
            if (overlay) overlay.remove();
            const etaChip = bubble.querySelector('.pending-eta-chip');
            if (etaChip) etaChip.remove();
            const ring = bubble.querySelector('.pending-progress-ring');
            if (ring) ring.remove();
            const actions = bubble.querySelector('.pending-actions');
            if (actions) actions.remove();

            if (mType === 'audio') {
                bubble.innerHTML = createVoicePlayerHtml(mediaSrc, msgData.durationMs || 0, true) + `<span class="msg-time select-none ml-1.5 self-end text-[11px]">${formatTime(new Date())}</span>`;
                const playerEl = bubble.querySelector('.voice-player');
                if (playerEl) {
                    setupVoicePlayer(playerEl, msgData.durationMs || 0);
                }
            } else if (mType === 'file') {
                const fileName = msgData.name || messagePayload.file?.name || 'Document';
                const fileSize = msgData.size || messagePayload.file?.size || 0;
                const fileMime = msgData.mimeType || messagePayload.file?.type || '';
                const truncatedName = fileName.length > 20 ? fileName.substring(0, 15) + "..." + fileName.substring(fileName.length - 5) : fileName;
                const friendlyType = getFriendlyFileType(fileMime, fileName);
                const fullFileInfo = `${fileName} (${formatBytes(fileSize)})`;

                bubble.innerHTML = `
                    <div class="file-card-content flex items-center p-1" title="${escapeHtml(fullFileInfo)}">
                        <div class="file-icon-box w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg mr-3 bg-[#181818] border border-white/10 text-[#ffb682]">
                            ${getFileIcon({ type: fileMime, name: fileName })}
                        </div>
                        <div class="overflow-hidden flex-1">
                            <div class="file-title font-semibold text-sm truncate text-white" title="${escapeHtml(fileName)}">${escapeHtml(truncatedName)}</div>
                            <div class="file-subtitle text-xs mt-0.5 text-white/85 font-mono">${formatBytes(fileSize)} • ${friendlyType}</div>
                        </div>
                    </div>
                    <div class="file-footer-row flex items-center justify-between gap-2 mt-1.5 pt-0.5">
                        <div class="file-actions-container flex gap-2 flex-1">
                            <button type="button" class="file-action-btn file-btn-open flex-1 text-center py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer" data-url="${mediaSrc}" data-name="${escapeHtml(fileName)}">
                                <i class="fas fa-external-link-alt mr-1.5"></i>Open
                            </button>
                            <button type="button" class="file-action-btn file-btn-save flex-1 text-center py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer" data-url="${mediaSrc}" data-name="${escapeHtml(fileName)}">
                                <i class="fas fa-download mr-1.5"></i>Save
                            </button>
                        </div>
                        <span class="msg-time self-end text-[11px] mb-0.5">${formatTime(new Date())}</span>
                    </div>
                `;
                const actionsBox = bubble.querySelector('.file-actions-container');
                if (actionsBox) bindDownloadButtons(actionsBox);
            } else {
                const mediaEl = bubble.querySelector('img.message-file-preview, video.message-file-preview, img.sticker-message');
                if (mediaEl) {
                    mediaEl.classList.remove('opacity-75', 'opacity-85', 'blur-[0.5px]');
                    mediaEl.style.opacity = '1';
                    mediaEl.style.filter = 'none';
                }

                const mediaContainer = bubble.querySelector('.media-container, .relative');
                if (mediaContainer) {
                    mediaContainer.onclick = () => openPreview(mediaSrc, mType, clientMsgId);

                    // Add play overlay if video
                    if (mType === 'video' && !mediaContainer.querySelector('.video-play-overlay')) {
                        const playOverlay = document.createElement('div');
                        playOverlay.className = 'video-play-overlay absolute inset-0 flex items-center justify-center pointer-events-none';
                        playOverlay.innerHTML = '<div class="w-12 h-12 rounded-full bg-black/60 border border-white/20 flex items-center justify-center shadow-lg text-white"><i class="fas fa-play text-base ml-0.5"></i></div>';
                        mediaContainer.appendChild(playOverlay);
                    }

                    // Add download button if image or video
                    if ((mType === 'image' || mType === 'video') && !mediaContainer.querySelector('.media-download-btn')) {
                        const dlBtn = document.createElement('a');
                        dlBtn.href = mediaSrc;
                        dlBtn.download = `${mType}-${Date.now()}.${mType === 'video' ? 'mp4' : 'jpg'}`;
                        dlBtn.className = 'media-download-btn absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity';
                        dlBtn.title = 'Download';
                        dlBtn.onclick = (e) => e.stopPropagation();
                        dlBtn.innerHTML = '<i class="fas fa-download text-xs"></i>';
                        mediaContainer.appendChild(dlBtn);
                    }
                }

                // Append time indicator
                if (!bubble.querySelector('.msg-time')) {
                    const timeEl = document.createElement('span');
                    timeEl.className = 'msg-time select-none ml-1.5 self-end text-[11px]';
                    timeEl.textContent = formatTime(new Date());
                    bubble.appendChild(timeEl);
                }
            }
        }

        hideUploadProgress();

        // Maintain structured messageDataStore
        if (!window.messageDataStore) window.messageDataStore = new Map();
        window.messageDataStore.set(clientMsgId, {
            id: clientMsgId,
            senderName: username,
            type: mType,
            snippet: mType === 'audio' ? 'Voice message' : (mType === 'video' ? 'Video' : (mType === 'sticker' ? 'Sticker' : (mType === 'file' ? (msgData.name || 'Document') : 'Photo'))),
            mediaSrc
        });
    }

    window.createPendingMediaBubble = createPendingMediaBubble;
    window.finalizePendingMediaBubble = finalizePendingMediaBubble;
    window.updatePendingBubbleProgress = updatePendingBubbleProgress;
    window.setPendingBubbleFailed = setPendingBubbleFailed;
    window.setPendingBubbleRetrying = setPendingBubbleRetrying;
    window.removePendingBubble = removePendingBubble;

    // Receiver UI: Media incoming placeholder
    function createReceiverMediaPlaceholder({ clientMsgId, username: senderName, kind, name, size, mime, width, height }) {
        let resolvedMime = mime || '';
        if ((!resolvedMime || resolvedMime === 'application/octet-stream') && name) {
            resolvedMime = getResolvedMime({ name });
        }
        const isImage = kind === 'image' || resolvedMime.startsWith('image');
        const isVideo = kind === 'video' || resolvedMime.startsWith('video');
        const isAudio = kind === 'audio' || resolvedMime.startsWith('audio');

        const domId = `msg-${clientMsgId}`;
        let wrapper = document.getElementById(domId);
        if (wrapper) return wrapper;

        wrapper = document.createElement("div");
        wrapper.id = domId;
        wrapper.setAttribute('data-msg-id', clientMsgId);
        wrapper.setAttribute('data-client-msg-id', clientMsgId);
        wrapper.setAttribute('data-incoming', 'true');
        wrapper.className = "message flex flex-col items-start new-user incoming-media-placeholder";

        const isSticker = kind === 'sticker';
        const messageRow = document.createElement("div");
        messageRow.className = "flex flex-row items-center w-full justify-start message-row relative group";

        const messageBubble = document.createElement("div");
        if (isSticker) {
            messageBubble.className = "sticker-bubble message-bubble relative overflow-visible border-none bg-transparent p-0";
        } else if (isImage || isVideo) {
            messageBubble.className = "received-message message-bubble message-bubble-media relative overflow-hidden border border-white/10";
        } else if (isAudio) {
            messageBubble.className = "received-message message-bubble voice-message-bubble relative overflow-hidden border border-white/10";
            messageBubble.style.minWidth = "220px";
        } else {
            messageBubble.className = "received-message message-bubble file-document-bubble relative overflow-hidden border border-white/10";
            messageBubble.style.minWidth = "210px";
        }

        const senderHtml = `<div class="msg-sender text-xs font-semibold mb-1" style="color: ${getSenderColor(senderName)};">~${escapeHtml(senderName)}</div>`;

        let bodyHtml = '';
        if (isSticker) {
            bodyHtml = `
                <div class="relative inline-block cursor-pointer">
                    <div class="w-[140px] h-[140px] rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <i class="fas fa-note-sticky text-3xl text-white/30"></i>
                    </div>
                    <div class="pending-overlay absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div class="pending-progress-ring relative w-10 h-10 flex items-center justify-center">
                            <svg class="w-10 h-10 transform -rotate-90" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="15" fill="none" class="stroke-black/50" stroke-width="3"></circle>
                                <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#ff7320] pending-progress-circle transition-all duration-150" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" stroke-linecap="round"></circle>
                            </svg>
                            <span class="pending-progress-text absolute font-mono text-[9px] font-bold text-white">0%</span>
                        </div>
                    </div>
                </div>
            `;
        } else if (isImage || isVideo) {
            bodyHtml = `
                <div class="relative media-fixed-frame overflow-hidden rounded-xl bg-black/40 flex items-center justify-center">
                    <div class="absolute inset-0 bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center">
                        <i class="fas ${isImage ? 'fa-image' : 'fa-film'} text-3xl text-white/20"></i>
                    </div>
                    <!-- Ring WITHOUT the X, showing percent -->
                    <div class="pending-progress-ring relative w-12 h-12 flex items-center justify-center z-10">
                        <svg class="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15" fill="none" class="stroke-black/50" stroke-width="3"></circle>
                            <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#ff7320] pending-progress-circle transition-all duration-150" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" stroke-linecap="round"></circle>
                        </svg>
                        <span class="pending-progress-text absolute font-mono text-[10px] font-bold text-white">0%</span>
                    </div>
                    <!-- Chip: "Receiving 13% · 1 min left" -->
                    <div class="pending-eta-chip absolute bottom-2 left-2 px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-sm text-white text-[11px] font-medium tracking-tight shadow-md flex items-center gap-1 z-10">
                        <span class="receiving-prefix font-medium">Receiving</span>
                        <span class="pending-progress-text font-bold">0%</span>
                        <span class="pending-eta-separator hidden">·</span>
                        <span class="pending-eta-text hidden"></span>
                    </div>
                </div>
            `;
        } else if (isAudio) {
            const subtitleText = size ? formatBytes(size) : 'Voice note';
            bodyHtml = `
                <div class="voice-card-content flex items-center p-2.5 rounded-xl bg-black/30 gap-3">
                    <div class="voice-icon-box w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full bg-[#181818] border border-white/15 text-[#ffb682]">
                        <i class="fas fa-microphone text-base"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="file-title font-semibold text-sm text-white truncate">Voice message</div>
                        <div class="file-subtitle text-xs text-white/85 font-mono mt-0.5">${subtitleText}</div>
                        <div class="pending-eta-chip text-[11px] text-[#ffb682] font-medium mt-0.5 flex items-center gap-1">
                            <span class="receiving-prefix font-medium">Receiving</span>
                            <span class="pending-progress-text font-bold">0%</span>
                            <span class="pending-eta-separator hidden">·</span>
                            <span class="pending-eta-text hidden"></span>
                        </div>
                    </div>
                    <div class="pending-progress-ring relative w-10 h-10 flex items-center justify-center flex-shrink-0">
                        <svg class="w-10 h-10 transform -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15" fill="none" class="stroke-white/15" stroke-width="3"></circle>
                            <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#ff7320] pending-progress-circle transition-all duration-150" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" stroke-linecap="round"></circle>
                        </svg>
                        <span class="pending-progress-text absolute font-mono text-[9px] font-bold text-white">0%</span>
                    </div>
                </div>
            `;
        } else {
            bodyHtml = `
                <div class="file-card-content flex items-center p-2 rounded-xl bg-black/30 gap-3">
                    <div class="file-icon-box w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg bg-[#181818] border border-white/10 text-[#ffb682]">
                        ${getFileIcon({ type: mime, name })}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="file-title font-semibold text-sm text-white truncate" title="${escapeHtml(name || '')}">${escapeHtml(name || 'file')}</div>
                        <div class="file-subtitle text-xs text-white/85 font-mono mt-0.5">${formatBytes(size || 0)}</div>
                        <div class="pending-eta-chip text-[11px] text-[#ffb682] font-medium mt-0.5 flex items-center gap-1">
                            <span class="receiving-prefix font-medium">Receiving</span>
                            <span class="pending-progress-text font-bold">0%</span>
                            <span class="pending-eta-separator hidden">·</span>
                            <span class="pending-eta-text hidden"></span>
                        </div>
                    </div>
                    <!-- Ring WITHOUT the X, showing percent -->
                    <div class="pending-progress-ring relative w-10 h-10 flex items-center justify-center flex-shrink-0">
                        <svg class="w-10 h-10 transform -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15" fill="none" class="stroke-white/15" stroke-width="3"></circle>
                            <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#ff7320] pending-progress-circle transition-all duration-150" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" stroke-linecap="round"></circle>
                        </svg>
                        <span class="pending-progress-text absolute font-mono text-[9px] font-bold text-white">0%</span>
                    </div>
                </div>
            `;
        }

        messageBubble.innerHTML = senderHtml + bodyHtml;
        messageRow.appendChild(messageBubble);
        wrapper.appendChild(messageRow);

        const estimator = createSpeedEstimator();
        const expireTimer = setTimeout(() => {
            removeIncomingPlaceholder(clientMsgId);
        }, 60000);

        incomingMediaTrackers.set(clientMsgId, { wrapper, estimator, expireTimer });
        getMessagesTarget().appendChild(wrapper);
        if (typeof scrollMessagesToBottom === 'function') {
            scrollMessagesToBottom(true);
        } else if (messagesDiv) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        return wrapper;
    }

    function updateIncomingProgress(clientMsgId, loaded, total) {
        const tracker = incomingMediaTrackers.get(clientMsgId);
        if (!tracker) return;

        clearTimeout(tracker.expireTimer);
        tracker.expireTimer = setTimeout(() => {
            removeIncomingPlaceholder(clientMsgId);
        }, 60000);

        const clamped = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
        const etaText = tracker.estimator.update(loaded, total);

        const wrapper = tracker.wrapper;
        const circle = wrapper.querySelector('.pending-progress-circle');
        const texts = wrapper.querySelectorAll('.pending-progress-text');
        const sep = wrapper.querySelector('.pending-eta-separator');
        const eta = wrapper.querySelector('.pending-eta-text');

        if (circle) {
            const offset = 94.2 - (94.2 * clamped) / 100;
            circle.style.strokeDashoffset = offset;
        }
        texts.forEach(t => {
            t.textContent = `${clamped}%`;
        });
        if (etaText && eta && sep) {
            eta.textContent = etaText;
            eta.classList.remove('hidden');
            sep.classList.remove('hidden');
        }
    }

    function removeIncomingPlaceholder(clientMsgId) {
        const tracker = incomingMediaTrackers.get(clientMsgId);
        if (tracker) {
            clearTimeout(tracker.expireTimer);
            tracker.wrapper.remove();
            incomingMediaTrackers.delete(clientMsgId);
        }
    }

    function handleMediaCancelled(clientMsgId) {
        const tracker = incomingMediaTrackers.get(clientMsgId);
        if (tracker) {
            clearTimeout(tracker.expireTimer);
            const bubble = tracker.wrapper.querySelector('.message-bubble');
            if (bubble) {
                bubble.innerHTML = '<span class="text-xs text-white/60 italic"><i class="fas fa-ban mr-1.5"></i>Sender cancelled</span>';
                setTimeout(() => {
                    removeIncomingPlaceholder(clientMsgId);
                }, 3000);
            } else {
                removeIncomingPlaceholder(clientMsgId);
            }
        }
    }

    function dispatchMediaUpload(mediaItem) {
        const clientMsgId = mediaItem.clientMsgId;
        const currentInstance = roomInstanceId;

        const fType = getResolvedMime(mediaItem.file);
        let messageType = 'video';
        if (mediaItem.type === 'snap' || mediaItem.isSnap) {
            messageType = 'snap';
        } else if (mediaItem.type === 'sticker' || mediaItem.isSticker || (mediaItem.file && mediaItem.file.isSticker)) {
            messageType = 'sticker';
        } else if (fType.startsWith('image')) {
            messageType = 'image';
        } else if (fType.startsWith('audio')) {
            messageType = 'audio';
        } else if (fType.startsWith('video')) {
            messageType = 'video';
        } else {
            messageType = 'file';
        }

        // Cache local objectUrl immediately so finalization can access it
        if (mediaItem.objectUrl) {
            if (!window.localMediaBlobMap) window.localMediaBlobMap = new Map();
            window.localMediaBlobMap.set(clientMsgId, mediaItem.objectUrl);
        }

        // Emit media-start to alert others in the room
        socket.emit("media-start", {
            roomKey,
            roomInstanceId: currentInstance,
            sessionToken,
            clientMsgId,
            username,
            kind: messageType,
            name: mediaItem.file ? mediaItem.file.name : 'attachment',
            size: mediaItem.file ? mediaItem.file.size : 0,
            mime: fType,
            width: mediaItem.width || 0,
            height: mediaItem.height || 0,
            durationMs: mediaItem.durationMs || (mediaItem.file?.durationMs || 0)
        });

        const uploadTitle = messageType === 'audio' ? 'Sending voice note...' :
                            (messageType === 'image' ? 'Sending photo...' :
                            (messageType === 'video' ? 'Sending video...' :
                            (messageType === 'snap' ? 'Sending video message...' :
                            (messageType === 'sticker' ? 'Sending sticker...' : 'Sending file...'))));
        showUploadProgress(uploadTitle, 0);

        const xhr = new XMLHttpRequest();
        let uploadTimedOut = false;
        const confirmTimeout = setTimeout(() => {
            if (activeUploads.has(clientMsgId)) {
                uploadTimedOut = true;
                try { xhr.abort(); } catch (e) {}
                hideUploadProgress();
                setPendingBubbleFailed(clientMsgId, 'Upload timed out. Tap retry.');
            }
        }, 30000);

        activeUploads.set(clientMsgId, { xhr, mediaItem, roomInstanceId: currentInstance, confirmTimeout });

        const formData = new FormData();
        formData.append('file', mediaItem.file);
        formData.append('roomInstanceId', currentInstance || '');
        formData.append('sessionToken', sessionToken || '');
        formData.append('clientMsgId', clientMsgId);

        const uploadUrl = `${API_BASE}/upload?roomInstanceId=${encodeURIComponent(currentInstance || '')}&roomKey=${encodeURIComponent(roomKey || '')}&clientMsgId=${encodeURIComponent(clientMsgId)}`;
        xhr.open('POST', uploadUrl, true);

        const estimator = createSpeedEstimator();
        let lastWsProgressEmit = 0;
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.min(100, (e.loaded / e.total) * 100);
                const etaText = estimator.update(e.loaded, e.total);
                updatePendingBubbleProgress(clientMsgId, percent, etaText);
                showUploadProgress(uploadTitle, percent);

                // Broadcast live progress over WebSocket so everyone in the room sees real-time progress
                const now = Date.now();
                if (now - lastWsProgressEmit >= 150 || percent >= 100) {
                    lastWsProgressEmit = now;
                    socket.emit("media-upload-progress", {
                        roomKey,
                        roomInstanceId: currentInstance,
                        clientMsgId,
                        loaded: e.loaded,
                        total: e.total
                    });
                }
            }
        };

        xhr.onload = () => {
            clearTimeout(confirmTimeout);
            hideUploadProgress();
            if (uploadTimedOut) return;

            if (roomInstanceId !== currentInstance) {
                removePendingBubble(clientMsgId);
                activeUploads.delete(clientMsgId);
                return;
            }

            if (xhr.status === 200) {
                try {
                    const data = JSON.parse(xhr.responseText);
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
                            name: mediaItem.file?.name || data.filename,
                            size: mediaItem.file?.size || data.size,
                            mimeType: fType || data.mimetype,
                            durationMs: mediaItem.durationMs || (mediaItem.file?.durationMs || 0)
                        },
                        file: {
                            name: mediaItem.file?.name || data.filename,
                            size: mediaItem.file?.size || data.size,
                            type: fType || data.mimetype,
                            path: data.path
                        },
                        seenBy: [],
                        ...(mediaItem.replyTo && { replyTo: mediaItem.replyTo })
                    };

                    // Finalize pending bubble smoothly in place with ZERO flicker
                    finalizePendingMediaBubble(clientMsgId, messagePayload);

                    // Broadcast to room carrying clientMsgId
                    socket.emit("chat-message", messagePayload);
                    if (messageType === 'file') {
                        socket.emit("file-message", messagePayload);
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
            clearTimeout(confirmTimeout);
            hideUploadProgress();
            if (uploadTimedOut) return;

            if (roomInstanceId !== currentInstance) {
                removePendingBubble(clientMsgId);
                activeUploads.delete(clientMsgId);
                return;
            }
            setPendingBubbleFailed(clientMsgId, 'Network error');
        };

        xhr.send(formData);
    }

    // Interactive file download with progress ring & cancel
    function handleFileDownload(url, filename, isOpen, container) {
        if (!container || !url) return;
        if (activeDownloads.has(url)) {
            // Duplicate taps ignored
            return;
        }

        const originalHtml = container.innerHTML;
        container.innerHTML = `
            <div class="download-progress-box flex items-center justify-between w-full py-1 px-2.5 rounded-lg bg-black/40 border border-white/10 gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <div class="relative w-6 h-6 flex items-center justify-center flex-shrink-0">
                        <svg class="w-6 h-6 transform -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15" fill="none" class="stroke-white/20" stroke-width="3"></circle>
                            <circle cx="18" cy="18" r="15" fill="none" class="stroke-[#ff7320] download-ring-circle transition-all duration-150" stroke-width="3" stroke-dasharray="94.2" stroke-dashoffset="94.2" stroke-linecap="round"></circle>
                        </svg>
                        <span class="download-ring-text absolute font-mono text-[7px] font-bold text-white">0%</span>
                    </div>
                    <span class="text-xs text-white/90 font-medium truncate">${isOpen ? 'Opening…' : 'Downloading…'}</span>
                </div>
                <button type="button" class="download-cancel-btn w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer flex-shrink-0" title="Cancel">
                    <i class="fas fa-times text-[10px]"></i>
                </button>
            </div>
        `;

        const circle = container.querySelector('.download-ring-circle');
        const text = container.querySelector('.download-ring-text');
        const cancelBtn = container.querySelector('.download-cancel-btn');

        const xhr = new XMLHttpRequest();
        activeDownloads.set(url, { xhr });

        if (cancelBtn) {
            cancelBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                xhr.abort();
                activeDownloads.delete(url);
                container.innerHTML = originalHtml;
                bindDownloadButtons(container);
                showToast('Download cancelled');
            };
        }

        xhr.open('GET', url, true);
        xhr.responseType = 'blob';

        xhr.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));
                if (circle) {
                    const offset = 94.2 - (94.2 * percent) / 100;
                    circle.style.strokeDashoffset = offset;
                }
                if (text) {
                    text.textContent = `${percent}%`;
                }
            }
        };

        xhr.onload = () => {
            activeDownloads.delete(url);
            container.innerHTML = originalHtml;
            bindDownloadButtons(container);
            if (xhr.status === 200) {
                const blob = xhr.response;
                const blobUrl = URL.createObjectURL(blob);
                if (isOpen) {
                    window.open(blobUrl, '_blank');
                } else {
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = filename || 'document';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                }
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
            } else {
                showToast(`Download failed (${xhr.status})`);
            }
        };

        xhr.onerror = () => {
            activeDownloads.delete(url);
            container.innerHTML = originalHtml;
            bindDownloadButtons(container);
            showToast('Download failed: network error');
        };

        xhr.send();
    }

    function bindDownloadButtons(container) {
        if (!container) return;
        const openBtn = container.querySelector('.file-btn-open');
        const saveBtn = container.querySelector('.file-btn-save');
        if (openBtn) {
            openBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const url = openBtn.getAttribute('data-url');
                const name = openBtn.getAttribute('data-name');
                handleFileDownload(url, name, true, container);
            };
        }
        if (saveBtn) {
            saveBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const url = saveBtn.getAttribute('data-url');
                const name = saveBtn.getAttribute('data-name');
                handleFileDownload(url, name, false, container);
            };
        }
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
            const isPending = existingWrapper.getAttribute('data-pending') === 'true' ||
                existingWrapper.getAttribute('data-incoming') === 'true' ||
                existingWrapper.classList.contains('pending-message') ||
                existingWrapper.classList.contains('incoming-media-placeholder');
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

        // Phase 11: Maintain structured messageDataStore
        if (!window.messageDataStore) window.messageDataStore = new Map();
        const storedId = id || clientMsgId || domId;
        if (storedId) {
            let sType = message?.type || (msgPayload.file ? 'file' : 'text');
            let sSnippet = '';
            let sMediaSrc = null;
            if (sType === 'text') {
                sSnippet = (message?.content || '').slice(0, 120);
            } else if (sType === 'image') {
                sSnippet = 'Photo';
                sMediaSrc = resolveMediaUrl(message?.content);
            } else if (sType === 'gif') {
                sSnippet = 'GIF';
                sMediaSrc = resolveMediaUrl(message?.content);
            } else if (sType === 'video') {
                sSnippet = 'Video';
                sMediaSrc = resolveMediaUrl(message?.content);
            } else if (sType === 'snap') {
                sSnippet = 'Video message';
                sMediaSrc = resolveMediaUrl(message?.content);
            } else if (sType === 'audio') {
                sSnippet = 'Voice message';
            } else if (sType === 'sticker') {
                sSnippet = 'Sticker';
                sMediaSrc = resolveMediaUrl(message?.content);
            } else if (sType === 'file') {
                sSnippet = msgPayload.file?.name || message?.name || 'Document';
            }
            window.messageDataStore.set(storedId, {
                id: storedId,
                senderName: user || username,
                type: sType,
                snippet: sSnippet,
                mediaSrc: sMediaSrc
            });
        }

        const messageRow = document.createElement("div");
        messageRow.className = `flex flex-row items-center w-full ${alignmentClass} message-row relative group`;

        const messageBubble = document.createElement("div");

        // Build quoted reply HTML if present (Phase 11: Structured data, NO timestamps)
        let quotedReplyHtml = '';
        if (replyTo) {
            const replyId = replyTo.id || replyTo.messageId || '';
            const replySender = replyTo.senderName || replyTo.sender || 'Anonymous';
            const replySnippet = replyTo.snippet || replyTo.previewText || 'Message';
            const replyMediaSrc = replyTo.mediaSrc || null;
            const isFile = replyTo.type === 'file';

            quotedReplyHtml = `
                <div class="quoted-reply cursor-pointer select-none" data-reply-id="${replyId}" onclick="scrollToMessage('${replyId}')">
                    ${replyMediaSrc
                        ? `<img src="${replyMediaSrc}" class="quoted-thumb" alt="thumbnail" loading="lazy">`
                        : (isFile ? `<div class="w-8 h-8 rounded bg-black/40 border border-white/10 flex items-center justify-center text-[#ffb682] flex-shrink-0 mr-2"><i class="fas fa-file-lines text-xs"></i></div>` : '')
                    }
                    <div class="quoted-text-col">
                        <div class="quoted-sender">~${escapeHtml(replySender)}</div>
                        <div class="quoted-preview">${escapeHtml(replySnippet)}</div>
                    </div>
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
            const localBlob = (user === username && clientMsgId && window.localMediaBlobMap) ? window.localMediaBlobMap.get(clientMsgId) : null;
            const mediaSrc = resolveMediaUrl(message.content);
            const displayMediaSrc = localBlob || mediaSrc;
            messageBubble.className = 'sticker-bubble message-bubble' + (user === username ? ' ml-auto' : '');
            contentHtml = `
                <div class="relative group cursor-pointer" onclick="openPreview('${mediaSrc}', 'sticker', '${id}')">
                    <img src="${displayMediaSrc}" class="sticker-message cursor-pointer" loading="lazy">
                    <a href="${mediaSrc}" download="sticker-${Date.now()}.png" class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Download" onclick="event.stopPropagation();">
                        <i class="fas fa-download"></i>
                    </a>
                </div>`;
        } else {
            messageBubble.className = `${bubbleClass} message-bubble message-bubble-media`;
            const localBlob = (user === username && clientMsgId && window.localMediaBlobMap) ? window.localMediaBlobMap.get(clientMsgId) : null;
            const mediaSrc = resolveMediaUrl(message.content);
            const displayMediaSrc = localBlob || mediaSrc;
            if (message.type === 'gif') {
                contentHtml = `
                <div class="relative group media-container cursor-pointer overflow-hidden rounded-xl" onclick="openPreview('${mediaSrc}', 'gif', '${id}')">
                    <img src="${displayMediaSrc}" class="message-file-preview cursor-pointer" loading="lazy">
                    <a href="${mediaSrc}" download="gif-${Date.now()}.gif" class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Download" onclick="event.stopPropagation();">
                        <i class="fas fa-download"></i>
                    </a>
                </div>`;
            } else if (message.type === 'image') {
                contentHtml = `
                <div class="relative group media-container media-fixed-frame overflow-hidden rounded-xl cursor-pointer" onclick="openPreview('${mediaSrc}', 'image', '${id}')">
                    <img src="${displayMediaSrc}" class="message-file-preview cursor-pointer" loading="lazy" alt="Photo">
                    <a href="${mediaSrc}" download="image-${Date.now()}.jpg" class="media-download-btn absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Download" onclick="event.stopPropagation();">
                        <i class="fas fa-download text-xs"></i>
                    </a>
                </div>`;
            } else if (message.type === 'video') {
                contentHtml = `
                <div class="relative group media-container media-fixed-frame overflow-hidden rounded-xl cursor-pointer" onclick="openPreview('${mediaSrc}', 'video', '${id}')">
                    <video src="${displayMediaSrc}" class="message-file-preview cursor-pointer" preload="metadata" playsinline></video>
                    <div class="video-play-overlay absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div class="w-12 h-12 rounded-full bg-black/60 border border-white/20 flex items-center justify-center shadow-lg text-white">
                            <i class="fas fa-play text-base ml-0.5"></i>
                        </div>
                    </div>
                    <a href="${mediaSrc}" download="video-${Date.now()}.mp4" class="media-download-btn absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Download" onclick="event.stopPropagation();">
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
                </div>`;
            } else if (message.type === 'file' || msgPayload.file) {
                messageBubble.className = `${bubbleClass} message-bubble file-document-bubble`;
                const fileObj = msgPayload.file || message;
                const fileName = fileObj.name || message.name || 'Document';
                const fileSize = fileObj.size || message.size || 0;
                const fileMime = fileObj.type || fileObj.mimeType || message.mimeType || '';
                const truncatedName = fileName.length > 20 ? fileName.substring(0, 15) + "..." + fileName.substring(fileName.length - 5) : fileName;
                const friendlyType = getFriendlyFileType(fileMime, fileName);
                const resolvedDocPath = resolveMediaUrl(message.content || fileObj.path || '');
                const fullFileInfo = `${fileName} (${formatBytes(fileSize)})`;

                contentHtml = `
                <div class="file-card-content flex items-center p-1" title="${escapeHtml(fullFileInfo)}">
                    <div class="file-icon-box w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg mr-3 bg-[#181818] border border-white/10 text-[#ffb682]">
                        ${getFileIcon({ type: fileMime, name: fileName })}
                    </div>
                    <div class="overflow-hidden flex-1">
                        <div class="file-title font-semibold text-sm truncate text-white" title="${escapeHtml(fileName)}">${escapeHtml(truncatedName)}</div>
                        <div class="file-subtitle text-xs mt-0.5 text-white/85 font-mono">${formatBytes(fileSize)} • ${friendlyType}</div>
                    </div>
                </div>
                <div class="file-footer-row flex items-center justify-between gap-2 mt-1.5 pt-0.5">
                    <div class="file-actions-container flex gap-2 flex-1">
                        <button type="button" class="file-action-btn file-btn-open flex-1 text-center py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer" data-url="${resolvedDocPath}" data-name="${escapeHtml(fileName)}">
                            <i class="fas fa-external-link-alt mr-1.5"></i>Open
                        </button>
                        <button type="button" class="file-action-btn file-btn-save flex-1 text-center py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer" data-url="${resolvedDocPath}" data-name="${escapeHtml(fileName)}">
                            <i class="fas fa-download mr-1.5"></i>Save
                        </button>
                    </div>
                    <span class="msg-time self-end text-[11px] mb-0.5">${formatMsgTime(message.timestamp || Date.now())}</span>
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
        } else if (message.type === 'file' || msgPayload.file) {
            messageBubble.innerHTML = senderHtml + quotedReplyHtml + contentHtml;
            const actionsBox = messageBubble.querySelector('.file-actions-container');
            if (actionsBox) bindDownloadButtons(actionsBox);
        } else {
            messageBubble.innerHTML = senderHtml + quotedReplyHtml + contentHtml + msgTimeHtml;
        }

        if (msgPayload.reactions || message.reactions) {
            updateMessageReactions(id, msgPayload.reactions || message.reactions);
        }

        // Desktop hover reply button (Phase 11)
        const desktopReplyBtn = document.createElement("button");
        desktopReplyBtn.type = "button";
        desktopReplyBtn.className = "desktop-reply-btn";
        desktopReplyBtn.title = `Reply to ~${user}`;
        desktopReplyBtn.setAttribute("aria-label", `Reply to ~${user}`);
        desktopReplyBtn.innerHTML = '<i class="fas fa-reply text-[11px]"></i>';
        desktopReplyBtn.onclick = (e) => {
            e.stopPropagation();
            setReplyContext(storedId);
        };

        if (user === username) {
            messageRow.appendChild(desktopReplyBtn);
            messageRow.appendChild(messageBubble);
        } else {
            messageRow.appendChild(messageBubble);
            messageRow.appendChild(desktopReplyBtn);
        }

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

        if (existingWrapper && (
            existingWrapper.getAttribute('data-pending') === 'true' ||
            existingWrapper.getAttribute('data-incoming') === 'true' ||
            existingWrapper.classList.contains('pending-message') ||
            existingWrapper.classList.contains('incoming-media-placeholder')
        )) {
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

    // ======== DIRECT MEDIA SEND MODULE (NO DRAFT TRAY) ========
    function sendMediaFilesDirectly(files, options = {}) {
        const list = Array.isArray(files) ? files : Array.from(files || []);
        if (list.length === 0) return;

        const isStickerGlobal = options.isSticker || false;
        const currentInstance = roomInstanceId;

        const activeReply = replyContext ? {
            id: replyContext.id,
            senderName: replyContext.senderName || replyContext.sender,
            type: replyContext.type || 'text',
            snippet: replyContext.snippet || replyContext.previewText,
            mediaSrc: replyContext.mediaSrc || null
        } : null;

        // If user already typed a text message in the composer (and this is not a keyboard sticker insertion), send the text message too
        const typedText = (messageInput ? (messageInput.value || messageInput.innerText || messageInput.textContent || '') : '').trim();
        if (typedText && !isStickerGlobal) {
            const textClientMsgId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const messagePayload = {
                roomKey,
                roomInstanceId: currentInstance,
                sessionToken,
                clientMsgId: textClientMsgId,
                username,
                id: textClientMsgId,
                message: { type: 'text', content: typedText },
                seenBy: []
            };
            if (activeReply) messagePayload.replyTo = activeReply;
            renderMessageBubble({
                username,
                message: messagePayload.message,
                id: textClientMsgId,
                clientMsgId: textClientMsgId,
                seenBy: [],
                replyTo: activeReply
            });
            socket.emit("chat-message", messagePayload);

            messageInput.value = "";
            messageInput.innerText = "";
            messageInput.textContent = "";
            autoResizeTextarea();
        }

        clearReplyContext();

        for (const file of list) {
            const clientMsgId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const objectUrl = URL.createObjectURL(file);
            if (!window.localMediaBlobMap) window.localMediaBlobMap = new Map();
            window.localMediaBlobMap.set(clientMsgId, objectUrl);
            const fType = getResolvedMime(file);
            const isSticker = isStickerGlobal || file.isSticker || (file.name && file.name.toLowerCase().includes('sticker')) || false;
            file.isSticker = isSticker;

            let messageType = 'video';
            if (isSticker) {
                messageType = 'sticker';
            } else if (fType.startsWith('image')) {
                messageType = 'image';
            } else if (fType.startsWith('audio')) {
                messageType = 'audio';
            } else if (fType.startsWith('video')) {
                messageType = 'video';
            } else {
                messageType = 'file';
            }

            const mediaItem = {
                file,
                objectUrl,
                clientMsgId,
                isSticker,
                type: messageType,
                replyTo: activeReply
            };

            createPendingMediaBubble({
                file,
                objectUrl,
                clientMsgId,
                isSticker,
                roomInstanceId: currentInstance,
                onCancel: () => {
                    const active = activeUploads.get(clientMsgId);
                    if (active && active.xhr) {
                        try { active.xhr.abort(); } catch (e) {}
                    }
                    removePendingBubble(clientMsgId);
                    if (objectUrl) {
                        try { URL.revokeObjectURL(objectUrl); } catch (e) {}
                    }
                    activeUploads.delete(clientMsgId);
                },
                onRetry: () => {
                    setPendingBubbleRetrying(clientMsgId);
                    dispatchMediaUpload(mediaItem);
                },
                onDelete: () => {
                    removePendingBubble(clientMsgId);
                    if (objectUrl) {
                        try { URL.revokeObjectURL(objectUrl); } catch (e) {}
                    }
                    activeUploads.delete(clientMsgId);
                }
            });

            dispatchMediaUpload(mediaItem);
        }

        pastedMedia.length = 0;
        renderMediaPreviews();
        if (typeof updateSendButtonState === 'function') updateSendButtonState();
        scrollMessagesToBottom(true);
    }
    window.sendMediaFilesDirectly = sendMediaFilesDirectly;

    window.mediaDraft = {
        items: [],
        add(files) {
            sendMediaFilesDirectly(files);
            return Array.isArray(files) ? files.length : 1;
        },
        remove(idOrIndex) {},
        clear() {
            renderMediaPreviews();
        },
        validate() {
            return true;
        }
    };

    function renderMediaPreviews() {
        const previewContainer = document.getElementById('mediaPreviews');
        if (previewContainer) {
            previewContainer.classList.add('hidden');
            previewContainer.style.display = 'none';
            previewContainer.innerHTML = '';
        }
        pastedMedia.length = 0;
        mediaPasteEnabled = true;
        if (typeof updateSendButtonState === 'function') updateSendButtonState();
    }

    function removeMediaPreview(index) {
        renderMediaPreviews();
    }

    function clearAllMediaDrafts() {
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
                if (composerRow) {
                    composerRow.classList.remove('hidden');
                    composerRow.classList.remove('composer-recording-active');
                }
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

            // In-place UI: keep composer row mounted (opacity 0) and overlay voice recording row in the exact same slot
            if (composerRow) {
                composerRow.classList.remove('hidden');
                composerRow.classList.add('composer-recording-active');
            }
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
        if (composerRow) {
            composerRow.classList.remove('hidden');
            composerRow.classList.remove('composer-recording-active');
        }
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

    // Send voice note directly to server with instant pending bubble and live progress
    async function uploadAndSendVoiceNote(blob, durationMs) {
        if (!blob || blob.size === 0) return;
        const audioFile = new File([blob], `voice-${Date.now()}.webm`, {
            type: blob.type || 'audio/webm'
        });
        audioFile.durationMs = durationMs;

        const clientMsgId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const objectUrl = URL.createObjectURL(blob);
        if (!window.localMediaBlobMap) window.localMediaBlobMap = new Map();
        window.localMediaBlobMap.set(clientMsgId, objectUrl);

        const activeReply = replyContext ? {
            id: replyContext.id,
            senderName: replyContext.senderName || replyContext.sender,
            type: replyContext.type || 'text',
            snippet: replyContext.snippet || replyContext.previewText,
            mediaSrc: replyContext.mediaSrc || null
        } : null;
        clearReplyContext();

        const mediaItem = {
            file: audioFile,
            objectUrl,
            clientMsgId,
            type: 'audio',
            durationMs: durationMs || 0,
            replyTo: activeReply
        };

        createPendingMediaBubble({
            file: audioFile,
            objectUrl,
            clientMsgId,
            isSticker: false,
            roomInstanceId,
            onCancel: () => {
                const active = activeUploads.get(clientMsgId);
                if (active && active.xhr) {
                    try { active.xhr.abort(); } catch (e) {}
                }
                removePendingBubble(clientMsgId);
                if (objectUrl) {
                    try { URL.revokeObjectURL(objectUrl); } catch (e) {}
                }
                activeUploads.delete(clientMsgId);
                hideUploadProgress();
            },
            onRetry: () => {
                setPendingBubbleRetrying(clientMsgId);
                dispatchMediaUpload(mediaItem);
            },
            onDelete: () => {
                removePendingBubble(clientMsgId);
                if (objectUrl) {
                    try { URL.revokeObjectURL(objectUrl); } catch (e) {}
                }
                activeUploads.delete(clientMsgId);
                hideUploadProgress();
            }
        });

        dispatchMediaUpload(mediaItem);
        scrollMessagesToBottom(true);
    }

    // Wire recording row buttons (prevent blur so mobile keyboard never dismisses)
    if (voiceRecordTrashBtn) {
        voiceRecordTrashBtn.addEventListener('pointerdown', (e) => e.preventDefault());
        voiceRecordTrashBtn.addEventListener('mousedown', (e) => e.preventDefault());
        voiceRecordTrashBtn.onclick = (e) => {
            e.preventDefault();
            cancelRecording();
        };
    }
    if (voiceRecordPauseBtn) {
        voiceRecordPauseBtn.addEventListener('pointerdown', (e) => e.preventDefault());
        voiceRecordPauseBtn.addEventListener('mousedown', (e) => e.preventDefault());
        voiceRecordPauseBtn.onclick = (e) => {
            e.preventDefault();
            togglePauseRecording();
        };
    }
    if (voiceRecordSendBtn) {
        voiceRecordSendBtn.addEventListener('pointerdown', (e) => e.preventDefault());
        voiceRecordSendBtn.addEventListener('mousedown', (e) => e.preventDefault());
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

    // ======== REPLY TO MESSAGE FUNCTIONS (Phase 11) ========

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    window.escapeHtml = escapeHtml;

    function formatReplyData(target) {
        if (!target) return null;
        let id = typeof target === 'string' ? target : (target.id || target.messageId);
        if (!id) return null;

        if (window.messageDataStore && window.messageDataStore.has(id)) {
            return window.messageDataStore.get(id);
        }

        const sender = target.username || target.senderName || target.sender || username;
        let type = target.type || target.message?.type || (target.file ? 'file' : 'text');
        let snippet = '';
        let mediaSrc = target.mediaSrc || null;

        if (type === 'text') {
            snippet = target.message?.content || target.content || target.snippet || 'Message';
        } else if (type === 'image') {
            snippet = 'Photo';
            mediaSrc = mediaSrc || resolveMediaUrl(target.message?.content || target.content || target.path);
        } else if (type === 'gif') {
            snippet = 'GIF';
            mediaSrc = mediaSrc || resolveMediaUrl(target.message?.content || target.content || target.path);
        } else if (type === 'video') {
            snippet = 'Video';
            mediaSrc = mediaSrc || resolveMediaUrl(target.message?.content || target.content || target.path);
        } else if (type === 'snap') {
            snippet = 'Video message';
            mediaSrc = mediaSrc || resolveMediaUrl(target.message?.content || target.content || target.path);
        } else if (type === 'audio') {
            snippet = 'Voice message';
        } else if (type === 'sticker') {
            snippet = 'Sticker';
            mediaSrc = mediaSrc || resolveMediaUrl(target.message?.content || target.content || target.path);
        } else if (type === 'file') {
            snippet = target.file?.name || target.message?.name || target.name || 'Document';
        } else {
            snippet = target.snippet || 'Message';
        }

        const entry = {
            id,
            senderName: sender,
            type,
            snippet: String(snippet).slice(0, 120),
            mediaSrc
        };
        if (!window.messageDataStore) window.messageDataStore = new Map();
        window.messageDataStore.set(id, entry);
        return entry;
    }

    // Set reply context (targets the selected message directly from structured data)
    function setReplyContext(target) {
        if (!target) return;
        let targetData = null;
        if (typeof target === 'string') {
            targetData = window.messageDataStore?.get(target) || extractMessageData(document.getElementById(target)) || { id: target, senderName: username, snippet: 'Message', type: 'text' };
        } else {
            targetData = formatReplyData(target);
        }

        if (!targetData) return;

        replyContext = {
            id: targetData.id,
            messageId: targetData.id,
            sender: targetData.senderName || targetData.username || 'Anonymous',
            senderName: targetData.senderName || targetData.username || 'Anonymous',
            snippet: targetData.snippet || 'Message',
            previewText: targetData.snippet || 'Message',
            type: targetData.type || 'text',
            mediaSrc: targetData.mediaSrc || null
        };
        window.replyContext = replyContext;

        showReplyPreview();
        if (messageInput) {
            messageInput.focus();
        }
    }
    window.setReplyContext = setReplyContext;

    // Clear reply context
    function clearReplyContext() {
        replyContext = null;
        window.replyContext = null;
        hideReplyPreview();
    }
    window.clearReplyContext = clearReplyContext;

    // Get preview text from message object
    function getReplyPreview(message) {
        if (!message) return 'Message';

        if (message.type === 'text') {
            const text = message.content || '';
            return text.length > 80 ? text.substring(0, 80) + '...' : text;
        } else if (message.type === 'image') {
            return 'Photo';
        } else if (message.type === 'video') {
            return 'Video';
        } else if (message.type === 'snap') {
            return 'Video message';
        } else if (message.type === 'audio') {
            return 'Voice message';
        } else if (message.type === 'gif') {
            return 'GIF';
        } else if (message.type === 'sticker') {
            return 'Sticker';
        } else if (message.type === 'file') {
            return message.content || message.name || 'Document';
        } else {
            return 'Message';
        }
    }

    // Show reply preview bar (compact block, left accent bar, thumbnail if media)
    function showReplyPreview() {
        if (!replyContext || !replyPreviewBar) return;

        const senderEl = replyPreviewBar.querySelector('.reply-sender');
        const previewEl = replyPreviewBar.querySelector('.reply-preview');

        if (senderEl) senderEl.textContent = `Replying to ~${replyContext.senderName || replyContext.sender}`;
        if (previewEl) previewEl.textContent = replyContext.snippet || replyContext.previewText;

        let thumbEl = replyPreviewBar.querySelector('.reply-preview-thumb');
        if (replyContext.mediaSrc) {
            if (!thumbEl) {
                thumbEl = document.createElement('img');
                thumbEl.className = 'reply-preview-thumb w-8 h-8 rounded object-cover flex-shrink-0';
                const flexRow = replyPreviewBar.querySelector('.flex.items-center');
                if (flexRow) {
                    flexRow.insertBefore(thumbEl, flexRow.querySelector('.overflow-hidden'));
                }
            }
            thumbEl.src = replyContext.mediaSrc;
            thumbEl.classList.remove('hidden');
        } else if (thumbEl) {
            thumbEl.classList.add('hidden');
        }

        replyPreviewBar.classList.remove('hidden');
    }

    // Hide reply preview bar
    function hideReplyPreview() {
        if (replyPreviewBar) {
            replyPreviewBar.classList.add('hidden');
            const thumbEl = replyPreviewBar.querySelector('.reply-preview-thumb');
            if (thumbEl) thumbEl.classList.add('hidden');
        }
    }

    // Scroll to original message and pulse highlight for 1.5s
    function scrollToMessage(messageId) {
        if (!messageId) {
            showToast("Original message isn't available");
            return;
        }
        const domId = String(messageId).startsWith('msg-') ? String(messageId) : `msg-${messageId}`;
        const messageElement = document.getElementById(domId) ||
            document.getElementById(messageId) ||
            document.querySelector(`[data-msg-id="${messageId}"]`) ||
            document.querySelector(`[data-client-msg-id="${messageId}"]`);
        if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Highlight briefly with pulse glow animation for 1.5s
            messageElement.classList.remove('message-highlight');
            void messageElement.offsetWidth;
            messageElement.classList.add('message-highlight');
            setTimeout(() => {
                messageElement.classList.remove('message-highlight');
            }, 1500);
        } else {
            // Message not found in DOM
            showToast("Original message isn't available");
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

    function displayFile(user, file, messageId, seenBy = [], replyTo = null) {
        if (!file) return null;
        const fileType = getMimeType(file);
        let mType = 'file';
        if (fileType.startsWith('image')) mType = 'image';
        else if (fileType.startsWith('video')) mType = 'video';
        else if (fileType.startsWith('audio')) mType = 'audio';

        return renderMessageBubble({
            username: user,
            id: messageId,
            clientMsgId: messageId,
            seenBy: seenBy || [],
            replyTo: replyTo || null,
            file,
            message: {
                type: mType,
                content: file.path,
                name: file.name,
                size: file.size,
                mimeType: fileType
            }
        });
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
        if (roomKey.length < 6) {
            appAlert("Room key must be at least 6 characters.", "Invalid Room Key");
            if (roomKeyInput) roomKeyInput.focus();
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
                    socket.off("room-creation-error", onDone);
                }
                socket.once("room-created", onDone);
                socket.once("room-exists", onDone);
                socket.once("room-creation-error", onDone);
            });
        }, { serverWakeupNotice: true, connectingText: "Connecting…" });
    };

    function performJoinRoom(targetKey, targetUsername, triggerBtn) {
        const key = (targetKey || "").trim();
        const uname = (targetUsername || "").trim();
        if (!key || !uname) {
            appAlert("Please enter a username and a room key.");
            return;
        }
        if (key.length < 6) {
            appAlert("Room key must be at least 6 characters.", "Invalid Room Key");
            if (roomKeyInput) roomKeyInput.focus();
            return;
        }

        roomKey = key;
        username = uname;
        window.currentRoomKey = roomKey;
        if (roomKeyInput) roomKeyInput.value = roomKey;
        if (usernameInput) usernameInput.value = username;

        const btn = triggerBtn || joinRoomBtn;
        withBusy(btn, () => {
            const inviteJoinStatus = document.getElementById("inviteJoinStatus");
            if (inviteJoinStatus && triggerBtn && (triggerBtn.id === "askJoinRoomBtn" || triggerBtn.id === "askToJoinBtn")) {
                inviteJoinStatus.classList.remove("hidden");
            }
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
    }

    joinRoomBtn.onclick = () => {
        performJoinRoom(roomKeyInput ? roomKeyInput.value : "", usernameInput ? usernameInput.value : "", joinRoomBtn);
    };

    // Dedicated Ask to Join screen elements & handlers (Phase 12)
    const askToJoinScreen = document.getElementById("askToJoinScreen") || document.getElementById("panelJoinInvite");
    const roomUnavailableState = document.getElementById("roomUnavailableState");
    const askJoinRoomBtn = document.getElementById("askJoinRoomBtn") || document.getElementById("askToJoinBtn");
    const cancelInviteBtn = document.getElementById("cancelInviteBtn");
    const roomUnavailableHomeBtn = document.getElementById("roomUnavailableHomeBtn");
    const inviteUsername = document.getElementById("inviteUsername");
    const inviteRoomKeyDisplay = document.getElementById("inviteRoomKeyDisplay");
    const askRoomOnlineText = document.getElementById("askRoomOnlineText");
    const inviteJoinStatus = document.getElementById("inviteJoinStatus");
    const panelChatRoom = document.getElementById("panelChatRoom");

    if (askJoinRoomBtn) {
        askJoinRoomBtn.onclick = () => {
            const codename = (inviteUsername ? inviteUsername.value.trim() : "") || (usernameInput ? usernameInput.value.trim() : "");
            const key = pendingInviteKey || (inviteRoomKeyDisplay ? inviteRoomKeyDisplay.textContent.trim() : "") || (roomKeyInput ? roomKeyInput.value.trim() : "");
            performJoinRoom(key, codename, askJoinRoomBtn);
        };
    }

    function returnToJoinScreen() {
        if (askToJoinScreen) askToJoinScreen.classList.add("hidden");
        if (roomUnavailableState) roomUnavailableState.classList.add("hidden");
        if (panelChatRoom) panelChatRoom.classList.remove("hidden");
        pendingInviteKey = null;
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname);
        }
    }

    if (cancelInviteBtn) {
        cancelInviteBtn.onclick = returnToJoinScreen;
    }
    if (roomUnavailableHomeBtn) {
        roomUnavailableHomeBtn.onclick = returnToJoinScreen;
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
    if (fileBtn) {
        fileBtn.addEventListener('pointerdown', (e) => e.preventDefault());
        fileBtn.addEventListener('mousedown', (e) => e.preventDefault());
    }
    if (cameraBtn) {
        cameraBtn.addEventListener('pointerdown', (e) => e.preventDefault());
        cameraBtn.addEventListener('mousedown', (e) => e.preventDefault());
    }
    if (emojiBtn) {
        emojiBtn.addEventListener('pointerdown', (e) => e.preventDefault());
        emojiBtn.addEventListener('mousedown', (e) => e.preventDefault());
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

    function takePhoto() {
        try {
            if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins?.Camera) {
                window.Capacitor.Plugins.Camera.getPhoto({
                    quality: 85,
                    allowEditing: false,
                    resultType: 'uri',
                    source: 'CAMERA'
                }).then(async (image) => {
                    if (image && (image.webPath || image.path)) {
                        const res = await fetch(image.webPath);
                        const blob = await res.blob();
                        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
                        sendMediaFilesDirectly([file]);
                    }
                }).catch((err) => {
                    if (err && err.message && (err.message.includes('denied') || err.message.includes('permission'))) {
                        if (typeof appAlert === 'function') {
                            appAlert('Camera permission was denied. Please enable camera access in settings.');
                        }
                    } else if (!err || !err.message || !err.message.includes('User cancelled')) {
                        console.warn('Camera photo error:', err);
                    }
                });
            } else {
                if (cameraPhotoInput) {
                    cameraPhotoInput.click();
                }
            }
        } catch (err) {
            console.warn('Camera photo error:', err);
        }
    }

    if (cameraPhotoInput) {
        cameraPhotoInput.onchange = () => {
            const files = Array.from(cameraPhotoInput.files || []);
            if (files.length > 0) {
                sendMediaFilesDirectly(files);
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
                const activeReply = replyContext ? {
                    id: replyContext.id,
                    senderName: replyContext.senderName || replyContext.sender,
                    type: replyContext.type || 'text',
                    snippet: replyContext.snippet || replyContext.previewText,
                    mediaSrc: replyContext.mediaSrc || null
                } : null;
                clearReplyContext();

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
                        dispatchMediaUpload({ file: snapFile, clientMsgId, type: 'snap', isSnap: true, durationMs: snapDur, replyTo: activeReply });
                    },
                    onDelete: () => {
                        removePendingBubble(clientMsgId);
                        activeUploads.delete(clientMsgId);
                    }
                });
                dispatchMediaUpload({ file: snapFile, clientMsgId, type: 'snap', isSnap: true, durationMs: snapDur, replyTo: activeReply });
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
            cameraPressStartTime = Date.now();
            cameraPointerStartX = e.clientX;
            cameraPointerStartY = e.clientY;
            isCameraHolding = false;
            isSnapCancelled = false;

            cameraHoldTimer = setTimeout(async () => {
                isCameraHolding = true;
                try {
                    cameraBtn.setPointerCapture(e.pointerId);
                } catch (err) {}
                await startSnapRecording();
            }, 350);
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

            if (isCameraHolding) {
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

        // Direct trusted click handler for taking a photo / opening file chooser on web
        cameraBtn.onclick = (e) => {
            if (isCameraHolding) {
                e.preventDefault();
                return;
            }
            takePhoto();
        };

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
        if (mediaPicker) mediaPicker.style.display = "none";
    });

    // Phase 13: Handle keyboard content (stickers/GIFs from Gboard, etc.)
    function dataUrlToFile(dataUrl, filename, mimeType) {
        try {
            const arr = dataUrl.split(',');
            const mime = mimeType || (arr[0].match(/:(.*?);/) || [])[1] || 'image/png';
            const bstr = atob(arr[1] || arr[0]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            const ext = mime.includes('gif') ? 'gif' : mime.includes('webp') ? 'webp' : (mime.includes('jpeg') || mime.includes('jpg')) ? 'jpg' : 'png';
            const safeName = filename ? (filename.includes('.') ? filename : `${filename}.${ext}`) : `sticker_${Date.now()}.${ext}`;
            const file = new File([u8arr], safeName, { type: mime, lastModified: Date.now() });
            file.isSticker = true;
            return file;
        } catch (e) {
            console.error('Failed to convert keyboard content dataUrl to File:', e);
            return null;
        }
    }

    function sendDirectMediaUrl(mediaUrl, mediaType = 'gif') {
        if (!mediaUrl) return;
        const messageId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const payload = {
            roomKey,
            username,
            id: messageId,
            message: { type: mediaType, content: mediaUrl },
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
    window.sendDirectMediaUrl = sendDirectMediaUrl;

    let lastProcessedTime = 0;
    let lastProcessedKey = '';

    function processKeyboardContent(detail) {
        if (!detail || !detail.base64) return;
        const now = Date.now();
        const contentKey = (detail.base64.slice(0, 50) + detail.base64.slice(-50));
        if (now - lastProcessedTime < 1500 && lastProcessedKey === contentKey) return;
        lastProcessedTime = now;
        lastProcessedKey = contentKey;

        const file = dataUrlToFile(detail.base64, detail.name, detail.mimeType);
        if (file) {
            file.isSticker = true;
            sendMediaFilesDirectly([file], { isSticker: true });
        }
    }

    window.handleKeyboardContent = processKeyboardContent;
    window.handleAndroidKeyboardContent = () => {
        try {
            if (window.AndroidKeyboardBridge) {
                const base64 = window.AndroidKeyboardBridge.getPendingData();
                const mime = window.AndroidKeyboardBridge.getPendingMime() || 'image/png';
                const name = window.AndroidKeyboardBridge.getPendingName() || 'keyboard_media';
                if (window.AndroidKeyboardBridge.clearPending) {
                    window.AndroidKeyboardBridge.clearPending();
                }
                if (base64) {
                    processKeyboardContent({ base64, mimeType: mime, name });
                }
            }
        } catch (e) {
            console.error('Failed to read AndroidKeyboardBridge:', e);
        }
    };
    window.addEventListener('keyboardContentReady', () => {
        if (typeof window.handleAndroidKeyboardContent === 'function') {
            window.handleAndroidKeyboardContent();
        }
    });
    window.addEventListener('keyboardContent', (e) => {
        if (e && e.detail) {
            processKeyboardContent(e.detail);
        }
    });

    // Helper to handle external media files from paste, drop, or keyboard insertion
    function handleMediaFilesFromExternal(files) {
        if (!files || files.length === 0) return;
        const imageFiles = Array.from(files).filter(f => f && f.type && (f.type.startsWith('image/') || f.type.includes('gif')));
        if (imageFiles.length === 0) return;
        sendMediaFilesDirectly(imageFiles);
    }

    // Paste handler supporting files, HTML copied images (GIFs/stickers), direct image URLs, and text
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

        // 2. Check for HTML clipboard containing <img> tags (Giphy, Tenor, Web images, Discord)
        const html = event.clipboardData ? event.clipboardData.getData('text/html') : '';
        if (html && html.includes('<img')) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const img = doc.querySelector('img');
                if (img && img.src && (img.src.startsWith('http://') || img.src.startsWith('https://') || img.src.startsWith('data:'))) {
                    event.preventDefault();
                    if (img.src.startsWith('data:')) {
                        const file = dataUrlToFile(img.src, `pasted-${Date.now()}`);
                        if (file) {
                            file.isSticker = true;
                            handleMediaFilesFromExternal([file]);
                            return;
                        }
                    } else {
                        // Attempt to fetch as blob to preserve full animation (e.g. GIF)
                        fetch(img.src)
                            .then(r => r.blob())
                            .then(blob => {
                                const ext = blob.type.includes('gif') ? 'gif' : blob.type.includes('webp') ? 'webp' : 'png';
                                const file = new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type });
                                file.isSticker = true;
                                handleMediaFilesFromExternal([file]);
                            })
                            .catch(() => {
                                sendDirectMediaUrl(img.src, img.src.includes('.gif') ? 'gif' : 'sticker');
                            });
                        return;
                    }
                }
            } catch (_) {}
        }

        // 3. Check for pasted direct image/GIF URLs (Giphy, Tenor, direct .gif/.png/.webp)
        const pastedText = event.clipboardData ? event.clipboardData.getData('text/plain').trim() : '';
        const isDirectImageUrl = /^https?:\/\/.+\.(gif|webp|png|jpe?g)($|\?)/i.test(pastedText) ||
            /^https?:\/\/(media[0-9]*\.giphy\.com|c\.tenor\.com|tenor\.com\/view|i\.giphy\.com)\/.+/i.test(pastedText);

        const hasTypedText = (messageInput.value || '').trim().length > 0;
        if (isDirectImageUrl && !hasTypedText) {
            event.preventDefault();
            const isGif = pastedText.toLowerCase().includes('.gif') || pastedText.includes('giphy') || pastedText.includes('tenor');
            const msgType = isGif ? 'gif' : 'image';
            sendDirectMediaUrl(pastedText, msgType);
            return;
        }

        // 4. Plain text paste: prevent rich HTML tags from leaking into contenteditable
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
                                    file.isSticker = true;
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
        if (files && files.length > 0) {
            sendMediaFilesDirectly(files);
        }
    }, false);



    sendBtn.onclick = async () => {
        const message = (messageInput ? (messageInput.value || messageInput.innerText || messageInput.textContent || '') : '').trim();
        const mediaToSend = [...pastedMedia];
        const hasMedia = mediaToSend.length > 0;
        const hasContent = message !== "" || hasMedia || (fileToSend !== null);

        // WhatsApp behavior: only if there is NO content to send and in mic mode, tap starts voice recording
        if (!hasContent && sendBtn.dataset.mode === "mic") {
            if (typeof startAudioRecording === "function") {
                startAudioRecording();
            }
            return;
        }

        if (!hasContent) return;

        // Rate limiting & anti-duplicate protection
        if (isSendingInProgress) {
            return;
        }
        const now = Date.now();
        if (now - lastSendTime < 300) {
            return;
        }
        if (sendBtn.disabled) return;

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
            const activeReply = replyContext ? {
                id: replyContext.id,
                senderName: replyContext.senderName || replyContext.sender,
                type: replyContext.type || 'text',
                snippet: replyContext.snippet || replyContext.previewText,
                mediaSrc: replyContext.mediaSrc || null
            } : null;

            // Send media items with instant pending bubbles in chat stream
            for (const mediaItem of mediaToSend) {
                mediaItem.replyTo = activeReply;
                const clientMsgId = mediaItem.clientMsgId || (crypto.randomUUID ? crypto.randomUUID() : `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
                mediaItem.clientMsgId = clientMsgId;

                const isSticker = mediaItem.isSticker || (mediaItem.file && mediaItem.file.isSticker) || false;
                createPendingMediaBubble({
                    file: mediaItem.file,
                    objectUrl: mediaItem.objectUrl,
                    clientMsgId,
                    isSticker,
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

                if (activeReply) {
                    messagePayload.replyTo = activeReply;
                }

                renderMessageBubble({
                    username,
                    message: messagePayload.message,
                    id: messageId,
                    clientMsgId,
                    seenBy: [],
                    replyTo: activeReply
                });

                socket.emit("chat-message", messagePayload);
            }

            // Clear draft state
            clearReplyContext();

            if (messageInput) {
                messageInput.value = "";
                messageInput.innerText = "";
                messageInput.textContent = "";
            }
            autoResizeTextarea();
            renderMediaPreviews();
            messageInput.focus();
            scrollMessagesToBottom(true);
        } catch (err) {
            console.error('[sendBtn ERROR]', err);
        } finally {
            isSendingInProgress = false;
            sendBtn.removeAttribute('aria-busy');
            delete sendBtn.dataset.isBusy;
            sendBtn.classList.remove('opacity-60', 'cursor-not-allowed');
            updateSendButtonState();
        }
    };

    fileInput.onchange = () => {
        const files = Array.from(fileInput.files || []);
        if (files.length === 0) return;
        sendMediaFilesDirectly(files);
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

    // Built-in emoji/media picker removed; keyboard stickers and GIFs are handled natively

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
            img.draggable = true;
        } else {
            img.classList.add('zoomed');
            img.draggable = false;
        }
        img.style.transform = `translate(${previewPanX}px, ${previewPanY}px) scale(${previewZoom})`;
        if (previewZoomIndicator) {
            previewZoomIndicator.textContent = `${Math.round(previewZoom * 100)}%`;
            previewZoomIndicator.style.opacity = previewZoom > 1 ? '1' : '0';
        }
    }

    let previewOpenedTime = 0;
    let lastPreviewClosedTime = 0;

    function closePreviewModal() {
        if (!previewModal) return;
        lastPreviewClosedTime = Date.now();
        previewModal.classList.add('hidden');
        previewModal.style.setProperty('display', 'none', 'important');
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
        const popover = document.getElementById('previewEmojiPickerPopover');
        if (popover) popover.classList.add('hidden');
    }

    let galleryItems = [];
    let currentGalleryIndex = 0;

    function refreshGalleryItems() {
        galleryItems = [];
        const msgNodes = document.querySelectorAll('#messages .message');
        msgNodes.forEach(wrapper => {
            const rawId = wrapper.getAttribute('data-msg-id') || wrapper.getAttribute('data-client-msg-id') || wrapper.id;
            const id = (rawId && rawId.startsWith('msg-')) ? rawId.slice(4) : rawId;
            const sender = wrapper.querySelector('.msg-sender')?.textContent?.trim() || (wrapper.querySelector('.sent-message') ? username : 'User');
            const time = wrapper.querySelector('.msg-time')?.textContent?.trim() || '';

            const img = wrapper.querySelector('img.message-file-preview');
            const vid = wrapper.querySelector('video.message-file-preview, video.snap-video');
            if (img && img.src) {
                galleryItems.push({
                    src: img.src,
                    type: 'image',
                    sender,
                    timestamp: time,
                    messageId: id
                });
            } else if (vid && vid.src) {
                galleryItems.push({
                    src: vid.src,
                    type: 'video',
                    sender,
                    timestamp: time,
                    messageId: id
                });
            }
        });
    }

    function loadGalleryItem(index) {
        if (!galleryItems || galleryItems.length === 0) return;
        currentGalleryIndex = Math.max(0, Math.min(galleryItems.length - 1, index));
        const item = galleryItems[currentGalleryIndex];

        previewZoom = 1;
        previewPanX = 0;
        previewPanY = 0;
        isPanning = false;
        hadMultiTouch = false;
        maxPointerMovement = 0;
        activePointers.clear();

        const senderEl = document.getElementById('previewSenderName');
        const timeEl = document.getElementById('previewTimestamp');
        const posEl = document.getElementById('previewGalleryPosition');
        if (senderEl) senderEl.textContent = `~${item.sender}`;
        if (timeEl) timeEl.textContent = item.timestamp || '';
        if (posEl) posEl.textContent = `${currentGalleryIndex + 1} of ${galleryItems.length}`;

        const isVid = item.type === 'video';
        if (isVid) {
            previewContent.innerHTML = `<video src="${item.src}" controls autoplay playsinline class="max-w-[96vw] max-h-[80vh] object-contain rounded-lg"></video>`;
        } else {
            previewContent.innerHTML = `<img id="previewActiveImage" src="${item.src}" class="preview-zoomable-img" draggable="true" alt="Preview" style="cursor: grab !important; -webkit-user-drag: element !important; user-select: auto !important;">`;
            const activeImg = document.getElementById("previewActiveImage");
            if (activeImg) {
                activeImg.draggable = true;
                activeImg.addEventListener('dragstart', (e) => {
                    isMediaDragging = true;
                    activePointers.clear();
                    try {
                        if (e.dataTransfer) {
                            e.dataTransfer.effectAllowed = 'copyMove';
                            const fullUrl = activeImg.src.startsWith('http') || activeImg.src.startsWith('data:') 
                                ? activeImg.src 
                                : new URL(activeImg.src, window.location.origin).href;
                            e.dataTransfer.setData('text/uri-list', fullUrl);
                            e.dataTransfer.setData('URL', fullUrl);
                            e.dataTransfer.setData('text/plain', fullUrl);
                            e.dataTransfer.setData('text/html', `<img src="${fullUrl}" alt="Media">`);
                            try {
                                const cleanUrl = fullUrl.split('?')[0];
                                const ext = cleanUrl.split('.').pop().toLowerCase();
                                const mime = (ext === 'png') ? 'image/png' : ((ext === 'webp') ? 'image/webp' : ((ext === 'gif') ? 'image/gif' : 'image/jpeg'));
                                const filename = cleanUrl.split('/').pop() || `media-${Date.now()}.${ext || 'jpg'}`;
                                e.dataTransfer.setData('DownloadURL', `${mime}:${filename}:${fullUrl}`);
                            } catch (_) {}
                        }
                    } catch (_) {}
                });
                activeImg.addEventListener('dragend', () => {
                    setTimeout(() => {
                        isMediaDragging = false;
                    }, 200);
                });
            }
        }

        // Update circular navigation arrow visibility based on gallery length
        const prevBtn = document.getElementById('previewPrevBtn');
        const nextBtn = document.getElementById('previewNextBtn');
        const hasMultiple = galleryItems && galleryItems.length > 1;
        if (prevBtn) {
            prevBtn.style.setProperty('display', hasMultiple ? 'flex' : 'none', 'important');
        }
        if (nextBtn) {
            nextBtn.style.setProperty('display', hasMultiple ? 'flex' : 'none', 'important');
        }

        if (previewModal) {
            previewModal.setAttribute('data-active-message-id', item.messageId);
        }
    }

    function openPreview(src, type = 'image', messageId = null) {
        if (!previewModal || !previewContent) return;
        refreshGalleryItems();

        const normalizeUrl = (u) => {
            if (!u) return '';
            try { return new URL(u, window.location.origin).pathname; } catch (_) { return u; }
        };
        const resolvedPath = normalizeUrl(src);

        let targetIndex = -1;
        if (messageId) {
            targetIndex = galleryItems.findIndex(it => it.messageId === messageId);
        }
        if (targetIndex === -1) {
            targetIndex = galleryItems.findIndex(it => normalizeUrl(it.src) === resolvedPath || it.src === src);
        }
        if (targetIndex === -1 && galleryItems.length > 0) {
            targetIndex = 0;
        }

        if (targetIndex === -1) {
            galleryItems.push({
                src: src,
                type: (typeof type === 'string' && type.startsWith('video')) ? 'video' : 'image',
                sender: username,
                timestamp: '',
                messageId: messageId || ''
            });
            targetIndex = galleryItems.length - 1;
        } else if (messageId && !galleryItems[targetIndex].messageId) {
            galleryItems[targetIndex].messageId = messageId;
        }

        previewOpenedTime = Date.now();
        previewModal.classList.remove('hidden');
        previewModal.style.setProperty('display', 'flex', 'important');
        loadGalleryItem(targetIndex);
    }
    window.openPreview = openPreview;
    window.closePreviewModal = closePreviewModal;

    const previewBackBtn = document.getElementById('previewBackBtn');
    if (previewBackBtn) previewBackBtn.onclick = (e) => { e.stopPropagation(); closePreviewModal(); };

    const closePreviewBtn = document.getElementById('closePreview');
    if (closePreviewBtn) {
        closePreviewBtn.onclick = (e) => {
            e.stopPropagation();
            closePreviewModal();
        };
    }

    const previewFullscreenBtn = document.getElementById('previewFullscreenBtn');
    if (previewFullscreenBtn) {
        previewFullscreenBtn.onclick = (e) => {
            e.stopPropagation();
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
            } else {
                if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
            }
        };
        document.addEventListener('fullscreenchange', () => {
            const icon = document.getElementById('previewFullscreenIcon');
            if (icon) {
                if (document.fullscreenElement) {
                    icon.className = 'fas fa-compress';
                } else {
                    icon.className = 'fas fa-expand';
                }
            }
        });
    }

    const previewPrevBtn = document.getElementById('previewPrevBtn');
    if (previewPrevBtn) {
        previewPrevBtn.onclick = (e) => {
            e.stopPropagation();
            if (!galleryItems || galleryItems.length <= 1) return;
            const prevIdx = (currentGalleryIndex - 1 + galleryItems.length) % galleryItems.length;
            loadGalleryItem(prevIdx);
        };
    }

    const previewNextBtn = document.getElementById('previewNextBtn');
    if (previewNextBtn) {
        previewNextBtn.onclick = (e) => {
            e.stopPropagation();
            if (!galleryItems || galleryItems.length <= 1) return;
            const nextIdx = (currentGalleryIndex + 1) % galleryItems.length;
            loadGalleryItem(nextIdx);
        };
    }

    const previewDownloadBtn = document.getElementById('previewDownloadBtn');
    if (previewDownloadBtn) {
        previewDownloadBtn.onclick = (e) => {
            e.stopPropagation();
            if (galleryItems[currentGalleryIndex]) {
                const item = galleryItems[currentGalleryIndex];
                const a = document.createElement('a');
                a.href = item.src;
                a.download = `media-${Date.now()}.${item.type === 'video' ? 'mp4' : 'jpg'}`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                showToast('Downloading media…');
            }
        };
    }

    const previewShareBtn = document.getElementById('previewShareBtn');
    if (previewShareBtn) {
        previewShareBtn.onclick = async (e) => {
            e.stopPropagation();
            if (!galleryItems[currentGalleryIndex]) return;
            const item = galleryItems[currentGalleryIndex];
            try {
                if (window.Capacitor?.Plugins?.Share) {
                    await window.Capacitor.Plugins.Share.share({
                        title: 'Shared Media',
                        url: item.src
                    });
                } else if (navigator.share) {
                    await navigator.share({
                        title: 'Shared Media',
                        url: item.src
                    });
                } else {
                    await navigator.clipboard.writeText(item.src);
                    showToast('Link copied to clipboard');
                }
            } catch (err) {
                if (err && err.name !== 'AbortError') {
                    navigator.clipboard.writeText(item.src).catch(() => {});
                    showToast('Link copied to clipboard');
                }
            }
        };
    }

    document.querySelectorAll('.viewer-emoji-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const emoji = btn.getAttribute('data-emoji');
            let msgId = previewModal?.getAttribute('data-active-message-id');
            if (!msgId && galleryItems[currentGalleryIndex]) {
                msgId = galleryItems[currentGalleryIndex].messageId;
            }
            if (msgId && emoji) {
                sendReaction(msgId, emoji);
                showToast(`Reacted with ${emoji}`);
            }
        };
    });

    const previewReactPlusBtn = document.getElementById('previewReactPlusBtn');
    const previewEmojiPickerPopover = document.getElementById('previewEmojiPickerPopover');
    const previewEmojiGrid = document.getElementById('previewEmojiGrid');
    const previewEmojiSearch = document.getElementById('previewEmojiSearch');
    const closePreviewEmojiPicker = document.getElementById('closePreviewEmojiPicker');

    function populatePreviewEmojiGrid(filter = '') {
        if (!previewEmojiGrid) return;
        previewEmojiGrid.innerHTML = '';
        const popularEmojis = [
            '👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '👏', '💯', '✨', '😍', 
            '🥰', '😎', '🤔', '🙄', '🥳', '🥺', '😭', '🤯', '😱', '💩', '🤝', '🙌', 
            '💪', '🎯', '🚀', '⭐', '👀', '💖', '💀', '🤡', '⚡', '🌟', '🎈', '🍕', 
            '🍻', '☕', '🧁', '🍦', '🌹', '🌈', '🥑', '🏆', '🎁', '💡'
        ];
        const allList = (Array.isArray(emojis) && emojis.length > 0) ? [...new Set([...popularEmojis, ...emojis])] : popularEmojis;
        const lowerFilter = filter.toLowerCase().trim();
        
        let count = 0;
        for (const emoji of allList) {
            if (count >= 140) break;
            if (lowerFilter && !emoji.includes(lowerFilter)) continue;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'w-9 h-9 rounded-lg hover:bg-white/15 flex items-center justify-center text-xl transition-transform active:scale-90 cursor-pointer select-none';
            btn.textContent = emoji;
            btn.onclick = (e) => {
                e.stopPropagation();
                let msgId = previewModal?.getAttribute('data-active-message-id');
                if (!msgId && galleryItems[currentGalleryIndex]) {
                    msgId = galleryItems[currentGalleryIndex].messageId;
                }
                if (msgId) {
                    sendReaction(msgId, emoji);
                    showToast(`Reacted with ${emoji}`);
                } else {
                    showToast(`Reaction sent: ${emoji}`);
                }
                if (previewEmojiPickerPopover) previewEmojiPickerPopover.classList.add('hidden');
            };
            previewEmojiGrid.appendChild(btn);
            count++;
        }
    }

    if (previewReactPlusBtn) {
        previewReactPlusBtn.onclick = (e) => {
            e.stopPropagation();
            if (!previewEmojiPickerPopover) return;
            const isHidden = previewEmojiPickerPopover.classList.contains('hidden');
            if (isHidden) {
                previewEmojiPickerPopover.classList.remove('hidden');
                populatePreviewEmojiGrid();
                if (previewEmojiSearch) {
                    previewEmojiSearch.value = '';
                    setTimeout(() => previewEmojiSearch.focus(), 60);
                }
            } else {
                previewEmojiPickerPopover.classList.add('hidden');
            }
        };
    }

    if (closePreviewEmojiPicker) {
        closePreviewEmojiPicker.onclick = (e) => {
            e.stopPropagation();
            if (previewEmojiPickerPopover) previewEmojiPickerPopover.classList.add('hidden');
        };
    }

    if (previewEmojiSearch) {
        previewEmojiSearch.onclick = (e) => e.stopPropagation();
        previewEmojiSearch.oninput = () => {
            populatePreviewEmojiGrid(previewEmojiSearch.value);
        };
    }

    document.addEventListener('click', (e) => {
        if (previewEmojiPickerPopover && !previewEmojiPickerPopover.classList.contains('hidden')) {
            if (!previewEmojiPickerPopover.contains(e.target) && !previewReactPlusBtn?.contains(e.target)) {
                previewEmojiPickerPopover.classList.add('hidden');
            }
        }
    });

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
            if (e.target.closest('button, a, input, textarea, #previewEmojiPickerPopover, .viewer-reactions-bar')) return;
            if (isMediaDragging) return;
            const img = document.getElementById("previewActiveImage");

            activePointers.set(e.pointerId, {
                x: e.clientX,
                y: e.clientY,
                startX: e.clientX,
                startY: e.clientY,
                pointerType: e.pointerType
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
            if (isMediaDragging || !activePointers.has(e.pointerId)) return;
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
            if (isMediaDragging) {
                activePointers.clear();
                return;
            }
            const ptr = activePointers.get(e.pointerId);
            if (activePointers.has(e.pointerId)) {
                activePointers.delete(e.pointerId);
            }
            if (activePointers.size === 0) {
                const img = document.getElementById("previewActiveImage");
                if (img) img.classList.remove('is-dragging');
                isPanning = false;

                // Swipe left/right gallery navigation (ONLY for touch gestures, not mouse drag!)
                if (!hadMultiTouch && previewZoom === 1 && ptr && ptr.pointerType === 'touch' && maxPointerMovement > 40) {
                    const deltaX = e.clientX - ptr.startX;
                    if (deltaX < -40) {
                        if (galleryItems && galleryItems.length > 1) {
                            loadGalleryItem((currentGalleryIndex + 1) % galleryItems.length);
                        }
                        return;
                    } else if (deltaX > 40) {
                        if (galleryItems && galleryItems.length > 1) {
                            loadGalleryItem((currentGalleryIndex - 1 + galleryItems.length) % galleryItems.length);
                        }
                        return;
                    }
                }

                function handleBackdropTapOrClick(ev) {
                    if (isMediaDragging) return;
                    // Guard: If clicking directly on or inside the actual media, DO NOT close
                    if (ev.target.closest('#previewActiveImage, #previewContent img, #previewContent video, #previewContent audio, .preview-zoomable-img')) {
                        return;
                    }

                    // Guard: If clicking an interactive button or control, DO NOT close
                    if (ev.target.closest('button, a, input, textarea, #previewEmojiPickerPopover, .viewer-reactions-bar')) {
                        return;
                    }

                    // Popover: If emoji picker popover is open, close only the popover
                    if (previewEmojiPickerPopover && !previewEmojiPickerPopover.classList.contains('hidden')) {
                        if (!previewEmojiPickerPopover.contains(ev.target)) {
                            previewEmojiPickerPopover.classList.add('hidden');
                            return;
                        }
                    }

                    // Gesture guard: If actively panning a zoomed image or multi-touch pinching, DO NOT close
                    if (isPanning || hadMultiTouch) {
                        return;
                    }

                    // Anywhere else on screen tapped/clicked -> take user back to chat!
                    if (ev.stopPropagation) ev.stopPropagation();
                    closePreviewModal();
                }

                // If pointer movement was within tap/click range (<= 25px, not a swipe or drag)
                if (!hadMultiTouch && maxPointerMovement <= 25) {
                    handleBackdropTapOrClick(e);
                }
            }
        };

        previewModal.addEventListener('pointerup', handlePointerEnd);
        previewModal.addEventListener('pointercancel', handlePointerEnd);

        // Click-to-close listener for desktop mouse and standard click events
        function onPreviewModalClick(e) {
            if (isMediaDragging) return;
            // Guard: If clicking directly on or inside the actual media, DO NOT close
            if (e.target.closest('#previewActiveImage, #previewContent img, #previewContent video, #previewContent audio, .preview-zoomable-img')) {
                return;
            }

            // Guard: If clicking an interactive button or control, DO NOT close
            if (e.target.closest('button, a, input, textarea, #previewEmojiPickerPopover, .viewer-reactions-bar')) {
                return;
            }

            // Popover: If emoji picker popover is open, close only the popover
            if (previewEmojiPickerPopover && !previewEmojiPickerPopover.classList.contains('hidden')) {
                if (!previewEmojiPickerPopover.contains(e.target)) {
                    previewEmojiPickerPopover.classList.add('hidden');
                    return;
                }
            }

            // If user did a large drag (> 25px) or multi-touch, do not close on click
            if (hadMultiTouch || maxPointerMovement > 25) {
                return;
            }

            e.stopPropagation();
            closePreviewModal();
        }

        previewModal.addEventListener('click', onPreviewModalClick);
        if (previewContent) {
            previewContent.addEventListener('click', onPreviewModalClick);
        }

        // Escape, ArrowLeft, ArrowRight keys for modal
        window.addEventListener('keydown', (e) => {
            if (!previewModal || previewModal.classList.contains('hidden')) return;
            if (e.key === 'ArrowLeft') {
                if (galleryItems && galleryItems.length > 1) {
                    loadGalleryItem((currentGalleryIndex - 1 + galleryItems.length) % galleryItems.length);
                }
            } else if (e.key === 'ArrowRight') {
                if (galleryItems && galleryItems.length > 1) {
                    loadGalleryItem((currentGalleryIndex + 1) % galleryItems.length);
                }
            } else if (e.key === 'Escape') {
                closePreviewModal();
            }
        });
    }

    messagesDiv.addEventListener('click', (e) => {
        if (Date.now() - lastPreviewClosedTime < 300) {
            return; // Guard against click bleed-through from closing the preview modal
        }
        if (e.target.closest('a, button, .media-download-btn, .file-action-btn, .desktop-reply-btn, .quoted-reply, .reaction-chip')) {
            return;
        }
        const mediaEl = e.target.closest('.message-file-preview, .sticker-message') ||
                        e.target.closest('.media-container, .message-bubble-media')?.querySelector('.message-file-preview, .sticker-message');
        if (mediaEl) {
            let type = 'image/png';
            if (mediaEl.tagName === 'IMG') {
                type = mediaEl.src.endsWith('.gif') ? 'gif' : 'image/png';
            } else if (mediaEl.tagName === 'VIDEO') {
                type = 'video/mp4';
            }
            const wrapper = mediaEl.closest('.message');
            const rawId = wrapper ? (wrapper.getAttribute('data-msg-id') || wrapper.getAttribute('data-client-msg-id') || wrapper.id) : null;
            const msgId = (rawId && rawId.startsWith('msg-')) ? rawId.slice(4) : rawId;
            openPreview(mediaEl.src, type, msgId);
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
            shouldKeepKeyboardOpen = true;
            isUniversalBackDismissal = false;
            try {
                if (!history.state || history.state.chatKeyboard !== 'open') {
                    history.pushState({ ...(history.state || {}), chatKeyboard: 'open' }, '');
                }
            } catch (e) {}

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
            if (shouldKeepKeyboardOpen && !isUniversalBackDismissal) {
                requestAnimationFrame(() => {
                    if (shouldKeepKeyboardOpen && !isUniversalBackDismissal && messageInput) {
                        messageInput.focus();
                    }
                });
                return;
            }
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

    // Unified Pointer Events Swipe-to-Reply (Phase 11)
    let pointerStartX = 0;
    let pointerStartY = 0;
    let activePointerId = null;
    let activeSwipeBubble = null;
    let activeSwipeWrapper = null;
    let activeSwipeRow = null;
    let activeSwipeIcon = null;
    let isSwipeLocked = false;
    let currentClampedX = 0;
    let swipeRafId = null;

    function resetSwipeVisuals(bubble, icon) {
        if (bubble) {
            bubble.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
            bubble.style.transform = 'translateX(0px)';
            setTimeout(() => {
                if (bubble) {
                    bubble.style.transition = '';
                    bubble.style.transform = '';
                }
            }, 240);
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

    if (chatScreen) {
        chatScreen.addEventListener('pointerdown', (e) => {
            if (shouldKeepKeyboardOpen && !isUniversalBackDismissal) {
                if (e.target.closest('a, button, input, textarea, .file-action-btn, .reply-cancel-btn, #previewModal, .desktop-reply-btn, .voice-play-btn, .voice-waveform-track, .voice-speed-btn, .voice-download-btn, .media-download-btn, .reaction-chip, #messageContextMenu, .modal')) {
                    return;
                }
                e.preventDefault();
                if (document.activeElement !== messageInput && messageInput) {
                    messageInput.focus();
                }
            }
        });
    }

    if (messagesDiv) {
        messagesDiv.addEventListener('pointerdown', (e) => {
            // Swipe-to-reply pointerdown
            if (e.isPrimary === false || (e.button && e.button !== 0)) return;

            // Ignore drags within 24px of the left screen edge (Android back gesture safe zone)
            if (e.clientX <= 24) return;

            // Ignore only actual interactive action buttons/inputs
            if (e.target.closest('a, button, input, textarea, .file-action-btn, .reply-cancel-btn, #previewModal, .desktop-reply-btn, .voice-play-btn, .voice-waveform-track, .voice-speed-btn, .voice-download-btn, .media-download-btn, .reaction-chip, #messageContextMenu')) {
                return;
            }

            const messageBubble = e.target.closest('.sent-message, .received-message, .message-bubble, .message-bubble-media, .file-document-bubble, .sticker-bubble, .snap-container, .snap-bubble');
            if (!messageBubble) return;

            const messageWrapper = messageBubble.closest('.message');
            if (!messageWrapper || !messageWrapper.id) return;

            const messageRow = messageBubble.closest('.message-row');

            pointerStartX = e.clientX;
            pointerStartY = e.clientY;
            activePointerId = e.pointerId;
            activeSwipeBubble = messageBubble;
            activeSwipeWrapper = messageWrapper;
            activeSwipeRow = messageRow;
            activeSwipeIcon = null;
            isSwipeLocked = false;
            currentClampedX = 0;

            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }
            longPressTimeout = setTimeout(() => {
                if (!isSwipeLocked && messageWrapper) {
                    openMessageContextMenu(messageWrapper, e.clientX, e.clientY);
                    if (activeSwipeBubble) {
                        try { activeSwipeBubble.releasePointerCapture(activePointerId); } catch (_) {}
                    }
                    activePointerId = null;
                    activeSwipeBubble = null;
                    isSwipeLocked = false;
                }
            }, 450);
        });

        // Prevent native text selection on messages
        messagesDiv.addEventListener('selectstart', (e) => {
            if (e.target.closest('input, textarea, #messageInput')) return;
            e.preventDefault();
        });

        // Delegated click handler for tapping quoted replies
        messagesDiv.addEventListener('click', (e) => {
            const quote = e.target.closest('.quoted-reply');
            if (quote) {
                const targetId = quote.getAttribute('data-reply-id');
                if (targetId) {
                    scrollToMessage(targetId);
                }
            }
        });

        // Context menu (right-click / long-press alternative)
        messagesDiv.addEventListener('contextmenu', (e) => {
            const bubble = e.target.closest('.sent-message, .received-message, .message-bubble, .message-bubble-media, .file-document-bubble, .sticker-bubble, .snap-container, .snap-bubble');
            if (bubble) {
                e.preventDefault();
                const wrapper = bubble.closest('.message');
                if (wrapper) {
                    openMessageContextMenu(wrapper, e.clientX, e.clientY);
                }
            }
        });

        // Prevent native HTML5 text drag from interrupting pointer events
        messagesDiv.addEventListener('dragstart', (e) => {
            e.preventDefault();
        });

        let swipeJustFinished = false;
        window.addEventListener('click', (e) => {
            if (swipeJustFinished) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);

        const handlePointerMove = (e) => {
            if (activePointerId === null || e.pointerId !== activePointerId || !activeSwipeBubble) return;

            const deltaX = e.clientX - pointerStartX;
            const deltaY = Math.abs(e.clientY - pointerStartY);
            const absDeltaX = Math.abs(deltaX);

            if (absDeltaX > 6 || deltaY > 6) {
                if (longPressTimeout) {
                    clearTimeout(longPressTimeout);
                    longPressTimeout = null;
                }
            }

            if (!isSwipeLocked) {
                // If vertical movement beats horizontal, user is scrolling vertically
                if (deltaY > 10 && deltaY > absDeltaX) {
                    try {
                        activeSwipeBubble.releasePointerCapture(activePointerId);
                    } catch (_) {}
                    activePointerId = null;
                    activeSwipeBubble = null;
                    activeSwipeWrapper = null;
                    activeSwipeRow = null;
                    return;
                }

                // Horizontal movement > 8px that beats vertical: lock into drag (supports left & right)
                if (absDeltaX > 8 && absDeltaX > deltaY) {
                    isSwipeLocked = true;
                    try {
                        activeSwipeBubble.setPointerCapture(activePointerId);
                    } catch (_) {}
                } else {
                    return;
                }
            }

            if (isSwipeLocked) {
                if (e.cancelable) e.preventDefault();

                // Rubber-band calculation up to max ~72px in either direction
                const sign = deltaX >= 0 ? 1 : -1;
                const raw = absDeltaX * 0.75;
                const move = raw < 56 ? raw : 56 + (raw - 56) * 0.35;
                const moveX = sign * Math.min(Math.max(0, move), 72);
                currentClampedX = moveX;

                if (swipeRafId) cancelAnimationFrame(swipeRafId);
                swipeRafId = requestAnimationFrame(() => {
                    if (!activeSwipeBubble) return;
                    activeSwipeBubble.style.transition = 'none';
                    activeSwipeBubble.style.transform = `translateX(${currentClampedX}px)`;

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
                        const absMove = Math.abs(currentClampedX);
                        const progress = Math.min(1, absMove / 50);
                        activeSwipeIcon.style.opacity = String(Math.min(1, absMove / 22));
                        activeSwipeIcon.style.transform = `translateY(-50%) scale(${0.5 + progress * 0.65})`;

                        if (activeSwipeBubble && activeSwipeRow) {
                            const bubbleRect = activeSwipeBubble.getBoundingClientRect();
                            const rowRect = activeSwipeRow.getBoundingClientRect();
                            if (currentClampedX >= 0) {
                                // Swiping right: position icon to the left of the bubble
                                const iconLeft = Math.max(0, bubbleRect.left - rowRect.left - 38);
                                activeSwipeIcon.style.left = `${iconLeft}px`;
                                activeSwipeIcon.style.right = 'auto';
                            } else {
                                // Swiping left: position icon to the right of the bubble
                                const iconRight = Math.max(0, rowRect.right - bubbleRect.right - 38);
                                activeSwipeIcon.style.right = `${iconRight}px`;
                                activeSwipeIcon.style.left = 'auto';
                            }
                        }

                        if (absMove >= 50) {
                            if (!activeSwipeIcon.classList.contains('threshold-ready')) {
                                activeSwipeIcon.classList.add('threshold-ready');
                                if (window.Capacitor?.Plugins?.Haptics) {
                                    window.Capacitor.Plugins.Haptics.impact({ style: 'LIGHT' });
                                } else if (navigator.vibrate) {
                                    navigator.vibrate(25);
                                }
                            }
                        } else {
                            activeSwipeIcon.classList.remove('threshold-ready');
                        }
                    }
                });
            }
        };

        const handlePointerEnd = (e) => {
            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }

            if (activePointerId !== null && e.pointerId === activePointerId) {
                if (isSwipeLocked && activeSwipeWrapper && activeSwipeBubble) {
                    const isReady = Math.abs(currentClampedX) >= 50 || (activeSwipeIcon && activeSwipeIcon.classList.contains('threshold-ready'));
                    if (isReady) {
                        const targetId = activeSwipeWrapper.id;
                        setReplyContext(targetId);
                        if (window.Capacitor?.Plugins?.Haptics) {
                            window.Capacitor.Plugins.Haptics.impact({ style: 'MEDIUM' });
                        } else if (navigator.vibrate) {
                            navigator.vibrate(35);
                        }
                    }
                    swipeJustFinished = true;
                    setTimeout(() => { swipeJustFinished = false; }, 350);
                }

                try {
                    if (activeSwipeBubble && activeSwipeBubble.hasPointerCapture(e.pointerId)) {
                        activeSwipeBubble.releasePointerCapture(e.pointerId);
                    }
                } catch (_) {}

                resetSwipeVisuals(activeSwipeBubble, activeSwipeIcon);
                activePointerId = null;
                activeSwipeBubble = null;
                activeSwipeWrapper = null;
                activeSwipeRow = null;
                activeSwipeIcon = null;
                isSwipeLocked = false;
                currentClampedX = 0;
                if (swipeRafId) {
                    cancelAnimationFrame(swipeRafId);
                    swipeRafId = null;
                }
            }
        };

        window.addEventListener('pointermove', handlePointerMove, { passive: false });
        window.addEventListener('pointerup', handlePointerEnd, { passive: true });
        window.addEventListener('pointercancel', handlePointerEnd, { passive: true });
    }

    // Reaction and context menu helpers
    let longPressTimeout = null;
    let activeContextMenuTarget = null;
    const messageContextMenu = document.getElementById('messageContextMenu');

    function sendReaction(messageId, emoji) {
        if (!messageId) return;
        socket.emit("react", {
            roomKey,
            roomInstanceId,
            sessionToken,
            messageId,
            emoji
        });
    }
    window.sendReaction = sendReaction;

    function updateMessageReactions(messageId, reactions) {
        const domId = String(messageId).startsWith('msg-') ? String(messageId) : `msg-${messageId}`;
        const wrapper = document.getElementById(domId) ||
            document.querySelector(`[data-msg-id="${messageId}"]`) ||
            document.querySelector(`[data-client-msg-id="${messageId}"]`);
        if (!wrapper) return;

        let container = wrapper.querySelector('.reactions-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'reactions-container';
            wrapper.appendChild(container);
        }

        container.innerHTML = '';
        const entries = Object.entries(reactions || {}).filter(([_, users]) => users && users.length > 0);
        if (entries.length === 0) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');

        for (const [em, users] of entries) {
            const isMyReaction = users.includes(username);
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = `reaction-chip ${isMyReaction ? 'active-reaction' : ''}`;
            chip.setAttribute('data-emoji', em);
            chip.setAttribute('title', `${em} from ${users.join(', ')}`);
            chip.innerHTML = `<span class="emoji">${em}</span> <span class="count">${users.length}</span>`;
            chip.onclick = (e) => {
                e.stopPropagation();
                showToast(`${em} from ${users.join(', ')}`);
            };
            container.appendChild(chip);
        }
    }
    window.updateMessageReactions = updateMessageReactions;

    function openMessageContextMenu(wrapper, clientX, clientY) {
        if (!messageContextMenu || !wrapper) return;
        const data = extractMessageData(wrapper);
        if (!data) return;

        activeContextMenuTarget = data;
        messageContextMenu.setAttribute('data-target-msg-id', data.id);

        const isOwn = (data.senderName === username || wrapper.querySelector('.sent-message'));
        const deleteBtn = document.getElementById('ctxMenuDelete');
        if (deleteBtn) {
            deleteBtn.style.display = isOwn ? 'flex' : 'none';
        }

        const copyBtn = document.getElementById('ctxMenuCopy');
        if (copyBtn) {
            copyBtn.style.display = (data.type === 'text' && data.snippet) ? 'flex' : 'none';
        }

        const saveBtn = document.getElementById('ctxMenuSave');
        if (saveBtn) {
            saveBtn.style.display = (data.mediaSrc || data.type === 'file' || data.type === 'image' || data.type === 'video') ? 'flex' : 'none';
        }

        const menuWidth = 220;
        const menuHeight = 240;
        const x = Math.min(window.innerWidth - menuWidth - 12, Math.max(12, clientX || 50));
        const y = Math.min(window.innerHeight - menuHeight - 12, Math.max(12, clientY || 50));

        messageContextMenu.style.left = `${x}px`;
        messageContextMenu.style.top = `${y}px`;
        messageContextMenu.classList.remove('hidden');
    }

    function closeMessageContextMenu() {
        if (messageContextMenu) {
            messageContextMenu.classList.add('hidden');
            activeContextMenuTarget = null;
        }
    }
    window.openMessageContextMenu = openMessageContextMenu;
    window.closeMessageContextMenu = closeMessageContextMenu;

    if (messageContextMenu) {
        messageContextMenu.querySelectorAll('.ctx-emoji-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const emoji = btn.getAttribute('data-emoji');
                if (activeContextMenuTarget && emoji) {
                    sendReaction(activeContextMenuTarget.id, emoji);
                }
                closeMessageContextMenu();
            };
        });

        const moreEmojiBtn = messageContextMenu.querySelector('.ctx-more-emoji-btn');
        if (moreEmojiBtn) {
            moreEmojiBtn.onclick = (e) => {
                e.stopPropagation();
                if (activeContextMenuTarget) {
                    const targetId = activeContextMenuTarget.id;
                    closeMessageContextMenu();
                    const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '👏', '💯', '✨', '😍'];
                    const randomOther = emojis[Math.floor(Math.random() * emojis.length)];
                    sendReaction(targetId, randomOther);
                }
            };
        }

        const replyBtn = document.getElementById('ctxMenuReply');
        if (replyBtn) {
            replyBtn.onclick = (e) => {
                e.stopPropagation();
                if (activeContextMenuTarget) {
                    setReplyContext(activeContextMenuTarget.id);
                }
                closeMessageContextMenu();
            };
        }

        const copyBtn = document.getElementById('ctxMenuCopy');
        if (copyBtn) {
            copyBtn.onclick = async (e) => {
                e.stopPropagation();
                if (activeContextMenuTarget && activeContextMenuTarget.snippet) {
                    try {
                        await navigator.clipboard.writeText(activeContextMenuTarget.snippet);
                        showToast('Copied to clipboard');
                    } catch (_) {
                        showToast('Failed to copy');
                    }
                }
                closeMessageContextMenu();
            };
        }

        const saveBtn = document.getElementById('ctxMenuSave');
        if (saveBtn) {
            saveBtn.onclick = (e) => {
                e.stopPropagation();
                if (activeContextMenuTarget) {
                    const src = activeContextMenuTarget.mediaSrc || (activeContextMenuTarget.message?.content);
                    if (src) {
                        const a = document.createElement('a');
                        a.href = src;
                        a.download = `attachment-${Date.now()}`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        showToast('Downloading...');
                    }
                }
                closeMessageContextMenu();
            };
        }

        const deleteBtn = document.getElementById('ctxMenuDelete');
        if (deleteBtn) {
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (activeContextMenuTarget) {
                    const msgId = activeContextMenuTarget.id;
                    socket.emit("delete-message", { roomKey, roomInstanceId, sessionToken, messageId: msgId });
                    const wrapper = document.getElementById(`msg-${msgId}`) || document.getElementById(msgId);
                    if (wrapper) wrapper.remove();
                    showToast('Message deleted');
                }
                closeMessageContextMenu();
            };
        }
    }

    document.addEventListener('pointerdown', (e) => {
        if (messageContextMenu && !messageContextMenu.classList.contains('hidden') && !e.target.closest('#messageContextMenu')) {
            closeMessageContextMenu();
        }
    });

    // Extract message data: prefer window.messageDataStore, fallback to sanitized DOM
    function extractMessageData(messageWrapper) {
        if (!messageWrapper) return null;
        const messageId = messageWrapper.id;

        if (window.messageDataStore && window.messageDataStore.has(messageId)) {
            const entry = window.messageDataStore.get(messageId);
            return {
                id: entry.id,
                username: entry.senderName,
                senderName: entry.senderName,
                type: entry.type,
                snippet: entry.snippet,
                mediaSrc: entry.mediaSrc,
                message: {
                    type: entry.type,
                    content: entry.snippet
                }
            };
        }

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

        const messageBubble = messageWrapper.querySelector('.sent-message, .received-message, .message-bubble, .message-bubble-media, .file-document-bubble, .sticker-bubble, .snap-container, .snap-bubble');
        if (!messageBubble) return null;

        let message = { type: 'text', content: '' };
        let mediaSrc = null;

        if (messageBubble.querySelector('.snap-video') || messageBubble.classList.contains('snap-bubble')) {
            message = { type: 'snap', content: 'Video message' };
            const v = messageBubble.querySelector('video');
            if (v && v.src) mediaSrc = v.src;
        } else if (messageBubble.querySelector('.sticker-message')) {
            message = { type: 'sticker', content: 'Sticker' };
            const img = messageBubble.querySelector('img');
            if (img && img.src) mediaSrc = img.src;
        } else if (messageBubble.querySelector('video')) {
            message = { type: 'video', content: 'Video' };
            const v = messageBubble.querySelector('video');
            if (v && v.src) mediaSrc = v.src;
        } else if (messageBubble.querySelector('audio') || messageBubble.querySelector('.voice-player')) {
            message = { type: 'audio', content: 'Voice message' };
        } else if (messageBubble.querySelector('.message-file-preview')) {
            const img = messageBubble.querySelector('img');
            const isGif = img && (img.src?.includes('.gif') || img.src?.includes('giphy'));
            message = { type: isGif ? 'gif' : 'image', content: isGif ? 'Photo' : 'Photo' };
            if (img && img.src) mediaSrc = img.src;
        } else if (messageBubble.querySelector('.file-card-content')) {
            const fileName = messageBubble.querySelector('.file-title')?.textContent?.trim() || 'Document';
            const subText = messageBubble.querySelector('.file-subtitle')?.textContent?.trim() || '';
            const sizeStr = subText ? subText.split('•')[0].trim() : '';
            const snippet = sizeStr ? `${fileName} (${sizeStr})` : fileName;
            message = { type: 'file', content: snippet };
        } else {
            // Text message: isolate text content from timestamp .msg-time and reply elements
            const msgText = messageBubble.querySelector('.msg-text');
            if (msgText) {
                message.content = msgText.textContent.trim();
            } else {
                const clone = messageBubble.cloneNode(true);
                clone.querySelectorAll('.msg-time, .msg-sender, .quoted-reply, .seen-status, .swipe-reply-icon, .file-action-btn, .desktop-reply-btn')
                     .forEach(el => el.remove());
                message.content = clone.textContent.trim();
            }
        }

        const formatted = {
            id: messageId,
            username: sender,
            senderName: sender,
            type: message.type,
            snippet: message.content,
            mediaSrc,
            message
        };

        if (!window.messageDataStore) window.messageDataStore = new Map();
        window.messageDataStore.set(messageId, formatted);
        return formatted;
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
    socket.on("room-creation-error", (m) => appAlert(m, "Invalid Room Key"));

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

    socket.on("chat-message", (msg) => {
        if (!msg) return;
        if (msg.clientMsgId) {
            incomingMediaTrackers.delete(msg.clientMsgId);
        }
        renderMessageBubble({
            username: msg.username,
            message: msg.message,
            file: msg.file,
            id: msg.id,
            clientMsgId: msg.clientMsgId || msg.id,
            seenBy: msg.seenBy || [],
            replyTo: msg.replyTo || null,
            reactions: msg.reactions || msg.message?.reactions || null
        });
    });

    socket.on("media-incoming", (data) => {
        if (!data || data.username === username) return;
        createReceiverMediaPlaceholder(data);
    });

    socket.on("media-progress", ({ clientMsgId, loaded, total }) => {
        updateIncomingProgress(clientMsgId, loaded, total);
    });

    socket.on("media-cancelled", ({ clientMsgId }) => {
        handleMediaCancelled(clientMsgId);
    });

    socket.on("reactions-updated", ({ messageId, reactions }) => {
        updateMessageReactions(messageId, reactions);
    });

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

            function extractInviteKey() {
                const hash = window.location.hash || "";
                if (hash.startsWith("#join=")) {
                    return decodeURIComponent(hash.substring(6).trim());
                }
                if (searchParams.has("room")) {
                    return decodeURIComponent(searchParams.get("room").trim());
                }
                return null;
            }

            const inviteKeyOnLoad = extractInviteKey();
            if (inviteKeyOnLoad) {
                handleInviteLink(inviteKeyOnLoad);
                document.documentElement.classList.remove("loading-file-room");
                return;
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

        function handleInviteLink(code) {
            if (!code) return;
            const cleanCode = code.trim();
            if (!cleanCode) return;
            pendingInviteKey = cleanCode;

            // Clear URL fragment or query so room key is not retained in browser address bar
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname);
            }

            const panelChatRoom = document.getElementById("panelChatRoom");
            const askToJoinScreen = document.getElementById("askToJoinScreen") || document.getElementById("panelJoinInvite");
            const roomUnavailableState = document.getElementById("roomUnavailableState");
            const inviteRoomKeyDisplay = document.getElementById("inviteRoomKeyDisplay");
            const askRoomOnlineText = document.getElementById("askRoomOnlineText");
            const inviteUsername = document.getElementById("inviteUsername");
            const inviteJoinStatus = document.getElementById("inviteJoinStatus");
            const askJoinRoomBtn = document.getElementById("askJoinRoomBtn") || document.getElementById("askToJoinBtn");

            function applyPeek(res) {
                if (res && res.exists && !res.full) {
                    if (roomUnavailableState) roomUnavailableState.classList.add("hidden");
                    if (panelChatRoom) panelChatRoom.classList.add("hidden");
                    if (askToJoinScreen) askToJoinScreen.classList.remove("hidden");
                    if (inviteRoomKeyDisplay) inviteRoomKeyDisplay.textContent = cleanCode;
                    if (askRoomOnlineText) {
                        const count = res.onlineCount || 0;
                        askRoomOnlineText.textContent = `${count} ${count === 1 ? 'person' : 'people'} online`;
                    }
                    if (inviteJoinStatus) inviteJoinStatus.classList.add("hidden");
                    if (askJoinRoomBtn) {
                        askJoinRoomBtn.disabled = false;
                        askJoinRoomBtn.classList.remove("opacity-50", "pointer-events-none");
                    }

                    const savedUser = localStorage.getItem("username") || (usernameInput ? usernameInput.value : "");
                    if (inviteUsername) {
                        if (savedUser) inviteUsername.value = savedUser;
                        setTimeout(() => inviteUsername.focus(), 250);
                    }
                } else {
                    if (panelChatRoom) panelChatRoom.classList.add("hidden");
                    if (askToJoinScreen) askToJoinScreen.classList.add("hidden");
                    if (roomUnavailableState) {
                        roomUnavailableState.classList.remove("hidden");
                        const reasonEl = document.getElementById("roomUnavailableReason");
                        if (reasonEl) {
                            reasonEl.textContent = (res && res.full)
                                ? "This room has reached its maximum member limit."
                                : "The room you were invited to has expired, ended, or does not exist.";
                        }
                    }
                }
            }

            function queryPeek() {
                let peeked = false;
                const onPeekResponse = (res) => {
                    if (peeked) return;
                    peeked = true;
                    socket.off("peek-room-response", onPeekResponse);
                    applyPeek(res);
                };
                socket.once("peek-room-response", onPeekResponse);
                socket.emit("peek-room", { roomKey: cleanCode }, (res) => {
                    if (peeked) return;
                    peeked = true;
                    socket.off("peek-room-response", onPeekResponse);
                    applyPeek(res);
                });
                setTimeout(() => {
                    if (!peeked) {
                        peeked = true;
                        socket.off("peek-room-response", onPeekResponse);
                        applyPeek({ exists: false });
                    }
                }, 6000);
            }

            if (socket.connected) {
                queryPeek();
            } else {
                socket.once("connect", queryPeek);
            }
        }

        window.addEventListener("hashchange", () => {
            const hash = window.location.hash || "";
            if (hash.startsWith("#join=")) {
                handleInviteLink(decodeURIComponent(hash.substring(6).trim()));
            }
        });

        if (window.Capacitor?.Plugins?.App) {
            window.Capacitor.Plugins.App.addListener('appUrlOpen', (data) => {
                if (data && data.url) {
                    try {
                        const parsed = new URL(data.url);
                        if (parsed.hash && parsed.hash.startsWith('#join=')) {
                            handleInviteLink(decodeURIComponent(parsed.hash.substring(6)));
                        } else if (parsed.searchParams.has('room')) {
                            handleInviteLink(parsed.searchParams.get('room'));
                        }
                    } catch (e) {
                        console.warn('appUrlOpen error:', e);
                    }
                }
            });
        }

        // Handle popstate for back/forward navigation and mobile back gesture keyboard dismissal
        window.addEventListener("popstate", (e) => {
            if (shouldKeepKeyboardOpen || document.activeElement === messageInput || (typeof isNativeKeyboardOpen !== 'undefined' && isNativeKeyboardOpen)) {
                isUniversalBackDismissal = true;
                shouldKeepKeyboardOpen = false;
                if (messageInput) messageInput.blur();
                if (window.Capacitor?.Plugins?.Keyboard) {
                    window.Capacitor.Plugins.Keyboard.hide();
                }
                setTimeout(() => {
                    isUniversalBackDismissal = false;
                }, 400);
                return;
            }
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
                if (shouldKeepKeyboardOpen || isNativeKeyboardOpen || document.activeElement === messageInput) {
                    isUniversalBackDismissal = true;
                    shouldKeepKeyboardOpen = false;
                    messageInput.blur();
                    if (Keyboard) {
                        Keyboard.hide();
                    }
                    isNativeKeyboardOpen = false;
                    setTimeout(() => {
                        isUniversalBackDismissal = false;
                    }, 400);
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