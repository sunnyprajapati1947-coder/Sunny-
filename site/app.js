/* ============================================================
   NOVA SYNDICATE · Officer console
   Squad roster management (localStorage), scrim table, UI FX
   ============================================================ */
(() => {
  "use strict";

  /* ---------------- Config ---------------- */
  const STORE_KEY = "nova.roster.v1";
  const ROLES = ["Leader", "Officer", "Member", "Recruit"];

  const DEFAULT_ROSTER = [
    { id: "m1",  ign: "SUNNY 亗",     role: "Officer", kd: 4.12, matches: 1246, level: 78, present: 47, total: 50 },
    { id: "m2",  ign: "VYOM亗KING",   role: "Leader",  kd: 4.85, matches: 1580, level: 82, present: 49, total: 50 },
    { id: "m3",  ign: "SHADOW亗",     role: "Officer", kd: 3.74, matches: 980,  level: 74, present: 42, total: 50 },
    { id: "m4",  ign: "RX.ARYAN",     role: "Member",  kd: 3.28, matches: 812,  level: 69, present: 38, total: 50 },
    { id: "m5",  ign: "ZEUS亗OP",     role: "Member",  kd: 2.96, matches: 745,  level: 67, present: 35, total: 50 },
    { id: "m6",  ign: "NOVA.RITZ",    role: "Member",  kd: 2.71, matches: 690,  level: 64, present: 33, total: 50 },
    { id: "m7",  ign: "AK亗SNIPER",   role: "Member",  kd: 3.55, matches: 903,  level: 71, present: 40, total: 50 },
    { id: "m8",  ign: "FROST.YASH",   role: "Member",  kd: 2.44, matches: 610,  level: 61, present: 28, total: 50 },
    { id: "m9",  ign: "TOXIC亗",      role: "Member",  kd: 2.18, matches: 530,  level: 58, present: 24, total: 50 },
    { id: "m10", ign: "MEOW.RAVI",    role: "Recruit", kd: 2.92, matches: 402,  level: 63, present: 6,  total: 7  },
    { id: "m11", ign: "BLADE.SUMIT",  role: "Recruit", kd: 2.31, matches: 318,  level: 57, present: 4,  total: 7  },
    { id: "m12", ign: "PHANTOM亗",    role: "Member",  kd: 1.94, matches: 288,  level: 52, present: 19, total: 50 }
  ];

  const SCRIMS = [
    { day: "Mon", time: "21:00 – 23:00", type: "Guild Scrim",      maps: "Bermuda · Purgatory", slots: "12 / 12", status: "confirmed" },
    { day: "Tue", time: "21:30 – 23:30", type: "Ranked Push",      maps: "Kalahari",            slots: "4 / 4",   status: "confirmed" },
    { day: "Wed", time: "22:00 – 00:00", type: "Custom Room",      maps: "Alpine · Nexterra",   slots: "10 / 12", status: "pending" },
    { day: "Thu", time: "21:00 – 23:00", type: "Guild Scrim",      maps: "Bermuda",             slots: "12 / 12", status: "confirmed" },
    { day: "Fri", time: "20:30 – 23:00", type: "Tournament Quals", maps: "Bermuda · Purgatory", slots: "3 / 4",   status: "open" },
    { day: "Sat", time: "19:00 – 22:00", type: "Tryout Session",   maps: "Training Ground",     slots: "2 slots", status: "open" },
    { day: "Sun", time: "20:00 – 22:00", type: "Review + VOD",     maps: "—",                   slots: "All",     status: "pending" }
  ];

  /* ---------------- Elements ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const grid = $("#rosterGrid");
  const emptyState = $("#emptyState");
  const countEl = $("#rosterCount");
  const filtersEl = $("#filters");
  const searchEl = $("#search");
  const modal = $("#modal");
  const addForm = $("#addForm");
  const formError = $("#formError");
  const toastEl = $("#toast");

  let state = {
    members: load(),
    filter: "All",
    query: ""
  };
  let lastFocused = null;

  /* ---------------- Storage ---------------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return structuredClone(DEFAULT_ROSTER);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) return structuredClone(DEFAULT_ROSTER);
      return parsed.map(normalize);
    } catch {
      return structuredClone(DEFAULT_ROSTER);
    }
  }

  function normalize(m) {
    return {
      id: String(m.id ?? crypto.randomUUID()),
      ign: String(m.ign ?? "UNKNOWN").slice(0, 20),
      role: ROLES.includes(m.role) ? m.role : "Member",
      kd: clampNum(m.kd, 0, 30, 0),
      matches: Math.round(clampNum(m.matches, 0, 99999, 0)),
      level: Math.round(clampNum(m.level, 1, 100, 1)),
      present: Math.round(clampNum(m.present, 0, 9999, 0)),
      total: Math.round(clampNum(m.total, 0, 9999, 0))
    };
  }

  function clampNum(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.members));
    } catch {
      /* storage may be full or blocked — page still works in-memory */
    }
  }

  /* ---------------- Helpers ---------------- */
  const attPct = (m) => (m.total > 0 ? Math.round((m.present / m.total) * 100) : 0);
  const initials = (ign) => {
    const clean = ign.replace(/[^A-Za-z0-9]/g, "");
    return (clean[0] ?? "?").toUpperCase();
  };
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  /* ---------------- Render: roster ---------------- */
  function visibleMembers() {
    const q = state.query.trim().toLowerCase();
    return state.members.filter((m) => {
      const roleOk = state.filter === "All" || m.role === state.filter;
      const qOk = !q || m.ign.toLowerCase().includes(q);
      return roleOk && qOk;
    });
  }

  function renderRoster() {
    const list = visibleMembers();
    grid.innerHTML = list
      .map(
        (m) => `
      <article class="member role-${m.role}" data-id="${m.id}">
        <div class="member-top">
          <span class="m-avatar">${escapeHtml(initials(m.ign))}</span>
          <div class="m-name">
            <h4 title="${escapeHtml(m.ign)}">${escapeHtml(m.ign)}</h4>
            <p>LV ${m.level} · ${m.matches} matches</p>
          </div>
          <button class="m-role-badge" data-act="cycle-role"
                  title="Click to change role (Leader → Officer → Member → Recruit)">${m.role}</button>
        </div>
        <div class="m-stats">
          <div><span>K/D</span><b>${m.kd.toFixed(2)}</b></div>
          <div><span>Matches</span><b>${m.matches}</b></div>
          <div><span>Level</span><b>${m.level}</b></div>
        </div>
        <div class="attendance">
          <div class="attendance-bar"><i style="width:${attPct(m)}%"></i></div>
          <span>${attPct(m)}% · ${m.present}/${m.total}</span>
        </div>
        <div class="m-actions">
          <button class="mini-btn ok" data-act="present" title="Mark present for a scrim">✓ Present</button>
          <button class="mini-btn" data-act="missed" title="Mark one scrim missed">✕ Missed</button>
          <button class="mini-btn del" data-act="remove" title="Remove from roster">Remove</button>
        </div>
      </article>`
      )
      .join("");

    emptyState.hidden = list.length > 0;
    countEl.textContent = list.length;

    // update "All" pill count
    const allPill = $('[data-filter="All"] i', filtersEl);
    if (allPill) allPill.textContent = state.members.length;
  }

  /* ---------------- Roster actions ---------------- */
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const card = btn.closest(".member");
    const member = state.members.find((m) => m.id === card.dataset.id);
    if (!member) return;

    switch (btn.dataset.act) {
      case "cycle-role": {
        const i = ROLES.indexOf(member.role);
        member.role = ROLES[(i + 1) % ROLES.length];
        toast(`${member.ign} → ${member.role}`);
        break;
      }
      case "present":
        member.present += 1;
        member.total += 1;
        toast(`${member.ign} marked present · ${attPct(member)}%`);
        break;
      case "missed":
        member.total += 1;
        toast(`${member.ign} marked missed · ${attPct(member)}%`);
        break;
      case "remove":
        if (!confirm(`Remove ${member.ign} from the roster?`)) return;
        state.members = state.members.filter((m) => m.id !== member.id);
        toast(`${member.ign} removed from roster`);
        break;
    }
    save();
    renderRoster();
  });

  /* ---------------- Filters + search ---------------- */
  filtersEl.addEventListener("click", (e) => {
    const pill = e.target.closest("[data-filter]");
    if (!pill) return;
    state.filter = pill.dataset.filter;
    $$(".pill", filtersEl).forEach((p) => p.classList.toggle("is-active", p === pill));
    renderRoster();
  });

  searchEl.addEventListener("input", () => {
    state.query = searchEl.value;
    renderRoster();
  });

  $("#resetRoster").addEventListener("click", () => {
    if (!confirm("Reset roster to default 12 members? Aapke changes chale jayenge.")) return;
    state.members = structuredClone(DEFAULT_ROSTER);
    state.filter = "All";
    state.query = "";
    searchEl.value = "";
    $$(".pill", filtersEl).forEach((p) => p.classList.toggle("is-active", p.dataset.filter === "All"));
    save();
    renderRoster();
    toast("Roster reset to defaults");
  });

  /* ---------------- Modal ---------------- */
  function openModal() {
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    formError.hidden = true;
    addForm.reset();
    setTimeout(() => addForm.elements.ign?.focus(), 60);
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    lastFocused?.focus?.();
  }

  $("#openAdd").addEventListener("click", openModal);
  $("#openAddTop").addEventListener("click", openModal);
  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
    // simple focus trap
    if (e.key === "Tab" && !modal.hidden) {
      const focusables = $$('button, input, select, [href]', modal).filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(addForm);
    const ign = String(data.get("ign") ?? "").trim();
    if (ign.length < 2) {
      formError.textContent = "IGN kam se kam 2 characters ka hona chahiye.";
      formError.hidden = false;
      return;
    }
    if (state.members.some((m) => m.ign.toLowerCase() === ign.toLowerCase())) {
      formError.textContent = "Yeh IGN already roster me hai.";
      formError.hidden = false;
      return;
    }
    const role = String(data.get("role") ?? "Member");
    state.members.unshift(
      normalize({
        id: crypto.randomUUID(),
        ign,
        role: ROLES.includes(role) ? role : "Member",
        kd: data.get("kd"),
        matches: data.get("matches"),
        level: data.get("level"),
        present: 0,
        total: 0
      })
    );
    state.filter = "All";
    state.query = "";
    searchEl.value = "";
    $$(".pill", filtersEl).forEach((p) => p.classList.toggle("is-active", p.dataset.filter === "All"));
    save();
    renderRoster();
    closeModal();
    toast(`${ign} added to roster`);
  });

  /* ---------------- Scrim table ---------------- */
  function renderScrims() {
    $("#scrimBody").innerHTML = SCRIMS.map(
      (s) => `
      <tr>
        <td>${s.day}</td>
        <td>${s.time}</td>
        <td>${s.type}</td>
        <td class="muted">${s.maps}</td>
        <td>${s.slots}</td>
        <td><span class="status ${s.status}">${s.status}</span></td>
      </tr>`
    ).join("");
  }

  /* ---------------- Tryout CTA ---------------- */
  $("#tryoutApply").addEventListener("click", (e) => {
    e.preventDefault();
    toast("Tryout form open — officer ko Discord DM karo (@sunny.ff).");
  });

  /* ---------------- Nav ---------------- */
  const nav = $("#nav");
  const navLinks = $("#navLinks");
  const hamburger = $("#hamburger");

  const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  hamburger.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    hamburger.setAttribute("aria-expanded", String(open));
  });
  navLinks.addEventListener("click", (e) => {
    if (e.target.matches("a")) {
      navLinks.classList.remove("open");
      hamburger.setAttribute("aria-expanded", "false");
    }
  });

  /* ---------------- Reveal on scroll ---------------- */
  function setupReveal() {
    const items = $$(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add("in"), i * 70);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    items.forEach((el) => io.observe(el));
  }

  /* ---------------- Counters ---------------- */
  function setupCounters() {
    const nums = $$("[data-count]");
    const run = (el) => {
      const target = Number(el.dataset.count) || 0;
      const decimals = Number(el.dataset.decimal) || 0;
      const suffix = el.dataset.suffix || "";
      const dur = 1100;
      const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (target * eased).toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = target.toFixed(decimals) + suffix;
      };
      requestAnimationFrame(step);
    };
    if (!("IntersectionObserver" in window)) return nums.forEach(run);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { run(en.target); io.unobserve(en.target); }
        });
      },
      { threshold: 0.6 }
    );
    nums.forEach((n) => io.observe(n));
  }

  /* ---------------- Embers ---------------- */
  function setupEmbers() {
    const box = $("#embers");
    if (!box || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const count = window.innerWidth < 760 ? 14 : 26;
    for (let i = 0; i < count; i++) {
      const el = document.createElement("span");
      el.className = "ember";
      el.style.left = `${Math.random() * 100}%`;
      el.style.animationDuration = `${9 + Math.random() * 12}s`;
      el.style.animationDelay = `${-Math.random() * 14}s`;
      el.style.setProperty("--dx", `${(Math.random() - 0.5) * 160}px`);
      el.style.opacity = String(0.3 + Math.random() * 0.5);
      const size = 1 + Math.random() * 2;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      box.appendChild(el);
    }
  }

  /* ---------------- Init ---------------- */
  $("#year").textContent = String(new Date().getFullYear());
  renderRoster();
  renderScrims();
  setupReveal();
  setupCounters();
  setupEmbers();
})();
