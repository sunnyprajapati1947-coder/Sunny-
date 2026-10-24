/* ==========================================================================
   MEN'S WEAR — the door (real accounts)
   ---------------------------------------------------------------------------
   Sign-up and sign-in run through Supabase Auth: passwords are hashed and
   verified server-side (never stored or compared in the browser), sessions are
   short-lived JWTs with rotating refresh tokens, and every row in
   public.profiles is protected by row-level security so an account can only
   ever read or write its own name, number and size.

   What this file does NOT do: no plaintext password storage, no password in
   localStorage, no "logged in" flag the browser could flip by hand. The only
   things kept on the device are the Supabase session tokens the library
   rotates itself.

   window.__MW_YOU is still published for shop.js so WhatsApp messages leave
   addressed, but it is now filled from the signed-in profile — not from
   anything the visitor could edit in devtools and pass off as an account.
   ========================================================================== */
(function () {
  "use strict";

  /* Publishable (anon) key: public by design, every request it makes is
     filtered by row-level security on the database. */
  var SUPABASE_URL = "https://zneqxctfhwehiuzibjnc.supabase.co";
  var SUPABASE_KEY = "sb_publishable_V8Z3In2Z0a8Ids7iwMVG2A_ouLL98F9";

  var SKIP = "mw:guest";
  var LOCK = "mw:lock";
  var MIN_PASS = 10;
  var COMMON = [
    "password", "password1", "password12", "password123", "passw0rd", "1234567890",
    "12345678910", "qwertyuiop", "iloveyou1", "letmein123", "welcome123", "admin12345",
    "shop1234567", "menswear12", "nawada12345", "india123456", "aaron431xxx",
  ];

  var gate = document.getElementById("enter");
  var form = document.getElementById("enterForm");
  var emailIn = document.getElementById("enterEmail");
  var passIn = document.getElementById("enterPass");
  var nameIn = document.getElementById("enterName");
  var phoneIn = document.getElementById("enterPhone");
  var sizes = document.getElementById("enterSizes");
  var err = document.getElementById("enterErr");
  var ok = document.getElementById("enterOk");
  var goBtn = document.getElementById("enterGo");
  var forgotBtn = document.getElementById("enterForgot");
  var signOutBtn = document.getElementById("enterSignOut");
  var skipBtn = document.getElementById("enterSkip");
  var closeBtn = document.getElementById("enterClose");
  var tabs = document.querySelectorAll("[data-auth-mode]");
  var signupOnly = document.querySelectorAll("[data-signup-only]");
  var meter = document.getElementById("enterMeter");
  var securityNote = document.getElementById("enterSecurity");
  var tabsBar = document.getElementById("enterTabs");
  var passField = document.getElementById("enterPassField");
  var youBtn = document.getElementById("youBtn");
  var initialsEl = document.getElementById("youInitials");

  var mode = "signup";
  var picked = "";
  var busy = false;
  var you = null;
  var client = null;

  /* ---------------------------------------------------------------- helpers */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function show(node, visible) {
    if (node) node.hidden = !visible;
  }

  function setError(msg) {
    show(ok, false);
    if (!err) return;
    err.textContent = msg || "";
    err.hidden = !msg;
  }

  function setOk(msg) {
    show(err, false);
    if (!ok) return;
    ok.textContent = msg || "";
    ok.hidden = !msg;
  }

  function lockWait() {
    try {
      var until = +sessionStorage.getItem(LOCK) || 0;
      return Math.max(0, until - Date.now());
    } catch (e) {
      return 0;
    }
  }

  function noteFailure() {
    try {
      var n = (+sessionStorage.getItem("mw:fails") || 0) + 1;
      sessionStorage.setItem("mw:fails", String(n));
      if (n >= 5) {
        sessionStorage.setItem(LOCK, String(Date.now() + 60000));
        sessionStorage.setItem("mw:fails", "0");
        return 60000;
      }
    } catch (e) {}
    return 0;
  }

  function clearFailures() {
    try {
      sessionStorage.removeItem("mw:fails");
      sessionStorage.removeItem(LOCK);
    } catch (e) {}
  }

  function cleanPhone(v) {
    var digits = String(v || "").replace(/\D/g, "");
    if (digits.length > 10 && digits.slice(0, 2) === "91") digits = digits.slice(-10);
    return /^[6-9]\d{9}$/.test(digits) ? digits : "";
  }

  function cleanName(v) {
    return String(v || "").trim().replace(/\s+/g, " ").slice(0, 80);
  }

  function emailLooksValid(v) {
    var s = String(v || "").trim();
    return s.length <= 160 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s);
  }

  /* Mirrors the server-side policy we enforce with Supabase; the real check
     that matters is that the server hashes and verifies the password. */
  function passwordProblem(pw, email) {
    if (pw.length < MIN_PASS) return "Use at least " + MIN_PASS + " characters for your password.";
    if (pw.length > 72) return "That password is too long — keep it under 72 characters.";
    if (!/[a-z]/.test(pw)) return "Add a lowercase letter to your password.";
    if (!/[A-Z]/.test(pw)) return "Add an uppercase letter to your password.";
    if (!/[0-9]/.test(pw)) return "Add a number to your password.";
    var low = pw.toLowerCase();
    for (var i = 0; i < COMMON.length; i += 1) {
      if (low.indexOf(COMMON[i]) !== -1) return "That password is too easy to guess. Try another.";
    }
    var local = String(email || "").split("@")[0].toLowerCase();
    if (local.length >= 4 && low.indexOf(local) !== -1) return "Don't put your email address in the password.";
    return "";
  }

  function strengthOf(pw) {
    var score = 0;
    if (pw.length >= MIN_PASS) score += 1;
    if (pw.length >= 14) score += 1;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
    if (/\d/.test(pw)) score += 1;
    if (/[^A-Za-z0-9]/.test(pw)) score += 1;
    return Math.min(4, score);
  }

  function paintMeter() {
    if (!meter || !passIn) return;
    var pw = passIn.value;
    if (!pw) {
      show(meter, false);
      meter.removeAttribute("data-score");
      return;
    }
    var score = strengthOf(pw);
    show(meter, true);
    meter.setAttribute("data-score", String(score));
    var label = ["Too short", "Weak", "Fair", "Strong", "Very strong"][score];
    var text = meter.querySelector("[data-meter-label]");
    if (text) text.textContent = label;
  }

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "MW";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function syncChip() {
    if (!youBtn) return;
    if (you && you.name) {
      youBtn.hidden = false;
      youBtn.setAttribute("aria-label", "Your account — " + you.name);
      if (initialsEl) initialsEl.textContent = initials(you.name);
    } else {
      youBtn.hidden = true;
    }
  }

  function publishYou(profile) {
    you = profile
      ? {
          name: profile.full_name || "",
          phone: profile.phone || "",
          size: profile.shirt_size || "",
          email: profile.email || "",
          at: Date.now(),
        }
      : null;
    window.__MW_YOU = you;
    syncChip();
    try {
      window.dispatchEvent(new CustomEvent("mw:you", { detail: you }));
    } catch (e) {}
  }

  /* ------------------------------------------------------------- gate paint */

  function paintMode() {
    var saving = !!you; /* signed in: the same form edits the saved details */
    Array.prototype.forEach.call(tabs, function (t) {
      var on = t.getAttribute("data-auth-mode") === mode;
      t.classList.toggle("is-on", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    show(tabsBar, !saving);
    Array.prototype.forEach.call(signupOnly, function (n) {
      show(n, saving || mode === "signup");
    });
    show(passField, !saving);
    show(meter, !saving && !!passIn && !!passIn.value);
    if (goBtn) {
      var label = saving ? "Save my details" : mode === "signup" ? "Create account" : "Sign in";
      goBtn.textContent = label + " ";
      var arrow = document.createElement("b");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "\u2192";
      goBtn.appendChild(arrow);
    }
    if (passIn) passIn.setAttribute("autocomplete", mode === "signup" ? "new-password" : "current-password");
    if (forgotBtn) show(forgotBtn, !saving && mode === "signin");
    if (emailIn) emailIn.readOnly = saving;
    if (securityNote) {
      securityNote.textContent = saving
        ? "Your details live in your account only — row-level security means no other visitor can read them."
        : mode === "signup"
          ? "Passwords are hashed by Supabase Auth — we never see or store them. Your details stay in your account, private to you."
          : "Signed in with a short-lived token that refreshes securely. Sign out any time on a shared phone.";
    }
  }

  function paintSizes() {
    if (!sizes) return;
    Array.prototype.forEach.call(sizes.querySelectorAll("button"), function (b) {
      var on = b.getAttribute("data-size") === picked;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function fillFromProfile() {
    if (nameIn) nameIn.value = (you && you.name) || "";
    if (phoneIn) phoneIn.value = (you && you.phone) || "";
    if (emailIn) emailIn.value = (you && you.email) || "";
    picked = (you && you.size) || "";
    paintSizes();
    if (passIn) passIn.value = "";
    paintMeter();
  }

  function openGate(initialMode) {
    if (!gate) return;
    mode = initialMode === "signin" ? "signin" : "signup";
    fillFromProfile();
    setError("");
    setOk("");
    show(signOutBtn, !!you);
    if (you) {
      mode = "signin";
      setOk("Signed in as " + you.email + ". Change anything below and save.");
    }
    paintMode();
    gate.hidden = false;
    document.body.classList.add("is-gated");
    requestAnimationFrame(function () {
      gate.classList.add("is-on");
    });
    window.setTimeout(function () {
      var target = you ? nameIn : emailIn;
      if (target && window.innerWidth > 720) target.focus();
    }, 420);
  }

  function closeGate(guest) {
    if (!gate) return;
    gate.classList.remove("is-on");
    document.body.classList.remove("is-gated");
    window.setTimeout(function () {
      gate.hidden = true;
    }, 320);
    if (guest) {
      try {
        sessionStorage.setItem(SKIP, "1");
      } catch (e) {}
    }
  }

  function skipped() {
    try {
      return sessionStorage.getItem(SKIP) === "1";
    } catch (e) {
      return false;
    }
  }

  /* ---------------------------------------------------------------- account */

  function mapAuthError(error, fallback) {
    var msg = String((error && error.message) || "").toLowerCase();
    if (msg.indexOf("invalid login") !== -1 || msg.indexOf("invalid credentials") !== -1) {
      return "Email or password is incorrect.";
    }
    if (msg.indexOf("already registered") !== -1 || msg.indexOf("already been registered") !== -1) {
      return "That email already has an account. Sign in instead.";
    }
    if (msg.indexOf("rate limit") !== -1 || msg.indexOf("too many") !== -1) {
      return "Too many attempts. Wait a minute and try again.";
    }
    if (msg.indexOf("email not confirmed") !== -1) {
      return "Confirm your email first — check your inbox.";
    }
    if (msg.indexOf("password") !== -1) {
      return "That password doesn't meet the requirements.";
    }
    if (msg.indexOf("fetch") !== -1 || msg.indexOf("network") !== -1) {
      return "Network problem — check your connection and try again.";
    }
    return fallback;
  }

  function loadProfile(session) {
    if (!session || !session.user) return Promise.resolve(null);
    var user = session.user;
    var meta = user.user_metadata || {};
    return client
      .from("profiles")
      .select("id, full_name, phone, shirt_size")
      .eq("id", user.id)
      .maybeSingle()
      .then(function (res) {
        var row = res && res.data;
        if (row) {
          return {
            full_name: row.full_name,
            phone: row.phone || "",
            shirt_size: row.shirt_size || "",
            email: user.email,
          };
        }
        /* no row yet (older account): fall back to sign-up metadata */
        return {
          full_name: meta.full_name || "Customer",
          phone: meta.phone || "",
          shirt_size: meta.shirt_size || "",
          email: user.email,
        };
      });
  }

  function saveProfile(session, fields) {
    var user = session.user;
    return client
      .from("profiles")
      .upsert(
        {
          id: user.id,
          full_name: fields.full_name,
          phone: fields.phone || null,
          shirt_size: fields.shirt_size || null,
        },
        { onConflict: "id" }
      )
      .select("id, full_name, phone, shirt_size")
      .maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        var row = res.data || {};
        return {
          full_name: row.full_name || fields.full_name,
          phone: row.phone || "",
          shirt_size: row.shirt_size || "",
          email: user.email,
        };
      });
  }

  /* ------------------------------------------------------------------- flow */

  function submit(event) {
    if (event) event.preventDefault();
    if (busy || !client) return;

    var email = (emailIn ? emailIn.value : "").trim().toLowerCase();
    var pass = passIn ? passIn.value : "";
    var wait = lockWait();

    if (wait > 0) {
      setError("Too many attempts. Try again in " + Math.ceil(wait / 1000) + " seconds.");
      return;
    }
    if (!emailLooksValid(email)) {
      setError("Enter a valid email address.");
      if (emailIn) emailIn.focus();
      return;
    }

    if (you) {
      /* signed in: this form saves profile details */
      var name = cleanName(nameIn ? nameIn.value : "");
      if (name.length < 2) {
        setError("Please add your name.");
        if (nameIn) nameIn.focus();
        return;
      }
      busy = true;
      goBtn.disabled = true;
      setError("");
      return client.auth
        .getSession()
        .then(function (res) {
          var session = res.data && res.data.session;
          if (!session) throw new Error("Not signed in");
          return saveProfile(session, {
            full_name: name,
            phone: cleanPhone(phoneIn ? phoneIn.value : ""),
            shirt_size: picked,
          });
        })
        .then(function (profile) {
          publishYou(profile);
          setOk("Saved. Your next WhatsApp message will leave addressed.");
          if (typeof window.__mwToast === "function") {
            window.__mwToast("Saved, " + String(profile.full_name).split(" ")[0]);
          }
          window.setTimeout(function () {
            closeGate(false);
          }, 500);
        })
        .catch(function (e) {
          setError(mapAuthError(e, "Could not save your details. Try again."));
        })
        .then(function () {
          busy = false;
          goBtn.disabled = false;
        });
    }

    if (mode === "signup") {
      var problem = passwordProblem(pass, email);
      var fullName = cleanName(nameIn ? nameIn.value : "");
      if (fullName.length < 2) {
        setError("Please add your name.");
        if (nameIn) nameIn.focus();
        return;
      }
      if (problem) {
        setError(problem);
        if (passIn) passIn.focus();
        return;
      }
      busy = true;
      goBtn.disabled = true;
      setError("");
      return client.auth
        .signUp({
          email: email,
          password: pass,
          options: {
            data: {
              full_name: fullName,
              phone: cleanPhone(phoneIn ? phoneIn.value : ""),
              shirt_size: picked,
            },
          },
        })
        .then(function (res) {
          if (res.error) throw res.error;
          if (!res.data || !res.data.session) {
            /* project has email confirmation on: no session yet */
            setOk("Account created. Check your email to confirm, then sign in.");
            mode = "signin";
            paintMode();
            return null;
          }
          clearFailures();
          return loadProfile(res.data.session).then(function (profile) {
            publishYou(profile);
            if (typeof window.__mwToast === "function") {
              window.__mwToast("Welcome, " + String(profile.full_name).split(" ")[0] + " — the drop is open");
            }
            window.setTimeout(function () {
              closeGate(false);
            }, 400);
          });
        })
        .catch(function (e) {
          setError(mapAuthError(e, "Could not create the account. Try again."));
        })
        .then(function () {
          busy = false;
          goBtn.disabled = false;
        });
    }

    if (!pass) {
      setError("Enter your password.");
      if (passIn) passIn.focus();
      return;
    }
    busy = true;
    goBtn.disabled = true;
    setError("");
    return client.auth
      .signInWithPassword({ email: email, password: pass })
      .then(function (res) {
        if (res.error) throw res.error;
        clearFailures();
        return loadProfile(res.data.session).then(function (profile) {
          publishYou(profile);
          if (typeof window.__mwToast === "function") {
            window.__mwToast("Welcome back, " + String(profile.full_name).split(" ")[0]);
          }
          window.setTimeout(function () {
            closeGate(false);
          }, 400);
        });
      })
      .catch(function (e) {
        var waitMs = noteFailure();
        setError(
          waitMs
            ? "Too many attempts. Try again in a minute."
            : mapAuthError(e, "Email or password is incorrect.")
        );
      })
      .then(function () {
        busy = false;
        goBtn.disabled = false;
      });
  }

  function forgot() {
    var email = (emailIn ? emailIn.value : "").trim().toLowerCase();
    if (!emailLooksValid(email)) {
      setError("Enter your email first, then tap reset.");
      if (emailIn) emailIn.focus();
      return;
    }
    setError("");
    client.auth
      .resetPasswordForEmail(email, { redirectTo: location.origin + "/shop/" })
      .then(function () {
        /* same message whether or not the account exists: no user enumeration */
        setOk("If that email has an account, a reset link is on its way.");
      })
      .catch(function () {
        setOk("If that email has an account, a reset link is on its way.");
      });
  }

  function signOut() {
    client.auth.signOut().then(function () {
      publishYou(null);
      try {
        sessionStorage.removeItem(SKIP);
      } catch (e) {}
      mode = "signup";
      fillFromProfile();
      show(signOutBtn, false);
      paintMode();
      setOk("Signed out on this device.");
    });
  }

  /* ------------------------------------------------------------------- boot */

  function wire() {
    if (form) form.addEventListener("submit", submit);
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener("click", function () {
        mode = t.getAttribute("data-auth-mode");
        setError("");
        setOk("");
        paintMode();
      });
    });
    if (sizes) {
      sizes.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-size]");
        if (!b) return;
        picked = b.getAttribute("data-size");
        paintSizes();
      });
    }
    if (passIn) passIn.addEventListener("input", paintMeter);
    if (forgotBtn) forgotBtn.addEventListener("click", forgot);
    if (signOutBtn) signOutBtn.addEventListener("click", signOut);
    if (skipBtn) skipBtn.addEventListener("click", function () { closeGate(true); });
    if (closeBtn) closeBtn.addEventListener("click", function () { closeGate(true); });
    if (gate) {
      gate.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeGate(true);
      });
    }
    if (youBtn) youBtn.addEventListener("click", function () { openGate("signin"); });
  }

  function start() {
    wire();
    paintMode();
    paintSizes();

    if (typeof window.supabase === "undefined" || !window.supabase.createClient) {
      setError("Sign-in is unavailable right now (security library blocked). You can still browse.");
      if (goBtn) goBtn.disabled = true;
      openGate("signup");
      return;
    }

    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        storageKey: "mw-auth",
      },
    });

    client.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) {
        publishYou(null);
        if (!skipped()) window.setTimeout(function () { openGate("signup"); }, 650);
        return null;
      }
      return loadProfile(session).then(function (profile) {
        publishYou(profile);
        if (typeof window.__mwToast === "function" && profile) {
          window.__mwToast("Welcome back, " + String(profile.full_name).split(" ")[0]);
        }
      });
    }).catch(function () {
      publishYou(null);
      if (!skipped()) window.setTimeout(function () { openGate("signup"); }, 650);
    });

    client.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_OUT") {
        publishYou(null);
        openGate("signin");
        return;
      }
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        loadProfile(session).then(function (profile) {
          if (profile) publishYou(profile);
        });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
