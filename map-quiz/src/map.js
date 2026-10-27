/* SVG map renderer.
 *
 * Geometry comes from window.INDIA_MAP (built by tools/build_map.py).
 * One renderer instance owns one container; the same code is reused for the
 * home preview, the learn map and the quiz map.
 */

import { UNITS } from "./data.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const MAP = () => window.INDIA_MAP;

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Shapes too small to hit with a finger get a marker dot + 22px tap target. */
function needsMarker(shape) {
  const [, , w, h] = shape.bbox;
  return shape.area < 700 || Math.min(w, h) < 26;
}

/**
 * @param {HTMLElement} container
 * @param {object} options
 *   shapes?: subset of ids to draw (default: all)
 *   interactive?: boolean
 *   labels?: boolean
 *   showMarkerFor?: (shape) => boolean
 *   onTap?: (id: string) => void
 */
export function createMap(container, options = {}) {
  const data = MAP();
  if (!data) throw new Error("map data missing");

  const opts = {
    interactive: true,
    labels: true,
    shapes: null,
    markers: true,
    onTap: null,
    ...options,
  };

  const svg = el("svg", {
    viewBox: `0 0 ${data.width} ${data.height}`,
    preserveAspectRatio: "xMidYMid meet",
    role: opts.interactive ? "application" : "img",
    "aria-label": "Map of India",
  });

  const defs = el("defs");
  const grad = el("linearGradient", { id: "targetGradient", x1: "0", y1: "0", x2: "1", y2: "1" });
  grad.append(
    el("stop", { offset: "0%", "stop-color": "#ffcf87" }),
    el("stop", { offset: "100%", "stop-color": "#f97316" })
  );
  defs.append(grad);
  svg.append(defs);

  const shapeLayer = el("g", { class: "shapes" });
  const markerLayer = el("g", { class: "markers" });
  const labelLayer = el("g", { class: "labels" });
  svg.append(shapeLayer, markerLayer, labelLayer);

  const allowed = opts.shapes ? new Set(opts.shapes) : null;
  const paths = new Map();
  const markers = new Map();
  const labels = new Map();
  const shapes = data.shapes.filter((s) => !allowed || allowed.has(s.id));

  // big shapes first so tiny ones sit on top and win the tap
  const ordered = [...shapes].sort((a, b) => b.area - a.area);

  for (const shape of ordered) {
    const isUt = UNITS[shape.id]?.type === "ut";
    const path = el("path", {
      d: shape.path,
      class: "state" + (isUt ? " ut" : ""),
      "data-id": shape.id,
    });
    path.dataset.kind = "shape";
    if (!opts.interactive) path.style.pointerEvents = "none";
    shapeLayer.append(path);
    paths.set(shape.id, path);

    if (opts.interactive) {
      path.addEventListener("click", (event) => {
        event.stopPropagation();
        opts.onTap?.(shape.id);
      });
    }
  }

  // marker dots + generous tap targets for micro states
  if (opts.markers) {
    for (const shape of data.shapes) {
      const inSet = !allowed || allowed.has(shape.id);
      if (!inSet) continue;
      if (!needsMarker(shape)) continue;
      const isUt = UNITS[shape.id]?.type === "ut";
      const [x, y] = shape.label;
      const marker = el("circle", {
        cx: x,
        cy: y,
        r: 9,
        class: "state-marker" + (isUt ? " ut" : ""),
        "data-marker-for": shape.id,
      });
      markerLayer.append(marker);
      markers.set(shape.id, marker);
      if (opts.interactive) {
        const hit = el("circle", { cx: x, cy: y, r: 30, class: "hit-area" });
        hit.addEventListener("click", (event) => {
          event.stopPropagation();
          opts.onTap?.(shape.id);
        });
        markerLayer.append(hit);
      }
    }
  }

  if (opts.labels) {
    for (const shape of data.shapes) {
      const inSet = !allowed || allowed.has(shape.id);
      if (!inSet) continue;
      // build_map.py already decided whether a name fits and at which size
      if (!shape.fs) continue;
      const text = el("text", {
        x: shape.label[0],
        y: shape.label[1],
        class: "state-label",
        "font-size": shape.fs,
      });
      text.dataset.labelFor = shape.id;
      labelLayer.append(text);
      labels.set(shape.id, text);
    }
  }

  const api = {
    svg,
    container,
    setLabel(id, text) {
      const node = labels.get(id);
      if (node) node.textContent = text || "";
    },
    setLabelsVisible(visible) {
      labelLayer.style.display = visible ? "" : "none";
    },
    setLabelsAll(textById) {
      for (const [id, node] of labels) node.textContent = textById ? textById(id) || "" : "";
    },
    paths,
    markers,
    /** Set a visual class on a unit (shape + marker). */
    setClass(id, className, on = true) {
      const nodes = [paths.get(id), markers.get(id)].filter(Boolean);
      for (const n of nodes) n.classList.toggle(className, on);
      const label = labels.get(id);
      if (label) label.classList.toggle(className + "-label", on);
    },
    clearClass(className) {
      for (const node of svg.querySelectorAll("." + className)) node.classList.remove(className);
      for (const node of svg.querySelectorAll("." + className + "-label")) node.classList.remove(className + "-label");
    },
    clearAll() {
      for (const node of svg.querySelectorAll(
        ".is-target, .is-dim, .is-correct, .is-wrong, .is-done, .is-hint"
      )) {
        node.classList.remove("is-target", "is-dim", "is-correct", "is-wrong", "is-done", "is-hint");
      }
    },
    destroy() {
      svg.remove();
    },
  };

  container.replaceChildren(svg);
  return api;
}

/**
 * Zoom / pan helper for the learn map. Buttons + wheel + drag panning.
 * Returns { zoomIn, zoomOut, setZoom, reset, getZoom }.
 */
export function attachZoom(wrap, inner, { min = 1, max = 4, onChange } = {}) {
  let zoom = 1;
  let tx = 0;
  let ty = 0;
  let start = null;

  function clampPan() {
    const rect = wrap.getBoundingClientRect();
    const maxX = (rect.width * (zoom - 1)) / 2;
    const maxY = (rect.height * (zoom - 1)) / 2;
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  }

  function apply(animate = true) {
    clampPan();
    inner.style.transition = animate ? "transform .2s ease" : "none";
    inner.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
    onChange?.(zoom);
  }

  function setZoom(next) {
    zoom = Math.max(min, Math.min(max, next));
    if (zoom === 1) {
      tx = 0;
      ty = 0;
    }
    apply();
  }

  wrap.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      setZoom(zoom * (event.deltaY < 0 ? 1.16 : 0.86));
    },
    { passive: false }
  );

  wrap.addEventListener("pointerdown", (event) => {
    if (zoom <= 1) return;
    start = { x: event.clientX, y: event.clientY, tx, ty, id: event.pointerId };
  });

  wrap.addEventListener("pointermove", (event) => {
    if (!start || start.id !== event.pointerId) return;
    tx = start.tx + (event.clientX - start.x);
    ty = start.ty + (event.clientY - start.y);
    apply(false);
  });

  const end = () => {
    start = null;
  };
  wrap.addEventListener("pointerup", end);
  wrap.addEventListener("pointercancel", end);

  return {
    zoomIn: () => setZoom(zoom * 1.45),
    zoomOut: () => setZoom(zoom / 1.45),
    setZoom,
    reset: () => setZoom(1),
    getZoom: () => zoom,
  };
}
