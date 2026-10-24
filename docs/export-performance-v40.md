# Export performance and Windows job persistence

Build `export-performance-v40`, scoped over delivered `workspace-recovery-v39`.

## Evidence and causes

A previous real export recorded 23,073 frames with 1,264 seconds waiting for decoding, 1,582 seconds in render transport (including GPU work/readback) and 89 seconds feeding the encoder. This agrees with the reported very long exports. These are accumulated timings, not a new full-video benchmark.

The old transport sent every source RGBA frame through the main process to the compositor, then returned each complete output through the main process to the encoder. Every frame also rewrote and broadcast the entire job, including its approximately 1.3 MB immutable project snapshot, even when its rounded progress percentage had not changed. Synchronous Windows file replacement could throw EPERM out of a progress callback.

## Changes

- A dedicated hidden export renderer owns native I/O and the shared GPU compositor in its isolated preload world. The page has no scripts or exposed Node/IPC API. Node integration remains disabled, context isolation is enabled, navigation and child windows are blocked. This trusted export preload is deliberately unsandboxed to run the private FFmpeg pipeline; ordinary editors retain their existing isolation settings.
- RGBA frames stay in the export process. The main process receives bounded progress and completion events. Encoding uses the existing codec, preset, CRF, resolution, frame rate, color tags and audio parameters.
- One-frame lookahead and asynchronous WebGL2 pixel-pack readback overlap decoding with GPU work. Parallel independent decoders and repeated-source sample sharing avoid redundant work, with bounded frame buffering.
- Graded high-frame-rate footage keeps the exact source sampling grid. Unneeded samples are dropped before stateless color conversion; any unexpected source-frame request restarts from the exact requested frame. Source-grid rounding and retained RGBA pixels have focused tests.
- Job progress is deduplicated. Atomic state replacement retries asynchronously when a destination is locked. A complete temporary snapshot remains recoverable; state revisions ensure a newer complete snapshot wins over an older running JSON file after restart.

The shipped compositor/shaders, legacy decoder contract, source media, timeline and audio processing are unchanged. Independent unshipped shader and source-clock work is excluded. An attempted optimization that skipped covered decoders was rejected because restarting them changed sampling at a boundary; it is absent from this build.

## Verification

An isolated immutable snapshot of the real project was exported at 1920×1080, 30 fps, H.264 CRF 18, with the same 24-second segment and original assets on both builds. Job persistence and progress broadcasts are included.

| Measurement | v39 baseline | v40 |
| --- | ---: | ---: |
| Wall time | 124.782 s | 24.285 s |
| Presented/exported frames | 720 | 720 |
| Full job notifications | 726 | 101 |
| Speed | 5.77 fps | 29.65 fps |

Measured speedup: **5.14×**. Both MP4s are **byte identical** (SHA256 `d6b4d87b363aea5cfb525794d55fe14ff573c34590e52f5c965ef88ada07773f`); independent FFmpeg decoding also confirms every one of the 720 frame hashes matches.

Additional gates: ten focused tests, including an actual Windows open-file lock producing EPERM, latest-state recovery and progress deduplication; strict TypeScript checking; packaged cancellation with no incomplete output; nine GPU color controls, source/mask scope, neutral identity, paused/playing preview versus capture and encoded MP4, and preserved color tags.

This is a real-project segment measurement, not a full 20-minute render or a guarantee of DaVinci Resolve's export speed. Studio Sound preparation and audio mixing remain separate unchanged stages. Evidence is in `media-implementation-evidence/export-performance-v40.json`.

The desktop shortcut and CLI fallback select v40. The running user application is not restarted; the new pipeline takes effect after reopening Edity.
