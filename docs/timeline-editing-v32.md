# Timeline: gain, razor and fade appearance

Delivered over the verified `fade-appearance-v31` stage, itself based on `timeline-workspace-v30`.

## Controls

- **V / selection button:** move and trim media elements.
- **B / scissors button:** click a clip to divide it at the nearest canvas frame. Each media half has its own placement, volume and trim controls. Cuts create one undo step.
- Drag the thin horizontal **volume line** vertically. Up increases gain; down reduces it. Shift changes sensitivity from 0.5 to 0.1 dB per pixel. The toolbar displays the current value. Escape cancels; a double click resets to 0 dB. Focused volume lines also support arrow keys (1 dB, or 0.1 with Shift) and Home (0 dB).
- Volume lines appear on media with audio, including video overlays. Images and text have no audio to adjust.
- The base video stays locked against movement and trimming. Its line controls the existing **voice bus**, applying to all base narration. Splitting the base stores an exact source partition in the narration arrangement, shows the new boundary and preserves it in Resolve timeline exports.
- Ctrl+Z and Ctrl+Shift+Z undo and redo these edits.

Audio clips are muted green. White round fade handles sit below the filename; the fade is a thin white curve with a dark shaded region. Exact fade knees are included in the drawing even when the fade is very short relative to its clip.

## Content continuity

`Element.contentWindow` retains the original content clock after splitting, so source frames, looping media and preset animations continue without restarting. `AudioSettings.envelopeWindow` retains the original fade clock; compiled entries carry separate source and envelope phases. Native audio and export share that compiled plan.

Manually split elements are pinned to timeline ranges. Disjoint speech spans retain their gaps using optional timeline placement `ranges`; no foreign speech is filled in. A subsequent manual fade adjustment creates a local fade for that half. Gains are independent and existing mute/ducking settings are retained.

Schema additions are optional and accept existing project files. The packaged backend workflow version is **27** so an older backend cannot process the new envelope contract. No real project is modified by validation, and the user's running app is not restarted.

## Verification

- TypeScript and Vite production build.
- Node tests for gain math, split and repeated-split continuity, source frames and animation transforms, disjoint spans, narration coverage, drag/trim, shared runtime and Resolve export.
- Python tests for multiband stereo gain, preview/export parity and byte-identical rendered audio when splitting through overlapping fades and a loop.
- Hidden packaged Electron tests use actual mouse and keyboard input for fades, gain, Escape, B/V, music/video/text/base splitting, moving and adjusting the resulting halves, atomic history and reload persistence. They compare the rendered audio before and after the music split byte for byte.

Executable: `dist/app/timeline-editing-v32/win-unpacked/Edity.exe`.
Evidence: `docs/media-implementation-evidence/timeline-editing-v32.json`.
