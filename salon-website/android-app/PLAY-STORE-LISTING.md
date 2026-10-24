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
• Save your usual service on this device
• Browse the salon information and photos offline after setup

Booking requests are sent to WhatsApp for confirmation and are not confirmed appointments until the salon replies. Opening hours are not listed because they have not been verified.

- **Website:** https://mens-salon-ten.vercel.app/
- **Privacy policy:** https://mens-salon-ten.vercel.app/privacy.html
- **Support phone:** +91 90313 68918
- **Suggested category:** Lifestyle

## Owner actions required before publication

1. The website and privacy URL must be publicly reachable. The Vercel project currently protects its default aliases; the owner must disable that protection or attach a domain they own.
2. The owner needs a verified Google Play Console developer account and must accept Google's current app-content, privacy, and testing requirements.
3. Create and keep a persistent upload-signing key securely. The current GitHub release APK is debug-signed for sideload testing and is not a Play Store upload.
4. Build a signed Android App Bundle (AAB) with the upload key, then complete the Play Console Data safety, app access, content rating, target-audience, and store-asset forms.
5. Upload real app screenshots and the required feature graphic. Do not add fabricated reviews, ratings, salon hours, or map coordinates.

## Data-handling summary for the Play Console form

- The app has no salon account, booking database, advertising SDK, or analytics SDK in its source.
- Language choice and one saved usual service are stored locally on the device; the service worker caches static site files and photos.
- If a customer submits the booking form, the app opens WhatsApp with the details they entered. The customer chooses whether to send the message; WhatsApp handles it under its own terms.
- AI helper links copy a general salon-context prompt to the clipboard and open a provider. The site does not automatically submit user-entered booking details to AI providers.
- Review the actual third-party SDK and network disclosures in the final release build before completing Data safety declarations.
