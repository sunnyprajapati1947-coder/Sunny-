import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import './App.css'
import { Scene } from './Scene'
import {
  BARBER,
  BUSINESS,
  COMBOS,
  FAQS,
  SERVICES,
  STYLE_MENU,
  TIME_SLOTS,
  inr,
  isOpenNow,
  whatsappLink,
  SERVICE_DESC_HI,
  FAQ_HI,
  STYLE_HINT_HI,
} from './config'
import {
  saveBooking,
  fetchMyBookings,
  fetchAdminBookings,
  setBookingStatus,
  changeAdminPin,
  type DbBooking,
  type BookingStatus,
} from './db'

/* ---------- small helpers ---------- */

function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.reveal'))
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
      { threshold: 0.12 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const todayISO = () => new Date().toISOString().slice(0, 10)
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

type Booking = {
  name: string
  phone: string
  serviceId: string
  date: string
  time: string
  notes: string
}


/* ---------- English / हिंदी toggle (copied from the earlier salon site) ---------- */
type Lang = 'en' | 'hi'
const T = {
  en: {
    announce: 'A considered cut. A little time for yourself. — Sudama Nagar, Nawada',
    navServices: 'Services', navCombos: 'Combos', navBarber: 'Barber', navStyles: 'Styles', navVisit: 'Visit', navFaq: 'FAQ',
    bookWhats: 'Book on WhatsApp',
    heroChapter: 'Chapter 00 — The Chair Awaits',
    heroLede: 'brings a premium, luxury chair experience to',
    heroLede2: '— precision haircuts, sculpted beards and complete grooming by',
    heroLede3: 'a master barber with',
    heroLede4: 'years of craft.',
    heroBook: '{t.heroBook}', heroWhats: '{t.heroWhats}', heroCall: '{t.heroCall}',
    stat1: 'Master barber craft', stat2: 'Open daily', stat3: 'Haircut · bajar price', stat4: 'Open · walk-ins welcome',
    openNow: '● Open Now', closedNow: '● Closed — Opens 7:00 AM',
    servicesChapter: 'Chapter 01 — Services & Prices',
    servicesH2: 'Everything a gentleman needs, honestly priced.',
    bookThis: '{t.bookThis}',
    combosChapter: 'Chapter 02 — Grooming Rituals', combosH2: 'Combos that save time — and money.',
    barberChapter: 'Chapter 03 — Meet Your Barber',
    exp: 'Experience', young: 'Young master barber', personal: 'Personal attention, every chair',
    bookWith: '{t.bookWith}', chatWhats: '{t.chatWhats}',
    stylesChapter: 'Style Menu — Pick Your Look', stylesH2: 'Not sure what suits you? Start here.',
    askStyle: 'Ask for this style →',
    whyH3: 'Why men choose',
    bookChapter: 'Chapter 04 — Book Your Chair', bookH2: 'Three steps. Zero waiting.',
    step1: 'Fill the form', step1d: 'Name, service, date and your preferred time (7 AM – 8:30 PM).',
    step2: 'Send on WhatsApp', step2d: 'We open WhatsApp with everything pre-filled — just press send.',
    step3: 'We confirm', step3d: 'replies on WhatsApp to lock your exact time.',
    youBooking: 'You are booking', withWord: 'with',
    formH3: 'Book an Appointment', fName: '{t.fName}', fPhone: '{t.fPhone}', fService: '{t.fService}',
    fDate: '{t.fDate}', fTime: '{t.fTime}', fNotes: '{t.fNotes}',
    fSubmit: '{t.fSubmit}',
    fNote: 'No advance payment. Pay at the saloon after your service. Your booking is saved in our secure cloud record (see it anytime in “My Bookings” below) and opened in WhatsApp for confirmation.',
    faqChapter: 'Good Questions', faqH2: 'Before you visit',
    visitChapter: 'Chapter 05 — Visit Us',
    vAddress: 'Address', vPhone: 'Phone / WhatsApp', vHours: 'Hours', vBarber: 'Barber',
    vOpen: '● Open Now — walk in!', vClosed: '● Closed now — opens 7:00 AM, book for tomorrow',
    directions: '{t.directions}', callSaloon: '{t.callSaloon}',
    call: 'Call', bookChair: 'Book Chair',
    finderChapter: 'Style Finder — 30 Second Quiz', finderH2: 'Bring an idea. Leave with your style.',
    finderSub: 'Answer 3 quick questions — we will suggest the look made for you, with its exact bajar price.',
    ritualChapter: 'The Ritual', ritualH2: 'A little time for yourself.',
    reviewChapter: 'Your Words Matter', reviewH2: 'A good name is built one visit at a time.',
    reviewSub: 'Visited us already? A few honest words on Google help every man in Nawada choose with confidence — and help this little shop grow.',
    reviewGoogle: '⭐ Review us on Google', reviewWhats: 'Send feedback on WhatsApp',
    reviewNote: 'Real service. Real feedback. No fake reviews — ever.',
    installChapter: "Men's Saloon · App", installH2: 'Add the app.',
    installSub: 'Install Men\'s Saloon on your home screen — one tap to prices, directions and WhatsApp booking, even offline.',
    installBtn: '↓ Install the Salon App',
    finalChapter: 'Afterlight — Your Chair Is Waiting',
  },
  hi: {
    announce: 'सोच-समझकर किया गया कट। अपने लिए थोड़ा समय। — सुधामा नगर, नवादा',
    navServices: 'सर्विसेज़', navCombos: 'कॉम्बो', navBarber: 'बार्बर', navStyles: 'स्टाइल', navVisit: 'पता', navFaq: 'सवाल-जवाब',
    bookWhats: 'WhatsApp पर बुक करो',
    heroChapter: 'अध्याय 00 — कुर्सी आपका इंतज़ार कर रही है',
    heroLede: 'प्रीमियम, लग्ज़री कुर्सी का अनुभव लेकर आया है',
    heroLede2: 'में — सटीक हेयरकट, शेप्ड दाढ़ी और पूरी ग्रूमिंग,',
    heroLede3: 'के हाथों — मास्टर बार्बर,',
    heroLede4: 'साल के हुनर के साथ।',
    heroBook: 'मेरी कुर्सी बुक करो — ₹50 हेयरकट', heroWhats: 'WhatsApp करो', heroCall: '☎ कॉल करो',
    stat1: 'मास्टर बार्बर का हुनर', stat2: 'रोज़ खुला', stat3: 'हेयरकट · बाज़ार भाव', stat4: 'खुला · वॉक-इन स्वागत है',
    openNow: '● अभी खुला है', closedNow: '● बंद — सुबह 7 बजे खुलेगा',
    servicesChapter: 'अध्याय 01 — सर्विसेज़ और दाम',
    servicesH2: 'एक सज्जन को जो चाहिए, सब कुछ — ईमानदार दाम में।',
    bookThis: 'यही बुक करो →',
    combosChapter: 'अध्याय 02 — ग्रूमिंग रिचुअल', combosH2: 'कॉम्बो — समय भी बचे, पैसा भी।',
    barberChapter: 'अध्याय 03 — अपने बार्बर से मिलिए',
    exp: 'अनुभव', young: 'युवा मास्टर बार्बर', personal: 'हर कुर्सी पर पर्सनल ध्यान',
    bookWith: 'नितीश के साथ बुक करो', chatWhats: 'WhatsApp पर बात करो',
    stylesChapter: 'स्टाइल मेनू — अपना लुक चुनो', stylesH2: 'समझ नहीं आ रहा कौन-सा स्टाइल जँचेगा? यहाँ से शुरू करो।',
    askStyle: 'यही स्टाइल माँगो →',
    whyH3: 'लोग क्यों चुनते हैं',
    bookChapter: 'अध्याय 04 — अपनी कुर्सी बुक करो', bookH2: 'तीन स्टेप। ज़ीरो इंतज़ार।',
    step1: 'फ़ॉर्म भरो', step1d: 'नाम, सर्विस, तारीख़ और अपना पसंदीदा समय (7 AM – 8:30 PM)।',
    step2: 'WhatsApp पर भेजो', step2d: 'WhatsApp सब कुछ भरकर खुलेगा — बस Send दबा दो।',
    step3: 'हम कन्फ़र्म करेंगे', step3d: 'WhatsApp पर जवाब देकर आपका समय पक्का करेगा।',
    youBooking: 'आप बुक कर रहे हैं', withWord: 'के साथ',
    formH3: 'Appointment बुक करो', fName: 'आपका नाम *', fPhone: 'मोबाइल नंबर (WhatsApp) *', fService: 'सर्विस *',
    fDate: 'तारीख़ *', fTime: 'पसंदीदा समय (7 AM – 8:30 PM) *', fNotes: 'कुछ और बताना चाहोगे?',
    fSubmit: 'WhatsApp पर कन्फ़र्म करो →',
    fNote: 'कोई एडवांस पेमेंट नहीं। सर्विस के बाद दुकान पर ही पैसे दो। आपकी बुकिंग हमारे सुरक्षित क्लाउड रिकॉर्ड में सेव होती है (नीचे “मेरी बुकिंग्स” में कभी भी देख सकते हो) और कन्फ़र्म के लिए WhatsApp में खुलती है।',
    faqChapter: 'अच्छे सवाल', faqH2: 'आने से पहले जान लो',
    visitChapter: 'अध्याय 05 — हमसे मिलिए',
    vAddress: 'पता', vPhone: 'फ़ोन / WhatsApp', vHours: 'समय', vBarber: 'बार्बर',
    vOpen: '● अभी खुला है — आ जाओ!', vClosed: '● अभी बंद — सुबह 7 बजे खुलेगा, कल के लिए बुक करो',
    directions: 'रास्ता देखो ↗', callSaloon: '☎ दुकान पर कॉल करो',
    call: 'कॉल', bookChair: 'कुर्सी बुक करो',
    finderChapter: 'स्टाइल फ़ाइंडर — 30 सेकंड क्विज़', finderH2: 'आइडिया लाओ। अपना स्टाइल लेकर जाओ।',
    finderSub: '3 छोटे सवालों के जवाब दो — हम आपके लिए बना लुक बताएँगे, उसके पक्के बाज़ार दाम के साथ।',
    ritualChapter: 'द रिचुअल', ritualH2: 'अपने लिए थोड़ा समय।',
    reviewChapter: 'आपकी बात मायने रखती है', reviewH2: 'अच्छा नाम एक-एक विज़िट से बनता है।',
    reviewSub: 'हमारे यहाँ आ चुके हो? Google पर कुछ ईमानदार शब्द नवादा के हर आदमी को भरोसे से चुनने में मदद करेंगे — और इस छोटी दुकान को बढ़ने में भी।',
    reviewGoogle: '⭐ Google पर रिव्यू दो', reviewWhats: 'WhatsApp पर फ़ीडबैक भेजो',
    reviewNote: 'असली सर्विस। असली फ़ीडबैक। नकली रिव्यू — कभी नहीं।',
    installChapter: "Men's Saloon · ऐप", installH2: 'ऐप लगा लो।',
    installSub: 'Men\'s Saloon को होम स्क्रीन पर लगा लो — एक टैप में दाम, रास्ता और WhatsApp बुकिंग, ऑफ़लाइन भी।',
    installBtn: '↓ सैलून ऐप इंस्टॉल करो',
    finalChapter: 'आफ़्टरलाइट — आपकी कुर्सी इंतज़ार कर रही है',
  },
} as const

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> }


/* ---------- History / Shop Panel copy (EN / हिंदी) ---------- */
const HT = {
  en: {
    chapter: 'Booking History — Cloud Record',
    h2: 'Your visits, remembered.',
    sub: 'Every website booking is saved securely in our cloud database. Check your history anytime — from any phone, forever.',
    custTitle: '📖 My Bookings',
    custSub: 'Enter the same mobile number you booked with — all your past & upcoming salon bookings will appear instantly.',
    phoneLabel: 'Mobile number',
    phonePh: '10-digit mobile number',
    showBtn: 'Show My History',
    searching: 'Searching…',
    enterPhone: 'Please enter a valid 10-digit mobile number.',
    noRows: 'No booking found for this number yet. Book above — it will appear right here!',
    errNet: 'Network issue — please check internet and try again.',
    adminTitle: '🔐 Shop Panel (Owner Only)',
    adminSub: 'For the shop owner — enter the secret Admin PIN to see every booking, confirm chairs and mark visits done.',
    pinLabel: 'Admin PIN',
    pinPh: 'Secret PIN',
    openBtn: 'Open Shop Panel',
    opening: 'Opening…',
    totalL: 'Total bookings',
    todayL: "Today's",
    pendingL: 'Waiting confirm',
    refresh: '↻ Refresh',
    logout: 'Lock Panel',
    allEmpty: 'No bookings in the record yet. (If bookings exist but this looks empty, the PIN may be wrong.)',
    panelNote: 'Data is stored in the Men’s Saloon cloud database (Supabase). Only the correct PIN can open this record — keep it secret.',
    callL: 'Call',
    stPending: '⏳ Waiting', stConfirmed: '✅ Confirmed', stDone: '💈 Done', stCancelled: '✖ Cancelled',
    actConfirm: 'Confirm', actDone: 'Done', actCancel: 'Cancel',
    newPinLabel: 'Change Admin PIN (type new PIN)',
    changePinBtn: 'Set New PIN',
    pinChanged: '✓ PIN changed. Next time use the new PIN.',
    pinTooShort: 'PIN must be at least 4 characters.',
    dbSaved: '✓ Saved in the shop cloud record — see it anytime in “My Bookings” below.',
    dbFailed: '(Network was slow — your booking still went on WhatsApp. Cloud copy will save with your next booking.)',
  },
  hi: {
    chapter: 'बुकिंग इतिहास — क्लाउड रिकॉर्ड',
    h2: 'आपकी विज़िट्स, हमेशा याद।',
    sub: 'हर वेबसाइट बुकिंग हमारे क्लाउड डेटाबेस में सुरक्षित सेव होती है। अपना इतिहास कभी भी, किसी भी फ़ोन से देखिए।',
    custTitle: '📖 मेरी बुकिंग्स',
    custSub: 'वही मोबाइल नंबर डालो जिससे बुकिंग की थी — आपकी सारी पुरानी और आने वाली बुकिंग तुरंत दिख जाएगी।',
    phoneLabel: 'मोबाइल नंबर',
    phonePh: '10 अंकों का मोबाइल नंबर',
    showBtn: 'मेरा इतिहास दिखाओ',
    searching: 'ढूँढ रहे हैं…',
    enterPhone: 'सही 10 अंकों का मोबाइल नंबर डालो।',
    noRows: 'इस नंबर पर अभी कोई बुकिंग नहीं मिली। ऊपर बुक करो — तुरंत यहीं दिखेगी!',
    errNet: 'नेटवर्क की दिक्कत है — इंटरनेट चेक करके फिर कोशिश करो।',
    adminTitle: '🔐 दुकान पैनल (केवल मालिक)',
    adminSub: 'दुकान मालिक के लिए — गुप्त Admin PIN डालकर सारी बुकिंग देखो, कुर्सी कन्फ़र्म करो और विज़िट पूरी मार्क करो।',
    pinLabel: 'Admin PIN',
    pinPh: 'गुप्त PIN',
    openBtn: 'दुकान पैनल खोलो',
    opening: 'खुल रहा है…',
    totalL: 'कुल बुकिंग',
    todayL: 'आज की',
    pendingL: 'कन्फ़र्म बाकी',
    refresh: '↻ रिफ़्रेश',
    logout: 'पैनल बंद करो',
    allEmpty: 'रिकॉर्ड में अभी कोई बुकिंग नहीं है। (अगर बुकिंग है फिर भी खाली दिखे तो PIN गलत हो सकता है।)',
    panelNote: 'डेटा Men’s Saloon के क्लाउड डेटाबेस (Supabase) में रहता है। सही PIN से ही यह रिकॉर्ड खुलता है — PIN गुप्त रखो।',
    callL: 'कॉल',
    stPending: '⏳ इंतज़ार में', stConfirmed: '✅ कन्फ़र्म', stDone: '💈 हो गया', stCancelled: '✖ कैंसल',
    actConfirm: 'कन्फ़र्म', actDone: 'हो गया', actCancel: 'कैंसल',
    newPinLabel: 'Admin PIN बदलो (नया PIN लिखो)',
    changePinBtn: 'नया PIN सेट करो',
    pinChanged: '✓ PIN बदल गया। अगली बार नया PIN डालना।',
    pinTooShort: 'PIN कम से कम 4 अक्षरों का होना चाहिए।',
    dbSaved: '✓ दुकान के क्लाउड रिकॉर्ड में सेव हो गया — “मेरी बुकिंग्स” में कभी भी दिखेगा।',
    dbFailed: '(नेटवर्क धीमा था — आपकी बुकिंग WhatsApp पर चली गई है। क्लाउड कॉपी अगली बुकिंग पर सेव होगी।)',
  },
} as const

/* ---------- app ---------- */

export default function App() {
  useReveal()

  const [lang, setLang] = useState<Lang>(() => {
    try { return localStorage.getItem('mens-saloon-lang') === 'hi' ? 'hi' : 'en' } catch { return 'en' }
  })
  const t = T[lang]
  useEffect(() => {
    try { localStorage.setItem('mens-saloon-lang', lang) } catch { /* ignore */ }
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en'
  }, [lang])
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallHelp, setShowInstallHelp] = useState(false)
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as BeforeInstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])
  const [finder, setFinder] = useState<{ vibe?: string; hair?: string; beard?: string }>({})
  const finderResult = (() => {
    if (!finder.vibe || !finder.hair || !finder.beard) return null
    if (finder.vibe === 'party') return { style: 'Pompadour + Glow Facial', serviceId: 'facial', en: 'Volume on top, photo-ready glow — the full shaadi-party look.', hi: 'ऊपर वॉल्यूम, फोटो-रेडी ग्लो — पूरा शादी-पार्टी लुक।' }
    if (finder.hair === 'curly') return { style: 'Curly Top Fade', serviceId: 'skin-fade', en: 'Your natural curls on top, clean faded sides. Zero daily struggle.', hi: 'ऊपर आपके नैचुरल कर्ल्स, साइड में साफ़ फ़ेड। रोज़ की झंझट ख़त्म।' }
    if (finder.vibe === 'bold') return { style: finder.beard === 'full' ? 'Skin Fade + Beard Setting' : 'Buzz + Line-Up', serviceId: 'skin-fade', en: 'Sharp, bold and crisp from every angle — low maintenance, full attitude.', hi: 'हर एंगल से शार्प और बोल्ड — कम देखभाल, पूरा एटिट्यूड।' }
    if (finder.vibe === 'office') return { style: 'Side Part Classic', serviceId: 'signature-haircut', en: 'Neat, respected, ready for anything — the timeless gentleman look.', hi: 'नीट, सम्मानजनक, हर मौके के लिए तैयार — सदाबहार जेंटलमैन लुक।' }
    return { style: 'Textured Crop', serviceId: 'signature-haircut', en: 'Short, modern and easy — fresh everyday style in 30 minutes.', hi: 'छोटा, मॉडर्न और आसान — 30 मिनट में रोज़ का फ्रेश स्टाइल।' }
  })()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openNow, setOpenNow] = useState(() => isOpenNow())
  useEffect(() => {
    const t = setInterval(() => setOpenNow(isOpenNow()), 60_000)
    return () => clearInterval(t)
  }, [])
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [booking, setBooking] = useState<Booking>({
    name: '',
    phone: '',
    serviceId: 'haircut-shaving',
    date: todayISO(),
    time: '11:00 AM',
    notes: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof Booking, string>>>({})
  const [sent, setSent] = useState(false)
  const ht = HT[lang]
  const [dbState, setDbState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [histPhone, setHistPhone] = useState('')
  const [histRows, setHistRows] = useState<DbBooking[] | null>(null)
  const [histBusy, setHistBusy] = useState(false)
  const [histMsg, setHistMsg] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [adminPin, setAdminPin] = useState<string>(() => {
    try { return sessionStorage.getItem('mens-saloon-admin-pin') ?? '' } catch { return '' }
  })
  const [adminRows, setAdminRows] = useState<DbBooking[] | null>(null)
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminMsg, setAdminMsg] = useState('')
  const [newPin, setNewPin] = useState('')

  /* Prefill history search with the last number booked on this device. */
  useEffect(() => {
    try {
      const prev = JSON.parse(localStorage.getItem('mens-saloon-bookings') ?? '[]') as Booking[]
      if (prev.length) setHistPhone(prev[prev.length - 1].phone)
    } catch { /* ignore */ }
  }, [])

  const loadAdmin = async (pin: string) => {
    setAdminBusy(true); setAdminMsg('')
    try {
      const rows = await fetchAdminBookings(pin)
      setAdminRows(rows); setAdminPin(pin)
      try { sessionStorage.setItem('mens-saloon-admin-pin', pin) } catch { /* ignore */ }
    } catch { setAdminMsg(ht.errNet) }
    setAdminBusy(false)
  }

  /* Re-open the Shop Panel automatically if PIN was entered this session. */
  useEffect(() => {
    if (adminPin) void loadAdmin(adminPin)
  }, []) // first mount only — loadAdmin is intentionally not a dependency

  const lookupHistory = async (ev: FormEvent) => {
    ev.preventDefault()
    const digits = histPhone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
    if (!/^\d{10}$/.test(digits)) { setHistMsg(ht.enterPhone); setHistRows(null); return }
    setHistBusy(true); setHistMsg('')
    try {
      const rows = await fetchMyBookings(digits)
      setHistRows(rows)
      if (!rows.length) setHistMsg(ht.noRows)
    } catch { setHistMsg(ht.errNet); setHistRows(null) }
    setHistBusy(false)
  }

  const changeStatus = async (id: string, status: BookingStatus) => {
    try {
      const ok = await setBookingStatus(adminPin, id, status)
      if (ok) setAdminRows((rs) => rs?.map((r) => (r.id === id ? { ...r, status } : r)) ?? rs)
    } catch { setAdminMsg(ht.errNet) }
  }

  const submitPinChange = async (ev: FormEvent) => {
    ev.preventDefault()
    if (newPin.length < 4) { setAdminMsg(ht.pinTooShort); return }
    try {
      const ok = await changeAdminPin(adminPin, newPin)
      if (ok) {
        setAdminPin(newPin); setNewPin(''); setAdminMsg(ht.pinChanged)
        try { sessionStorage.setItem('mens-saloon-admin-pin', newPin) } catch { /* ignore */ }
      } else setAdminMsg(ht.errNet)
    } catch { setAdminMsg(ht.errNet) }
  }

  const statusLabel = (st: BookingStatus) =>
    ({ pending: ht.stPending, confirmed: ht.stConfirmed, done: ht.stDone, cancelled: ht.stCancelled })[st]
  const fmtDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  const formRef = useRef<HTMLFormElement>(null)

  const selectedService = useMemo(
    () => SERVICES.find((s) => s.id === booking.serviceId) ?? SERVICES[0],
    [booking.serviceId],
  )

  const quickBook = (message: string) => whatsappLink(message)

  function chooseService(serviceId: string) {
    setBooking((b) => ({ ...b, serviceId }))
    setSent(false)
    scrollToId('book')
  }

  function chooseCombo(name: string, price: number) {
    window.open(
      quickBook(
        `Hello Men's Saloon! I want to book the *${name}* (${inr(price)}). Please share the best available time today.`,
      ),
      '_blank',
      'noopener',
    )
  }

  function validate(b: Booking) {
    const e: Partial<Record<keyof Booking, string>> = {}
    if (b.name.trim().length < 3) e.name = 'Please enter your full name.'
    const digits = b.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
    if (!/^[6-9]\d{9}$/.test(digits)) e.phone = 'Enter a valid 10-digit mobile number.'
    if (!b.date) e.date = 'Please pick a date.'
    else if (b.date < todayISO()) e.date = 'Date cannot be in the past.'
    if (!b.time) e.time = 'Please pick a preferred time.'
    return e
  }

  function submitBooking(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(booking)
    setErrors(e)
    if (Object.keys(e).length > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    const niceDate = new Date(booking.date + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    const message = [
      `Hello Men's Saloon! I want to book an appointment.`,
      ``,
      `*Name:* ${booking.name.trim()}`,
      `*Mobile:* ${booking.phone.trim()}`,
      `*Service:* ${selectedService.name} (${inr(selectedService.price)}${selectedService.priceNote ? ' ' + selectedService.priceNote : ''}, ${selectedService.duration})`,
      `*Barber:* ${BARBER.name}`,
      `*Date:* ${niceDate}`,
      `*Preferred time:* ${booking.time}`,
      booking.notes.trim() ? `*Note:* ${booking.notes.trim()}` : '',
      ``,
      `Please confirm my slot. Thank you!`,
    ]
      .filter((l) => l !== '')
      .join('\n')

    try {
      const key = 'mens-saloon-bookings'
      const prev = JSON.parse(localStorage.getItem(key) ?? '[]') as Booking[]
      localStorage.setItem(key, JSON.stringify([...prev, { ...booking, at: new Date().toISOString() }]))
    } catch {
      /* local copy is a nicety — WhatsApp is the real booking channel */
    }
    /* Cloud database me bhi save karo — fail ho to bhi WhatsApp booking rukti nahi. */
    setDbState('saving')
    saveBooking({
      name: booking.name.trim(),
      phone: booking.phone.trim(),
      service: selectedService.name,
      price: selectedService.price,
      appt_date: booking.date,
      appt_time: booking.time,
      notes: booking.notes.trim(),
    })
      .then(() => setDbState('saved'))
      .catch(() => setDbState('failed'))
    setHistPhone(booking.phone)

    setSent(true)
    window.open(whatsappLink(message), '_blank', 'noopener')
  }

  return (
    <div className="site" lang={lang}>
      <div className="announcement">
        <span className="announce-dot" aria-hidden="true" />
        <p>{t.announce}</p>
      </div>
      {/* ===== top bar ===== */}
      <header className="topbar">
        <a className="brand" href="#top" onClick={(e) => { e.preventDefault(); scrollToId('top') }}>
          <span className="brand-mark" aria-hidden="true">✂</span>
          <span className="brand-text">
            <strong>MEN’S SALOON</strong>
            <small>Sudama Nagar · Nawada</small>
          </span>
        </a>

        <nav className={`topnav ${menuOpen ? 'open' : ''}`} aria-label="Main">
          {[
            [t.navServices, 'services'],
            [t.navCombos, 'combos'],
            [t.navBarber, 'barber'],
            [t.navStyles, 'styles'],
            [t.navVisit, 'visit'],
            [t.navFaq, 'faq'],
            [lang === 'hi' ? 'मेरी बुकिंग' : 'My Bookings', 'history'],
          ].map(([label, id]) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(e) => { e.preventDefault(); setMenuOpen(false); scrollToId(id) }}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="top-actions">
          <a className="btn btn-ghost hide-sm" href={`tel:${BUSINESS.phoneE164}`}>
            ☎ {BUSINESS.phoneDisplay}
          </a>
          <a
            className="btn btn-red hide-sm"
            href={quickBook("Hello Men's Saloon! I want to book a haircut. Please share today's available time.")}
            target="_blank"
            rel="noreferrer"
          >
            {t.bookWhats}
          </a>
          <button
            className="lang-btn"
            onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
            aria-label={lang === 'en' ? 'हिंदी में देखो' : 'View in English'}
          >
            {lang === 'en' ? 'हिंदी' : 'EN'}
          </button>
          <button
            className="menu-btn"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      <main id="top">
        {/* ===== Chapter 00 — salon hero ===== */}
        <section className="hero">
          <div className="hero-copy reveal">
            <p className="chapter">{t.heroChapter}</p>
            <h1>
              Sharp cuts.
              <br />
              <em>Royal</em> grooming.
            </h1>
            <p className="lede">
              {BUSINESS.name} {t.heroLede} {BUSINESS.area}, {BUSINESS.city}{' '}
              {t.heroLede2} {BARBER.name} {t.heroLede3} {BARBER.experienceYears} {t.heroLede4}
            </p>
            <div className="hero-ctas">
              <button className="btn btn-red btn-lg" onClick={() => scrollToId('book')}>
                Book My Chair — ₹50 Haircut
              </button>
              <a
                className="btn btn-wa btn-lg"
                href={quickBook("Hello Men's Saloon! I want to book an appointment. Please share today's available slots.")}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp Us
              </a>
              <a className="btn btn-ghost btn-lg" href={`tel:${BUSINESS.phoneE164}`}>
                ☎ Call Now
              </a>
            </div>
            <ul className="hero-stats" aria-label="Highlights">
              <li><strong>{BARBER.experienceYears} yrs</strong><span>{t.stat1}</span></li>
              <li><strong>7 AM–8:30 PM</strong><span>{t.stat2}</span></li>
              <li><strong>{inr(50)}</strong><span>{t.stat3}</span></li>
              <li><strong>Daily</strong><span>{t.stat4}</span></li>
            </ul>
          </div>

          <figure className="hero-photo reveal">
            <img
              src="/images/shop-front.jpg"
              alt="Men's Saloon shop front in Sudama Nagar, Nawada — barber chair, LED mirror and premium grooming shelf"
              width={1392}
              height={1824}
              fetchPriority="high"
            />
            <figcaption className="hero-chip">
              <strong className={openNow ? 'open-now' : 'closed-now'}>{openNow ? t.openNow : t.closedNow}</strong>
              <span>{BUSINESS.tagline}</span>
              <span>{BUSINESS.addressLine} · {BUSINESS.phoneDisplay}</span>
            </figcaption>
          </figure>
        </section>


        {/* ===== luxury ticker ===== */}
        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            {[0, 1].map((n) => (
              <span key={n} className="ticker-run">
                {['Haircut ₹50', 'Haircut + Shaving ₹100', 'Skin Fade ₹100', 'Open Daily 7 AM – 8:30 PM', 'WhatsApp Booking — No Waiting', 'Facial ₹499 Onwards', 'Nitish Jatav · 10 Years'].map((x) => (
                  <span key={x} className="ticker-item">{x}<i>✂</i></span>
                ))}
              </span>
            ))}
          </div>
        </div>

        {/* ===== Kage experience (exact ThreeUI component) ===== */}
        <section className="kage-section" id="experience" aria-label="Immersive experience">
          <div className="kage-head reveal">
            <div>
              <p className="chapter">The Experience — Scroll Inside</p>
              <h2>Stillness before the sharpness.</h2>
              <p>
                Our website opens with the complete <strong>Kage</strong> interactive experience by
                ThreeUI — the exact authored page, its Three.js world, scroll scenes and typography,
                preserved byte-for-byte. Scroll inside the frame, then continue below for services,
                prices and booking.
              </p>
            </div>
            <a className="btn btn-ghost" href="/landing-pages/kage.html" target="_blank" rel="noreferrer">
              Open Full Screen ↗
            </a>
          </div>
          <Scene />
          <p className="kage-hint">Tip: scroll <strong>inside</strong> the frame to walk the Kage chapters — the salon menu continues below.</p>
        </section>

        {/* ===== Chapter 01 — services ===== */}
        <section className="section" id="services">
          <header className="section-head reveal">
            <p className="chapter">{t.servicesChapter}</p>
            <h2>{t.servicesH2}</h2>
            <p>
              Starting prices for standard hair — your final price is always confirmed before we
              begin — <strong>haircut sirf {inr(50)}, haircut + shaving {inr(100)}</strong>. Facial & colour are bajar-rate “onwards” by product.
            </p>
          </header>

          <div className="service-grid">
            {SERVICES.map((s, i) => (
              <article className="service-card reveal" key={s.id} style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
                {s.tag && <span className="tag">{s.tag}</span>}
                <h3>{s.name}</h3>
                <p>{lang === 'hi' ? (SERVICE_DESC_HI[s.id] ?? s.desc) : s.desc}</p>
                <div className="service-meta">
                  <span className="price">{inr(s.price)}{s.priceNote ? <small> {s.priceNote}</small> : null}</span>
                  <span className="duration">◷ {s.duration}</span>
                </div>
                <button className="btn btn-card" onClick={() => chooseService(s.id)}>
                  Book This →
                </button>
              </article>
            ))}
          </div>
        </section>

        {/* ===== Chapter 02 — combos ===== */}
        <section className="section alt" id="combos">
          <header className="section-head reveal">
            <p className="chapter">{t.combosChapter}</p>
            <h2>{t.combosH2}</h2>
          </header>
          <div className="combo-grid">
            {COMBOS.map((c) => (
              <article className={`combo-card reveal ${'featured' in c && c.featured ? 'featured' : ''}`} key={c.name}>
                {'featured' in c && c.featured && <span className="tag">Signature Ritual</span>}
                <h3>{c.name}</h3>
                <p className="combo-note">{c.note}</p>
                <p className="combo-price">{inr(c.price)} <span>· {c.duration}</span></p>
                <ul>{c.items.map((it) => <li key={it}>{it}</li>)}</ul>
                <button className="btn btn-red" onClick={() => chooseCombo(c.name, c.price)}>
                  {t.bookWhats}
                </button>
              </article>
            ))}
          </div>
        </section>

        {/* ===== Chapter 03 — barber ===== */}
        <section className="section barber" id="barber">
          <figure className="barber-photo reveal">
            <img
              src={BARBER.photo}
              alt={`${BARBER.name}, master barber at Men's Saloon Nawada, seated on a Royal Enfield motorcycle wearing a leather jacket and sunglasses`}
              width={1085}
              height={1450}
              loading="lazy"
            />
            <figcaption>
              <strong>{BARBER.name}</strong>
              <span>{BARBER.role}</span>
            </figcaption>
          </figure>
          <div className="barber-copy reveal">
            <p className="chapter">{t.barberChapter}</p>
            <h2>{BARBER.name}</h2>
            <ul className="barber-facts">
              <li><strong>{BARBER.experienceYears} years</strong><span>{t.exp}</span></li>
              <li><strong>Age {BARBER.age}</strong><span>{t.young}</span></li>
              <li><strong>1-to-1</strong><span>{t.personal}</span></li>
            </ul>
            <p>{BARBER.bio}</p>
            <div className="chips" aria-label="Specialities">
              {BARBER.specialities.map((sp) => <span className="chip" key={sp}>{sp}</span>)}
            </div>
            <div className="hero-ctas">
              <button className="btn btn-red" onClick={() => scrollToId('book')}>Book With Nitish</button>
              <a
                className="btn btn-ghost"
                href={quickBook(`Hello ${BARBER.name}! I saw your profile on the Men's Saloon website and want to book a chair with you.`)}
                target="_blank"
                rel="noreferrer"
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </section>


        {/* ===== The Ritual (copied concept: "A little time for yourself") ===== */}
        <section className="section ritual">
          <header className="section-head reveal">
            <p className="chapter">{t.ritualChapter}</p>
            <h2>{t.ritualH2}</h2>
            <p>{lang === 'hi'
              ? 'ये सिर्फ़ बाल काटना नहीं है — ये दिन भर की भागदौड़ के बीच अपने लिए निकाला हुआ सुकून भरा आधा घंटा है।'
              : 'This is not just a haircut — it is a calm half-hour you take for yourself in the middle of a rushing day.'}</p>
          </header>
          <div className="ritual-grid">
            {[
              { n: '01', en: ['The Conversation', 'Sit down, show a photo or just describe it — Nitish settles the style with you before the first cut.'], hi: ['बातचीत', 'बैठो, फ़ोटो दिखाओ या बस बता दो — पहली कैंची से पहले नितीश आपके साथ स्टाइल तय करता है।'] },
              { n: '02', en: ['The Chair Time', 'A clean chair, fresh towel, sanitised tools — and unhurried, precise work at your pace.'], hi: ['कुर्सी का समय', 'साफ़ कुर्सी, ताज़ा तौलिया, सैनिटाइज़ औज़ार — और आपकी रफ़्तार से बिना जल्दी का सटीक काम।'] },
              { n: '03', en: ['The Finish', 'Wash, set, final mirror check from every angle — you leave sharper than you arrived.'], hi: ['फ़िनिश', 'वॉश, सेटिंग, हर एंगल से आख़िरी आईना-चेक — आप आए थे उससे ज़्यादा शार्प होकर जाओगे।'] },
            ].map((r) => (
              <article className="ritual-card reveal" key={r.n}>
                <span className="style-no">{r.n}</span>
                <h3>{lang === 'hi' ? r.hi[0] : r.en[0]}</h3>
                <p>{lang === 'hi' ? r.hi[1] : r.en[1]}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ===== Style Finder — curiosity quiz ===== */}
        <section className="section alt" id="style-finder">
          <header className="section-head reveal">
            <p className="chapter">{t.finderChapter}</p>
            <h2>{t.finderH2}</h2>
            <p>{t.finderSub}</p>
          </header>
          <div className="finder reveal">
            {([
              { key: 'vibe', en: '1 · Your vibe today?', hi: '1 · आज का मूड?', opts: [['fresh', '🌿 Fresh & Daily', '🌿 फ्रेश रोज़ वाला'], ['office', '👔 Office / Neat', '👔 ऑफ़िस / नीट'], ['bold', '🔥 Bold Look', '🔥 बोल्ड लुक'], ['party', '✨ Shaadi / Party', '✨ शादी / पार्टी']] },
              { key: 'hair', en: '2 · Your hair type?', hi: '2 · आपके बाल कैसे हैं?', opts: [['straight', 'Straight', 'सीधे'], ['curly', 'Curly / Wavy', 'घुंघराले / लहरदार'], ['thick', 'Thick & Heavy', 'घने और भारी'], ['thin', 'Thin', 'पतले']] },
              { key: 'beard', en: '3 · Beard plan?', hi: '3 · दाढ़ी का प्लान?', opts: [['clean', 'Clean Shave', 'क्लीन शेव'], ['trim', 'Light Trim', 'हल्की ट्रिम'], ['full', 'Full Beard Style', 'पूरी दाढ़ी स्टाइल']] },
            ] as const).map((q) => (
              <div className="finder-q" key={q.key}>
                <h3>{lang === 'hi' ? q.hi : q.en}</h3>
                <div className="finder-opts">
                  {q.opts.map(([val, en, hi]) => (
                    <button key={val} type="button"
                      className={finder[q.key] === val ? 'opt active' : 'opt'}
                      aria-pressed={finder[q.key] === val}
                      onClick={() => setFinder((f) => ({ ...f, [q.key]: val }))}>
                      {lang === 'hi' ? hi : en}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {finderResult ? (
              <div className="finder-result" role="status">
                <span>{lang === 'hi' ? 'आपके लिए बना लुक' : 'Your look, found'}</span>
                <strong>{finderResult.style}</strong>
                <p>{lang === 'hi' ? finderResult.hi : finderResult.en}</p>
                <p className="finder-price">
                  {(SERVICES.find((x) => x.id === finderResult.serviceId)?.name)} · {inr(SERVICES.find((x) => x.id === finderResult.serviceId)?.price ?? 50)}
                  {SERVICES.find((x) => x.id === finderResult.serviceId)?.priceNote ? ' onwards' : ''}
                </p>
                <div className="hero-ctas">
                  <button className="btn btn-red" onClick={() => chooseService(finderResult.serviceId)}>
                    {lang === 'hi' ? 'यही लुक बुक करो' : 'Book This Look'}
                  </button>
                  <a className="btn btn-wa" target="_blank" rel="noreferrer"
                    href={quickBook(`Hello Men's Saloon! Style Finder ne mere liye *${finderResult.style}* suggest kiya hai. Mujhe yehi look chahiye — kab aaun?`)}>
                    WhatsApp
                  </a>
                </div>
              </div>
            ) : (
              <p className="finder-hint">{lang === 'hi' ? '👆 तीनों जवाब चुनो — आपका लुक यहीं दिखेगा…' : '👆 Pick all three — your look appears here…'}</p>
            )}
          </div>
        </section>

        {/* ===== style menu ===== */}
        <section className="section alt" id="styles">
          <header className="section-head reveal">
            <p className="chapter">{t.stylesChapter}</p>
            <h2>{t.stylesH2}</h2>
            <p>Tap a style to ask for it on WhatsApp — or bring any photo and we will match it to your face shape and hair type.</p>
          </header>
          <div className="style-grid">
            {STYLE_MENU.map((st, i) => (
              <a
                className="style-card reveal"
                key={st.name}
                href={quickBook(`Hello Men's Saloon! I want the *${st.name}* look (${st.hint}). When can I come?`)}
                target="_blank"
                rel="noreferrer"
                style={{ transitionDelay: `${(i % 4) * 60}ms` }}
              >
                <span className="style-no">{String(i + 1).padStart(2, '0')}</span>
                <strong>{st.name}</strong>
                <small>{lang === 'hi' ? (STYLE_HINT_HI[st.name] ?? st.hint) : st.hint}</small>
                <span className="style-cta">{t.askStyle}</span>
              </a>
            ))}
          </div>

          <div className="why reveal">
            <h3>{t.whyH3} {BUSINESS.name}</h3>
            <ul>
              <li><strong>Clean & hygienic chair</strong><span>Fresh towels and sanitised tools for every customer.</span></li>
              <li><strong>Premium products</strong><span>Quality creams, oils and styling products on our shelf — see them in-store.</span></li>
              <li><strong>WhatsApp booking = no waiting</strong><span>Book your time between 7 AM–8:30 PM and sit straight in the chair.</span></li>
              <li><strong>Honest local pricing</strong><span>Premium finish at Nawada-friendly rates, confirmed upfront.</span></li>
            </ul>
          </div>
        </section>

        {/* ===== Chapter 04 — booking ===== */}
        <section className="section booking" id="book">
          <div className="booking-copy reveal">
            <p className="chapter">{t.bookChapter}</p>
            <h2>{t.bookH2}</h2>
            <ol className="steps">
              <li><strong>{t.step1}</strong><span>{t.step1d}</span></li>
              <li><strong>{t.step2}</strong><span>{t.step2d}</span></li>
              <li><strong>{t.step3}</strong><span>{BARBER.name} {t.step3d}</span></li>
            </ol>
            <p className="booking-alt">
              Prefer to talk? <a href={`tel:${BUSINESS.phoneE164}`}>Call {BUSINESS.phoneDisplay}</a> — walk-ins
              are welcome too.
            </p>
            <div className="booking-summary" aria-live="polite">
              <span>{t.youBooking}</span>
              <strong>{selectedService.name}</strong>
              <span>{inr(selectedService.price)}{selectedService.priceNote ? ' ' + selectedService.priceNote : ''} · {selectedService.duration} · with {BARBER.name}</span>
            </div>
          </div>

          <form className="booking-form reveal" ref={formRef} onSubmit={submitBooking} noValidate>
            <h3>{t.formH3}</h3>

            <label>
              Your name *
              <input
                type="text"
                autoComplete="name"
                placeholder="e.g. Rahul Kumar"
                value={booking.name}
                aria-invalid={!!errors.name}
                onChange={(e) => setBooking({ ...booking, name: e.target.value })}
              />
              {errors.name && <small className="error">{errors.name}</small>}
            </label>

            <label>
              Mobile number (WhatsApp) *
              <input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="10-digit mobile number"
                value={booking.phone}
                aria-invalid={!!errors.phone}
                onChange={(e) => setBooking({ ...booking, phone: e.target.value })}
              />
              {errors.phone && <small className="error">{errors.phone}</small>}
            </label>

            <label>
              Service *
              <select
                value={booking.serviceId}
                onChange={(e) => setBooking({ ...booking, serviceId: e.target.value })}
              >
                {SERVICES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {inr(s.price)}{s.priceNote ? ' ' + s.priceNote : ''} ({s.duration})
                  </option>
                ))}
              </select>
            </label>

            <div className="form-row">
              <label>
                Date *
                <input
                  type="date"
                  min={todayISO()}
                  value={booking.date}
                  aria-invalid={!!errors.date}
                  onChange={(e) => setBooking({ ...booking, date: e.target.value })}
                />
                {errors.date && <small className="error">{errors.date}</small>}
              </label>
              <label>
                Preferred time (7 AM – 8:30 PM) *
                <select
                  value={booking.time}
                  aria-invalid={!!errors.time}
                  onChange={(e) => setBooking({ ...booking, time: e.target.value })}
                >
                  {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.time && <small className="error">{errors.time}</small>}
              </label>
            </div>

            <label>
              Anything we should know? <span className="optional">(optional)</span>
              <textarea
                rows={3}
                placeholder="e.g. Skin fade like the photo I will send, sensitive skin…"
                value={booking.notes}
                onChange={(e) => setBooking({ ...booking, notes: e.target.value })}
              />
            </label>

            <button className="btn btn-wa btn-lg btn-block" type="submit">
              Confirm on WhatsApp →
            </button>
            <p className="form-note">
{t.fNote}
            </p>
            {sent && (
              <p className="success" role="status">
                ✓ WhatsApp opened with your booking — press <strong>Send</strong> there and we will
                confirm your chair. Didn’t open?{' '}
                <a href={quickBook("Hello Men's Saloon! I want to book an appointment.")} target="_blank" rel="noreferrer">
                  Tap here to retry
                </a>
                .
              </p>
            )}
            {sent && dbState === 'saved' && <p className="form-note">{ht.dbSaved}</p>}
            {sent && dbState === 'failed' && <p className="form-note">{ht.dbFailed}</p>}
          </form>
        </section>


        {/* ===== Booking History + Shop Panel (cloud database) ===== */}
        <section className="section history" id="history">
          <header className="section-head reveal">
            <p className="chapter">{ht.chapter}</p>
            <h2>{ht.h2}</h2>
            <p>{ht.sub}</p>
          </header>

          <div className="hist-grid">
            {/* --- customer: apni history --- */}
            <div className="hist-card reveal">
              <h3>{ht.custTitle}</h3>
              <p className="hist-sub">{ht.custSub}</p>
              <form className="hist-form" onSubmit={lookupHistory}>
                <label>
                  {ht.phoneLabel}
                  <input
                    className="db-input"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={ht.phonePh}
                    value={histPhone}
                    onChange={(e) => setHistPhone(e.target.value)}
                  />
                </label>
                <button className="btn btn-red btn-block" type="submit" disabled={histBusy}>
                  {histBusy ? ht.searching : ht.showBtn}
                </button>
              </form>
              {histMsg && <p className="hist-msg" role="status">{histMsg}</p>}
              {histRows && histRows.length > 0 && (
                <ul className="hist-list">
                  {histRows.map((r) => (
                    <li className="hist-row" key={r.id}>
                      <div>
                        <strong>{r.service}</strong>
                        <span>{fmtDate(r.appt_date)} · {r.appt_time ?? '—'}{r.price ? ` · ${inr(r.price)}` : ''}</span>
                        {r.notes && <small>{r.notes}</small>}
                      </div>
                      <span className={`st st-${r.status}`}>{statusLabel(r.status)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* --- owner: shop panel --- */}
            <div className="hist-card admin reveal">
              <h3>{ht.adminTitle}</h3>
              <p className="hist-sub">{ht.adminSub}</p>
              {adminRows === null ? (
                <form
                  className="hist-form"
                  onSubmit={(ev) => { ev.preventDefault(); if (pinInput) void loadAdmin(pinInput) }}
                >
                  <label>
                    {ht.pinLabel}
                    <input
                      className="db-input"
                      type="password"
                      inputMode="numeric"
                      placeholder={ht.pinPh}
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                    />
                  </label>
                  <button className="btn btn-ghost btn-block" type="submit" disabled={adminBusy}>
                    {adminBusy ? ht.opening : ht.openBtn}
                  </button>
                </form>
              ) : (
                <>
                  <div className="admin-stats">
                    <div><strong>{adminRows.length}</strong><span>{ht.totalL}</span></div>
                    <div><strong>{adminRows.filter((r) => r.appt_date === todayIST()).length}</strong><span>{ht.todayL}</span></div>
                    <div><strong>{adminRows.filter((r) => r.status === 'pending').length}</strong><span>{ht.pendingL}</span></div>
                  </div>
                  <div className="admin-actions">
                    <button className="btn btn-ghost" onClick={() => void loadAdmin(adminPin)} disabled={adminBusy}>
                      {adminBusy ? '…' : ht.refresh}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        setAdminPin(''); setAdminRows(null); setPinInput('')
                        try { sessionStorage.removeItem('mens-saloon-admin-pin') } catch { /* ignore */ }
                      }}
                    >
                      {ht.logout}
                    </button>
                  </div>
                  {adminRows.length === 0 ? (
                    <p className="hist-msg">{ht.allEmpty}</p>
                  ) : (
                    <ul className="hist-list">
                      {adminRows.map((r) => {
                        const last10 = r.phone.replace(/\D/g, '').slice(-10)
                        return (
                          <li className="hist-row admin-row" key={r.id}>
                            <div>
                              <strong>{r.name}</strong>
                              <span>{r.service}{r.price ? ` · ${inr(r.price)}` : ''}</span>
                              <span>{fmtDate(r.appt_date)} · {r.appt_time ?? '—'}</span>
                              {r.notes && <small>“{r.notes}”</small>}
                              <span className="admin-contact">
                                <a href={`tel:+91${last10}`}>☎ {ht.callL}</a>
                                <a href={`https://wa.me/91${last10}`} target="_blank" rel="noreferrer">WhatsApp</a>
                                <span>{r.phone}</span>
                              </span>
                            </div>
                            <div className="admin-status">
                              <span className={`st st-${r.status}`}>{statusLabel(r.status)}</span>
                              <div className="admin-btns">
                                {r.status !== 'confirmed' && <button onClick={() => void changeStatus(r.id, 'confirmed')}>{ht.actConfirm}</button>}
                                {r.status !== 'done' && <button onClick={() => void changeStatus(r.id, 'done')}>{ht.actDone}</button>}
                                {r.status !== 'cancelled' && <button onClick={() => void changeStatus(r.id, 'cancelled')}>{ht.actCancel}</button>}
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <form className="hist-form pin-change" onSubmit={submitPinChange}>
                    <label>
                      {ht.newPinLabel}
                      <input
                        className="db-input"
                        type="password"
                        inputMode="numeric"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                      />
                    </label>
                    <button className="btn btn-ghost btn-block" type="submit">{ht.changePinBtn}</button>
                  </form>
                </>
              )}
              {adminMsg && <p className="hist-msg" role="status">{adminMsg}</p>}
              <p className="form-note">{ht.panelNote}</p>
            </div>
          </div>
        </section>

        {/* ===== FAQ ===== */}
        <section className="section alt" id="faq">
          <header className="section-head reveal">
            <p className="chapter">{t.faqChapter}</p>
            <h2>{t.faqH2}</h2>
          </header>
          <div className="faq-list reveal">
            {(lang === 'hi' ? FAQ_HI : FAQS).map((f, i) => (
              <div className={`faq-item ${openFaq === i ? 'open' : ''}`} key={f.q}>
                <button
                  aria-expanded={openFaq === i}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{f.q}</span>
                  <span aria-hidden="true">{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && <p>{f.a}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* ===== visit ===== */}
        <section className="section visit" id="visit">
          <div className="reveal">
            <p className="chapter">{t.visitChapter}</p>
            <h2>{BUSINESS.area}, {BUSINESS.city}</h2>
            <ul className="visit-list">
              <li><span>{t.vAddress}</span><strong>{BUSINESS.addressLine}</strong></li>
              <li><span>{t.vPhone}</span><a href={`tel:${BUSINESS.phoneE164}`}><strong>{BUSINESS.phoneDisplay}</strong></a></li>
              <li><span>{t.vHours}</span><strong>{BUSINESS.hoursLabel}</strong><strong className={openNow ? 'open-now' : 'closed-now'}>{openNow ? t.vOpen : t.vClosed}</strong><small>{BUSINESS.hoursNote}</small></li>
              <li><span>{t.vBarber}</span><strong>{BARBER.name} · {BARBER.experienceYears} yrs experience</strong></li>
            </ul>
            <div className="qr-card">
              <img src="/images/qr-website.png" alt="QR code to open the Men's Saloon Nawada website" width={132} height={132} loading="lazy" />
              <div>
                <strong>Scan karke booking karo</strong>
                <span>Camera se scan karo — website khulegi, price dekho aur WhatsApp par chair book karo. Doston ko share karne ke liye bhi yahi QR hai.</span>
                <a href={BUSINESS.siteUrl} target="_blank" rel="noreferrer">menssaloon-nawada.vercel.app</a>
              </div>
            </div>
            <div className="hero-ctas">
              <a className="btn btn-red" href={BUSINESS.mapsUrl} target="_blank" rel="noreferrer">Get Directions ↗</a>
              <a className="btn btn-ghost" href={`tel:${BUSINESS.phoneE164}`}>☎ Call the Saloon</a>
              <a
                className="btn btn-wa"
                href={quickBook("Hello Men's Saloon! I am coming today — is a chair free?")}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp Us
              </a>
            </div>
          </div>
          <figure className="visit-photo reveal">
            <img src="/images/shop-front.jpg" alt="Inside Men's Saloon Nawada — premium barber chairs and LED mirror" loading="lazy" width={1392} height={1824} />
            <figcaption>Look for the maroon & gold “MEN’S SALOON” board in {BUSINESS.area}.</figcaption>
          </figure>
        </section>


        {/* ===== reviews (copied: "A good name is built one visit at a time") ===== */}
        <section className="section reviews" id="reviews">
          <div className="reviews-card reveal">
            <p className="chapter">{t.reviewChapter}</p>
            <div className="stars" aria-hidden="true">★★★★★</div>
            <h2>{t.reviewH2}</h2>
            <p>{t.reviewSub}</p>
            <div className="hero-ctas center">
              <a className="btn btn-red" target="_blank" rel="noreferrer"
                href="https://www.google.com/search?q=Men%27s+Saloon+Sudama+Nagar+Nawada+reviews">{t.reviewGoogle}</a>
              <a className="btn btn-ghost" target="_blank" rel="noreferrer"
                href={quickBook("Hello Men's Saloon! Mera feedback: ")}>{t.reviewWhats}</a>
            </div>
            <small>✦ {t.reviewNote}</small>
          </div>

          {/* ===== install app (PWA, copied from the earlier salon site) ===== */}
          <div className="install-card reveal" id="app">
            <img src="/icons/icon-192.png" alt="Men's Saloon app icon" width={72} height={72} loading="lazy" />
            <div>
              <p className="chapter">{t.installChapter}</p>
              <h3>{t.installH2}</h3>
              <p>{t.installSub}</p>
              <button className="btn btn-red" onClick={async () => {
                if (installPrompt) { await installPrompt.prompt(); setInstallPrompt(null) }
                else setShowInstallHelp((v) => !v)
              }}>{t.installBtn}</button>
              {showInstallHelp && (
                <div className="install-help">
                  <p><strong>Android:</strong> {lang === 'hi' ? 'Browser menu ⋮ खोलो और "Install app" / "Add to Home screen" चुनो।' : 'Open the browser menu ⋮ and choose “Install app” or “Add to Home screen.”'}</p>
                  <p><strong>iPhone / iPad:</strong> {lang === 'hi' ? 'Safari में Share दबाओ, फिर "Add to Home Screen"।' : 'In Safari, tap Share, then “Add to Home Screen.”'}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ===== final CTA ===== */}
        <section className="final-cta reveal">
          <p className="chapter">{t.finalChapter}</p>
          <h2>{lang === 'hi' ? <>आ जाओ।<br />हम आपकी <em>कुर्सी</em> बचा रखेंगे।</> : <>Come on in.<br />We’ll save you a <em>chair</em>.</>}</h2>
          <p className="final-sub">{lang === 'hi' ? 'आम आओ — अविस्मरणीय बनकर जाओ।' : 'Walk in ordinary. Walk out unforgettable.'}</p>
          <div className="hero-ctas center">
            <button className="btn btn-red btn-lg" onClick={() => scrollToId('book')}>{lang === 'hi' ? 'मेरी कुर्सी बुक करो' : 'Book My Chair'}</button>
            <a className="btn btn-ghost btn-lg" href={`tel:${BUSINESS.phoneE164}`}>☎ {BUSINESS.phoneDisplay}</a>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-brand">
          <strong>MEN’S SALOON</strong>
          <span>{BUSINESS.tagline}</span>
          <span>{BUSINESS.addressLine} · {BUSINESS.phoneDisplay}</span>
        </div>
        <nav aria-label="Footer">
          <a href="#services" onClick={(e) => { e.preventDefault(); scrollToId('services') }}>Services & Prices</a>
          <a href="#book" onClick={(e) => { e.preventDefault(); scrollToId('book') }}>Book Appointment</a>
          <a href="#visit" onClick={(e) => { e.preventDefault(); scrollToId('visit') }}>Visit Us</a>
          <a href="/landing-pages/kage.html" target="_blank" rel="noreferrer">Kage Experience ↗</a>
        </nav>
        <p className="footer-note">
          © {new Date().getFullYear()} {BUSINESS.name}, {BUSINESS.city}. Crafted with the Kage
          experience by ThreeUI (MIT). Prices are starting prices — confirmed before your service begins.
        </p>
      </footer>

      {/* floating WhatsApp + mobile action bar */}
      <a
        className="wa-float"
        href={quickBook("Hello Men's Saloon! I want to book an appointment.")}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
      >
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M16 3C9.4 3 4 8.3 4 14.9c0 2.6.8 5.1 2.4 7.1L4.6 29l7.2-1.8c1.3.7 2.7 1 4.2 1 6.6 0 12-5.3 12-11.9S22.6 3 16 3zm5.9 16.9c-.2.7-1.4 1.3-1.9 1.3-.5.1-1.1.2-3.7-.8-3.1-1.2-5.1-4.4-5.3-4.6-.1-.2-1.2-1.7-1.2-3.2 0-1.5.8-2.2 1-2.5.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .7.5l.9 2.2c.1.2.1.4 0 .6l-.4.6-.4.5c-.1.1-.3.3-.1.6.1.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.2l1-1.2c.2-.3.4-.2.7-.1l2.1 1c.3.2.5.3.6.4 0 .1 0 .7-.2 1.4z"/></svg>
      </a>

      <div className="mobile-bar" aria-label="Quick actions">
        <a href={`tel:${BUSINESS.phoneE164}`}>☎<span>{t.call}</span></a>
        <a
          href={quickBook("Hello Men's Saloon! I want to book an appointment.")}
          target="_blank"
          rel="noreferrer"
        >
          ◉<span>WhatsApp</span>
        </a>
        <button onClick={() => scrollToId('book')}>✂<span>{t.bookChair}</span></button>
      </div>
    </div>
  )
}
