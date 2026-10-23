/* ==========================================================================
   MEN'S WEAR — 3D hero
   Three.js scene: flowing gold silk, rotating halo rings, drifting gold dust.
   Degrades gracefully: if WebGL is unavailable the hero simply stays flat.
   ========================================================================== */
import * as THREE from "../vendor/three.module.min.js";

const canvas = document.getElementById("hero-canvas");
const hero = document.querySelector(".hero");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (canvas && hero && !reduceMotion) {
  try {
    initHero3D();
  } catch (err) {
    // Never break the page because of a graphics failure.
    canvas.style.display = "none";
    console.warn("[hero3d] disabled:", err);
  }
}

function initHero3D() {
  const GOLD = new THREE.Color("#c9a45c");
  const GOLD_LITE = new THREE.Color("#f0dfb4");
  const DEEP = new THREE.Color("#2a1f0d");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
  } catch (e) {
    canvas.style.display = "none";
    return;
  }

  const smallScreen = window.innerWidth < 900;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, smallScreen ? 1.6 : 2));
  renderer.setClearAlpha(0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  /* ------------------------------------------------------------------ size */
  function resize() {
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  /* --------------------------------------------------- flowing silk waves */
  const silkGeometry = new THREE.PlaneGeometry(24, 12, 150, 76);

  const silkMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: DEEP },
      uGold: { value: GOLD },
      uGoldLite: { value: GOLD_LITE }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;

      void main() {
        vUv = uv;
        vec3 p = position;

        float w =
            sin(p.x * 0.52 + uTime * 0.34) * 0.62
          + sin(p.y * 0.78 - uTime * 0.26) * 0.38
          + sin((p.x + p.y) * 0.36 + uTime * 0.19) * 0.30
          + sin(p.x * 1.35 - uTime * 0.12) * 0.10;

        p.z += w;
        vWave = w;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep;
      uniform vec3 uGold;
      uniform vec3 uGoldLite;
      varying vec2 vUv;
      varying float vWave;

      void main() {
        /* vignette so the silk fades into the page instead of ending hard */
        float d = distance(vUv, vec2(0.52, 0.48));
        float edge = 1.0 - smoothstep(0.06, 0.66, d);

        /* light rolling across the folds */
        float sheen = smoothstep(-0.55, 1.15, vWave);
        vec3 col = mix(uDeep, uGold, sheen * 0.92);
        col = mix(col, uGoldLite, pow(sheen, 3.0) * 0.42);

        /* very fine fabric weave */
        float weave = smoothstep(0.93, 1.0, sin(vUv.y * 260.0) * 0.5 + 0.5);
        col += uGoldLite * weave * 0.07;

        float alpha = edge * (0.13 + sheen * 0.30);
        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  const silk = new THREE.Mesh(silkGeometry, silkMaterial);
  silk.position.set(0.6, 0.15, -3.2);
  silk.rotation.set(-0.55, 0.18, -0.26);
  scene.add(silk);

  /* ------------------------------------------------------- halo rings (3D) */
  const halo = new THREE.Group();
  halo.position.set(smallScreen ? 1.4 : 2.35, 0.05, -1.1);
  scene.add(halo);

  const ringSpecs = [
    { r: 2.28, opacity: 0.55, rot: [0.35, 0.1, 0.2] },
    { r: 2.62, opacity: 0.24, rot: [-0.5, 0.42, -0.15] },
    { r: 1.86, opacity: 0.18, rot: [0.9, -0.3, 0.4] }
  ];

  const ringMaterialBase = {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  };

  ringSpecs.forEach((spec) => {
    const geo = new THREE.TorusGeometry(spec.r, 0.0075, 6, 220);
    const mat = new THREE.MeshBasicMaterial(
      Object.assign({}, ringMaterialBase, { color: GOLD_LITE, opacity: spec.opacity })
    );
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
    halo.add(ring);
  });

  // a soft glowing core behind the rings
  const glowGeo = new THREE.PlaneGeometry(5.4, 5.4);
  const glowMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uGold: { value: GOLD } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uGold;
      varying vec2 vUv;
      void main() {
        float d = distance(vUv, vec2(0.5));
        float a = 1.0 - smoothstep(0.0, 0.5, d);
        gl_FragColor = vec4(uGold, a * a * 0.16);
      }
    `
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(halo.position.x, halo.position.y, -1.6);
  scene.add(glow);

  /* ---------------------------------------------------------- gold dust */
  const COUNT = smallScreen ? 260 : 620;
  const positions = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  const drift = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 15;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 9;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 7 - 1;
    speeds[i] = 0.06 + Math.random() * 0.18;
    drift[i] = (Math.random() - 0.5) * 0.12;
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const dustMat = new THREE.PointsMaterial({
    size: 0.055,
    map: makeDotTexture(),
    color: GOLD_LITE,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });

  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  function makeDotTexture() {
    const size = 64;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,248,226,1)");
    g.addColorStop(0.35, "rgba(238,217,168,0.85)");
    g.addColorStop(1, "rgba(238,217,168,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ------------------------------------------------------------- pointer */
  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };

  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    });
    hero.addEventListener("pointerleave", () => { pointer.x = 0; pointer.y = 0; });
  }

  /* --------------------------------------------------------------- loop */
  const clock = new THREE.Clock();
  let running = true;
  let frameId = 0;
  let firstFrame = true;

  function render() {
    if (!running) return;
    frameId = requestAnimationFrame(render);

    const t = clock.getElapsedTime();
    const dt = Math.min(clock.getDelta(), 0.05);

    // eased camera parallax
    eased.x += (pointer.x - eased.x) * 0.045;
    eased.y += (pointer.y - eased.y) * 0.045;
    camera.position.x = eased.x * 0.34;
    camera.position.y = -eased.y * 0.24;
    camera.lookAt(0, 0, 0);

    silkMaterial.uniforms.uTime.value = t;
    silk.rotation.z = -0.26 + Math.sin(t * 0.08) * 0.03;
    silk.position.y = 0.15 + Math.sin(t * 0.22) * 0.08;

    halo.rotation.y = t * 0.13 + eased.x * 0.16;
    halo.rotation.x = Math.sin(t * 0.16) * 0.16 + eased.y * 0.1;
    halo.rotation.z = Math.cos(t * 0.1) * 0.06;

    // dust drift
    const pos = dustGeo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      const iy = i * 3 + 1;
      pos[iy] += speeds[i] * dt;
      pos[i * 3] += drift[i] * dt;
      if (pos[iy] > 4.8) {
        pos[iy] = -4.8;
        pos[i * 3] = (Math.random() - 0.5) * 15;
      }
    }
    dustGeo.attributes.position.needsUpdate = true;
    dust.rotation.y = eased.x * 0.05;

    renderer.render(scene, camera);

    if (firstFrame) {
      firstFrame = false;
      canvas.classList.add("is-ready");
    }
  }

  /* pause when hidden or scrolled away — saves phone battery */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => (entry.isIntersecting ? start() : stop()));
  }, { threshold: 0.02 });
  io.observe(hero);

  function start() {
    if (running) return;
    running = true;
    clock.getDelta(); // drop the gap
    render();
  }
  function stop() {
    running = false;
    cancelAnimationFrame(frameId);
  }

  // first paint once fonts/layout settle
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { resize(); render(); });
  } else {
    render();
  }

  window.addEventListener("pagehide", () => {
    stop();
    renderer.dispose();
  });
}
