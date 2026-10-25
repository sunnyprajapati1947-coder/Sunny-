(() => {
  "use strict";

  const businessPhone = "919031368918";
  const usualServiceKey = "mens-salon-usual-service";
  const bookingHistoryKey = "mens-salon-booking-history-v1";
  const maxBookingHistory = 30;
  const bookingDialog = document.querySelector("#bookingDialog");
  const bookingForm = document.querySelector("#bookingForm");
  const serviceSelect = document.querySelector("#serviceSelect");
  const bookingDate = document.querySelector("#bookingDate");
  const bookingHistoryDialog = document.querySelector("#bookingHistoryDialog");
  const bookingHistoryList = document.querySelector("#bookingHistoryList");
  const bookingHistoryEmpty = document.querySelector("#bookingHistoryEmpty");
  const bookingHistoryStatus = document.querySelector("#bookingHistoryStatus");
  const clearBookingHistoryButton = document.querySelector("#clearBookingHistory");
  const menuToggle = document.querySelector(".menu-toggle");
  const primaryNav = document.querySelector("#primaryNav");
  const installButton = document.querySelector("#installAppButton");
  const installHelpDialog = document.querySelector("#installHelpDialog");
  const helpDialog = document.querySelector("#helpSupportDialog");
  const helpDialogContent = helpDialog?.querySelector(".dialog-content");
  const helpSupportButton = document.querySelector("#helpSupportButton");
  const helpAnswer = document.querySelector("#helpAnswer");
  const aiHelperStatus = document.querySelector("#aiHelperStatus");
  const copyAiPromptButton = document.querySelector("#copyAiPrompt");
  const styleFinderDialog = document.querySelector("#styleFinderDialog");
  const finderOptions = document.querySelectorAll("[data-finder-service]");
  const finderSelection = document.querySelector("#finderSelection");
  const continueFromFinder = document.querySelector("#continueFromFinder");
  const visitToolStatus = document.querySelector("#visitToolStatus");
  const usualServiceStatus = document.querySelector("#usualServiceStatus");
  let currentLanguage = "en";
  let lastBookingTrigger = null;
  let lastFinderTrigger = null;
  let lastHelpTrigger = null;
  let lastHistoryTrigger = null;
  let selectedFinderService = "";
  let selectedHelpTopic = "booking";
  let deferredInstallPrompt = null;

  const services = {
    signature: {
      en: "Signature haircut",
      hi: "सिग्नेचर हेयरकट"
    },
    fade: {
      en: "Fade & finish",
      hi: "फेड और फिनिश"
    },
    beard: {
      en: "Beard shape-up",
      hi: "बियर्ड शेप-अप"
    },
    combo: {
      en: "Haircut + beard",
      hi: "हेयरकट + बियर्ड"
    },
    consultation: {
      en: "Not sure yet · ask on WhatsApp",
      hi: "अभी तय नहीं · WhatsApp पर बताइए"
    }
  };

  const servicePrices = {
    signature: 50,
    fade: 100,
    beard: 50,
    combo: 100
  };

  function readUsualService() {
    try {
      const saved = localStorage.getItem(usualServiceKey) || "";
      return Object.prototype.hasOwnProperty.call(services, saved) ? saved : "";
    } catch (_) {
      return "";
    }
  }

  function writeUsualService(service) {
    try {
      if (service) localStorage.setItem(usualServiceKey, service);
      else localStorage.removeItem(usualServiceKey);
      return true;
    } catch (_) {
      return false;
    }
  }

  function readBookingHistory() {
    try {
      const stored = JSON.parse(localStorage.getItem(bookingHistoryKey) || "[]");
      if (!Array.isArray(stored)) return [];

      return stored.filter((entry) => {
        if (!entry || typeof entry !== "object") return false;
        if (!Object.prototype.hasOwnProperty.call(services, entry.service)) return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time)) return false;
        if (!Number.isFinite(Date.parse(entry.createdAt))) return false;
        const [year, month, day] = entry.date.split("-").map(Number);
        const requestedDate = new Date(year, month - 1, day);
        return requestedDate.getFullYear() === year
          && requestedDate.getMonth() === month - 1
          && requestedDate.getDate() === day;
      }).slice(0, maxBookingHistory).map((entry) => ({
        service: entry.service,
        date: entry.date,
        time: entry.time,
        createdAt: entry.createdAt
      }));
    } catch (_) {
      return [];
    }
  }

  function saveBookingHistory(service, date, time) {
    if (!Object.prototype.hasOwnProperty.call(services, service)) return false;
    const createdAt = new Date().toISOString();
    const entry = { service, date, time, createdAt };

    try {
      const history = [entry, ...readBookingHistory()].slice(0, maxBookingHistory);
      localStorage.setItem(bookingHistoryKey, JSON.stringify(history));
      return true;
    } catch (_) {
      return false;
    }
  }

  function formatHistoryDateTime(date, time) {
    const requested = new Date(`${date}T${time}:00`);
    return new Intl.DateTimeFormat(currentLanguage === "hi" ? "hi-IN" : "en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(requested);
  }

  function historyFollowUpMessage(entry) {
    const serviceName = services[entry.service]?.[currentLanguage] || entry.service;
    const price = servicePrices[entry.service];
    const serviceLabel = price ? `${serviceName} · ₹${price}` : serviceName;
    const requestedAt = formatHistoryDateTime(entry.date, entry.time);

    return currentLanguage === "hi"
      ? `नमस्ते, मेरे पास इस पहले के अपॉइंटमेंट अनुरोध का रिकॉर्ड है: ${serviceLabel}, ${requestedAt}। क्या आप कृपया बता सकते हैं कि अनुरोध मिला था और अपॉइंटमेंट की पुष्टि हुई है या नहीं?`
      : `Hi, I have a record of this earlier appointment request: ${serviceLabel}, ${requestedAt}. Could you please check whether it was received and whether the appointment was confirmed?`;
  }

  function updateBookingHistoryUI() {
    if (!bookingHistoryList || !bookingHistoryEmpty) return;
    const history = readBookingHistory();
    bookingHistoryList.replaceChildren();
    bookingHistoryList.hidden = history.length === 0;
    bookingHistoryEmpty.hidden = history.length > 0;
    if (clearBookingHistoryButton) clearBookingHistoryButton.disabled = history.length === 0;
    if (bookingHistoryStatus) bookingHistoryStatus.textContent = "";

    const locale = currentLanguage === "hi" ? "hi-IN" : "en-IN";
    history.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "booking-history-item";

      const heading = document.createElement("div");
      heading.className = "booking-history-heading";
      const serviceTitle = document.createElement("strong");
      serviceTitle.textContent = services[entry.service]?.[currentLanguage] || entry.service;
      heading.appendChild(serviceTitle);

      const price = servicePrices[entry.service];
      if (price) {
        const priceLabel = document.createElement("span");
        priceLabel.className = "booking-history-price";
        priceLabel.textContent = `₹${price}`;
        heading.appendChild(priceLabel);
      }

      const requested = document.createElement("p");
      requested.className = "booking-history-meta";
      requested.textContent = currentLanguage === "hi"
        ? `माँगा गया समय: ${formatHistoryDateTime(entry.date, entry.time)}`
        : `Requested for: ${formatHistoryDateTime(entry.date, entry.time)}`;

      const saved = document.createElement("p");
      saved.className = "booking-history-saved";
      saved.textContent = currentLanguage === "hi"
        ? `इस डिवाइस पर सेव: ${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}`
        : `Saved on this device: ${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}`;

      const status = document.createElement("p");
      status.className = "booking-history-status";
      status.textContent = currentLanguage === "hi"
        ? "यह अनुरोध का रिकॉर्ड है; ऐप यह नहीं जान सकता कि WhatsApp संदेश भेजा गया या सलून ने पुष्टि की।"
        : "This is a request record; the app cannot tell whether WhatsApp was sent or the salon confirmed it.";

      const followUp = document.createElement("a");
      followUp.className = "button button-outline-light booking-history-followup";
      followUp.href = `https://wa.me/${businessPhone}?text=${encodeURIComponent(historyFollowUpMessage(entry))}`;
      followUp.target = "_blank";
      followUp.rel = "noopener noreferrer";
      followUp.textContent = currentLanguage === "hi" ? "WhatsApp पर स्थिति पूछें" : "Ask the salon on WhatsApp";

      item.append(heading, requested, saved, status, followUp);
      bookingHistoryList.appendChild(item);
    });
  }

  function updateUsualServiceUI() {
    const savedService = readUsualService();
    const savedName = document.querySelector("#usualCutName");
    const savedCard = document.querySelector("#usualCutCard");

    if (savedCard) savedCard.hidden = !savedService;
    if (savedName) savedName.textContent = savedService ? services[savedService][currentLanguage] : "";

    document.querySelectorAll("[data-toggle-usual]").forEach((button) => {
      const isSaved = button.dataset.service === savedService;
      button.classList.toggle("is-saved", isSaved);
      button.setAttribute("aria-pressed", String(isSaved));
      const translatedDefault = button.getAttribute(`data-${currentLanguage}-aria`);
      const savedLabel = currentLanguage === "hi"
        ? `${services[button.dataset.service]?.hi || "सेवा"} आपकी पसंदीदा सेवा के रूप में सेव है; हटाने के लिए फिर टैप करें।`
        : `${services[button.dataset.service]?.en || "Service"} is saved as your usual; tap again to remove.`;
      button.setAttribute("aria-label", isSaved ? savedLabel : translatedDefault || "Save this service as my usual");
      button.title = isSaved ? savedLabel : translatedDefault || "Save this service as my usual";
    });
  }

  function updateFinderSelection() {
    if (!finderSelection) return;

    if (!selectedFinderService || !services[selectedFinderService]) {
      finderSelection.textContent = finderSelection.getAttribute(`data-${currentLanguage}`) || "";
      if (continueFromFinder) continueFromFinder.disabled = true;
      return;
    }

    const serviceName = services[selectedFinderService][currentLanguage];
    finderSelection.textContent = currentLanguage === "hi"
      ? `अच्छा चुनाव — ${serviceName} बुकिंग के लिए तैयार है। नितीश आपके साथ बारीकियाँ तय करेंगे।`
      : `Good choice — ${serviceName} is ready to book. Nitish can fine-tune the details with you.`;
    if (continueFromFinder) continueFromFinder.disabled = false;
  }

  const helpAnswers = {
    booking: {
      en: "Use the booking form or WhatsApp button to send a request. Nitish will reply to confirm a time; the request is not a confirmed appointment.",
      hi: "बुकिंग फ़ॉर्म या WhatsApp बटन से अनुरोध भेजें। समय की पुष्टि नितीश जवाब देकर करेंगे; अनुरोध पक्का अपॉइंटमेंट नहीं है।"
    },
    prices: {
      en: "Signature haircut and beard shape-up cost ₹50 each; fade & finish and haircut + beard cost ₹100 each. See the service menu for details.",
      hi: "सिग्नेचर हेयरकट और बियर्ड शेप-अप की कीमत ₹50 प्रति सेवा है; फेड और फिनिश तथा हेयरकट + बियर्ड की कीमत ₹100 प्रति सेवा है। सेवा मेन्यू देखें।"
    },
    hours: {
      en: "The salon's opening days and hours have not been verified. Please call or message to check today's availability.",
      hi: "सलून के खुलने के दिन और समय की पुष्टि नहीं हुई है। आज की उपलब्धता जानने के लिए कॉल या संदेश करें।"
    },
    location: {
      en: "Men's Salon is listed in Sudama Nagar, Nawada, Bihar 805110. The exact landmark has not been confirmed; open Maps or message before setting out.",
      hi: "Men's Salon का पता सुदामा नगर, नवादा, बिहार 805110 है। सटीक लैंडमार्क की पुष्टि नहीं हुई; निकलने से पहले Maps खोलें या संदेश करें।"
    },
    history: {
      en: "Open My booking history above to see request summaries saved on this device. The app cannot tell whether WhatsApp sent a message or Nitish confirmed an appointment.",
      hi: "इस डिवाइस पर सेव अनुरोध देखने के लिए ऊपर 'मेरी बुकिंग हिस्ट्री' खोलें। ऐप यह नहीं जान सकता कि WhatsApp संदेश भेजा गया या नितीश ने अपॉइंटमेंट की पुष्टि की।"
    }
  };

  function updateHelpAnswer(topic = selectedHelpTopic) {
    if (!helpAnswer) return;
    selectedHelpTopic = Object.prototype.hasOwnProperty.call(helpAnswers, topic) ? topic : "booking";
    helpAnswer.textContent = helpAnswers[selectedHelpTopic][currentLanguage];
    document.querySelectorAll("[data-help-topic]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.helpTopic === selectedHelpTopic));
    });
  }

  function syncDialogOpenState() {
    const open = [bookingDialog, installHelpDialog, styleFinderDialog, helpDialog, bookingHistoryDialog].some((dialog) => dialog?.open);
    document.body.classList.toggle("dialog-open", open);
  }

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

    if (menuToggle) {
      const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-label", currentLanguage === "hi"
        ? (isOpen ? "नेविगेशन बंद करें" : "नेविगेशन खोलें")
        : (isOpen ? "Close navigation" : "Open navigation"));
    }

    updateUsualServiceUI();
    updateFinderSelection();
    updateHelpAnswer();
    updateBookingHistoryUI();

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
    else {
      updateUsualServiceUI();
      updateHelpAnswer();
      updateBookingHistoryUI();
    }
  } catch (_) {
    updateUsualServiceUI();
    updateHelpAnswer();
    updateBookingHistoryUI();
    // Keep English as the default when browser storage is unavailable.
  }

  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  if (bookingDate) bookingDate.min = localToday;

  function openBooking(trigger, serviceOverride = "") {
    if (!bookingDialog || typeof bookingDialog.showModal !== "function") return;
    lastBookingTrigger = trigger || document.activeElement;

    const requestedService = serviceOverride || trigger?.dataset?.service;
    if (requestedService && services[requestedService] && serviceSelect?.querySelector(`option[value="${requestedService}"]`)) {
      serviceSelect.value = requestedService;
    } else if (serviceSelect) {
      serviceSelect.value = "";
    }

    bookingDialog.showModal();
    syncDialogOpenState();
    window.setTimeout(() => bookingDialog.querySelector('input[name="name"]')?.focus(), 30);
  }

  document.querySelectorAll("[data-open-booking]").forEach((button) => {
    button.addEventListener("click", () => openBooking(button));
  });

  bookingDialog?.querySelector(".dialog-close")?.addEventListener("click", () => bookingDialog.close());
  bookingDialog?.addEventListener("click", (event) => {
    if (event.target === bookingDialog) bookingDialog.close();
  });
  bookingDialog?.addEventListener("close", () => {
    syncDialogOpenState();
    if (lastBookingTrigger && typeof lastBookingTrigger.focus === "function") lastBookingTrigger.focus();
  });

  function openStyleFinder(trigger) {
    if (!styleFinderDialog || typeof styleFinderDialog.showModal !== "function") return;
    lastFinderTrigger = trigger || document.activeElement;
    selectedFinderService = "";
    finderOptions.forEach((option) => {
      option.classList.remove("is-selected");
      option.setAttribute("aria-pressed", "false");
    });
    updateFinderSelection();
    styleFinderDialog.showModal();
    syncDialogOpenState();
    window.setTimeout(() => finderOptions[0]?.focus(), 20);
  }

  document.querySelectorAll("[data-open-style-finder]").forEach((button) => {
    button.addEventListener("click", () => openStyleFinder(button));
  });

  finderOptions.forEach((option) => {
    option.addEventListener("click", () => {
      selectedFinderService = option.dataset.finderService || "";
      finderOptions.forEach((candidate) => {
        const isSelected = candidate === option;
        candidate.classList.toggle("is-selected", isSelected);
        candidate.setAttribute("aria-pressed", String(isSelected));
      });
      updateFinderSelection();
    });
  });

  styleFinderDialog?.querySelector("#closeStyleFinder")?.addEventListener("click", () => styleFinderDialog.close());
  styleFinderDialog?.addEventListener("click", (event) => {
    if (event.target === styleFinderDialog) styleFinderDialog.close();
  });
  styleFinderDialog?.addEventListener("close", () => {
    syncDialogOpenState();
    if (!bookingDialog?.open && lastFinderTrigger && typeof lastFinderTrigger.focus === "function") {
      lastFinderTrigger.focus();
    }
  });

  continueFromFinder?.addEventListener("click", () => {
    if (!selectedFinderService) return;
    const service = selectedFinderService;
    const trigger = lastFinderTrigger;
    styleFinderDialog.close();
    openBooking(trigger, service);
  });

  function showInstallHelp() {
    if (!installHelpDialog || typeof installHelpDialog.showModal !== "function") return;
    installHelpDialog.showModal();
    syncDialogOpenState();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  installButton?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      showInstallHelp();
      return;
    }

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") installButton.hidden = true;
    } catch (_) {
      showInstallHelp();
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    if (installButton) installButton.hidden = true;
  });

  if (window.SALON_NATIVE_APP || window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true) {
    if (installButton) installButton.hidden = true;
  }

  installHelpDialog?.querySelector("#closeInstallHelp")?.addEventListener("click", () => installHelpDialog.close());
  installHelpDialog?.querySelector("#closeInstallHelpButton")?.addEventListener("click", () => installHelpDialog.close());
  installHelpDialog?.addEventListener("click", (event) => {
    if (event.target === installHelpDialog) installHelpDialog.close();
  });
  installHelpDialog?.addEventListener("close", syncDialogOpenState);

  helpSupportButton?.addEventListener("click", () => {
    if (!helpDialog || typeof helpDialog.showModal !== "function") return;
    lastHelpTrigger = helpSupportButton;
    if (helpDialogContent) helpDialogContent.scrollTop = 0;
    updateHelpAnswer();
    helpDialog.showModal();
    if (helpDialogContent) helpDialogContent.scrollTop = 0;
    syncDialogOpenState();
  });

  helpDialog?.querySelector("#closeHelpSupport")?.addEventListener("click", () => helpDialog.close());
  helpDialog?.addEventListener("click", (event) => {
    if (event.target === helpDialog) helpDialog.close();
  });
  helpDialog?.addEventListener("close", () => {
    syncDialogOpenState();
    if (lastHelpTrigger && typeof lastHelpTrigger.focus === "function") lastHelpTrigger.focus();
  });

  function openBookingHistory(trigger) {
    if (!bookingHistoryDialog || typeof bookingHistoryDialog.showModal !== "function") return;
    lastHistoryTrigger = trigger || document.activeElement;
    updateBookingHistoryUI();
    bookingHistoryDialog.showModal();
    syncDialogOpenState();
    window.setTimeout(() => bookingHistoryDialog.querySelector("#closeBookingHistory")?.focus(), 20);
  }

  document.querySelectorAll("[data-open-history]").forEach((button) => {
    button.addEventListener("click", () => openBookingHistory(button));
  });

  bookingHistoryDialog?.querySelector("#closeBookingHistory")?.addEventListener("click", () => bookingHistoryDialog.close());
  bookingHistoryDialog?.querySelector("#closeHistoryButton")?.addEventListener("click", () => bookingHistoryDialog.close());
  bookingHistoryDialog?.addEventListener("click", (event) => {
    if (event.target === bookingHistoryDialog) bookingHistoryDialog.close();
  });
  bookingHistoryDialog?.addEventListener("close", () => {
    syncDialogOpenState();
    if (lastHistoryTrigger && typeof lastHistoryTrigger.focus === "function") lastHistoryTrigger.focus();
  });

  clearBookingHistoryButton?.addEventListener("click", () => {
    const history = readBookingHistory();
    if (!history.length || !bookingHistoryStatus) return;
    const confirmMessage = currentLanguage === "hi"
      ? "इस डिवाइस से आपकी सभी सेव की गई बुकिंग हिस्ट्री हटाएँ?"
      : "Clear all saved booking history from this device?";
    if (!window.confirm(confirmMessage)) return;

    try {
      localStorage.removeItem(bookingHistoryKey);
      updateBookingHistoryUI();
      bookingHistoryStatus.textContent = currentLanguage === "hi"
        ? "इस डिवाइस की बुकिंग हिस्ट्री हटा दी गई।"
        : "Booking history cleared from this device.";
    } catch (_) {
      bookingHistoryStatus.textContent = currentLanguage === "hi"
        ? "हिस्ट्री नहीं हट सकी। कृपया ऐप/ब्राउज़र डेटा साफ़ करें।"
        : "History could not be cleared. Please clear the app/browser storage.";
    }
  });

  document.querySelectorAll("[data-help-topic]").forEach((button) => {
    button.addEventListener("click", () => updateHelpAnswer(button.dataset.helpTopic));
  });

  document.querySelectorAll("[data-toggle-usual]").forEach((button) => {
    button.addEventListener("click", () => {
      const service = button.dataset.service || "";
      const savedService = readUsualService();
      const nextService = savedService === service ? "" : service;
      if (!writeUsualService(nextService)) {
        if (usualServiceStatus) {
          usualServiceStatus.textContent = currentLanguage === "hi"
            ? "यह ब्राउज़र आपकी पसंद सेव नहीं कर पाया। आप सेवा कार्ड से फिर भी बुक कर सकते हैं।"
            : "This browser couldn't save your choice. You can still book from the service card.";
        }
        return;
      }

      updateUsualServiceUI();
      if (usualServiceStatus) {
        usualServiceStatus.textContent = nextService
          ? (currentLanguage === "hi" ? `${services[nextService].hi} आपकी इस डिवाइस पर सेव हो गई।` : `${services[nextService].en} is saved on this device.`)
          : (currentLanguage === "hi" ? "सेव की गई सेवा हटा दी गई।" : "Your saved service was cleared.");
      }
    });
  });

  document.querySelector("#bookUsualButton")?.addEventListener("click", (event) => {
    const savedService = readUsualService();
    if (savedService) openBooking(event.currentTarget, savedService);
  });

  document.querySelector("#clearUsualButton")?.addEventListener("click", () => {
    const wasSaved = Boolean(readUsualService());
    if (!writeUsualService("")) return;
    updateUsualServiceUI();
    if (usualServiceStatus) {
      usualServiceStatus.textContent = wasSaved
        ? (currentLanguage === "hi" ? "सेव की गई सेवा हटा दी गई।" : "Your saved service was cleared.")
        : (currentLanguage === "hi" ? "कोई सेवा सेव नहीं थी।" : "There was no saved service to clear.");
    }
  });

  async function copyText(text) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const temporaryInput = document.createElement("textarea");
    temporaryInput.value = text;
    temporaryInput.setAttribute("readonly", "");
    temporaryInput.style.position = "fixed";
    temporaryInput.style.top = "-1000px";
    document.body.appendChild(temporaryInput);
    temporaryInput.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (_) {
      copied = false;
    } finally {
      temporaryInput.remove();
    }
    return copied;
  }

  function aiStarterPrompt() {
    return currentLanguage === "hi"
      ? "मुझे मेरे बालों की बनावट, चेहरे के आकार, रोज़ की देखभाल के समय और मौसम के हिसाब से पुरुषों के हेयरकट और ग्रूमिंग के 3 व्यावहारिक सुझाव दें। हर सुझाव का रखरखाव भी बताएं। मैं Men's Salon, सुदामा नगर, नवादा में 6 साल के अनुभव वाले बार्बर नितीश जाटव से विकल्पों पर चर्चा करूँगा। सलून WhatsApp: +91 90313 68918। सूचीबद्ध सेवाओं की कीमत ₹50 या ₹100 है; कोई दूसरी कीमत या खुलने का समय न गढ़ें। पहले ज़रूरी सवाल पूछें और कोई निजी जानकारी न माँगें।"
      : "Suggest three practical men's haircut and grooming options based on my hair texture, face shape, daily maintenance time, and climate. Explain the upkeep for each. I will discuss them with Nitish Jatav, a barber with 6 years of experience at Men's Salon, Sudama Nagar, Nawada. Official salon WhatsApp: +91 90313 68918. Listed services cost ₹50 or ₹100; do not invent other prices or opening hours. Ask useful follow-up questions and do not request sensitive personal information.";
  }

  function setAiHelperStatus(copied) {
    if (!aiHelperStatus) return;
    aiHelperStatus.textContent = copied
      ? (currentLanguage === "hi" ? "सवाल कॉपी हो गया — चुने हुए AI में पेस्ट करें।" : "Prompt copied — paste it into the AI provider you opened.")
      : (currentLanguage === "hi" ? "सवाल कॉपी नहीं हुआ। मॉडल खोलकर ऊपर दिया सवाल कॉपी करें।" : "Couldn't copy the prompt. Open a model and copy the question above.");
  }

  document.querySelectorAll("[data-ai-model]").forEach((link) => {
    link.addEventListener("click", () => {
      copyText(aiStarterPrompt()).then(setAiHelperStatus).catch(() => setAiHelperStatus(false));
    });
  });

  copyAiPromptButton?.addEventListener("click", () => {
    copyText(aiStarterPrompt()).then(setAiHelperStatus).catch(() => setAiHelperStatus(false));
  });

  function salonUrl() {
    if (window.SALON_NATIVE_APP) return `https://wa.me/${businessPhone}`;
    const url = new URL(window.location.href);
    url.hash = "";
    return url.toString();
  }

  function setVisitToolStatus(message) {
    if (visitToolStatus) visitToolStatus.textContent = message;
  }

  document.querySelector("[data-share-salon]")?.addEventListener("click", async () => {
    const url = salonUrl();
    const shareData = {
      title: "Men's Salon · Nawada",
      text: currentLanguage === "hi"
        ? "नवादा के सुदामा नगर में Men's Salon — सेवाएँ देखें और WhatsApp पर अपॉइंटमेंट माँगें।"
        : "Men's Salon in Sudama Nagar, Nawada — explore services and request a WhatsApp appointment.",
      url
    };

    try {
      if (window.SALON_NATIVE_APP && window.SalonAndroid?.share) {
        window.SalonAndroid.share(shareData.title, shareData.text, shareData.url);
        setVisitToolStatus(currentLanguage === "hi" ? "शेयर विकल्प खुल गया।" : "Share options opened.");
        return;
      }

      if (navigator.share) {
        await navigator.share(shareData);
        setVisitToolStatus(currentLanguage === "hi" ? "सलून लिंक शेयर किया गया।" : "Salon link shared.");
        return;
      }

      const copied = await copyText(url);
      setVisitToolStatus(copied
        ? (currentLanguage === "hi" ? "सलून लिंक क्लिपबोर्ड पर कॉपी हो गया।" : "Salon link copied to your clipboard.")
        : (currentLanguage === "hi" ? `यह लिंक शेयर करें: ${url}` : `Share this link: ${url}`));
    } catch (error) {
      if (error?.name !== "AbortError") {
        setVisitToolStatus(currentLanguage === "hi"
          ? "शेयर नहीं हो पाया। कृपया पेज का लिंक कॉपी करें।"
          : "Sharing didn't work. Please copy the page link instead.");
      }
    }
  });

  document.querySelector("[data-save-contact]")?.addEventListener("click", () => {
    if (window.SALON_NATIVE_APP && window.SalonAndroid?.saveContact) {
      window.SalonAndroid.saveContact();
      setVisitToolStatus(currentLanguage === "hi" ? "कॉन्टैक्ट जोड़ने का फ़ॉर्म खुल गया।" : "The contact form opened.");
      return;
    }

    const vCard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Men's Salon - Nawada",
      "ORG:Men's Salon",
      "TEL;TYPE=WORK,VOICE:+919031368918",
      "ADR;TYPE=WORK:;;Sudama Nagar;Nawada;Bihar;805110;India",
      `URL:${salonUrl()}`,
      "END:VCARD",
      ""
    ].join("\r\n");
    const contactBlob = new Blob([vCard], { type: "text/vcard;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(contactBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = "mens-salon-nawada.vcf";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500);
    setVisitToolStatus(currentLanguage === "hi"
      ? "कॉन्टैक्ट कार्ड डाउनलोड हुआ — इसे अपने Contacts में इम्पोर्ट करें।"
      : "Contact card downloaded — import it into your Contacts.");
  });

  if (bookingForm && serviceSelect) {
    bookingForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!bookingForm.reportValidity()) return;

      const formData = new FormData(bookingForm);
      const name = String(formData.get("name") || "").trim();
      const service = serviceSelect.options[serviceSelect.selectedIndex]?.textContent.trim() || "";
      const date = String(formData.get("date") || "");
      const time = String(formData.get("time") || "");
      const notes = String(formData.get("notes") || "").trim();

      // Save only a minimal request summary locally; name and notes go only to WhatsApp.
      saveBookingHistory(serviceSelect.value, date, time);

      const message = currentLanguage === "hi"
        ? [
            "नमस्ते, मैं Men's Salon में अपॉइंटमेंट का अनुरोध करना चाहता/चाहती हूँ।",
            `नाम: ${name}`,
            `सेवा: ${service}`,
            `पसंदीदा तारीख: ${date}`,
            `पसंदीदा समय: ${time}`,
            notes ? `खास बात: ${notes}` : "कोई अतिरिक्त जानकारी नहीं।",
            "कृपया उपलब्धता और सेवा के बारे में बाकी जानकारी की पुष्टि करें।"
          ].join("\n")
        : [
            "Hi, I'd like to request an appointment at Men's Salon.",
            `Name: ${name}`,
            `Service: ${service}`,
            `Preferred date: ${date}`,
            `Preferred time: ${time}`,
            notes ? `Notes: ${notes}` : "No additional notes.",
            "Please confirm availability and any service details."
          ].join("\n");

      window.location.href = `https://wa.me/${businessPhone}?text=${encodeURIComponent(message)}`;
    });
  }

  menuToggle?.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    menuToggle.setAttribute("aria-label", currentLanguage === "hi"
      ? (isOpen ? "नेविगेशन खोलें" : "नेविगेशन बंद करें")
      : (isOpen ? "Open navigation" : "Close navigation"));
    primaryNav?.classList.toggle("is-open", !isOpen);
  });

  primaryNav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      menuToggle?.setAttribute("aria-expanded", "false");
      menuToggle?.setAttribute("aria-label", currentLanguage === "hi" ? "नेविगेशन खोलें" : "Open navigation");
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

  if (!window.SALON_NATIVE_APP && "serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // The site remains fully usable when offline storage is unavailable.
      });
    });
  }
})();
