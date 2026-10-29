# Base transition playback (v52)

Base-to-base transitions replace the direct A-roll layer with two independent
source handles. The preview preloaded supplemental videos but never these two
base handles. During playback it waits at most 12 ms for each frame; a cold
decoder or seek could therefore supply two transparent pictures and turn the
whole preview black. Paused inspection waits for exact frames, explaining why
a still capture sometimes showed an otherwise missing animation.

The player now preloads both transition handles up to two seconds ahead. It
never pauses/preloads an already active transition. A direct playing seek uses
the valid main-video picture while its independent transition handles become
ready. Decoder availability requires a presented picture in the current seek
generation, and a new generation waits for an existing same-target seek rather
than mistaking currentTime for a completed decode. Starting a paused preloaded
decoder uses precise positioning instead of the running decoder drift tolerance.

The user's existing transition placements, effects and voice cuts were not
changed. The current project was read to confirm ten centered base-to-base
`Xir_Zoom_v4` transitions, including the reported cut near 3:25.

Validation:

- 17 Node tests passed: source handles, transition progress, frame selection,
  cancellation and same-target seek readiness. Strict frontend TypeScript passed.
- An isolated packaged Electron test played a long-GOP source with a two-second
  deletion, a centered zoom transition and 120 ms media-request latency. It
  sampled the actual rendered canvas during continuous playback and a direct
  playing seek. The unchanged v51 baseline showed 34 black samples; v52 showed
  zero, with 11 distinct transition pictures, both source colors and motion.
- Both real export adapters produced 8-second 1920x1080/60 MP4 files. Every one
  of the 480 decoded frames in each export was scanned independently with
  FFmpeg: no black pictures, 30 distinct transition pictures, correct source
  colors on both sides and matching clocks. The maximum per-frame mean RGB
  difference between encoders was 0.448/255. Native export used WebCodecs AVC.
- Export renderer/compositor/codec files are byte-identical to delivered v51;
  this fix changes preview preparation/readiness, not export quality settings.

Reproduce with `scripts/stage-base-transition-build.cjs --baseline` and the
same script without the flag for v52. Run
`scripts/run-base-transition-verification.ps1 -Root <new-private-directory>`
(add `-Baseline` for the control). It creates its own media, library, cache,
backend and hidden desktop, without opening user projects or using their
clipboard. Scan exports with `scripts/verify-base-transition-exports.py <root>`.

Executable: `dist/app/base-transitions-v52/win-unpacked/Edity.exe`.
It includes the v50 word-boundary repair and v51 timeline clipboard support.
