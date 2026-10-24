import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COLORS, META, PATH, SAFE, coordOf, movableIndices, applyMove, chooseAiMove, DICE_PIPS } from './game/engine.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (r, c) => `${r},${c}`;
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* noop */ } };

function useSounds(on) {
  const ctx = useRef(null);
  const beep = useCallback((freq, dur = 0.09, type = 'sine', vol = 0.15, when = 0) => {
    if (!on) return;
    try {
      ctx.current ??= new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.current.currentTime + when;
      const o = ctx.current.createOscillator(), g = ctx.current.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(ctx.current.destination); o.start(t); o.stop(t + dur);
    } catch { /* no audio */ }
  }, [on]);
  return useMemo(() => ({
    dice: () => { beep(300, .06, 'square', .08); beep(420, .06, 'square', .08, .07); beep(520, .07, 'square', .08, .14); },
    step: () => beep(620, .05, 'sine', .07),
    out: () => { beep(523, .09); beep(784, .12, 'sine', .15, .08); },
    capture: () => { beep(220, .15, 'sawtooth', .14); beep(160, .2, 'sawtooth', .12, .1); },
    home: () => { [523, 659, 784].forEach((f, i) => beep(f, .12, 'sine', .14, i * .09)); },
    win: () => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => beep(f, .18, 'triangle', .16, i * .13)); },
  }), [beep]);
}

function Pawn({ color }) {
  return (
    <svg className="pawn" viewBox="0 0 48 52" aria-hidden="true">
      <ellipse cx="24" cy="47" rx="13" ry="4.5" className="pawn-base" />
      <path d="M13.5 46 C15.5 35, 19.5 31, 20.5 25.5 L27.5 25.5 C28.5 31, 32.5 35, 34.5 46 Z" className={`pawn-body pawn-${color}`} />
      <circle cx="24" cy="17" r="8.6" className={`pawn-head pawn-${color}`} />
      <circle cx="20.8" cy="13.8" r="2.8" className="pawn-shine" />
    </svg>
  );
}

function Dice({ value, rolling, onClick, disabled, color }) {
  const [face, setFace] = useState(value);
  useEffect(() => {
    if (!rolling) { setFace(value); return; }
    const t = setInterval(() => setFace(Math.floor(Math.random() * 6) + 1), 80);
    return () => clearInterval(t);
  }, [rolling, value]);
  return (
    <button className={`dice dice-${color} ${rolling ? 'rolling' : ''}`} onClick={onClick} disabled={disabled} aria-label="Dice ghumao">
      <span className="dice-grid">{Array.from({ length: 9 }, (_, i) => <span key={i} className={DICE_PIPS[face]?.includes(i) ? 'pip on' : 'pip'} />)}</span>
    </button>
  );
}

function buildCellMap() {
  const m = new Map();
  const set = (r, c, v) => m.set(key(r, c), v);
  for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) set(r, c, { bg: '#fff' });
  const paintBase = (r0, c0, color) => {
    for (let r = r0; r < r0 + 6; r++) for (let c = c0; c < c0 + 6; c++) set(r, c, { bg: `var(--${color})`, baseOuter: color });
    for (let r = r0 + 1; r < r0 + 5; r++) for (let c = c0 + 1; c < c0 + 5; c++) set(r, c, { bg: '#fdfdfd', baseInner: color });
    META[color].base.forEach(([r, c]) => set(r, c, { bg: '#fff', baseSpot: color }));
  };
  paintBase(0, 0, 'red'); paintBase(0, 9, 'green'); paintBase(9, 9, 'yellow'); paintBase(9, 0, 'blue');
  PATH.forEach(([r, c], i) => set(r, c, { bg: '#fff', safe: SAFE.has(i), track: true }));
  COLORS.forEach((col) => {
    const [r, c] = PATH[META[col].start];
    set(r, c, { bg: `var(--${col})`, start: col, track: true });
    META[col].homeCol.forEach(([hr, hc], i) => { if (i < 5) set(hr, hc, { bg: `var(--${col}-soft)`, track: true, homeArrow: col, homeIdx: i }); });
  });
  [[2, 6], [6, 12], [12, 8], [8, 2]].forEach(([r, c]) => { const v = m.get(key(r, c)); if (v) v.safe = true; });
  return m;
}
const CELL_MAP = buildCellMap();
const CORNER = { red: 'tl', green: 'tr', yellow: 'br', blue: 'bl' };
const AVATAR = { red: '🧑🏽', green: '🤖', yellow: '🧑🏻', blue: '🧑🏾' };

export default function App() {
  const [screen, setScreen] = useState('menu');
  const [mode, setMode] = useState('computer');
  const [numPlayers, setNumPlayers] = useState(4);
  const [names, setNames] = useState({ red: 'You', green: 'Raju', yellow: 'Simran', blue: 'Aman' });
  const [sound, setSound] = useState(true);
  const sfx = useSounds(sound);
  const [installEvt, setInstallEvt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const installApp = async () => {
    if (installEvt) { installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); }
    else setShowInstallHelp(true);
  };

  const activeColors = useMemo(() => (numPlayers === 2 ? ['red', 'yellow'] : numPlayers === 3 ? ['red', 'green', 'yellow'] : COLORS), [numPlayers]);
  const isAI = useCallback((color) => mode === 'computer' && color !== 'red', [mode]);

  const [tokens, setTokens] = useState(() => Object.fromEntries(COLORS.map((c) => [c, [-1, -1, -1, -1]])));
  const [turn, setTurn] = useState('red');
  const [dice, setDice] = useState(6);
  const [phase, setPhase] = useState('roll');
  const [rolling, setRolling] = useState(false);
  const [movable, setMovable] = useState([]);
  const [sixes, setSixes] = useState(0);
  const [winner, setWinner] = useState(null);
  const [toast, setToast] = useState('');
  const [lastEvent, setLastEvent] = useState('');
  const busy = useRef(false);
  const stateRef = useRef({ tokens, turn, activeColors });
  stateRef.current = { tokens, turn, activeColors };

  const startGame = () => {
    setTokens(Object.fromEntries(COLORS.map((c) => [c, [-1, -1, -1, -1]])));
    setTurn(activeColors[0]); setDice(6); setPhase('roll'); setMovable([]); setSixes(0); setWinner(null); setLastEvent('');
    setToast(`${names[activeColors[0]]} ki baari — dice dabao!`);
    setScreen('game'); vibrate(30);
  };

  const nextTurn = useCallback((cur, extra) => {
    if (extra) { setPhase('roll'); setToast(`${names[cur]} ko ek aur baari! 🔁`); return; }
    const list = stateRef.current.activeColors;
    const nxt = list[(list.indexOf(cur) + 1) % list.length];
    setSixes(0); setTurn(nxt); setPhase('roll');
    setToast(`${names[nxt]} ki baari 🎲`);
  }, [names]);

  const doMove = useCallback(async (color, idx, rolled) => {
    if (busy.current) return; busy.current = true;
    setMovable([]); setPhase('anim');
    const pre = Object.fromEntries(Object.entries(stateRef.current.tokens).map(([k, v]) => [k, [...v]]));
    const from = pre[color][idx];
    const outcome = applyMove(pre, color, idx, rolled);
    if (from === -1) { setTokens(outcome.state); sfx.out(); vibrate(40); await sleep(320); }
    else {
      for (let s = 1; s < rolled; s++) {
        setTokens({ ...pre, [color]: pre[color].map((p, i) => (i === idx ? from + s : p)) });
        sfx.step(); await sleep(180);
      }
      setTokens(outcome.state); sfx.step(); vibrate(25); await sleep(220);
    }
    const { captured, finishedToken } = outcome;
    const won = outcome.state[color].every((p) => p === 56);
    if (captured.length) { sfx.capture(); vibrate([60, 40, 60]); setLastEvent(`⚔️ ${names[color]} ne ${captured.map((x) => names[x.color]).join(', ')} ki goti kaat di!`); setTimeout(() => setLastEvent(''), 2800); }
    if (finishedToken) { sfx.home(); setLastEvent(`🏠 ${names[color]} ki ek goti GHAR pahunchi!`); setTimeout(() => setLastEvent(''), 2400); }
    busy.current = false;
    if (won) { setWinner(color); setPhase('over'); sfx.win(); vibrate([100, 50, 100, 50, 200]); return; }
    nextTurn(color, rolled === 6 || captured.length > 0 || finishedToken);
  }, [names, nextTurn, sfx]);

  const rollDice = useCallback(async () => {
    if (phase !== 'roll' || rolling || busy.current || winner) return;
    const color = stateRef.current.turn;
    setRolling(true); sfx.dice(); vibrate(30);
    await sleep(600);
    const rolled = Math.floor(Math.random() * 6) + 1;
    setDice(rolled); setRolling(false);
    if (rolled === 6 && sixes + 1 >= 3) { setToast('Teen baar 6! Baari khatm 😅'); await sleep(800); setSixes(0); nextTurn(color, false); return; }
    setSixes(rolled === 6 ? sixes + 1 : 0);
    const options = movableIndices(stateRef.current.tokens[color], rolled);
    if (!options.length) { setToast(`${names[color]}: ${rolled} — koi goti nahi chalegi`); await sleep(800); nextTurn(color, false); return; }
    setMovable(options); setPhase('move');
    if (isAI(color)) { await sleep(500); const pick = chooseAiMove(stateRef.current.tokens, color, rolled); if (pick >= 0) doMove(color, pick, rolled); }
  }, [phase, rolling, winner, sixes, isAI, doMove, nextTurn, sfx, names]);

  useEffect(() => {
    if (screen === 'game' && phase === 'roll' && isAI(turn) && !winner) { const t = setTimeout(rollDice, 850); return () => clearTimeout(t); }
  }, [screen, phase, turn, isAI, winner, rollDice]);

  const cellTokens = useMemo(() => {
    const map = new Map();
    activeColors.forEach((color) => tokens[color].forEach((p, i) => {
      const [r, c] = coordOf(color, p, i);
      const k = key(r, c); if (!map.has(k)) map.set(k, []);
      map.get(k).push({ color, idx: i, progress: p });
    }));
    return map;
  }, [tokens, activeColors]);

  const canTap = (color, idx) => phase === 'move' && turn === color && movable.includes(idx) && !isAI(color);

  // ───────── MENU ─────────
  if (screen === 'menu') {
    return (
      <div className="phone menu">
        <div className="menu-pattern" />
        <header className="menu-top"><span className="pill">🪙 10,000</span><span className="pill gold">👑 LUDO ROYAL</span><span className="pill">⚙️</span></header>
        <div className="logo">
          <div className="logo-board"><span className="lb r" /><span className="lb g" /><span className="lb y" /><span className="lb b" /><span className="lb-dice">⚄</span></div>
          <h1>LUDO <span>ROYAL</span></h1>
          <p>Ludo King jaisa asli maza — FREE • No Ads • Har phone par</p>
        </div>

        <button className="install-btn" onClick={installApp}>📲 APP INSTALL KARO — PHONE MEIN LAGAO</button>
        {showInstallHelp && (
          <div className="install-help">
            <b>Install kaise kare?</b>
            <p>📱 <b>Android (Chrome):</b> upar ⋮ menu → <b>"Install app / Add to Home screen"</b></p>
            <p>🍎 <b>iPhone (Safari):</b> Share ⤴ button → <b>"Add to Home Screen"</b></p>
            <p>Ya neeche di gayi <b>APK file</b> download karke direct install karo!</p>
            <button onClick={() => setShowInstallHelp(false)}>Samajh gaya ✓</button>
          </div>
        )}

        <div className="mode-grid">
          <button className={`mode-tile ${mode === 'computer' ? 'on' : ''}`} onClick={() => setMode('computer')}><span className="mt-emoji">🤖</span><b>COMPUTER</b><small>Computer se khelo</small></button>
          <button className={`mode-tile ${mode === 'pass' ? 'on' : ''}`} onClick={() => setMode('pass')}><span className="mt-emoji">👨‍👩‍👧‍👦</span><b>PASS N PLAY</b><small>Doston ke saath 1 phone par</small></button>
        </div>

        <div className="menu-card">
          <label>Kitne Players?</label>
          <div className="seg">{[2, 3, 4].map((n) => <button key={n} className={numPlayers === n ? 'on' : ''} onClick={() => setNumPlayers(n)}>{n}P</button>)}</div>
          <label>Players</label>
          <div className="names">
            {activeColors.map((c) => (
              <div key={c} className="name-row">
                <span className="avatar">{mode === 'computer' && c !== 'red' ? '🤖' : AVATAR[c]}</span>
                <span className={`dot bg-${c}`} />
                <input value={names[c]} disabled={mode === 'computer' && c !== 'red'} onChange={(e) => setNames({ ...names, [c]: e.target.value.slice(0, 12) || META[c].label })} />
                <span className="tag">{mode === 'computer' && c !== 'red' ? 'CPU' : 'PLAYER'}</span>
              </div>
            ))}
          </div>
          <button className="play-btn" onClick={startGame}>▶ KHELNA SHURU KARO</button>
        </div>

        <div className="how">
          <h3>🎲 Kaise Khele?</h3>
          <ol><li><b>6</b> aane par goti bahar niklegi</li><li>⭐ Safe hai — wahan kata nahi hoga</li><li>Dushman ko kato ⚔️ = <b>extra baari</b></li><li>4 gotiyan 🏠 ghar = <b>JEET!</b> 👑</li></ol>
        </div>
        <p className="credit">Free &amp; Open Source (MIT) • REA MCP plugged • Clean-room Ludo — koi copy nahi</p>
      </div>
    );
  }

  // ───────── GAME ─────────
  return (
    <div className="phone game">
      <header className="game-top">
        <button className="icon-btn" onClick={() => setScreen('menu')}>⬅</button>
        <div className="game-title">👑 LUDO ROYAL</div>
        <button className="icon-btn" onClick={() => setSound(!sound)}>{sound ? '🔊' : '🔇'}</button>
        <button className="icon-btn" onClick={startGame}>↻</button>
      </header>

      <div className="board-area">
        {activeColors.map((c) => (
          <div key={c} className={`corner-player cp-${CORNER[c]} ${turn === c ? 'active' : ''}`}>
            <span className="cp-avatar">{mode === 'computer' && isAI(c) ? '🤖' : AVATAR[c]}</span>
            <span className="cp-name">{names[c]}</span>
            <span className="cp-home">🏠 {tokens[c].filter((p) => p === 56).length}/4</span>
            {turn === c && <span className="cp-turn">🎲 BAARI</span>}
          </div>
        ))}

        <div className="board-frame">
          <div className="board">
            {Array.from({ length: 15 }, (_, r) => Array.from({ length: 15 }, (_, c) => {
              const cell = CELL_MAP.get(key(r, c));
              const here = cellTokens.get(key(r, c)) || [];
              const isCentre = r >= 6 && r <= 8 && c >= 6 && c <= 8;
              return (
                <div key={key(r, c)} className={`cell ${cell?.track ? 'track' : ''} ${isCentre ? 'centre-cell' : ''}`} style={{ background: cell?.bg }}>
                  {cell?.safe && <span className="star">★</span>}
                  {cell?.baseSpot && <span className={`base-spot spot-${cell.baseSpot}`} />}
                  <div className={`tokens n${Math.min(here.length, 4)}`}>
                    {here.map((t) => (
                      <button key={`${t.color}${t.idx}`} disabled={!canTap(t.color, t.idx)} onClick={() => doMove(t.color, t.idx, dice)} className={`token ${canTap(t.color, t.idx) ? 'movable' : ''}`} aria-label={`${t.color} goti`}>
                        <Pawn color={t.color} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            }))}
            <div className="centre-triangles"><span className="ct-label">HOME</span></div>
          </div>
        </div>
      </div>

      <div className="toast">{toast}</div>
      {lastEvent && <div className="event-toast">{lastEvent}</div>}

      <div className={`control-deck deck-${turn}`}>
        <div className="deck-player">
          <span className="cp-avatar big">{mode === 'computer' && isAI(turn) ? '🤖' : AVATAR[turn]}</span>
          <div><b>{names[turn]}</b><small>{phase === 'move' ? (isAI(turn) ? 'goti chal raha hai…' : '👆 chamakti goti tap karo!') : isAI(turn) ? 'Computer ki baari…' : 'Dice dabao!'}</small></div>
        </div>
        <Dice value={dice} rolling={rolling} color={turn} disabled={phase !== 'roll' || isAI(turn)} onClick={rollDice} />
        <button className="roll-btn" disabled={phase !== 'roll' || isAI(turn) || rolling} onClick={rollDice}>{rolling ? '...' : '🎲 ROLL'}</button>
      </div>

      <div className="score-strip">
        {activeColors.map((c) => <span key={c} className={turn === c ? 'on' : ''}>{META[c].emoji} {names[c]}: {tokens[c].filter((p) => p === 56).length}🏠</span>)}
      </div>

      {winner && (
        <div className="modal-bg"><div className="modal">
          <div className="confetti">🎉👑🎉</div>
          <div className="trophy">🏆</div>
          <h2>{names[winner]} JEET GAYA!</h2>
          <p>{META[winner].emoji} {META[winner].label} ne saari 4 gotiyan ghar pahuncha di!</p>
          <button className="play-btn" onClick={startGame}>↻ PHIR SE KHELO</button>
          <button className="ghost-btn" onClick={() => setScreen('menu')}>🏠 Menu</button>
        </div></div>
      )}
    </div>
  );
}
