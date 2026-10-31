# 📱 Phone par app chalane ke 2 tarike

## ✅ Tarika 1 — PWA Install (sabse aasan, 30 second, koi PC nahi chahiye)

App **PWA** hai — phone par native app jaisi install hoti hai (home-screen icon, full-screen, offline cache, push-style alerts).

1. Phone ke **Chrome** (Android) ya **Safari** (iPhone) me app ka HTTPS URL kholein
   (Arena preview URL, ya apna hosted URL jaise `https://kirana.vercel.app`).
2. **Android:** Chrome menu **⋮ → "Install app" / "Add to Home screen"** → Install.
   **iPhone:** **Share (⬆) → "Add to Home Screen" → Add**.
3. Home screen par **Rishu Kirana** icon → tap → app full-screen khulegi, browser jaisa kuch nahi dikhega.
4. App ke andar top-bar ka **📲 button** bhi install kar deta hai aur help dikhata hai.

> Offline: ek baar khulne ke baad network chala jaye to bhi app shell + last data cache se khulta hai;
> billing ke liye internet chahiye (data server par safe rehta hai).

---

## 🤖 Tarika 2 — Asli APK file (Capacitor, ~10 minute, PC chahiye)

Isse **app-debug.apk** banegi jo phone me copy karke install kar sakte hain (ya Play Store ke liye AAB).

### Prerequisites
- PC par **Node.js 18+**, **Java JDK 17**, **Android Studio** (SDK ke saath).
- App ka backend kahin hosted ho (Railway/Render + MongoDB Atlas) ya same network par ho.

### Steps
```bash
# 1) repo clone karke frontend me aao
git clone https://github.com/sunnyprajapati1947-coder/Sunny-.git
cd Sunny-/kirana-store/frontend
npm install

# 2) API URL set karo (jahan backend hosted hai) — .env file banao:
echo "VITE_API_URL=https://<aapka-backend>.up.railway.app/api" > .env

# 3) web app build karo
npm run build

# 4) Android platform add karo (sirf pehli baar)
npx cap add android

# 5) build ko android project me sync karo
npx cap sync

# 6) APK banao — do options:
#    (a) Android Studio kholo:
npx cap open android        # phir Build → Build Bundle(s)/APK(s) → Build APK(s)
#    (b) ya command line se:
cd android && ./gradlew assembleDebug
#    APK yahan banegi: android/app/build/outputs/apk/debug/app-debug.apk
```

7) `app-debug.apk` phone par bhejo (WhatsApp/USB/Drive) → tap karke install karo
   (Settings → "Install unknown apps" allow karna hoga). Bas! App icon se khulegi.

### Notes
- `capacitor.config.json` me `appId = com.rishukirana.pos`, `appName = Rishu Kirana Store` set hai.
- **Offline-first native shell** chahiye (bina server.url ke) to `VITE_API_URL` zaroori hai kyunki
  bundled app ko backend ka absolute address chahiye; same-origin hosting me `/api` proxy chalta hai.
- Play Store upload ke liye: `./gradlew bundleRelease` + signed keystore (Android Studio se generate karein).
- iOS app (IPA) bhi isi tarah: `npx cap add ios` (Mac + Xcode chahiye).

---

## 🌐 Hosting quick-recap (app + database online)
1. **Backend:** Railway/Render par `kirana-store/backend` deploy karo, env: `MONGODB_URI` (Atlas), `JWT_SECRET`.
2. **Frontend:** Vercel/Netlify par `kirana-store/frontend` deploy karo, env: `VITE_API_URL=<backend-url>/api`.
3. Dono HTTPS milte hain → PWA install + APK dono turant kaam karenge.
