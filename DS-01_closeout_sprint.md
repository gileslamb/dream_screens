# DS-01 Signal Dreams — Closeout Sprint

**Last updated:** 2026-05-04 (session 3 complete)
**Status:** First export complete (720p ProRes 422 HQ, 9.5 GB). Edit-ready. 4K resolution fight parked for next session.
**Repo:** `gileslamb/signal-dreams-td`
**File:** `DS01_Signal Dreams.toe`
**Runtime:** 7:21 (441s)

---

## Sprint goal

Take DS-01 from current TD build to first fully locked protocol dream experience embedded in the Dream Screens site. After this lands, the same pattern repeats for DS-02 Feedback Memory.

---

## Current TD state

- 60-panel instanced tunnel
- Data storm GLSL v7, hard-killed to absolute zero from 3:00 onwards
- Linea PNG additive layer, track-gated blend 0.24 → 0.75
- Camera orbit with stronger P1 sweep + perspective lift
- Tunnel rotation 1:00→5:00 (7°/sec, ~5 revolutions, settles 5:00–5:30)
- `face_on_lag` → `master_blend1` → `master_out`
- Network cleaned: 123 nodes → 104 nodes
- Working file 720p preview, exports work at preview resolution

**Live signal path (verified intact):**
```
master_out (null)
  ← master_blend1 (cross)
       in0: master_blend (cross)
              in0: data_storm_fade (level) ← data_storm GLSL ← audio_source
              in1: chamber_layer GLSL
       in1: panel_system_out ← Panel_System_3_1
```

---

## Phase 1 — TD closeout

### 1.1 Storm absolute kill — DONE

`data_storm_fade.opacity` expression-driven:
```python
max(0.0, min(1.0, 1.0 - (op('/project1/phase_gating/timeline_sec')['timer_seconds'] - 178.0) / 2.0))
```
Curve: 1.0 until 178s → 2-second crossfade → 0.0 from 180s through to end.

### 1.2 Node audit + cleanup — DONE

**Removed (19 nodes):** chamber_layer_pixel1 (duplicate); token cluster; memory_layer baseCOMP and all internals.

**Retained:** chamber_layer + chamber_layer_pixel/compute/info (active in master_blend, NOT orphans); r_channel_view; chamber_debug.

### 1.3 Camera P1 perspective lift — DONE

Bumped Phase 1 weighting on orbit LFOs to give an early glimpse of channel perspective:
- `orbit_lfo_x.amp` P1: 0.30 → 0.55
- `orbit_lfo_y.amp` P1: 0.30 → 0.55
- `orbit_lfo_x2.amp` P1: 0.30 → 0.55
- `orbit_lfo_y.offset` P1: 0.00 → 0.40 (vertical lift driving rx pitch)

### 1.4 Tunnel rotation system — DONE

New nodes: `/project1/phase_gating/tunnel_rate` (constantCHOP) → `tunnel_rot` (speedCHOP) → drives `rz` on `geo1`, `geo_frost`, `geo_frost2`.

- 0:00–1:00 — static (rate = 0)
- 1:00 — rotation kicks in over 0.5s to 7°/sec
- 1:00–5:00 — constant 7°/sec (~5 full revolutions)
- 5:00–5:30 — ramps to 0
- 5:30 onwards — held position (~1782°)
- Deterministic via `resetonstart=True` on speedCHOP — every render from t=0 is identical

### 1.5 More camera variation — DONE

To break "stuck in one view" feeling:
- LFO amplitudes bumped: x 0.5→0.65, y 0.3→0.45, x2 0.8→1.0
- LFO phases offset: x=0, y=0.33, x2=0.66 (so peaks never align the same way twice)
- `face_on_lag.lag1` 4.0→2.5, `lag2` 2.0→1.25 (sharper response)

### 1.6 Video file swap — DONE

`video_seq.file` swapped from `White Matter.mp4` to `White Matter edit.mp4` (Giles edited out unwanted text in opening frames). Banana.tif fallback expression cleared.

### 1.7 Gaussian inf bug — DONE

**Root cause of intermittent navy/red checker artifacts at 2:09 and 4:51.**

The `gaussian_pulse(t, 210.0, 6.0)` function in `phase_script_callbacks` was producing subnormal floats (~2.88e-312) at extreme distances from the center. CHOP storage was flipping these to `inf` due to denormal-flush behaviour. Inside the chamber_layer GLSL shader, `inf` propagated through `smoothstep(0.03, 0.30, u_shift330)` clamping to 1.0, falsely triggering the chamber emergence when it should have been off, and exposing the unwired `sTD2DInputs[0]` lookup which renders TD's debug checkerboard.

**Fix:** clamped `gaussian_pulse` to return `0.0` when `|d| > 6.0`:
```python
def gaussian_pulse(t, center, width):
    if width <= 0: return 0.0
    d = (t - center) / width
    if abs(d) > 6.0:
        return 0.0
    return math.exp(-d * d * 4.0)
```

This also fixes the same underflow risk in `memory_surface` channel which uses the same function.

### 1.8 First export — DONE

**File:** `DS01_signal Dreams V1.mov`
**Location:** `/Volumes/GL Drive/PROJECTS/ACTIVE PROJECTS/Dreamscreens/Touch Designer/DS01_Signal Dreams/exports/`
**Codec:** Apple ProRes 422 HQ
**Format:** YUV 4:2:2 10-bit
**Resolution:** 1280×720 (intended 4K — see issues below)
**FPS:** 60
**Size:** ~9.5 GB
**Duration:** 7:21
**Audio:** None (separate edit pass)
**Plays correctly:** Yes — full visual content present, no checker artifacts, smooth motion

**Method:** TD's File → Export Movie dialog with TOP Video field set to `/project1/master_out`.

---

## Known issues / parked

### Resolution stuck at 720p

Render TOPs (`render1`, `render_frost`, `render_video`) and source GLSL TOPs (`data_storm`, `chamber_layer`) had `resolutionw/h` set to 3840×2160 with `resmult=False`, but cooked output remained at 1280×720. Suggests there's a project-wide resolution multiplier or Performance Mode setting overriding per-TOP resolutions. Needs investigation in a fresh sprint with a clear head — not blocking edit work.

### chamber_layer compile error message

`chamber_layer_info` DAT reports a compile error referencing undeclared `sTD2DInputs` identifier on line 77 of the pixel shader. **However the shader visibly renders correctly** in the viewer and in exports. Either:
- The error is stale (info DAT not updating) and TD has cached a working compilation
- The error is real but the rendered output uses a different code path that doesn't hit line 77

Not actively breaking anything. Worth a proper look but parked — fixing it risks introducing a new break.

### Render_export TOP

`/project1/render_export` (moviefileoutTOP) was created during the session as part of failed render attempts. Currently configured for 4K ProRes 4444 but unused. Can be left for next session or destroyed cleanly. Doesn't affect anything when `record=False`.

---

## Phase 2 — Editing pass

### 2.1 Picture edit
Three takes recommended (different camera generative variations) → cut between → trim ends lightly, mostly keep as is. **First take in hand: V1.mov (720p).**

### 2.2 Soundtrack pass — mix to picture
- SFX: foley, movement sounds
- Binaural / spatial — ambisonics
- Muffled lab voices + beeps at the start
- Soft top detail throughout
- Mix to picture

### 2.3 Site integration
- New MP3 soundtrack into the WebGL site, replacing current DS-01 audio
- Wrap protocol with corporate / business / organism intro + outro framing (already built)
- Digital readout overlays at key tunnel shift moments
  - "Data logs"
  - "Locking into consciousness"
  - Synced to perspective shifts + speed changes

---

## Promotion strategy (decided this session)

**Approach: LinkedIn teaser → DM-for-password.**

- Short teaser post (15-30s strongest visual moment, no audio reveal)
- "Dream Screens — Act I preview live for select viewers, DM for access"
- Personalised reply to each DM with password
- Cap viewers ("first 50") to protect preview-not-launch framing
- "What to expect" line in DM reply: full screen, headphones, 7:21, Act I only, more September
- Berlin/Pictoplasma contacts get same gate for coherence
- One or two named first viewers lined up before posting for visible engagement
- **Avoid:** posting full 7:21 anywhere outside the site; YouTube the full piece (undercuts site as destination); calling it a launch
- **Funding angle:** the gated preview gives funders a concrete artefact to engage with for Creative Scotland / Cryptic / PRS conversations

---

## Definition of done — DS-01

- [x] Storm absolute zero from 3:00 to end
- [x] All flagged orphaned nodes removed
- [x] Camera P1 perspective lift
- [x] Tunnel rotation system
- [x] Camera variation pass
- [x] Video file swap (White Matter edit.mp4)
- [x] Banana fallback removed
- [x] Gaussian inf bug fixed
- [x] First export complete (720p ProRes 422 HQ — usable for edit, 4K parked)
- [ ] Two more exports (different camera takes)
- [ ] Picture edit locked
- [ ] Ambisonic + SFX mix locked, bounced to MP3
- [ ] MP3 deployed to R2, wired into protocol player
- [ ] Intro / outro framing live
- [ ] Digital readout overlays synced to picture
- [x] Protocol experience accessible via `/protocols/ds-01.html`
- [x] HLS video wired (Cloudflare Stream), organism shader ported, neural loader, start gate, 9 time-keyed data overlays
- [x] Audio continuum: menu music crossfades into protocol ambient layer, fades out at video start, fades back in at completion
- [x] Return to archive — music resumes, entry screen skipped
- [x] Shared foundation committed (`protocol-common.css` + `protocol-common.js`) for DS-02→DS-16
- [x] Tested end-to-end through gate → loader → protocol → return
- [ ] **Audio FX for UI** — glitch-in/out sound design for data overlay text events and phase transitions (organism pulse beat, text glitch, video crossfade, completion sequence)

---

## Next — DS-02 Feedback Memory

Begins after DS-01 lock. Stockpiled ideas to be pulled in. Likely home for AI generative integration.

---

## Session log

### 2026-04-28 — sprint planning (session 1)
Plan agreed: TD closeout → edit → site integration → DS-01 locked → DS-02. Project markdown workflow adopted in place of Miro text blocks.

### 2026-04-28 — TD network cleanup + storm kill (session 2 part 1)
Working file confirmed `DS01_Signal Dreams.toe`. Audited orphans, confirmed `chamber_layer_pixel/compute/info` are LIVE shader bindings (not orphans). Storm absolute kill via `data_storm_fade.opacity` expression. 19 orphan nodes destroyed. 0 errors post-cleanup. Visual verification: storm kill timing "great". Motion slowdown into end already working naturally via existing phase_out weighting — no extra change needed.

### 2026-04-28 — Camera, rotation, video, bug hunt, first export (session 2 part 2)
Camera P1 perspective lift applied (stronger amplitudes + vertical offset). Full tunnel rotation system built (constantCHOP → speedCHOP → 3 geos). Speed adjusted via two iterations: 2.5 → 3.5 → 7.0 deg/sec on user direction. Camera variation pass: amplitudes bumped, LFO phases offset, lag reduced. Video file swapped to edited version. Banana.tif fallback expression cleared. Gaussian inf bug discovered via live pixel sampling at paused frame — clamped function to prevent subnormal underflow, fixed 2:09 / 4:51 navy-red checker artifacts. First export attempted multiple times: initially landed black due to missing TOP Video field in Export Movie dialog. After supplying `/project1/master_out` as source, clean 9.5 GB ProRes 422 HQ export of full 7:21 produced. Resolution stuck at 720p despite per-TOP 4K settings — investigation parked for next session. **First take in hand and edit-ready.**

### Operational notes for future sessions

**MCP / Python script gotchas (re-confirmed):**
- `print()` does not return through MCP — use `result = ...` at end of script
- `ParMode` not in scope — get enum via `type(par.mode).EXPRESSION`
- Setting `par.expr` does not auto-switch mode to expression — must set mode explicitly
- Invalid expressions leave param in error state, blocking further script access — test accessor standalone before assigning
- `findChildren()` count returned `0` post-deletion in same script — use `get_td_nodes` MCP tool for reliable count
- TD class refs (e.g. `constantCHOP`) not in script scope — get via `type(existing_node)` from any existing node of the same type

**Export Movie dialog gotchas:**
- The dialog's TOP Video field is **independent** of any moviefileoutTOP. Must be filled in directly with source TOP path or export will be black.
- Dialog's resolution field is **not** an absolute target — it reads source TOP's cooked size and resamples if mismatched. To get true 4K export, the **source chain must cook at 4K**, not just the dialog config.
- Audio Codec field is moot when CHOP Audio is empty — won't actually embed audio.

**Resolution chain mystery:**
- Setting `resolutionw=3840, resolutionh=2160, resmult=False` on render TOPs and GLSL TOPs did NOT change cooked output from 1280×720
- `n.width` / `n.height` continued reporting 720p even after force-cook
- Suspect global Performance Mode or project-level resolution scale overriding per-TOP settings
- Investigate: `Edit > Preferences > Render` settings; perform window resolution; any /local/perform settings

**Diagnostic principles learned:**
- When `info` DAT errors contradict visible behaviour, **trust the eyes over the diagnostic**. The pixels are the truth.
- Live pixel sampling with `n.sample(x, y)` on multiple positions is fast and decisive for bug identification (single-pixel center samples can mislead)
- For shader bugs: pause on the bad frame, sample the suspected output, compare with what the math says it should be
- For underflow / inf bugs: check CHOP channel evaluation directly via `op[chan].eval()` and compare with manual computation
- When in doubt, do not save — rolling back is cheaper than chasing cascading fixes

**Timing reference points:**
- Canonical timeline source: `op('/project1/phase_gating/timeline_sec')['timer_seconds']`
- This reads `me.time.seconds` which resolves to **`/local/time.seconds`** (project-level timeCOMP)
- The `/project1/timer` timerCHOP is NOT the canonical timeline source — it's separate
- `/local/time.length = 441.0`
- Phase boundaries: P1 0:00–1:00, P2 1:00–2:30, P3 2:30–4:18, P4 4:18–6:15, P5 6:15–7:21
- Sub-events: shift_330 @ 3:30 (gaussian width 6s, now clamped at |d|>6), intensity_518 ramp 4:18→5:30, dissolve_615 ramp 6:15→7:21, memory_surface gaussian peaks at 3:30/4:10/4:50/5:20

### 2026-05-04 — DS-01 protocol experience built and shipped (session 3)

Full protocol experience at `/protocols/ds-01.html` built and pushed to `gileslamb/dream_screens`:

- **Phase 1 (intro):** organism shader active, 5-line glitch text sequence (0→6s), organism pulses on each beat, settle parameter animates from dispersed → calm
- **Phase 2 (video):** HLS stream (Cloudflare Stream) with hls.js + native Safari fallback. Autoplay locked via start-gate user-gesture unlock pattern (`vid.play().then(pause)` on gate click, then real play() later — browser remembers the permission). Organism overlaps video fade-in (2.5s crossfade, organism visible through semi-transparent video). 9 time-keyed data overlays synced to `video.currentTime` (rAF loop, not clock), each glitch-in 200ms, hold 4s, glitch-out 200ms
- **Phase 3 (completion):** video ends → fade to black → organism re-emerges, 3 completion lines glitch in, "Return to Archive" link fades at 7s
- **Audio continuum:** menu music stored to `sessionStorage` on DS-01 click in archive; `startAmbientAudio()` picks it up on ds-01.html load and plays through loader/gate/intro; `fadeAmbientTo(0)` crossfades it out as video starts; `fadeAmbientTo(0.5)` brings it back during Phase 3; `dsReturn` flag in sessionStorage skips entry screen and resumes music on return to index.html
- **Shared layer:** `protocol-common.css` + `protocol-common.js` extract organism, neural loader, cursor, session ID, ambient audio — DS-02 through DS-16 inherit these

**Next: Audio FX for UI** — synthesised sound design for glitch text events, organism pulse beats, phase transitions, data overlay triggers, video crossfade.

<!-- New session entries go here. Date-stamped, brief, what changed and what's next. -->
