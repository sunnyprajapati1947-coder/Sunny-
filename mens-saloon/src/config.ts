/**
 * ============================================================
 *  MEN'S SALOON — single place to edit business details.
 *  Change prices, phone, hours or services ONLY here and the
 *  whole website (cards, booking form, WhatsApp) updates.
 * ============================================================
 */

export const BUSINESS = {
  name: "Men's Saloon",
  tagline: 'Premium Haircut | Beard | Styling | Grooming',
  phoneDisplay: '+91 90313 68918',
  phoneE164: '+919031368918',
  whatsappNumber: '919031368918', // country code + number, no "+" or spaces
  area: 'Sudama Nagar',
  city: 'Nawada',
  state: 'Bihar',
  addressLine: 'Sudama Nagar, Nawada, Bihar',
  // Shop timing confirmed by owner: opens 7 AM, closes 8:30 PM.
  opensAt: '07:00', // 24h, Asia/Kolkata — used for the live Open/Closed badge
  closesAt: '20:30',
  hoursLabel: 'Open Daily · 7:00 AM – 8:30 PM',
  hoursNote: 'Walk-ins welcome all day. Last booking slot 7:30 PM — book on WhatsApp to skip the waiting.',
  mapsUrl:
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent("Men's Saloon Sudama Nagar Nawada Bihar"),
} as const

/** Live Open/Closed check in Indian time (Asia/Kolkata). */
export function isOpenNow(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const mins = h * 60 + m
  const toMins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  return mins >= toMins(BUSINESS.opensAt) && mins < toMins(BUSINESS.closesAt)
}

export const BARBER = {
  name: 'Nitish Jatav',
  role: 'Master Barber & Founder',
  age: 24,
  experienceYears: 10,
  photo: '/images/nitish-jatav.jpg',
  bio: 'Ten years behind the chair, one simple rule — every man leaves sharper than he arrived. Nitish specialises in precision fades, classic cuts and beard setting, finished with a clean, premium chair experience at honest bajar prices.',
  specialities: ['Skin Fades', 'Classic Haircuts', 'Beard Setting', 'Clean Shaving', 'Hair Styling'],
} as const

export type Service = {
  id: string
  name: string
  desc: string
  price: number
  priceNote?: string
  duration: string
  tag?: string
}

/**
 * Owner-confirmed bajar (local market) prices for Nawada:
 * Haircut ₹50 · Haircut + Shaving ₹100 · Shaving/Beard ₹50.
 * Facial & colour are "onwards" — final price depends on the
 * product/cream used and is always confirmed at the shop first.
 */
export const SERVICES: Service[] = [
  { id: 'signature-haircut', name: 'Haircut', desc: 'Clean, sharp haircut matched to your face shape — our everyday best at a true bajar price.', price: 50, duration: '~30 min', tag: 'Most Booked' },
  { id: 'skin-fade', name: 'Skin Fade & Stylish Haircut', desc: 'Zero / low / mid fade and trendy stylish cuts with razor-sharp finishing lines.', price: 100, duration: '~30–40 min', tag: 'Trending' },
  { id: 'beard-trim', name: 'Beard Trim & Setting', desc: 'Beard shape, setting and clean line-up for a neat, sharp outline.', price: 50, duration: '~20 min' },
  { id: 'clean-shaving', name: 'Clean Shaving', desc: 'Smooth clean shave with foam and a fresh, cooling finish.', price: 50, duration: '~20 min' },
  { id: 'haircut-shaving', name: 'Haircut + Shaving', desc: 'The complete bajar combo — full haircut plus clean shaving in one visit.', price: 100, duration: '~45 min', tag: 'Best Value' },
  { id: 'hair-colour', name: 'Hair Colour / Dye', desc: 'Natural-looking hair colour to cover greys or change your tone. Final price by colour/product used.', price: 150, priceNote: 'onwards', duration: '~40 min' },
  { id: 'beard-colour', name: 'Beard Colour', desc: 'Even, natural beard colour matched to your hair for a younger, fuller look.', price: 100, duration: '~30 min' },
  { id: 'hair-wash', name: 'Hair Wash & Setting', desc: 'Refreshing hair wash with style setting — walk out fresh in minutes.', price: 50, duration: '~15 min' },
  { id: 'hair-spa', name: 'Hair Spa Treatment', desc: 'Nourishing spa cream treatment with massage for dry, rough or damaged hair.', price: 199, priceNote: 'onwards', duration: '~45 min' },
  { id: 'face-cleanup', name: 'Face Clean-Up', desc: 'Deep cleansing clean-up that removes dirt, oil and dullness for a fresh face.', price: 299, duration: '~30 min' },
  { id: 'facial', name: 'Facial (Glow)', desc: 'Full glow facial — cleanse, scrub, massage and pack. Bajar-rate facial; final price by facial kit/product chosen.', price: 499, priceNote: 'onwards', duration: '~60 min', tag: 'Bajar Rate' },
  { id: 'dtan', name: 'D-Tan Treatment', desc: 'Gentle de-tan pack for face & neck that lifts sun tan and evens skin tone.', price: 199, duration: '~25 min' },
  { id: 'head-massage', name: 'Head Massage (Champi)', desc: 'Relaxing oil champi that melts stress and leaves hair feeling stronger.', price: 100, duration: '~20 min' },
  { id: 'kids-haircut', name: 'Kids Haircut (Under 12)', desc: 'Patient, friendly haircut for young gentlemen — clean, quick and comfortable.', price: 50, duration: '~20 min' },
]

export const COMBOS = [
  {
    name: 'Haircut + Shaving',
    price: 100,
    duration: '~45 min',
    items: ['Haircut (₹50)', 'Clean Shaving (₹50)', 'Style Setting Finish'],
    note: 'The bajar best-seller combo.',
  },
  {
    name: 'Full Grooming',
    price: 199,
    duration: '~1 hour',
    items: ['Haircut + Shaving', 'Head Massage (Champi)', 'Hair Wash & Setting'],
    note: 'Full fresh look in one sitting — save ₹51.',
    featured: true,
  },
  {
    name: 'Royal Makeover',
    price: 699,
    duration: '~90 min',
    items: ['Haircut + Shaving', 'Glow Facial', 'Head Massage', 'Hair Wash & Styling'],
    note: 'Wedding, party & photo-day ready.',
  },
] as const

export const STYLE_MENU = [
  { name: 'Skin Fade', hint: 'Clean zero blend, sharp sides' },
  { name: 'Textured Crop', hint: 'Short, modern, easy to maintain' },
  { name: 'Pompadour', hint: 'Volume on top, classic shine' },
  { name: 'Side Part Classic', hint: 'Neat office & wedding look' },
  { name: 'Buzz + Line-Up', hint: 'Bold, low-maintenance, crisp edges' },
  { name: 'Curly Top Fade', hint: 'Natural curls, faded sides' },
  { name: 'Beard Setting', hint: 'Shaped beard with razor line-up' },
  { name: 'French Beard', hint: 'Trim, defined chin & moustache style' },
] as const

/**
 * Preferred booking slots within shop hours (7:00 AM – 8:30 PM).
 * The customer picks a preferred time; the shop confirms on WhatsApp.
 */
export const TIME_SLOTS = [
  '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM',
  '07:00 PM', '07:30 PM',
] as const

export const FAQS = [
  {
    q: 'What are the shop timings?',
    a: 'We are open every day from 7:00 AM to 8:30 PM. Walk-ins are welcome all day — booking on WhatsApp simply saves your waiting time.',
  },
  {
    q: 'Do I need an appointment, or can I walk in?',
    a: 'Walk-ins are always welcome between 7 AM and 8:30 PM. If you book on WhatsApp, your chair time is kept ready for you.',
  },
  {
    q: 'How much is a haircut?',
    a: 'A haircut is just ₹50, clean shaving is ₹50, and haircut + shaving together is ₹100 — honest bajar prices, confirmed before we start.',
  },
  {
    q: 'How long does a haircut take?',
    a: 'A haircut takes about 30 minutes, haircut + shaving about 45 minutes, and a full facial about 60 minutes. Booking ahead means zero waiting time.',
  },
  {
    q: 'How do I book on WhatsApp?',
    a: 'Fill the booking form on this page (or tap any WhatsApp button), check the pre-filled message, and press send. We reply on WhatsApp to confirm your exact time.',
  },
  {
    q: 'Where exactly is the saloon?',
    a: 'We are in Sudama Nagar, Nawada (Bihar). Tap "Get Directions" in the Visit section to open our location in Google Maps, or call +91 90313 68918 and we will guide you.',
  },
  {
    q: 'Can I show a hairstyle photo?',
    a: 'Yes — that is the best way. Bring a photo or send it on WhatsApp before your visit, and Nitish will match the style to your hair type and face shape.',
  },
] as const

export function whatsappLink(message: string): string {
  return `https://wa.me/${BUSINESS.whatsappNumber}?text=${encodeURIComponent(message)}`
}

export function inr(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN')
}
