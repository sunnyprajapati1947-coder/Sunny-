import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COLORS, META, movableIndices, applyMove, chooseAiMove } from './game/engine.js';

const Board3D = lazy(() => import('./three/Board3D.jsx'));
const Dice3D = lazy(() => import('./three/Dice3D.jsx'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
    dice: () => { beep(280, .06, 'square', .07); beep(420, .06, 'square', .07, .07); beep(560, .07, 'square', .07, .14); },
    step: () => beep(640, .05, 'sine', .06),
    out: () => { beep(523, .09); beep(784, .13, 'sine', .14, .08); },
    capture: () => { beep(220, .15, 'sawtooth', .13); beep(150, .2, 'sawtooth', .11, .1); },
    home: () => { [523, 659, 784].forEach((f, i) => beep(f, .12, 'sine', .13, i * .09)); },
    win: () => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => beep(f, .18, 'triangle', .15, i * .12)); },
  }), [beep]);
}

const AVATAR = { red: '🧑🏽', green: '🤖', yellow: '🧑🏻', blue: '🧑🏾' };
const CORNER = { red: 'tl', green: 'tr', yellow: 'br', blue: 'bl' };
const PIP = { red: '#e8261c', green: '#17a638', yellow: '#e09e00', blue: '#1673e6' };

export default function App() {
  const [screen, setScreen] = useState('menu');
  const [mode, setMode] = useState('computer');
  const [numPlayers, setNumPlayers] = useState(4);
  const [names, setNames] = useState({ red: 'You', green: 'Nova', yellow: 'Zara', blue: 'Kai' });
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
  const [dice, setDice] = useState(5);
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
    setTurn(activeColors[0]); setDice(5); setPhase('roll'); setMovable([]); setSixes(0); setWinner(null); setLastEvent('');
    setToast(`${names[activeColors[0]]} to move — tap the dice!`);
    setScreen('game'); vibrate(30);
  };

  const nextTurn = useCallback((cur, extra) => {
    if (extra) { setPhase('roll'); setToast(`${names[cur]} gets another turn!`); return; }
    const list = stateRef.current.activeColors;
    const nxt = list[(list.indexOf(cur) + 1) % list.length];
    setSixes(0); setTurn(nxt); setPhase('roll');
    setToast(`${names[nxt]} to move`);
  }, [names]);

  const doMove = useCallback(async (color, idx, rolled) => {
    if (busy.current) return; busy.current = true;
    setMovable([]); setPhase('anim');
    const pre = Object.fromEntries(Object.entries(stateRef.current.tokens).map(([k, v]) => [k, [...v]]));
    const from = pre[color][idx];
    const outcome = applyMove(pre, color, idx, rolled);
    if (from === -1) { setTokens(outcome.state); sfx.out(); vibrate(40); await sleep(380); }
    else {
      for (let s = 1; s < rolled; s++) {
        setTokens({ ...pre, [color]: pre[color].map((p, i) => (i === idx ? from + s : p)) });
        sfx.step(); await sleep(210);
      }
      setTokens(outcome.state); sfx.step(); vibrate(25); await sleep(260);
    }
    const { captured, finishedToken } = outcome;
    const won = outcome.state[color].every((p) => p === 56);
    if (captured.length) { sfx.capture(); vibrate([60, 40, 60]); setLastEvent(`⚔️ ${names[color]} captured ${captured.map((c) => names[c.color]).join(', ')}!`); setTimeout(() => setLastEvent(''), 2800); }
    else if (finishedToken) { sfx.home(); setLastEvent(`🏠 ${names[color]} brought a pawn HOME!`); setTimeout(() => setLastEvent(''), 2400); }
    busy.current = false;
    if (won) { setWinner(color); setPhase('over'); sfx.win(); vibrate([100, 50, 100, 50, 220]); return; }
    nextTurn(color, rolled === 6 || captured.length > 0 || finishedToken);
  }, [names, nextTurn, sfx]);

  const rollDice = useCallback(async () => {
    if (phase !== 'roll' || rolling || busy.current || winner) return;
    const color = stateRef.current.turn;
    setRolling(true); sfx.dice(); vibrate(35);
    await sleep(900);
    const rolled = Math.floor(Math.random() * 6) + 1;
    setDice(rolled);
    await sleep(420); // let the 3D dice settle on the result face
    setRolling(false);
    if (rolled === 6 && sixes + 1 >= 3) { setToast('Three 6s in a row — turn skipped!'); await sleep(800); setSixes(0); nextTurn(color, false); return; }
    setSixes(rolled === 6 ? sixes + 1 : 0);
    const options = movableIndices(stateRef.current.tokens[color], rolled);
    if (!options.length) { setToast(`${names[color]} rolled ${rolled} — no pawn can move`); await sleep(800); nextTurn(color, false); return; }
    setMovable(options); setPhase('move');
    if (isAI(color)) { await sleep(600); const pick = chooseAiMove(stateRef.current.tokens, color, rolled); if (pick >= 0) doMove(color, pick, rolled); }
  }, [phase, rolling, winner, sixes, isAI, doMove, nextTurn, sfx, names]);

  useEffect(() => {
    if (screen === 'game' && phase === 'roll' && isAI(turn) && !winner) { const t = setTimeout(rollDice, 950); return () => clearTimeout(t); }
  }, [screen, phase, turn, isAI, winner, rollDice]);

  const onPawnTap = (color, idx) => {
    if (phase === 'move' && turn === color && movable.includes(idx) && !isAI(color)) doMove(color, idx, dice);
  };

  // ───────────── MENU ─────────────
  if (screen === 'menu') {
    return (
      <div className="phone menu">
        <div className="bg-grid" /><div className="bg-glow g1" /><div className="bg-glow g2" />
        <header className="menu-top">
          <span className="pill">◈ 10,000</span>
          <span className="pill neon">LUDO ROYAL 3D</span>
          <button className="pill btn" onClick={() => setSound(!sound)}>{sound ? '🔊' : '🔇'}</button>
        </header>

        <div className="hero">
          <div className="hero-dice">
            <Suspense fallback={<div className="loading-3d">LOADING 3D…</div>}><Dice3D value={5} rolling={false} /></Suspense>
          </div>
          <h1>LUDO <span>ROYAL</span></h1>
          <p className="hero-sub">THE FUTURISTIC 3D LUDO EXPERIENCE</p>
          <p className="hero-tag">Real 3D board • Rolling 3D dice • Free forever • No ads</p>
        </div>

        <button className="install-btn" onClick={installApp}>⬇&nbsp; INSTALL THE APP</button>
        {showInstallHelp && (
          <div className="install-help">
            <b>How to install</b>
            <p>📱 <b>Android (Chrome):</b> tap ⋮ menu → <b>Install app / Add to Home screen</b></p>
            <p>🍎 <b>iPhone (Safari):</b> tap Share → <b>Add to Home Screen</b></p>
            <p>📦 Or download <b>LudoRoyal.apk</b> from the GitHub Release and install it directly.</p>
            <button onClick={() => setShowInstallHelp(false)}>GOT IT ✓</button>
          </div>
        )}

        <div className="mode-grid">
          <button className={`mode-tile ${mode === 'computer' ? 'on' : ''}`} onClick={() => setMode('computer')}>
            <span className="mt-icon">🤖</span><b>VS COMPUTER</b><small>Battle smart AI rivals</small>
          </button>
          <button className={`mode-tile ${mode === 'pass' ? 'on' : ''}`} onClick={() => setMode('pass')}>
            <span className="mt-icon">👨‍👩‍👧‍👦</span><b>PASS &amp; PLAY</b><small>Friends on one phone</small>
          </button>
        </div>

        <div className="glass-card">
          <label>Players</label>
          <div className="seg">{[2, 3, 4].map((n) => <button key={n} className={numPlayers === n ? 'on' : ''} onClick={() => setNumPlayers(n)}>{n} PLAYERS</button>)}</div>
          <label>Squad</label>
          <div className="names">
            {activeColors.map((c) => (
              <div key={c} className="name-row">
                <span className="avatar">{mode === 'computer' && c !== 'red' ? '🤖' : AVATAR[c]}</span>
                <span className={`chip chip-${c}`} />
                <input value={names[c]} disabled={mode === 'computer' && c !== 'red'} onChange={(e) => setNames({ ...names, [c]: e.target.value.slice(0, 12) || META[c].label })} />
                <span className="tag">{mode === 'computer' && c !== 'red' ? 'AI' : 'HUMAN'}</span>
              </div>
            ))}
          </div>
          <button className="play-btn" onClick={startGame}>▶ &nbsp;PLAY NOW</button>
        </div>

        <div className="glass-card rules">
          <h3>HOW TO PLAY</h3>
          <ol>
            <li>Roll a <b>6</b> to launch a pawn from base</li>
            <li><b>★ Star</b> squares are safe — no captures there</li>
            <li>Land on a rival to <b>capture</b> them ⚔️ — bonus turn!</li>
            <li>Race all <b>4 pawns</b> to the centre HOME to win 👑</li>
          </ol>
        </div>
        <p className="credit">Free &amp; Open Source (MIT) • Clean-room original • REA MCP inside</p>
      </div>
    );
  }

  // ───────────── GAME ─────────────
  return (
    <div className="phone game">
      <div className="bg-grid" /><div className="bg-glow g1" /><div className="bg-glow g2" />
      <header className="game-top">
        <button className="icon-btn" onClick={() => setScreen('menu')}>‹</button>
        <div className="game-title">LUDO <span>ROYAL</span><small>3D</small></div>
        <button className="icon-btn" onClick={() => setSound(!sound)}>{sound ? '🔊' : '🔇'}</button>
        <button className="icon-btn" onClick={startGame}>↻</button>
      </header>

      <div className="board-stage">
        {activeColors.map((c) => (
          <div key={c} className={`corner-player cp-${CORNER[c]} cpcol-${c} ${turn === c ? 'active' : ''}`}>
            <span className="cp-avatar">{mode === 'computer' && isAI(c) ? '🤖' : AVATAR[c]}</span>
            <span className="cp-name">{names[c]}</span>
            <span className="cp-home">⌂ {tokens[c].filter((p) => p === 56).length}/4</span>
          </div>
        ))}
        <div className="board-canvas">
          <Suspense fallback={<div className="loading-3d big">LOADING 3D BOARD…</div>}>
            <Board3D tokens={tokens} activeColors={activeColors} movable={phase === 'move' && !isAI(turn) ? movable : (phase === 'move' ? movable : [])} turn={turn} onPawnTap={onPawnTap} />
          </Suspense>
        </div>
      </div>

      <div className="toast">{toast}</div>
      {lastEvent && <div className="event-toast">{lastEvent}</div>}

      <div className={`control-deck deck-${turn}`}>
        <div className="deck-player">
          <span className="cp-avatar big">{mode === 'computer' && isAI(turn) ? '🤖' : AVATAR[turn]}</span>
          <div>
            <b>{names[turn]}</b>
            <small>{phase === 'move' ? (isAI(turn) ? 'AI is moving…' : 'Tap a glowing pawn!') : phase === 'anim' ? 'Moving…' : isAI(turn) ? 'AI is thinking…' : 'Your move — roll!'}</small>
          </div>
        </div>
        <button className="dice-hit" onClick={rollDice} disabled={phase !== 'roll' || isAI(turn) || rolling} aria-label="Roll the dice">
          <Suspense fallback={<div className="loading-3d">…</div>}><Dice3D value={dice} rolling={rolling} pipColor={PIP[turn]} /></Suspense>
        </button>
        <button className="roll-btn" disabled={phase !== 'roll' || isAI(turn) || rolling} onClick={rollDice}>{rolling ? 'ROLLING…' : '🎲 ROLL'}</button>
      </div>

      <div className="score-strip">
        {activeColors.map((c) => <span key={c} className={turn === c ? 'on' : ''}><i className={`chip chip-${c}`} />{names[c]} · {tokens[c].filter((p) => p === 56).length}⌂</span>)}
      </div>

      {winner && (
        <div className="modal-bg"><div className="modal">
          <div className="trophy">🏆</div>
          <h2>{names[winner]} WINS!</h2>
          <p>{META[winner].label} raced all four pawns home. Champion of the board! 👑</p>
          <button className="play-btn" onClick={startGame}>↻ &nbsp;PLAY AGAIN</button>
          <button className="ghost-btn" onClick={() => setScreen('menu')}>MAIN MENU</button>
        </div></div>
      )}
    </div>
  );
}
