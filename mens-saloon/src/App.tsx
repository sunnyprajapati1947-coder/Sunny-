import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import './App.css'
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
  type Service,
} from './config'
import {
  saveBookingSafe,
  flushPendingBookings,
  fetchMyBookings,
  fetchAdminBookings,
  setBookingStatus,
  changeAdminPin,
  fetchSiteServices,
  fetchSiteSettings,
  adminSaveServices,
  adminSaveSettings,
  fetchSlotRush,
  fetchAdminCustomers,
  type DbCustomer,
  type DbBooking,
  type BookingStatus,
  type DbService,
  type SiteSettings,
} from './db'
import { getSeason } from './season'

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

const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const istNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
const tomorrowIST = () => { const d = istNow(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA') }
const slotToMins = (slot: string) => {
  const m = slot.match(/^(\d+):(\d+)\s*(AM|PM)$/i)
  if (!m) return 0
  let h = Number(m[1]) % 12
  if (m[3].toUpperCase() === 'PM') h += 12
  return h * 60 + Number(m[2])
}
const nowMinsIST = () => { const d = istNow(); return d.getHours() * 60 + d.getMinutes() }
/** Ek time slot me zyada-se-zyada itni website bookings — phir FULL. */
const SLOT_CAP = 1
/** Aaj ka agla khali time (beeta hua time kabhi default select nahi hoga). */
const nextSlot = () => TIME_SLOTS.find((sl) => slotToMins(sl) > nowMinsIST()) ?? null

type Booking = {
  name: string
  phone: string
  serviceId: string
  date: string
  time: string
  notes: string
}

/** Service jo screen par dikhegi — database se live, warna config.ts default. */
type LiveService = Service & { descHi?: string }


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
    heroBook: 'Book My Chair — ₹50 Haircut', heroWhats: 'WhatsApp Us', heroCall: '☎ Call Now',
    stat1: 'Master barber craft', stat2: 'Open daily', stat3: 'Haircut · bajar price', stat4: 'Open · walk-ins welcome',
    openNow: '● Open Now', closedNow: '● Closed — Opens 7:00 AM',
    servicesChapter: 'Chapter 01 — Services & Prices',
    servicesH2: 'Everything a gentleman needs, honestly priced.',
    bookThis: 'Book This →',
    combosChapter: 'Chapter 02 — Grooming Rituals', combosH2: 'Combos that save time — and money.',
    barberChapter: 'Chapter 03 — Meet Your Barber',
    exp: 'Experience', young: 'Young master barber', personal: 'Personal attention, every chair',
    bookWith: 'Book With Nitish', chatWhats: 'Chat on WhatsApp',
    stylesChapter: 'Style Menu — Pick Your Look', stylesH2: 'Not sure what suits you? Start here.',
    askStyle: 'Ask for this style →',
    whyH3: 'Why men choose',
    bookChapter: 'Chapter 04 — Book Your Chair', bookH2: 'Three steps. Zero waiting.',
    step1: 'Fill the form', step1d: 'Name, service, date and your preferred time (7 AM – 8:30 PM).',
    step2: 'Send on WhatsApp', step2d: 'We open WhatsApp with everything pre-filled — just press send.',
    step3: 'We confirm', step3d: 'replies on WhatsApp to lock your exact time.',
    youBooking: 'You are booking', withWord: 'with',
    formH3: 'Book an Appointment', fName: 'Your name *', fPhone: 'Mobile number (WhatsApp) *', fService: 'Service *',
    fDate: 'Date *', fTime: 'Preferred time (7 AM – 8:30 PM) *', fNotes: 'Anything we should know?',
    fSubmit: 'Confirm on WhatsApp →',
    fNote: 'No advance payment. Pay at the saloon after your service. Your booking is saved in our secure cloud record (see it anytime in “My Bookings” below) and opened in WhatsApp for confirmation.',
    faqChapter: 'Good Questions', faqH2: 'Before you visit',
    visitChapter: 'Chapter 05 — Visit Us',
    vAddress: 'Address', vPhone: 'Phone / WhatsApp', vHours: 'Hours', vBarber: 'Barber',
    vOpen: '● Open Now — walk in!', vClosed: '● Closed now — opens 7:00 AM, book for tomorrow',
    directions: 'Get Directions ↗', callSaloon: '☎ Call the Saloon',
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
    bookAgain: '↩ Book Again',
    closedTodayTxt: '● Closed Today',
    confirmMsgL: '✉ Send Confirm',
    copyToday: "📋 Copy Today's List",
    copied: '✓ List copied! WhatsApp par paste karke bhej do.',
    svcEditTitle: '✏️ Prices & Services — Live Edit',
    svcEditSub: 'Yahan jo badloge wahi website aur installed app par turant live dikhega. OFF wali service site par nahi dikhegi.',
    svcOn: 'ON',
    svcAdd: '＋ Add Service',
    svcSave: '💾 Save & Live Karo',
    svcSaved: '✓ Price-list live ho gayi!',
    svcNamePh: 'Service name', svcPricePh: '₹ Price', svcDurPh: '~30 min',
    setTitle: '📢 Shop Notice & Settings',
    annLabel: 'Top notice line (khali chhodo = purani line)',
    annPh: 'e.g. Aaj shaam 6 baje ke baad hi booking milegi',
    closedLabel: 'Aaj dukaan BAND hai (site par band dikhega)',
    closedMsgLabel: 'Band ka message',
    closedMsgPh: 'e.g. ● Aaj Chhath ki chhutti — kal subah 7 baje khulega',
    seasonLabel: 'Season theme auto (Diwali / Holi / Shaadi rang apne-aap)',
    setSave: '💾 Settings Save Karo',
    setSaved: '✓ Settings live ho gayi!',
    smartChapter: 'Smart Chair — Live & Advanced',
    smartH2: 'Khali time dekho, apna combo banao.',
    smartSub: 'Live bheed-meter se best time chuno, services tick karke apna combo banao — naam aur number do, kursi pakki. No waiting drama.',
    rushTitle: '🕒 Live Bheed-Meter',
    todayB: 'Aaj', tomorrowB: 'Kal',
    free: '🟢 Khali', oneBooked: '🟡 1 booking', busy: '🔴 Bheed hai', past: 'Time gaya',
    rushNote: '🟢 Khali = kursi free hai · 🔴 Bhara hua = us time par booking ho chuki. Final confirmation WhatsApp par milega.',
    builderTitle: '🧮 Mera Combo Banao',
    builderSub: 'Jo service chahiye tick karo — total apne-aap jud jayega.',
    totalL2: 'Total',
    bName: 'Your name *', bPhone: 'Mobile number (WhatsApp) *',
    phoneHelp: '📞 Shop isi number par call/WhatsApp karke booking confirm karegi — sahi number daalna.',
    bBook: 'Book on WhatsApp →',
    bNeed: 'Pehle kam se kam ek service ya combo chuno.',
    bInvalid: 'Naam aur sahi 10-digit mobile number daalo — shop aapko isi number par confirm karegi.',
    bSaved: '✓ WhatsApp khula hai — wahan Send dabao. Booking shop ke record me bhi save ho gayi hai.',
    comboBook: 'Book This Combo →',
    full: '🔴 Bhara hua',
    bookingWord: 'booking hai',
    slotBhara: '⛔ Ye time bhara hua hai — upar wale meter se koi khali time chuno.',
    liveTxt: 'Live — auto update',
    dbQueued: '✓ Booking mil gayi! Net slow hai — record phone me safe hai, net aate hi shop ke cloud me sync ho jayega.',
    pickHint: '👆 Upar list se service tick karo',
    kamaiL: "Today's kamai (done)",
    custRecord: '👥 Customers — Pura Online Record',
    visitsWord: 'baar aaye',
    lastVisit: 'Last visit',
    spentL: 'Total diya',
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
    bookAgain: '↩ फिर से बुक करो',
    closedTodayTxt: '● आज बंद है',
    confirmMsgL: '✉ कन्फ़र्म भेजो',
    copyToday: '📋 आज की लिस्ट कॉपी',
    copied: '✓ लिस्ट कॉपी हो गई! WhatsApp पर पेस्ट करके भेज दो।',
    svcEditTitle: '✏️ दाम व सर्विस — लाइव एडिट',
    svcEditSub: 'यहाँ जो बदलोगे वही वेबसाइट और ऐप पर तुरंत दिखेगा। OFF वाली सर्विस साइट पर नहीं दिखेगी।',
    svcOn: 'ON',
    svcAdd: '＋ नई सर्विस जोड़ो',
    svcSave: '💾 सेव करके लाइव करो',
    svcSaved: '✓ प्राइस-लिस्ट लाइव हो गई!',
    svcNamePh: 'सर्विस का नाम', svcPricePh: '₹ दाम', svcDurPh: '~30 min',
    setTitle: '📢 दुकान नोटिस व सेटिंग',
    annLabel: 'ऊपर वाली नोटिस लाइन (खाली = पुरानी लाइन)',
    annPh: 'जैसे: आज शाम 6 बजे के बाद ही बुकिंग मिलेगी',
    closedLabel: 'आज दुकान बंद है (साइट पर बंद दिखेगा)',
    closedMsgLabel: 'बंद का मैसेज',
    closedMsgPh: 'जैसे: ● आज छठ की छुट्टी — कल सुबह 7 बजे खुलेगा',
    seasonLabel: 'सीज़न थीम ऑटो (दिवाली/होली/शादी रंग अपने-आप)',
    setSave: '💾 सेटिंग सेव करो',
    setSaved: '✓ सेटिंग लाइव हो गई!',
    smartChapter: 'स्मार्ट कुर्सी — लाइव व एडवांस्ड',
    smartH2: 'खाली समय देखो, अपना कॉम्बो बनाओ।',
    smartSub: 'लाइव भीड़-मीटर से बेस्ट टाइम चुनो, सर्विस टिक करके अपना कॉम्बो बनाओ — नाम और नंबर दो, कुर्सी पक्की।',
    rushTitle: '🕒 लाइव भीड़-मीटर',
    todayB: 'Aaj', tomorrowB: 'Kal',
    free: '🟢 खाली', oneBooked: '🟡 1 बुकिंग', busy: '🔴 भीड़ है', past: 'समय गया',
    rushNote: '🟢 खाली = कुर्सी फ़्री है · 🔴 भरा हुआ = उस समय बुकिंग हो चुकी। फ़ाइनल कन्फ़र्मेशन WhatsApp पर मिलेगा।',
    builderTitle: '🧮 मेरा कॉम्बो बनाओ',
    builderSub: 'जो सर्विस चाहिए टिक करो — टोटल अपने-आप जुड़ जाएगा।',
    totalL2: 'कुल',
    bName: 'आपका नाम *', bPhone: 'मोबाइल नंबर (WhatsApp) *',
    phoneHelp: '📞 दुकान इसी नंबर पर कॉल/WhatsApp करके बुकिंग कन्फ़र्म करेगी — सही नंबर डालना।',
    bBook: 'WhatsApp पर बुक करो →',
    bNeed: 'पहले कम से कम एक सर्विस या कॉम्बो चुनो।',
    bInvalid: 'नाम और सही 10 अंकों का मोबाइल नंबर डालो — दुकान इसी नंबर पर कन्फ़र्म करेगी।',
    bSaved: '✓ WhatsApp खुल गया है — वहाँ Send दबाओ। बुकिंग दुकान के रिकॉर्ड में भी सेव हो गई है।',
    comboBook: 'यह कॉम्बो बुक करो →',
    full: '🔴 भरा हुआ',
    bookingWord: 'बुकिंग है',
    slotBhara: '⛔ यह समय भरा हुआ है — ऊपर मीटर से कोई खाली समय चुनो।',
    liveTxt: 'लाइव — ऑटो अपडेट',
    dbQueued: '✓ बुकिंग मिल गई! नेट धीमा है — रिकॉर्ड फ़ोन में सुरक्षित है, नेट आते ही दुकान के क्लाउड में सिंक हो जाएगा।',
    pickHint: '👆 ऊपर लिस्ट से सर्विस टिक करो',
    kamaiL: 'आज की कमाई (done)',
    custRecord: '👥 कस्टमर्स — पूरा ऑनलाइन रिकॉर्ड',
    visitsWord: 'बार आए',
    lastVisit: 'आख़िरी विज़िट',
    spentL: 'कुल दिया',
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
  /* ---- Live config (cloud DB): owner ke badlav turant website + app par ---- */
  const [dbServices, setDbServices] = useState<DbService[] | null>(null)
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({ announcement: '', closed_today: false, closed_message: '', season_auto: true })
  const season = useMemo(() => getSeason(), [])
  useEffect(() => {
    fetchSiteServices().then((rows) => { if (rows.length) setDbServices(rows) }).catch(() => { /* config.ts defaults chalenge */ })
    fetchSiteSettings().then((st) => { if (st) setSiteSettings(st) }).catch(() => { /* defaults */ })
  }, [])
  useEffect(() => {
    if (!siteSettings.season_auto) return
    const r = document.documentElement.style
    r.setProperty('--gold', season.vars.gold)
    r.setProperty('--gold-2', season.vars.gold2)
    r.setProperty('--season-accent', season.vars.accent)
  }, [season, siteSettings.season_auto])
  const services: LiveService[] = useMemo(() => {
    if (!dbServices) return SERVICES
    const active = dbServices.filter((r) => r.active)
    if (!active.length) return SERVICES
    return active.map((r) => {
      const base = SERVICES.find((x) => x.id === r.id)
      return {
        id: r.id,
        name: r.name,
        desc: r.desc_en || base?.desc || '',
        descHi: r.desc_hi || SERVICE_DESC_HI[r.id] || '',
        price: r.price,
        priceNote: r.price_note ?? undefined,
        duration: r.duration || base?.duration || '',
        tag: r.tag ?? undefined,
      }
    })
  }, [dbServices])

  const [openNow, setOpenNow] = useState(() => isOpenNow())
  useEffect(() => {
    const t = setInterval(() => setOpenNow(isOpenNow()), 60_000)
    return () => clearInterval(t)
  }, [])
  const shopOpen = openNow && !siteSettings.closed_today
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [booking, setBooking] = useState<Booking>({
    name: '',
    phone: '',
    serviceId: 'haircut-shaving',
    date: todayIST(),
    time: nextSlot() ?? '07:00 AM',
    notes: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof Booking, string>>>({})
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /* ---- Smart Chair: live bheed-meter + combo builder ---- */
  const [comboPreset, setComboPreset] = useState<{ name: string; price: number } | null>(null)
  const [builderSel, setBuilderSel] = useState<string[]>([])
  const [builderDate, setBuilderDate] = useState<string>(() => (nextSlot() ? todayIST() : tomorrowIST()))
  const [builderTime, setBuilderTime] = useState<string>(() => nextSlot() ?? '07:00 AM')
  const [rushDay, setRushDay] = useState<'today' | 'tomorrow'>(() => (nextSlot() ? 'today' : 'tomorrow'))
  const [rushByDate, setRushByDate] = useState<Record<string, Record<string, number>>>({})
  const [builderBusy, setBuilderBusy] = useState(false)
  const [builderMsg, setBuilderMsg] = useState('')
  const loadRush = useCallback((date: string) => {
    fetchSlotRush(date)
      .then((rows) => setRushByDate((m) => ({ ...m, [date]: Object.fromEntries(rows.map((r) => [r.appt_time, r.bookings])) })))
      .catch(() => { /* meter na mile to purana count chalega — booking kabhi nahi rukegi */ })
  }, [])
  const rush = rushByDate[builderDate] ?? {}
  const formRush = rushByDate[booking.date] ?? {}
  useEffect(() => { loadRush(builderDate) }, [builderDate, loadRush])
  useEffect(() => { loadRush(booking.date) }, [booking.date, loadRush])
  /* Bhara-slot safety: chuna hua time bhara ho jaye (ya page khulte hi default
     time bhara nikle) to selection khud agle khali time par chali jaye —
     bhare hue time par booking ho hi nahi payegi. */
  useEffect(() => {
    const counts = rushByDate[builderDate]
    if (!counts) return
    const isToday = builderDate === todayIST()
    const avail = (sl: string) => (counts[sl] ?? 0) < SLOT_CAP && !(isToday && slotToMins(sl) <= nowMinsIST())
    if (avail(builderTime)) return
    const free = TIME_SLOTS.find(avail)
    if (free) setBuilderTime(free)
  }, [rushByDate, builderDate, builderTime])
  useEffect(() => {
    const counts = rushByDate[booking.date]
    if (!counts) return
    const isToday = booking.date === todayIST()
    const avail = (sl: string) => (counts[sl] ?? 0) < SLOT_CAP && !(isToday && slotToMins(sl) <= nowMinsIST())
    if (avail(booking.time)) return
    const free = TIME_SLOTS.find(avail)
    if (free) setBooking((b) => ({ ...b, time: free }))
  }, [rushByDate, booking.date, booking.time])
  /* LIVE system: har 30 sec + tab focus + net wapas aane par meter fresh,
     aur pending offline bookings cloud me sync. */
  useEffect(() => {
    const tick = () => { loadRush(builderDate); loadRush(booking.date); void flushPendingBookings() }
    const id = window.setInterval(tick, 30_000)
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', tick)
    void flushPendingBookings()
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', tick) }
  }, [builderDate, booking.date, loadRush])
  /** Booking hote hi slot ka count usi pal badha do — meter turant rang badlega. */
  const bumpRush = (date: string, time: string) =>
    setRushByDate((m) => ({ ...m, [date]: { ...m[date], [time]: (m[date]?.[time] ?? 0) + 1 } }))
  const builderItems = services.filter((sv) => builderSel.includes(sv.id))
  const builderTotal = builderItems.reduce((a, sv) => a + sv.price, 0) + (comboPreset?.price ?? 0)

  const submitBuilder = (ev: FormEvent) => {
    ev.preventDefault()
    const items = [...(comboPreset ? [comboPreset.name] : []), ...builderItems.map((sv) => sv.name)]
    if (!items.length) {
      setBuilderMsg(ht.bNeed)
      document.querySelector('.builder-list')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const digits = booking.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
    if (booking.name.trim().length < 3 || !/^[6-9]\d{9}$/.test(digits)) { setBuilderMsg(ht.bInvalid); return }
    if ((rush[builderTime] ?? 0) >= SLOT_CAP || (builderDate === todayIST() && slotToMins(builderTime) <= nowMinsIST())) {
      setBuilderMsg(ht.slotBhara)
      document.querySelector('.slot-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (builderBusy) return
    setBuilderBusy(true); setBuilderMsg('')
    const label = items.join(' + ')
    const msg = [
      `Hello Men's Saloon! Main apna combo book karna chahta hoon.`, ``,
      `*Name:* ${booking.name.trim()}`,
      `*Mobile:* ${booking.phone.trim()}`,
      `*Combo:* ${label}`,
      `*Total:* ${inr(builderTotal)}`,
      `*Barber:* ${BARBER.name}`,
      `*Date:* ${fmtDate(builderDate)}`,
      `*Time:* ${builderTime}`, ``,
      `Please confirm my slot. Thank you!`,
    ].join('\n')
    bumpRush(builderDate, builderTime)
    saveBookingSafe({
      name: booking.name.trim(), phone: booking.phone.trim(),
      service: label.slice(0, 118), price: builderTotal,
      appt_date: builderDate, appt_time: builderTime, notes: 'Smart Combo Builder se booking',
    }).then((res) => {
      setBuilderMsg(res === 'saved' ? ht.bSaved : ht.dbQueued)
      if (res === 'saved') loadRush(builderDate)
    })
    try {
      const key = 'mens-saloon-bookings'
      const prev = JSON.parse(localStorage.getItem(key) ?? '[]') as Booking[]
      localStorage.setItem(key, JSON.stringify([...prev, { ...booking, serviceId: builderItems[0]?.id ?? booking.serviceId, date: builderDate, time: builderTime, at: new Date().toISOString() }]))
    } catch { /* ignore */ }
    window.open(whatsappLink(msg), '_blank', 'noopener')
    window.setTimeout(() => setBuilderBusy(false), 1500)
  }
  const ht = HT[lang]
  const [dbState, setDbState] = useState<'idle' | 'saving' | 'saved' | 'queued' | 'failed'>('idle')
  const [histPhone, setHistPhone] = useState('')
  const [histRows, setHistRows] = useState<DbBooking[] | null>(null)
  const [histBusy, setHistBusy] = useState(false)
  const [histMsg, setHistMsg] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [adminPin, setAdminPin] = useState<string>(() => {
    try { return sessionStorage.getItem('mens-saloon-admin-pin') ?? '' } catch { return '' }
  })
  const [adminRows, setAdminRows] = useState<DbBooking[] | null>(null)
  const [customers, setCustomers] = useState<DbCustomer[] | null>(null)
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminMsg, setAdminMsg] = useState('')
  const [newPin, setNewPin] = useState('')
  const [svcDraft, setSvcDraft] = useState<DbService[] | null>(null)
  const [setDraft, setSetDraft] = useState<SiteSettings | null>(null)
  const updSvc = (i: number, patch: Partial<DbService>) =>
    setSvcDraft((ds) => ds?.map((d, j) => (j === i ? { ...d, ...patch } : d)) ?? ds)
  const saveSvcDraft = async () => {
    if (!svcDraft) return
    setAdminBusy(true)
    try {
      const ok = await adminSaveServices(adminPin, svcDraft)
      if (ok) { setAdminMsg(ht.svcSaved); fetchSiteServices().then(setDbServices).catch(() => { /* ignore */ }) }
      else setAdminMsg(ht.errNet)
    } catch { setAdminMsg(ht.errNet) }
    setAdminBusy(false)
  }
  const saveSetDraft = async () => {
    if (!setDraft) return
    setAdminBusy(true)
    try {
      const ok = await adminSaveSettings(adminPin, setDraft)
      if (ok) { setSiteSettings(setDraft); setAdminMsg(ht.setSaved) } else setAdminMsg(ht.errNet)
    } catch { setAdminMsg(ht.errNet) }
    setAdminBusy(false)
  }
  const copyTodayList = async () => {
    if (!adminRows) return
    const todays = adminRows.filter((r) => r.appt_date === todayIST() && r.status !== 'cancelled')
    const txt = [
      `*Men's Saloon — Aaj ki Bookings (${fmtDate(todayIST())})*`, '',
      ...todays.map((r, i) => `${i + 1}. ${r.appt_time ?? ''} — ${r.name} · ${r.service}${r.price ? ` (${inr(r.price)})` : ''} · ${r.phone}`),
      ...(todays.length ? [] : ['Aaj koi booking nahi hai.']),
    ].join('\n')
    try { await navigator.clipboard.writeText(txt); setAdminMsg(ht.copied) } catch { setAdminMsg(ht.errNet) }
  }

  /* NOTE: naam/phone kabhi khud se nahi bharte — form hamesha khali aati hai,
     customer khud bharta hai (owner ki requirement). */

  const loadAdmin = async (pin: string) => {
    setAdminBusy(true); setAdminMsg('')
    try {
      const rows = await fetchAdminBookings(pin)
      setAdminRows(rows); setAdminPin(pin)
      fetchAdminCustomers(pin).then(setCustomers).catch(() => { /* ignore */ })
      fetchSiteServices().then((svc) => setSvcDraft(svc.map((r) => ({ ...r, desc_hi: r.desc_hi || SERVICE_DESC_HI[r.id] || '' })))).catch(() => { /* ignore */ })
      fetchSiteSettings().then((st) => { if (st) { setSetDraft(st); setSiteSettings(st) } }).catch(() => { /* ignore */ })
      try { sessionStorage.setItem('mens-saloon-admin-pin', pin) } catch { /* ignore */ }
    } catch { setAdminMsg(ht.errNet) }
    setAdminBusy(false)
  }

  /* Re-open the Shop Panel automatically if PIN was entered this session. */
  useEffect(() => {
    if (adminPin) void loadAdmin(adminPin)
  }, []) // first mount only — loadAdmin is intentionally not a dependency

  /* Shop Panel LIVE: panel khula ho to har 30 sec nayi bookings khud aa jayengi. */
  const panelOpen = adminRows !== null
  useEffect(() => {
    if (!adminPin || !panelOpen) return
    const id = window.setInterval(() => {
      fetchAdminBookings(adminPin).then(setAdminRows).catch(() => { /* ignore */ })
      fetchAdminCustomers(adminPin).then(setCustomers).catch(() => { /* ignore */ })
    }, 30_000)
    return () => window.clearInterval(id)
  }, [adminPin, panelOpen])

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
    () => services.find((s) => s.id === booking.serviceId) ?? SERVICES.find((s) => s.id === booking.serviceId) ?? SERVICES[0],
    [booking.serviceId, services],
  )

  const quickBook = (message: string) => whatsappLink(message)

  function chooseService(serviceId: string) {
    setBooking((b) => ({ ...b, serviceId }))
    setSent(false)
    scrollToId('book')
  }

  function chooseCombo(name: string, price: number) {
    /* Combo bhi ab naam+number ke saath book hoga — taaki shop customer ko call kar sake. */
    setComboPreset({ name, price })
    setBuilderSel([])
    scrollToId('smart-book')
  }

  function validate(b: Booking) {
    const e: Partial<Record<keyof Booking, string>> = {}
    if (b.name.trim().length < 3) e.name = 'Please enter your full name.'
    const digits = b.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
    if (!/^[6-9]\d{9}$/.test(digits)) e.phone = 'Enter a valid 10-digit mobile number.'
    if (!b.date) e.date = 'Please pick a date.'
    else if (b.date < todayIST()) e.date = 'Date cannot be in the past.'
    if (!b.time) e.time = 'Please pick a preferred time.'
    return e
  }

  function submitBooking(ev: FormEvent) {
    ev.preventDefault()
    const e = validate(booking)
    if (!e.time && ((formRush[booking.time] ?? 0) >= SLOT_CAP || (booking.date === todayIST() && slotToMins(booking.time) <= nowMinsIST()))) {
      e.time = 'This time is full / no longer available — please pick another time.'
    }
    setErrors(e)
    if (Object.keys(e).length > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    if (submitting) return
    setSubmitting(true)
    window.setTimeout(() => setSubmitting(false), 4000)
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
    bumpRush(booking.date, booking.time)
    saveBookingSafe({
      name: booking.name.trim(),
      phone: booking.phone.trim(),
      service: selectedService.name,
      price: selectedService.price,
      appt_date: booking.date,
      appt_time: booking.time,
      notes: booking.notes.trim(),
    }).then((res) => {
      setDbState(res === 'saved' ? 'saved' : 'queued')
      if (res === 'saved') loadRush(booking.date)
    })

    setSent(true)
    window.open(whatsappLink(message), '_blank', 'noopener')
  }

  return (
    <div className="site" lang={lang}>
      <div className="announcement">
        <span className="announce-dot" aria-hidden="true" />
        <p>{siteSettings.announcement || t.announce}</p>
      </div>
      {siteSettings.season_auto && (
        <div className="season-strip" data-season={season.id}>
          <span aria-hidden="true">{season.emoji}</span>
          <p>{lang === 'hi' ? season.hi : season.en}</p>
          <span aria-hidden="true">{season.emoji}</span>
        </div>
      )}
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
              <strong className={shopOpen ? 'open-now' : 'closed-now'}>{siteSettings.closed_today ? (siteSettings.closed_message || ht.closedTodayTxt) : openNow ? t.openNow : t.closedNow}</strong>
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

        {/* ===== Smart Chair — live bheed-meter + combo builder ===== */}
        <section className="section smart" id="smart-book">
          <header className="section-head reveal">
            <p className="chapter">{ht.smartChapter}</p>
            <h2>{ht.smartH2}</h2>
            <p>{ht.smartSub}</p>
          </header>

          <div className="smart-grid">
            {/* live bheed-meter */}
            <div className="smart-card reveal">
              <h3>{ht.rushTitle}<span className="live-dot" aria-label={ht.liveTxt} title={ht.liveTxt} /></h3>
              <div className="rush-days">
                <button type="button" className={`opt ${rushDay === 'today' ? 'active' : ''}`}
                  aria-pressed={rushDay === 'today'}
                  onClick={() => { setRushDay('today'); setBuilderDate(todayIST()) }}>{ht.todayB}</button>
                <button type="button" className={`opt ${rushDay === 'tomorrow' ? 'active' : ''}`}
                  aria-pressed={rushDay === 'tomorrow'}
                  onClick={() => { setRushDay('tomorrow'); setBuilderDate(tomorrowIST()) }}>{ht.tomorrowB}</button>
                <span className="rush-date">{fmtDate(builderDate)}</span>
              </div>
              <div className="slot-grid">
                {TIME_SLOTS.map((slot) => {
                  const c = rush[slot] ?? 0
                  const past = builderDate === todayIST() && slotToMins(slot) <= nowMinsIST()
                  const full = c >= SLOT_CAP
                  const cls = past ? 'past' : full ? 'full' : 'free'
                  return (
                    <button key={slot} type="button" disabled={past || full}
                      className={`slot ${cls} ${builderTime === slot ? 'sel' : ''}`}
                      aria-pressed={builderTime === slot}
                      onClick={() => setBuilderTime(slot)}>
                      <strong>{slot}</strong>
                      <small>{past ? ht.past : full ? ht.full : ht.free}</small>
                    </button>
                  )
                })}
              </div>
              <p className="form-note">{ht.rushNote}</p>
            </div>

            {/* combo builder */}
            <div className="smart-card reveal">
              <h3>{ht.builderTitle}</h3>
              <p className="hist-sub">{ht.builderSub}</p>
              {comboPreset && (
                <div className="preset-chip">
                  <span>🎁 {comboPreset.name} · {inr(comboPreset.price)}</span>
                  <button type="button" className="mini-btn danger" aria-label="Remove combo" onClick={() => setComboPreset(null)}>✕</button>
                </div>
              )}
              <div className="builder-list">
                {services.map((sv) => (
                  <label key={sv.id} className={`builder-item ${builderSel.includes(sv.id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={builderSel.includes(sv.id)}
                      onChange={(e) => setBuilderSel((sel) => e.target.checked ? [...sel, sv.id] : sel.filter((x) => x !== sv.id))} />
                    <span>{sv.name}</span>
                    <strong>{inr(sv.price)}{sv.priceNote ? '+' : ''}</strong>
                  </label>
                ))}
              </div>
              <div className="builder-total" aria-live="polite">
                <span>{ht.totalL2}</span>
                <strong>{builderTotal > 0 ? inr(builderTotal) : '—'}</strong>
                <small>{builderTotal > 0 ? `${fmtDate(builderDate)} · ${builderTime}` : ht.pickHint}</small>
              </div>
              <form className="hist-form" onSubmit={submitBuilder}>
                <label>
                  {ht.bName}
                  <input className="db-input" type="text" autoComplete="name" placeholder="e.g. Rahul Kumar"
                    value={booking.name} onChange={(e) => setBooking({ ...booking, name: e.target.value })} />
                </label>
                <label>
                  {ht.bPhone}
                  <input className="db-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="10-digit mobile number"
                    value={booking.phone} onChange={(e) => setBooking({ ...booking, phone: e.target.value })} />
                  <small className="phone-help">{ht.phoneHelp}</small>
                </label>
                <button className="btn btn-wa btn-lg btn-block" type="submit" disabled={builderBusy}>{ht.bBook}</button>
              </form>
              {builderMsg && <p className="hist-msg" role="status">{builderMsg}</p>}
            </div>
          </div>
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
            {services.map((s, i) => (
              <article className="service-card reveal" key={s.id} style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
                {s.tag && <span className="tag">{s.tag}</span>}
                <h3>{s.name}</h3>
                <p>{lang === 'hi' ? (s.descHi || SERVICE_DESC_HI[s.id] || s.desc) : s.desc}</p>
                <div className="service-meta">
                  <span className="price">{inr(s.price)}{s.priceNote ? <small> {s.priceNote}</small> : null}</span>
                  <span className="duration">◷ {s.duration}</span>
                </div>
                <button className="btn btn-card" onClick={() => chooseService(s.id)}>
                  {t.bookThis}
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
                  {ht.comboBook}
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
                  {(services.find((x) => x.id === finderResult.serviceId)?.name)} · {inr(services.find((x) => x.id === finderResult.serviceId)?.price ?? 50)}
                  {services.find((x) => x.id === finderResult.serviceId)?.priceNote ? ' onwards' : ''}
                </p>
                <div className="hero-ctas">
                  <button className="btn btn-red" onClick={() => chooseService(finderResult.serviceId)}>
                    {lang === 'hi' ? 'यही लुक बुक करो' : 'Book This Look'}
                  </button>
                  <button type="button" className="btn btn-wa" onClick={() => {
                    setBooking((b) => ({ ...b, serviceId: finderResult.serviceId, notes: `Style Finder wala look: ${finderResult.style}` }))
                    scrollToId('book')
                  }}>
                    WhatsApp Booking →
                  </button>
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
            <p>{lang === 'hi' ? 'Style par tap karo — booking form me wo style note ho jayega. Ya koi bhi photo lao, hum tumhare face shape aur hair type ke hisaab se match kar denge.' : 'Tap a style — it lands in your booking form with your number, so the shop can confirm you. Or bring any photo and we will match it to your face shape and hair type.'}</p>
          </header>
          <div className="style-grid">
            {STYLE_MENU.map((st, i) => (
              <button
                type="button"
                className="style-card reveal"
                key={st.name}
                onClick={() => {
                  setBooking((b) => ({ ...b, notes: `Style chahiye: ${st.name} (${st.hint})` }))
                  scrollToId('book')
                }}
                style={{ transitionDelay: `${(i % 4) * 60}ms` }}
              >
                <span className="style-no">{String(i + 1).padStart(2, '0')}</span>
                <strong>{st.name}</strong>
                <small>{lang === 'hi' ? (STYLE_HINT_HI[st.name] ?? st.hint) : st.hint}</small>
                <span className="style-cta">{t.askStyle}</span>
              </button>
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
              {!errors.phone && <small className="phone-help">{ht.phoneHelp}</small>}
            </label>

            <label>
              Service *
              <select
                value={booking.serviceId}
                onChange={(e) => setBooking({ ...booking, serviceId: e.target.value })}
              >
                {services.map((s) => (
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
                  min={todayIST()}
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
                  {TIME_SLOTS.map((slotOpt) => {
                    const c = formRush[slotOpt] ?? 0
                    const dis = c >= SLOT_CAP || (booking.date === todayIST() && slotToMins(slotOpt) <= nowMinsIST())
                    return (
                      <option key={slotOpt} value={slotOpt} disabled={dis}>
                        {slotOpt}{c >= SLOT_CAP ? ` — ${ht.full}` : ''}
                      </option>
                    )
                  })}
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

            <button className="btn btn-wa btn-lg btn-block" type="submit" disabled={submitting}>
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
            {sent && dbState === 'queued' && <p className="form-note">{ht.dbQueued}</p>}
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
                      <div className="row-side">
                        <span className={`st st-${r.status}`}>{statusLabel(r.status)}</span>
                        <button type="button" className="mini-btn" onClick={() => {
                          const match = services.find((sv) => sv.name === r.service)
                          setBooking((b) => ({ ...b, serviceId: match?.id ?? b.serviceId }))
                          scrollToId('book')
                        }}>{ht.bookAgain}</button>
                      </div>
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
                    <div><strong>{inr(adminRows.filter((r) => r.appt_date === todayIST() && r.status === 'done').reduce((a, r) => a + (r.price ?? 0), 0))}</strong><span>{ht.kamaiL}</span></div>
                  </div>
                  <div className="admin-actions">
                    <button className="btn btn-ghost" onClick={() => void loadAdmin(adminPin)} disabled={adminBusy}>
                      {adminBusy ? '…' : ht.refresh}
                    </button>
                    <button className="btn btn-ghost" onClick={() => void copyTodayList()}>{ht.copyToday}</button>
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
                                {r.status !== 'cancelled' && (
                                  <a href={`https://wa.me/91${last10}?text=${encodeURIComponent(`Namaste ${r.name} ji 🙏 Men's Saloon (Sudama Nagar, Nawada) se aapki booking CONFIRM hai ✅\n✂️ Service: ${r.service}\n📅 Date: ${fmtDate(r.appt_date)}\n⏰ Time: ${r.appt_time ?? ''}\nSamay par aa jaiye — aapki kursi ready rahegi. Dhanyavaad!`)}`} target="_blank" rel="noreferrer">{ht.confirmMsgL}</a>
                                )}
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
                  {customers && customers.length > 0 && (
                    <div className="svc-editor">
                      <h4>{ht.custRecord}</h4>
                      <ul className="hist-list">
                        {customers.map((cu) => (
                          <li className="hist-row" key={cu.phone}>
                            <div>
                              <strong>{cu.name}</strong>
                              <span>📱 {cu.phone} · {cu.visits} {ht.visitsWord}</span>
                              <span>{ht.lastVisit}: {fmtDate(cu.last_date)}{cu.total_spent > 0 ? ` · ${ht.spentL}: ${inr(cu.total_spent)}` : ''}</span>
                            </div>
                            <div className="row-side">
                              <a className="mini-btn" href={`tel:+91${cu.phone}`}>☎ {ht.callL}</a>
                              <a className="mini-btn" href={`https://wa.me/91${cu.phone}`} target="_blank" rel="noreferrer">WhatsApp</a>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
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
                  {/* --- live price/service editor --- */}
                  {svcDraft && (
                    <div className="svc-editor">
                      <h4>{ht.svcEditTitle}</h4>
                      <p className="hist-sub">{ht.svcEditSub}</p>
                      {svcDraft.map((sv, idx) => (
                        <div className="svc-row" key={`${sv.id}-${idx}`}>
                          <input className="db-input svc-name" value={sv.name} placeholder={ht.svcNamePh} aria-label={ht.svcNamePh}
                            onChange={(e) => updSvc(idx, { name: e.target.value })} />
                          <input className="db-input svc-price" type="number" min={0} value={sv.price} placeholder={ht.svcPricePh} aria-label={ht.svcPricePh}
                            onChange={(e) => updSvc(idx, { price: Math.max(0, Number(e.target.value) || 0) })} />
                          <input className="db-input svc-dur" value={sv.duration} placeholder={ht.svcDurPh} aria-label={ht.svcDurPh}
                            onChange={(e) => updSvc(idx, { duration: e.target.value })} />
                          <label className="svc-active">
                            <input type="checkbox" checked={sv.active}
                              onChange={(e) => updSvc(idx, { active: e.target.checked })} /> {ht.svcOn}
                          </label>
                          <button type="button" className="mini-btn danger" aria-label="Delete service"
                            onClick={() => setSvcDraft((ds) => ds?.filter((_, j) => j !== idx) ?? ds)}>✕</button>
                        </div>
                      ))}
                      <div className="admin-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => setSvcDraft((ds) => [...(ds ?? []), {
                          id: `svc-${Date.now()}`, name: 'New Service', desc_en: '', desc_hi: '',
                          price: 100, price_note: null, duration: '~30 min', tag: null,
                          sort: ((ds?.length ?? 0) + 1) * 10, active: true,
                        }])}>{ht.svcAdd}</button>
                        <button type="button" className="btn btn-red" disabled={adminBusy} onClick={() => void saveSvcDraft()}>{ht.svcSave}</button>
                      </div>
                    </div>
                  )}

                  {/* --- shop notice & settings --- */}
                  {setDraft && (
                    <div className="svc-editor">
                      <h4>{ht.setTitle}</h4>
                      <div className="hist-form">
                        <label>
                          {ht.annLabel}
                          <input className="db-input" value={setDraft.announcement} placeholder={ht.annPh}
                            onChange={(e) => setSetDraft({ ...setDraft, announcement: e.target.value })} />
                        </label>
                        <label className="check-row">
                          <input type="checkbox" checked={setDraft.closed_today}
                            onChange={(e) => setSetDraft({ ...setDraft, closed_today: e.target.checked })} /> {ht.closedLabel}
                        </label>
                        <label>
                          {ht.closedMsgLabel}
                          <input className="db-input" value={setDraft.closed_message} placeholder={ht.closedMsgPh}
                            onChange={(e) => setSetDraft({ ...setDraft, closed_message: e.target.value })} />
                        </label>
                        <label className="check-row">
                          <input type="checkbox" checked={setDraft.season_auto}
                            onChange={(e) => setSetDraft({ ...setDraft, season_auto: e.target.checked })} /> {ht.seasonLabel}
                        </label>
                        <button type="button" className="btn btn-red" disabled={adminBusy} onClick={() => void saveSetDraft()}>{ht.setSave}</button>
                      </div>
                    </div>
                  )}

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
              <li><span>{t.vHours}</span><strong>{BUSINESS.hoursLabel}</strong><strong className={shopOpen ? 'open-now' : 'closed-now'}>{siteSettings.closed_today ? (siteSettings.closed_message || ht.closedTodayTxt) : openNow ? t.vOpen : t.vClosed}</strong><small>{BUSINESS.hoursNote}</small></li>
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



        {/* ===== local areas — "saloon near me" / Sudama Nagar / Nawada searches ===== */}
        <section className="section alt areas">
          <header className="section-head reveal">
            <p className="chapter">{lang === 'hi' ? 'आपके पास — सुधामा नगर, नवादा' : 'Near You — Sudama Nagar, Nawada'}</p>
            <h2>{lang === 'hi' ? '“मेरे पास का सैलून” ढूँढ रहे हो?' : 'Searching “saloon near me” in Nawada?'}</h2>
            <p>{lang === 'hi'
              ? 'Men’s Saloon यहीं सुधामा नगर में है — नवादा का अपना प्रीमियम जेंट्स सैलून। हेयरकट सिर्फ़ ₹50, हेयरकट + शेविंग ₹100, रोज़ सुबह 7 बजे से रात 8:30 तक खुला। सुधामा नगर और नवादा के आस-पास के इलाकों से लोग यहीं आते हैं — WhatsApp पर कुर्सी बुक करो, बिना लाइन लगे सीधा स्टाइल में बैठो।'
              : 'Men’s Saloon is right here in Sudama Nagar — Nawada ka apna premium gents saloon. Haircut sirf ₹50, Haircut + Shaving ₹100, open every day 7:00 AM to 8:30 PM. Sudama Nagar aur Nawada ke aas-paas ke ilaakon se log yahi aate hain — WhatsApp par kursi book karo aur bina line lage seedha style me baitho.'}</p>
          </header>
          <div className="area-chips reveal">
            {['Sudama Nagar', 'Nawada', 'Haircut ₹50', 'Haircut + Shaving ₹100', 'Open Daily · 7 AM – 8:30 PM'].map((a) => (
              <span key={a}>📍 {a}</span>
            ))}
          </div>
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
          <a href="#smart-book" onClick={(e) => { e.preventDefault(); scrollToId('smart-book') }}>Smart Booking</a>
        </nav>
        <p className="footer-note">
          © {new Date().getFullYear()} {BUSINESS.name}, {BUSINESS.city}. Sudama Nagar ka apna premium
          gents saloon. Prices are starting prices — confirmed before your service begins.
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
