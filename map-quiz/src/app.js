/* Bharat Map Quiz — app controller (screens, quiz loop, progress, speech). */

import {
  STATES,
  UNITS,
  REGIONS,
  REGION_LABEL,
  mapLabel,
  unitName,
  capitalName,
} from "./data.js";
import {
  t,
  locatePrompt,
  capitalPrompt,
  identifyPrompt,
  hintText,
  langCode,
} from "./i18n.js";
import {
  loadProfile,
  saveProfile,
  recordAnswer,
  unitStat,
  memorisedCount,
  accuracy,
  weakUnits,
  resetProfile,
} from "./store.js";
import {
  ROUND_SIZE,
  poolFor,
  makeQuestion,
  isCorrectTap,
  isCorrectOption,
  optionKey,
  sprintSequence,
  starsFor,
  formatTime,
} from "./quiz.js";
import { createMap, attachZoom } from "./map.js";
import { beep, speak, stopSpeaking, vibrate } from "./audio.js";

const $ = (id) => document.getElementById(id);
const MAP_TOTAL = STATES.length;

/** Inline multilingual strings for dynamic sentences. */
function L(hing, hi, en) {
  return profile.lang === "hi" ? hi : profile.lang === "en" ? en : hing;
}

function nameOf(id) {
  const unit = UNITS[id];
  return unit ? unitName(unit, profile.lang) : id;
}

function factOf(unit) {
  return unit.fact[profile.lang === "hi" ? "hi" : "en"];
}

function regionName(region) {
  const label = REGION_LABEL[region] || REGION_LABEL.all;
  return label[profile.lang === "hi" ? "hi" : profile.lang === "en" ? "en" : "hing"];
}

let profile = loadProfile();

const ui = {
  screen: "home",
  region: "all",
  labels: true,
  heroMap: null,
  learnMap: null,
  zoom: null,
  quiz: null,
  activeUnit: null,
  installPrompt: null,
  toastTimer: null,
};

const MODE_META = {
  locate: { icon: "📍", accent: "#4cc3ff" },
  identify: { icon: "🧭", accent: "#a78bfa" },
  capital: { icon: "🏛️", accent: "#ffb86b" },
  sprint: { icon: "⚡", accent: "#2dd4a7" },
  learn: { icon: "🗺️", accent: "#ff9f45" },
};

/* ---------------------------------------------------------------- helpers */

function toast(message, ms = 2000) {
  const node = $("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => node.classList.remove("show"), ms);
}

function setScreen(name) {
  ui.screen = name;
  for (const screen of document.querySelectorAll(".screen")) {
    screen.hidden = screen.dataset.screen !== name;
  }
  $("backBtn").hidden = name === "home";
  if (name !== "quiz") {
    stopSpeaking();
  }
  if (name !== "quiz") clearQuizTimer();
}

function clearQuizTimer() {
  if (ui.quiz?.timerId) {
    clearInterval(ui.quiz.timerId);
    ui.quiz.timerId = null;
  }
  if (ui.quiz?.advanceTimer) {
    clearTimeout(ui.quiz.advanceTimer);
    ui.quiz.advanceTimer = null;
  }
}

function sound(kind) {
  if (!profile.sound) return;
  beep(kind);
  vibrate(kind === "bad" ? [20, 40, 20] : 12);
}

/* ---------------------------------------------------------------- home */

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return L("Subah ke namaste!", "सुप्रभात!", "Good morning!");
  if (hour < 17) return L("Namaste!", "नमस्ते!", "Hello!");
  if (hour < 21) return L("Shubh sandhya!", "शुभ संध्या!", "Good evening!");
  return L("Raat ke namaste!", "शुभ रात्रि!", "Good night!");
}

function renderHome() {
  $("brandTitle").textContent = t("appName", profile.lang);
  $("brandSub").textContent = t("tagline", profile.lang);
  $("langBtn").textContent = profile.lang === "hi" ? "हिं" : profile.lang === "en" ? "EN" : "Hing";
  $("soundBtn").style.opacity = profile.sound ? "1" : "0.45";

  const mastered = memorisedCount(profile, STATES);
  $("homeGreeting").textContent = greeting();
  $("homeHeadline").textContent =
    mastered === 0
      ? L("India ka naksha yaad karo", "भारत का नक्शा याद करो", "Learn the map of India")
      : L(
          `${mastered} rajya yaad ho gaye`,
          `${mastered} राज्य याद हो गए`,
          `${mastered} states memorised`
        );

  $("masteredCount").textContent = String(mastered);
  $("masteredOf").textContent = `/ ${MAP_TOTAL}`;
  const circumference = 264;
  $("ringFg").style.strokeDashoffset = String(
    circumference - (circumference * mastered) / MAP_TOTAL
  );
  $("heroMapCta").textContent = L("Naksha kholo →", "नक्शा खोलो →", "Open the map →");

  /* hero mini map */
  if (!ui.heroMap) {
    ui.heroMap = createMap($("heroMap"), {
      interactive: false,
      labels: false,
      markers: false,
    });
  }
  for (const unit of STATES) {
    const stat = unitStat(profile, unit.id);
    ui.heroMap.setClass(unit.id, "is-done", stat.mastery >= 80);
    ui.heroMap.setClass(unit.id, "is-seen", stat.seen > 0 && stat.mastery < 80);
  }

  /* region chips */
  $("poolTitle").textContent = t("pool", profile.lang);
  const chips = $("regionChips");
  chips.replaceChildren();
  for (const region of REGIONS) {
    const button = document.createElement("button");
    button.className = "chip" + (ui.region === region.id ? " active" : "");
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(ui.region === region.id));
    const emoji = document.createElement("span");
    emoji.className = "chip-emoji";
    emoji.textContent = region.emoji;
    button.append(emoji, document.createTextNode(regionName(region.id)));
    button.addEventListener("click", () => {
      ui.region = region.id;
      renderHome();
    });
    chips.append(button);
  }
  $("poolCount").textContent = `${poolFor(ui.region).length} ${L("rajya", "राज्य", "states")}`;

  /* mode cards */
  const modes = ["locate", "identify", "capital", "sprint"];
  const grid = $("modeGrid");
  grid.replaceChildren();

  for (const mode of modes) {
    const meta = MODE_META[mode];
    const card = document.createElement("button");
    card.className = "mode-card";
    card.style.setProperty("--accent", meta.accent);
    card.innerHTML = `
      <span class="mode-icon">${meta.icon}</span>
      <strong>${t(mode, profile.lang)}</strong>
      <span class="mode-sub">${t(mode + "Sub", profile.lang)}</span>
      <span class="mode-badge">${mode === "sprint" ? `${poolFor(ui.region).length}` : t("round", profile.lang)}</span>
    `;
    card.addEventListener("click", () => startQuiz(mode));
    grid.append(card);
  }

  const learn = document.createElement("button");
  learn.className = "mode-card wide";
  learn.style.setProperty("--accent", MODE_META.learn.accent);
  learn.innerHTML = `
    <span class="mode-icon">${MODE_META.learn.icon}</span>
    <span class="mode-text">
      <strong>${t("learn", profile.lang)}</strong>
      <span class="mode-sub">${t("learnSub", profile.lang)}</span>
    </span>
    <span class="mode-badge">${MAP_TOTAL}</span>
  `;
  learn.addEventListener("click", () => openLearn());
  grid.append(learn);

  /* stats */
  const stats = $("statsRow");
  stats.replaceChildren();
  const boxes = [
    [String(profile.xp), t("xp", profile.lang)],
    [`${accuracy(profile)}%`, t("accuracy", profile.lang)],
    [String(profile.bestStreak), t("bestStreak", profile.lang)],
    [profile.sprintBest ? formatTime(profile.sprintBest) : "—", t("sprintBest", profile.lang)],
  ];
  for (const [value, label] of boxes) {
    const box = document.createElement("div");
    box.className = "stat-box";
    box.innerHTML = `<b>${value}</b><span>${label}</span>`;
    stats.append(box);
  }

  /* weakest states */
  const weak = weakUnits(profile, poolFor(ui.region), 5);
  const card = $("weakCard");
  card.replaceChildren();
  const title = document.createElement("h4");
  title.textContent = t("weakStates", profile.lang);
  card.append(title);
  if (!weak.some((u) => unitStat(profile, u.id).seen)) {
    const hint = document.createElement("p");
    hint.textContent = t("weakNone", profile.lang);
    card.append(hint);
  } else {
    const list = document.createElement("div");
    list.className = "weak-list";
    for (const unit of weak) {
      const stat = unitStat(profile, unit.id);
      const pill = document.createElement("button");
      pill.className = "weak-pill" + (stat.mastery >= 80 ? " ok" : "");
      pill.textContent = `${unitName(unit, profile.lang)} · ${Math.round(stat.mastery)}%`;
      pill.addEventListener("click", () =>
        startQuiz("locate", { region: unit.region, focusId: unit.id })
      );
      list.append(pill);
    }
    card.append(list);
  }

  /* install + footer */
  const standalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  const installCard = $("installCard");
  installCard.hidden = standalone;
  $("installTitle").textContent = t("install", profile.lang);
  $("installHint").textContent = t("installHint", profile.lang);
  $("installBtn").hidden = !ui.installPrompt;
  const resetBtn = $("resetBtn");
  if (resetBtn) resetBtn.textContent = t("reset", profile.lang);
  $("footerBuilt").textContent = L(
    "Map data: Census shapefile · 28 rajya + 8 UT",
    "मैप डेटा: जनगणना शेपफाइल · 28 राज्य + 8 केंद्रशासित",
    "Map data: Census shapefile · 28 states + 8 UTs"
  );
}

/* ---------------------------------------------------------------- learn */

function openLearn() {
  setScreen("learn");
  if (!ui.learnMap) {
    ui.learnMap = createMap($("learnMap"), {
      labels: true,
      onTap: (id) => openSheet(id),
    });
    ui.zoom = attachZoom($("learnMapWrap"), $("learnMap"));
    $("zoomIn").addEventListener("click", () => ui.zoom.zoomIn());
    $("zoomOut").addEventListener("click", () => ui.zoom.zoomOut());
    $("labelToggle").addEventListener("click", () => {
      ui.labels = !ui.labels;
      $("labelToggle").setAttribute("aria-pressed", String(ui.labels));
      ui.learnMap.setLabelsVisible(ui.labels);
    });
  }
  ui.learnMap.setLabelsAll((id) => mapLabel(UNITS[id], profile.lang));
  ui.learnMap.setLabelsVisible(ui.labels);
  $("labelToggle").textContent = L("Naam", "नाम", "Names");
  $("labelToggle").setAttribute("aria-pressed", String(ui.labels));
  $("learnHint").textContent = t("learnSub", profile.lang);
  refreshLearnColors();
  $("legend").innerHTML = `
    <span><i class="dot state"></i>${t("stateLabel", profile.lang)}</span>
    <span><i class="dot ut"></i>${t("utLabel", profile.lang)}</span>
    <span><i class="dot done"></i>${t("memorised", profile.lang)}</span>
  `;
}

function refreshLearnColors() {
  if (!ui.learnMap) return;
  for (const unit of STATES) {
    const stat = unitStat(profile, unit.id);
    ui.learnMap.setClass(unit.id, "is-done", stat.mastery >= 80);
  }
}

function openSheet(id) {
  const unit = UNITS[id];
  if (!unit) return;
  ui.activeUnit = unit;
  $("sheetName").textContent = unitName(unit, profile.lang);
  const stat = unitStat(profile, id);
  $("sheetMeta").textContent = [
    unit.type === "ut" ? t("utLabel", profile.lang) : t("stateLabel", profile.lang),
    regionName(unit.region),
    `${t("memorised", profile.lang)}: ${Math.round(stat.mastery)}%`,
  ].join(" · ");
  $("sheetCapitalLabel").textContent = t("capitalLabel", profile.lang);
  $("sheetCapital").textContent = capitalName(unit, profile.lang);
  if (unit.capitalNote) {
    const note = document.createElement("span");
    note.className = "muted";
    note.textContent = `  (${unit.capitalNote[profile.lang === "hi" ? "hi" : "en"]})`;
    $("sheetCapital").append(note);
  }
  $("sheetFactLabel").textContent = t("factLabel", profile.lang);
  $("sheetFact").textContent = factOf(unit);
  $("sheetListen").textContent = `🔊 ${t("listen", profile.lang)}`;
  $("sheetQuiz").textContent = L("Isse quiz karo", "इससे क्विज़ करो", "Quiz this");
  $("sheetBackdrop").hidden = false;
  sound("tap");
}

function closeSheet() {
  $("sheetBackdrop").hidden = true;
  stopSpeaking();
}

function openList() {
  const sheet = $("listBackdrop");
  $("listTitle").textContent = t("allStates", profile.lang);
  $("listMeta").textContent = `${STATES.length} · ${t("learnSub", profile.lang)}`;
  $("listSearch").placeholder = t("searchPlaceholder", profile.lang);
  $("listSearch").value = "";
  renderList("");
  sheet.hidden = false;
  sound("tap");
}

function closeList() {
  $("listBackdrop").hidden = true;
}

function renderList(query) {
  const q = query.trim().toLowerCase();
  const rows = $("listRows");
  rows.replaceChildren();
  const matches = STATES.filter((unit) => {
    if (!q) return true;
    return (
      unit.name.en.toLowerCase().includes(q) ||
      unit.name.hi.includes(q) ||
      unit.capital.en.toLowerCase().includes(q) ||
      unit.capital.hi.includes(q)
    );
  }).sort((a, b) => unitName(a, profile.lang).localeCompare(unitName(b, profile.lang)));

  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = t("noMatch", profile.lang);
    rows.append(empty);
    return;
  }

  for (const unit of matches) {
    const stat = unitStat(profile, unit.id);
    const row = document.createElement("button");
    row.className = "list-row";
    row.innerHTML = `
      <span class="row-main">
        <span class="row-name"></span>
        <span class="row-cap"></span>
      </span>
      ${unit.type === "ut" ? `<span class="tag">${t("utLabel", profile.lang)}</span>` : ""}
      <span class="mastery"><i></i></span>
    `;
    row.querySelector(".row-name").textContent = unitName(unit, profile.lang);
    row.querySelector(".row-cap").textContent = capitalName(unit, profile.lang);
    row.querySelector(".mastery i").style.width = `${Math.round(stat.mastery)}%`;
    row.addEventListener("click", () => {
      closeList();
      if (ui.learnMap) {
        ui.learnMap.setClass(unit.id, "is-hint", true);
        setTimeout(() => ui.learnMap?.setClass(unit.id, "is-hint", false), 2400);
      }
      openSheet(unit.id);
    });
    rows.append(row);
  }
}

/* ---------------------------------------------------------------- quiz */

function startQuiz(mode, options = {}) {
  const region = options.region || ui.region;
  let pool = poolFor(region);
  if (mode === "weak") {
    pool = weakUnits(profile, poolFor(region), 12);
  }
  if (!pool.length) {
    toast(t("weakNone", profile.lang));
    return;
  }

  const isSprint = mode === "sprint";
  const total = isSprint ? pool.length : ROUND_SIZE;
  let questions;

  if (isSprint) {
    questions = sprintSequence(pool).map((id) => ({ mode: "locate", targetId: id }));
  } else {
    questions = [];
    for (let i = 0; i < total; i++) {
      const recent = questions.slice(-6).map((q) => q.targetId);
      let question = makeQuestion(mode, pool, profile, Math.random, recent);
      if (i === 0 && options.focusId && UNITS[options.focusId]) {
        question =
          mode === "identify" || mode === "capital"
            ? makeQuestion(mode, [UNITS[options.focusId]], profile)
            : { mode: "locate", targetId: options.focusId };
      }
      questions.push(question);
    }
  }

  clearQuizTimer();
  ui.quiz = {
    mode,
    region,
    questions,
    total,
    index: 0,
    score: 0,
    xp: 0,
    runStreak: 0,
    mistakes: [],
    hint: false,
    answered: false,
    lastResult: null,
    startedAt: Date.now(),
    elapsed: 0,
    timerId: null,
    advanceTimer: null,
    map: null,
    finished: false,
  };

  setScreen("quiz");
  $("hudTimer").hidden = !isSprint;
  if (isSprint) {
    ui.quiz.timerId = setInterval(() => {
      if (!ui.quiz) return;
      ui.quiz.elapsed = (Date.now() - ui.quiz.startedAt) / 1000;
      $("hudTimer").innerHTML = `⏱ <b>${formatTime(ui.quiz.elapsed)}</b>`;
    }, 500);
  }
  renderQuestion();
}

function currentQuestion() {
  return ui.quiz?.questions[ui.quiz.index];
}

function renderQuestion() {
  const quiz = ui.quiz;
  const question = currentQuestion();
  if (!quiz || !question) return;
  const unit = UNITS[question.targetId];

  quiz.answered = false;
  quiz.hint = false;
  quiz.lastResult = null;

  $("qProgress").style.width = `${(quiz.index / quiz.total) * 100}%`;
  updateHud();
  if (quiz.mode === "sprint") {
    $("hudTimer").innerHTML = `⏱ <b>${formatTime(quiz.elapsed)}</b>`;
  }

  const promptNode = $("prompt");
  let headline = "";
  let sub = "";
  if (question.mode === "identify") {
    headline = identifyPrompt(profile.lang);
    sub = t("tapState", profile.lang) === headline ? "" : L("Naksha dekh ke socho", "नक्शा देखकर सोचो", "Look at the map and decide");
  } else if (question.mode === "capital") {
    headline = capitalPrompt(unitName(unit, profile.lang), profile.lang);
  } else {
    headline = locatePrompt(unitName(unit, profile.lang), profile.lang);
    sub = t("tapState", profile.lang);
  }
  promptNode.innerHTML = `<h2></h2>${sub ? '<p class="prompt-sub"></p>' : ""}`;
  promptNode.querySelector("h2").textContent = headline;
  if (sub) promptNode.querySelector(".prompt-sub").textContent = sub;

  /* map */
  const wrapper = $("quizMap");
  const interactive = question.mode === "locate";
  if (quiz.map) quiz.map.destroy();
  quiz.map = createMap(wrapper, {
    labels: false,
    markers: true,
    interactive,
    onTap: (id) => onMapTap(id),
  });
  if (!interactive) {
    quiz.map.setClass(question.targetId, "is-target", true);
    for (const other of STATES) {
      if (other.id !== question.targetId) quiz.map.setClass(other.id, "is-dim", true);
    }
  }

  /* options */
  const optionsNode = $("options");
  optionsNode.replaceChildren();
  if (question.options) {
    optionsNode.hidden = false;
    question.options.forEach((option, i) => {
      const button = document.createElement("button");
      button.className = "option";
      button.dataset.key = optionKey(option);
      button.innerHTML = `<span class="key">${i + 1}</span><span class="label"></span>`;
      button.querySelector(".label").textContent =
        option.kind === "capital"
          ? option.capital[profile.lang === "hi" ? "hi" : "en"]
          : nameOf(option.id);
      button.addEventListener("click", () => onOptionPick(option, button));
      optionsNode.append(button);
    });
  } else {
    optionsNode.hidden = true;
  }

  $("feedback").hidden = true;
  $("feedback").classList.remove("bad");
  $("quizActions").hidden = false;
  $("hintBtn").disabled = false;
  $("hintBtn").textContent = t("hint", profile.lang);
  $("skipBtn").textContent = t("skip", profile.lang);
}

function onMapBackgroundTap() {
  const quiz = ui.quiz;
  if (!quiz || quiz.answered || quiz.finished) return;
  toast(t("tapMap", profile.lang), 1200);
}

function onMapTap(id) {
  const quiz = ui.quiz;
  const question = currentQuestion();
  if (!quiz || !question || quiz.answered || quiz.finished) return;
  if (question.mode !== "locate") return;

  const isRight = isCorrectTap(question.targetId, id);
  if (isRight) {
    quiz.map.setClass(id, "is-correct", true);
  } else {
    quiz.map.setClass(id, "is-wrong", true);
    quiz.map.setClass(question.targetId, "is-correct", true);
  }
  resolveAnswer(isRight);
}

function onOptionPick(option, button) {
  const quiz = ui.quiz;
  const question = currentQuestion();
  if (!quiz || !question || quiz.answered || quiz.finished) return;

  const isRight = isCorrectOption(question, option);
  for (const node of $("options").children) {
    if (node.dataset.key === optionKey(option)) {
      node.classList.add(isRight ? "correct" : "wrong");
    } else if (isRight && node.dataset.key !== optionKey(option)) {
      node.classList.add("muted");
    }
  }
  if (!isRight) {
    const rightKey = question.mode === "capital" ? UNITS[question.targetId].capital.en : question.targetId;
    for (const node of $("options").children) {
      if (node.dataset.key === rightKey) node.classList.add("correct");
      else if (node !== button) node.classList.add("muted");
    }
  }
  if (quiz.map) {
    quiz.map.setClass(question.targetId, isRight ? "is-correct" : "is-wrong", true);
  }
  resolveAnswer(isRight);
}

function resolveAnswer(isRight) {
  const quiz = ui.quiz;
  const question = currentQuestion();
  const unit = UNITS[question.targetId];

  quiz.answered = true;
  if (isRight) quiz.score += 1;
  else quiz.mistakes.push(question.targetId);

  const mode = quiz.mode === "sprint" ? "sprint" : quiz.mode === "weak" ? "locate" : quiz.mode;
  const result = recordAnswer(profile, question.targetId, isRight, {
    mode,
    hinted: quiz.hint,
  });
  profile = result.profile;
  quiz.xp += result.xpGain;
  quiz.lastResult = { isRight, targetId: question.targetId, xp: result.xpGain };
  saveProfile(profile);
  refreshLearnColors();

  if (isRight) quiz.runStreak += 1;
  else quiz.runStreak = 0;
  updateHud();
  $("hudStreak").classList.add("bump");
  setTimeout(() => $("hudStreak").classList.remove("bump"), 420);

  sound(isRight ? "good" : "bad");
  showFeedback(isRight, unit, result.xpGain);

  if (isRight) {
    quiz.advanceTimer = setTimeout(() => {
      quiz.advanceTimer = null;
      if (ui.quiz === quiz && !quiz.finished) nextQuestion();
    }, 950);
  }
}

function showFeedback(isRight, unit, xpGain) {
  const feedback = $("feedback");
  feedback.hidden = false;
  feedback.classList.toggle("bad", !isRight);
  $("feedbackTitle").textContent = isRight
    ? `${t("correct", profile.lang)} +${xpGain} XP`
    : `${t("wrongWas", profile.lang)} ${unitName(unit, profile.lang)}`;
  $("feedbackFact").textContent = factOf(unit);
  $("nextBtn").textContent =
    ui.quiz.index + 1 >= ui.quiz.total ? t("finish", profile.lang) : t("next", profile.lang);
  $("hintBtn").disabled = true;
  $("quizActions").hidden = true;
}

function updateHud() {
  const quiz = ui.quiz;
  if (!quiz) return;
  const progress = `${quiz.index + 1}/${quiz.total}`;
  $("qCounter").textContent = quiz.score ? `${progress} · ${quiz.score}✓` : progress;
  $("hudStreak").innerHTML = `<span class="flame">🔥</span><b>${quiz.runStreak}</b>`;
  $("hudScore").innerHTML = `★ <b>${quiz.xp}</b>`;
}

function nextQuestion() {
  const quiz = ui.quiz;
  if (!quiz || quiz.finished || !quiz.answered) return;
  quiz.answered = false;
  if (quiz.advanceTimer) {
    clearTimeout(quiz.advanceTimer);
    quiz.advanceTimer = null;
  }
  quiz.index += 1;
  if (quiz.index >= quiz.total) {
    finishQuiz();
    return;
  }
  renderQuestion();
}

function useHint() {
  const quiz = ui.quiz;
  const question = currentQuestion();
  if (!quiz || !question || quiz.answered || quiz.hint) return;
  quiz.hint = true;
  $("hintBtn").disabled = true;
  sound("tap");

  const unit = UNITS[question.targetId];
  if (question.mode === "locate") {
    const text = hintText(regionName(unit.region), profile.lang);
    let sub = $("prompt").querySelector(".prompt-sub");
    if (!sub) {
      sub = document.createElement("p");
      sub.className = "prompt-sub";
      $("prompt").append(sub);
    }
    sub.textContent = text;
    // pulse a neighbour so the eye starts searching in the right region
    const neighbours = STATES.filter((u) => u.region === unit.region && u.id !== unit.id);
    const decoy = neighbours[Math.floor(Math.random() * neighbours.length)];
    if (decoy && quiz.map) quiz.map.setClass(decoy.id, "is-hint", true);
    toast(t("hintUsed", profile.lang), 1600);
  } else {
    const targetKey =
      question.mode === "capital" ? UNITS[question.targetId].capital.en : question.targetId;
    const wrongButtons = [...$("options").children].filter((b) => b.dataset.key !== targetKey);
    const kill = wrongButtons.slice(0, 1);
    for (const node of kill) {
      node.classList.add("muted");
      node.disabled = true;
    }
    toast(t("hintUsed", profile.lang), 1600);
  }
}

function skipQuestion() {
  const quiz = ui.quiz;
  const question = currentQuestion();
  if (!quiz || !question || quiz.answered) return;
  if (quiz.map) quiz.map.setClass(question.targetId, "is-correct", true);
  for (const node of $("options")?.children || []) {
    const targetKey =
      question.mode === "capital" ? UNITS[question.targetId].capital.en : question.targetId;
    if (node.dataset.key === targetKey) node.classList.add("correct");
  }
  resolveAnswer(false);
}

function finishQuiz() {
  const quiz = ui.quiz;
  if (!quiz) return;
  quiz.finished = true;
  clearQuizTimer();
  quiz.elapsed = (Date.now() - quiz.startedAt) / 1000;

  profile.rounds += 1;
  if (quiz.mode === "sprint" && quiz.score > 0) {
    if (profile.sprintBest == null || quiz.elapsed < profile.sprintBest) {
      profile.sprintBest = Math.round(quiz.elapsed);
    }
  }
  saveProfile(profile);

  setScreen("result");
  renderResult();
  sound(quiz.score === quiz.total ? "win" : "tap");
}

function renderResult() {
  const quiz = ui.quiz;
  const stars = starsFor(quiz.score, quiz.total);
  $("resultStars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
  $("resultTitle").textContent =
    quiz.score === quiz.total
      ? t("perfect", profile.lang)
      : quiz.mode === "sprint"
        ? t("sprintDone", profile.lang)
        : t("roundDone", profile.lang);
  $("resultSub").textContent =
    quiz.mode === "sprint"
      ? `${t("time", profile.lang)}: ${formatTime(quiz.elapsed)}`
      : t("roundDoneSub", profile.lang);

  const stats = $("resultStats");
  stats.replaceChildren();
  const boxes = [
    [`${quiz.score}/${quiz.total}`, t("score", profile.lang)],
    [`+${quiz.xp}`, t("xp", profile.lang)],
    [formatTime(quiz.elapsed), t("time", profile.lang)],
  ];
  for (const [value, label] of boxes) {
    const box = document.createElement("div");
    box.className = "stat-box";
    box.innerHTML = `<b>${value}</b><span>${label}</span>`;
    stats.append(box);
  }

  const missed = $("missedList");
  missed.replaceChildren();
  if (quiz.mistakes.length) {
    const title = document.createElement("h4");
    title.textContent = `${t("missed", profile.lang)} (${quiz.mistakes.length})`;
    const list = document.createElement("div");
    list.className = "missed-list";
    for (const id of [...new Set(quiz.mistakes)]) {
      const pill = document.createElement("span");
      pill.className = "missed-pill";
      pill.textContent = nameOf(id);
      list.append(pill);
    }
    missed.append(title, list);
  }

  $("practiceBtn").hidden = !quiz.mistakes.length;
  $("againBtn").textContent = t("playAgain", profile.lang);
  $("practiceBtn").textContent = t("practiceWeak", profile.lang);
  $("homeBtn").textContent = t("home", profile.lang);

  /* confetti for a good round */
  const confetti = $("confetti");
  confetti.replaceChildren();
  if (stars >= 2) {
    const colors = ["#ffb86b", "#2dd4a7", "#4cc3ff", "#a78bfa", "#ff6b6b"];
    for (let i = 0; i < 22; i++) {
      const bit = document.createElement("i");
      bit.style.left = `${Math.random() * 96}%`;
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = `${Math.random() * 0.5}s`;
      bit.style.transform = `rotate(${Math.random() * 180}deg)`;
      confetti.append(bit);
    }
  }
}

/* ---------------------------------------------------------------- wiring */

function rerender() {
  if (ui.screen === "home") renderHome();
  else if (ui.screen === "learn") {
    if (ui.learnMap) ui.learnMap.setLabelsAll((id) => mapLabel(UNITS[id], profile.lang));
    $("labelToggle").textContent = L("Naam", "नाम", "Names");
    $("learnHint").textContent = t("learnSub", profile.lang);
    $("legend").innerHTML = `
      <span><i class="dot state"></i>${t("stateLabel", profile.lang)}</span>
      <span><i class="dot ut"></i>${t("utLabel", profile.lang)}</span>
      <span><i class="dot done"></i>${t("memorised", profile.lang)}</span>
    `;
    if (ui.activeUnit && !$("sheetBackdrop").hidden) openSheet(ui.activeUnit.id);
    if (!$("listBackdrop").hidden) openList();
  } else if (ui.screen === "quiz" && ui.quiz) {
    const answered = ui.quiz.answered;
    const last = ui.quiz.lastResult;
    const question = currentQuestion();
    renderQuestion();
    if (answered && last && question) {
      ui.quiz.answered = true;
      if (last.isRight) {
        if (ui.quiz.map) ui.quiz.map.setClass(last.targetId, "is-correct", true);
      } else {
        if (ui.quiz.map) ui.quiz.map.setClass(last.targetId, "is-correct", true);
        for (const node of $("options").children) {
          const key = question.mode === "capital" ? UNITS[last.targetId].capital.en : last.targetId;
          if (node.dataset.key === key) node.classList.add("correct");
        }
      }
      ui.quiz.lastResult = last;
      showFeedback(last.isRight, UNITS[last.targetId], last.xp || 0);
    }
  } else if (ui.screen === "result" && ui.quiz) {
    renderResult();
  }
}

function leaveQuiz() {
  clearQuizTimer();
  if (ui.quiz?.map) ui.quiz.map.destroy();
  ui.quiz = null;
  setScreen("home");
  renderHome();
  toast(L("Round chhoda", "राउंड छोड़ा", "Round left"));
}

function wire() {
  $("backBtn").addEventListener("click", () => {
    if (ui.screen === "quiz") leaveQuiz();
    else if (ui.screen === "learn" || ui.screen === "result") {
      setScreen("home");
      renderHome();
    }
  });

  $("langBtn").addEventListener("click", () => {
    profile.lang = profile.lang === "hing" ? "hi" : profile.lang === "hi" ? "en" : "hing";
    saveProfile(profile);
    rerender();
    toast(
      profile.lang === "hi" ? "भाषा: हिंदी" : profile.lang === "en" ? "Language: English" : "Bhasha: Hinglish",
      1400
    );
  });

  $("soundBtn").addEventListener("click", () => {
    profile.sound = !profile.sound;
    saveProfile(profile);
    $("soundBtn").style.opacity = profile.sound ? "1" : "0.45";
    if (profile.sound) sound("tap");
    toast(t("sound", profile.lang) + (profile.sound ? " ✓" : " ✕"), 1200);
  });

  $("heroMapBtn").addEventListener("click", () => openLearn());
  $("quizMapWrap").addEventListener("click", onMapBackgroundTap);
  $("nextBtn").addEventListener("click", () => nextQuestion());
  $("hintBtn").addEventListener("click", () => useHint());
  $("skipBtn").addEventListener("click", () => skipQuestion());

  $("listBtn").addEventListener("click", () => openList());
  $("listClose").addEventListener("click", () => closeList());
  $("listBackdrop").addEventListener("click", (event) => {
    if (event.target === $("listBackdrop")) closeList();
  });
  $("listSearch").addEventListener("input", (event) => renderList(event.target.value));

  $("sheetClose").addEventListener("click", () => closeSheet());
  $("sheetBackdrop").addEventListener("click", (event) => {
    if (event.target === $("sheetBackdrop")) closeSheet();
  });
  $("sheetListen").addEventListener("click", () => {
    const unit = ui.activeUnit;
    if (!unit) return;
    const text =
      profile.lang === "hi"
        ? `${unit.name.hi}. राजधानी ${unit.capital.hi}. ${unit.fact.hi}`
        : `${unit.name.en}. Capital ${unit.capital.en}. ${unit.fact.en}`;
    const ok = speak(text, langCode(profile.lang));
    if (!ok) toast(L("Is browser me awaaz nahi chalti", "इस ब्राउज़र में आवाज़ नहीं चलती", "Speech is not available here"));
  });
  $("sheetQuiz").addEventListener("click", () => {
    const unit = ui.activeUnit;
    closeSheet();
    if (unit) startQuiz("locate", { region: unit.region, focusId: unit.id });
  });

  $("againBtn").addEventListener("click", () => {
    const { mode, region, mistakes } = ui.quiz;
    if (mode === "weak" && mistakes.length) startQuiz("weak", { region });
    else startQuiz(mode, { region });
  });
  $("practiceBtn").addEventListener("click", () => startQuiz("weak", { region: ui.quiz.region }));
  $("homeBtn").addEventListener("click", () => {
    setScreen("home");
    renderHome();
  });

  $("installBtn").addEventListener("click", async () => {
    const prompt = ui.installPrompt;
    if (!prompt) {
      toast(t("installHint", profile.lang), 3000);
      return;
    }
    prompt.prompt();
    try {
      await prompt.userChoice;
    } catch {
      /* ignore */
    }
    ui.installPrompt = null;
    $("installBtn").hidden = true;
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    ui.installPrompt = event;
    if ($("installBtn")) $("installBtn").hidden = false;
  });

  document.addEventListener("keydown", (event) => {
    if (ui.screen !== "quiz") return;
    if (event.key >= "1" && event.key <= "4") {
      const buttons = [...$("options").children];
      const index = Number(event.key) - 1;
      if (buttons[index] && !ui.quiz.answered) buttons[index].click();
    } else if (event.key === "Enter" && ui.quiz.answered) {
      nextQuestion();
    }
  });

  /* reset progress lives in the footer */
  $("resetBtn").addEventListener("click", () => {
    if (!window.confirm(t("resetAsk", profile.lang))) return;
    profile = resetProfile(profile);
    saveProfile(profile);
    renderHome();
    toast(L("Progress mit gaya", "प्रगति मिट गई", "Progress reset"), 1600);
  });
}

/* ---------------------------------------------------------------- boot */

function boot() {
  wire();
  setScreen("home");
  renderHome();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

boot();
