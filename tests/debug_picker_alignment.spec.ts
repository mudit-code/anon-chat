import { test, expect } from '@playwright/test';

test('Capture media picker and message alignment', async ({ page }) => {
  // Mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:3000');

  // Create room
  const openCreateSheet = page.locator('#mobileBtnOpenCreateSheet');
  if (await openCreateSheet.isVisible()) {
    await openCreateSheet.click();
    await page.fill('#mobileInputCodename', 'AlignTester');
    await page.fill('#mobileInputCreateKey', 'align-test-123');
    await page.click('#mobilePrimarySubmitBtn');
  } else {
    await page.fill('#username', 'AlignTester');
    await page.fill('#roomKey', 'align-test-123');
    await page.click('#createRoomBtn');
  }

  await expect(page.locator('#chatScreen')).toBeVisible();

  // Open Media Picker
  await page.click('#emojiBtn');
  await expect(page.locator('#media-picker')).toBeVisible();

  // Take screenshot of Emoji tab
  await page.screenshot({ path: 'verify/screenshots/align_emoji_tab.png' });

  // Switch to GIFs tab
  await page.click('#gifsTabBtn');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'verify/screenshots/align_gifs_tab.png' });

  // Send a GIF from picker if items exist
  const firstGif = page.locator('#gif-results img').first();
  if (await firstGif.isVisible()) {
    await firstGif.click();
  }

  // Also send text with emoji, single emoji, and sticker
  await page.fill('#messageInput', '🔥 ❤️ 😂');
  await page.click('#sendBtn');

  // Also capture light mode
  await page.evaluate(() => document.body.classList.add('light-mode'));
  await page.click('#emojiBtn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'verify/screenshots/align_light_mode.png' });
});
