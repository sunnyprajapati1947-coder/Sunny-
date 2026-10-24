import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createDiceFaceTexture } from './boardTexture.js';

// face order for BoxGeometry materials: [+x, -x, +y, -y, +z, -z]  (opposites sum to 7)
const FACE_VALUE = [3, 4, 1, 6, 2, 5];
// quaternion that brings each value to the TOP (+y)
function quatFor(value) {
  const e = {
    1: [0, 0, 0],
    6: [Math.PI, 0, 0],
    2: [-Math.PI / 2, 0, 0],
    5: [Math.PI / 2, 0, 0],
    3: [0, 0, Math.PI / 2],
    4: [0, 0, -Math.PI / 2],
  }[value];
  // stylish yaw applied AFTER the face is on top (yaw around Y keeps the top face up)
  const face = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], 0, e[2]));
  const yaw = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.45, 0));
  return yaw.multiply(face);
}

function DiceMesh({ value, rolling, color }) {
  const ref = useRef();
  const target = useMemo(() => quatFor(value), [value]);
  const spin = useRef(new THREE.Vector3(9, 11, 7));
  const mats = useMemo(() => FACE_VALUE.map((v) => new THREE.MeshPhysicalMaterial({
    map: createDiceFaceTexture(v, color), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.15,
  })), [color]);
  useFrame((state, dt) => {
    if (!ref.current) return;
    if (rolling) {
      ref.current.rotation.x += spin.current.x * dt;
      ref.current.rotation.y += spin.current.y * dt;
      ref.current.rotation.z += spin.current.z * dt;
      ref.current.position.y = Math.abs(Math.sin(state.clock.elapsedTime * 9)) * 0.42;
      ref.current.scale.setScalar(1.04);
    } else {
      ref.current.quaternion.slerp(target, 1 - Math.exp(-9 * dt));
      ref.current.position.y = THREE.MathUtils.lerp(ref.current.position.y, 0, 1 - Math.exp(-10 * dt));
      ref.current.scale.setScalar(THREE.MathUtils.lerp(ref.current.scale.x, 1, 0.15));
    }
  });
  return (
    <mesh ref={ref} material={mats} castShadow>
      <boxGeometry args={[1.55, 1.55, 1.55]} />
    </mesh>
  );
}

export default function Dice3D({ value, rolling, pipColor = '#141b3f' }) {
  return (
    <div className="dice3d" aria-label={`Dice showing ${value}`}>
      <Canvas dpr={[1, 2]} camera={{ position: [2.6, 2.2, 2.6], fov: 38 }} gl={{ antialias: true, alpha: true }} style={{ background: 'transparent' }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[4, 6, 3]} intensity={1.5} />
        <pointLight position={[-4, 3, -2]} intensity={10} color="#22d3ee" />
        <DiceMesh value={value} rolling={rolling} color={pipColor} />
      </Canvas>
      <span className="dice3d-shadow" />
    </div>
  );
}
