# Anon-Chat Verification & Audit Report (v3)

**Test Environment:** Windows, Node v18+, Chromium (390x844 viewport, touch enabled, fake media stream), Local Node Server (`http://localhost:3000`).
**Date:** October 2026

---

## 1. Initial Behavior Audit (BEFORE Changes)

| Item / Phase | Status | Screenshot | Root Cause / Observation |
|---|---|---|---|
| **REG-1**: Send keeps keyboard focus | **PASS** | `verify/screenshots/reg1_focus.png` | Focus preserved on `#messageInput` across send action (`isFocusedBefore=true`, `isFocusedAfter=true`). |
| **REG-2**: Voice recorder UI | **PASS** | `verify/screenshots/reg2_voice_ui.png` | Voice recorder row and mic button are present with in-place waveform and timer UI. |
| **REG-3**: Status-bar / safe-area spacing | **PASS** | `verify/screenshots/reg3_safe_area.png` | Safe area insets applied with CSS variables and padding. |
| **REG-4**: App-styled dialogs (no native alerts) | **PASS** | `verify/screenshots/reg4_dialogs.png` | `window.appAlert` and `window.appConfirm` defined and active; native dialogs suppressed. |
| **REG-5**: No in-app Stickers tab | **PASS** | `verify/screenshots/reg5_no_stickers.png` | Stickers tab removed from media picker; only Emoji and GIF tabs exist. |
| **Phase 1**: One render path + reliable sending | **FAIL** | `verify/screenshots/phase1_rapid_send.png` | No client-side tap lock/cooldown; no server-side deduplication per room instance (`clientMsgId` missing in dedupe map); multiple rapid taps fire redundant uploads/emits. |
| **Phase 2**: Room identity, stale session, ghost messages | **FAIL** | `verify/screenshots/phase2a_stale_restore.png` | Client restores `#chatScreen` directly from localStorage without server revalidation; server `rejoin-room` recreates dead room on key alone; sockets reconnect by key instead of instance token. |
| **Phase 3**: Busy/processing state on every button | **FAIL** | `verify/screenshots/phase3_busy_click.png` | Buttons lack `withBusy` wrapper, aria-busy attribute, inline spinner on pointerdown, and active press feedback. |
| **Phase 4**: Composer layout (WhatsApp arrangement) | **FAIL** | `verify/screenshots/phase4_composer_layout.png` | Pill currently ordered as `[emoji] [input] [attach] [mic]`; camera button is missing; mic is inside pill rather than external round button. |
| **Phase 5**: Rewrite media draft tray | **FAIL** | `verify/screenshots/phase5_media_tray.png` | `window.mediaDraft` module does not exist; legacy DOM strip with stray overlays and unvalidated previews is used. |
| **Phase 6**: Pending bubbles with progress, cancel, retry | **FAIL** | `verify/screenshots/phase6_pending_bubbles.png` | No local pending bubbles with XHR upload progress indicators, retry, or cancel hooks exist in the message stream. |
| **Phase 7**: Responsive media sizing | **FAIL** | `verify/screenshots/phase7_media_sizing.png` | Media bubbles lack strict `max-width: min(78%, 360px)` and aspect-ratio reservation, leading to layout jumps. |
| **Phase 8**: Image lightbox | **FAIL** | `verify/screenshots/phase8_lightbox.png` | Lightbox lacks smooth pinch zoom, clamped drag-to-pan, and tap-anywhere-to-close gesture threshold handling. |
| **Phase 9**: Camera button: tap = photo, hold = circular snap | **FAIL** | `verify/screenshots/phase9_camera_snap.png` | `#cameraBtn` element does not exist; front-facing circular video recorder with progress ring and review overlay missing. |
| **Phase 10**: Emoji and GIF pickers in native mode | **FAIL** | `verify/screenshots/phase10_native_pickers.png` | When `Capacitor.isNativePlatform() === true`, picker loads 0 items because API requests resolve to relative paths without API_BASE or fail silently without fallback. |
| **Phase 11**: Reply UX | **FAIL** | `verify/screenshots/phase11_reply_ux.png` | Quotes scrape DOM text including timestamps; swipe-to-reply lacks visible drag translation, reply icon fade/pop, and pointer gesture lock. |
| **Phase 12**: Share button placement + Ask to join page | **FAIL** | `verify/screenshots/phase12_share_ask.png` | Header contains Share button; opening `#join=key` or `?room=key` does not display dedicated "Ask to join" screen with live online count. |
| **Phase 13**: Keyboard GIFs/stickers | **FAIL** | `verify/screenshots/phase13_keyboard_stickers.png` | Android WebView lacks input connection MIME type advertisement (`image/gif`, `png`, `webp`) and `keyboardContent` bridge to mediaDraft. |

---

## 2. Root Cause Analysis Summary

1. **Phase 1 (Duplicate Sends / One Render Path):** Message creation paths are fragmented between text messages, uploaded files, and voice notes. Neither client-generated UUIDs nor server-side instance deduplication maps exist. Rapid taps fire parallel requests without client-side cooldown or queue throttling.
2. **Phase 2 (Stale Session & Ghost Messages):**
   - Rooms are tracked in `server.js` purely by `roomKey` (string) rather than a unique `roomInstanceId` (UUID).
   - `rejoin-room` in `server.js` actually auto-recreates empty rooms if the user was admin.
   - Socket.IO reconnect re-joins by key without verifying if the instance ended.
   - Client persists `anon_room_key` in localStorage and unconditionally restores `#chatScreen` on page reload.
3. **Phase 3 (Button Busy Feedback):** No centralized `withBusy` handler exists; buttons do not set `aria-busy="true"`, do not display spinners, and do not disable further clicks during asynchronous operations.
4. **Phase 4 (Composer Layout):** The markup in `index.html` has `emojiBtn` on the far left, `fileBtn` and `recordBtn` on the right inside `.composer-wrapper`, and `#sendBtn` outside. There is no `#cameraBtn`, and the mic is not placed in the external round button.
5. **Phase 5 (Media Draft Tray):** Media drafts are appended ad-hoc into `#mediaPreviews` without a dedicated `mediaDraft` state manager, 10-item limit, duplicate detection, or unified send integration.
6. **Phase 6 (Pending Upload Bubbles):** Uploads are sent using `fetch` or background promises without creating inline pending message bubbles with XHR `upload.onprogress`.
7. **Phase 7 (Responsive Sizing):** CSS lacks `max-width: min(78%, 360px)` bubble constraint and aspect-ratio reservation metadata.
8. **Phase 8 (Lightbox):** Lightbox handler uses simple click toggling without pinch/pan pointer math and tap gesture distance differentiation (>8px).
9. **Phase 9 (Camera / Snap):** Camera trigger button and circular canvas/video MediaRecorder pipeline are not implemented.
10. **Phase 10 (Native Pickers):** In native mode (`window.Capacitor.isNativePlatform() === true`), `/api/gifs` and `/emojis.json` fail because relative URLs resolve against `https://localhost` or `capacitor://localhost` instead of `API_BASE` or local assets, and errors are silently ignored.
11. **Phase 11 (Reply UX):** Replies concatenate DOM innerText which includes timestamps; swipe-to-reply lacks pointer drag tracking and threshold animations.
12. **Phase 12 (Share & Ask to Join):** Share button is placed in the chat header; shared links join directly or open normal landing screen without dedicated "Ask to join" invite card.
13. **Phase 13 (Keyboard GIFs/Stickers):** `MainActivity.java` does not override `onCreateInputConnection` to supply image MIME types to Gboard/keyboards.

---

## 3. Implementation Progress & Verification Results

### Regression Checks (ALREADY WORKING - Must Not Regress)
- **REG-1 (Send keeps keyboard focus):** **PASS** (`verify/screenshots/reg1_focus.png`) — Focus preserved on `#messageInput` across send action (`isFocusedBefore=true`, `isFocusedAfter=true`).
- **REG-2 (Voice recorder UI):** **PASS** (`verify/screenshots/reg2_voice_ui.png`) — Recorder row, mic button, and waveform timer intact.
- **REG-3 (Safe-area top spacing):** **PASS** (`verify/screenshots/reg3_safe_area.png`) — Padding-top and status bar safe area variables preserved.
- **REG-4 (App-styled dialogs):** **PASS** (`verify/screenshots/reg4_dialogs.png`) — `appAlert` and `appConfirm` active without native alerts.
- **REG-5 (No in-app Stickers tab):** **PASS** (`verify/screenshots/reg5_no_stickers.png`) — In-app stickers tab completely removed from media picker (`stickersTab count = 0`). Only Emoji and GIFs tabs exist.

---

### Phase 1: One Render Path + Reliable Sending
- **Status:** **PASS**
- **Screenshot:** `verify/screenshots/phase1_rapid_send.png`
- **Root Cause & Fix:**
  - *Root Cause:* Rapid taps on the send button executed concurrent upload promises and socket emits before the client draft was cleared; server lacked per-instance deduplication mapping for `clientMsgId`.
  - *Fix:* Unified message rendering under `renderMessageBubble(msg)` with DOM id deduping (`msg-${id}`). Added immediate single-flight client lock (`isSendingInProgress = true`, 300ms cooldown, atomic draft copy and instant `pastedMedia.length = 0`). Server-side per-instance `dedupeMap` (10-minute TTL) caches `clientMsgId` across socket and `/upload` endpoints, returning cached entries rather than creating duplicates. Token bucket rate limiting (10 msgs / 5s) and upload concurrency limiting (max 2 client-side, 5 concurrent per-IP) enforced.
- **Verification:** 20 rapid taps on a file produce exactly 1 message bubble in the stream (`messageCount=1`).

---

### Phase 2: Room Identity, Stale-Session Restore, & Ghost-Message Isolation
- **Status:** **PASS**
- **Screenshots:**
  - `verify/screenshots/phase2a_stale_restore.png` (Cold reload after room ended lands on join screen with notice, chat never visible)
  - `verify/screenshots/phase2b_stale_vault.png` (Cold reload after vault expired lands on join screen with notice, vault never visible)
  - `verify/screenshots/phase2c_ghost_isolation.png` (Reusing room key creates new instance; old messages never leak)
  - `verify/screenshots/phase2f_resume_session.png` (Reload within TTL resumes same room as same member)
- **Root Cause & Fix:**
  - *Root Cause:* Rooms were identified on server solely by human-readable `roomKey`. Server `rejoin-room` recreated dead rooms if claimed by admin. Sockets reconnected by key alone. Client unconditionally restored `#chatScreen` on cold load from `localStorage`.
  - *Fix:*
    - Server: Every chat room is created with a unique UUID `roomInstanceId`. Every join/create issues a cryptographically random `sessionToken` bound to `{ roomInstanceId, memberId }`. Replaced `rejoin-room` with `resume-session` (`{ roomInstanceId, sessionToken }`). Dropped emits missing or with invalid session tokens. Transient socket disconnects mark `user.id = null` rather than deleting rooms prematurely. Added `roomTombstones` (10-minute TTL) to track ended/expired rooms.
    - Client: Unified session persistence under single `anon_session` key (`{ kind: 'chat' | 'vault', roomKey, roomInstanceId, sessionToken, memberId, username, isAdmin, expiresAt, savedAt }`). Cold load never displays chat UI; shows neutral splash overlay (`#reconnectSplash`) and calls `resume-session` (or GET `/api/file-rooms/:id`). If invalid, displays inline dismissible `#sessionNotice` on `#joinScreen`. Lifecycle revalidation hooked to `visibilitychange`, `pageshow`, `online`, socket `connect`, and Capacitor `appStateChange`. `socket.sendBuffer` purged on disconnect.
    - Dev console: 5-tap toggle on `.header-logo` and `.landing-logo-img` dynamically loads `/eruda.js` on demand (Rule 6).
- **Verification:**
  - Phase 2a: PASS (Reloading after killed room lands on `#joinScreen` with `#sessionNotice`; `#chatScreen` never visible).
  - Phase 2b: PASS (Reloading after expired vault lands on `#joinScreen` with `#sessionNotice`; `#fileRoomScreen` never visible).
  - Phase 2c: PASS (New room reusing same key has 0 ghost messages from old room).
  - Phase 2f: PASS (Reloading within TTL resumes same room with member session and messages intact).

---

### Phase 3: Busy / Processing State on Every Button
- **Status:** **PASS**
- **Screenshot:** `verify/screenshots/phase3_busy_click.png`
- **Root Cause & Fix:**
  - *Root Cause:* Buttons had no immediate feedback on tap, no visual spinner, no `aria-busy` attribute, and lacked a mechanism to lock multiple concurrent taps during async operations.
  - *Fix:*
    - Created helper `withBusy(button, asyncFn, options)` supporting `minMs` (default 250ms), `timeoutMs` (default 15000ms), and `connectingText` with server wake-up hint after 5s.
    - Locks button dimensions using `getBoundingClientRect()` (`style.minWidth` / `minHeight`) to prevent any layout shifts.
    - Sets `aria-busy="true"` and `button.dataset.isBusy = "true"`, ignores duplicate taps while busy, replaces/prefixes icon with spinning `.fa-circle-notch`.
    - Added CSS active feedback `button:active { transform: scale(0.97); }` and `touch-action: manipulation` across all buttons with `@media (prefers-reduced-motion: reduce)` protection.
    - Applied to Create room, Join room, Ask to join, Open vault, confirm leave/end room, copy room key (1.5s checkmark state), and send button dispatching.
- **Verification:** In Playwright test, clicking `#createRoomBtn` immediately exhibits `hasAriaBusy=true` and `isSpinnerPresent=1`, layout width/height preserved, clears state cleanly upon transition to `#chatScreen`.

---

### Phase 4: Composer Layout (WhatsApp Arrangement)
- **Status:** **PASS**
- **Screenshots:**
  - `verify/screenshots/phase4_composer_layout.png` (Default viewport)
  - `verify/screenshots/phase4_composer_320px.png` (Narrow mobile 320px)
  - `verify/screenshots/phase4_composer_light.png` (Light theme)
- **Root Cause & Fix:**
  - *Root Cause:* Prior layout had arbitrary button placement, a separate detached voice recording button that cluttered mobile viewports, and no dynamic mic/send mode switching based on composer input state.
  - *Fix:*
    - Re-arranged pill container `.composer-wrapper` to strict WhatsApp order: `[#fileBtn (paperclip)] [#messageInput] [#emojiBtn] [#cameraBtn]`.
    - Placed round action button `#sendBtn` outside pill on the right (`.composer-round-btn`).
    - Implemented reactive `updateSendButtonState()`:
      - In empty state (no text, no media): `#cameraBtn` is visible, outside `#sendBtn` shows microphone icon with `data-mode="mic"` and title "Record voice note".
      - When content is typed or media attached: `#cameraBtn` hides cleanly, outside `#sendBtn` transitions to paper-plane icon with `data-mode="send"` and title "Send message".
    - Tapping outside button in `data-mode="mic"` triggers audio recording pipeline; tapping in `data-mode="send"` executes the message dispatching pipeline.
    - Verified responsive layout down to 320px with zero horizontal scroll or clipping, in both dark and light modes.
- **Verification:**
  - Playwright test verified pill button IDs `["fileBtn", "emojiBtn", "cameraBtn"]`.
  - Empty state verified `cameraBtn` visible, `data-mode="mic"`, and `fa-microphone` icon count = 1.
  - Typing state verified `cameraBtn` hidden, `data-mode="send"`, and `fa-paper-plane` icon count = 1.
  - Visual regression verified across 320px, 360px, 412px viewports and light theme.

