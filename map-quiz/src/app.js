/* Bharat Map Quiz — app controller. */

import {
  STATES,
  UNITS,
  REGIONS,
  mapLabel,
  unitName,
  capitalName,
  unitFact,
  regionName,
} from "./data.js";
import { t, langCode, settings } from "./i18n.js";
import {
  loadProfile,
  saveProfile,
  recordAnswer,
  unitStat,
  memorisedCount,
  accuracy,
  weakUnits,
  resetProfile,
  levelInfo,
  dailyStatus,
  recordDaily,
  todayKey,
} from "./store.js";
import {
  MODE_RULES,
  poolFor,
  buildRound,
  nextChallengeQuestion,
  isCorrectTap,
  isCorrectOption,
  optionKey,
  starsFor,
  formatTime,
  questionKindLabel,
} from "./quiz.js";
import { createMap, attachZoom } from "./map.js";
import { beep, speak, stopSpeaking, vibrate } from "./audio.js";
import {
  evaluate,
  withUnlocked,
  achievementList,
  unlockedCount,
  TOTAL_ACHIEVEMENTS,
} from "./achievements.js";

const $ = (id) => document.getElementById(id);
const MAP_TOTAL = STATES.length;
const TIMED_MODES = new Set(["timed", "challenge"]);

let profile = loadProfile();

const ui = {
  screen: "home",
  region: "all",
  labelsMode: "states",
  heroMap: null,
  learnMap: null,
  zoom: null,
  quiz: null,
  activeUnit: null,
  installPrompt: null,
  toastTimer: null,
};

/* ---------------------------------------------------------------- helpers */

function toast(message, ms = 2100) {
  const node = $("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => node.classList.remove("show"), ms);
}

function sound(kind) {
  if (!profile.sound) return;
  beep(kind);
  vibrate(kind === "bad" ? [20, 40, 20] : 12);
}

function nameOf(id) {
  const unit = UNITS[id];
  return unit ? unitName(unit, profile.stateNames) : id;
}

function capitalOf(id) {
  const unit = UNITS[id];
  return unit ? capitalName(unit, profile.stateNames) : id;
}

function setScreen(name) {
  ui.screen = name;
  for (const screen of document.querySelectorAll(".screen")) {
    screen.hidden = screen.dataset.screen !== name;
  }
  $("backBtn").hidden = name === "home";
  const tabbar = $("tabbar");
  tabbar.hidden = name === "quiz" || name === "result";
  for (const tab of tabbar.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab.dataset.tab === name || (name === "result" && tab.dataset.tab === "home"));
  }
  if (name !== "learn") stopSpeaking();
  // a finished round can be dropped once we move somewhere other than its result screen
  if (name !== "quiz" && name !== "result" && ui.quiz?.finished) leaveQuizState();
  const area = document.querySelector(`.screen[data-screen="${name}"] .scroll-area`);
  if (area) area.scrollTop = 0;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return t("helloMorning");
  if (hour < 17) return t("helloDay");
  if (hour < 21) return t("helloEvening");
  return t("helloNight");
}

/* ---------------------------------------------------------------- level */

function paintLevel(info, ids) {
  const [badge, title, xp, bar, next] = ids;
  $(badge).textContent = `Lv ${info.level}`;
  $(title).textContent = info.title;
  $(xp).textContent = `${profile.xp} XP`;
  $(bar).style.width = `${Math.round(info.progress * 100)}%`;
  $(next).textContent = info.next ? `Next: ${info.next} · ${info.span - info.into} XP to go` : "Top level reached 👑";
}

/* ---------------------------------------------------------------- home */

function renderHome() {
  $("brandTitle").textContent = t("appName");
  $("brandSub").textContent = t("tagline");

  const info = levelInfo(profile.xp);
  $("levelBtn").textContent = `Lv ${info.level}`;
  paintLevel(info, ["levelBadge", "levelTitle", "levelXp", "levelBar", "levelNext"]);

  const mastered = memorisedCount(profile, STATES);
  $("homeGreeting").textContent = greeting();
  $("homeHeadline").textContent = mastered
    ? t("homeHeadlineProgress", mastered)
    : t("homeHeadlineStart");
  $("masteredCount").textContent = String(mastered);
  $("masteredOf").textContent = `/ ${MAP_TOTAL}`;
  const circumference = 264;
  $("ringFg").style.strokeDashoffset = String(circumference - (circumference * mastered) / MAP_TOTAL);

  renderDaily();
  renderHeroMap();

  $("poolTitle").textContent = t("region");
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
    button.append(emoji, document.createTextNode(region.label));
    button.addEventListener("click", () => {
      ui.region = region.id;
      renderHome();
    });
    chips.append(button);
  }
  $("poolCount").textContent = `${poolFor(ui.region).length} states`;

  renderModeCards();
  renderStatsRow();
  renderWeakCard();

  const standalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  const installCard = $("installCard");
  installCard.hidden = standalone || !ui.installPrompt;
  $("installHint").textContent = t("installHint");
  $("footerBuilt").textContent = t("credits");
}

function renderHeroMap() {
  if (!ui.heroMap) {
    ui.heroMap = createMap($("heroMap"), { interactive: false, labels: false, markers: false });
  }
  for (const unit of STATES) {
    const stat = unitStat(profile, unit.id);
    ui.heroMap.setClass(unit.id, "is-done", stat.mastery >= 80);
    ui.heroMap.setClass(unit.id, "is-seen", stat.seen > 0 && stat.mastery < 80);
  }
}

function renderDaily() {
  const status = dailyStatus(profile);
  $("dailyKicker").textContent = `📅 ${t("daily")}`;
  if (status.done) {
    $("dailyTitle").textContent = `${status.score}/${status.total} · ${t("dailyDone")}`;
    $("dailySub").textContent =
      status.streak > 1 ? `${status.streak} day streak 🔥` : t("dailySub");
    $("dailyCta").textContent = t("dailyAgain");
  } else {
    $("dailyTitle").textContent = t("dailySub");
    $("dailySub").textContent = new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "short",
    });
    $("dailyCta").textContent = t("dailyPlay");
  }
  $("dailyCard").classList.toggle("done", status.done);
}

const CORE_MODES = [
  { mode: "locate", icon: "📍", accent: "#4cc3ff" },
  { mode: "identify", icon: "🧭", accent: "#a78bfa" },
  { mode: "capital", icon: "🏛️", accent: "#ffb86b" },
  { mode: "neighbours", icon: "🧩", accent: "#2dd4a7" },
];

const EXTRA_MODES = [
  { mode: "timed", icon: "⏱️", accent: "#ff6b6b", badge: "10s" },
  { mode: "challenge", icon: "❤️", accent: "#f472b6", badge: "3 lives" },
  { mode: "sprint", icon: "⚡", accent: "#facc15", badge: "36" },
];

function modeCard({ mode, icon, accent, badge }, wide = false) {
  const card = document.createElement("button");
  card.className = "mode-card" + (wide ? " wide" : "");
  card.style.setProperty("--accent", accent);
  card.dataset.mode = mode;
  const label = badge || (MODE_RULES[mode]?.questions ? `${MODE_RULES[mode].questions} Q` : "");
  card.innerHTML = `
    <span class="mode-icon">${icon}</span>
    <span class="mode-text">
      <strong>${t(mode)}</strong>
      <span class="mode-sub">${t(mode + "Sub")}</span>
    </span>
    ${label ? `<span class="mode-badge">${label}</span>` : ""}
  `;
  card.addEventListener("click", () => startQuiz(mode));
  return card;
}

function renderModeCards() {
  $("playTitle").textContent = t("modes");
  const grid = $("modeGrid");
  grid.replaceChildren();
  for (const item of CORE_MODES) grid.append(modeCard(item));

  $("challengeTitle").textContent = t("extraModes");
  const extra = $("extraGrid");
  extra.replaceChildren();
  for (const item of EXTRA_MODES.slice(0, 2)) extra.append(modeCard(item));
  extra.append(modeCard({ ...EXTRA_MODES[2], badge: `${poolFor(ui.region).length}` }, true));

  const learn = document.createElement("button");
  learn.className = "mode-card wide";
  learn.style.setProperty("--accent", "#ff9f45");
  learn.innerHTML = `
    <span class="mode-icon">🗺️</span>
    <span class="mode-text">
      <strong>${t("learn")}</strong>
      <span class="mode-sub">${t("learnSub")}</span>
    </span>
    <span class="mode-badge">${MAP_TOTAL}</span>
  `;
  learn.addEventListener("click", () => openLearn());
  grid.append(learn);
}

function renderStatsRow() {
  const status = dailyStatus(profile);
  const boxes = [
    [String(profile.xp), "XP"],
    [`${accuracy(profile)}%`, t("accuracy")],
    [String(profile.bestStreak), t("bestStreak")],
    [status.streak ? `${status.streak}🔥` : "—", "Daily streak"],
  ];
  const row = $("statsRow");
  row.replaceChildren();
  for (const [value, label] of boxes) {
    const box = document.createElement("div");
    box.className = "stat-box";
    box.innerHTML = `<b>${value}</b><span>${label}</span>`;
    row.append(box);
  }
}

function renderWeakCard() {
  const weak = weakUnits(profile, poolFor(ui.region), 5);
  const card = $("weakCard");
  card.replaceChildren();
  const title = document.createElement("h4");
  title.textContent = t("weak");
  card.append(title);

  if (!weak.some((unit) => unitStat(profile, unit.id).seen)) {
    const hint = document.createElement("p");
    hint.textContent = t("weakSub");
    card.append(hint);
    const play = document.createElement("button");
    play.className = "btn btn-ghost small-btn";
    play.textContent = t("weak");
    play.addEventListener("click", () => startQuiz("weak"));
    card.append(play);
    return;
  }

  const list = document.createElement("div");
  list.className = "weak-list";
  for (const unit of weak) {
    const stat = unitStat(profile, unit.id);
    const pill = document.createElement("button");
    pill.className = "weak-pill" + (stat.mastery >= 80 ? " ok" : "");
    pill.textContent = `${unitName(unit, profile.stateNames)} · ${Math.round(stat.mastery)}%`;
    pill.addEventListener("click", () => startQuiz("weak", { region: unit.region, focusId: unit.id }));
    list.append(pill);
  }
  card.append(list);
}

/* ---------------------------------------------------------------- learn */

function openLearn() {
  setScreen("learn");
  if (!ui.learnMap) {
    ui.learnMap = createMap($("learnMap"), { labels: true, onTap: (id) => openSheet(id) });
    ui.zoom = attachZoom($("learnMapWrap"), $("learnMap"));
    $("zoomIn").addEventListener("click", () => ui.zoom.zoomIn());
    $("zoomOut").addEventListener("click", () => ui.zoom.zoomOut());
    $("labelToggle").addEventListener("click", () => {
      ui.labelsMode =
        ui.labelsMode === "states" ? "capitals" : ui.labelsMode === "capitals" ? "off" : "states";
      applyLearnLabels();
    });
  }
  $("learnHint").textContent = t("learnHint");
  applyLearnLabels();
  refreshLearnColors();
  renderLegend();
}

function applyLearnLabels() {
  if (!ui.learnMap) return;
  $("labelToggle").textContent =
    ui.labelsMode === "states"
      ? t("labelsStates")
      : ui.labelsMode === "capitals"
        ? t("labelsCapitals")
        : t("labelsOff");
  $("labelToggle").setAttribute("aria-pressed", String(ui.labelsMode !== "off"));
  ui.learnMap.setLabelsVisible(ui.labelsMode !== "off");
  if (ui.labelsMode === "capitals") {
    ui.learnMap.setLabelsAll((id) => capitalName(UNITS[id], profile.stateNames));
  } else {
    ui.learnMap.setLabelsAll((id) => mapLabel(UNITS[id], profile.stateNames));
  }
}

function renderLegend() {
  $("legend").innerHTML = `
    <span><i class="dot state"></i>${t("state")}</span>
    <span><i class="dot ut"></i>${t("ut")}</span>
    <span><i class="dot done"></i>${t("masteredLegend")}</span>
  `;
}

function refreshLearnColors() {
  if (!ui.learnMap) return;
  for (const unit of STATES) {
    ui.learnMap.setClass(unit.id, "is-done", unitStat(profile, unit.id).mastery >= 80);
  }
}

function openSheet(id) {
  const unit = UNITS[id];
  if (!unit) return;
  ui.activeUnit = unit;
  const stat = unitStat(profile, id);
  $("sheetName").textContent = unitName(unit, profile.stateNames);
  $("sheetMeta").textContent = [
    unit.type === "ut" ? t("ut") : t("state"),
    regionName(unit.region),
    `${t("memorised")}: ${Math.round(stat.mastery)}%`,
  ].join(" · ");
  $("sheetCapitalLabel").textContent = t("capitalLabel");
  $("sheetCapital").textContent = capitalName(unit, profile.stateNames);
  if (unit.capitalNote) {
    const note = document.createElement("span");
    note.className = "muted";
    note.textContent = ` (${unit.capitalNote[profile.stateNames === "hi" ? "hi" : "en"]})`;
    $("sheetCapital").append(note);
  }
  $("sheetFactLabel").textContent = t("factLabel");
  $("sheetFact").textContent = unitFact(unit, profile.stateNames);
  $("sheetListen").textContent = `🔊 ${t("listen")}`;
  $("sheetQuiz").textContent = t("quizThis");
  $("sheetBackdrop").hidden = false;
  sound("tap");
}

function closeSheet() {
  $("sheetBackdrop").hidden = true;
  stopSpeaking();
}

function openList() {
  $("listTitle").textContent = t("stateSearch");
  $("listMeta").textContent = `${STATES.length} · ${t("tagline")}`;
  $("listSearch").placeholder = t("search");
  $("listSearch").value = "";
  renderList("");
  $("listBackdrop").hidden = false;
  sound("tap");
}

function closeList() {
  $("listBackdrop").hidden = true;
}

function stateRow(unit) {
  const stat = unitStat(profile, unit.id);
  const row = document.createElement("button");
  row.className = "list-row";
  row.innerHTML = `
    <span class="row-main">
      <span class="row-name"></span>
      <span class="row-cap"></span>
    </span>
    ${unit.type === "ut" ? `<span class="tag">${t("ut")}</span>` : ""}
    <span class="mastery"><i></i></span>
  `;
  row.querySelector(".row-name").textContent = unitName(unit, profile.stateNames);
  row.querySelector(".row-cap").textContent = capitalName(unit, profile.stateNames);
  row.querySelector(".mastery i").style.width = `${Math.round(stat.mastery)}%`;
  return row;
}

function matchesQuery(unit, q) {
  if (!q) return true;
  return (
    unit.name.en.toLowerCase().includes(q) ||
    unit.name.hi.includes(q) ||
    unit.capital.en.toLowerCase().includes(q) ||
    unit.capital.hi.includes(q)
  );
}

function renderList(query) {
  const q = query.trim().toLowerCase();
  const rows = $("listRows");
  rows.replaceChildren();
  const matches = STATES.filter((unit) => matchesQuery(unit, q)).sort((a, b) =>
    unitName(a, profile.stateNames).localeCompare(unitName(b, profile.stateNames))
  );
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = t("noResults");
    rows.append(empty);
    return;
  }
  for (const unit of matches) {
    const row = stateRow(unit);
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
  if (mode === "weak") pool = weakUnits(profile, poolFor(region), 12);
  if (!pool.length) {
    toast(t("weakSub"));
    return;
  }

  const daily = mode === "daily" ? dailyStatus(profile) : null;
  if (daily?.done && !options.allowReplay) {
    toast(`${daily.score}/${daily.total} · ${t("dailyDone")} — ${daily.streak} day streak`);
    return;
  }

  const round = buildRound(mode, pool, profile, {
    seed: mode === "daily" ? todayKey() : null,
    focusId: options.focusId,
  });

  clearAllTimers();
  ui.quiz = {
    mode,
    region,
    questions: round.questions,
    total: round.total,
    endless: Boolean(round.endless),
    timerPerQuestion: round.timer,
    lives: round.lives || 0,
    maxLives: round.lives || 0,
    index: 0,
    score: 0,
    xp: 0,
    runStreak: 0,
    bestRunStreak: 0,
    mistakes: [],
    log: [],
    unlocked: [],
    answered: false,
    hint: false,
    lastResult: null,
    startedAt: Date.now(),
    elapsed: 0,
    timerId: null,
    qTimerId: null,
    qDeadline: 0,
    advanceTimer: null,
    map: null,
    finished: false,
    rng: Math.random,
  };

  setScreen("quiz");
  $("hudTimer").hidden = !TIMED_MODES.has(mode);
  $("hudLives").hidden = mode !== "challenge";
  if (TIMED_MODES.has(mode)) {
    ui.quiz.timerId = setInterval(() => {
      if (!ui.quiz) return;
      if (ui.quiz.mode === "timed") {
        ui.quiz.elapsed = (Date.now() - ui.quiz.startedAt) / 1000;
        $("hudTimer").innerHTML = `⏱ <b>${formatTime(ui.quiz.elapsed)}</b>`;
      }
    }, 500);
  }
  renderQuestion();
}

function currentQuestion() {
  return ui.quiz?.questions[ui.quiz.index];
}

function clearQuestionTimer() {
  if (ui.quiz?.qTimerId) {
    clearInterval(ui.quiz.qTimerId);
    ui.quiz.qTimerId = null;
  }
}

function clearAllTimers() {
  clearQuestionTimer();
  if (ui.quiz?.timerId) {
    clearInterval(ui.quiz.timerId);
    ui.quiz.timerId = null;
  }
  if (ui.quiz?.advanceTimer) {
    clearTimeout(ui.quiz.advanceTimer);
    ui.quiz.advanceTimer = null;
  }
}

function renderQuestion() {
  const quiz = ui.quiz;
  const question = currentQuestion();
  if (!quiz || !question) return;
  const unit = UNITS[question.targetId];

  quiz.answered = false;
  quiz.hint = false;
  quiz.lastResult = null;
  clearQuestionTimer();

  updateHud();

  /* prompt */
  const promptNode = $("prompt");
  let headline = "";
  let sub = "";
  let speakText = "";
  if (question.mode === "identify") {
    headline = t("whichState");
    sub = "Look at the map and pick the name";
    speakText = headline;
  } else if (question.mode === "capital") {
    headline = t("capitalOf", unitName(unit, profile.stateNames));
    speakText = headline;
  } else if (question.mode === "capitalReverse") {
    headline = t("stateOfCapital", capitalName(unit, profile.stateNames));
    speakText = headline;
  } else if (question.mode === "neighbours") {
    headline = t("neighbourOf", unitName(unit, profile.stateNames));
    sub = "Tap the state that shares a border";
    speakText = headline;
  } else {
    headline = t("whereIs", unitName(unit, profile.stateNames));
    sub = t("tapState");
    speakText = t("whereIs", unitName(unit, profile.stateNames));
  }

  promptNode.replaceChildren();
  const h2 = document.createElement("h2");
  h2.textContent = headline;
  promptNode.append(h2);
  if (sub) {
    const p = document.createElement("p");
    p.className = "prompt-sub";
    p.textContent = sub;
    promptNode.append(p);
  }
  const listen = document.createElement("button");
  listen.className = "listen-btn";
  listen.type = "button";
  listen.setAttribute("aria-label", t("listen"));
  listen.textContent = "🔊";
  listen.addEventListener("click", () => speak(speakText, langCode(profile.stateNames)));
  promptNode.append(listen);

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
    if (question.mode === "neighbours") {
      // the target stays visible; neighbours stay dim so the answer is not given away
      quiz.map.setClass(question.targetId, "is-target", true);
    }
  }

  /* options */
  const optionsNode = $("options");
  optionsNode.replaceChildren();
  if (question.options) {
    optionsNode.hidden = false;
    question.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.className = "option";
      button.dataset.key = optionKey(option);
      button.innerHTML = `<span class="key">${index + 1}</span><span class="label"></span>`;
      button.querySelector(".label").textContent =
        option.kind === "capital"
          ? option.capital[profile.stateNames === "hi" ? "hi" : "en"]
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
  $("hintBtn").textContent = t("hint");
  $("skipBtn").textContent = t("skip");

  startQuestionTimer();
}

function updateHud() {
  const quiz = ui.quiz;
  if (!quiz) return;
  const total = quiz.endless ? "∞" : quiz.total;
  $("qCounter").textContent = `${quiz.index + 1}/${total}${quiz.score ? ` · ${quiz.score}✓` : ""}`;
  $("qProgress").style.width = quiz.endless
    ? `${Math.min(100, (quiz.index / 20) * 100)}%`
    : `${(quiz.index / quiz.total) * 100}%`;
  $("hudStreak").innerHTML = `<span class="flame">🔥</span><b>${quiz.runStreak}</b>`;
  $("hudScore").innerHTML = `★ <b>${quiz.xp}</b>`;
  if (quiz.maxLives) {
    $("hudLives").innerHTML = "❤️".repeat(quiz.lives) + "🖤".repeat(Math.max(0, quiz.maxLives - quiz.lives));
  }
}

function startQuestionTimer() {
  const quiz = ui.quiz;
  const bar = $("qTimerBar");
  if (!quiz || !quiz.timerPerQuestion) {
    $("qTimer").hidden = true;
    return;
  }
  $("qTimer").hidden = false;
  quiz.qDeadline = Date.now() + quiz.timerPerQuestion * 1000;
  bar.style.width = "100%";
  bar.classList.remove("low");
  quiz.qTimerId = setInterval(() => {
    if (!ui.quiz || ui.quiz.answered) return;
    const left = Math.max(0, quiz.qDeadline - Date.now());
    const ratio = left / (quiz.timerPerQuestion * 1000);
    bar.style.width = `${ratio * 100}%`;
    bar.classList.toggle("low", ratio < 0.34);
    if (left <= 0) resolveAnswer(false, { timedOut: true });
  }, 100);
}

function onMapBackgroundTap() {
  const quiz = ui.quiz;
  if (!quiz || quiz.answered || quiz.finished) return;
  toast(t("tapOnMap"), 1200);
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
  resolveAnswer(isRight, { chosenId: id });
}

function onOptionPick(option, button) {
  const quiz = ui.quiz;
  const question = currentQuestion();
  if (!quiz || !question || quiz.answered || quiz.finished) return;

  const isRight = isCorrectOption(question, option);
  markOptions(question, isRight ? option : null, button);
  if (quiz.map) quiz.map.setClass(question.targetId, isRight ? "is-correct" : "is-wrong", true);
  resolveAnswer(isRight, { chosen: option });
}

function markOptions(question, chosen, chosenButton) {
  const rightKeys = new Set(
    question.options.filter((option) => isCorrectOption(question, option)).map(optionKey)
  );
  for (const node of $("options").children) {
    const key = node.dataset.key;
    if (rightKeys.has(key)) node.classList.add("correct");
    else if (node === chosenButton) node.classList.add("wrong");
    else node.classList.add("muted");
    node.disabled = true;
  }
}

function resolveAnswer(isRight, details = {}) {
  const quiz = ui.quiz;
  const question = currentQuestion();
  if (!quiz || !question || quiz.answered) return;
  const unit = UNITS[question.targetId];
  const timedOut = Boolean(details.timedOut);

  quiz.answered = true;
  clearQuestionTimer();
  if (isRight) quiz.score += 1;
  else quiz.mistakes.push(question.targetId);

  if (isRight) {
    quiz.runStreak += 1;
    quiz.bestRunStreak = Math.max(quiz.bestRunStreak, quiz.runStreak);
  } else {
    quiz.runStreak = 0;
    if (quiz.maxLives) quiz.lives = Math.max(0, quiz.lives - 1);
  }

  const levelBefore = levelInfo(profile.xp).level;
  const mode = quiz.mode;
  const result = recordAnswer(profile, question.targetId, isRight, {
    mode,
    answerType: question.mode,
    hinted: quiz.hint,
    timedOut,
  });
  profile = result.profile;
  const levelAfter = levelInfo(profile.xp);
  if (levelAfter.level > levelBefore) {
    setTimeout(() => toast(`⬆️ Level ${levelAfter.level} — ${levelAfter.title}`, 2800), 650);
  }
  quiz.xp += result.xpGain;
  quiz.lastResult = { isRight, targetId: question.targetId, xp: result.xpGain, timedOut };
  quiz.log.push({
    mode: question.mode,
    kind: questionKindLabel(question),
    targetId: question.targetId,
    isRight,
    timedOut,
  });
  saveProfile(profile);
  refreshLearnColors();

  const unlocked = evaluate(profile, {
    mode: quiz.mode,
    score: quiz.score,
    total: quiz.endless ? quiz.index + 1 : quiz.total,
    bestRunStreak: quiz.bestRunStreak,
  });
  if (unlocked.length) {
    profile = withUnlocked(profile, unlocked);
    saveProfile(profile);
    quiz.unlocked.push(...unlocked);
    const first = achievementList(profile).find((a) => a.id === unlocked[0]);
    if (first) toast(`🏆 ${first.title} — ${first.detail}`, 2600);
  }

  updateHud();
  $("hudStreak").classList.add("bump");
  setTimeout(() => $("hudStreak").classList.remove("bump"), 420);

  sound(isRight ? "good" : "bad");
  showFeedback(isRight, unit, result.xpGain, timedOut);

  const lastLife = quiz.maxLives > 0 && quiz.lives === 0;
  if (isRight && !lastLife) {
    quiz.advanceTimer = setTimeout(() => {
      quiz.advanceTimer = null;
      if (ui.quiz === quiz && !quiz.finished) nextQuestion();
    }, quiz.timerPerQuestion ? 900 : 1150);
  }
}

function correctAnswerText(question) {
  if (question.mode === "capital") {
    return `${capitalOf(question.targetId)} (capital of ${nameOf(question.targetId)})`;
  }
  if (question.mode === "neighbours") {
    return `any state bordering ${nameOf(question.targetId)}`;
  }
  if (question.mode === "capitalReverse") {
    return `${nameOf(question.targetId)} — capital ${capitalOf(question.targetId)}`;
  }
  return nameOf(question.targetId);
}

function showFeedback(isRight, unit, xpGain, timedOut = false) {
  const feedback = $("feedback");
  const quiz = ui.quiz;
  feedback.hidden = false;
  feedback.classList.toggle("bad", !isRight);
  $("feedbackTitle").textContent = isRight
    ? `${t("correct")} +${xpGain} XP`
    : `${timedOut ? t("timesUp") : ""} ${t("notQuite", nameOf(unit.id))}`.trim();
  $("feedbackFact").textContent = unitFact(unit, profile.stateNames);
  const isLast = !quiz.endless && quiz.index + 1 >= quiz.total;
  const outOfLives = quiz.maxLives > 0 && quiz.lives === 0;
  $("nextBtn").textContent = isLast || outOfLives ? t("finish") : t("next");
  $("hintBtn").disabled = true;
  $("quizActions").hidden = true;
}

function nextQuestion() {
  const quiz = ui.quiz;
  if (!quiz || quiz.finished || !quiz.answered) return;
  quiz.answered = false;
  if (quiz.advanceTimer) {
    clearTimeout(quiz.advanceTimer);
    quiz.advanceTimer = null;
  }
  const outOfLives = quiz.maxLives > 0 && quiz.lives === 0;

  if (quiz.endless && !outOfLives) {
    quiz.questions.push(nextChallengeQuestion(quiz.mode, poolFor(quiz.region), profile));
    quiz.index = quiz.questions.length - 1;
    renderQuestion();
    return;
  }

  quiz.index += 1;
  if (quiz.index >= quiz.total || outOfLives) {
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
  let text = "";
  if (question.mode === "locate" || question.mode === "neighbours") {
    text = t("hintRegion", regionName(unit.region));
    const neighbours = STATES.filter((u) => u.region === unit.region && u.id !== unit.id);
    const decoy = neighbours[Math.floor(Math.random() * neighbours.length)];
    if (decoy && quiz.map) quiz.map.setClass(decoy.id, "is-hint", true);
  } else if (question.mode === "capital") {
    text = t("hintFirstLetter", capitalName(unit, profile.stateNames).charAt(0));
  } else if (question.mode === "capitalReverse") {
    text = t("hintRegion", regionName(unit.region));
  } else {
    text = t("hintFirstLetter", unitName(unit, profile.stateNames).charAt(0));
  }

  let sub = $("prompt").querySelector(".prompt-sub");
  if (!sub) {
    sub = document.createElement("p");
    sub.className = "prompt-sub";
    $("prompt").append(sub);
  }
  sub.textContent = text;
  toast(t("hintUsed"), 1600);
}

function skipQuestion() {
  const quiz = ui.quiz;
  const question = currentQuestion();
  if (!quiz || !question || quiz.answered) return;
  if (quiz.map) quiz.map.setClass(question.targetId, "is-correct", true);
  if (question.options) markOptions(question, null, null);
  resolveAnswer(false, { skipped: true });
}

function finishQuiz() {
  const quiz = ui.quiz;
  if (!quiz) return;
  quiz.finished = true;
  clearAllTimers();
  quiz.elapsed = (Date.now() - quiz.startedAt) / 1000;

  profile.rounds += 1;
  if (quiz.mode === "sprint" && quiz.score > 0) {
    if (profile.sprintBest == null || quiz.elapsed < profile.sprintBest) {
      profile.sprintBest = Math.round(quiz.elapsed);
    }
  }
  if (quiz.mode === "daily") {
    const status = dailyStatus(profile);
    if (!status.done) profile = recordDaily(profile, quiz.score, quiz.total);
  }

  quiz.total = quiz.endless ? quiz.index + 1 : quiz.total;
  const unlocked = evaluate(profile, {
    mode: quiz.mode,
    score: quiz.score,
    total: quiz.total,
    bestRunStreak: quiz.bestRunStreak,
  });
  if (unlocked.length) {
    profile = withUnlocked(profile, unlocked);
    quiz.unlocked.push(...unlocked);
  }
  saveProfile(profile);

  setScreen("result");
  renderResult();
  sound(quiz.score === quiz.total ? "win" : "tap");
}

function renderResult() {
  const quiz = ui.quiz;
  if (!quiz) return;
  const stars = starsFor(quiz.score, quiz.total);
  $("resultStars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);

  let title = t("roundComplete");
  if (quiz.score === quiz.total && quiz.total >= 5) title = t("perfect");
  if (quiz.mode === "sprint") title = t("sprintComplete");
  if (quiz.mode === "challenge") title = t("survivalOver");
  $("resultTitle").textContent = title;

  const seconds = quiz.elapsed;
  const roundAccuracy = quiz.total ? Math.round((quiz.score / quiz.total) * 100) : 0;
  const newSprintBest =
    quiz.mode === "sprint" && profile.sprintBest != null && Math.round(seconds) === profile.sprintBest;
  const subParts = [
    quiz.mode === "sprint" ? `${t("time")}: ${formatTime(seconds)}` : `${roundAccuracy}% accuracy`,
    quiz.mode === "daily" ? `Daily streak: ${dailyStatus(profile).streak}` : null,
    newSprintBest ? t("newBest") : null,
  ].filter(Boolean);
  $("resultSub").textContent = subParts.join(" · ");

  const stats = $("resultStats");
  stats.replaceChildren();
  const boxes = [
    [`${quiz.score}/${quiz.total}`, t("correctAnswers")],
    [`+${quiz.xp}`, t("xpEarned")],
    [String(quiz.bestRunStreak), t("bestStreak")],
  ];
  for (const [value, label] of boxes) {
    const box = document.createElement("div");
    box.className = "stat-box";
    box.innerHTML = `<b>${value}</b><span>${label}</span>`;
    stats.append(box);
  }

  const unlocked = achievementList(profile).filter((a) => quiz.unlocked.includes(a.id));
  $("unlockedBox").hidden = !unlocked.length;
  $("unlockedTitle").textContent = t("achievements");
  const unlockedList = $("unlockedList");
  unlockedList.replaceChildren();
  for (const achievement of unlocked) {
    const chip = document.createElement("span");
    chip.className = "achievement-chip";
    chip.innerHTML = `<b>${achievement.icon}</b> ${achievement.title}`;
    unlockedList.append(chip);
  }

  renderReview();
  $("practiceBtn").hidden = !quiz.mistakes.length;
  $("againBtn").textContent = t("playAgain");
  $("practiceBtn").textContent = t("practiceWeak");
  $("shareBtn").textContent = t("share");
  $("homeBtn").textContent = t("home");

  const confetti = $("confetti");
  confetti.replaceChildren();
  if (stars >= 2) {
    const colors = ["#ffb86b", "#2dd4a7", "#4cc3ff", "#a78bfa", "#ff6b6b"];
    for (let i = 0; i < 24; i++) {
      const bit = document.createElement("i");
      bit.style.left = `${Math.random() * 96}%`;
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = `${Math.random() * 0.5}s`;
      confetti.append(bit);
    }
  }
}

function renderReview() {
  const quiz = ui.quiz;
  const box = $("reviewBox");
  box.replaceChildren();
  if (!quiz?.log.length) return;
  const heading = document.createElement("h4");
  heading.className = "block-title";
  heading.textContent = t("review");
  box.append(heading);

  const list = document.createElement("div");
  list.className = "review-list";
  for (const entry of quiz.log) {
    const row = document.createElement("div");
    row.className = "review-row " + (entry.isRight ? "ok" : "no");
    row.innerHTML = `
      <span class="review-mark">${entry.isRight ? "✓" : "✗"}</span>
      <span class="review-main">
        <span class="review-name"></span>
        <span class="review-kind"></span>
      </span>
    `;
    const unit = UNITS[entry.targetId];
    row.querySelector(".review-name").textContent = entry.isRight
      ? nameOf(entry.targetId)
      : `${nameOf(entry.targetId)} — ${capitalOf(entry.targetId)}`;
    row.querySelector(".review-kind").textContent =
      entry.kind + (entry.timedOut ? " · time ran out" : unit.type === "ut" ? " · UT" : "");
    list.append(row);
  }
  box.append(list);
}

function leaveQuizState() {
  if (!ui.quiz) return;
  clearAllTimers();
  ui.quiz.map?.destroy();
  ui.quiz = null;
  stopSpeaking();
}

function leaveQuiz() {
  leaveQuizState();
  setScreen("home");
  renderHome();
  toast("Round left");
}

/* ---------------------------------------------------------------- stats */

function renderStats() {
  const info = levelInfo(profile.xp);
  paintLevel(info, ["statsLevelBadge", "statsLevelTitle", "statsLevelXp", "statsLevelBar", "statsLevelNext"]);

  const status = dailyStatus(profile);
  const boxes = [
    [`${memorisedCount(profile, STATES)}/${MAP_TOTAL}`, t("memorisedStates")],
    [String(profile.answers), t("totalAnswers")],
    [`${accuracy(profile)}%`, t("accuracy")],
    [String(profile.bestStreak), t("bestStreak")],
    [profile.sprintBest ? formatTime(profile.sprintBest) : "—", t("bestSprint")],
    [status.streak ? `${status.streak}🔥` : "—", "Daily streak"],
  ];
  const grid = $("statsGrid");
  grid.replaceChildren();
  for (const [value, label] of boxes) {
    const box = document.createElement("div");
    box.className = "stat-box";
    box.innerHTML = `<b>${value}</b><span>${label}</span>`;
    grid.append(box);
  }

  $("achievementsTitle").textContent = t("achievements");
  $("achievementsCount").textContent = t(
    "achievementsCount",
    unlockedCount(profile),
    TOTAL_ACHIEVEMENTS
  );
  const badges = $("badgeGrid");
  badges.replaceChildren();
  for (const achievement of achievementList(profile)) {
    const card = document.createElement("div");
    card.className = "badge" + (achievement.unlockedAt ? " unlocked" : "");
    card.innerHTML = `
      <span class="badge-icon">${achievement.icon}</span>
      <span class="badge-text">
        <b>${achievement.title}</b>
        <span>${achievement.detail}</span>
      </span>
      ${achievement.unlockedAt ? '<span class="badge-check">✓</span>' : '<span class="badge-lock">🔒</span>'}
    `;
    badges.append(card);
  }

  $("regionTitle").textContent = t("byRegion");
  const bars = $("regionBars");
  bars.replaceChildren();
  for (const region of REGIONS.filter((r) => r.id !== "all")) {
    const units = poolFor(region.id);
    const total = units.reduce((sum, unit) => sum + unitStat(profile, unit.id).mastery, 0) / units.length;
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span class="bar-label">${region.emoji} ${region.label}</span>
      <span class="bar-track"><i style="width:${Math.round(total)}%"></i></span>
      <span class="bar-value">${Math.round(total)}%</span>
    `;
    bars.append(row);
  }

  $("stateTitle").textContent = t("byState");
  $("stateCount").textContent = `${MAP_TOTAL} · ${t("memorised")} ${memorisedCount(profile, STATES)}`;
  const rows = $("stateRows");
  rows.replaceChildren();
  const ordered = [...STATES].sort((a, b) => unitStat(profile, b.id).mastery - unitStat(profile, a.id).mastery);
  for (const unit of ordered) {
    const row = stateRow(unit);
    row.addEventListener("click", () => {
      setScreen("learn");
      openLearn();
      setTimeout(() => openSheet(unit.id), 80);
    });
    rows.append(row);
  }
}

/* ---------------------------------------------------------------- settings */

function openSettings() {
  $("settingsTitle").textContent = t("settings");
  $("settingsMeta").textContent = t("tagline");
  $("soundLabel").textContent = t("sound");
  $("soundValue").textContent = profile.sound ? t("on") : t("off");
  $("soundToggle").setAttribute("aria-checked", String(profile.sound));
  $("namesLabel").textContent = t("stateNames");
  $("namesValue").textContent = profile.stateNames === "hi" ? t("hindi") : t("english");
  for (const button of $("namesSeg").querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.names === profile.stateNames);
  }
  const singleFile = Boolean(window.__SINGLE_FILE__);
  $("downloadLabel").textContent = t("download");
  $("downloadSub").textContent = singleFile
    ? "You are already running the offline single-file build — copy this file anywhere and it keeps working."
    : t("downloadSub");
  $("downloadHtml").textContent = `⬇ ${t("downloadFile")}`;
  $("downloadZip").textContent = `⬇ ${t("downloadZip")}`;
  $("downloadHtml").hidden = singleFile;
  $("downloadZip").hidden = singleFile;
  $("installLabel").textContent = t("install");
  $("installText").textContent = t("installHint");
  $("installSheetBtn").textContent = t("installNow");
  $("installSheetBtn").hidden = !ui.installPrompt;
  $("aboutLabel").textContent = t("about");
  $("aboutText").textContent = t("aboutText");
  $("credits").textContent = t("credits");
  $("resetBtn").textContent = t("resetProgress");
  $("settingsBackdrop").hidden = false;
}

function closeSettings() {
  $("settingsBackdrop").hidden = true;
}

function doReset() {
  if (!window.confirm(t("resetAsk"))) return;
  profile = resetProfile(profile);
  saveProfile(profile);
  closeSettings();
  renderHome();
  toast(t("resetDone"), 1600);
}

/* ---------------------------------------------------------------- share */

async function shareResult() {
  const quiz = ui.quiz;
  if (!quiz) return;
  const text = `I scored ${quiz.score}/${quiz.total} on ${t(quiz.mode)} in Bharat Map Quiz 🗺️ (${quiz.xp} XP). Can you beat it?`;
  try {
    if (navigator.share) {
      await navigator.share({ title: t("appName"), text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast(t("shared"), 2200);
  } catch {
    toast(text, 3200);
  }
}

/* ---------------------------------------------------------------- wiring */

function rerender() {
  if (ui.screen === "home") renderHome();
  else if (ui.screen === "learn") {
    applyLearnLabels();
    renderLegend();
    $("learnHint").textContent = t("learnHint");
    if (ui.activeUnit && !$("sheetBackdrop").hidden) openSheet(ui.activeUnit.id);
    if (!$("listBackdrop").hidden) openList();
  } else if (ui.screen === "quiz" && ui.quiz) {
    const answered = ui.quiz.answered;
    const last = ui.quiz.lastResult;
    renderQuestion();
    if (answered && last) {
      ui.quiz.answered = true;
      if (ui.quiz.map) ui.quiz.map.setClass(last.targetId, "is-correct", true);
      showFeedback(last.isRight, UNITS[last.targetId], last.xp || 0, last.timedOut);
    }
  } else if (ui.screen === "result") {
    renderResult();
  } else if (ui.screen === "stats") {
    renderStats();
  }
}

function blockText(id, text) {
  const node = $(id);
  if (node) node.textContent = text;
}

function wire() {
  $("backBtn").addEventListener("click", () => {
    if (ui.screen === "quiz") leaveQuiz();
    else {
      setScreen("home");
      renderHome();
    }
  });

  $("levelBtn").addEventListener("click", () => {
    setScreen("stats");
    renderStats();
  });
  $("settingsBtn").addEventListener("click", openSettings);
  $("settingsClose").addEventListener("click", closeSettings);
  $("settingsBackdrop").addEventListener("click", (event) => {
    if (event.target === $("settingsBackdrop")) closeSettings();
  });
  $("soundToggle").addEventListener("click", () => {
    profile.sound = !profile.sound;
    saveProfile(profile);
    $("soundToggle").setAttribute("aria-checked", String(profile.sound));
    $("soundValue").textContent = profile.sound ? t("on") : t("off");
    if (profile.sound) sound("tap");
  });
  $("namesSeg").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-names]");
    if (!button) return;
    profile.stateNames = button.dataset.names;
    saveProfile(profile);
    for (const node of $("namesSeg").querySelectorAll("button")) {
      node.classList.toggle("active", node === button);
    }
    $("namesValue").textContent = profile.stateNames === "hi" ? t("hindi") : t("english");
    rerender();
  });
  $("resetBtn").addEventListener("click", doReset);
  $("statsReset").addEventListener("click", doReset);

  $("dailyCard").addEventListener("click", () => startQuiz("daily"));
  $("heroMapBtn").addEventListener("click", () => openLearn());
  $("downloadBtn").addEventListener("click", openSettings);
  $("quizMapWrap").addEventListener("click", onMapBackgroundTap);
  $("nextBtn").addEventListener("click", () => {
    if (ui.quiz?.answered) nextQuestion();
  });
  $("hintBtn").addEventListener("click", useHint);
  $("skipBtn").addEventListener("click", skipQuestion);

  $("listBtn").addEventListener("click", openList);
  $("listClose").addEventListener("click", closeList);
  $("listBackdrop").addEventListener("click", (event) => {
    if (event.target === $("listBackdrop")) closeList();
  });
  $("listSearch").addEventListener("input", (event) => renderList(event.target.value));

  $("sheetClose").addEventListener("click", closeSheet);
  $("sheetBackdrop").addEventListener("click", (event) => {
    if (event.target === $("sheetBackdrop")) closeSheet();
  });
  $("sheetListen").addEventListener("click", () => {
    const unit = ui.activeUnit;
    if (!unit) return;
    const text = `${unitName(unit, profile.stateNames)}. ${
      profile.stateNames === "hi" ? "राजधानी" : "Capital"
    } ${capitalName(unit, profile.stateNames)}. ${unitFact(unit, profile.stateNames)}`;
    if (!speak(text, langCode(profile.stateNames))) {
      toast("Speech is not available in this browser");
    }
  });
  $("sheetQuiz").addEventListener("click", () => {
    const unit = ui.activeUnit;
    closeSheet();
    if (unit) startQuiz("locate", { region: unit.region, focusId: unit.id });
  });

  $("againBtn").addEventListener("click", () => {
    const { mode, region } = ui.quiz;
    startQuiz(mode, { region, allowReplay: mode === "daily" });
  });
  $("practiceBtn").addEventListener("click", () => startQuiz("weak", { region: ui.quiz.region }));
  $("shareBtn").addEventListener("click", shareResult);
  $("homeBtn").addEventListener("click", () => {
    setScreen("home");
    renderHome();
  });
  $("statsPractice").addEventListener("click", () => {
    setScreen("home");
    renderHome();
    startQuiz("weak");
  });

  $("installBtn").addEventListener("click", promptInstall);
  $("installSheetBtn").addEventListener("click", promptInstall);

  $("tabbar").addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (!tab) return;
    const target = tab.dataset.tab;
    if (target === "home") {
      setScreen("home");
      renderHome();
    } else if (target === "learn") {
      openLearn();
    } else if (target === "stats") {
      setScreen("stats");
      renderStats();
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    ui.installPrompt = event;
    $("installBtn").hidden = false;
    $("installCard").hidden = false;
  });

  document.addEventListener("keydown", (event) => {
    if (ui.screen !== "quiz" || !ui.quiz) return;
    if (event.key >= "1" && event.key <= "4") {
      const buttons = [...$("options").children];
      const index = Number(event.key) - 1;
      if (buttons[index] && !ui.quiz.answered) buttons[index].click();
    } else if (event.key === "Enter" && ui.quiz.answered) {
      nextQuestion();
    } else if (event.key === "Escape") {
      leaveQuiz();
    }
  });
}

async function promptInstall() {
  const prompt = ui.installPrompt;
  if (!prompt) {
    toast(t("installHint"), 3200);
    return;
  }
  prompt.prompt();
  try {
    await prompt.userChoice;
  } catch {
    /* user dismissed */
  }
  ui.installPrompt = null;
  $("installBtn").hidden = true;
  $("installSheetBtn").hidden = true;
  $("installCard").hidden = true;
}

/* ---------------------------------------------------------------- boot */

// expose a few internals for the headless test harness
if (typeof window !== "undefined") {
  window.__bharatQuiz = {
    settings,
    getProfile: () => profile,
    startQuiz,
    setScreen,
  };
}

function boot() {
  wire();
  setScreen("home");
  renderHome();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

boot();
