// ============================================================================
//  song.js  —  YAHI EK FILE EDIT KARNI HAI (apna gaana lagane ke liye)
// ============================================================================
//
//  1. Apni mp3 ko  assets/song.mp3  me daalo.
//  2. timing.html kholo -> lyrics paste karo -> gaana chala ke har line pe
//     SPACE dabao -> "Copy lyrics array" -> neeche `lyrics` me paste kar do.
//  3. studio.html me dekho, phir render.mjs se MP4 banao.
//
// ============================================================================

const SONG = {
  title: 'Mera Gaana',
  audio: 'assets/song.mp3',

  bpm: 90,          // gaane ki speed (timing.html me TAP BPM se nikaal sakte ho)
  beatOffset: 0,    // pehla beat kitne second pe aata hai
  duration: 60,     // gaane ki lambai, seconds me

  // Har scene kitni lyric lines tak chale (1 = har line pe naya scene)
  sceneEvery: 2,

  // Scenes kis order me ghoomein. Available:
  // 'sunburst' 'night' 'city' 'rain' 'typo' 'waves' 'confetti' 'spotlight'
  sceneOrder: ['sunburst', 'night', 'typo', 'city', 'waves', 'rain', 'confetti', 'spotlight'],

  // Rang badalne ho to yahan override karo, warna default watercolour palette chalegi.
  palette: {},

  // ---------------------------------------------------------------------
  // lyrics: [ startTime, endTime, "text", "sceneName" (optional) ]
  // Niche sirf demo hai — ise apni lines se replace kar do.
  // ---------------------------------------------------------------------
  lyrics: [
    [1.0, 4.5, 'Subah ki pehli kiran', 'sunburst'],
    [4.8, 8.5, 'Meri aankhon me utari'],
    [9.0, 12.5, 'Raaton ke andhere me', 'night'],
    [13.0, 16.5, 'Ek taara bula raha'],
    [17.0, 21.0, 'I am singing out loud', 'typo'],
    [21.5, 25.0, 'Har lafz mera rang hai'],
    [25.5, 29.0, 'Sheher ki galiyon me', 'city'],
    [29.5, 33.0, 'Mera naam goonjta hai'],
    [33.5, 37.0, 'Lehron pe chalta hua', 'waves'],
    [37.5, 41.0, 'Main kinare dhoondta hun'],
    [41.5, 45.0, 'Baarish ki boondon me', 'rain'],
    [45.5, 49.0, 'Tera chehra dikhta hai'],
    [49.5, 53.0, 'Aaj phir se jee lein', 'confetti'],
    [53.5, 57.5, 'Yeh raat humari hai']
  ]
};
