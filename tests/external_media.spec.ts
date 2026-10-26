import { test, expect } from '@playwright/test';

test.describe('External GIFs & Stickers Verification (PWA & Browser)', () => {
  test('PWA and Browser support keyboard paste, direct media URLs, HTML img paste, and in-app GIF/sticker picker', async ({ page }) => {
    // Mock /api/gifs with sample Giphy data
    await page.route('**/api/gifs*', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'test_gif_1',
              images: {
                fixed_height: { url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' },
                original: { url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }
              }
            }
          ]
        })
      });
    });

    await page.goto('/');

    const roomKey = 'ext-' + Math.random().toString(36).substring(2, 7);

    // Support both mobile and desktop join/create screen
    const mobileCreateBtn = page.locator('#mobileBtnOpenCreateSheet');
    if (await mobileCreateBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await mobileCreateBtn.click();
      await page.fill('#mobileInputCodename', 'ExtTester');
      await page.fill('#mobileInputCreateKey', roomKey);
      await page.click('#mobilePrimarySubmitBtn');
    } else {
      await page.fill('#username', 'ExtTester');
      await page.fill('#roomKey', roomKey);
      await page.click('#createRoomBtn');
    }

    await expect(page.locator('#chatScreen')).toBeVisible({ timeout: 8000 });
    const messageInput = page.locator('#messageInput');
    await expect(messageInput).toBeVisible();

    // 1. Test Pasting an image File (e.g. from Gboard clipboard or system clipboard)
    await page.evaluate(() => {
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const byteChars = atob(b64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const file = new File([byteArray], 'keyboard_sticker.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });
      document.getElementById('messageInput')?.dispatchEvent(pasteEvent);
    });

    const bubbles = page.locator('#messages .message-bubble');
    await expect(bubbles.first()).toBeVisible({ timeout: 5000 });

    // 2. Test Pasting HTML <img> tag (e.g. copied from Giphy / Tenor / Discord in browser)
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/html', '<meta charset="utf-8"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="funny cat" />');

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });
      document.getElementById('messageInput')?.dispatchEvent(pasteEvent);
    });

    await expect(bubbles).toHaveCount(2, { timeout: 5000 });

    // 3. Test Pasting a direct external GIF / Giphy URL
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'https://media.giphy.com/media/test12345/giphy.gif');

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });
      document.getElementById('messageInput')?.dispatchEvent(pasteEvent);
    });

    await expect(bubbles).toHaveCount(3, { timeout: 5000 });

    // 4. Test In-App Emoji & GIF/Sticker Picker
    const emojiBtn = page.locator('#emojiBtn');
    await expect(emojiBtn).toBeVisible();
    await emojiBtn.click();

    const mediaPicker = page.locator('#media-picker');
    await expect(mediaPicker).toBeVisible();

    // Switch to GIFs tab in picker
    const gifsTab = mediaPicker.locator('#gifsTabBtn');
    await expect(gifsTab).toBeVisible();
    await gifsTab.click();

    // Verify GIF results loaded
    const gifItem = mediaPicker.locator('#gif-results img').first();
    await expect(gifItem).toBeVisible({ timeout: 5000 });
    await gifItem.click();

    // Verify fourth bubble was added via in-app picker
    await expect(bubbles).toHaveCount(4, { timeout: 5000 });

    console.log('External GIFs and Sticker verification passed on PWA and browser!');
  });
});
