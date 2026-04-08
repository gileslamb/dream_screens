# Dream Screens — MVP Spec
## For: Simon Meek (pitch reference)
## Status: Working prototype built

---

## What this is

A browser-based immersive experience that blurs the line between album, graphic novel, and generative cinema. The music already exists. This is the wrapper that makes it something more.

**Core premise:** Near-future technology reconstructs human dreams from neural data. A company — DreamScreens — offers this as a service. The protagonist is trying to recover memories of his mother. Beneath the product surface, something is being taken, not given back.

---

## The experience structure (prototype v1)

The prototype runs in any browser, no install. Four stages, ~3–4 minutes:

**Stage 0 — Corporate Landing**
Arrives as a clean, cold technology company website. Plausible. Even aspirational. Button says "Begin reconstruction."

**Stage 1 — System Initialising**
WebGL visuals activate. Log lines appear — machine language, clinical timestamps. The system is reading you. Confidence: 61%.

**Stage 2 — Memory Fragment**
Visuals shift. The noise resolves toward something almost figurative. Text fragments surface — a train journey, a woman watching cables, a particular kind of grief. The machine is remembering imperfectly on your behalf.

**Stage 3 — Unease**
Redacted government text appears at the edge of frame. The memory is being archived. Consent was waived. The system is not reconstructing — it is extracting.

**Stage 4 — End State**
"Memory reconstruction incomplete. Dream fragment archived." A prompt to run again.

---

## Visual language

**Shader pipeline:** WebGL fragment shaders processing in real time
- Fractional Brownian Motion noise fields (layered, organic)
- Luma reveal — image emerges from noise as if developing
- Chroma drift / RGB split as corruption increases
- Film grain + VHS scan noise
- Vague figurative form emerges (train, motion, presence)

**Progression:** noise → signal → memory → corruption → residue

**Tone:** Memories emerging from corrupted signal. Not clean playback — AI reconstruction of something it barely saw.

---

## Technical stack (MVP)

Built with vanilla HTML + WebGL (no framework required). Can be opened directly in a browser.

For full development:
- **Three.js** or **React Three Fiber** — WebGL scene management
- **VideoTexture** — camcorder footage as shader input (train journey footage)
- **Web Audio API** — music sync tied to shader phase transitions
- **GLSL shaders** — all visual processing runs on GPU

Cursor-ready: the prototype is a single `index.html` file. Add video source and audio and it's a full demo.

---

## Content needed for v2 (next iteration)

- 1 music track (ambient, 3–4 min — existing album material)
- 1 video sequence (camcorder footage: train, window, liminal movement)
- 8–12 curated text fragments (from Substack source material)
- 1 additional shader variant (for Stage 3 corruption phase)

---

## Scope of the full project

This prototype gestures toward a larger world:

| Format | What it could become |
|--------|---------------------|
| Web experience | Full multi-chapter experience with music, video, text |
| Live performance | Real-time generative visuals + modular synth, projection |
| Installation | Gallery loop, large-scale projection, dark room |
| Album release | Defined concept album with immersive digital component |
| Graphic novel | Static and animated visual narrative chapters |
| Film / TV | The DreamScreens company as narrative world |

The music exists. The visual language exists. The narrative exists. What's needed is a collaborator who understands how these things converge — across games, film, and music.

---

## The ask

An early-stage creative conversation about co-developing Dream Screens from prototype toward a fully realised cross-format project. Open to: production partnership, label interest, installation commission, or development funding conversation.

---

*Giles Lamb — gileslamb.com*
*Dream Screens // The Feedback Loop — Bandcamp*
