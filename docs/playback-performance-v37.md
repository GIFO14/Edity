# Playback performance on the AI Code Review project

Build `playback-performance-v37`, based on delivered `timeline-width-v36`.

## Measured cause

The timeline subscribed to playback time, and its parent player also updated its clock regularly. Every update rerendered the timeline and generated 600 SVG waveform bars per visible fragment, including fragments less than a few pixels wide. In the real project, waveform calculations were the largest sampled JavaScript cost. Repeated allocations also increased garbage collection and delayed video presentation.

## Fix

- The moving playhead is a separate subscribed component. The memoized timeline does not rebuild all its clips when playback time changes.
- Waveforms are memoized, with cached SVG path construction and gain calculations. They still update for trimming, scrolling, zoom, gain, fades, source changes and asset preparation.
- Sampling density follows the fragment's displayed width, up to the previous 600-bar limit. Small fragments no longer contain hundreds of invisible bars.
- Selection, snap targets, pointer capture, edited-time seeking, keyboard seeking, B/V tools and expanded timeline behavior retain their existing contracts.

The compositor, frame provider, preview resolution, media assets, export engine and audio mixer are unchanged. Existing independent shader work in the repository is excluded from this package.

## Verification

Before/after profiling uses an isolated copy of the same 2,915-word, 31-element project and the same 14-second intro across A-roll and three B-roll decoders. Original media are referenced; original project metadata are not edited. A repeated measurement confirms the improvement. The comparison script asserts identical transcript/edit/composition data and improved presentation cadence for every observed decoder.

Native packaged regressions cover timeline edits, fades, gain, splits, undo/redo, continuous playhead dragging across removed sections, capture outside the ruler, playback resume, zoom auto-scroll, maximize/restore and preserved selection/scroll. Reports, comparison measurements and the delivered package hash are in `docs/media-implementation-evidence/playback-performance-v37.json`.
