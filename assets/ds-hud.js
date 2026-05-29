/*
 * ds-hud.js — DreamScreen Corporation monitoring layer
 * Reusable across all protocol pages via a per-protocol CONFIG object.
 * Nothing protocol-specific hardcoded; all narrative content lives in the
 * CONFIG passed to DS_HUD.init().
 *
 * Usage:
 *   DS_HUD.init(CONFIG);          // call at script execution time
 *   DS_HUD.start(videoEl);        // call when film begins (Phase 2)
 *   DS_HUD.stop();                // cleanup on page unload / Phase 3
 *
 * CONFIG shape:
 * {
 *   id:    'DS-02',
 *   title: 'Feedback Memory',
 *   sub:   'REM cycle 2 · echo pattern analysis',
 *
 *   // Feed lines — fraction-timed off vid.duration
 *   feed: [ { frac, ts, level:'ok'|'warn'|'', text } ],
 *
 *   // Chart parameters
 *   charts: {
 *     signalOverlap: { peakFrac, peakValue, warnAt, accentAt },
 *     echoDuration:  { resolveFrac, text },
 *     feedbackLoop:  { stabiliseFrac },
 *   },
 *
 *   // SFX (wired in commit #3)
 *   sfx: { feedTick, uiTick, beds:[], bedVolume, sfxVolume },
 * }
 */

(function(global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────
  // Private state
  // ─────────────────────────────────────────────────────────────────
  let _cfg   = null;
  let _root  = null;   // #ds-hud element
  let _vid   = null;   // video element
  let _rafId = null;
  let _started = false;
  let _t0      = 0;    // wall-clock ms at hudStart

  // Feed state (populated in _buildFeed)
  let _feedEls   = [];
  let _feedFading = false;

  // Chart elements
  let _barCanvas  = null, _barCtx  = null;
  let _lissCanvas = null, _lissCtx = null;
  let _echoEl     = null;
  let _echoShown  = false;

  // Waveform strip
  let _stripCanvas = null, _stripCtx = null;
  let _stripSeed   = Math.random() * 1000;

  // Timer
  let _timerEl = null;

  // SFX — routes through DS_AUDIO (shared context in /assets/ds-audio.js)
  let _sfxBufs  = {};   // key → AudioBuffer (or pool sentinel)
  let _bedGains = [];   // HTMLAudio fallback nodes only
  let _sfxReady = false;

  // ─────────────────────────────────────────────────────────────────
  // Tiny utilities
  // ─────────────────────────────────────────────────────────────────
  function _pad2(n) { return String(Math.floor(n)).padStart(2, '0'); }
  function _fmtTime(s) { return _pad2(s / 60) + ':' + _pad2(s % 60); }
  function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Cheap smooth noise [0,1) — avoids Math.random() churn in rAF
  function _noisy(x, seed) {
    const v = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453;
    return v - Math.floor(v);
  }

  // ─────────────────────────────────────────────────────────────────
  // Glitch animations (parallel to ds-02.html's glitchIn/Out)
  // ─────────────────────────────────────────────────────────────────
  function _glitchIn(el) {
    el.style.opacity = '';
    el.classList.remove('hud-out');
    el.classList.add('hud-in');
    el.addEventListener('animationend', function() {
      el.style.opacity = '1';
    }, { once: true });
  }

  function _glitchOut(el, then) {
    el.style.opacity = '';
    el.classList.remove('hud-in');
    el.classList.add('hud-out');
    el.addEventListener('animationend', function() {
      el.style.opacity = '0';
      el.classList.remove('hud-out');
      if (then) then();
    }, { once: true });
  }

  // ─────────────────────────────────────────────────────────────────
  // DOM construction
  // ─────────────────────────────────────────────────────────────────
  function _buildDOM(cfg) {
    const root = document.createElement('div');
    root.id = 'ds-hud';

    // Corner brackets — the visible frame
    ['tl','tr','bl','br'].forEach(function(c) {
      const d = document.createElement('div');
      d.className = 'hud-bracket hud-bracket-' + c;
      root.appendChild(d);
    });

    // Top-left: protocol identity
    const tl = document.createElement('div');
    tl.className = 'hud-panel hud-panel-tl';
    tl.innerHTML =
      '<div class="hud-id">' + cfg.id + ' &middot; ' + cfg.title + '</div>'
    + '<div class="hud-subject">' + (cfg.sub || '') + '</div>'
    + '<div class="hud-mode">NEURAL BRIDGE &middot; ACTIVE</div>';
    root.appendChild(tl);

    // Top-right: status dot + live timer
    const tr = document.createElement('div');
    tr.className = 'hud-panel hud-panel-tr';
    tr.innerHTML =
      '<div class="hud-status"><span class="hud-dot"></span>&thinsp;MONITORING ACTIVE</div>'
    + '<div class="hud-timer" id="hud-timer">00:00</div>';
    root.appendChild(tr);

    // Bottom-left: feed (lines injected in _buildFeed)
    const bl = document.createElement('div');
    bl.className = 'hud-panel hud-panel-bl';
    bl.innerHTML =
      '<div class="hud-feed-label">SESSION LOG</div>'
    + '<div class="hud-feed" id="hud-feed"></div>';
    root.appendChild(bl);

    // Bottom-right: chart containers
    // Labels fall back to generic defaults if not set in cfg.charts.*.label
    var ch = cfg.charts || {};
    var bLabel = (ch.signalOverlap && ch.signalOverlap.label) || 'SIGNAL OVERLAP';
    var eLabel = (ch.echoDuration  && ch.echoDuration.label)  || 'ECHO DURATION';
    var lLabel = (ch.feedbackLoop  && ch.feedbackLoop.label)  || 'FEEDBACK LOOP';

    const br = document.createElement('div');
    br.className = 'hud-panel hud-panel-br';
    br.innerHTML =
      '<div class="hud-chart-group" id="hud-charts">'
    +   '<div class="hud-chart" id="hud-chart-bar">'
    +     '<div class="hud-chart-label">' + bLabel + '</div>'
    +     '<canvas id="hud-bar-canvas" width="180" height="4"></canvas>'
    +     '<div class="hud-chart-value" id="hud-bar-value">—</div>'
    +   '</div>'
    +   '<div class="hud-chart" id="hud-chart-echo">'
    +     '<div class="hud-chart-label">' + eLabel + '</div>'
    +     '<div class="hud-echo-display" id="hud-echo-display">— — —</div>'
    +   '</div>'
    +   '<div class="hud-chart" id="hud-chart-liss">'
    +     '<div class="hud-chart-label">' + lLabel + '</div>'
    +     '<canvas id="hud-liss-canvas" width="80" height="52"></canvas>'
    +   '</div>'
    + '</div>';
    root.appendChild(br);

    // Bottom waveform strip
    const strip = document.createElement('canvas');
    strip.id = 'hud-strip-canvas';
    strip.className = 'hud-strip-canvas';
    strip.height = 22;
    root.appendChild(strip);

    return root;
  }

  // ─────────────────────────────────────────────────────────────────
  // Feed construction
  // ─────────────────────────────────────────────────────────────────
  function _buildFeed(cfg) {
    const container = document.getElementById('hud-feed');
    if (!container || !cfg.feed) return;
    _feedEls = cfg.feed.map(function(line) {
      const el = document.createElement('div');
      el.className = 'hud-feed-line';
      const tsHtml   = '<span class="ts">[' + line.ts + ']</span>';
      const textHtml = line.level
        ? '<span class="' + line.level + '"> ' + line.text + '</span>'
        : '<span> ' + line.text + '</span>';
      el.innerHTML = tsHtml + textHtml;
      container.appendChild(el);
      return { el: el, frac: line.frac, shown: false, hiding: false };
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Chart: Signal Overlap bar
  // Climbs 0 → peakValue (%) over [0, peakFrac*dur], then holds.
  // Colour: ok (green) → warn (yellow) → accent (red) at thresholds.
  // ─────────────────────────────────────────────────────────────────
  function _drawBar(ct, dur, cfg) {
    if (!_barCanvas || !_barCtx || !cfg.charts) return;
    const c   = cfg.charts.signalOverlap;
    const ctx = _barCtx;
    const w   = _barCanvas.width;
    const h   = _barCanvas.height; // 4px

    // Progress 0→1 until peak, then locks
    const peakT  = c.peakFrac * dur;
    const rawPct = ct < peakT
      ? (ct / peakT) * c.peakValue
      : c.peakValue;
    const pct = _clamp(rawPct, 0, c.peakValue);

    ctx.clearRect(0, 0, w, h);

    // Background track
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(0, 0, w, h);

    // Filled bar — 1px vertical centred in the 4px canvas
    let col;
    if (pct >= c.accentAt) col = 'rgba(255,58,45,0.85)';
    else if (pct >= c.warnAt) col = 'rgba(255,204,68,0.75)';
    else col = 'rgba(0,255,136,0.7)';

    ctx.fillStyle = col;
    ctx.fillRect(0, 0, Math.round((pct / 100) * w), h);

    // Update numeric label
    const valEl = document.getElementById('hud-bar-value');
    if (valEl) {
      valEl.textContent = Math.round(pct) + '%';
      valEl.className = 'hud-chart-value'
        + (pct >= c.accentAt ? ' accent' : pct >= c.warnAt ? ' warn' : ' ok');
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Chart: Echo Duration
  // "— — —" until resolveFrac; then glitches in the text value.
  // ─────────────────────────────────────────────────────────────────
  function _updateEcho(ct, dur, cfg) {
    if (!_echoEl || !cfg.charts) return;
    const c = cfg.charts.echoDuration;
    if (!_echoShown && ct >= c.resolveFrac * dur) {
      _echoShown = true;
      _echoEl.textContent = c.text;
      _echoEl.classList.add('active');
      _playSfx('uiTick');
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Chart: Lissajous / Feedback Loop
  // Wanders (a=3,b=2) until stabiliseFrac, then morphs to circle (a=1,b=1).
  // Transition: 8s interpolation so the change reads as settling, not snap.
  // ─────────────────────────────────────────────────────────────────
  function _drawLissajous(ct, dur, cfg, wallT) {
    if (!_lissCanvas || !_lissCtx || !cfg.charts) return;
    const c   = cfg.charts.feedbackLoop;
    const ctx = _lissCtx;
    const w   = _lissCanvas.width, h = _lissCanvas.height;
    const cx  = w / 2, cy = h / 2;
    const rx  = cx * 0.8, ry = cy * 0.8;
    const TRANS_S = 8;

    const stabT = c.stabiliseFrac * dur;
    const tp = ct >= stabT ? _clamp((ct - stabT) / TRANS_S, 0, 1) : 0;
    // Ease the transition
    const tpE = tp * tp * (3 - 2 * tp);

    // Parameters interpolate: wandering Lissajous → stable circle
    const a     = 3 - 2 * tpE;                          // 3 → 1
    const b     = 2 - tpE;                              // 2 → 1
    const delta = (1 - tpE) * (wallT * 0.18) + tpE * (Math.PI / 2);

    // Colour: warn-ish → green as it stabilises
    const alpha = 0.28 + tpE * 0.38;
    const col   = tpE > 0.5
      ? 'rgba(0,255,136,' + alpha.toFixed(2) + ')'
      : 'rgba(255,204,68,' + (0.32 - tpE * 0.08).toFixed(2) + ')';

    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    for (var i = 0; i <= 400; i++) {
      var t = (i / 400) * Math.PI * 2;
      var x = cx + rx * Math.sin(a * t + delta);
      var y = cy + ry * Math.sin(b * t);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // ─────────────────────────────────────────────────────────────────
  // Waveform strip — continuously scrolling noise trace
  // Reads as ambient signal activity; no semantic content.
  // "Uncannily clean" — pure Perlin-like trig, never truly random.
  // ─────────────────────────────────────────────────────────────────
  function _drawStrip(wallT) {
    if (!_stripCanvas || !_stripCtx) return;
    const ctx = _stripCtx;
    const w   = _stripCanvas.width, h = _stripCanvas.height;
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);
    const mid = h * 0.55;
    const amp = h * 0.32;

    ctx.beginPath();
    for (var x = 0; x < w; x++) {
      var t = (x / w) * 10 + wallT * 0.38;
      var y = mid
        + amp * 0.55 * Math.sin(t * 2.1)
        + amp * 0.28 * Math.sin(t * 5.4 + 1.3)
        + amp * 0.17 * (_noisy(t * 0.75, _stripSeed) * 2 - 1);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(0,255,136,0.15)';
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  function _resizeStrip() {
    if (!_stripCanvas) return;
    _stripCanvas.width  = window.innerWidth;
    _stripCanvas.height = 22;
  }

  // ─────────────────────────────────────────────────────────────────
  // SFX — routes through DS_AUDIO (shared AudioContext, /assets/ds-audio.js).
  //
  // Root cause of previous silence: ds-hud.js was creating a SECOND
  // AudioContext outside the gate gesture handler. On iOS Safari, calling
  // .resume() asynchronously (9.6s after the gesture) is ignored — the
  // context stays suspended and src.start() queues silently. Fix: ONE
  // shared context, resumed synchronously in gate click via DS_AUDIO.resume().
  //
  // CORS: confirmed working — R2 returns Access-Control-Allow-Origin: *
  // on OPTIONS preflight and GET with Origin header. Files exist (200 OK).
  // HTMLAudio fallback kept for edge cases (extreme network failure, etc.)
  // ─────────────────────────────────────────────────────────────────
  function _initSfx(cfg) {
    if (!cfg.sfx) return;
    if (!window.DS_AUDIO) {
      console.warn('DS_HUD: ds-audio.js not loaded — SFX disabled');
      return;
    }
    var sfx = cfg.sfx;
    var sfxVol = sfx.sfxVolume != null ? sfx.sfxVolume : 0.22;

    // Create sfx bus on the shared context (idempotent)
    DS_AUDIO.bus('sfx', sfxVol);

    // One-shot buffers: feedTick (per-line tick), uiTick (chart events)
    // Beds are NOT managed here — they are managed at the protocol page level
    // by AUDIO_MODEL so timing is tied to the gate gesture and film start.
    ['feedTick', 'uiTick'].forEach(function(key) {
      var url = sfx[key];
      if (!url) return;
      DS_AUDIO.load(url)
        .then(function(buf) { _sfxBufs[key] = buf; })
        .catch(function() {
          // Last-resort HTMLAudio pool — 6 voices so rapid ticks don't cut
          var pool = [];
          for (var k = 0; k < 6; k++) {
            var a = new Audio(url);
            a.volume = sfxVol;
            pool.push(a);
          }
          _sfxBufs[key + '_pool'] = pool;
          _sfxBufs[key + '_pi']   = 0;
        });
    });

    _sfxReady = true;
  }

  // Throttle: feedTick fires at most once every 1.5s to prevent rapid-fire
  // if two feed lines trigger in quick succession.
  var _lastTickMs = 0;

  function _playSfx(key) {
    var buf = _sfxBufs[key];
    if (buf && window.DS_AUDIO) {
      if (key === 'feedTick') {
        var now = Date.now();
        if (now - _lastTickMs < 1500) return; // throttle
        _lastTickMs = now;
      }
      DS_AUDIO.play(buf, 'sfx');
      return;
    }
    // Pool fallback (only reached if DS_AUDIO unavailable or load failed)
    var pool = _sfxBufs[key + '_pool'];
    if (pool) {
      var pi = _sfxBufs[key + '_pi'] || 0;
      try { pool[pi].currentTime = 0; pool[pi].play(); } catch(e) {}
      _sfxBufs[key + '_pi'] = (pi + 1) % pool.length;
    }
  }

  function _fadeBeds(targetVol, timeConstant) {
    // Primary path: ramp the shared 'beds' bus via DS_AUDIO
    if (window.DS_AUDIO) {
      DS_AUDIO.ramp('beds', targetVol, timeConstant || 2.0);
    }
    // HTMLAudio fallback nodes (only populated if DS_AUDIO.load failed)
    _bedGains.forEach(function(g) {
      if (!g || !g._el) return;
      var a = g._el, start = a.volume, steps = 0, total = 20;
      var iv = setInterval(function() {
        steps++;
        a.volume = start + (targetVol - start) * (steps / total);
        if (steps >= total) clearInterval(iv);
      }, ((timeConstant || 2) * 1000) / total);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // rAF loop
  // ─────────────────────────────────────────────────────────────────
  function _loop() {
    var wallT = (Date.now() - _t0) / 1000;

    // Strip always runs
    _drawStrip(wallT);

    if (_vid && _cfg) {
      var dur = (_vid.duration && isFinite(_vid.duration)) ? _vid.duration : 342;
      var ct  = _vid.currentTime;

      // Timer
      if (_timerEl) {
        _timerEl.textContent = _fmtTime(ct);
        if (ct > 0.5 && !_timerEl.classList.contains('live')) {
          _timerEl.classList.add('live');
        }
      }

      // Feed lines
      if (!_feedFading) {
        _feedEls.forEach(function(o) {
          if (!o.shown && ct >= o.frac * dur) {
            o.shown = true;
            _glitchIn(o.el);
            _playSfx('feedTick');
            setTimeout(function() {
              if (!o.hiding) { o.hiding = true; _glitchOut(o.el); }
            }, 4200);
          }
        });
      }

      // Feed fades at dur-35 (matches organism ramp start)
      var endOrg = dur - 35;
      if (ct >= endOrg && !_feedFading) {
        _feedFading = true;
        var feedEl = document.getElementById('hud-feed');
        if (feedEl) { feedEl.style.transition = 'opacity 3s ease'; feedEl.style.opacity = '0'; }
      }

      // HUD dims at dur-15 (organism dominant)
      if (ct >= dur - 15 && _root && !_root.classList.contains('hud-dim')) {
        _root.classList.add('hud-dim');
        _fadeBeds(0, 2.0);
      }

      // Charts
      _drawBar(ct, dur, _cfg);
      _updateEcho(ct, dur, _cfg);
      _drawLissajous(ct, dur, _cfg, wallT);
    }

    _rafId = requestAnimationFrame(_loop);
  }

  // ─────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────
  var DS_HUD = {};

  DS_HUD.init = function(cfg) {
    _cfg  = cfg;
    _root = _buildDOM(cfg);
    document.body.appendChild(_root);

    _timerEl    = document.getElementById('hud-timer');
    _echoEl     = document.getElementById('hud-echo-display');
    _barCanvas  = document.getElementById('hud-bar-canvas');
    _lissCanvas = document.getElementById('hud-liss-canvas');
    _stripCanvas = document.getElementById('hud-strip-canvas');

    if (_barCanvas)   _barCtx   = _barCanvas.getContext('2d');
    if (_lissCanvas)  _lissCtx  = _lissCanvas.getContext('2d');
    if (_stripCanvas) {
      _stripCtx = _stripCanvas.getContext('2d');
      _resizeStrip();
      window.addEventListener('resize', _resizeStrip);
    }

    _buildFeed(cfg);
  };

  // start() is called when the film begins (Phase 2), AFTER the gate click
  // so AudioContext creation is safe.
  DS_HUD.start = function(videoEl) {
    if (_started) return;
    _started = true;
    _vid = videoEl;
    _t0  = Date.now();

    // Fade HUD in — next tick to allow CSS transition
    requestAnimationFrame(function() {
      if (_root) _root.classList.add('hud-vis');
    });

    // SFX init — AudioContext allowed because we're past the gate gesture
    _initSfx(_cfg);

    _loop();
  };

  DS_HUD.dim = function() {
    if (_root) _root.classList.add('hud-dim');
    _fadeBeds(0, 2.0);
  };

  DS_HUD.stop = function() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    _fadeBeds(0, 1.0);
    _vid = null; _started = false;
  };

  global.DS_HUD = DS_HUD;
})(window);
