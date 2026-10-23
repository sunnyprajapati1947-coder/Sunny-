/* ==========================================================================
   MEN'S WEAR — 3D hero (dependency-free WebGL)
   ------------------------------------------------------------------------
   A single fragment shader paints the whole scene:
     · flowing liquid-gold silk (domain-warped waves + travelling sheen)
     · two ribbon halos that rotate in perspective
     · drifting gold dust with twinkle
     · soft glow, film vignette

   No libraries, ~9 KB, works on WebGL1. If WebGL is missing the hero simply
   keeps its flat CSS treatment, so the page never breaks.
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("hero-canvas");
  var hero = document.querySelector(".hero");
  if (!canvas || !hero) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) { canvas.style.display = "none"; return; }

  var gl = null;
  try {
    gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false }) ||
         canvas.getContext("experimental-webgl", { alpha: true, antialias: true });
  } catch (e) { gl = null; }
  if (!gl) { canvas.style.display = "none"; return; }

  /* ------------------------------------------------------------- shaders */
  var VERT = [
    "attribute vec2 aPos;",
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = aPos * 0.5 + 0.5;",
    "  gl_Position = vec4(aPos, 0.0, 1.0);",
    "}"
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "",
    "varying vec2 vUv;",
    "uniform vec2  uRes;",
    "uniform float uTime;",
    "uniform vec2  uPointer;",
    "",
    "const vec3 INK    = vec3(0.031, 0.031, 0.039);",
    "const vec3 GOLD   = vec3(0.788, 0.643, 0.361);",
    "const vec3 LITE   = vec3(0.941, 0.875, 0.706);",
    "const vec3 DEEP   = vec3(0.169, 0.125, 0.055);",
    "",
    "float hash(vec2 p) {",
    "  p = fract(p * vec2(123.34, 456.21));",
    "  p += dot(p, p + 45.32);",
    "  return fract(p.x * p.y);",
    "}",
    "",
    "float noise(vec2 p) {",
    "  vec2 i = floor(p);",
    "  vec2 f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  float a = hash(i);",
    "  float b = hash(i + vec2(1.0, 0.0));",
    "  float c = hash(i + vec2(0.0, 1.0));",
    "  float d = hash(i + vec2(1.0, 1.0));",
    "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
    "}",
    "",
    "float fbm(vec2 p) {",
    "  float v = 0.0;",
    "  float amp = 0.5;",
    "  for (int i = 0; i < 5; i++) {",
    "    v += amp * noise(p);",
    "    p = p * 2.02 + vec2(13.7, 7.3);",
    "    amp *= 0.5;",
    "  }",
    "  return v;",
    "}",
    "",
    "void main() {",
    "  vec2 res = uRes;",
    "  vec2 uv  = vUv;",
    "  float aspect = res.x / max(res.y, 1.0);",
    "",
    "  /* screen-ish coordinates, aspect corrected */",
    "  vec2 p = (uv - vec2(0.5)) * vec2(aspect, 1.0);",
    "  p += uPointer * 0.045;",
    "",
    "  float t = uTime;",
    "  vec3 col = vec3(0.0);",
    "  float alpha = 0.0;",
    "",
    "  /* ------------------------------------------------ liquid gold silk */",
    "  vec2 q = p * vec2(1.15, 1.6);",
    "  float warp = fbm(q * 1.3 + vec2(t * 0.055, -t * 0.04));",
    "  float folds = fbm(q * 1.9 + vec2(warp * 1.6, -t * 0.07));",
    "  float band = sin((q.x * 2.1 + q.y * 1.35) * 1.6 + folds * 5.2 + t * 0.28);",
    "  float sheen = smoothstep(-0.35, 1.0, band * 0.5 + 0.5);",
    "",
    "  /* fold shading gives the fabric its directional lustre */",
    "  float lustre = pow(sheen, 2.4);",
    "  vec3 silk = mix(DEEP, GOLD, sheen * 0.92);",
    "  silk = mix(silk, LITE, lustre * 0.55);",
    "",
    "  /* silk fades out around the copy + photo so text stays crisp */",
    "  float radial = length(p * vec2(0.82, 1.0));",
    "  float silkMask = (1.0 - smoothstep(0.15, 1.28, radial)) * 0.85;",
    "  silkMask *= smoothstep(0.02, 0.55, uv.y);",
    "  col += silk * silkMask;",
    "  alpha += silkMask * (0.16 + lustre * 0.30);",
    "",
    "  /* ------------------------------------------------ rotating ribbon halos */",
    "  vec2 c = vec2(0.30, 0.02) + uPointer * 0.02;",
    "  vec2 d = p - c;",
    "  float rot = t * 0.16;",
    "  float cs = cos(rot);",
    "  float sn = sin(rot);",
    "  vec2 dr = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs);",
    "  /* perspective squash so the rings read as 3D, not as flat circles */",
    "  vec2 dp = vec2(dr.x, dr.y * 1.75);",
    "  float r = length(dp);",
    "  float ang = atan(dp.y, dp.x);",
    "",
    "  for (int i = 0; i < 3; i++) {",
    "    float fi = float(i);",
    "    float baseR = 0.62 + fi * 0.16;",
    "    float wobble = sin(ang * (3.0 + fi) + t * (0.5 + fi * 0.22)) * 0.022;",
    "    float line = 1.0 - smoothstep(0.0, 0.0075 + fi * 0.002, abs(r - baseR - wobble));",
    "    float fade = 1.0 - smoothstep(baseR, baseR + 0.55, r);",
    "    float opacity = (0.55 - fi * 0.14);",
    "    col += LITE * line * fade * opacity;",
    "    alpha += line * fade * opacity * 0.85;",
    "  }",
    "",
    "  /* warm glow behind the halo */",
    "  float glow = 1.0 - smoothstep(0.0, 1.05, r);",
    "  col += GOLD * glow * 0.055;",
    "  alpha += glow * 0.05;",
    "",
    "  /* ------------------------------------------------ gold dust */",
    "  for (int layer = 0; layer < 3; layer++) {",
    "    float fl = float(layer);",
    "    float scale = 26.0 + fl * 17.0;",
    "    vec2 g = uv * vec2(aspect, 1.0) * scale;",
    "    g.y += t * (9.0 + fl * 7.0);",
    "    g.x += sin(t * 0.25 + fl) * 0.8;",
    "",
    "    vec2 cell = floor(g);",
    "    vec2 f = fract(g) - 0.5;",
    "    float rnd = hash(cell + fl * 37.0);",
    "    float rnd2 = hash(cell * 1.7 + fl * 11.0);",
    "",
    "    vec2 off = vec2(rnd - 0.5, rnd2 - 0.5) * 0.62;",
    "    float dist = length(f - off);",
    "    float dotMask = 1.0 - smoothstep(0.0, 0.055 + rnd * 0.03, dist);",
    "    float twinkle = 0.55 + 0.45 * sin(t * (0.9 + rnd * 2.0) + rnd * 6.283);",
    "    float keep = step(0.72, rnd);",
    "    float depth = 1.0 - fl * 0.26;",
    "",
    "    float dust = dotMask * twinkle * keep * depth;",
    "    col += mix(GOLD, LITE, rnd2) * dust * 1.15;",
    "    alpha += dust * 0.55;",
    "  }",
    "",
    "  /* ------------------------------------------------ finish */",
    "  /* keep the copy side dark for readability */",
    "  float leftFade = smoothstep(0.0, 0.62, uv.x);",
    "  col *= mix(0.35, 1.0, leftFade);",
    "  alpha *= mix(0.55, 1.0, leftFade);",
    "",
    "  alpha = clamp(alpha, 0.0, 1.0);",
    "  /* premultiplied-free output */",
    "  gl_FragColor = vec4(col, alpha);",
    "}"
  ].join("\n");

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error("shader: " + log);
    }
    return sh;
  }

  var program;
  try {
    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(program));
    }
  } catch (err) {
    canvas.style.display = "none";
    if (window.console) console.warn("[hero3d] disabled:", err.message);
    return;
  }

  gl.useProgram(program);

  /* full-screen quad */
  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1
  ]), gl.STATIC_DRAW);

  var aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(program, "uRes");
  var uTime = gl.getUniformLocation(program, "uTime");
  var uPointer = gl.getUniformLocation(program, "uPointer");

  /* --------------------------------------------------------------- sizing */
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    var w = hero.clientWidth || window.innerWidth;
    var h = hero.clientHeight || window.innerHeight;
    var cw = Math.floor(w * dpr);
    var ch = Math.floor(h * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      gl.viewport(0, 0, cw, ch);
    }
    gl.uniform2f(uRes, cw, ch);
  }
  resize();
  window.addEventListener("resize", resize);

  /* -------------------------------------------------------------- pointer */
  var px = 0, py = 0, tx = 0, ty = 0;

  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
    });
    hero.addEventListener("pointerleave", function () { tx = 0; ty = 0; });
  }

  /* --------------------------------------------------------------- render */
  var start = performance.now();
  var frame = 0;
  var running = false;
  var first = true;

  function draw() {
    if (!running) return;
    frame = requestAnimationFrame(draw);

    var t = (performance.now() - start) / 1000;

    px += (tx - px) * 0.05;
    py += (ty - py) * 0.05;

    gl.uniform1f(uTime, t);
    gl.uniform2f(uPointer, px, py);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (first) {
      first = false;
      canvas.classList.add("is-ready");
    }
  }

  function startLoop() {
    if (running) return;
    running = true;
    draw();
  }
  function stopLoop() {
    running = false;
    cancelAnimationFrame(frame);
  }

  /* save battery: only animate while visible */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) startLoop();
        else stopLoop();
      });
    }, { threshold: 0.02 }).observe(hero);
  } else {
    startLoop();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopLoop();
    else if (hero.getBoundingClientRect().top < window.innerHeight) startLoop();
  });

  window.addEventListener("pagehide", stopLoop);

  startLoop();
})();
