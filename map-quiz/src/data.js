/* India Map Quiz — content database (English copy, Hindi names optional).
 *
 * Every entry is one state / union territory that appears on the map.
 * `capital` is the answer used in the capitals round; `capitalNote` holds
 * extra detail shown only in the learn card (e.g. seasonal capitals).
 * `fact` is a short hook that helps the shape stick in memory.
 */

export const REGIONS = [
  { id: "all", emoji: "🇮🇳", label: "All India" },
  { id: "north", emoji: "🏔️", label: "North" },
  { id: "west", emoji: "🏜️", label: "West" },
  { id: "central", emoji: "🌳", label: "Central" },
  { id: "east", emoji: "🌾", label: "East" },
  { id: "northeast", emoji: "🍃", label: "North-East" },
  { id: "south", emoji: "🌊", label: "South & Islands" },
];

export const REGION_LABEL = Object.fromEntries(REGIONS.map((r) => [r.id, r.label]));

export const STATES = [
  {
    id: "jammu-kashmir",
    region: "north",
    type: "ut",
    name: { en: "Jammu & Kashmir", hi: "जम्मू व कश्मीर" },
    capital: { en: "Srinagar", hi: "श्रीनगर" },
    capitalNote: { en: "Srinagar (summer) · Jammu (winter)", hi: "श्रीनगर (गर्मी) · जम्मू (सर्दी)" },
    fact: {
      en: "Dal Lake, shikara rides and saffron fields.",
      hi: "डल झील, शिकारा और केसर के खेत।",
    },
  },
  {
    id: "ladakh",
    region: "north",
    type: "ut",
    name: { en: "Ladakh", hi: "लद्दाख" },
    capital: { en: "Leh", hi: "लेह" },
    fact: {
      en: "A cold desert: Pangong Lake and Khardung La pass.",
      hi: "ठंडा रेगिस्तान: पैंगोंग झील और खारदुंग ला दर्रा।",
    },
  },
  {
    id: "himachal-pradesh",
    region: "north",
    type: "state",
    name: { en: "Himachal Pradesh", hi: "हिमाचल प्रदेश" },
    capital: { en: "Shimla", hi: "शिमला" },
    fact: {
      en: "Snow peaks and apple orchards; Shimla was the British summer capital.",
      hi: "बर्फीली चोटियाँ और सेब के बाग; शिमला अंग्रेज़ों की गर्मियों की राजधानी थी।",
    },
  },
  {
    id: "punjab",
    region: "north",
    type: "state",
    name: { en: "Punjab", hi: "पंजाब" },
    capital: { en: "Chandigarh", hi: "चंडीगढ़" },
    fact: {
      en: "Land of five rivers; Golden Temple is in Amritsar.",
      hi: "पाँच नदियों की भूमि; स्वर्ण मंदिर अमृतसर में है।",
    },
  },
  {
    id: "haryana",
    region: "north",
    type: "state",
    name: { en: "Haryana", hi: "हरियाणा" },
    capital: { en: "Chandigarh", hi: "चंडीगढ़" },
    fact: {
      en: "Kurukshetra, the battleground of the Mahabharata.",
      hi: "कुरुक्षेत्र, महाभारत की युद्धभूमि।",
    },
  },
  {
    id: "chandigarh",
    region: "north",
    type: "ut",
    name: { en: "Chandigarh", hi: "चंडीगढ़" },
    capital: { en: "Chandigarh", hi: "चंडीगढ़" },
    fact: {
      en: "Le Corbusier's planned city, capital of two states as well.",
      hi: "ले कार्बूजिए की बनाई योजनाबद्ध शहर, दो राज्यों की भी राजधानी।",
    },
  },
  {
    id: "delhi",
    region: "north",
    type: "ut",
    name: { en: "Delhi (NCT)", hi: "दिल्ली (राष्ट्रीय राजधानी क्षेत्र)" },
    capital: { en: "New Delhi", hi: "नई दिल्ली" },
    fact: {
      en: "India's capital; Red Fort, Qutub Minar and seven old cities.",
      hi: "भारत की राजधानी; लाल किला, कुतुब मीनार और सात पुरानी दिल्लियाँ।",
    },
  },
  {
    id: "uttar-pradesh",
    region: "north",
    type: "state",
    name: { en: "Uttar Pradesh", hi: "उत्तर प्रदेश" },
    capital: { en: "Lucknow", hi: "लखनऊ" },
    fact: {
      en: "Most populous state; Taj Mahal at Agra, Sangam at Prayagraj.",
      hi: "सबसे अधिक आबादी वाला राज्य; आगरा का ताजमहल, प्रयागराज का संगम।",
    },
  },
  {
    id: "uttarakhand",
    region: "north",
    type: "state",
    name: { en: "Uttarakhand", hi: "उत्तराखंड" },
    capital: { en: "Dehradun", hi: "देहरादून" },
    capitalNote: { en: "Dehradun (winter) · Gairsain (summer)", hi: "देहरादून (सर्दी) · गैरसैण (गर्मी)" },
    fact: {
      en: "Devbhoomi: Gangotri, Yamunotri, Kedarnath and Badrinath.",
      hi: "देवभूमि: गंगोत्री, यमुनोत्री, केदारनाथ और बद्रीनाथ।",
    },
  },
  {
    id: "rajasthan",
    region: "north",
    type: "state",
    name: { en: "Rajasthan", hi: "राजस्थान" },
    capital: { en: "Jaipur", hi: "जयपुर" },
    fact: {
      en: "Largest state by area: Thar desert, Aravalli hills, pink Jaipur.",
      hi: "क्षेत्रफल में सबसे बड़ा राज्य: थार मरुस्थल, अरावली, गुलाबी जयपुर।",
    },
  },
  {
    id: "gujarat",
    region: "west",
    type: "state",
    name: { en: "Gujarat", hi: "गुजरात" },
    capital: { en: "Gandhinagar", hi: "गांधीनगर" },
    fact: {
      en: "Longest coastline; Rann of Kachchh and the Statue of Unity.",
      hi: "सबसे लंबा समुद्री किनारा; कच्छ का रण और स्टैच्यू ऑफ यूनिटी।",
    },
  },
  {
    id: "maharashtra",
    region: "west",
    type: "state",
    name: { en: "Maharashtra", hi: "महाराष्ट्र" },
    capital: { en: "Mumbai", hi: "मुंबई" },
    fact: {
      en: "India's biggest economy; Ajanta–Ellora caves, Gateway of India.",
      hi: "भारत की सबसे बड़ी अर्थव्यवस्था; अजंता-एलोरा, गेटवे ऑफ इंडिया।",
    },
  },
  {
    id: "goa",
    region: "west",
    type: "state",
    name: { en: "Goa", hi: "गोवा" },
    capital: { en: "Panaji", hi: "पणजी" },
    fact: {
      en: "Smallest state: Portuguese churches and Konkan beaches.",
      hi: "सबसे छोटा राज्य: पुर्तगाली गिरजाघर और कोंकण के समुद्र तट।",
    },
  },
  {
    id: "dadra-nagar-haveli-daman-diu",
    region: "west",
    type: "ut",
    name: { en: "Dadra & Nagar Haveli and Daman & Diu", hi: "दादरा व नगर हवेली और दमन व दीव" },
    capital: { en: "Daman", hi: "दमन" },
    fact: {
      en: "Two former Portuguese enclaves merged into one UT in 2020.",
      hi: "दो पूर्व पुर्तगाली इलाके 2020 में एक केंद्रशासित प्रदेश बने।",
    },
  },
  {
    id: "madhya-pradesh",
    region: "central",
    type: "state",
    name: { en: "Madhya Pradesh", hi: "मध्य प्रदेश" },
    capital: { en: "Bhopal", hi: "भोपाल" },
    fact: {
      en: "Heart of India: Khajuraho, Sanchi stupa, Bandhavgarh tigers.",
      hi: "भारत का दिल: खजुराहो, सांची स्तूप, बांधवगढ़ के बाघ।",
    },
  },
  {
    id: "chhattisgarh",
    region: "central",
    type: "state",
    name: { en: "Chhattisgarh", hi: "छत्तीसगढ़" },
    capital: { en: "Raipur", hi: "रायपुर" },
    fact: {
      en: "Carved out of Madhya Pradesh in 2000; Chitrakote waterfall.",
      hi: "2000 में मध्य प्रदेश से अलग हुआ; चित्रकूट जलप्रपात।",
    },
  },
  {
    id: "bihar",
    region: "east",
    type: "state",
    name: { en: "Bihar", hi: "बिहार" },
    capital: { en: "Patna", hi: "पटना" },
    fact: {
      en: "Bodh Gaya, where Buddha found enlightenment; Nalanda university.",
      hi: "बोधगया, जहाँ बुद्ध को ज्ञान मिला; नालंदा विश्वविद्यालय।",
    },
  },
  {
    id: "jharkhand",
    region: "east",
    type: "state",
    name: { en: "Jharkhand", hi: "झारखंड" },
    capital: { en: "Ranchi", hi: "रांची" },
    fact: {
      en: "Land of forests and minerals; Dhanbad coal, Jamshedpur steel.",
      hi: "जंगल और खनिजों की भूमि; धनबाद का कोयला, जमशेदपुर का स्टील।",
    },
  },
  {
    id: "west-bengal",
    region: "east",
    type: "state",
    name: { en: "West Bengal", hi: "पश्चिम बंगाल" },
    capital: { en: "Kolkata", hi: "कोलकाता" },
    fact: {
      en: "Sundarbans mangroves, Darjeeling tea and the Hooghly.",
      hi: "सुंदरबन के मैंग्रोव, दार्जिलिंग की चाय और हुगली नदी।",
    },
  },
  {
    id: "odisha",
    region: "east",
    type: "state",
    name: { en: "Odisha", hi: "ओडिशा" },
    capital: { en: "Bhubaneswar", hi: "भुवनेश्वर" },
    fact: {
      en: "Jagannath temple at Puri, Konark Sun Temple, Chilika lagoon.",
      hi: "पुरी का जगन्नाथ मंदिर, कोणार्क सूर्य मंदिर, चिल्का झील।",
    },
  },
  {
    id: "assam",
    region: "northeast",
    type: "state",
    name: { en: "Assam", hi: "असम" },
    capital: { en: "Dispur", hi: "दिसपुर" },
    fact: {
      en: "Tea gardens along the Brahmaputra; Kaziranga rhinos.",
      hi: "ब्रह्मपुत्र के किनारे चाय के बागान; काजीरंगा के गैंडे।",
    },
  },
  {
    id: "arunachal-pradesh",
    region: "northeast",
    type: "state",
    name: { en: "Arunachal Pradesh", hi: "अरुणाचल प्रदेश" },
    capital: { en: "Itanagar", hi: "ईटानगर" },
    fact: {
      en: "India's easternmost state — the sun rises here first.",
      hi: "भारत का सबसे पूर्वी राज्य — सूरज यहीं सबसे पहले उगता है।",
    },
  },
  {
    id: "manipur",
    region: "northeast",
    type: "state",
    name: { en: "Manipur", hi: "मणिपुर" },
    capital: { en: "Imphal", hi: "इंफाल" },
    fact: {
      en: "Loktak Lake's floating phumdis; birthplace of modern polo.",
      hi: "लोकतक झील के तैरते फुमदी; आधुनिक पोलो का जन्मस्थान।",
    },
  },
  {
    id: "meghalaya",
    region: "northeast",
    type: "state",
    name: { en: "Meghalaya", hi: "मेघालय" },
    capital: { en: "Shillong", hi: "शिलांग" },
    fact: {
      en: "Abode of clouds — Mawsynram gets the world's heaviest rain.",
      hi: "बादलों का घर — मौसिनराम में दुनिया की सबसे भारी बारिश।",
    },
  },
  {
    id: "mizoram",
    region: "northeast",
    type: "state",
    name: { en: "Mizoram", hi: "मिजोरम" },
    capital: { en: "Aizawl", hi: "आइजोल" },
    fact: {
      en: "Bamboo hills; over 90% of the state is forest.",
      hi: "बाँस की पहाड़ियाँ; राज्य का 90% से ज़्यादा हिस्सा जंगल है।",
    },
  },
  {
    id: "nagaland",
    region: "northeast",
    type: "state",
    name: { en: "Nagaland", hi: "नागालैंड" },
    capital: { en: "Kohima", hi: "कोहिमा" },
    fact: {
      en: "Home of the Hornbill Festival and 17 major tribes.",
      hi: "हॉर्नबिल महोत्सव और 17 प्रमुख जनजातियों का घर।",
    },
  },
  {
    id: "sikkim",
    region: "northeast",
    type: "state",
    name: { en: "Sikkim", hi: "सिक्किम" },
    capital: { en: "Gangtok", hi: "गंगटोक" },
    fact: {
      en: "Smallest population, Kanchenjunga views, fully organic farming.",
      hi: "सबसे कम आबादी, कंचनजंगा के दृश्य, पूरी तरह जैविक खेती।",
    },
  },
  {
    id: "tripura",
    region: "northeast",
    type: "state",
    name: { en: "Tripura", hi: "त्रिपुरा" },
    capital: { en: "Agartala", hi: "अगरतला" },
    fact: {
      en: "Ujjayanta Palace; bordered by Bangladesh on three sides.",
      hi: "उज्जयंत महल; तीन तरफ़ बांग्लादेश से घिरा।",
    },
  },
  {
    id: "andhra-pradesh",
    region: "south",
    type: "state",
    name: { en: "Andhra Pradesh", hi: "आंध्र प्रदेश" },
    capital: { en: "Amaravati", hi: "अमरावती" },
    fact: {
      en: "Krishna and Godavari deltas; Tirupati Balaji temple.",
      hi: "कृष्णा और गोदावरी के डेल्टा; तिरुपति बालाजी मंदिर।",
    },
  },
  {
    id: "telangana",
    region: "south",
    type: "state",
    name: { en: "Telangana", hi: "तेलंगाना" },
    capital: { en: "Hyderabad", hi: "हैदराबाद" },
    fact: {
      en: "Charminar and biryani; became a state in 2014.",
      hi: "चारमीनार और बिरयानी; 2014 में राज्य बना।",
    },
  },
  {
    id: "karnataka",
    region: "south",
    type: "state",
    name: { en: "Karnataka", hi: "कर्नाटक" },
    capital: { en: "Bengaluru", hi: "बेंगलुरु" },
    fact: {
      en: "IT capital Bengaluru; Hampi ruins and Mysuru Dasara.",
      hi: "आईटी राजधानी बेंगलुरु; हम्पी के खंडहर और मैसूर दशहरा।",
    },
  },
  {
    id: "kerala",
    region: "south",
    type: "state",
    name: { en: "Kerala", hi: "केरल" },
    capital: { en: "Thiruvananthapuram", hi: "तिरुवनंतपुरम" },
    fact: {
      en: "Backwaters and coconut palms; India's most literate state.",
      hi: "बैकवाटर और नारियल के पेड़; सबसे अधिक साक्षर राज्य।",
    },
  },
  {
    id: "tamil-nadu",
    region: "south",
    type: "state",
    name: { en: "Tamil Nadu", hi: "तमिलनाडु" },
    capital: { en: "Chennai", hi: "चेन्नई" },
    fact: {
      en: "Meenakshi temple at Madurai; Marina is India's longest beach.",
      hi: "मदुरै का मीनाक्षी मंदिर; मरीना भारत का सबसे लंबा समुद्र तट।",
    },
  },
  {
    id: "puducherry",
    region: "south",
    type: "ut",
    name: { en: "Puducherry", hi: "पुदुचेरी" },
    capital: { en: "Puducherry", hi: "पुदुचेरी" },
    fact: {
      en: "A former French colony in four separate pieces, with Auroville.",
      hi: "पूर्व फ्रांसीसी उपनिवेश, चार अलग हिस्सों में; ऑरोविल यहाँ है।",
    },
  },
  {
    id: "lakshadweep",
    region: "south",
    type: "ut",
    name: { en: "Lakshadweep", hi: "लक्षद्वीप" },
    capital: { en: "Kavaratti", hi: "कवरत्ती" },
    fact: {
      en: "Smallest UT: 36 coral islands with turquoise lagoons.",
      hi: "सबसे छोटा केंद्रशासित प्रदेश: 36 प्रवाल द्वीप, फ़िरोज़ी पानी।",
    },
  },
  {
    id: "andaman-nicobar",
    region: "south",
    type: "ut",
    name: { en: "Andaman & Nicobar Islands", hi: "अंडमान व निकोबार द्वीपसमूह" },
    capital: { en: "Port Blair", hi: "पोर्ट ब्लेयर" },
    fact: {
      en: "572 islands in the Bay of Bengal; Cellular Jail at Port Blair.",
      hi: "बंगाल की खाड़ी में 572 द्वीप; पोर्ट ब्लेयर की सेल्युलर जेल।",
    },
  },
];

export const UNITS = Object.fromEntries(STATES.map((s) => [s.id, s]));

/** Short labels used *on the map* (long names would overflow small shapes). */
const MAP_LABELS = {
  "andaman-nicobar": { en: "Andaman & Nicobar", hi: "अंडमान-निकोबार" },
  "dadra-nagar-haveli-daman-diu": { en: "DNH & Daman-Diu", hi: "दादरा-दमन" },
  "jammu-kashmir": { en: "J & K", hi: "जम्मू-कश्मीर" },
  "arunachal-pradesh": { en: "Arunachal", hi: "अरुणाचल" },
  "himachal-pradesh": { en: "Himachal", hi: "हिमाचल" },
  "uttar-pradesh": { en: "Uttar Pradesh", hi: "उत्तर प्रदेश" },
  "madhya-pradesh": { en: "Madhya Pradesh", hi: "मध्य प्रदेश" },
  "andhra-pradesh": { en: "Andhra Pradesh", hi: "आंध्र प्रदेश" },
  "west-bengal": { en: "West Bengal", hi: "प. बंगाल" },
  "tamil-nadu": { en: "Tamil Nadu", hi: "तमिलनाडु" },
  "uttarakhand": { en: "Uttarakhand", hi: "उत्तराखंड" },
  "chhattisgarh": { en: "Chhattisgarh", hi: "छत्तीसगढ़" },
  "maharashtra": { en: "Maharashtra", hi: "महाराष्ट्र" },
  "karnataka": { en: "Karnataka", hi: "कर्नाटक" },
  "rajasthan": { en: "Rajasthan", hi: "राजस्थान" },
  "telangana": { en: "Telangana", hi: "तेलंगाना" },
  "meghalaya": { en: "Meghalaya", hi: "मेघालय" },
  "nagaland": { en: "Nagaland", hi: "नागालैंड" },
  "manipur": { en: "Manipur", hi: "मणिपुर" },
  "mizoram": { en: "Mizoram", hi: "मिज़ोरम" },
  "tripura": { en: "Tripura", hi: "त्रिपुरा" },
  "sikkim": { en: "Sikkim", hi: "सिक्किम" },
};

export function mapLabel(unit, stateNames = "en") {
  const short = MAP_LABELS[unit.id];
  if (stateNames === "hi") return short?.hi || unit.name.hi;
  return short?.en || unit.name.en;
}

/** State name, honouring the optional Hindi names setting. */
export function unitName(unit, stateNames = "en") {
  return unit.name[stateNames === "hi" ? "hi" : "en"];
}

export function capitalName(unit, stateNames = "en") {
  return unit.capital[stateNames === "hi" ? "hi" : "en"];
}

export function unitFact(unit, stateNames = "en") {
  return unit.fact[stateNames === "hi" ? "hi" : "en"];
}

export function regionName(region) {
  return REGION_LABEL[region] || REGION_LABEL.all;
}
