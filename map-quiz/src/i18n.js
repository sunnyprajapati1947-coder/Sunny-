/* Tiny i18n layer. Three languages: Hinglish (default), Hindi, English. */

export const LANGS = [
  { id: "hing", label: "Hinglish" },
  { id: "hi", label: "हिंदी" },
  { id: "en", label: "English" },
];

const STRINGS = {
  appName: { hing: "Bharat Map Quiz", hi: "भारत मैप क्विज़", en: "Bharat Map Quiz" },
  tagline: {
    hing: "Naksha dekh ke yaad karo",
    hi: "नक्शा देखकर याद करो",
    en: "Learn India on the map",
  },
  greetMorning: { hing: "Namaste!", hi: "नमस्ते!", en: "Hello!" },
  learn: { hing: "Yaad karo", hi: "याद करो", en: "Learn" },
  learnSub: {
    hing: "Naksha kholo, koi bhi rajya tap karo",
    hi: "नक्शा खोलो, कोई भी राज्य टैप करो",
    en: "Open the map, tap any state",
  },
  locate: { hing: "Rajya dhoondo", hi: "राज्य खोजो", en: "Find the state" },
  locateSub: {
    hing: "Naam diya hai — map par tap karo",
    hi: "नाम दिया है — नक्शे पर टैप करो",
    en: "You get the name — tap it on the map",
  },
  identify: { hing: "Pehchano", hi: "पहचानो", en: "Identify shape" },
  identifySub: {
    hing: "Highlight kiya rajya kaun sa hai?",
    hi: "हाइलाइट किया राज्य कौन सा है?",
    en: "Which state is highlighted?",
  },
  capital: { hing: "Rajdhani", hi: "राजधानी", en: "Capitals" },
  capitalSub: {
    hing: "Rajya ki rajdhani chuno",
    hi: "राज्य की राजधानी चुनो",
    en: "Pick the state's capital",
  },
  sprint: { hing: "Speed run", hi: "स्पीड रन", en: "Speed run" },
  sprintSub: {
    hing: "Sabhi rajya, timer chal raha hai",
    hi: "सभी राज्य, टाइमर चल रहा है",
    en: "Every state, against the clock",
  },
  round: { hing: "10 sawaal", hi: "10 सवाल", en: "10 questions" },
  pool: { hing: "Kshetra", hi: "क्षेत्र", en: "Region" },
  start: { hing: "Shuru karo", hi: "शुरू करो", en: "Start" },
  progressTitle: { hing: "Yaad ki sthiti", hi: "याद की स्थिति", en: "Memory progress" },
  mastered: { hing: "Yaad", hi: "याद", en: "Memorised" },
  xp: { hing: "XP", hi: "XP", en: "XP" },
  accuracy: { hing: "Sahi jawab", hi: "सही जवाब", en: "Accuracy" },
  bestStreak: { hing: "Best streak", hi: "बेस्ट स्ट्रीक", en: "Best streak" },
  weakStates: { hing: "Yeh dobara dekho", hi: "ये दोबारा देखो", en: "Revise these" },
  weakNone: {
    hing: "Abhi tak sab theek — khelna shuru karo!",
    hi: "अभी तक सब ठीक — खेलना शुरू करो!",
    en: "All good so far — start playing!",
  },
  sprintBest: { hing: "Best time", hi: "सबसे अच्छा समय", en: "Best time" },
  question: { hing: "Sawaal", hi: "सवाल", en: "Question" },
  streak: { hing: "Streak", hi: "स्ट्रीक", en: "Streak" },
  score: { hing: "Score", hi: "स्कोर", en: "Score" },
  of: { hing: "mein se", hi: "में से", en: "of" },
  tapState: { hing: "Map par rajya tap karo", hi: "नक्शे पर राज्य टैप करो", en: "Tap the state on the map" },
  capitalOf: { hing: "ki rajdhani kaun hai?", hi: "की राजधानी कौन है?", en: "is the capital of which state?" },
  whereIs: { hing: "Kahan hai", hi: "कहाँ है", en: "Where is" },
  whichState: { hing: "Yeh kaun sa rajya hai?", hi: "यह कौन सा राज्य है?", en: "Which state is this?" },
  correct: { hing: "Sahi!", hi: "सही!", en: "Correct!" },
  wrongWas: { hing: "Nahi — ye tha", hi: "नहीं — यह था", en: "Not quite — it was" },
  tapAgain: { hing: "Dobara tap karo", hi: "दोबारा टैप करो", en: "Try again" },
  tapMap: { hing: "Map ke andar tap karo", hi: "नक्शे के अंदर टैप करो", en: "Tap somewhere on the map" },
  capitalLabel: { hing: "Rajdhani", hi: "राजधानी", en: "Capital" },
  factLabel: { hing: "Yaad rakhne ki baat", hi: "याद रखने की बात", en: "Remember this" },
  listen: { hing: "Suno", hi: "सुनो", en: "Listen" },
  close: { hing: "Band karo", hi: "बंद करो", en: "Close" },
  next: { hing: "Aage", hi: "आगे", en: "Next" },
  finish: { hing: "Khatam karo", hi: "खत्म करो", en: "Finish" },
  skip: { hing: "Chhodo", hi: "छोड़ो", en: "Skip" },
  quit: { hing: "Bahar", hi: "बाहर", en: "Quit" },
  roundDone: { hing: "Round poora!", hi: "राउंड पूरा!", en: "Round complete!" },
  roundDoneSub: {
    hing: "Dekho kitna yaad raha",
    hi: "देखो कितना याद रहा",
    en: "Here is how you did",
  },
  playAgain: { hing: "Dobara khelo", hi: "दोबारा खेलो", en: "Play again" },
  home: { hing: "Ghar", hi: "होम", en: "Home" },
  missed: { hing: "Jo chhoot gaya", hi: "जो छूट गया", en: "Missed" },
  practiceWeak: { hing: "Kamzor rajya practice karo", hi: "कमज़ोर राज्य अभ्यास करो", en: "Practise weak states" },
  perfect: { hing: "Sab sahi! Zabardast 🎉", hi: "सब सही! शानदार 🎉", en: "Perfect! 🎉" },
  sprintDone: { hing: "Poora naksha!", hi: "पूरा नक्शा!", en: "Whole map done!" },
  time: { hing: "Samay", hi: "समय", en: "Time" },
  mistakes: { hing: "Galtiyan", hi: "गलतियाँ", en: "Mistakes" },
  sound: { hing: "Awaaz", hi: "आवाज़", en: "Sound" },
  language: { hing: "Bhasha", hi: "भाषा", en: "Language" },
  reset: { hing: "Progress mitao", hi: "प्रगति मिटाओ", en: "Reset progress" },
  resetAsk: {
    hing: "Sara progress mit jayega. Pakka?",
    hi: "सारी प्रगति मिट जाएगी। पक्का?",
    en: "All progress will be erased. Sure?",
  },
  install: { hing: "App ki tarah install karo", hi: "ऐप की तरह इंस्टॉल करो", en: "Install like an app" },
  installHint: {
    hing: "Browser menu se 'Home screen par jodo' chuno — offline bhi chalega.",
    hi: "ब्राउज़र मेन्यू से 'होम स्क्रीन पर जोड़ें' चुनो — ऑफ़लाइन भी चलेगा।",
    en: "Use your browser menu → “Add to Home screen”. It works offline too.",
  },
  statesCount: { hing: "rajya yaad", hi: "राज्य याद", en: "states memorised" },
  hint: { hing: "Hint", hi: "संकेत", en: "Hint" },
  hintUsed: { hing: "Hint use hua (-4 XP)", hi: "संकेत लिया (-4 XP)", en: "Hint used (−4 XP)" },
  sprintStart: { hing: "Shuru", hi: "शुरू", en: "Start" },
  utLabel: { hing: "Kendra shasit", hi: "केंद्र शासित", en: "Union Territory" },
  stateLabel: { hing: "Rajya", hi: "राज्य", en: "State" },
  regionLabel: { hing: "Kshetra", hi: "क्षेत्र", en: "Region" },
  memorised: { hing: "Yaad ho gaya", hi: "याद हो गया", en: "Memorised" },
  back: { hing: "Wapas", hi: "वापस", en: "Back" },
  allStates: { hing: "Sabhi rajya", hi: "सभी राज्य", en: "All states" },
  searchPlaceholder: {
    hing: "Rajya ya rajdhani khojo…",
    hi: "राज्य या राजधानी खोजो…",
    en: "Search state or capital…",
  },
  noMatch: { hing: "Kuch nahi mila", hi: "कुछ नहीं मिला", en: "Nothing found" },
};

export function t(key, lang = "hing") {
  const entry = STRINGS[key];
  if (!entry) return key;
  return entry[lang] || entry.hing || entry.en || key;
}

export function langCode(lang) {
  return lang === "hi" ? "hi-IN" : "en-IN";
}

/* ---- sentence builders (word order differs per language) ---- */

export function locatePrompt(name, lang) {
  if (lang === "hi") return `${name} कहाँ है?`;
  if (lang === "en") return `Where is ${name}?`;
  return `${name} kahan hai?`;
}

export function identifyPrompt(lang) {
  return t("whichState", lang);
}

export function capitalPrompt(name, lang) {
  if (lang === "hi") return `${name} की राजधानी कौन है?`;
  if (lang === "en") return `What is the capital of ${name}?`;
  return `${name} ki rajdhani kaun hai?`;
}

export function hintText(regionLabel, lang) {
  if (lang === "hi") return `संकेत: यह ${regionLabel} भारत में है`;
  if (lang === "en") return `Hint: it is in ${regionLabel} India`;
  return `Hint: yeh ${regionLabel} India mein hai`;
}
