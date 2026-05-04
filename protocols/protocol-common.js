// ── CURSOR ──
const cursor = document.getElementById('cursor');
document.addEventListener('mousemove', e => {
  cursor.style.transform = 'translate(' + (e.clientX - 4) + 'px, ' + (e.clientY - 4) + 'px)';
});

// ── SESSION ID ──
function initSessionId(protocolIdx, protocolTitle, protocolSub) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'DS-';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  const el = document.getElementById('session-id');
  if (el) el.textContent = 'Session ' + id;
  const idxEl   = document.getElementById('protocol-idx');
  const titleEl = document.getElementById('protocol-title');
  const subEl   = document.getElementById('protocol-sub');
  if (idxEl)   idxEl.textContent   = protocolIdx;
  if (titleEl) titleEl.textContent = protocolTitle;
  if (subEl)   subEl.textContent   = protocolSub;
}

// ── ORGANISM WebGL ──
// Exposes: glOrgOpacityTarget, glOrgSettleTarget (set these from protocol code)
const glCanvas = document.getElementById('gl');
glCanvas.width  = Math.floor(window.innerWidth  * 0.75);
glCanvas.height = Math.floor(window.innerHeight * 0.75);
glCanvas.style.width  = '100%';
glCanvas.style.height = '100%';
window.addEventListener('resize', () => {
  glCanvas.width  = Math.floor(window.innerWidth  * 0.75);
  glCanvas.height = Math.floor(window.innerHeight * 0.75);
});

const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');

const _VS = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const _FS = `
precision highp float;
uniform float u_t;
uniform vec2  u_res;
uniform float u_orgOpacity;
uniform float u_orgSettle;

#define N      150.0
#define GOLDEN 2.399963

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1,0)), f.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) { v += noise(p) * amp; p *= 2.01; amp *= 0.5; }
  return v;
}

void main() {
  vec2 uv  = gl_FragCoord.xy / u_res;
  vec2 ndc = uv * 2.0 - 1.0;
  ndc.x   *= u_res.x / u_res.y;
  vec3 col = vec3(0.01, 0.04, 0.05);

  float settle     = clamp(u_orgSettle, 0.0, 1.0);
  float settleEase = settle * settle * (3.0 - 2.0 * settle);
  float amp        = mix(2.2 + 0.3 * sin(u_t * 0.15), 0.35 + 0.08 * sin(u_t * 0.4), settleEase);
  float scale      = mix(1.4, 0.6 + 0.03 * sin(u_t * 0.25), settleEase);
  float rotY       = u_t * 0.314;

  vec3 baseColor = vec3(0.9, 0.85, 0.7);

  for (float i = 0.0; i < N; i += 1.0) {
    float theta = i * GOLDEN;
    float phi   = acos(1.0 - 2.0 * (i + 0.5) / N);
    vec3 pos    = vec3(sin(phi)*cos(theta), sin(phi)*sin(theta), cos(phi));
    pos        += fbm(pos.xy * 3.0 + u_t * 0.2) * amp;
    float c = cos(rotY), s = sin(rotY);
    pos.xz      = vec2(pos.x*c - pos.z*s, pos.x*s + pos.z*c);
    pos        *= scale;
    vec2 proj   = pos.xy / (1.0 - pos.z * 0.3);
    proj.x     /= u_res.x / u_res.y;
    float d     = length(ndc - proj);
    col        += baseColor * 0.0006 * u_orgOpacity / (d*d + 0.0005);
  }

  float dist = length(uv - vec2(0.5));
  col *= clamp(1.0 - dist * 1.2, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

function _compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s); return s;
}
const _prog = gl.createProgram();
gl.attachShader(_prog, _compileShader(gl.VERTEX_SHADER, _VS));
gl.attachShader(_prog, _compileShader(gl.FRAGMENT_SHADER, _FS));
gl.linkProgram(_prog); gl.useProgram(_prog);

const _buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, _buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
const _aPos = gl.getAttribLocation(_prog, 'a_pos');
gl.enableVertexAttribArray(_aPos);
gl.vertexAttribPointer(_aPos, 2, gl.FLOAT, false, 0, 0);

const _uT          = gl.getUniformLocation(_prog, 'u_t');
const _uRes        = gl.getUniformLocation(_prog, 'u_res');
const _uOrgOpacity = gl.getUniformLocation(_prog, 'u_orgOpacity');
const _uOrgSettle  = gl.getUniformLocation(_prog, 'u_orgSettle');

let _glOrgOpacity       = 0.0;
let  glOrgOpacityTarget = 0.0;
let _glOrgSettle        = 0.0;
let  glOrgSettleTarget  = 0.0;
const _t0 = Date.now();

function _renderGL() {
  _glOrgOpacity += (glOrgOpacityTarget - _glOrgOpacity) * 0.012;
  _glOrgSettle  += (glOrgSettleTarget  - _glOrgSettle)  * 0.008;
  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  gl.uniform1f(_uT, (Date.now() - _t0) / 1000);
  gl.uniform2f(_uRes, glCanvas.width, glCanvas.height);
  gl.uniform1f(_uOrgOpacity, _glOrgOpacity);
  gl.uniform1f(_uOrgSettle,  _glOrgSettle);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(_renderGL);
}
_renderGL();

// ── NEURAL LOADER ──
function runNeuralLoader(duration, steps, onDone) {
  const canvas = document.getElementById('nl-ring-canvas');
  if (!canvas) { onDone && onDone(); return; }
  const size = canvas.width;
  const ctx2 = canvas.getContext('2d');
  const cx = size/2, cy = size/2, r = size/2 - 8;
  const startTime = Date.now();
  const nlEl      = document.getElementById('neural-loader');
  const pctEl     = document.getElementById('nl-pct');
  const msgEl     = document.getElementById('nl-msg');
  const hexEl     = document.getElementById('nl-hex');
  const metricEls = document.getElementById('nl-metrics').querySelectorAll('span');
  nlEl.classList.add('vis');

  const hexChars = '0123456789ABCDEF';
  function randHex(n) {
    let s = '0x';
    for (let i = 0; i < n; i++) s += hexChars[Math.random()*16|0];
    return s;
  }

  function draw(progress) {
    ctx2.clearRect(0, 0, size, size);
    ctx2.beginPath();
    ctx2.arc(cx, cy, r, 0, Math.PI*2);
    ctx2.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx2.lineWidth = 1.5; ctx2.stroke();
    const angle = -Math.PI/2 + progress * Math.PI * 2;
    ctx2.beginPath();
    ctx2.arc(cx, cy, r, -Math.PI/2, angle);
    ctx2.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx2.lineWidth = 1.5; ctx2.stroke();
    if (pctEl) pctEl.textContent = String(Math.round(progress * 100)).padStart(3,'0') + '%';
    if (hexEl) hexEl.textContent = randHex(8);
    if (metricEls) {
      metricEls[0] && (metricEls[0].textContent = 'EEG '  + (40 + Math.random()*20).toFixed(1) + 'Hz');
      metricEls[1] && (metricEls[1].textContent = 'DIFF ' + (Math.random()*0.4+0.6).toFixed(2));
      metricEls[2] && (metricEls[2].textContent = 'REM '  + (Math.random()*30+55).toFixed(1) + '%');
    }
    const step = steps.reduce((best, s) => s.pct/100 <= progress ? s : best, steps[0]);
    if (msgEl && step) msgEl.textContent = step.msg;
  }

  (function tick() {
    const elapsed  = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1.0);
    draw(progress);
    if (progress < 1.0) {
      requestAnimationFrame(tick);
    } else {
      setTimeout(() => {
        nlEl.classList.add('gone');
        setTimeout(() => {
          nlEl.classList.remove('vis','gone');
          onDone && onDone();
        }, 600);
      }, 400);
    }
  })();
}

// ── AMBIENT AUDIO (menu-music continuity across navigation) ──
// Separate gain/src from protocol audio so they can crossfade independently.
let _ambCtx = null, _ambGain = null, _ambSrc = null;

function _getAmbCtx() {
  if (!_ambCtx) _ambCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ambCtx.state === 'suspended') _ambCtx.resume();
  return _ambCtx;
}

function startAmbientAudio(url, targetVol) {
  const ctx = _getAmbCtx();
  fetch(url)
    .then(r => r.arrayBuffer())
    .then(ab => ctx.decodeAudioData(ab))
    .then(buf => {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setTargetAtTime(targetVol != null ? targetVol : 0.55, ctx.currentTime, 4.0);
      gain.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      src.connect(gain);
      if (ctx.state === 'suspended') ctx.resume().then(() => src.start(0));
      else src.start(0);
      _ambSrc = src; _ambGain = gain;
    })
    .catch(e => console.warn('Ambient audio failed:', e));
}

function fadeAmbientTo(targetVol, timeConstant) {
  if (!_ambGain) return;
  const ctx = _getAmbCtx();
  _ambGain.gain.setTargetAtTime(targetVol, ctx.currentTime, timeConstant != null ? timeConstant : 2.0);
}

function stopAmbientAudio(fadeMs) {
  if (!_ambSrc) return;
  fadeAmbientTo(0, (fadeMs || 1500) / 1000);
  const s = _ambSrc;
  setTimeout(() => { try { s.stop(); } catch(e){} }, (fadeMs || 1500) + 500);
  _ambSrc = null; _ambGain = null;
}

// Call this inside a user-gesture handler on iOS to unlock a suspended AudioContext
function resumeAmbientContext() {
  if (_ambCtx && _ambCtx.state === 'suspended') _ambCtx.resume();
}

// ── WEB AUDIO UTILITIES (for audio-based protocols) ──
let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

let _trackSrc = null, _trackGain = null;

function playProtocolAudio(url, onEnded) {
  const ctx = getAudioCtx();
  fetch(url)
    .then(r => r.arrayBuffer())
    .then(ab => ctx.decodeAudioData(ab))
    .then(buf => {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setTargetAtTime(0.85, ctx.currentTime, 4.0);
      gain.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = false;
      src.connect(gain); src.start(0);
      _trackSrc = src; _trackGain = gain;
      if (onEnded) src.onended = onEnded;
    })
    .catch(e => console.warn('Audio failed:', e));
}

function stopAudio(fadeMs) {
  if (!_trackGain) return;
  const ctx = getAudioCtx();
  _trackGain.gain.setTargetAtTime(0, ctx.currentTime, (fadeMs || 2000) / 1000);
  const s = _trackSrc;
  setTimeout(() => { try { s.stop(); } catch(e){} }, (fadeMs || 2000) + 500);
  _trackGain = null; _trackSrc = null;
}
