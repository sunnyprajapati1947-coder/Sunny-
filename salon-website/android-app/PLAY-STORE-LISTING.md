# Google Play listing draft

This is prepared copy and an information checklist. It is **not a live Play Store listing**; the app needs the salon owner's Play Console submission and a persistent upload-signing key before publication.

## Listing copy

**Suggested title:** Men's Salon Nawada

**Short description:** English and Hindi salon guide with clear prices and WhatsApp appointment requests.

**Full description:**

A better haircut starts with a good conversation.

Men's Salon Nawada is a simple salon companion for services, prices, and appointment requests in Sudama Nagar, Nawada, Bihar. Meet barber Nitish Jatav, with six years of experience.

• Signature haircut — ₹50
• Beard shape-up — ₹50
• Fade & finish — ₹100
• Haircut + beard — ₹100
• English and Hindi interface
• WhatsApp appointment request
• View up to 30 recent request summaries saved on this device only
• Save your usual service on this device
• Browse the salon information and photos offline after setup

Appointment requests open in WhatsApp; you choose whether to send the message, and the salon confirms availability separately. The local history stores only the service and requested date/time; it is not proof that a message was sent or an appointment confirmed. Opening hours are not listed because they have not been verified.

- **Website:** https://mens-salon-ten.vercel.app/
- **Privacy policy:** https://mens-salon-ten.vercel.app/privacy.html
- **Support phone:** +91 90313 68918
- **Suggested category:** Lifestyle

**Prepared Android version:** 1.0.5 (version code 6), package `com.menssalon.nawada`. **This APK is debug-signed for direct installation; only a signed AAB can be uploaded to Google Play.**

## Owner actions required before publication

1. The website and privacy URL must be publicly reachable. The Vercel project currently protects its default aliases; the owner must connect the GitHub repository to Vercel and disable production protection (or attach a domain they own).
2. The owner needs a verified Google Play Console developer account and must accept Google's current app-content, privacy, and testing requirements. This repository has no connected Play Console submission access.
3. Check whether `com.menssalon.nawada` already exists in Play Console. If it does, use the existing upload key; do not generate a replacement casually. If it is a new Play listing, create and back up one persistent upload key securely.
4. Configure the upload key in GitHub Actions secrets: `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, and `ANDROID_UPLOAD_KEY_PASSWORD`. Never commit the keystore or expose its passwords in code, logs, or chat. The Android workflow builds and attaches the signed AAB only when all four secrets are present.
5. Download the signed AAB from the v1.0.5 GitHub release and upload it through the owner's Play Console. Complete Data safety, app access, content rating, target-audience, and store-asset forms there; this workflow does not publish to Google Play automatically.
6. Upload real app screenshots and the required feature graphic. Do not add fabricated reviews, ratings, salon hours, or map coordinates.

## Data-handling summary for the Play Console form

- The app has no salon account, booking database, advertising SDK, or analytics SDK in its source.
- Language choice, one saved usual service, and up to 30 request summaries (service, requested date/time, and record-save time) are stored locally on the same device. The summaries exclude the booking-form name and notes; there is no customer login, app cloud sync, or salon booking database. Android app-data backup is disabled; browser/OS backup behavior may follow device-provider settings. The service worker caches static site files and photos.
- If a customer submits the booking form, the app opens WhatsApp with the details they entered. The customer chooses whether to send the message; WhatsApp handles it under its own terms. The local request history cannot verify delivery or salon confirmation.
- AI helper links copy a general salon-context prompt to the clipboard and open a provider. The site does not automatically submit user-entered booking details to AI providers.
- Review the actual third-party SDK and network disclosures in the final release build before completing Data safety declarations.
