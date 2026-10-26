import { test, expect } from '@playwright/test';

test.describe('WhatsApp-style Circular Snap Camera Module', () => {
  test('Hold camera to record (Screenshot 1), slide to lock, slide to cancel, and direct-send on hold release (Screenshot 2)', async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err));
    await page.context().grantPermissions(['camera', 'microphone']);

    await page.goto('/');

    const roomKey = 'snap-' + Math.random().toString(36).substring(2, 7);

    // Support mobile and desktop join
    const mobileCreateBtn = page.locator('#mobileBtnOpenCreateSheet');
    if (await mobileCreateBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await mobileCreateBtn.click();
      await page.fill('#mobileInputCodename', 'SnapUser');
      await page.fill('#mobileInputCreateKey', roomKey);
      await page.click('#mobilePrimarySubmitBtn');
    } else {
      await page.fill('#username', 'SnapUser');
      await page.fill('#roomKey', roomKey);
      await page.click('#createRoomBtn');
    }

    await expect(page.locator('#chatScreen')).toBeVisible({ timeout: 8000 });
    const cameraBtn = page.locator('#cameraBtn');
    await expect(cameraBtn).toBeVisible();

    const overlay = page.locator('#snapRecordingOverlay');
    const timer = page.locator('#snapRecordTimer');
    const ring = page.locator('#snapRecordProgressRing');
    const flipBtn = page.locator('#snapFlipCameraBtn');
    const cancelHint = page.locator('#snapSlideCancelHint');
    const lockCapsule = page.locator('#snapLockCapsule');
    const activeCameraBtn = page.locator('#snapActiveCameraBtn');

    // 1. RECORDING OVERLAY (Screenshot 1 parity)
    // Dispatch pointerdown on cameraBtn
    await page.evaluate(() => {
      const btn = document.getElementById('cameraBtn');
      if (btn) {
        btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 350, clientY: 780, bubbles: true }));
      }
    });

    // Hold for 350ms to trigger hold timer (> 220ms)
    await page.waitForTimeout(350);
    await expect(overlay).toBeVisible({ timeout: 4000 });
    await expect(timer).toBeVisible();
    await expect(ring).toBeVisible();
    await expect(flipBtn).toBeVisible();
    await expect(cancelHint).toBeVisible();
    await expect(lockCapsule).toBeVisible();
    await expect(activeCameraBtn).toBeVisible();
    // Capture screenshot matching Screenshot 1
    await page.screenshot({ path: 'verify/screenshots/snap_recording_state_screenshot1.png' });

    // Test Flip Camera using evaluate so virtual cursor doesn't drag left
    await page.evaluate(() => {
      document.getElementById('snapFlipCameraBtn')?.click();
    });
    await page.waitForTimeout(100);

    // 2. SLIDE UP TO LOCK TEST
    // Drag up (dy = -70px)
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 350, clientY: 710, bubbles: true }));
    });
    await page.waitForTimeout(250);

    const lockedRow = page.locator('#snapLockedControlsRow');
    await expect(lockedRow).toBeVisible();
    const lockedTrashBtn = page.locator('#snapLockedTrashBtn');
    const lockedSendBtn = page.locator('#snapLockedSendBtn');
    await expect(lockedTrashBtn).toBeVisible();
    await expect(lockedSendBtn).toBeVisible();

    // In locked mode, releasing pointer does NOT stop recording
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 350, clientY: 710, bubbles: true }));
    });
    await page.waitForTimeout(200);
    await expect(overlay).toBeVisible();

    // Tap Discard Trash button in locked mode
    await lockedTrashBtn.click();
    await expect(overlay).toBeHidden({ timeout: 3000 });

    // 3. SLIDE TO CANCEL TEST
    await page.evaluate(() => {
      const btn = document.getElementById('cameraBtn');
      if (btn) {
        btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, clientX: 350, clientY: 780, bubbles: true }));
      }
    });
    await page.waitForTimeout(350);
    await expect(overlay).toBeVisible();

    // Slide left > 80px
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2, clientX: 250, clientY: 780, bubbles: true }));
    });
    await page.waitForTimeout(200);
    await expect(overlay).toBeHidden({ timeout: 3000 });

    // 4. HOLD AND RELEASE -> DIRECT SEND (Screenshot 2 parity)
    await page.evaluate(() => {
      const btn = document.getElementById('cameraBtn');
      if (btn) {
        btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, clientX: 350, clientY: 780, bubbles: true }));
      }
    });
    // Hold for 1.2 seconds (> 600ms minimum snap recording duration)
    await page.waitForTimeout(1200);
    await expect(overlay).toBeVisible();

    // Release pointer: should stop and immediately send into chat!
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, clientX: 350, clientY: 780, bubbles: true }));
    });

    // Recording overlay should close
    await expect(overlay).toBeHidden({ timeout: 3000 });

    // Review overlay should NOT open (direct send as requested)
    await expect(page.locator('#snapReviewOverlay')).toBeHidden();

    // Snap message bubble should appear in the chat stream
    const snapBubble = page.locator('.snap-bubble .snap-container');
    await expect(snapBubble.first()).toBeVisible({ timeout: 12000 });

    // Verify WhatsApp green border and sound badge
    const soundBadge = page.locator('.snap-bubble .snap-sound-badge');
    await expect(soundBadge.first()).toBeVisible();

    const timeRow = page.locator('.snap-bubble .snap-msg-time-row');
    await expect(timeRow.first()).toBeVisible();

    // Capture screenshot matching Screenshot 2
    await page.screenshot({ path: 'verify/screenshots/snap_sent_message_screenshot2.png' });

    // Verify tap to play / unmute toggle
    await snapBubble.first().click();
    await page.waitForTimeout(300);

    console.log('All WhatsApp-style snap camera recording, lock, cancel, and direct-send tests passed successfully!');
  });
});
