/*! Men's Wear — Nawada · app shell
 *  Boots the storefront inside the installed-app shell:
 *  fetches the page from the CDN, transplants it, keeps PWA plumbing alive,
 *  handles the install prompt + offline notice.
 *  Served from the CDN, hosted by index.html on nawada-menswear-shop.vercel.app
 */
(function () {
  window.__mwShellLoaded = true;

  var REPO = "sunnyprajapati1947-coder/Sunny-";
  var JD = "https://cdn.jsdelivr.net/gh/" + REPO + "@app-v20/mens-wear/live/index.html";
  var ST = "https://cdn.statically.io/gh/" + REPO + "app-v2/mens-wear/live/index.html";
  var BASE_JD = "https://cdn.jsdelivr.net/gh/" + REPO + "@app-v20/mens-wear/";
  var BASE_ST = "https://cdn.statically.io/gh/" + REPO + "app-v2/mens-wear/";
  var MANIFEST = BASE_JD + "manifest.json";
  var APPLE_ICON = BASE_JD + "assets/img/app/apple-touch-icon.png";
  var SOURCES = [[JD, BASE_JD], [ST, BASE_ST]];
  /* the storefront ships these files, in this order (accounts last, after
     shop.js has defined the toast helper) */
  var PAGE_SCRIPTS = [
    "assets/js/main.js",
    "assets/js/drop-data.js",
    "assets/js/shop.js",
    "assets/js/drop.js",
    "assets/js/vendor/supabase.js",
    "assets/js/auth-gate.js",
    "assets/js/orders.js",
    "assets/js/assistant.js",
    "assets/js/fitroom.js",
    "assets/js/owner.js"
  ];

  var boot = document.getElementById("boot");

  function fail() {
    if (!boot) return;
    boot.innerHTML =
      '<div><p>The store could not load.</p><p><a href="' + JD + '">Open the page directly</a></p></div>';
  }

  /* ------------------------------------------------------------- app styles */
  var APP_CSS =
    "#mw-install{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translate(-50%,20px);z-index:7000;display:flex;align-items:center;gap:12px;padding:10px 12px 10px 16px;border-radius:100px;background:rgba(22,22,15,.96);border:1px solid rgba(200,242,77,.6);box-shadow:0 22px 50px -22px #000;opacity:0;pointer-events:none;transition:opacity .35s ease,transform .45s cubic-bezier(.16,1,.3,1);max-width:calc(100vw - 24px)}" +
    "#mw-install.is-on{opacity:1;pointer-events:auto;transform:translate(-50%,0)}" +
    "#mw-install .t{font-family:system-ui,sans-serif;font-size:.72rem;line-height:1.35;color:#f7f2e8}" +
    "#mw-install .t b{display:block;font-size:.78rem;font-weight:600}" +
    "#mw-install .t span{color:rgba(247,242,232,.55)}" +
    "#mw-install button{font-family:system-ui,sans-serif;font-size:.66rem;letter-spacing:.06em;border:0;border-radius:100px;padding:9px 14px;white-space:nowrap;cursor:pointer}" +
    "#mw-install .go{background:#c8f24d;color:#16160f;font-weight:700}" +
    "#mw-install .no{background:transparent;color:rgba(247,242,232,.5)}" +
    "@media (display-mode:standalone){#mw-install{display:none!important}}";

  function appHead() {
    function add(tag, attrs) {
      var el = document.createElement(tag);
      Object.keys(attrs).forEach(function (k) {
        el.setAttribute(k, attrs[k]);
      });
      document.head.appendChild(el);
      return el;
    }
    if (!document.querySelector('link[rel="manifest"]')) {
      add("link", { rel: "manifest", href: MANIFEST, crossorigin: "" });
    }
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      add("link", { rel: "apple-touch-icon", href: APPLE_ICON });
    }
    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      add("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
    }
    if (!document.querySelector('meta[name="apple-mobile-web-app-title"]')) {
      add("meta", { name: "apple-mobile-web-app-title", content: "Mens Wear" });
    }
    if (!document.querySelector('meta[name="theme-color"]')) {
      add("meta", { name: "theme-color", content: "#f2eee3" });
    }
    if (!document.querySelector('meta[name="viewport"]')) {
      add("meta", { name: "viewport", content: "width=device-width,initial-scale=1,viewport-fit=cover" });
    }
    if (!document.getElementById("mw-app-style")) {
      var st = add("style", { id: "mw-app-style" });
      st.textContent = APP_CSS;
    }
  }

  /* ---------------------------------------------------------- service worker */
  if (navigator.serviceWorker && typeof navigator.serviceWorker.register === "function") {
    window.addEventListener("load", function () {
      try {
        navigator.serviceWorker.register("/sw.js").catch(function () {});
      } catch (e) {}
    });
  }

  /* -------------------------------------------------------------- install UI */
  var deferred = null;
  var KEY = "mw-install-hide";

  function hidden() {
    try {
      return Date.now() < (+localStorage.getItem(KEY) || 0);
    } catch (e) {
      return false;
    }
  }

  function dismiss(days) {
    try {
      localStorage.setItem(KEY, String(Date.now() + days * 864e5));
    } catch (e) {}
    var el = document.getElementById("mw-install");
    if (el) el.classList.remove("is-on");
  }

  function standalone() {
    return (
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true
    );
  }

  function showInstall(mode) {
    if (standalone() || hidden() || document.getElementById("mw-install")) return;
    var el = document.createElement("div");
    el.id = "mw-install";
    el.innerHTML =
      '<div class="t"><b>Install the app</b><span>' +
      (mode === "ios"
        ? "Tap Share, then Add to Home Screen"
        : "It lands on your home screen and works offline") +
      "</span></div>" +
      (mode === "ios" ? "" : '<button class="go" type="button">Install</button>') +
      '<button class="no" type="button" aria-label="Baad mein">x</button>';
    document.body.appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add("is-on");
    });

    var go = el.querySelector(".go");
    if (go) {
      go.addEventListener("click", function () {
        if (!deferred || typeof deferred.prompt !== "function") {
          dismiss(3);
          return;
        }
        try {
          deferred.prompt();
        } catch (e) {
          dismiss(3);
          return;
        }
        var choice = deferred.userChoice;
        if (choice && typeof choice.then === "function") {
          choice.then(function (res) {
            dismiss(res && res.outcome === "accepted" ? 365 : 7);
            deferred = null;
          });
        } else {
          deferred = null;
        }
      });
    }
    el.querySelector(".no").addEventListener("click", function () {
      dismiss(14);
    });
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    setTimeout(function () {
      showInstall("prompt");
    }, 6000);
  });
  window.addEventListener("appinstalled", function () {
    dismiss(3650);
  });

  /* iOS never fires beforeinstallprompt: friendly hint once */
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone()) {
    setTimeout(function () {
      showInstall("ios");
    }, 9000);
  }

  /* offline notice */
  window.addEventListener("offline", function () {
    if (typeof window.__mwToast === "function") {
      window.__mwToast("Offline — showing your saved copy");
    }
  });

  /* -------------------------------------------------------------- page fetch */
  function get(url) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        if (ctrl) ctrl.abort();
        reject(new Error("timeout"));
      }, 7000);

      fetch(url, ctrl ? { cache: "no-store", signal: ctrl.signal } : { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error("http " + r.status);
          return r.text();
        })
        .then(function (t) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(t);
        })
        .catch(function (e) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(e);
        });
    });
  }

  function tryFrom(i) {
    if (i >= SOURCES.length) return fail();
    var src = SOURCES[i][0];
    var base = SOURCES[i][1];
    get(src)
      .then(function (html) {
        if (html.length < 2000 || html.indexOf("hero") === -1) throw new Error("bad payload");
        if (base !== BASE_JD) {
          /* the fetched page hard-codes jsDelivr asset URLs: repoint them at whichever CDN answered */
          html = html.replace(
            /https:\/\/cdn\.jsdelivr\.net\/gh\/sunnyprajapati1947-coder\/Sunny-@[^\/]+\/mens-wear\//g,
            base
          );
        }
        mount(html, base);
      })
      .catch(function () {
        tryFrom(i + 1);
      });
  }

  var mountedBase = BASE_JD;

  function mount(html, base) {
    try {
      mountedBase = base || BASE_JD;
      paint(html, mountedBase);
      window.__mwBooted = true;
    } catch (e) {
      fail();
    }
  }

  function paint(html, base) {
    var parsed = new DOMParser().parseFromString(html, "text/html");

    var frag = document.createDocumentFragment();
    [].slice.call(parsed.head.childNodes).forEach(function (n) {
      if (n.nodeName === "SCRIPT") return;
      frag.appendChild(document.importNode(n, true));
    });
    document.head.innerHTML = "";
    document.head.appendChild(frag);

    var bfrag = document.createDocumentFragment();
    [].slice.call(parsed.body.childNodes).forEach(function (n) {
      if (n.nodeName === "SCRIPT") return; /* re-loaded explicitly below */
      bfrag.appendChild(document.importNode(n, true));
    });
    document.body.innerHTML = "";
    document.body.appendChild(bfrag);

    document.title = parsed.title || document.title;
    appHead();

    /* the page's own scripts cannot re-run once transplanted, so load them by
       URL instead — one at a time, in order, with a timeout guard. */
    var i = 0;
    (function loadNext() {
      if (i >= PAGE_SCRIPTS.length) return;
      var el = document.createElement("script");
      var done = false;
      el.src = base + PAGE_SCRIPTS[i++];
      el.async = false;

      function step() {
        if (done) return;
        done = true;
        loadNext();
      }

      el.onload = el.onerror = step;
      setTimeout(step, 5000);
      document.head.appendChild(el);
    })();
  }

  tryFrom(0);
})();
