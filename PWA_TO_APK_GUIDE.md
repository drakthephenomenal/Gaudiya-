# 📱 Radha Naam Jap — PWA to APK Guide

## What Was Changed for APK Compatibility

| File | Change |
|------|--------|
| `manifest.json` | Added `id`, `scope`, `lang`, `dir`, `categories`, `screenshots`, `prefer_related_applications` |
| `sw.js` | Added `panchangData.js` to precache list; bumped cache to `v73` |
| `_headers` | Added HTTP headers for GitHub Pages/Netlify (manifest content-type, SW cache headers) |
| `404.html` | Copy of `index.html` — enables SPA routing on GitHub Pages |

---

## Step 1 — Push to GitHub Pages

1. Push this folder to your GitHub repo (replace `./` references in files with your actual GitHub Pages URL if needed).
2. Enable **GitHub Pages** in repo Settings → Pages → Source: `main` branch, `/ (root)`.
3. Your app URL will be: `https://<username>.github.io/<repo-name>/`

---

## Step 2 — Generate APK with PWABuilder

1. Go to **[https://www.pwabuilder.com](https://www.pwabuilder.com)**
2. Enter your GitHub Pages URL and click **Start**
3. PWABuilder will scan your PWA — all scores should be green ✅
4. Click **Package for stores**
5. Under **Android**, click **Generate Package**
6. Choose **Android (APK)** — recommended settings:
   - **Package ID**: `com.radha.naamjap` (or your own reverse-domain ID)
   - **App version**: `1.0`
   - **App version code**: `1`
   - **Signing**: Choose **Sign my package** → let PWABuilder generate a key, OR upload your own keystore
7. Click **Download** — you'll get a `.zip` with:
   - `app-release-signed.apk` ← install directly on Android
   - `app-release-bundle.aab` ← for Google Play Store submission
   - `signing.keystore` + `key.properties` ← **save these securely!**

---

## Step 3 — Install the APK on Android

**Direct install (sideload):**
1. On your Android phone, go to Settings → Security → enable **Unknown sources** (or "Install unknown apps" for the Files app)
2. Transfer `app-release-signed.apk` to your phone
3. Tap the file and install

**Via Google Play Store:**
- Use the `.aab` file and submit through [Google Play Console](https://play.google.com/console)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| PWABuilder score not green | Make sure GitHub Pages is live and HTTPS is active |
| "Manifest not found" | Wait 2–5 min after pushing; GitHub Pages takes time to deploy |
| App crashes on launch | Check that your Firebase config in `app.js` is correct |
| Icons look blurry | Your `icon-512.png` and `icon-192.png` are already included — they're fine |

---

## Your App's PWA Checklist ✅

- [x] `manifest.json` with all required fields
- [x] Service Worker (`sw.js`) with offline cache
- [x] HTTPS (GitHub Pages provides this automatically)
- [x] 192×192 and 512×512 icons
- [x] `maskable` icon purpose declared
- [x] `standalone` display mode
- [x] `theme_color` and `background_color` set
- [x] `screenshots` array (required by newer PWABuilder)
- [x] `scope` and `id` fields set
