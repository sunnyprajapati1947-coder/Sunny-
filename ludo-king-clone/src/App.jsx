import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COLORS, META, movableIndices, applyMove, chooseAiMove } from './game/engine.js';
import { Peer } from 'peerjs';

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
  // ── Online (PeerJS room-code multiplayer) ──
  const [onlineName, setOnlineName] = useState('Player 1');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [myColor, setMyColor] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [lobby, setLobby] = useState([]);
  const [onlineStatus, setOnlineStatus] = useState('');
  const peerRef = useRef(null);
  const connsRef = useRef(new Map());
  const hostConnRef = useRef(null);
  const applyingRemote = useRef(false);
  const modeRef = useRef('computer');
  const hostRef = useRef(false);
  const configRef = useRef({});
  const myColorRef = useRef(null);
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

  modeRef.current = mode; hostRef.current = isHost; myColorRef.current = myColor;
  configRef.current = { numPlayers, activeColors, names, onlineName };

  const netSend = (msg, excludePeer = null) => {
    try {
      if (hostRef.current) connsRef.current.forEach((c, peerId) => { if (peerId !== excludePeer && c.open) c.send(msg); });
      else if (hostConnRef.current?.open) hostConnRef.current.send(msg);
    } catch { /* connection still opening */ }
  };

  const applyRemoteState = (payload) => {
    if (!payload) return;
    applyingRemote.current = true;
    if (payload.names) setNames(payload.names);
    if (payload.numPlayers) setNumPlayers(payload.numPlayers);
    setTokens(payload.tokens); setTurn(payload.turn); setDice(payload.dice);
    setPhase(payload.phase); setMovable(payload.movable || []); setSixes(payload.sixes || 0);
    setWinner(payload.winner || null); if (payload.toast) setToast(payload.toast);
    if (payload.lastEvent) { setLastEvent(payload.lastEvent); setTimeout(() => setLastEvent(''), 2600); }
    setScreen('game');
    setTimeout(() => { applyingRemote.current = false; }, 120);
  };

  const handleNetData = (msg, fromPeer = null) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'lobby') { setLobby(msg.members || []); if (msg.names) setNames(msg.names); if (msg.numPlayers) setNumPlayers(msg.numPlayers); }
    if (msg.type === 'welcome') { setMyColor(msg.color); setOnlineStatus(`Joined as ${META[msg.color].label}. Waiting in lobby…`); }
    if (msg.type === 'start') {
      if (msg.names) setNames(msg.names);
      if (msg.numPlayers) setNumPlayers(msg.numPlayers);
      setTokens(Object.fromEntries(COLORS.map((c) => [c, [-1, -1, -1, -1]])));
      setTurn('red'); setDice(5); setPhase('roll'); setMovable([]); setSixes(0); setWinner(null);
      setToast('Match started — Red to move!'); setScreen('game');
    }
    if (msg.type === 'state') { if (hostRef.current && fromPeer) netSend(msg, fromPeer); applyRemoteState(msg.payload); }
    if (msg.type === 'emote') {
      if (hostRef.current && fromPeer) netSend(msg, fromPeer);
      setLastEvent(`${msg.name}: ${msg.text}`); setTimeout(() => setLastEvent(''), 2600);
    }
  };

  const broadcastLobby = (members) => {
    const namesMap = { ...configRef.current.names };
    members.forEach((m) => { namesMap[m.color] = m.name; });
    setNames(namesMap);
    netSend({ type: 'lobby', members, names: namesMap, numPlayers: configRef.current.numPlayers });
  };

  const destroyPeer = () => {
    try { peerRef.current?.destroy(); } catch { /* noop */ }
    peerRef.current = null; connsRef.current = new Map(); hostConnRef.current = null;
  };

  const leaveOnline = () => { destroyPeer(); setMyColor(null); setIsHost(false); setLobby([]); setRoomCode(''); setScreen('menu'); };

  const createRoom = () => {
    destroyPeer();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hostColor = 'red';
    const me = { color: hostColor, name: onlineName.trim() || 'Player 1' };
    setMode('online'); modeRef.current = 'online'; setIsHost(true); hostRef.current = true; setMyColor(hostColor);
    setLobby([me]); setOnlineStatus('Creating room…');
    setNames((n) => ({ ...n, red: me.name }));
    const peer = new Peer(`ludo-royal-3d-${code}`);
    peerRef.current = peer;
    peer.on('open', () => { setRoomCode(code); setScreen('lobby'); setOnlineStatus('Room live! Share the code with friends.'); });
    peer.on('connection', (conn) => {
      connsRef.current.set(conn.peer, conn);
      conn.on('data', (msg) => {
        if (msg?.type === 'join') {
          setLobby((prev) => {
            const cfg = configRef.current;
            if (prev.length >= cfg.numPlayers || prev.some((m) => m.name === msg.name && m.color !== 'red')) return prev;
            const color = cfg.activeColors[prev.length] || 'green';
            const members = [...prev, { color, name: String(msg.name || 'Player').slice(0, 12) }];
            setTimeout(() => { try { conn.send({ type: 'welcome', color }); } catch { /* noop */ } broadcastLobby(members); }, 60);
            return members;
          });
        } else handleNetData(msg, conn.peer);
      });
      conn.on('close', () => { connsRef.current.delete(conn.peer); setLobby((prev) => { const m = prev.filter((x, i) => i === 0 || connsRef.current.size >= i); broadcastLobby(m); return m; }); });
    });
    peer.on('error', (e) => setOnlineStatus(`Connection error: ${e.type}. Check internet and retry.`));
  };

  const joinRoom = () => {
    const code = joinCode.trim();
    if (!/^\d{6}$/.test(code)) { setOnlineStatus('Enter the 6-digit room code.'); return; }
    destroyPeer();
    setMode('online'); modeRef.current = 'online'; setIsHost(false); hostRef.current = false;
    setOnlineStatus('Connecting to room…'); setScreen('lobby'); setRoomCode(code); setLobby([]);
    const peer = new Peer();
    peerRef.current = peer;
    peer.on('open', () => {
      const conn = peer.connect(`ludo-royal-3d-${code}`, { reliable: true });
      hostConnRef.current = conn;
      conn.on('open', () => { conn.send({ type: 'join', name: onlineName.trim() || 'Player' }); setOnlineStatus('Connected! Waiting for the host to start…'); });
      conn.on('data', (msg) => handleNetData(msg));
      conn.on('close', () => setOnlineStatus('Host disconnected.'));
    });
    peer.on('error', (e) => setOnlineStatus(e.type === 'peer-unavailable' ? 'Room not found. Check the code — the host must keep the lobby open.' : `Connection error: ${e.type}`));
  };

  const hostStartMatch = () => {
    netSend({ type: 'start', names, numPlayers });
    startGame();
  };

  const sendEmote = (text) => {
    setLastEvent(`${names[myColor || turn]}: ${text}`); setTimeout(() => setLastEvent(''), 2400);
    if (modeRef.current === 'online') netSend({ type: 'emote', text, name: names[myColor || turn] });
  };

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
    if (modeRef.current === 'online' && myColorRef.current !== color) return;
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

  // sync every game change to online peers (originator broadcasts; receivers are flagged)
  useEffect(() => {
    if (screen !== 'game' || modeRef.current !== 'online' || applyingRemote.current) return;
    netSend({ type: 'state', payload: { tokens, turn, dice, phase, movable, sixes, winner, toast, names, numPlayers } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, turn, dice, phase, movable, sixes, winner, screen]);

  const isMyOnlineTurn = mode !== 'online' || myColor === turn;
  const onPawnTap = (color, idx) => {
    if (phase === 'move' && turn === color && movable.includes(idx) && !isAI(color) && isMyOnlineTurn) doMove(color, idx, dice);
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
          <button className={`mode-tile wide ${mode === 'online' ? 'on' : ''}`} onClick={() => setMode('online')}>
            <span className="mt-icon">🌐</span><b>PLAY ONLINE</b><small>Create a room code — friends join from their own phones, anywhere!</small>
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
          {mode !== 'online' && <button className="play-btn" onClick={startGame}>▶ &nbsp;PLAY NOW</button>}
        </div>

        {mode === 'online' && (
          <div className="glass-card online-card">
            <label>Your name</label>
            <div className="name-row"><span className="avatar">🧑</span><input value={onlineName} onChange={(e) => setOnlineName(e.target.value.slice(0, 12))} placeholder="Your name" /></div>
            <button className="play-btn" onClick={createRoom}>🌐 &nbsp;CREATE ROOM</button>
            <div className="join-row">
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" inputMode="numeric" />
              <button onClick={joinRoom}>JOIN ROOM</button>
            </div>
            {onlineStatus && <p className="online-status">{onlineStatus}</p>}
            <p className="online-note">Free peer-to-peer online — no sign-up. Host creates a room, friends enter the code on their phones and play live on the same 3D board.</p>
          </div>
        )}

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

  // ───────────── ONLINE LOBBY ─────────────
  if (screen === 'lobby') {
    return (
      <div className="phone menu lobby">
        <div className="bg-grid" /><div className="bg-glow g1" /><div className="bg-glow g2" />
        <header className="menu-top"><button className="pill btn" onClick={leaveOnline}>‹ LEAVE</button><span className="pill neon">ONLINE LOBBY</span><span className="pill">{lobby.length}/{numPlayers}</span></header>
        <div className="room-code-box">
          <small>ROOM CODE — SHARE WITH FRIENDS</small>
          <div className="room-code">{roomCode || '••••••'}</div>
          <div className="room-actions">
            <button onClick={() => { try { navigator.clipboard.writeText(roomCode); setOnlineStatus('Code copied!'); } catch { /* noop */ } }}>📋 COPY</button>
            <button onClick={() => { try { navigator.share({ title: 'Ludo Royal 3D', text: `Join my Ludo Royal room! Code: ${roomCode}` }); } catch { /* noop */ } }}>↗ SHARE</button>
          </div>
        </div>
        <div className="glass-card">
          <label>Players in room</label>
          <div className="names">
            {activeColors.map((c, i) => {
              const member = lobby[i];
              return <div key={c} className="name-row"><span className="avatar">{member ? AVATAR[c] : '⏳'}</span><span className={`chip chip-${c}`} /><b className="lobby-name">{member ? member.name : 'Waiting for player…'}</b>{member?.color === myColor && <span className="tag">YOU</span>}{i === 0 && <span className="tag gold">HOST</span>}</div>;
            })}
          </div>
          {isHost
            ? <button className="play-btn" disabled={lobby.length < 2} onClick={hostStartMatch}>{lobby.length < 2 ? 'WAITING FOR PLAYERS…' : `▶ START MATCH (${lobby.length} PLAYERS)`}</button>
            : <p className="online-status">⏳ Waiting for the host to start the match…</p>}
          {onlineStatus && <p className="online-status">{onlineStatus}</p>}
        </div>
        <p className="credit">Keep this screen open. Friends must open the app, tap PLAY ONLINE → enter the code.</p>
      </div>
    );
  }

  // ───────────── GAME ─────────────
  return (
    <div className="phone game">
      <div className="bg-grid" /><div className="bg-glow g1" /><div className="bg-glow g2" />
      <header className="game-top">
        <button className="icon-btn" onClick={() => (mode === 'online' ? leaveOnline() : setScreen('menu'))}>‹</button>
        <div className="game-title">LUDO <span>ROYAL</span><small>3D</small></div>
        <button className="icon-btn" onClick={() => setSound(!sound)}>{sound ? '🔊' : '🔇'}</button>
        {mode !== 'online' && <button className="icon-btn" onClick={startGame}>↻</button>}
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
            <small>{mode === 'online' && !isMyOnlineTurn ? `Waiting for ${names[turn]}…` : phase === 'move' ? (isAI(turn) ? 'AI is moving…' : 'Tap a glowing pawn!') : phase === 'anim' ? 'Moving…' : isAI(turn) ? 'AI is thinking…' : 'Your move — roll!'}</small>
          </div>
        </div>
        <button className="dice-hit" onClick={rollDice} disabled={phase !== 'roll' || isAI(turn) || !isMyOnlineTurn || rolling} aria-label="Roll the dice">
          <Suspense fallback={<div className="loading-3d">…</div>}><Dice3D value={dice} rolling={rolling} pipColor={PIP[turn]} /></Suspense>
        </button>
        <button className="roll-btn" disabled={phase !== 'roll' || isAI(turn) || !isMyOnlineTurn || rolling} onClick={rollDice}>{rolling ? 'ROLLING…' : !isMyOnlineTurn && mode === 'online' ? 'WAITING…' : '🎲 ROLL'}</button>
      </div>

      {mode === 'online' && (
        <div className="emote-bar">{['😂 LOL', '🔥 On fire!', '😱 No way!', '👏 Well played!', '😎 Too easy!', '🏆 I will win!'].map((t) => <button key={t} onClick={() => sendEmote(t)}>{t}</button>)}</div>
      )}
      <div className="score-strip">
        {activeColors.map((c) => <span key={c} className={turn === c ? 'on' : ''}><i className={`chip chip-${c}`} />{names[c]} · {tokens[c].filter((p) => p === 56).length}⌂</span>)}
      </div>

      {winner && (
        <div className="modal-bg"><div className="modal">
          <div className="trophy">🏆</div>
          <h2>{names[winner]} WINS!</h2>
          <p>{META[winner].label} raced all four pawns home. Champion of the board! 👑</p>
          {mode !== 'online' && <button className="play-btn" onClick={startGame}>↻ &nbsp;PLAY AGAIN</button>}
          <button className="ghost-btn" onClick={() => (mode === 'online' ? leaveOnline() : setScreen('menu'))}>MAIN MENU</button>
        </div></div>
      )}
    </div>
  );
}
