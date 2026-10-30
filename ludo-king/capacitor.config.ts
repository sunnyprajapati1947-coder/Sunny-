import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android shell configuration.
 *
 * The web build is copied into the native project, so the game runs fully
 * offline with no network permissions needed beyond none at all.
 */
const config: CapacitorConfig = {
  appId: 'tools.ludoroyale.game',
  appName: 'Ludo Royale',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
    backgroundColor: '#120b06',
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#120b06',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
