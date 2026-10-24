import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
    trace: 'off',
  },
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000/health',
    reuseExistingServer: true,
    timeout: 30000,
    env: {
      PORT: '3000',
      ROOM_TTL_MS: '1800000',
      VAULT_TTL_MS: '1800000',
    },
  },
});
