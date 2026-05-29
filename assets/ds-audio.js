/*
 * ds-audio.js — Single shared AudioContext for all protocol pages.
 *
 * Root cause of SFX silence (diagnosed via devtools + R2 curl test):
 *   Files exist (200 OK), CORS works (Access-Control-Allow-Origin: * on
 *   OPTIONS/GET with Origin). The bug is that ds-hud.js created a SECOND
 *   AudioContext 9.6s after the gate click, outside the synchronous gesture
 *   handler. On iOS Safari this context stays suspended indefinitely because
 *   .resume() called asynchronously after a gesture is ignored. On desktop
 *   Chrome it usually runs but the context has no guarantee.
 *
 * Fix: ONE AudioContext per page, created lazily, resumed SYNCHRONOUSLY
 *   inside the gate click handler via DS_AUDIO.resume(). All audio — ambient
 *   music (protocol-common.js), SFX ticks, and ambient beds (ds-hud.js) —
 *   routes through named gain buses on this single context.
 *
 * Named buses:
 *   'music'  — holding/ambient track (protocol-common.js)
 *   'sfx'    — UI one-shot ticks (ds-hud.js)
 *   'beds'   — looping ambient beds (ds-hud.js)
 *
 * Usage (load BEFORE protocol-common.js and ds-hud.js):
 *   DS_AUDIO.resume();                         // in gate click handler
 *   DS_AUDIO.bus('sfx', 0.22);                 // get/create a gain bus
 *   DS_AUDIO.load(url).then(buf => {...});      // fetch + decode
 *   DS_AUDIO.play(buf, 'sfx');                 // one-shot
 *   DS_AUDIO.loop(buf, 'beds', startOffset);   // looping source
 *   DS_AUDIO.ramp('beds', target, timeConst);  // gain automation
 */

var DS_AUDIO = (function() {
  'use strict';

  var _ctx   = null;
  var _buses = {};  // name → GainNode
  var _cache = {};  // url  → AudioBuffer

  function _ctx_() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
  }

  // ── Public API ───────────────────────────────────────────────────

  // Call SYNCHRONOUSLY inside the gate gesture handler.
  // Unlocks the context on iOS Safari and Android Chrome.
  function resume() {
    var ctx = _ctx_();
    if (ctx.state === 'suspended') ctx.resume();
  }

  // Get (or create) a named gain bus connected to destination.
  // initVol only applied on first creation; subsequent calls return the existing bus.
  function bus(name, initVol) {
    if (!_buses[name]) {
      var ctx = _ctx_();
      var g = ctx.createGain();
      g.gain.value = (initVol != null) ? initVol : 1.0;
      g.connect(ctx.destination);
      _buses[name] = g;
    }
    return _buses[name];
  }

  // Ramp a named bus gain using setTargetAtTime.
  function ramp(name, targetVal, timeConstant) {
    var b = _buses[name];
    if (!b) return;
    b.gain.setTargetAtTime(targetVal, _ctx_().currentTime, timeConstant || 2.0);
  }

  // Set a bus gain instantly (bypass ramp — use for init).
  function set(name, val) {
    var b = _buses[name];
    if (!b) return;
    b.gain.setValueAtTime(val, _ctx_().currentTime);
  }

  // Fetch + decode a file. Cached by URL.
  // Returns a Promise<AudioBuffer>.
  // Falls back to null (rather than throwing) so callers can optionally
  // handle missing files without crashing.
  function load(url) {
    if (_cache[url]) return Promise.resolve(_cache[url]);
    return fetch(url)
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return r.arrayBuffer();
      })
      .then(function(ab) { return _ctx_().decodeAudioData(ab); })
      .then(function(buf) { _cache[url] = buf; return buf; });
  }

  // Play a buffer as a one-shot on the named bus.
  function play(buf, busName) {
    if (!buf) return;
    try {
      var ctx = _ctx_();
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(_buses[busName] || ctx.destination);
      src.start(0);
    } catch(e) {}
  }

  // Start a buffer as a looping source on the named bus.
  // Returns the BufferSourceNode (call .stop() to stop it).
  function loop(buf, busName, startOffset) {
    if (!buf) return null;
    try {
      var ctx = _ctx_();
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(_buses[busName] || ctx.destination);
      src.start(0, (startOffset != null) ? startOffset : 0);
      return src;
    } catch(e) { return null; }
  }

  // Direct context access for protocol-common.js compatibility.
  function ctx() { return _ctx_(); }

  return { resume: resume, bus: bus, ramp: ramp, set: set, load: load, play: play, loop: loop, ctx: ctx };
})();
