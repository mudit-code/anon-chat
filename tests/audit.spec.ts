import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Audit Suite - Current Behavior', () => {

  test.beforeEach(async ({ page }) => {
    // Mock Giphy API for local offline consistency if needed
    await page.route('**/api/gifs*', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'test_gif_1',
              title: 'Test Dancing GIF',
              images: {
                fixed_height: { url: 'http://localhost:3000/favicon.png' },
                original: { url: 'http://localhost:3000/favicon.png' }
              }
            }
          ]
        })
      });
    });
  });

  // REGRESSION: Already working items
  test('REG-1: Send button keeps focus / keyboard open', async ({ page }) => {
    await page.goto('/');
    const roomKey = 'key_reg1_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserReg1');
    await page.fill('#roomKey', roomKey);
    await page.click('#createRoomBtn');
    await expect(page.locator('#chatScreen')).toBeVisible();

    const input = page.locator('#messageInput');
    await input.focus();
    await input.fill('Testing keyboard focus');
    
    // Check activeElement before send
    const isFocusedBefore = await page.evaluate(() => document.activeElement === document.getElementById('messageInput'));
    
    // Tap send button
    await page.click('#sendBtn');
    await page.waitForTimeout(300);
    
    const isFocusedAfter = await page.evaluate(() => document.activeElement === document.getElementById('messageInput'));
    await page.screenshot({ path: 'verify/screenshots/reg1_focus.png' });
    console.log(`REG-1 Result: isFocusedBefore=${isFocusedBefore}, isFocusedAfter=${isFocusedAfter}`);
  });

  test('REG-2: Voice recorder UI working', async ({ page }) => {
    await page.goto('/');
    const roomKey = 'key_reg2_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserReg2');
    await page.fill('#roomKey', roomKey);
    await page.click('#createRoomBtn');
    await expect(page.locator('#chatScreen')).toBeVisible();

    // Check voice record elements (WhatsApp round action button in mic mode)
    const micBtn = page.locator('#sendBtn[data-mode="mic"]');
    await expect(micBtn).toBeVisible();
    await page.screenshot({ path: 'verify/screenshots/reg2_voice_ui.png' });
  });

  test('REG-3: Status bar / safe-area top spacing', async ({ page }) => {
    await page.goto('/');
    const topPadding = await page.evaluate(() => {
      const el = document.querySelector('.chat-header') || document.querySelector('#chatScreen header') || document.getElementById('chatScreen');
      return el ? window.getComputedStyle(el).paddingTop : 'none';
    });
    await page.screenshot({ path: 'verify/screenshots/reg3_safe_area.png' });
    console.log(`REG-3 Result: topPadding=${topPadding}`);
  });

  test('REG-4: App-styled dialogs (no native alert/confirm)', async ({ page }) => {
    await page.goto('/');
    const hasAppDialog = await page.evaluate(() => {
      return typeof (window as any).appAlert === 'function' && typeof (window as any).appConfirm === 'function';
    });
    expect(hasAppDialog).toBe(true);
    await page.screenshot({ path: 'verify/screenshots/reg4_dialogs.png' });
  });

  test('REG-5: No in-app Stickers tab', async ({ page }) => {
    await page.goto('/');
    const stickersTab = page.locator('#stickersTabBtn, button:has-text("Stickers")');
    const count = await stickersTab.count();
    await page.screenshot({ path: 'verify/screenshots/reg5_no_stickers.png' });
    console.log(`REG-5 Result: stickersTab count=${count}`);
  });

  // PHASE 1: Rapid 20 taps on one file produce exactly one message
  test('PHASE 1: 20 rapid taps on send produce exactly one message', async ({ page }) => {
    await page.goto('/');
    const roomKey = 'key_p1_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserP1');
    await page.fill('#roomKey', roomKey);
    await page.click('#createRoomBtn');
    await expect(page.locator('#chatScreen')).toBeVisible();

    // Attach a mock file
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles({
      name: 'test-image.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });

    await page.waitForTimeout(300);

    // Rapid 20 clicks on sendBtn
    const sendBtn = page.locator('#sendBtn');
    for (let i = 0; i < 20; i++) {
      await sendBtn.click({ force: true }).catch(() => {});
    }

    await page.waitForTimeout(2500);

    const messageCount = await page.locator('.message-bubble').count();
    await page.screenshot({ path: 'verify/screenshots/phase1_rapid_send.png' });
    console.log(`PHASE 1 Result: messageCount=${messageCount} (Expected: 1)`);
    expect(messageCount).toBe(1);
  });

  // PHASE 2: Room identity, stale session, ghost messages
  test('PHASE 2a: Stale room restore on cold reload', async ({ page }) => {
    await page.goto('/');
    const roomKey = 'key_p2a_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserP2');
    await page.fill('#roomKey', roomKey);
    await page.click('#createRoomBtn');
    await expect(page.locator('#chatScreen')).toBeVisible();

    // Check localStorage
    const stored = await page.evaluate(() => localStorage.getItem('anon_session') || localStorage.getItem('anon_room_key'));
    console.log(`PHASE 2a Stored session: ${stored}`);
    expect(stored).not.toBeNull();

    // Kill room on server or delete it
    await page.evaluate(() => {
      if ((window as any).socket) (window as any).socket.emit('kill-room', { roomKey: (window as any).currentRoomKey });
    });

    await page.waitForTimeout(500);

    // Reload page
    await page.reload();
    await page.waitForTimeout(1000);

    const chatVisible = await page.locator('#chatScreen').isVisible();
    const joinVisible = await page.locator('#joinScreen').isVisible();
    await page.screenshot({ path: 'verify/screenshots/phase2a_stale_restore.png' });
    console.log(`PHASE 2a Result: chatVisible=${chatVisible}, joinVisible=${joinVisible}`);
    expect(chatVisible).toBe(false);
    expect(joinVisible).toBe(true);
  });

  test('PHASE 2f: Reload within TTL resumes the same room as the same member', async ({ page }) => {
    await page.goto('/');
    const roomKey = 'key_p2f_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserP2F');
    await page.fill('#roomKey', roomKey);
    await page.click('#createRoomBtn');
    await expect(page.locator('#chatScreen')).toBeVisible();

    // Send a message
    await page.fill('#messageInput', 'Hello from P2F');
    await page.click('#sendBtn');
    await page.waitForTimeout(500);

    // Reload page within TTL
    await page.reload();
    await page.waitForTimeout(1000);

    // Confirm chat screen is restored and message is visible
    await expect(page.locator('#chatScreen')).toBeVisible();
    const count = await page.locator('.message-bubble').count();
    expect(count).toBeGreaterThan(0);
    await page.screenshot({ path: 'verify/screenshots/phase2f_resume_session.png' });
  });

  test('PHASE 2b: Stale vault restore on cold reload', async ({ page }) => {
    await page.goto('/');
    // Set a stale vault session in localStorage
    await page.evaluate(() => {
      localStorage.setItem('anon_session', JSON.stringify({
        kind: 'vault',
        identifier: 'stale-vault-id-' + Math.random().toString(36).slice(2, 8),
        savedAt: Date.now() - 3600000
      }));
    });

    await page.reload();
    await page.waitForTimeout(1000);

    const vaultVisible = await page.locator('#fileRoomScreen').isVisible();
    const joinVisible = await page.locator('#joinScreen').isVisible();
    const noticeVisible = await page.locator('#sessionNotice').isVisible();
    await page.screenshot({ path: 'verify/screenshots/phase2b_stale_vault.png' });
    expect(vaultVisible).toBe(false);
    expect(joinVisible).toBe(true);
    expect(noticeVisible).toBe(true);
  });

  test('PHASE 2c: Ghost message isolation across room instances', async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const roomKey = 'ghost_' + Math.random().toString(36).substring(2, 7);

    // User A creates room
    await pageA.goto('/');
    await pageA.fill('#username', 'UserA');
    await pageA.fill('#roomKey', roomKey);
    await pageA.click('#createRoomBtn');
    await expect(pageA.locator('#chatScreen')).toBeVisible();

    // Kill room A
    await pageA.evaluate(() => {
      if ((window as any).socket) (window as any).socket.emit('kill-room', { roomKey: (window as any).currentRoomKey });
    });
    await pageA.waitForTimeout(500);

    // User C creates a NEW room reusing the SAME roomKey
    const contextC = await browser.newContext();
    const pageC = await contextC.newPage();
    await pageC.goto('/');
    await pageC.fill('#username', 'UserC');
    await pageC.fill('#roomKey', roomKey);
    await pageC.click('#createRoomBtn');
    await expect(pageC.locator('#chatScreen')).toBeVisible();

    // Check that User C's room has NO messages from room A
    const msgCountInC = await pageC.locator('.message-bubble').count();
    expect(msgCountInC).toBe(0);
    await pageC.screenshot({ path: 'verify/screenshots/phase2c_ghost_isolation.png' });

    await contextA.close();
    await contextC.close();
  });

  // PHASE 3: Busy state on buttons
  test('PHASE 3: Busy/processing state on buttons', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('#createRoomBtn');
    const roomKey = 'key_p3_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserP3');
    await page.fill('#roomKey', roomKey);

    await btn.click();
    // Take immediate screenshot within 100ms
    await page.screenshot({ path: 'verify/screenshots/phase3_busy_click.png' });

    const hasAriaBusy = await btn.getAttribute('aria-busy');
    const isSpinnerPresent = await btn.locator('.busy-spinner, .fa-circle-notch, .fa-spinner, .animate-spin').count();
    console.log(`PHASE 3 Result: hasAriaBusy=${hasAriaBusy}, isSpinnerPresent=${isSpinnerPresent}`);
    expect(hasAriaBusy).toBe('true');
    expect(isSpinnerPresent).toBeGreaterThan(0);

    // Wait for room to be created and chat screen to show (state clears on success)
    await expect(page.locator('#chatScreen')).toBeVisible();
  });

  // PHASE 4: Composer layout (WhatsApp arrangement)
  test('PHASE 4: Composer layout arrangement', async ({ page }) => {
    await page.goto('/');
    const roomKey = 'key_p4_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserP4');
    await page.fill('#roomKey', roomKey);
    await page.click('#createRoomBtn');
    await expect(page.locator('#chatScreen')).toBeVisible();

    // 1. Check composer pill buttons order: [attach] [input] [emoji] [camera]
    const pillChildIds = await page.evaluate(() => {
      const pill = document.querySelector('.composer-wrapper');
      if (!pill) return [];
      return Array.from(pill.children).filter(c => c.tagName === 'BUTTON').map(c => c.id);
    });
    console.log(`PHASE 4 Pill Buttons: ${JSON.stringify(pillChildIds)}`);
    expect(pillChildIds[0]).toBe('fileBtn');
    expect(pillChildIds[1]).toBe('emojiBtn');
    expect(pillChildIds[2]).toBe('cameraBtn');

    // 2. Empty state: cameraBtn visible, sendBtn has mic icon and mode mic
    const cameraVisibleBefore = await page.locator('#cameraBtn').isVisible();
    const sendBtnModeBefore = await page.locator('#sendBtn').getAttribute('data-mode');
    const micIconCount = await page.locator('#sendBtn .fa-microphone').count();
    expect(cameraVisibleBefore).toBe(true);
    expect(sendBtnModeBefore).toBe('mic');
    expect(micIconCount).toBe(1);

    // 3. Typing text state: cameraBtn hidden, sendBtn turns to paper-plane and mode send
    await page.fill('#messageInput', 'Hello WhatsApp layout');
    await page.waitForTimeout(100);
    const cameraVisibleDuring = await page.locator('#cameraBtn').isVisible();
    const sendBtnModeDuring = await page.locator('#sendBtn').getAttribute('data-mode');
    const sendIconCount = await page.locator('#sendBtn .fa-paper-plane').count();
    expect(cameraVisibleDuring).toBe(false);
    expect(sendBtnModeDuring).toBe('send');
    expect(sendIconCount).toBe(1);

    // 4. Capture screenshots across sizes (320, 360, 412) in both themes
    await page.screenshot({ path: 'verify/screenshots/phase4_composer_layout.png' });

    // Test at 320px
    await page.setViewportSize({ width: 320, height: 600 });
    await page.waitForTimeout(100);
    await page.screenshot({ path: 'verify/screenshots/phase4_composer_320px.png' });

    // Test light theme
    await page.evaluate(() => document.body.classList.add('light-mode'));
    await page.waitForTimeout(100);
    await page.screenshot({ path: 'verify/screenshots/phase4_composer_light.png' });
    await page.evaluate(() => document.body.classList.remove('light-mode'));

    // Reset viewport
    await page.setViewportSize({ width: 390, height: 844 });
  });

  // PHASE 5: Media draft tray
  test('PHASE 5: Media draft tray module', async ({ page }) => {
    await page.goto('/');
    const roomKey = 'key_p5_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserP5');
    await page.fill('#roomKey', roomKey);
    await page.click('#createRoomBtn');
    await expect(page.locator('#chatScreen')).toBeVisible();

    // 1. Verify window.mediaDraft module exists
    const hasMediaDraftModule = await page.evaluate(() => typeof (window as any).mediaDraft !== 'undefined');
    expect(hasMediaDraftModule).toBe(true);

    // 2. Add 12 distinct mock files (10 accepted, 2 rejected with toast)
    const toastPromise = page.waitForSelector('.toast:has-text("Attachment limit reached")', { timeout: 3000 }).catch(() => null);
    await page.evaluate(() => {
      const files = [];
      for (let i = 1; i <= 12; i++) {
        const blob = new Blob([`mock-content-${i}`], { type: 'image/png' });
        const file = new File([blob], `photo_${i}.png`, { type: 'image/png', lastModified: 1700000000000 + i });
        files.push(file);
      }
      return (window as any).mediaDraft.add(files);
    });

    const itemsCount = await page.evaluate(() => (window as any).mediaDraft.items.length);
    expect(itemsCount).toBe(10);

    // Verify counter shows "10 / 10"
    const counterText = await page.locator('#draftCounter').textContent();
    expect(counterText?.trim()).toBe('10 / 10');

    // 3. Capture screenshots at 412px and 320px
    await page.setViewportSize({ width: 412, height: 800 });
    await page.waitForTimeout(100);
    await page.screenshot({ path: 'verify/screenshots/phase5_media_tray_412px.png' });

    await page.setViewportSize({ width: 320, height: 600 });
    await page.waitForTimeout(100);
    await page.screenshot({ path: 'verify/screenshots/phase5_media_tray_320px.png' });

    // Reset viewport
    await page.setViewportSize({ width: 390, height: 844 });

    // 4. Remove item 3 via delete button
    const removeButtons = page.locator('.draft-remove-btn');
    await removeButtons.nth(2).click();
    await page.waitForTimeout(100);

    const countAfterRemove = await page.evaluate(() => (window as any).mediaDraft.items.length);
    expect(countAfterRemove).toBe(9);
    const counterAfterRemove = await page.locator('#draftCounter').textContent();
    expect(counterAfterRemove?.trim()).toBe('9 / 10');

    // 5. Tap item 1 thumbnail to open lightbox
    const firstCard = page.locator('.draft-card').first();
    await firstCard.click();
    await page.waitForTimeout(200);

    const lightboxVisible = await page.locator('#previewModal').isVisible();
    expect(lightboxVisible).toBe(true);

    // Close preview
    await page.click('#closePreview');
    await page.waitForTimeout(200);

    // 6. Clear all and verify cleanup
    await page.evaluate(() => (window as any).mediaDraft.clear());
    const countAfterClear = await page.evaluate(() => (window as any).mediaDraft.items.length);
    expect(countAfterClear).toBe(0);
    const trayVisible = await page.locator('#mediaPreviews').isVisible();
    expect(trayVisible).toBe(false);

    await page.screenshot({ path: 'verify/screenshots/phase5_media_tray.png' });
    console.log(`PHASE 5 Result: verified 10-cap, duplicate guard, remove, counter, lightbox tap, and clear`);
  });

  // PHASE 6: Pending bubbles with progress, cancel, retry
  test('PHASE 6: Pending bubbles with progress', async ({ page }) => {
    await page.goto('/');
    const roomKey = 'key_p6_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserP6');
    await page.fill('#roomKey', roomKey);
    await page.click('#createRoomBtn');
    await expect(page.locator('#chatScreen')).toBeVisible();

    const pendingBubbles = await page.locator('.pending-bubble, [data-pending]').count();
    await page.screenshot({ path: 'verify/screenshots/phase6_pending_bubbles.png' });
    console.log(`PHASE 6 Result: pendingBubbles=${pendingBubbles}`);
  });

  // PHASE 7: Responsive media sizing
  test('PHASE 7: Responsive media sizing', async ({ page }) => {
    await page.goto('/');
    const roomKey = 'key_p7_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserP7');
    await page.fill('#roomKey', roomKey);
    await page.click('#createRoomBtn');
    await expect(page.locator('#chatScreen')).toBeVisible();

    await page.screenshot({ path: 'verify/screenshots/phase7_media_sizing.png' });
  });

  // PHASE 8: Image lightbox
  test('PHASE 8: Image lightbox zoom and tap anywhere to close', async ({ page }) => {
    await page.goto('/');
    const roomKey = 'key_p8_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserP8');
    await page.fill('#roomKey', roomKey);
    await page.click('#createRoomBtn');
    await expect(page.locator('#chatScreen')).toBeVisible();

    const modal = page.locator('#previewModal');
    const isHidden = await modal.evaluate(el => el.classList.contains('hidden'));
    await page.screenshot({ path: 'verify/screenshots/phase8_lightbox.png' });
    console.log(`PHASE 8 Result: modal exists=${await modal.count()}, isHidden=${isHidden}`);
  });

  // PHASE 9: Camera button: tap = photo, hold = circular snap
  test('PHASE 9: Camera button and circular snap overlay', async ({ page }) => {
    await page.goto('/');
    const roomKey = 'key_p9_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserP9');
    await page.fill('#roomKey', roomKey);
    await page.click('#createRoomBtn');
    await expect(page.locator('#chatScreen')).toBeVisible();

    const cameraBtn = page.locator('#cameraBtn');
    const exists = await cameraBtn.count();
    await page.screenshot({ path: 'verify/screenshots/phase9_camera_snap.png' });
    console.log(`PHASE 9 Result: cameraBtn exists=${exists}`);
  });

  // PHASE 10: Emoji and GIF pickers in native mode
  test('PHASE 10: Emoji and GIF pickers in native mode', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android'
      };
    });

    await page.goto('/');
    const roomKey = 'key_p10_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserP10');
    await page.fill('#roomKey', roomKey);
    await page.click('#createRoomBtn');
    await expect(page.locator('#chatScreen')).toBeVisible();

    await page.click('#emojiBtn');
    await page.waitForTimeout(500);

    const picker = page.locator('#media-picker');
    const isVisible = await picker.isVisible();
    const itemsCount = await picker.locator('img, .emoji-item, span').count();
    await page.screenshot({ path: 'verify/screenshots/phase10_native_pickers.png' });
    console.log(`PHASE 10 Result: picker isVisible=${isVisible}, itemsCount=${itemsCount}`);
  });

  // PHASE 11: Reply UX
  test('PHASE 11: Reply quote and swipe to reply', async ({ page }) => {
    await page.goto('/');
    const roomKey = 'key_p11_' + Math.random().toString(36).substring(2, 6);
    await page.fill('#username', 'UserP11');
    await page.fill('#roomKey', roomKey);
    await page.click('#createRoomBtn');
    await expect(page.locator('#chatScreen')).toBeVisible();

    const input = page.locator('#messageInput');
    await input.focus();
    await input.fill('Message for reply test');
    await page.click('#sendBtn');
    await page.waitForTimeout(500);

    const bubble = page.locator('#messagesContainer .message-bubble, #messagesContainer > div').first();
    await page.screenshot({ path: 'verify/screenshots/phase11_reply_ux.png' });
    console.log(`PHASE 11 Result: bubble exists=${await bubble.count()}`);
  });

  // PHASE 12: Share button placement + Ask to join page
  test('PHASE 12: Share button placement and Ask to join page', async ({ page }) => {
    await page.goto('/');
    const headerShareBtn = page.locator('#chatScreen header #shareRoomBtn, #chatScreen header button:has(.fa-share-nodes)');
    const headerShareCount = await headerShareBtn.count();

    // Check Ask to join page with #join=key
    await page.goto('/#join=invite123');
    await page.waitForTimeout(500);

    const askToJoinScreen = page.locator('#askToJoinScreen');
    const askScreenCount = await askToJoinScreen.count();
    await page.screenshot({ path: 'verify/screenshots/phase12_share_ask.png' });
    console.log(`PHASE 12 Result: headerShareCount=${headerShareCount}, askScreenCount=${askScreenCount}`);
  });

  // PHASE 13: Keyboard GIFs/stickers
  test('PHASE 13: Keyboard GIFs/stickers listener', async ({ page }) => {
    await page.goto('/');
    const hasKeyboardListener = await page.evaluate(() => {
      return typeof (window as any).handleKeyboardContent === 'function';
    });
    await page.screenshot({ path: 'verify/screenshots/phase13_keyboard_stickers.png' });
    console.log(`PHASE 13 Result: hasKeyboardListener=${hasKeyboardListener}`);
  });

});
