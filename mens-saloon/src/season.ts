/**
 * ============================================================
 *  MEN'S SALOON — automatic seasonal UI themes.
 *
 *  Website/app apne-aap season ke hisaab se badalti hai:
 *  Diwali–Chhath 🪔 · Shaadi season 💍 · Holi 🎨 · Garmi ☀️ ·
 *  Monsoon 🌧️ · New Year 🎉 — gold accent rang aur banner
 *  line dono automatic. Owner chahe to Shop Panel se
 *  "Season theme auto" band kar sakta hai.
 * ============================================================
 */

export type SeasonTheme = {
  id: string
  emoji: string
  en: string
  hi: string
  vars: { gold: string; gold2: string; accent: string }
}

export function getSeason(now = new Date()): SeasonTheme {
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const m = ist.getMonth() + 1
  const d = ist.getDate()

  /* New Year — 25 Dec to 5 Jan */
  if ((m === 12 && d >= 25) || (m === 1 && d <= 5)) {
    return {
      id: 'newyear', emoji: '🎉',
      en: 'New Year, New Look! Start the year fresh — Haircut sirf ₹50 ✂️',
      hi: 'नया साल, नया लुक! साल की फ्रेश शुरुआत — हेयरकट सिर्फ़ ₹50 ✂️',
      vars: { gold: '#d4af37', gold2: '#ffe9a8', accent: '#ffdf6b' },
    }
  }
  /* Diwali + Chhath — 15 Oct to 15 Nov */
  if ((m === 10 && d >= 15) || (m === 11 && d <= 15)) {
    return {
      id: 'diwali', emoji: '🪔',
      en: 'Festive Season! Diwali–Chhath ready look — Glow Facial ₹499 se shuru ✨',
      hi: 'त्योहार का सीज़न! दिवाली–छठ रेडी लुक — ग्लो फ़ेशियल ₹499 से शुरू ✨',
      vars: { gold: '#e08a1e', gold2: '#ffc266', accent: '#ff9d2e' },
    }
  }
  /* Shaadi season — 16 Nov to 14 Feb */
  if (m === 11 || m === 12 || m === 1 || (m === 2 && d <= 14)) {
    return {
      id: 'shaadi', emoji: '💍',
      en: 'Shaadi Season Special! Dulha & baraati grooming — Royal Makeover sirf ₹699 👑',
      hi: 'शादी सीज़न स्पेशल! दूल्हा व बराती ग्रूमिंग — रॉयल मेकओवर सिर्फ़ ₹699 👑',
      vars: { gold: '#c9a24b', gold2: '#f0c9a0', accent: '#e5484d' },
    }
  }
  /* Holi — March */
  if (m === 3) {
    return {
      id: 'holi', emoji: '🎨',
      en: 'Happy Holi! Rang ke baad baal–skin care — Hair Spa & Face Clean-Up yahi milega 🌈',
      hi: 'हैप्पी होली! रंग के बाद बाल–स्किन केयर — हेयर स्पा व फ़ेस क्लीन-अप यहीं मिलेगा 🌈',
      vars: { gold: '#d1653b', gold2: '#ffb3c9', accent: '#ff5d8f' },
    }
  }
  /* Summer — April to June */
  if (m >= 4 && m <= 6) {
    return {
      id: 'summer', emoji: '☀️',
      en: 'Summer Special! Cool fades, D-Tan pack & thandi champi — taazgi yahi hai ❄️',
      hi: 'गर्मी स्पेशल! कूल फ़ेड, डी-टैन पैक व ठंडी चंपी — ताज़गी यहीं है ❄️',
      vars: { gold: '#bfa05a', gold2: '#bfe8e0', accent: '#35c4b5' },
    }
  }
  /* Monsoon — July to September */
  if (m >= 7 && m <= 9) {
    return {
      id: 'monsoon', emoji: '🌧️',
      en: 'Monsoon Care! Baarish se baal kharab? Hair Spa + setting se phir fresh ho jaiye 💧',
      hi: 'मानसून केयर! बारिश से बाल ख़राब? हेयर स्पा + सेटिंग से फिर फ्रेश हो जाइए 💧',
      vars: { gold: '#a8a05a', gold2: '#c4e3c2', accent: '#4fae62' },
    }
  }
  /* Baaki samay (Oct shuru, Feb aakhir) — festive-ready default */
  return {
    id: 'festive', emoji: '✨',
    en: 'Tyohar ki taiyaari shuru! Fresh look ke saath season ka swagat kijiye ✂️',
    hi: 'त्योहार की तैयारी शुरू! फ्रेश लुक के साथ सीज़न का स्वागत कीजिए ✂️',
    vars: { gold: '#c9a24b', gold2: '#e8c877', accent: '#e0231c' },
  }
}
