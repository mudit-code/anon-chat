import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.mudit.anonchat',
  appName: 'Anon Chat',
  webDir: 'public',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Body,
    },
    SystemBars: {
      insetsHandling: 'css',
    },
  },
};

export default config;
