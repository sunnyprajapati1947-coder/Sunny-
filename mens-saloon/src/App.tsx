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
  whatsappLink,
} from './config'

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

type Booking = {
  name: string
  phone: string
  serviceId: string
  date: string
  time: string
  notes: string
}

/* ---------- app ---------- */

export default function App() {
  useReveal()

  const [menuOpen, setMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [booking, setBooking] = useState<Booking>({
    name: '',
    phone: '',
    serviceId: 'haircut-beard',
    date: todayISO(),
    time: '11:00 AM',
    notes: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof Booking, string>>>({})
  const [sent, setSent] = useState(false)
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
      `*Preferred time:* ${booking.time} (1-hour chair)`,
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
    setSent(true)
    window.open(whatsappLink(message), '_blank', 'noopener')
  }

  return (
    <div className="site">
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
            ['Services', 'services'],
            ['Combos', 'combos'],
            ['Barber', 'barber'],
            ['Styles', 'styles'],
            ['Visit', 'visit'],
            ['FAQ', 'faq'],
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
            Book on WhatsApp
          </a>
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
            <p className="chapter">Chapter 00 — The Chair Awaits</p>
            <h1>
              Sharp cuts.
              <br />
              <em>Royal</em> grooming.
            </h1>
            <p className="lede">
              {BUSINESS.name} brings a premium, luxury chair experience to {BUSINESS.area},{' '}
              {BUSINESS.city} — precision haircuts, sculpted beards and complete grooming by{' '}
              {BARBER.name}, a master barber with {BARBER.experienceYears} years of craft.
            </p>
            <div className="hero-ctas">
              <button className="btn btn-red btn-lg" onClick={() => scrollToId('book')}>
                Book My 1-Hour Chair
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
              <li><strong>{BARBER.experienceYears} yrs</strong><span>Master barber craft</span></li>
              <li><strong>1 hour</strong><span>Reserved chair session</span></li>
              <li><strong>{inr(249)}</strong><span>Haircut starts at</span></li>
              <li><strong>Daily</strong><span>Open · walk-ins welcome</span></li>
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
              <strong>Now Open</strong>
              <span>{BUSINESS.tagline}</span>
              <span>{BUSINESS.addressLine} · {BUSINESS.phoneDisplay}</span>
            </figcaption>
          </figure>
        </section>

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
            <p className="chapter">Chapter 01 — Services & Prices</p>
            <h2>Everything a gentleman needs, honestly priced.</h2>
            <p>
              Starting prices for standard hair — your final price is always confirmed before we
              begin. Every premium booking reserves a full <strong>1-hour chair session</strong>.
            </p>
          </header>

          <div className="service-grid">
            {SERVICES.map((s, i) => (
              <article className="service-card reveal" key={s.id} style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
                {s.tag && <span className="tag">{s.tag}</span>}
                <h3>{s.name}</h3>
                <p>{s.desc}</p>
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
            <p className="chapter">Chapter 02 — Grooming Rituals</p>
            <h2>Combos that save time — and money.</h2>
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
                  Book on WhatsApp
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
            <p className="chapter">Chapter 03 — Meet Your Barber</p>
            <h2>{BARBER.name}</h2>
            <ul className="barber-facts">
              <li><strong>{BARBER.experienceYears} years</strong><span>Experience</span></li>
              <li><strong>Age {BARBER.age}</strong><span>Young master barber</span></li>
              <li><strong>1-to-1</strong><span>Personal attention, every chair</span></li>
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

        {/* ===== style menu ===== */}
        <section className="section alt" id="styles">
          <header className="section-head reveal">
            <p className="chapter">Style Menu — Pick Your Look</p>
            <h2>Not sure what suits you? Start here.</h2>
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
                <small>{st.hint}</small>
                <span className="style-cta">Ask for this style →</span>
              </a>
            ))}
          </div>

          <div className="why reveal">
            <h3>Why men choose {BUSINESS.name}</h3>
            <ul>
              <li><strong>Clean & hygienic chair</strong><span>Fresh towels and sanitised tools for every customer.</span></li>
              <li><strong>Premium products</strong><span>Quality creams, oils and styling products on our shelf — see them in-store.</span></li>
              <li><strong>No-rush 1-hour booking</strong><span>Your reserved hour means detailing is never skipped.</span></li>
              <li><strong>Honest local pricing</strong><span>Premium finish at Nawada-friendly rates, confirmed upfront.</span></li>
            </ul>
          </div>
        </section>

        {/* ===== Chapter 04 — booking ===== */}
        <section className="section booking" id="book">
          <div className="booking-copy reveal">
            <p className="chapter">Chapter 04 — Book Your Chair</p>
            <h2>Three steps. Zero waiting.</h2>
            <ol className="steps">
              <li><strong>Fill the form</strong><span>Name, service, date and your preferred 1-hour slot.</span></li>
              <li><strong>Send on WhatsApp</strong><span>We open WhatsApp with everything pre-filled — just press send.</span></li>
              <li><strong>We confirm</strong><span>{BARBER.name} replies on WhatsApp to lock your exact time.</span></li>
            </ol>
            <p className="booking-alt">
              Prefer to talk? <a href={`tel:${BUSINESS.phoneE164}`}>Call {BUSINESS.phoneDisplay}</a> — walk-ins
              are welcome too.
            </p>
            <div className="booking-summary" aria-live="polite">
              <span>You are booking</span>
              <strong>{selectedService.name}</strong>
              <span>{inr(selectedService.price)}{selectedService.priceNote ? ' ' + selectedService.priceNote : ''} · {selectedService.duration} · with {BARBER.name}</span>
            </div>
          </div>

          <form className="booking-form reveal" ref={formRef} onSubmit={submitBooking} noValidate>
            <h3>Book an Appointment</h3>

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
                Preferred time (1-hr slot) *
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
              No advance payment. Pay at the saloon after your service. Your details open directly in
              WhatsApp — nothing is stored on a server.
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
          </form>
        </section>

        {/* ===== FAQ ===== */}
        <section className="section alt" id="faq">
          <header className="section-head reveal">
            <p className="chapter">Good Questions</p>
            <h2>Before you visit</h2>
          </header>
          <div className="faq-list reveal">
            {FAQS.map((f, i) => (
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
            <p className="chapter">Chapter 05 — Visit Us</p>
            <h2>{BUSINESS.area}, {BUSINESS.city}</h2>
            <ul className="visit-list">
              <li><span>Address</span><strong>{BUSINESS.addressLine}</strong></li>
              <li><span>Phone / WhatsApp</span><a href={`tel:${BUSINESS.phoneE164}`}><strong>{BUSINESS.phoneDisplay}</strong></a></li>
              <li><span>Hours</span><strong>{BUSINESS.hoursLabel}</strong><small>{BUSINESS.hoursNote}</small></li>
              <li><span>Barber</span><strong>{BARBER.name} · {BARBER.experienceYears} yrs experience</strong></li>
            </ul>
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

        {/* ===== final CTA ===== */}
        <section className="final-cta reveal">
          <p className="chapter">Afterlight — Your Chair Is Waiting</p>
          <h2>Walk in ordinary.<br />Walk out <em>unforgettable</em>.</h2>
          <div className="hero-ctas center">
            <button className="btn btn-red btn-lg" onClick={() => scrollToId('book')}>Book My Chair</button>
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
        <a href={`tel:${BUSINESS.phoneE164}`}>☎<span>Call</span></a>
        <a
          href={quickBook("Hello Men's Saloon! I want to book an appointment.")}
          target="_blank"
          rel="noreferrer"
        >
          ◉<span>WhatsApp</span>
        </a>
        <button onClick={() => scrollToId('book')}>✂<span>Book Chair</span></button>
      </div>
    </div>
  )
}
