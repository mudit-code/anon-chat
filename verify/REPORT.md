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

---

### Phase 5: Rewrite Media Draft Tray
- **Status:** **PASS**
- **Screenshots:**
  - `verify/screenshots/phase5_media_tray.png` (Default state)
  - `verify/screenshots/phase5_media_tray_412px.png` (Wide mobile 412px with 10 thumbnails)
  - `verify/screenshots/phase5_media_tray_320px.png` (Narrow mobile 320px with smooth scroll)
- **Root Cause & Fix:**
  - *Root Cause:* Previous implementation suffered from fragmented arrays (`pastedMedia`, `fileToSend`, `pendingAttachments`), ad-hoc DOM element creation, missing file de-duplication, memory leaks from unrevoked `URL.createObjectURL`, lack of pre-send full-screen review, and tiny touch targets (<20px) on removal badges.
  - *Fix:*
    - Built canonical unified module `window.mediaDraft = { items: [], add(files), remove(idOrIndex), clear(), validate() }`.
    - Strictly enforced 10-item cap with toast notification `"Attachment limit reached (10 max)"`.
    - De-duplicated files using compound `name + size + lastModified` matching.
    - Updated tray header with real-time counter badge `#draftCounter` (`"10 / 10"`, `"9 / 10"`).
    - Designed 72px thumbnail cards with smooth horizontal scroll and enlarged `.draft-remove-btn` badge to 28px tap target with `touch-action: manipulation`.
    - Wired thumbnail tap to open the full-screen lightbox (`openPreview()`) for image/video review before dispatch.
    - Ensured `URL.revokeObjectURL` cleanup on individual remove, `mediaDraft.clear()`, and message dispatch.
- **Verification:**
  - Playwright test injected 12 files: first 10 accepted, 2 rejected, counter accurately displayed `"10 / 10"`.
  - Removed 3rd item: counter updated to `"9 / 10"`.
  - Tapped 1st thumbnail: lightbox `#previewModal` opened cleanly.
  - Cleared draft: all object URLs revoked, items count reset to 0, tray `#mediaPreviews` hidden.
  - Visual verification at 320px and 412px viewports.

---

### Phase 6: Pending Bubbles with Progress, Cancel, Retry
- **Status:** **PASS**
- **Screenshots:**
  - `verify/screenshots/phase6_pending.png` (In-flight pending bubble with circular SVG progress and cancel button)
  - `verify/screenshots/phase6_failed.png` (Failed upload state with error border, status text, and Retry / Delete buttons)
  - `verify/screenshots/phase6_resolved.png` (Resolved state after retry success cleanly replacing pending bubble in-place)
- **Root Cause & Fix:**
  - *Root Cause:* Previous architecture delayed message bubble creation until after network completion, showed progress only on a disconnected top bar (`#progress-bar`), lacked any ability to cancel in-flight uploads, and on failure silently discarded the message with a toast, forcing users to start over.
  - *Fix:*
    - Created `createPendingMediaBubble({ file, objectUrl, clientMsgId, roomInstanceId, onCancel, onRetry, onDelete })` immediately inserting pending bubbles into `#messagesInner` with local thumbnail and SVG progress ring.
    - Added cancel button on in-flight bubble that invokes `xhr.abort()`, deletes the bubble, and revokes the object URL.
    - Implemented failed state with `setPendingBubbleFailed(clientMsgId)` showing red border, warning icon, "Failed to send" text, and two action buttons: "Retry" and "Delete".
    - Bound retries to the original `clientMsgId` to ensure server-side de-duplication idempotency.
    - In `renderMessageBubble()`, detected existing pending bubbles by `domId` / `clientMsgId` and replaced them in-place (`existingWrapper.replaceWith(wrapper)`), preserving scroll and DOM order.
    - Bound all active uploads to `roomInstanceId` in `activeUploads` map, aborting them cleanly on room end or leave.
- **Verification:**
  - Route mock delayed upload: verified instant pending bubble in `#messagesContainer` with SVG progress.
  - Cancelled second upload: verified `xhr.abort()` and removal from DOM.
  - Simulated 500 error: verified bubble remained in stream with Retry and Delete buttons.
  - Clicked Retry: verified upload completed, pending bubble replaced in-place by confirmed message bubble.

---

### Phase 7: Responsive Media Sizing
- **Status:** **PASS**
- **Screenshots:**
  - `verify/screenshots/phase7_square.png` (Square 1:1 image bounded properly)
  - `verify/screenshots/phase7_landscape.png` (Landscape 16:9 image bounded properly)
  - `verify/screenshots/phase7_portrait.png` (Portrait 9:16 image bounded without taking entire viewport)
  - `verify/screenshots/phase7_320px.png` (Ultra-narrow 320px viewport with 0 horizontal overflow)
  - `verify/screenshots/phase7_media_sizing.png` (Overview)
- **Root Cause & Fix:**
  - *Root Cause:* Images and videos could render with uncapped aspect ratios, blowing past the viewport on mobile devices or causing layout shifts before loading completed.
  - *Fix:*
    - Styled `.message-bubble-media` with responsive maximums: `max-width: min(78%, 360px)` on mobile screens, `max-width: 420px` on desktop (`min-width: 768px`), and `max-width: 260px` at `<= 360px` width.
    - Added `.media-container` wrapping images and videos with inline `aspect-ratio: ${width} / ${height}` reservation to prevent scroll jumps.
    - Set `.media-container` and `.message-file-preview` max-height to `min(55dvh, 420px)` with `object-fit: cover` to prevent tall portrait media from dominating chat view.
    - Added centered 48px `.video-play-overlay` with translucent backdrop and SVG play icon for video messages.
    - Sized voice note player to `width: 240px` on mobile and `280px` on desktop with overflow protection.
- **Verification:**
  - Verified 1:1, 16:9, and 9:16 aspect ratios: width <= 360px, portrait height <= 420px.
  - Verified video play overlay present and visible.
  - Tested 320px viewport: zero horizontal scroll (`scrollWidth === clientWidth`).

---

### Phase 8: Image Lightbox
- **Status:** **PASS**
- **Screenshots:**
  - `verify/screenshots/phase8_lightbox.png` (Lightbox preview with 120% zoom indicator and safe-area margins)
- **Root Cause & Fix:**
  - *Root Cause:* Previous preview modal used disjoint touch/mouse listeners, had zoom capped at 4x instead of 5x, zoomed to center rather than toward the cursor on wheel events, lacked boundary clamping causing zoomed images to float off-screen, and clicking anywhere when zoomed reset zoom to 1 rather than closing.
  - *Fix:*
    - Standardized gesture handling with unified Pointer Events (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) and `touch-action: none`.
    - Implemented clamped pan mathematics (`maxPanX = Math.max(0, (w * zoom - viewportW) / 2)`, `maxPanY = Math.max(0, (h * zoom - viewportH) / 2)`), keeping the image edges bound to the viewport.
    - Updated wheel zoom to dynamically calculate cursor offset relative to center and preserve the invariant point under the cursor from 1x up to 5x.
    - Added tap-to-close anywhere: single pointer touch/click with movement <= 8px immediately closes the modal, regardless of current zoom level. Pointer movements > 8px or multi-touch gestures are locked into pan/pinch and do not close on pointer release.
    - Added Escape key listener and wired Android hardware back button via Capacitor `App.addListener('backButton')`.
    - Added safe-area padding and 44x44 minimum touch targets on controls.
- **Verification:**
  - Verified wheel zoom increases scale and activates indicator (`120%`).
  - Verified drag gesture (> 8px) pans image and does NOT close modal on release.
  - Verified tap (movement <= 8px) anywhere closes modal.
  - Verified Escape key closes modal.
  - Verified close button (#closePreview) closes modal.

---

### Phase 9: Camera Button (Tap = Photo, Hold = Circular Snap)
- **Status:** **PASS** (Automated Playwright harness verified; physical camera hardware, OS runtime permission dialogs, and tactile long-press feel unverified on physical device per Rule 3 & 7)
- **Screenshots:**
  - `verify/screenshots/phase9_camera_snap.png` (Circular snap video review overlay with duration pill, sound toggle, and Send/Delete actions)
- **Root Cause & Fix:**
  - *Root Cause:* `#cameraBtn` had no tap photo integration or circular video snap recording pipeline; native Android manifest lacked `CAMERA` permission and hardware feature declarations; no circular snap review overlay existed.
  - *Fix:*
    - Added `<uses-permission android:name="android.permission.CAMERA" />` and `<uses-feature android:name="android.hardware.camera" android:required="false" />` to `android/app/src/main/AndroidManifest.xml` and installed `@capacitor/camera`.
    - Implemented TAP (< 300ms) path: invokes `@capacitor/camera` on native or `#cameraPhotoInput` on web, placing the captured photo into `window.mediaDraft`.
    - Implemented HOLD (>= 300ms) path: initiates front-camera circular snap recording via `getUserMedia` and `MediaRecorder` (video/mp4 or video/webm at 800 kbps), displaying a 240px circular preview with radial SVG progress ring (30s limit), timer, pulsing red dot, and slide-left-to-cancel (> 80px).
    - Discards recordings < 1s with toast "Hold to record". Cleanly stops all camera/mic tracks on discard, cancel, review exit, or document visibilitychange (app backgrounding).
    - Built circular snap review overlay with looping preview, tap-to-toggle audio, duration display, Delete (discard) button, and Send button.
    - Wired snap messages to upload pipeline with `type: 'snap'`, rendering circular bubbles (`.snap-container`, `max-width: min(62vw, 220px)`) with play overlay, duration badge, and exclusive single-media playback.
- **Verification:**
  - Verified tap path adds photo draft to `#mediaPreviews`.
  - Verified press < 1s discards recording without opening review.
  - Verified slide left > 80px cancels recording.
  - Verified hold >= 1.5s opens `#snapReviewOverlay` with looping video.
  - Verified send dispatches snap, inserts circular bubble into chat stream, and tap toggles playback.
  - Verified all media tracks close cleanly with 0 live tracks remaining.

---

### Phase 10: Emoji & GIF Pickers in Native Mode
- **Status:** **PASS**
- **Screenshots:**
  - `verify/screenshots/phase10_native_pickers.png` (Native mode with populated GIF grid and anchored picker panel)
- **Root Cause & Fix:**
  - *Root Cause:* In native mode (Capacitor), relative `/api/gifs` or static `emojis.json` fetches could fail if `API_BASE` wasn't dynamically evaluated at request time, or if `emojis.json` attempted remote network resolution while offline; picker panel had no `min-height` protection, collapsing to 0 height during layout shifts; `/api/gifs` returned 500 without a clear error structure if the key was unset; dead sticker picker leftovers remained in JS.
  - *Fix:*
    - Updated `getApiBase()` and `absUrl(path)` to dynamically query `window.API_BASE` or `window.Capacitor.isNativePlatform()` on every call, correctly pointing API requests to the remote backend or local override in native mode.
    - Set local fallback for `emojis.json` to load bundled local assets directly with 80+ default UTF-8 emojis built-in, guaranteeing full offline functionality.
    - Added loading spinner, explicit empty state ("No GIFs found. Try another search"), and error state with Retry button in `searchGifs`.
    - Added `min-height: 220px` to `#media-picker` in `public/style.css` so panel never collapses to 0 height.
    - Updated `/api/gifs` in `server.js` to return a clear JSON error `{ error: "Giphy API key is not configured" }` with status 500 if unset.
    - Purged dead in-app sticker tab code from `public/script.js` preserving REG-5.
- **Verification:**
  - Verified native mode stub (`isNativePlatform() === true`) runs without errors.
  - Verified emoji grid populated with 160+ items offline.
  - Verified GIF search loads and renders GIF thumbnails.
  - Verified empty search query renders "No GIFs found".
  - Verified picker panel preserves >= 200px height.

---

### Phase 11: Reply UX
- **Status:** **PASS**
- **Screenshots:**
  - `verify/screenshots/phase11_reply_ux.png` (Overview of text and media replies in chat stream with composer reply bar)
  - `verify/screenshots/phase11_mid_drag.png` (Mid-drag gesture showing bubble live translation and scaling swipe reply icon)
  - `verify/screenshots/phase11_360px.png` (Mobile 360px viewport layout of quotes and swipe gestures)
  - `verify/screenshots/phase11_1280px.png` (Desktop 1280px viewport with hover reply button)
  - `verify/screenshots/phase11_light_mode.png` (Clean contrast in light theme for quotes and accent bars)
- **Root Cause & Fix:**
  - *Root Cause:* Previous quote rendering relied on DOM text scraping (`extractMessageData`), causing timestamps and sender text to jam into the snippet text; media quotes lacked visual indicators or thumbnails; swipe-to-reply was implemented across disparate touch/mouse listeners without rubber-banding, threshold pop, or screen edge margins (causing Android system back gestures to conflict); missing smooth-scroll target toast; no desktop hover reply button.
  - *Fix:*
    - Created `window.messageDataStore` preserving structured `{ id, senderName, type, snippet, mediaSrc }` across all message ingestion and rendering paths, eliminating DOM scraping.
    - Updated `renderMessageBubble()` to render compact quote blocks with a left accent bar (`3px solid var(--o)` / `#000`), bold `~senderName`, 2-line clamped snippet, and 36px thumbnail for media with zero timestamps.
    - Designed composer `#replyPreviewBar` with matching structured quote layout, media thumbnail, and cancel `x` button.
    - Replaced touch/mouse listeners with unified Pointer Events swipe-to-reply: ignored drags <= 24px from left screen edge (protecting Android back gesture) or starting on interactive controls; locked into drag on dx > 8px beating dy; rubber-banded translation to max 72px; popped `.threshold-ready` at 56px with light haptic tick; animated back to 0 on release.
    - Added desktop `.desktop-reply-btn` visible on hover for fine-pointer devices.
    - Updated `scrollToMessage(id)`: smoothly centers target with 1.5s pulse highlight; shows toast `"Original message isn't available"` if target is not in DOM.
- **Verification:**
  - Verified structured text quotes and media thumbnail quotes rendered with 0 timestamps.
  - Verified 30px swipe drag snaps back with no reply triggered.
  - Verified 90px swipe drag triggers reply bar with quote.
  - Verified quote click smooth-scrolls and highlights target for 1.5s.
  - Verified invalid quote click displays toast `"Original message isn't available"`.
  - Verified multi-viewport captures at 360px and 1280px in dark and light modes.

---

### Phase 12: Share Button Placement & Dedicated "Ask to Join" Page
- **Status:** **PASS**
- **Screenshots:**
  - `verify/screenshots/phase12_share_ask.png` (Dedicated "Ask to join" screen with live online count, room key badge, and codename input)
- **Root Cause & Fix:**
  - *Root Cause:*
    1. Header contained `#shareRoomBtn`, cluttering top navigation while people/room panel already had share actions.
    2. Room share URL generated query parameter format `/?room=KEY` which leaks the secret room key to server logs, proxy access logs, and referrer headers in cleartext HTTP GET requests, instead of client-only URL fragments (`/#join=KEY`).
    3. Opening invite links directly loaded the app without room validation (`peek-room`), potentially restoring stale sessions or falling back to room creation, joining isolated rooms or unapproved sessions.
    4. Join button and invite card had duplicated join invocation and validation paths.
  - *Fix:*
    1. Removed `#shareRoomBtn` from `#chat-header` in `public/index.html`. Retained share buttons solely in people/room panel (`#shareRoomCardBtn` and `#mobileShareRoomBtn`).
    2. Generated share URLs using URL fragment: `${PUBLIC_WEB_URL}/#join=${encodeURIComponent(roomKey)}`. Supported legacy `?room=KEY` links seamlessly.
    3. Wrapped share buttons in Phase 3 `withBusy` state and prioritized `@capacitor/share`, falling back to `navigator.share` and clipboard copy with toast.
    4. Built dedicated `#askToJoinScreen` in `public/index.html` displaying branding, "You've been invited to a private room", live online count (`#askRoomOnlineText`), room key preview card, codename input, primary "Ask to join" button with busy feedback, and "Cancel" button.
    5. Created `#roomUnavailableState` container displaying clear notice if room expired, ended, or does not exist.
    6. Integrated `socket.emit("peek-room")` on incoming invite links, pre-validating existence and online count non-destructively without joining or creating rooms.
    7. Unified join invocation into `performJoinRoom()` called by both `#joinRoomBtn` and `#askJoinRoomBtn` with identical validation, busy spinner state, and socket event responses.
    8. Cleaned URL fragment/query immediately after parsing via `window.history.replaceState`.
- **Verification:**
  - Verified header share button count is 0.
  - Verified people panel share button is present and functional.
  - Verified User B opening `/#join=KEY` sees the Ask to join screen with "1 person online".
  - Verified User B clicking "Ask to join" triggers join request, User A approves, and both enter the room.
  - Verified User C opening legacy `/?room=KEY` sees Ask to join screen with "2 people online".
  - Verified User D opening non-existent room sees `#roomUnavailableState`.
  - Screenshot saved: `verify/screenshots/phase12_share_ask.png`.

---

### Phase 13: Keyboard GIFs & Stickers (Android WebView Bridge & MediaDraft Pipeline)
- **Status:** **PASS (Bridge & Harness Verified; Physical Hardware & Gboard UNVERIFIED per Rule 3 & 7)**
- **Screenshots:**
  - `verify/screenshots/phase13_keyboard_stickers.png` (MediaDraft attachment tray showing keyboard-injected sticker card with 1 / 10 count)
- **Root Cause & Fix:**
  - *Root Cause:* Default Android `WebView` and Capacitor's `CapacitorWebView` do not override `onCreateInputConnection` to declare image MIME type support (`image/gif`, `image/png`, `image/jpeg`, `image/webp`) in `EditorInfoCompat.setContentMimeTypes()`. Consequently, Google Keyboard (Gboard), Samsung Keyboard, and other modern IMEs declare "doesn't support GIFs here" and disable their sticker/GIF insertion tabs when focusing contenteditable or text input. Furthermore, there was no bridge to receive committed `InputContentInfoCompat` content URI streams and hand them to the web layer.
  - *Fix:*
    1. Created `CustomWebView.java` extending `CapacitorWebView` in package `com.mudit.anonchat`.
    2. Overrode `onCreateInputConnection(EditorInfo outAttrs)`:
       - Called `EditorInfoCompat.setContentMimeTypes(outAttrs, new String[]{"image/gif", "image/png", "image/jpeg", "image/webp"})`.
       - Wrapped connection with `InputConnectionCompat.createWrapper(...)` using an `OnCommitContentListener`.
       - Requested URI read permissions (`inputContentInfo.requestPermission()`).
       - Streamed content into a byte buffer (capped at 10 MB).
       - Converted byte array to Base64 data URL and evaluated JS to dispatch `keyboardContent` custom event and invoke `window.handleKeyboardContent`.
    3. Overrode layout `android/app/src/main/res/layout/capacitor_bridge_layout_main.xml` and `activity_main.xml` to instantiate `com.mudit.anonchat.CustomWebView` with id `@+id/webview`.
    4. Implemented `processKeyboardContent(detail)` in `public/script.js`:
       - Converted Base64 data URL to a real `File` with `isSticker = true`.
       - Fed `File` into `window.mediaDraft.add([file])`, adding it to the draft tray with progress and preview.
       - Updated `dispatchMediaUpload` to send as `type: 'sticker'`, rendering transparent stickers borderless without a bubble background (`.sticker-bubble`).
- **Physical Device Test Instructions for User:**
  1. Deploy debug APK to Android device.
  2. Enter any chat room and tap the message composer input field to display Gboard.
  3. Tap the sticker or GIF icon in Gboard toolbar.
  4. Select a GIF or sticker: verify that Gboard allows insertion and does NOT display "doesn't support GIFs here".
  5. Verify the sticker thumbnail immediately appears in the `#mediaPreviews` draft tray above composer with `1 / 10` counter.
  6. Tap Send: verify the sticker uploads with real progress and renders as a clean transparent sticker bubble without borders.

---

## 4. Final Consolidated Pass/Fail Matrix (Before vs After)

| Test / Feature Area | Initial Audit | Final Status | Verification Method & Artifacts |
|---|---|---|---|
| **REG-1**: Send keeps keyboard focus | PASS | **PASS** | `verify/screenshots/reg1_focus.png` (verified `isFocusedBefore=true, isFocusedAfter=true`) |
| **REG-2**: Voice recorder UI | PASS | **PASS** | `verify/screenshots/reg2_voice_ui.png` (waveform, in-place timer, mic button) |
| **REG-3**: Status bar & top safe area | PASS | **PASS** | `verify/screenshots/reg3_safe_area.png` (CSS safe-area-inset vars intact) |
| **REG-4**: App-styled dialogs (no native alert) | PASS | **PASS** | `verify/screenshots/reg4_dialogs.png` (`appAlert`, `appConfirm`, native alert suppressed) |
| **REG-5**: No in-app Stickers tab | PASS | **PASS** | `verify/screenshots/reg5_no_stickers.png` (stickersTab count = 0, Emoji & GIF only) |
| **Phase 1**: One render path + reliable sending | FAIL | **PASS** | `verify/screenshots/phase1_rapid_send.png` (20 rapid taps produce exactly 1 message bubble) |
| **Phase 2a**: Stale room restore on cold reload | FAIL | **PASS** | `verify/screenshots/phase2a_stale_restore.png` (neutral splash, `#chatScreen` never shown, notice on join screen) |
| **Phase 2b**: Stale vault restore on cold reload | FAIL | **PASS** | `verify/screenshots/phase2b_stale_vault.png` (`#fileRoomScreen` never shown, notice on join screen) |
| **Phase 2c**: Ghost message isolation | FAIL | **PASS** | `verify/screenshots/phase2c_ghost_isolation.png` (reusing room key creates new instance, 0 ghost messages) |
| **Phase 2f**: Resume session within TTL | FAIL | **PASS** | `verify/screenshots/phase2f_resume_session.png` (resumes same room as same member without rejoining) |
| **Phase 3**: Busy/processing state on buttons | FAIL | **PASS** | `verify/screenshots/phase3_busy_click.png` (`withBusy`, aria-busy, inline spinner, tap lock) |
| **Phase 4**: Composer layout (WhatsApp arrangement) | FAIL | **PASS** | `verify/screenshots/phase4_composer_layout.png` (pill `[attach] [input] [emoji] [camera]` + round mic/send button) |
| **Phase 5**: Media draft tray rewrite | FAIL | **PASS** | `verify/screenshots/phase5_media_tray.png` (`window.mediaDraft`, 10-cap, de-duplication, lightbox tap) |
| **Phase 6**: Pending bubbles with progress, cancel, retry | FAIL | **PASS** | `verify/screenshots/phase6_pending.png` (XHR upload progress, cancel, error state with Retry/Delete, retry success) |
| **Phase 7**: Responsive media sizing | FAIL | **PASS** | `verify/screenshots/phase7_media_sizing.png` (`max-width: min(78%, 360px)`, aspect-ratio reservation, 320px zero overflow) |
| **Phase 8**: Image lightbox zoom & pan | FAIL | **PASS** | `verify/screenshots/phase8_lightbox.png` (wheel/pinch zoom, clamped pan, tap-anywhere-to-close with gesture guard) |
| **Phase 9**: Camera button (tap=photo, hold=snap) | FAIL | **PASS** | `verify/screenshots/phase9_camera_snap.png` (tap photo to draft, hold 30s circular snap with review overlay and circular bubbles) |
| **Phase 10**: Emoji and GIF pickers in native mode | FAIL | **PASS** | `verify/screenshots/phase10_native_pickers.png` (evaluates `API_BASE` dynamically, offline `emojis.json` fallback, min-height 220px) |
| **Phase 11**: Reply UX (quote layout + swipe-to-reply) | FAIL | **PASS** | `verify/screenshots/phase11_reply_ux.png` (structured `messageDataStore`, zero timestamps in quote, 30px snap-back, 90px reply trigger, desktop hover button) |
| **Phase 12**: Share button placement + Ask to join page | FAIL | **PASS** | `verify/screenshots/phase12_share_ask.png` (header share removed, people panel share present, `#join=KEY` / `?room=KEY` routes to Ask to join with live online count, approval flow, dead room handled) |
| **Phase 13**: Keyboard GIFs & stickers (Android bridge) | FAIL | **PASS** (Hardware unverified) | `verify/screenshots/phase13_keyboard_stickers.png` (`handleKeyboardContent` function and `keyboardContent` event adding sticker to draft tray) |
| **Phase 14**: Full regression, build, deploy, final report | FAIL | **PASS** | 21/21 Playwright tests pass (54.4s), `npm run build` succeeds, `cap sync android` succeeds, `gradlew assembleDebug` succeeds |

---

## 5. Summary of Files Changed Across Entire Project

- **`server.js`**:
  - Added configurable environment expiry constants (`ROOM_TTL_MS`, `VAULT_TTL_MS`, `DEDUPE_TTL_MS`, `SOCKET_BUCKET_CAPACITY`, `SOCKET_BUCKET_REFILL_MS`).
  - Added room instance UUIDs (`roomInstanceId`), member session tokens (`sessionToken`), and `roomTombstones`.
  - Added token-bucket rate limiting per socket (10 msgs / 5s) and per-IP upload concurrency limits.
  - Implemented `resume-session` socket handler and extended `peek-room` handler (`{ exists, onlineCount, full }`).
  - Added `/upload` room instance validation, deduplication map integration, and 410 Gone responses on ended instances.
  - Updated `/api/gifs` error handling returning clear JSON error if Giphy key is missing.
- **`public/index.html`**:
  - Added Eruda 5-tap developer console toggle on header logo (Rule 6).
  - Added neutral reconnect splash overlay (`#reconnectSplash`) and inline dismissible session notice (`#sessionNotice`).
  - Re-arranged composer layout into WhatsApp arrangement: pill `[attach] [input] [emoji] [camera]` with external round mic/send button.
  - Added `#snapRecordingOverlay` and `#snapReviewOverlay` for circular video snaps.
  - Removed `#shareRoomBtn` from `#chat-header`; kept share buttons exclusively in people/room panel (`#shareRoomCardBtn`, `#mobileShareRoomBtn`).
  - Replaced legacy invite card with dedicated `#askToJoinScreen` (app branding, "You've been invited to a private room", live online count `#askRoomOnlineText`, room key display, codename field, "Ask to join" button with busy state, and "Cancel" button).
  - Added `#roomUnavailableState` container with "Go to Home" button.
- **`public/script.js`**:
  - Replaced ad-hoc session persistence with unified `anon_session` format; implemented cold-load neutral splash and `resume-session` validation.
  - Implemented `withBusy(button, asyncFn, options)` helper providing instant spinner, aria-busy, and tap lock.
  - Implemented unified single render path `renderMessageBubble(msg)` with DOM deduplication.
  - Rewrote media draft tray into modular `window.mediaDraft` (10-cap, de-duplication, horizontal scroll, lightbox preview).
  - Implemented XHR upload pipeline with real-time pending progress bubbles, cancel hooks, retry triggers, and replacement on confirmation.
  - Implemented image lightbox with clamped pan, wheel/pinch zoom, and tap-to-close with 8px gesture threshold.
  - Built camera button: tap triggers `@capacitor/camera` / file capture into draft; hold triggers circular front-camera MediaRecorder with circular progress ring, duration timer, slide-to-cancel, and review dialog.
  - Fixed native emoji and GIF pickers: dynamic `getApiBase()`, bundled offline emojis fallback, empty and error retry states.
  - Implemented structured reply data in `window.messageDataStore`, compact quote blocks with accent bar and 0 timestamps, and unified Pointer Events swipe-to-reply with 24px screen edge back-gesture guard.
  - Updated room sharing to generate `${PUBLIC_WEB_URL}/#join=KEY`, wrapped with `withBusy`, and implemented `peek-room` non-destructive inspection.
  - Implemented `window.handleKeyboardContent` and `keyboardContent` event listener converting base64 data URLs to `File` and inserting into `mediaDraft` as transparent borderless stickers (`.sticker-bubble`).
- **`public/style.css`**:
  - Added responsive media sizing rules: `max-width: min(78%, 360px)`, `max-height: min(55dvh, 420px)`, and 320px viewport overflow protection.
  - Added `.sticker-bubble` borderless transparent styling.
  - Added swipe-to-reply drag animations, quote accent bar styling, composer reply bar, and snap video bubbles.
  - Added `.desktop-reply-btn` hover style and `min-height: 220px` for media picker.
- **`android/app/src/main/java/com/mudit/anonchat/CustomWebView.java`**:
  - Created custom WebView subclassing `CapacitorWebView`.
  - Overrode `onCreateInputConnection(EditorInfo outAttrs)` to advertise `image/gif`, `image/png`, `image/jpeg`, `image/webp`.
  - Wrapped connection with `InputConnectionCompat.createWrapper` and `OnCommitContentListener` to read committed content streams (10 MB cap) and evaluate JS to dispatch `keyboardContent`.
- **`android/app/src/main/res/layout/capacitor_bridge_layout_main.xml` & `activity_main.xml`**:
  - Configured layout to inflate `com.mudit.anonchat.CustomWebView` with id `@+id/webview`.
- **`android/app/src/main/AndroidManifest.xml`**:
  - Added camera permissions and features (`android.permission.CAMERA`, `android.hardware.camera`).
- **`tests/audit.spec.ts`**:
  - Implemented comprehensive 21-test Playwright test harness covering all 14 phases and 5 regressions.

---

## 6. Android Debug APK Output

- **File Path:** `android/app/build/outputs/apk/debug/app-debug.apk` (Absolute: `D:\anon-chat\anon-chat\android\app\build\outputs\apk\debug\app-debug.apk`)
- **File Size:** 10,589,510 bytes (~10.1 MB)
- **Compilation Tool:** Gradle 8.11.1 / Android Gradle Plugin 8.7.2 with JDK 21
- **Build Command:** `.\gradlew.bat assembleDebug`
- **Build Status:** `BUILD SUCCESSFUL in 5m 40s` (247 actionable tasks)

---

## 7. On-Device Physical Hardware Testing Checklist

1. **Send Button & Keyboard (REG-1):**
   - Tap message input to bring up the soft keyboard.
   - Type a message and tap the orange send button: verify the keyboard stays open and focus is preserved without flashing or dismissing.
2. **Voice Recorder UI (REG-2):**
   - When input is empty, tap the round mic button: verify the recording bar slides into view with live waveform and elapsed timer.
3. **Safe Area & Status Bar (REG-3):**
   - Inspect top header and bottom composer on phones with punch-hole cameras or navigation pills: verify no content overlaps the notch or bottom navigation gesture bar.
4. **WhatsApp Composer Arrangement (Phase 4):**
   - Inspect composer row: `[paperclip] [input field] [emoji/sticker] [camera]` with external round mic/send button.
   - Typing text smoothly swaps the round mic icon for the orange send icon.
5. **Camera & Circular Snap (Phase 9):**
   - Tap camera icon: verify device camera opens for a photo, which drops into the draft tray.
   - Long-press camera icon: verify front-camera circular viewfinder opens with circular progress ring and timer.
   - Slide left to cancel, or release to enter circular review overlay; test Delete and Send.
6. **Native Emoji & GIF Pickers (Phase 10):**
   - Tap emoji button: verify emojis appear instantly offline.
   - Switch to GIFs: verify trending GIFs load and search queries work.
7. **Swipe to Reply (Phase 11):**
   - Swipe right on any message bubble: verify the bubble follows finger with resistance, pops at threshold with a haptic tick, and opens the reply bar above the composer.
   - Tap the quoted reply in a message: verify it smoothly scrolls to and highlights the target message.
8. **Share Link & Dedicated Ask to Join Screen (Phase 12):**
   - Open people panel and tap "Share link": verify native share sheet appears.
   - Open the copied `/#join=KEY` link in another phone browser: verify the dedicated "Ask to join" screen displays "1 person online", room key card, and codename input.
   - Tap "Ask to join": verify host receives modal request, approves, and guest enters room.
9. **Gboard Keyboard Stickers & GIFs (Phase 13):**
   - Tap message input to display Gboard.
   - Tap Gboard's sticker/GIF tab: verify Gboard does NOT display "doesn't support GIFs here".
   - Tap any sticker or GIF: verify it commits into the media draft tray and sends as a transparent sticker bubble.

---

## 8. ISSUES AND LIMITATIONS

1. **Physical Camera Hardware Feel & Audio-Video Latency (Unverified on Physical Device per Rule 3 & 7):**
   - While the MediaRecorder pipeline, canvas constraints, circular crop CSS, and timers passed all automated tests in Chromium with simulated media streams (`--use-fake-device-for-media-stream`), physical Android camera hardware initialization latency (camera driver startup and permission handshakes) can vary between low-end and flagship devices. This must be evaluated on the physical device.
2. **Gboard & Third-Party Keyboard Content Insertion (Unverified on Physical Device per Rule 3 & 7):**
   - The Android bridge (`CustomWebView.java`) implements the official AndroidX `InputConnectionCompat` and `EditorInfoCompat.setContentMimeTypes()` pattern. However, Android keyboards (such as Gboard, Samsung Keyboard, SwiftKey) behave differently across Android OS versions (Android 11 vs 14) and custom OEM ROMs (MIUI, OneUI). Because Playwright runs in headless Chromium on desktop without an Android IME, physical insertion of animated GIFs and WebP stickers from Gboard is marked **UNVERIFIED on physical hardware** per Rule 3 & 7 and must be confirmed on an actual device using the checklist above.
3. **In-Memory Ephemeral Storage (Render Free Tier):**
   - The server maintains rooms and upload maps in memory (`let rooms = {}`). Render's free tier spins down idle web services after 15 minutes of inactivity. When spun down, any active in-memory rooms are reset. Phase 2's session resumption and cold-load splash correctly handle this by detecting that the instance ended and showing "Your last room has ended" rather than freezing or crashing.
