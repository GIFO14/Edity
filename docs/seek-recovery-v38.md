# Transcript seek picture recovery

Build `seek-recovery-v38`, scoped over delivered `playback-performance-v37`.

## Fixed races

The previous player could leave audio at the requested position while retaining an old canvas image:

- A paused render awaited a precise RGBA frame (or another asynchronous resource) while holding the compositor's `busy` flag. Resuming playback did not cancel that render. A slow request therefore blocked subsequent video draws while the independent audio clock advanced.
- A media element's `currentTime` can already report the destination while its previous decoded picture remains available. The compositor could cache that draw as the final paused destination, then ignore the later `seeked` event.

Seeks and play/pause changes now cancel obsolete render work. Cancellation releases pending frame, font, image, decoder-load and native-seek waits; late results stay observed. Superseded decoders cannot change a newer decoder's playback state or metadata. Raw request cleanup only removes its own pending entry.

The player waits while the main video is seeking and invalidates its paused picture when `seeked` arrives. Paused color inspection still uses the precise color managed frame path. Audio clocks, cuts, media, resolution, shader code and export decoding are unchanged.

## Evidence

Hidden packaged verification uses an isolated snapshot of the user's AI Code Review project, including its original media, words, cuts, grades and layers. The baseline and candidate use the same snapshot.

- Seven paused transcript seeks across the project redraw after destination arrival.
- A deliberately delayed precise-frame response reproduces the baseline freeze: **0 new pictures in 1.5 seconds while audio advances**. The corrected build draws **43 pictures** during the same interval.
- A delayed native seek independently reproduces a premature paused draw in the baseline, with no redraw after `seeked`. The corrected build draws the destination after `seeked`.
- Repeated word jumps recover to the latest destination without an error. Source project metadata remain unchanged.
- Four focused tests cover cancelled decoder loads, obsolete native seeks, slow precise RGBA responses and late resource failures.
- The packaged scrub regression covers dragging across cuts, pointer capture and playback resume.
- Color rendering regression compares paused preview, playing preview, independent capture and an encoded MP4: the exposed test pixel is `[175,175,175,255]` in each. Neutral pixels, all nine controls, source scope, masks and color tags also pass. This run uses the rendering-only branch of the older color fixture; its legacy inspector selectors are outside this fix.

Report paths, presentation cadence measurements and the final package hash are recorded in `media-implementation-evidence/seek-recovery-v38.json`. The staged build excludes independent, unshipped shader changes in the repository. The desktop shortcut and CLI fallback select v38; an already running app keeps its current code until reopened.
