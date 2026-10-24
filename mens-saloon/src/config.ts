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
  // The owner said "Day" for hours: shown honestly as daytime / open daily.
  // TODO(owner): replace with exact clock timings when final, e.g. "9 AM – 9 PM".
  hoursLabel: 'Open Daily · Day Hours',
  hoursNote: 'Walk-ins welcome. Call or WhatsApp to confirm today’s closing time.',
  mapsUrl:
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent("Men's Saloon Sudama Nagar Nawada Bihar"),
} as const

export const BARBER = {
  name: 'Nitish Jatav',
  role: 'Master Barber & Founder',
  age: 24,
  experienceYears: 10,
  photo: '/images/nitish-jatav.jpg',
  bio: 'Ten years behind the chair, one simple rule — every man leaves sharper than he arrived. Nitish specialises in precision fades, classic cuts and beard sculpting, finished with a clean, premium chair experience.',
  specialities: ['Skin Fades', 'Classic Haircuts', 'Beard Sculpting', 'Hair Styling', 'Royal Shave'],
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
 * Starting prices researched for Indian men's salons in 2025–26 and
 * adjusted for Nawada (premium look, local-friendly rates):
 * premium haircuts in India start ~₹250, beard trim ~₹150–₹239,
 * Patna at-home haircut ₹259. Owner can edit any price here.
 * Every premium booking reserves a full 1-hour chair session.
 */
export const SERVICES: Service[] = [
  { id: 'signature-haircut', name: 'Signature Haircut', desc: 'Consultation, precision cut matched to your face shape, wash & finish styling.', price: 249, duration: '~45 min', tag: 'Most Booked' },
  { id: 'skin-fade', name: 'Skin Fade & Style', desc: 'Zero / low / mid / high fade with crisp lines, razor detailing and styled finish.', price: 299, duration: '~45 min', tag: 'Trending' },
  { id: 'beard-sculpt', name: 'Beard Sculpt & Trim', desc: 'Shape, line-up and hot-towel finish for a sharp, clean beard outline.', price: 199, duration: '~30 min' },
  { id: 'royal-shave', name: 'Royal Wet Shave', desc: 'Traditional straight-razor shave with foam, hot towel and cooling after-care.', price: 199, duration: '~30 min' },
  { id: 'haircut-beard', name: 'Haircut + Beard Combo', desc: 'The complete refresh — signature haircut plus full beard sculpt in one chair session.', price: 399, duration: '1 hour', tag: 'Best Value' },
  { id: 'hair-colour', name: 'Hair Colour (Global)', desc: 'Natural-looking global colour to cover greys or change your tone. Shade consultation included.', price: 599, priceNote: 'onwards', duration: '~60 min' },
  { id: 'beard-colour', name: 'Beard Colour', desc: 'Even, natural beard colour matched to your hair for a younger, fuller look.', price: 249, duration: '~30 min' },
  { id: 'hair-spa', name: 'Hair Spa & Wash', desc: 'Deep-cleansing wash, nourishing spa cream and relaxing massage for dry or damaged hair.', price: 499, duration: '~45 min' },
  { id: 'facial', name: 'Face Clean-Up & Facial', desc: 'Cleanse, exfoliate and brighten — removes tan and dullness for a fresh, photo-ready face.', price: 699, priceNote: 'onwards', duration: '~60 min' },
  { id: 'dtan', name: 'D-Tan Treatment', desc: 'Gentle de-tan pack for face & neck that lifts sun tan and evens skin tone.', price: 349, duration: '~30 min' },
  { id: 'head-massage', name: 'Head Massage (Champi)', desc: 'Stress-melting oil champi that boosts circulation and leaves hair feeling stronger.', price: 249, duration: '~30 min' },
  { id: 'kids-haircut', name: 'Kids Haircut (Under 12)', desc: 'Patient, friendly haircut for young gentlemen — clean, quick and comfortable.', price: 199, duration: '~30 min' },
]

export const COMBOS = [
  {
    name: 'Essential Groom',
    price: 399,
    duration: '1 hour',
    items: ['Signature Haircut', 'Beard Sculpt & Trim', 'Wash & Style Finish'],
    note: 'The everyday sharp look.',
  },
  {
    name: 'Premium Ritual',
    price: 799,
    duration: '1 hour',
    items: ['Haircut + Beard Combo', 'Hair Spa & Wash', 'Head Massage', 'Hot-Towel Finish'],
    note: 'Our signature 1-hour chair ritual.',
    featured: true,
  },
  {
    name: 'Royal Makeover',
    price: 1299,
    duration: '~90 min',
    items: ['Haircut + Beard Combo', 'Face Clean-Up & Facial', 'D-Tan Treatment', 'Hair Spa & Styling'],
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
  { name: 'Beard Sculpt', hint: 'Shaped beard with razor line-up' },
  { name: 'French Beard', hint: 'Trim, defined chin & moustache style' },
] as const

/** 1-hour appointment slots (customer's preferred time — shop confirms on WhatsApp). */
export const TIME_SLOTS = [
  '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM',
  '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM',
] as const

export const FAQS = [
  {
    q: 'Do I need an appointment, or can I walk in?',
    a: 'Walk-ins are always welcome. Booking on WhatsApp simply reserves your chair so you do not have to wait — your 1-hour slot is kept only for you.',
  },
  {
    q: 'How long does a haircut take?',
    a: 'A signature haircut takes about 45 minutes. Every premium booking reserves a full 1-hour chair session, so your cut is never rushed.',
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
    q: 'Are the prices final?',
    a: 'Prices shown are honest starting prices for standard hair length and service. Your final price is always confirmed before we start — no surprises at the counter.',
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
