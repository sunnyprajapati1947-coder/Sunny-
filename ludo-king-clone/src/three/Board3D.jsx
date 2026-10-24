import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { coordOf } from '../game/engine.js';
import { createBoardTexture } from './boardTexture.js';

const COLOR_HEX = { red: '#e8261c', green: '#17b93a', yellow: '#ffc400', blue: '#1673e6' };
const toWorld = ([r, c]) => [(c - 7) * 1, (r - 7) * 1]; // [x, z]

// pawn profile (lathe) for a glossy realistic pawn
function usePawnGeometry() {
  return useMemo(() => {
    const pts = [];
    [[0.001, 0], [0.30, 0], [0.31, 0.05], [0.20, 0.10], [0.145, 0.20], [0.13, 0.38], [0.19, 0.50], [0.20, 0.55], [0.10, 0.60], [0.001, 0.62]]
      .forEach(([a, b]) => pts.push(new THREE.Vector2(a, b)));
    return new THREE.LatheGeometry(pts, 28);
  }, []);
}

function Pawn({ color, target, movable, isTurn, onTap, stackOffset }) {
  const ref = useRef();
  const body = usePawnGeometry();
  const pos = useRef(new THREE.Vector3(target[0], 0.58, target[1]));
  const hop = useRef(0);
  useFrame((state, dt) => {
    if (!ref.current) return;
    const t = new THREE.Vector3(target[0] + stackOffset[0], 0.58, target[1] + stackOffset[1]);
    const dist = pos.current.distanceTo(t);
    if (dist > 0.02) hop.current = Math.min(1, hop.current + dt * 3.2);
    else hop.current = Math.max(0, hop.current - dt * 4);
    pos.current.lerp(t, 1 - Math.exp(-10 * dt));
    const jump = Math.sin(hop.current * Math.PI) * 0.55 * Math.min(1, dist + 0.35);
    const idle = movable ? Math.abs(Math.sin(state.clock.elapsedTime * 6)) * 0.22 : 0;
    ref.current.position.set(pos.current.x, 0.58 + jump + idle, pos.current.z);
    const s = movable ? 1.12 : 1;
    ref.current.scale.setScalar(THREE.MathUtils.lerp(ref.current.scale.x, s, 0.2));
  });
  return (
    <group ref={ref} position={[target[0], 0.58, target[1]]}>
      {movable && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <ringGeometry args={[0.30, 0.42, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.95} />
        </mesh>
      )}
      <group onClick={(e) => { e.stopPropagation(); onTap?.(); }} onPointerOver={(e) => movable && e.stopPropagation()}>
        <mesh geometry={body} castShadow receiveShadow>
          <meshPhysicalMaterial color={COLOR_HEX[color]} roughness={0.22} metalness={0.05} clearcoat={1} clearcoatRoughness={0.18} emissive={COLOR_HEX[color]} emissiveIntensity={movable ? 0.45 : isTurn ? 0.12 : 0.02} />
        </mesh>
        <mesh position={[0, 0.78, 0]} castShadow>
          <sphereGeometry args={[0.185, 28, 22]} />
          <meshPhysicalMaterial color={COLOR_HEX[color]} roughness={0.16} clearcoat={1} clearcoatRoughness={0.12} emissive={COLOR_HEX[color]} emissiveIntensity={movable ? 0.5 : 0.03} />
        </mesh>
        <mesh position={[-0.06, 0.86, 0.13]}>
          <sphereGeometry args={[0.055, 12, 10]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
        </mesh>
      </group>
    </group>
  );
}

function Scene({ tokens, activeColors, movable, turn, onPawnTap }) {
  const boardTex = useMemo(() => createBoardTexture(), []);
  const frame = useRef();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    state.camera.position.x = Math.sin(t * 0.12) * 1.1;
    state.camera.position.y = 15.8 + Math.sin(t * 0.2) * 0.35;
    state.camera.position.z = 11.2;
    state.camera.lookAt(0, 0, 0.4);
    if (frame.current) frame.current.material.emissiveIntensity = 0.55 + Math.sin(t * 1.6) * 0.18;
  });

  // stacking offsets when pawns share a cell
  const placements = useMemo(() => {
    const byCell = new Map();
    activeColors.forEach((color) => tokens[color].forEach((p, i) => {
      const coord = coordOf(color, p, i); const k = coord.join(',');
      if (!byCell.has(k)) byCell.set(k, []);
      byCell.get(k).push({ color, idx: i, progress: p, coord });
    }));
    const out = [];
    byCell.forEach((list) => list.forEach((item, n) => {
      const offs = [[0, 0], [-0.20, -0.20], [0.20, -0.20], [-0.20, 0.20], [0.20, 0.20]];
      out.push({ ...item, offset: list.length > 1 ? offs[n % 5] : [0, 0] });
    }));
    return out;
  }, [tokens, activeColors]);

  const particles = useMemo(() => {
    const arr = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) { arr[i * 3] = (Math.random() - .5) * 30; arr[i * 3 + 1] = Math.random() * 9 + 1; arr[i * 3 + 2] = (Math.random() - .5) * 30; }
    return arr;
  }, []);

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[7, 14, 6]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-11} shadow-camera-right={11} shadow-camera-top={11} shadow-camera-bottom={-11} />
      <pointLight position={[-10, 6, -6]} intensity={18} color="#ff3df2" />
      <pointLight position={[10, 5, 8]} intensity={16} color="#22d3ee" />
      {/* neon base + board */}
      <mesh ref={frame} position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[16.1, 0.5, 16.1]} />
        <meshStandardMaterial color="#131a4a" emissive="#4f46e5" emissiveIntensity={0.55} roughness={0.35} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.36, 0]} receiveShadow castShadow>
        <boxGeometry args={[15.3, 0.42, 15.3]} />
        <meshStandardMaterial attach="material-0" color="#1b2358" roughness={0.5} />
        <meshStandardMaterial attach="material-1" color="#1b2358" roughness={0.5} />
        <meshStandardMaterial attach="material-2" map={boardTex} roughness={0.38} metalness={0.05} />
        <meshStandardMaterial attach="material-3" color="#10163d" roughness={0.6} />
        <meshStandardMaterial attach="material-4" color="#1b2358" roughness={0.5} />
        <meshStandardMaterial attach="material-5" color="#1b2358" roughness={0.5} />
      </mesh>
      {/* floor glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.24, 0]} receiveShadow>
        <planeGeometry args={[46, 46]} />
        <shadowMaterial opacity={0.32} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.26, 0]}>
        <circleGeometry args={[13.5, 48]} />
        <meshBasicMaterial color="#312e81" transparent opacity={0.35} />
      </mesh>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.09} color="#a5f3fc" transparent opacity={0.75} sizeAttenuation />
      </points>

      {placements.map(({ color, idx, progress, coord, offset }) => {
        const [wx, wz] = toWorld(coord);
        const inBase = progress === -1;
        const scalePos = inBase ? [wx, wz] : [wx, wz];
        return (
          <Pawn key={`${color}-${idx}`} color={color} target={scalePos} stackOffset={offset}
            movable={turn === color && movable.includes(idx)} isTurn={turn === color}
            onTap={() => onPawnTap(color, idx)} />
        );
      })}
    </>
  );
}

export default function Board3D(props) {
  return (
    <Canvas shadows dpr={[1, 1.8]} camera={{ position: [0, 15.8, 11.2], fov: 41, near: 0.1, far: 90 }} gl={{ antialias: true, alpha: true }} style={{ background: 'transparent' }}>
      <Scene {...props} />
    </Canvas>
  );
}
