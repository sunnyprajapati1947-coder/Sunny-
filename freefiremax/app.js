/* ============================================================
   FF MAX UNIVERSE — unofficial fan hub
   Data-driven UI: maps, agents, weapon classes, esports, loadout
   No backend, no tracking, nothing leaves the device.
   ============================================================ */
(() => {
  "use strict";

  /* =========================================================
     1. DATA
     ========================================================= */

  // Note: these are fan-written summaries, not official values.
  const MAPS = [
    {
      code: "MAP-01", name: "Bermuda", tint: "rgba(255,159,28,.22)",
      tags: ["4×4 km", "50 players", "Balanced"],
      rows: [
        ["Terrain", "Coastal towns · hills"],
        ["Hot drops", "Clock Tower, Peak, Mars"],
        ["Loot", "High in towns"],
        ["Rotations", "Roads + river crossings"]
      ],
      note: "Sabse familiar map. Rotation ke liye road network strong hai — end circles often Peak/Clock side shift karte hain."
    },
    {
      code: "MAP-02", name: "Purgatory", tint: "rgba(46,230,208,.18)",
      tags: ["2×2 km", "20 players", "Fast"],
      rows: [
        ["Terrain", "Volcanic · industrial"],
        ["Hot drops", "Central factory, cave"],
        ["Loot", "Dense but contested"],
        ["Rotations", "Short, vertical"]
      ],
      note: "Chhota map = early fights. Third-party bahut common, isliye cover discipline aur sound cues decisive hain."
    },
    {
      code: "MAP-03", name: "Kalahari", tint: "rgba(255,194,75,.2)",
      tags: ["2×2 km", "50 players", "Open"],
      rows: [
        ["Terrain", "Desert · canyons"],
        ["Hot drops", "Command Post, Refinery"],
        ["Loot", "Scattered mid-tier"],
        ["Rotations", "Long sightlines"]
      ],
      note: "Open ground pe rotation sabse risky. Smoke/vehicle usage aur ridge control hi jeet ka rasta hai."
    },
    {
      code: "MAP-04", name: "Alpine", tint: "rgba(165,180,252,.2)",
      tags: ["Snow", "Vertical", "Mid-range"],
      rows: [
        ["Terrain", "Snow peaks · cable cars"],
        ["Hot drops", "Observatory, Peak"],
        ["Loot", "Sparse, high-value zones"],
        ["Rotations", "High ground first"]
      ],
      note: "Height advantage sab kuch hai. Snow footsteps duur tak sunai dete hain — audio awareness must."
    },
    {
      code: "MAP-05", name: "Nexterra", tint: "rgba(196,181,253,.2)",
      tags: ["Futuristic", "Multi-level", "Rotate heavy"],
      rows: [
        ["Terrain", "Sci-fi city · anti-grav lifts"],
        ["Hot drops", "Central spire, docks"],
        ["Loot", "Multi-floor buildings"],
        ["Rotations", "Vertical + tunnels"]
      ],
      note: "Vertical fights zyada — ziplines aur lifts se third-party aata hai. Entry se pehle angle clear karo."
    },
    {
      code: "MAP-06", name: "Training Ground", tint: "rgba(148,163,184,.2)",
      tags: ["Practice", "Aim range", "No stakes"],
      rows: [
        ["Terrain", "Range · obstacle course"],
        ["Hot drops", "—"],
        ["Loot", "Full access"],
        ["Rotations", "Drills only"]
      ],
      note: "Daily 15 minute: recoil drill, flick drill, gloo-wall + peek combo. Warm-up ke bina ranked nahi."
    }
  ];

  const AGENTS = [
    { name: "Alok", role: "Support", skill: "Movement speed aura + heal over time — squad pushes ke liye.", diff: 2 },
    { name: "Kelly", role: "Rusher", skill: "Sprint speed boost — early rotation aur re-position.", diff: 1 },
    { name: "Chrono", role: "Defender", skill: "Deployable shield bubble — open ground pe safe rotate.", diff: 3 },
    { name: "Wukong", role: "Rusher", skill: "Bush/rock disguise — recon ke liye short camouflage.", diff: 2 },
    { name: "Hayato", role: "Rusher", skill: "Close-range armour pen + HP trade playstyle.", diff: 3 },
    { name: "Dimitri", role: "Support", skill: "Self-revive field — clutch ke liye ek extra life.", diff: 2 },
    { name: "K (Captain Booyah)", role: "Support", skill: "Squad-wide EP regen aura — sustain comps ke liye.", diff: 2 },
    { name: "Skyler", role: "Support", skill: "Gloo-wall break + heal burst — agla push kholta hai.", diff: 3 },
    { name: "Xayne", role: "Rusher", skill: "Temp HP + gloo damage — direct entry fragger.", diff: 3 },
    { name: "Wiro", role: "Support", skill: "Teammate revive assist — support-heavy lineups.", diff: 2 },
    { name: "Moco", role: "Intel", skill: "Enemy tagging — rotation se pehle info.", diff: 2 },
    { name: "Nairi", role: "Defender", skill: "Repair/heal on structures — hold setups ke liye.", diff: 2 },
    { name: "Thiva", role: "Support", skill: "Faster revive + recovery — late circle saves.", diff: 2 },
    { name: "Kenta", role: "Defender", skill: "Damage reduction front-line — entry soak karta hai.", diff: 3 },
    { name: "Homer", role: "Intel", skill: "Drone-based scouting — building clear karna easy.", diff: 2 },
    { name: "Iris", role: "Sniper", skill: "Long-range mark + vision — sniper comps ke liye.", diff: 3 },
    { name: "Laura", role: "Sniper", skill: "Scoped precision bonus — headshot consistency.", diff: 3 },
    { name: "Nikita", role: "Rusher", skill: "Faster reload + SMG handling — close-quarter duels.", diff: 2 }
  ];

  const WEAPONS = [
    { id: "ar", label: "AR", name: "Assault Rifle", sub: "All-round primary",
      desc: "Mid-range ka default pick. Tap-fire se long range bhi manageable, spray close range ke liye.",
      bars: [["Damage", 72], ["Fire rate", 66], ["Range", 74], ["Control", 62], ["Mobility", 58]] },
    { id: "smg", label: "SMG", name: "Sub-machine Gun", sub: "Close-quarter rusher",
      desc: "Highest fire rate class. Building clear aur rush ke liye best, long range me damage drop.",
      bars: [["Damage", 52], ["Fire rate", 92], ["Range", 42], ["Control", 68], ["Mobility", 88]] },
    { id: "sniper", label: "Sniper", name: "Sniper Rifle", sub: "One-shot potential",
      desc: "High ground ka boss. Miss ki cost bahut high — position aur timing pehle, shot baad me.",
      bars: [["Damage", 97], ["Fire rate", 26], ["Range", 96], ["Control", 44], ["Mobility", 34]] },
    { id: "shotgun", label: "Shotgun", name: "Shotgun", sub: "Doorway denier",
      desc: "Entry ke waqt one-tap threat. Stairs aur tight corridors me defensive value sabse zyada.",
      bars: [["Damage", 90], ["Fire rate", 48], ["Range", 30], ["Control", 40], ["Mobility", 62]] },
    { id: "dmr", label: "DMR", name: "Marksman Rifle", sub: "Mid-long control",
      desc: "Poke damage se squad ko push ke liye taiyar karta hai. Ammo economy ka dhyan rakho.",
      bars: [["Damage", 78], ["Fire rate", 54], ["Range", 86], ["Control", 58], ["Mobility", 52]] },
    { id: "lmg", label: "LMG", name: "Light Machine Gun", sub: "Suppression",
      desc: "Bade magazine se vehicle aur squad suppress karo. Reload punish karta hai — cover se fire.",
      bars: [["Damage", 64], ["Fire rate", 70], ["Range", 66], ["Control", 34], ["Mobility", 30]] }
  ];

  const CALENDAR = [
    { when: "Week 1", what: "Open qualifiers", sub: "Registration + custom room lobbies", status: "done" },
    { when: "Week 3", what: "Group stage", sub: "Points table · 6 matches", status: "done" },
    { when: "Week 5", what: "Playoffs", sub: "Top 12 squads", status: "live" },
    { when: "Week 6", what: "Grand finals", sub: "Single lobby · 8 squads", status: "soon" },
    { when: "Week 7", what: "Season reset", sub: "Ranked rewards + new meta", status: "soon" }
  ];

  /* =========================================================
     2. UTILITIES
     ========================================================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) =>
    String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = (n) => n.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase() || "?";

  const toastEl = $("#toast");
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  /* =========================================================
     3. LOADOUT (pins) — localStorage
     ========================================================= */
  const LKEY = "ffmax.loadout.v1";
  let loadout = readLoadout();

  function readLoadout() {
    try {
      const arr = JSON.parse(localStorage.getItem(LKEY) || "[]");
      return Array.isArray(arr) ? arr.filter((x) => x && x.type && x.name).slice(0, 12) : [];
    } catch {
      return [];
    }
  }
  function saveLoadout() {
    try {
      localStorage.setItem(LKEY, JSON.stringify(loadout));
    } catch {
      /* private mode / quota — UI still works in-memory */
    }
    renderLoadout();
  }
  const isPinned = (type, name) => loadout.some((x) => x.type === type && x.name === name);

  function togglePin(type, name) {
    if (isPinned(type, name)) {
      loadout = loadout.filter((x) => !(x.type === type && x.name === name));
      toast(`${name} unpinned`);
    } else {
      if (loadout.length >= 12) return toast("Loadout full (12 items) — pehle kuch remove karo.");
      loadout.push({ type, name });
      toast(`${name} pinned to loadout`);
    }
    saveLoadout();
    syncPins();
  }

  function renderLoadout() {
    const list = $("#loadoutList");
    list.innerHTML = loadout.length
      ? loadout
          .map(
            (x, i) => `
        <div class="lo-item">
          <div><small>${esc(x.type)}</small><b>${esc(x.name)}</b></div>
          <button data-unpin="${i}" aria-label="Remove ${esc(x.name)} from loadout">✕</button>
        </div>`
          )
          .join("")
      : `<p class="lo-empty">Abhi kuch pin nahi hai.<br />Maps, agents ya weapons me <b>★</b> dabao.</p>`;
    $("#loadoutCount").textContent = String(loadout.length);
  }

  function syncPins() {
    $$("[data-pin-type]").forEach((btn) => {
      const on = isPinned(btn.dataset.pinType, btn.dataset.pinName);
      btn.classList.toggle("is-pinned", on);
      btn.setAttribute("aria-pressed", String(on));
      const icon = btn.querySelector(".pin-ico");
      if (icon) icon.textContent = on ? "★" : "☆";
    });
  }

  /* =========================================================
     4. MAPS
     ========================================================= */
  function renderMaps() {
    $("#mapGrid").innerHTML = MAPS.map(
      (m, i) => `
      <div class="map-card" role="button" tabindex="0" aria-expanded="false" data-map="${i}" style="--map-tint:${m.tint}">
        <div class="map-top">
          <span class="map-code">${esc(m.code)}</span>
          <span class="map-dot" aria-hidden="true"></span>
        </div>
        <h3 class="map-name">${esc(m.name)}</h3>
        <div class="map-meta">${m.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>

        <div class="map-detail">
          <div>
            <div class="map-detail-inner">
              ${m.rows.map(([k, v]) => `<div class="map-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}
              <p class="map-note">${esc(m.note)}</p>
              <div class="agent-foot" style="margin-top:6px">
                <button class="pin" type="button" data-pin-type="Map" data-pin-name="${esc(m.name)}" aria-pressed="false">
                  <span class="pin-ico">☆</span> Pin map
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>`
    ).join("");
  }

  $("#mapGrid").addEventListener("click", (e) => {
    const pin = e.target.closest("[data-pin-type]");
    if (pin) {
      e.stopPropagation();
      e.preventDefault();
      togglePin(pin.dataset.pinType, pin.dataset.pinName);
      return;
    }
    const card = e.target.closest(".map-card");
    if (!card) return;
    const open = card.getAttribute("aria-expanded") === "true";
    card.setAttribute("aria-expanded", String(!open));
  });
  $("#mapGrid").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const pin = e.target.closest("[data-pin-type]");
    if (pin) {
      e.preventDefault();
      e.stopPropagation();
      togglePin(pin.dataset.pinType, pin.dataset.pinName);
      return;
    }
    const card = e.target.closest(".map-card");
    if (card && e.target === card) {
      e.preventDefault();
      card.setAttribute("aria-expanded", String(card.getAttribute("aria-expanded") !== "true"));
    }
  });

  /* =========================================================
     5. AGENTS
     ========================================================= */
  const agentState = { role: "All", q: "" };

  function renderAgents() {
    const q = agentState.q.trim().toLowerCase();
    const list = AGENTS.filter(
      (a) => (agentState.role === "All" || a.role === agentState.role) && (!q || a.name.toLowerCase().includes(q))
    );

    $("#agentGrid").innerHTML = list
      .map(
        (a) => `
      <article class="agent role-${esc(a.role)}">
        <div class="agent-top">
          <span class="agent-avatar" aria-hidden="true">${esc(initials(a.name))}</span>
          <div class="agent-name">
            <h3 title="${esc(a.name)}">${esc(a.name)}</h3>
            <p>${esc(a.role)}</p>
          </div>
          <span class="agent-role">${esc(a.role)}</span>
        </div>
        <p class="agent-skill"><b>Ability</b>${esc(a.skill)}</p>
        <div class="agent-foot">
          <button class="pin" type="button" data-pin-type="Agent" data-pin-name="${esc(a.name)}" aria-pressed="false">
            <span class="pin-ico">☆</span> Pin
          </button>
          <span class="agent-diff" title="Skill floor: ${a.diff}/5" aria-label="Skill floor ${a.diff} of 5">
            ${[1, 2, 3, 4, 5].map((n) => `<i class="diff-bar${n <= a.diff ? " on" : ""}"></i>`).join("")}
          </span>
        </div>
      </article>`
      )
      .join("");

    $("#agentEmpty").hidden = list.length > 0;
    syncPins();
  }

  $("#agentFilters").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-role]");
    if (!chip) return;
    agentState.role = chip.dataset.role;
    $$("#agentFilters .chip").forEach((c) => c.classList.toggle("is-active", c === chip));
    renderAgents();
  });
  $("#agentSearch").addEventListener("input", (e) => {
    agentState.q = e.target.value;
    renderAgents();
  });
  $("#agentGrid").addEventListener("click", (e) => {
    const pin = e.target.closest("[data-pin-type]");
    if (pin) togglePin(pin.dataset.pinType, pin.dataset.pinName);
  });

  /* =========================================================
     6. WEAPONS
     ========================================================= */
  let activeWeapon = WEAPONS[0].id;

  function renderWeaponTabs() {
    $("#wcTabs").innerHTML = WEAPONS.map(
      (w) => `<button class="wc-tab${w.id === activeWeapon ? " is-active" : ""}" role="tab"
        aria-selected="${w.id === activeWeapon}" data-wc="${esc(w.id)}">${esc(w.label)}</button>`
    ).join("");
  }

  function renderWeapon() {
    const w = WEAPONS.find((x) => x.id === activeWeapon) ?? WEAPONS[0];
    $("#wcBody").innerHTML = `
      <div class="wc-title"><h3>${esc(w.name)}</h3><span>${esc(w.sub)}</span></div>
      <p class="wc-desc">${esc(w.desc)}</p>
      <div class="bars">
        ${w.bars
          .map(
            ([label, val]) => `
          <div class="bar-row">
            <span>${esc(label)}</span>
            <div class="bar-track"><i class="bar-fill" style="width:${val}%"></i></div>
            <b>${val}</b>
          </div>`
          )
          .join("")}
      </div>
      <div class="wc-loadout">
        <button class="pin" type="button" data-pin-type="Weapon" data-pin-name="${esc(w.name)}" aria-pressed="false">
          <span class="pin-ico">☆</span> Pin weapon
        </button>
        <span class="muted">Bars = class archetype, patch ke saath badalte hain.</span>
      </div>`;
    syncPins();
  }

  $("#wcTabs").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-wc]");
    if (!tab) return;
    activeWeapon = tab.dataset.wc;
    renderWeaponTabs();
    renderWeapon();
  });
  $("#wcBody").addEventListener("click", (e) => {
    const pin = e.target.closest("[data-pin-type]");
    if (pin) togglePin(pin.dataset.pinType, pin.dataset.pinName);
  });

  /* =========================================================
     7. CALENDAR
     ========================================================= */
  function renderCalendar() {
    $("#calList").innerHTML = CALENDAR.map(
      (c) => `
      <li>
        <span class="when">${esc(c.when)}</span>
        <span class="what"><b>${esc(c.what)}</b><span>${esc(c.sub)}</span></span>
        <span class="st ${esc(c.status)}">${esc(c.status)}</span>
      </li>`
    ).join("");
  }

  /* =========================================================
     8. REDEEM CODE — format check only
     ========================================================= */
  const CODE_RE = /^[A-Z0-9][A-Z0-9-]{6,18}[A-Z0-9]$/;

  function checkCode() {
    const input = $("#codeInput");
    const out = $("#codeOut");
    const raw = input.value.trim().toUpperCase();
    out.hidden = false;
    out.classList.remove("good", "bad", "warn");

    if (!raw) {
      out.classList.add("warn");
      out.textContent = "Pehle koi code type karo.";
      return;
    }
    if (/\s/.test(raw)) {
      out.classList.add("bad");
      out.textContent = "Code me space nahi hona chahiye — dashes (-) use karo.";
      return;
    }
    if (raw.length < 8) {
      out.classList.add("bad");
      out.textContent = `Bahut chhota (${raw.length} chars). Typical codes 8–20 characters ke hote hain.`;
      return;
    }
    if (raw.length > 20) {
      out.classList.add("bad");
      out.textContent = `Bahut lamba (${raw.length} chars). 20 se zyada characters usually invalid hote hain.`;
      return;
    }
    if (!CODE_RE.test(raw)) {
      out.classList.add("bad");
      out.textContent = "Invalid characters ya dash placement — sirf A–Z, 0–9 aur beech me dash allowed hai.";
      return;
    }
    out.classList.add("good");
    out.textContent = `Format sahi lagta hai ✓ — ${raw}. Ab ise sirf official redeem page pe try karo. Yeh tool code verify ya redeem nahi karta.`;
  }

  $("#checkCode").addEventListener("click", checkCode);
  $("#codeInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") checkCode();
  });
  $("#clearCode").addEventListener("click", () => {
    $("#codeInput").value = "";
    const out = $("#codeOut");
    out.hidden = true;
    out.textContent = "";
    out.classList.remove("good", "bad", "warn");
    $("#codeInput").focus();
  });

  /* =========================================================
     9. DRAWER
     ========================================================= */
  const drawer = $("#drawer");
  let lastFocus = null;

  function openDrawer() {
    lastFocus = document.activeElement;
    drawer.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => drawer.querySelector(".x")?.focus(), 50);
  }
  function closeDrawer() {
    drawer.hidden = true;
    document.body.style.overflow = "";
    lastFocus?.focus?.();
  }

  $("#loadoutBtn").addEventListener("click", openDrawer);
  drawer.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return closeDrawer();
    const unpin = e.target.closest("[data-unpin]");
    if (unpin) {
      loadout.splice(Number(unpin.dataset.unpin), 1);
      saveLoadout();
      syncPins();
    }
  });
  $("#clearLoadout").addEventListener("click", () => {
    if (!loadout.length) return toast("Loadout already empty hai.");
    loadout = [];
    saveLoadout();
    syncPins();
    toast("Loadout cleared");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!drawer.hidden) closeDrawer();
  });

  /* =========================================================
     10. NAV / REVEAL / COUNTERS
     ========================================================= */
  const nav = $("#nav");
  const navLinks = $("#navLinks");
  const burger = $("#hamburger");

  const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 6);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  burger.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
  });
  navLinks.addEventListener("click", (e) => {
    if (e.target.matches("a")) {
      navLinks.classList.remove("open");
      burger.setAttribute("aria-expanded", "false");
    }
  });

  // Scroll spy
  const sections = ["maps", "agents", "weapons", "esports", "redeem", "sources"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if ("IntersectionObserver" in window && sections.length) {
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          $$("[data-nav]").forEach((a) =>
            a.classList.toggle("is-active", a.getAttribute("href") === `#${en.target.id}`)
          );
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach((s) => spy.observe(s));
  }

  function setupReveal() {
    const items = $$(".section-head, .map-card, .agent, .weapon-panel, .weapon-visual, .esports-media, .path, .calendar, .redeem-card, .safety, .source, .disclaimer");
    if (!("IntersectionObserver" in window)) return;
    items.forEach((el) => el.classList.add("reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en, i) => {
          if (!en.isIntersecting) return;
          setTimeout(() => en.target.classList.add("in"), Math.min(i * 60, 300));
          io.unobserve(en.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
    );
    items.forEach((el) => io.observe(el));
  }

  function setupCounters() {
    const nodes = $$("[data-count]");
    const run = (el) => {
      const target = Number(el.dataset.count) || 0;
      const dur = 1000;
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (!("IntersectionObserver" in window)) return nodes.forEach(run);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            run(en.target);
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    nodes.forEach((n) => io.observe(n));
  }

  /* =========================================================
     11. INIT
     ========================================================= */
  $("#year").textContent = String(new Date().getFullYear());
  renderMaps();
  renderAgents();
  renderWeaponTabs();
  renderWeapon();
  renderCalendar();
  renderLoadout();
  syncPins();
  setupReveal();
  setupCounters();
})();
