import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native Android shell for the same PWA.
 *
 * The APK bundles `dist/` (the exact build Vercel serves) and runs it in the
 * system WebView, so the shopkeeper gets an installable app without a browser
 * and without the "Add to home screen" step. Data still lives in IndexedDB on
 * the device and syncs to Supabase exactly like the web version.
 */
const config: CapacitorConfig = {
  appId: 'in.dukaandost.app',
  appName: 'Dukaan Dost',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    // https scheme keeps WebCrypto, IndexedDB and getUserMedia on a secure origin.
    // Without this the WebView origin is http://localhost and crypto.subtle is
    // unavailable, which would break the owner-PIN hashing.
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#0d7a4f',
      showSpinner: false,
    },
  },
}

export default config
