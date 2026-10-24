(() => {
  "use strict";

  const businessPhone = "919608087035";
  const bookingDialog = document.querySelector("#bookingDialog");
  const bookingForm = document.querySelector("#bookingForm");
  const serviceSelect = document.querySelector("#serviceSelect");
  const bookingDate = document.querySelector("#bookingDate");
  const menuToggle = document.querySelector(".menu-toggle");
  const primaryNav = document.querySelector("#primaryNav");
  const installButton = document.querySelector("#installAppButton");
  const installHelpDialog = document.querySelector("#installHelpDialog");
  let currentLanguage = "en";
  let lastBookingTrigger = null;
  let deferredInstallPrompt = null;

  function setLanguage(language) {
    currentLanguage = language === "hi" ? "hi" : "en";
    document.documentElement.lang = currentLanguage;

    document.querySelectorAll("[data-en][data-hi]").forEach((element) => {
      element.textContent = element.getAttribute(`data-${currentLanguage}`);
    });

    document.querySelectorAll("[data-en-placeholder][data-hi-placeholder]").forEach((element) => {
      element.placeholder = element.getAttribute(`data-${currentLanguage}-placeholder`);
    });

    document.querySelectorAll("[data-en-aria][data-hi-aria]").forEach((element) => {
      element.setAttribute("aria-label", element.getAttribute(`data-${currentLanguage}-aria`));
    });

    document.querySelectorAll("[data-set-language]").forEach((button) => {
      const isSelected = button.dataset.setLanguage === currentLanguage;
      button.classList.toggle("is-active", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });

    try {
      localStorage.setItem("mens-salon-language", currentLanguage);
    } catch (_) {
      // Language switching still works if browser storage is disabled.
    }
  }

  document.querySelectorAll("[data-set-language]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.setLanguage));
  });

  try {
    const savedLanguage = localStorage.getItem("mens-salon-language");
    if (savedLanguage === "hi" || savedLanguage === "en") setLanguage(savedLanguage);
  } catch (_) {
    // Keep English as the default when browser storage is unavailable.
  }

  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  bookingDate.min = localToday;

  function openBooking(trigger) {
    if (!bookingDialog || typeof bookingDialog.showModal !== "function") return;
    lastBookingTrigger = trigger || document.activeElement;

    const requestedService = trigger?.dataset?.service;
    if (requestedService && serviceSelect.querySelector(`option[value="${requestedService}"]`)) {
      serviceSelect.value = requestedService;
    } else {
      serviceSelect.value = "";
    }

    bookingDialog.showModal();
    document.body.classList.add("dialog-open");
    window.setTimeout(() => bookingDialog.querySelector('input[name="name"]')?.focus(), 30);
  }

  document.querySelectorAll("[data-open-booking]").forEach((button) => {
    button.addEventListener("click", () => openBooking(button));
  });

  bookingDialog.querySelector(".dialog-close")?.addEventListener("click", () => bookingDialog.close());
  bookingDialog.addEventListener("click", (event) => {
    if (event.target === bookingDialog) bookingDialog.close();
  });
  bookingDialog.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
    if (lastBookingTrigger && typeof lastBookingTrigger.focus === "function") lastBookingTrigger.focus();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  installButton?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      if (installHelpDialog && typeof installHelpDialog.showModal === "function") installHelpDialog.showModal();
      return;
    }

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") installButton.hidden = true;
    } catch (_) {
      if (installHelpDialog && typeof installHelpDialog.showModal === "function") installHelpDialog.showModal();
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    if (installButton) installButton.hidden = true;
  });

  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true) {
    if (installButton) installButton.hidden = true;
  }

  installHelpDialog?.querySelector("#closeInstallHelp")?.addEventListener("click", () => installHelpDialog.close());
  installHelpDialog?.querySelector("#closeInstallHelpButton")?.addEventListener("click", () => installHelpDialog.close());
  installHelpDialog?.addEventListener("click", (event) => {
    if (event.target === installHelpDialog) installHelpDialog.close();
  });

  bookingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!bookingForm.reportValidity()) return;

    const formData = new FormData(bookingForm);
    const name = String(formData.get("name") || "").trim();
    const service = serviceSelect.options[serviceSelect.selectedIndex]?.textContent.trim() || "";
    const date = String(formData.get("date") || "");
    const time = String(formData.get("time") || "");
    const notes = String(formData.get("notes") || "").trim();

    const message = currentLanguage === "hi"
      ? [
          "नमस्ते, मैं Men's Salon में अपॉइंटमेंट का अनुरोध करना चाहता/चाहती हूँ।",
          `नाम: ${name}`,
          `सेवा: ${service}`,
          `पसंदीदा तारीख: ${date}`,
          `पसंदीदा समय: ${time}`,
          notes ? `खास बात: ${notes}` : "कोई अतिरिक्त जानकारी नहीं।",
          "कृपया उपलब्धता और चुनी हुई सेवा की अंतिम कीमत की पुष्टि करें।"
        ].join("\n")
      : [
          "Hi, I'd like to request an appointment at Men's Salon.",
          `Name: ${name}`,
          `Service: ${service}`,
          `Preferred date: ${date}`,
          `Preferred time: ${time}`,
          notes ? `Notes: ${notes}` : "No additional notes.",
          "Please confirm availability and the final price for this service."
        ].join("\n");

    window.location.href = `https://wa.me/${businessPhone}?text=${encodeURIComponent(message)}`;
  });

  menuToggle?.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
    primaryNav.classList.toggle("is-open", !isOpen);
  });

  primaryNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      menuToggle?.setAttribute("aria-expanded", "false");
      menuToggle?.setAttribute("aria-label", "Open navigation");
      primaryNav.classList.remove("is-open");
    });
  });

  const year = document.querySelector("#currentYear");
  if (year) year.textContent = String(new Date().getFullYear());

  const revealElements = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -35px 0px" });
    revealElements.forEach((element) => revealObserver.observe(element));
  } else {
    revealElements.forEach((element) => element.classList.add("is-visible"));
  }

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // The site remains fully usable when offline storage is unavailable.
      });
    });
  }
})();
