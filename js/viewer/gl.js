// Visor 3D propio sobre WebGL (sin dependencias). Luz direccional + ambiente, sombreado plano, cuadrícula en mm.
// Interacción: arrastrar = girar · Mayús/clic derecho/dos dedos = desplazar · rueda/pellizco = zoom · flechas y +/- con foco.
// Gestiona la pérdida de contexto y libera buffers y programas en dispose().

const VS = `
attribute vec3 aPos; attribute vec3 aNor;
uniform mat4 uVP; varying vec3 vN; varying vec3 vP;
void main(){ vN = aNor; vP = aPos; gl_Position = uVP * vec4(aPos,1.0); }`;
const FS = `
precision mediump float;
varying vec3 vN; varying vec3 vP;
uniform vec3 uColor; uniform vec3 uLightDir; uniform float uIntensity; uniform float uSpec; uniform vec3 uEye;
void main(){
  vec3 n = normalize(vN);
  float d = max(dot(n, normalize(uLightDir)), 0.0);
  float hemi = 0.5 + 0.5 * n.z;
  vec3 v = normalize(uEye - vP);
  vec3 h = normalize(normalize(uLightDir) + v);
  float s = pow(max(dot(n,h),0.0), 24.0) * uSpec * uIntensity;
  vec3 c = uColor * (0.34 + 0.18*hemi + 0.62*d*uIntensity) + vec3(s);
  gl_FragColor = vec4(c, 1.0);
}`;
const LVS = `attribute vec3 aPos; uniform mat4 uVP; void main(){ gl_Position = uVP * vec4(aPos,1.0); }`;
const LFS = `precision mediump float; uniform vec4 uColor; void main(){ gl_FragColor = uColor; }`;

// ---------------------------------------------------------------- álgebra mínima (columnas)
const mul = (a, b) => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function lookAt(eye, t, up) {
  const f = norm(sub(t, eye)), s = norm(cross(f, up)), u = cross(s, f);
  return new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1]);
}
function perspective(fovy, aspect, n, f) {
  const t = 1 / Math.tan(fovy / 2);
  return new Float32Array([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]);
}
function ortho(w, h, n, f) {
  return new Float32Array([1 / w, 0, 0, 0, 0, 1 / h, 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]);
}
const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

export const VIEWS = {
  front: { yaw: 0, pitch: 0.001 },
  top: { yaw: 0, pitch: Math.PI / 2 - 0.002 },
  side: { yaw: Math.PI / 2, pitch: 0.001 },
  iso: { yaw: 0.62, pitch: 0.55 },
};

export function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch { return false; }
}

export function createViewer(canvas, opts = {}) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'default' });
  if (!gl) throw new Error('WebGL no disponible');
  let alive = true, dirty = true, raf = 0, lost = false;
  const state = { yaw: 0.62, pitch: 0.55, dist: 100, target: [0, 0, 0], ortho: false, radius: 50, light: { az: 0.9, el: 0.9, intensity: 1 }, spec: 0.0, grid: true, autoRotate: !!opts.autoRotate };
  let parts = [], gridBuf = null, scaleBuf = null, gridCount = 0, model = null;
  const cbs = new Set();

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = (vs, fs) => {
    const p = gl.createProgram();
    const a = compile(gl.VERTEX_SHADER, vs), b = compile(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, a);
    gl.attachShader(p, b);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.deleteShader(a);
    gl.deleteShader(b);
    return p;
  };
  let pm, pl, locM, locL;
  function init() {
    pm = program(VS, FS);
    pl = program(LVS, LFS);
    locM = { pos: gl.getAttribLocation(pm, 'aPos'), nor: gl.getAttribLocation(pm, 'aNor'), vp: gl.getUniformLocation(pm, 'uVP'), color: gl.getUniformLocation(pm, 'uColor'), ld: gl.getUniformLocation(pm, 'uLightDir'), li: gl.getUniformLocation(pm, 'uIntensity'), sp: gl.getUniformLocation(pm, 'uSpec'), eye: gl.getUniformLocation(pm, 'uEye') };
    locL = { pos: gl.getAttribLocation(pl, 'aPos'), vp: gl.getUniformLocation(pl, 'uVP'), color: gl.getUniformLocation(pl, 'uColor') };
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
  init();

  const freeParts = () => {
    for (const p of parts) { gl.deleteBuffer(p.pos); gl.deleteBuffer(p.nor); }
    parts = [];
    if (gridBuf) gl.deleteBuffer(gridBuf);
    if (scaleBuf) gl.deleteBuffer(scaleBuf);
    gridBuf = scaleBuf = null;
  };

  function buildGrid(b) {
    const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
    const half = Math.ceil((Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) * 0.9) / 10) * 10 + 10;
    const lines = [];
    const x0 = Math.round(cx / 10) * 10, y0 = Math.round(cy / 10) * 10;
    for (let k = -half; k <= half; k += 10) {
      lines.push(x0 + k, y0 - half, 0, x0 + k, y0 + half, 0, x0 - half, y0 + k, 0, x0 + half, y0 + k, 0);
    }
    gridCount = lines.length / 3;
    gridBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
    // regla de 10 mm delante del modelo
    const sx = b.min[0], sy = b.min[1] - 6;
    scaleBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, scaleBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([sx, sy, 0.05, sx + 10, sy, 0.05, sx, sy - 1, 0.05, sx, sy + 1, 0.05, sx + 10, sy - 1, 0.05, sx + 10, sy + 1, 0.05]), gl.STATIC_DRAW);
  }

  function setModel(m) {
    model = m;
    freeParts();
    for (const p of m.parts) {
      const pos = gl.createBuffer(), nor = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pos);
      gl.bufferData(gl.ARRAY_BUFFER, p.flat.positions, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, nor);
      gl.bufferData(gl.ARRAY_BUFFER, p.flat.normals, gl.STATIC_DRAW);
      parts.push({ pos, nor, count: p.flat.count, color: hexRgb(p.color), id: p.id, visible: true });
    }
    const b = m.bbox;
    state.target = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    state.radius = Math.max(Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2, 5);
    buildGrid(b);
    if (!m.keepCamera) state.dist = (state.radius / Math.sin(0.4 / 2)) * 1.05;
    invalidate();
  }
  function setPartColor(id, hex) { const p = parts.find((x) => x.id === id); if (p) { p.color = hexRgb(hex); invalidate(); } }
  function setPartVisible(id, v) { const p = parts.find((x) => x.id === id); if (p) { p.visible = v; invalidate(); } }

  // ---------------------------------------------------------------- cámara
  function camera() {
    const cp = Math.cos(state.pitch);
    const dir = [Math.sin(state.yaw) * cp, -Math.cos(state.yaw) * cp, Math.sin(state.pitch)];
    const eye = [state.target[0] + dir[0] * state.dist, state.target[1] + dir[1] * state.dist, state.target[2] + dir[2] * state.dist];
    const up = Math.abs(state.pitch) > 1.5 ? [0, 1, 0] : [0, 0, 1];
    const aspect = canvas.width / Math.max(1, canvas.height);
    const view = lookAt(eye, state.target, up);
    const near = Math.max(state.dist - state.radius * 4, state.dist * 0.02), far = state.dist + state.radius * 6;
    let proj;
    if (state.ortho) {
      const h = state.dist * Math.tan(0.2);
      proj = ortho(h * aspect, h, -far, far);
    } else proj = perspective(0.4, aspect, Math.max(near, 0.5), far);
    return { eye, vp: mul(proj, view), view, proj };
  }
  function project(p) {
    const { vp } = camera();
    const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
    const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
    const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    const r = canvas.getBoundingClientRect();
    return { x: ((x / w) * 0.5 + 0.5) * r.width, y: (1 - ((y / w) * 0.5 + 0.5)) * r.height, behind: w <= 0 };
  }

  function draw() {
    raf = 0;
    if (!alive || lost) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const cam = camera();
    if (state.grid && gridBuf) {
      gl.useProgram(pl);
      gl.disable(gl.CULL_FACE);
      gl.uniformMatrix4fv(locL.vp, false, cam.vp);
      gl.enableVertexAttribArray(locL.pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
      gl.vertexAttribPointer(locL.pos, 3, gl.FLOAT, false, 0, 0);
      gl.uniform4f(locL.color, 0.14, 0.14, 0.14, 0.12);
      gl.drawArrays(gl.LINES, 0, gridCount);
      gl.enable(gl.CULL_FACE);
    }
    gl.useProgram(pm);
    gl.uniformMatrix4fv(locM.vp, false, cam.vp);
    const L = state.light;
    gl.uniform3f(locM.ld, Math.cos(L.el) * Math.sin(L.az), -Math.cos(L.el) * Math.cos(L.az), Math.sin(L.el));
    gl.uniform1f(locM.li, L.intensity);
    gl.uniform1f(locM.sp, state.spec);
    gl.uniform3f(locM.eye, cam.eye[0], cam.eye[1], cam.eye[2]);
    for (const p of parts) {
      if (!p.visible) continue;
      gl.uniform3f(locM.color, p.color[0], p.color[1], p.color[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, p.pos);
      gl.enableVertexAttribArray(locM.pos);
      gl.vertexAttribPointer(locM.pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, p.nor);
      gl.enableVertexAttribArray(locM.nor);
      gl.vertexAttribPointer(locM.nor, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, p.count);
    }
    gl.disableVertexAttribArray(locM.nor);
    if (state.grid && scaleBuf) {
      gl.useProgram(pl);
      gl.disable(gl.CULL_FACE);
      gl.uniformMatrix4fv(locL.vp, false, cam.vp);
      gl.bindBuffer(gl.ARRAY_BUFFER, scaleBuf);
      gl.enableVertexAttribArray(locL.pos);
      gl.vertexAttribPointer(locL.pos, 3, gl.FLOAT, false, 0, 0);
      gl.uniform4f(locL.color, 0.14, 0.14, 0.14, 1);
      gl.drawArrays(gl.LINES, 0, 6);
      gl.enable(gl.CULL_FACE);
    }
    dirty = false;
    cbs.forEach((fn) => fn());
    if (state.autoRotate && !dragging) { state.yaw += 0.004; invalidate(); }
  }
  function invalidate() {
    dirty = true;
    if (!raf && alive) raf = requestAnimationFrame(draw);
  }

  // ---------------------------------------------------------------- interacción
  let dragging = false;
  const pointers = new Map();
  let last = null, pinch = 0;
  const clampPitch = () => { state.pitch = Math.max(-1.5, Math.min(Math.PI / 2 - 0.002, state.pitch)); };
  const pan = (dx, dy) => {
    const rect = canvas.getBoundingClientRect();
    const k = (2 * state.dist * Math.tan(0.2)) / rect.height;
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    const right = [cy, sy, 0];
    const up = [-sy * Math.sin(state.pitch), cy * Math.sin(state.pitch), Math.cos(state.pitch)];
    for (let i = 0; i < 3; i++) state.target[i] += (-dx * right[i] + dy * up[i]) * k;
    clampTarget();
  };
  const clampTarget = () => { if (!model) return; const b = model.bbox; for (let i = 0; i < 3; i++) state.target[i] = Math.max(b.min[i] - state.radius, Math.min(b.max[i] + state.radius, state.target[i])); };
  const zoom = (f) => { state.dist = Math.max(state.radius * 0.4, Math.min(state.radius * 14, state.dist * f)); invalidate(); };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    state.autoRotate = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoom(pinch / d);
      pinch = d;
      pan((e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2);
      invalidate();
      return;
    }
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    if (e.shiftKey || e.buttons === 2) pan(dx, dy);
    else {
      state.yaw -= dx * 0.008;
      state.pitch += dy * 0.008;
      clampPitch();
    }
    invalidate();
  });
  const up = (e) => { pointers.delete(e.pointerId); if (!pointers.size) dragging = false; pinch = 0; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    const step = e.shiftKey ? 0.2 : 0.07;
    if (k === 'ArrowLeft') state.yaw += step; else if (k === 'ArrowRight') state.yaw -= step; else if (k === 'ArrowUp') state.pitch -= step; else if (k === 'ArrowDown') state.pitch += step;
    else if (k === '+' || k === '=') zoom(0.88); else if (k === '-') zoom(1.14); else return;
    clampPitch();
    e.preventDefault();
    invalidate();
  });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; init(); if (model) setModel({ ...model, keepCamera: true }); invalidate(); });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => invalidate()) : null;
  ro?.observe(canvas);

  function setView(name, animate = true) {
    const v = VIEWS[name];
    if (!v) return;
    const from = { yaw: state.yaw, pitch: state.pitch, dist: state.dist, target: [...state.target] };
    const toDist = (state.radius / Math.sin(0.4 / 2)) * 1.05;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const b = model ? model.bbox : null;
    const toTarget = b ? [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] : state.target;
    state.autoRotate = false;
    if (!animate || reduce) { Object.assign(state, { yaw: v.yaw, pitch: v.pitch, dist: toDist, target: toTarget }); invalidate(); return; }
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 4);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 320);
      const e = ease(t);
      state.yaw = from.yaw + (v.yaw - from.yaw) * e;
      state.pitch = from.pitch + (v.pitch - from.pitch) * e;
      state.dist = from.dist + (toDist - from.dist) * e;
      for (let i = 0; i < 3; i++) state.target[i] = from.target[i] + (toTarget[i] - from.target[i]) * e;
      invalidate();
      if (t < 1 && alive) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  invalidate();
  return {
    setModel, setPartColor, setPartVisible, setView, project, invalidate,
    setOrtho(v) { state.ortho = !!v; invalidate(); },
    setLight(l) { Object.assign(state.light, l); invalidate(); },
    setMaterial(m) { state.spec = m === 'gloss' ? 0.9 : m === 'satin' ? 0.35 : 0; invalidate(); },
    setGrid(v) { state.grid = !!v; invalidate(); },
    setAutoRotate(v) { state.autoRotate = !!v; invalidate(); },
    get state() { return state; },
    onFrame(fn) { cbs.add(fn); return () => cbs.delete(fn); },
    toBlob(type = 'image/png') { draw(); return new Promise((res) => canvas.toBlob(res, type)); },
    stats() { return { parts: parts.length, buffers: parts.length * 2 + (gridBuf ? 1 : 0) + (scaleBuf ? 1 : 0) }; },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      freeParts();
      gl.deleteProgram(pm);
      gl.deleteProgram(pl);
      const ext = gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
    },
  };
}
