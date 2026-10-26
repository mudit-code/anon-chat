import { test, expect } from '@playwright/test';

test.describe('PWA & Browser Paste / Sticker Verification', () => {
  test('Pasting image files and HTML sticker tags renders in chat', async ({ page }) => {
    await page.goto('/');

    const roomKey = 'paste-' + Math.random().toString(36).substring(2, 7);

    // Check if mobile home screen is active
    const mobileCreateBtn = page.locator('#mobileBtnOpenCreateSheet');
    if (await mobileCreateBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await mobileCreateBtn.click();
      await page.fill('#mobileInputCodename', 'PasteTester');
      await page.fill('#mobileInputCreateKey', roomKey);
      await page.click('#mobilePrimarySubmitBtn');
    } else {
      await page.fill('#username', 'PasteTester');
      await page.fill('#roomKey', roomKey);
      await page.click('#createRoomBtn');
    }

    await expect(page.locator('#chatScreen')).toBeVisible({ timeout: 8000 });

    const messageInput = page.locator('#messageInput');
    await expect(messageInput).toBeVisible();

    // 1. Test pasting an image File via ClipboardEvent
    await page.evaluate(() => {
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const byteChars = atob(b64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const file = new File([byteArray], 'pasted_sticker.png', { type: 'image/png' });

      const dt = new DataTransfer();
      dt.items.add(file);

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });
      document.getElementById('messageInput')?.dispatchEvent(pasteEvent);
    });

    // Verify a message bubble was created for the pasted media
    const messageBubbles = page.locator('#messages .message-bubble');
    await expect(messageBubbles.first()).toBeVisible({ timeout: 5000 });

    // 2. Test pasting HTML containing <img> (e.g. copied from Giphy / Tenor / Discord)
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/html', '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" alt="sticker" />');

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });
      document.getElementById('messageInput')?.dispatchEvent(pasteEvent);
    });

    // Verify second bubble was created
    await expect(messageBubbles).toHaveCount(2, { timeout: 5000 });

    // 3. Test pasting direct media URL (e.g. Giphy / Tenor link)
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'https://media.giphy.com/media/test/giphy.gif');

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });
      document.getElementById('messageInput')?.dispatchEvent(pasteEvent);
    });

    // Verify third bubble was created
    await expect(messageBubbles).toHaveCount(3, { timeout: 5000 });

    console.log('All paste tests passed successfully!');
  });
});
