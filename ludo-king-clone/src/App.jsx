import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COLORS, META, PATH, SAFE, coordOf, globalIndex, movableIndices, applyMove, chooseAiMove, DICE_PIPS } from './game/engine.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (r, c) => `${r},${c}`;

// ── tiny WebAudio sounds (no files needed) ──────────────────────────────────
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
    step: () => beep(600, .05, 'sine', .07),
    out: () => { beep(523, .09); beep(784, .12, 'sine', .15, .08); },
    capture: () => { beep(220, .15, 'sawtooth', .14); beep(160, .2, 'sawtooth', .12, .1); },
    home: () => { [523, 659, 784].forEach((f, i) => beep(f, .12, 'sine', .14, i * .09)); },
    win: () => { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => beep(f, .18, 'triangle', .16, i * .13)); },
    turn: () => beep(880, .06, 'sine', .06),
  }), [beep]);
}

function Dice({ value, rolling, onClick, disabled, color }) {
  const face = rolling ? Math.floor(Math.random() * 6) + 1 : value;
  return (
    <button className={`dice dice-${color} ${rolling ? 'rolling' : ''}`} onClick={onClick} disabled={disabled} aria-label="Roll dice">
      <span className="dice-grid">{Array.from({ length: 9 }, (_, i) => <span key={i} className={DICE_PIPS[face]?.includes(i) ? 'pip on' : 'pip'} />)}</span>
    </button>
  );
}

// board cell background map
function buildCellMap() {
  const m = new Map();
  const set = (r, c, v) => m.set(key(r, c), v);
  for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) set(r, c, { bg: '#fff' });
  // bases: coloured outer + white inner yard (Ludo King look)
  const paintBase = (r0, c0, color) => {
    for (let r = r0; r < r0 + 6; r++) for (let c = c0; c < c0 + 6; c++) set(r, c, { bg: `var(--${color})` });
    for (let r = r0 + 1; r < r0 + 5; r++) for (let c = c0 + 1; c < c0 + 5; c++) set(r, c, { bg: '#fff', baseInner: color });
    META[color].base.forEach(([r, c]) => set(r, c, { bg: '#fff', baseSpot: color }));
  };
  paintBase(0, 0, 'red'); paintBase(0, 9, 'green'); paintBase(9, 9, 'yellow'); paintBase(9, 0, 'blue');
  // centre home triangles (approx. with solid cells)
  const centre = { '6,6': 'var(--red)', '6,7': 'var(--green)', '6,8': 'var(--green)', '7,6': 'var(--red)', '7,7': '#fff', '7,8': 'var(--yellow)', '8,6': 'var(--blue)', '8,7': 'var(--blue)', '8,8': 'var(--yellow)' };
  Object.entries(centre).forEach(([k, bg]) => { const [r, c] = k.split(',').map(Number); set(r, c, { bg, centre: true }); });
  // track
  PATH.forEach(([r, c], i) => set(r, c, { bg: '#fff', safe: SAFE.has(i), track: true }));
  COLORS.forEach((col) => {
    const [r, c] = PATH[META[col].start];
    set(r, c, { bg: `var(--${col})`, start: col, track: true });
    META[col].homeCol.forEach(([hr, hc], i) => { if (i < 5) set(hr, hc, { bg: `var(--${col}-light)`, track: true }); });
  });
  // ★ safe squares that are not starts keep white bg (star drawn)
  [[2, 6], [6, 12], [12, 8], [8, 2]].forEach(([r, c]) => { const v = m.get(key(r, c)); if (v) v.safe = true; });
  return m;
}
const CELL_MAP = buildCellMap();

export default function App() {
  const [screen, setScreen] = useState('menu'); // menu | game
  const [mode, setMode] = useState('computer'); // computer | pass
  const [numPlayers, setNumPlayers] = useState(4);
  const [names, setNames] = useState({ red: 'You', green: 'Computer 1', yellow: 'Computer 2', blue: 'Computer 3' });
  const [sound, setSound] = useState(true);
  const sfx = useSounds(sound);

  const activeColors = useMemo(() => {
    if (numPlayers === 2) return ['red', 'yellow'];
    if (numPlayers === 3) return ['red', 'green', 'yellow'];
    return COLORS;
  }, [numPlayers]);

  const isAI = useCallback((color) => mode === 'computer' && color !== 'red', [mode]);

  // ── game state ──
  const [tokens, setTokens] = useState(() => Object.fromEntries(COLORS.map((c) => [c, [-1, -1, -1, -1]])));
  const [turn, setTurn] = useState('red');
  const [dice, setDice] = useState(6);
  const [phase, setPhase] = useState('roll'); // roll | move | over
  const [rolling, setRolling] = useState(false);
  const [movable, setMovable] = useState([]);
  const [sixes, setSixes] = useState(0);
  const [winner, setWinner] = useState(null);
  const [toast, setToast] = useState('Welcome to Ludo Royal!');
  const [lastCapture, setLastCapture] = useState('');
  const busy = useRef(false);
  const stateRef = useRef({ tokens, turn, activeColors });
  stateRef.current = { tokens, turn, activeColors };

  const startGame = () => {
    setTokens(Object.fromEntries(COLORS.map((c) => [c, [-1, -1, -1, -1]])));
    setTurn(activeColors[0]); setDice(6); setPhase('roll'); setMovable([]); setSixes(0); setWinner(null);
    setToast(`${names[activeColors[0]]} ki baari — dice dabao! 🎲`);
    setScreen('game');
  };

  const nextTurn = useCallback((cur, curTokens, extra) => {
    if (extra) { setPhase('roll'); setToast(`${META[cur].label} ko ek aur baari! 🔁`); return; }
    const list = stateRef.current.activeColors;
    const nxt = list[(list.indexOf(cur) + 1) % list.length];
    setSixes(0); setTurn(nxt); setPhase('roll');
    setToast(`${names[nxt]}${isAI(nxt) ? ' (Computer)' : ''} ki baari 🎲`);
  }, [names, isAI]);

  const doMove = useCallback(async (color, idx, rolled) => {
    if (busy.current) return; busy.current = true;
    setMovable([]); setPhase('anim');
    const pre = Object.fromEntries(Object.entries(stateRef.current.tokens).map(([k, v]) => [k, [...v]]));
    const from = pre[color][idx];
    const outcome = applyMove(pre, color, idx, rolled); // final state incl. captures
    if (from === -1) {
      setTokens(outcome.state); sfx.out(); await sleep(300);
    } else {
      for (let s = 1; s < rolled; s++) {
        setTokens({ ...pre, [color]: pre[color].map((p, i) => (i === idx ? from + s : p)) });
        sfx.step(); await sleep(165);
      }
      setTokens(outcome.state); sfx.step(); await sleep(200);
    }
    const { captured, finishedToken } = outcome;
    const won = outcome.state[color].every((p) => p === 56);
    if (captured.length) { sfx.capture(); setLastCapture(`${META[color].emoji} ${names[color]} ne ${captured.map((x) => META[x.color].label).join(', ')} ko kata! ⚔️`); setTimeout(() => setLastCapture(''), 2600); }
    if (finishedToken) sfx.home();
    busy.current = false;
    if (won) { setWinner(color); setPhase('over'); sfx.win(); return; }
    const extra = rolled === 6 || captured.length > 0 || finishedToken;
    nextTurn(color, outcome.state, extra);
  }, [names, nextTurn, sfx]);

  const rollDice = useCallback(async () => {
    if (phase !== 'roll' || rolling || busy.current || winner) return;
    const color = stateRef.current.turn;
    setRolling(true); sfx.dice();
    await sleep(550);
    const rolled = Math.floor(Math.random() * 6) + 1;
    setDice(rolled); setRolling(false);
    if (rolled === 6 && sixes + 1 >= 3) { setToast('Teen baar 6! Baari khatm 😅'); setSixes(0); await sleep(700); nextTurn(color, stateRef.current.tokens, false); return; }
    setSixes(rolled === 6 ? sixes + 1 : 0);
    const options = movableIndices(stateRef.current.tokens[color], rolled);
    if (!options.length) { setToast(`${META[color].label}: ${rolled} — koi goti nahi chal sakti`); await sleep(750); nextTurn(color, stateRef.current.tokens, false); return; }
    setMovable(options); setPhase('move');
    if (options.length === 1 && !isAI(color)) { /* let player tap anyway for feel */ }
    if (isAI(color)) { await sleep(450); const pick = chooseAiMove(stateRef.current.tokens, color, rolled); if (pick >= 0) doMove(color, pick, rolled); }
  }, [phase, rolling, winner, sixes, isAI, doMove, nextTurn, sfx]);

  // AI auto-roll
  useEffect(() => {
    if (screen === 'game' && phase === 'roll' && isAI(turn) && !winner) { const t = setTimeout(rollDice, 800); return () => clearTimeout(t); }
  }, [screen, phase, turn, isAI, winner, rollDice]);

  // tokens per board cell
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

  // ── MENU (Ludo King style home) ──
  if (screen === 'menu') {
    return (
      <div className="menu">
        <div className="menu-pattern" />
        <header className="menu-top"><span className="coin">🪙 10,000</span><span className="gem">💎 Free &amp; Open Source</span></header>
        <div className="logo"><div className="crown">👑</div><h1>LUDO <span>ROYAL</span></h1><p>Ludo King jaisa maza — bilkul FREE, no ads, open source!</p></div>

        <div className="menu-card">
          <label>Kaise khelna hai?</label>
          <div className="seg">
            <button className={mode === 'computer' ? 'on' : ''} onClick={() => setMode('computer')}>🤖 COMPUTER<br /><small>Computer ke saath khelo</small></button>
            <button className={mode === 'pass' ? 'on' : ''} onClick={() => setMode('pass')}>👥 PASS N PLAY<br /><small>Ek phone par doston ke saath</small></button>
          </div>
          <label>Kitne players?</label>
          <div className="seg small">{[2, 3, 4].map((n) => <button key={n} className={numPlayers === n ? 'on' : ''} onClick={() => setNumPlayers(n)}>{n} Players</button>)}</div>
          <label>Player names</label>
          <div className="names">
            {activeColors.map((c) => (
              <div key={c} className="name-row"><span className={`dot bg-${c}`} /><input value={names[c]} disabled={mode === 'computer' && c !== 'red'} onChange={(e) => setNames({ ...names, [c]: e.target.value.slice(0, 12) || META[c].label })} /><span className="tag">{mode === 'computer' && c !== 'red' ? 'CPU' : 'PLAYER'}</span></div>
            ))}
          </div>
          <button className="play-btn" onClick={startGame}>▶ &nbsp;KHELNA SHURU KARO</button>
          <div className="menu-links"><span>🎲 Classic Mode</span><span>⭐ Safe Stars</span><span>⚔️ Kata = Extra Turn</span></div>
        </div>

        <div className="how">
          <h3>Kaise khele? (Same Ludo King rules)</h3>
          <ol><li>Dice par <b>6</b> aane par goti (token) ghar se bahar niklegi.</li><li>⭐ wala khana <b>safe</b> hai — wahan koi nahi mar sakta.</li><li>Dushman ki goti par pahuncho to use <b>kaat</b> doge — aur extra baari milegi!</li><li>Saari 4 gotiyan beech wale ghar tak pahunchane wala <b>jeetega</b> 👑</li></ol>
          <p className="credit">REA MCP se plugged • Clean-room open-source clone (MIT) • Koi Ludo King asset copy nahi — sirf public Ludo rules</p>
        </div>
      </div>
    );
  }

  // ── GAME ──
  return (
    <div className="game">
      <header className="game-top">
        <button className="icon-btn" onClick={() => setScreen('menu')}>← Menu</button>
        <div className="game-title">👑 LUDO ROYAL</div>
        <button className="icon-btn" onClick={() => setSound(!sound)}>{sound ? '🔊' : '🔇'}</button>
        <button className="icon-btn" onClick={startGame}>↻ Restart</button>
      </header>

      <div className="turn-banner" style={{ borderColor: `var(--${turn})` }}>
        <span className={`dot bg-${turn} pulse`} /> {toast}
      </div>
      {lastCapture && <div className="capture-toast">{lastCapture}</div>}

      <div className="layout">
        <div className="board-wrap">
          <div className="board">
            {Array.from({ length: 15 }, (_, r) => Array.from({ length: 15 }, (_, c) => {
              const cell = CELL_MAP.get(key(r, c));
              const here = cellTokens.get(key(r, c)) || [];
              return (
                <div key={key(r, c)} className={`cell ${cell?.track ? 'track' : ''} ${cell?.centre ? 'centre-cell' : ''}`} style={{ background: cell?.bg, ...(cell?.baseSpot ? { boxShadow: `inset 0 0 0 3px var(--${cell.baseSpot})` } : {}) }}>
                  {cell?.safe && !cell?.start && <span className="star">★</span>}
                  {r === 7 && c === 7 && <span className="home-label">🏠</span>}
                  <div className={`tokens n${Math.min(here.length, 4)}`}>
                    {here.map((t) => <Token key={`${t.color}${t.idx}`} t={t} active={canTap(t.color, t.idx)} onTap={canTap(t.color, t.idx) ? () => doMove(t.color, t.idx, dice) : undefined} />)}
                  </div>
                </div>
              );
            }))}
          </div>
          <p className="hint">{phase === 'move' && !isAI(turn) ? '👆 Chamkti hui goti par tap karo!' : phase === 'roll' && !isAI(turn) ? '👇 Neeche dice dabao' : isAI(turn) ? '🤖 Computer soch raha hai…' : ''}</p>
        </div>

        <aside className="side">
          <div className="players">
            {activeColors.map((c) => {
              const done = tokens[c].filter((p) => p === 56).length;
              const out = tokens[c].filter((p) => p >= 0).length;
              return (
                <div key={c} className={`player-card ${turn === c ? 'active' : ''}`} style={{ '--pc': `var(--${c})` }}>
                  <span className={`dot bg-${c}`} /><div><b>{names[c]}</b><small>{isAI(c) ? '🤖 Computer' : '👤 Player'} • Ghar: {done}/4 • Bahar: {out}</small></div>
                  {turn === c && <span className="turn-arrow">◀ BAARI</span>}
                </div>
              );
            })}
          </div>

          <div className={`dice-box dice-box-${turn}`}>
            <div className="dice-label">{META[turn].emoji} {names[turn]} ka Dice</div>
            <Dice value={dice} rolling={rolling} color={turn} disabled={phase !== 'roll' || isAI(turn)} onClick={rollDice} />
            <button className="roll-btn" disabled={phase !== 'roll' || isAI(turn) || rolling} onClick={rollDice}>{rolling ? 'Roll ho raha…' : isAI(turn) ? 'Computer roll karega…' : '🎲 DICE GHUMAO'}</button>
            <div className="dice-value">Aaya: <b>{dice}</b>{dice === 6 ? ' — 6! 🎉' : ''}</div>
          </div>

          <div className="rules-mini"><b>Quick Rules:</b> 6 = goti bahar + extra baari • ★ = safe • Kata = extra baari • Goti ghar = extra baari • Teen 6 = baari khatam</div>
        </aside>
      </div>

      {winner && (
        <div className="modal-bg"><div className="modal">
          <div className="trophy">🏆</div><h2>{META[winner].emoji} {names[winner]} JEET GAYA!</h2>
          <p>Badhaai ho! 👑 {META[winner].label} ne saari gotiyan ghar pahuncha di.</p>
          <button className="play-btn" onClick={startGame}>↻ PHIR SE KHELO</button>
          <button className="ghost-btn" onClick={() => setScreen('menu')}>Menu par jao</button>
        </div></div>
      )}
    </div>
  );
}

function Token({ t, active, onTap, small }) {
  return (
    <button disabled={!onTap} onClick={onTap} className={`token bg-${t.color} ${active ? 'movable' : ''} ${small ? 'small' : ''}`} aria-label={`${t.color} token`}>
      <span>{t.progress === 56 ? '👑' : '●'}</span>
    </button>
  );
}
