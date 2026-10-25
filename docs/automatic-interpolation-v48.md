# Automatic temporal interpolation in Edity v48

## Delivered workflow

The Windows desktop import dialog exposes **Millorar fluïdesa a 60 FPS**, enabled
by default for eligible 29.97/30 FPS recordings. It is a shared import preference:
manual imports and VideoAnalysisPlugin's `projects.create` use the same defaults.
`options.interpolate60:false` disables it for an import. Existing completed
projects are not reprocessed. Native 60 FPS and higher-rate sources are retained.

The actual integration is:

1. Probe streams, dimensions, duration and packet PTS. The dialog samples the
   first ten seconds; the managed worker checks all packet timestamps.
2. Fingerprint the untouched recording and interpolate a cached derivative.
3. Run existing silence removal on that derivative, preserving the 60 FPS timebase
   and original-to-processed microsecond map.
4. Import the prepared assets, select canvas FPS from their rates, and compose
   multiple clips at that rate. Reconciled transcripts retain source word IDs.
5. Sample preview, text/preset animation, review snapshots and export at canvas FPS.

The interpolation worker uses local FFmpeg:

```text
minterpolate=fps=60:mi_mode=mci:mc_mode=obmc:scd=fdiff:scd_threshold=10
```

Motion estimation runs on the CPU. NVENC only accelerates H.264 encoding
(`p5`, CQ 16); unavailable NVENC falls back to libx264 `veryfast`, CRF 16.
AAC-compatible audio is copied; unsupported MP4 audio is encoded as lossless ALAC.
The derivative is an 8-bit SDR YUV420 H.264 editing copy, not a lossless archive.
Original files remain the archive. No RIFE/model download/cloud service is added.

## Reliability and contracts

The cache is keyed by full original SHA-256, filter, encoder policy and version.
OS-owned per-key locks prevent concurrent duplicate conversions. Partial MP4 files
are never accepted as completed results. Resolution, duration, CFR, FPS and packet
count are validated before atomic publication with completion metadata. Cache
lookup validates output size and modification time. Derivatives live separately
from the ordinary asset cache's eviction tree; projects import their own asset
copy. The interpolation cache currently has no automatic size quota.

The normal owned-worker cancellation kills the Python/FFmpeg process tree.
Interrupted imports keep `processing.nextIndex`; retry reuses validated completed
derivatives. A failed import also offers **Continue without interpolation**.

The bridge additions are additive: `capabilities.interpolation`,
`defaults.processing.interpolate60`, `projects.create.options.interpolate60`, its
`processingOptions.interpolate60` response, and `clips[].interpolation` provenance.
The validated, revisioned `canvas` operation is undoable. The importer applies it
automatically; changing only an old project's canvas cannot interpolate its media.
Review snapshots still gate external exports and retain the exact canvas FPS.
The VideoAnalysisPlugin editing guide documents these contracts; its generic
bridge transport needs no new method or schema. Backend workflow version is 30.

## Export and deployment

1080p MP4 projects at 30 or 60 FPS can use the existing resource-gated native GPU
export. AVC uses level 4.0 at 30 FPS and 4.2 at 60 FPS. Unsupported native encoding
retries the compatible renderer. Both adapters account for the half-microsecond
quantization of timeline times when selecting frames: truncating a rounded time
such as 283333 microseconds previously repeated frame 16 instead of selecting 17
at 60 FPS. The new fixture verifies actual exported pictures, not just FPS tags.

The scoped Windows build overlays the delivered v47/Electron 43.8.3 baseline via
`scripts/stage-interpolation-build.cjs`. It preserves the delivered video shaders
and compositor, adds native AVC level selection, and patches compatible decoding
frame selection without pulling unrelated historical graphics changes into the
application. Output: `dist/app/interpolation-v48/win-unpacked/Edity.exe`.

Main implementation files:

- Backend: `services/frame_interpolation.py`, `job_worker.py`, `routers/media.py`,
  `services/preview.py`, `services/timeline.py`, `services/media_actions.py`.
- Electron: `processing-jobs.js`, `project-defaults.js`, `project-store.js`,
  `media-capabilities.js`, `external-agent-tools.js`, `export-acceleration.js`,
  `gpu-render-pipeline.js`, `media-render-pipeline.js`, `source-frame-time.js`, `python-bridge.js`.
- Frontend: `WorkspaceShell.tsx`, `CompositionPlayer.tsx`, `JobsPanel.tsx`,
  composition types/operations, project/default types and native encoder.
- Generated composition runtime and operation/transaction/action schemas;
  `docs/external-agent-bridge.md`; VideoAnalysisPlugin's editing guide.

## Windows verification

Hardware: Windows 11, Ryzen 7 5800X (8 cores / 16 threads), RTX 4070.
All media and projects used for QA are isolated under
`D:/Edity-media-verification`; no user recording or completed project was modified.

`scripts/verify-frame-interpolation.py` generates a real 1080p/30 screen recording
with 16 px Consolas text, a moving window, scrolling code, a cursor, a simulated
short repeated-frame stall, a legitimate static interval, a scene cut and audio.
It verifies:

- 90 source frames become 180 CFR frames over the same 3 seconds.
- New midpoint window positions lie strictly between adjacent original positions.
- Decoded audio PCM is byte-identical before/after interpolation for the AAC fixture.
- The scene cut has no blended cross-scene background; static and repeated frames
  remain in place. Neither is deleted as supposed missing motion.
- Native 60/120 sources are unchanged; a genuinely irregular VFR source becomes
  60 FPS CFR with its duration retained.
- Real silence removal retains 60 FPS and a two-segment source map (3.0 to 2.4 s).
- A mixed timeline and a 480p preview retain 60 FPS.
- Exported midpoint pictures match the prepared derivative to less than one pixel
  of window-centre measurement, catching accidental frame duplication.

`scripts/run-interpolation-verification.ps1` runs the packaged executable against
a private backend, project root and bridge. `electron/interpolation-verification.js`
checks the real import checkbox/default persistence, external reviewed import,
cancel/retry, cached mixed imports, stable word IDs, a locked narration cut,
undo/redo, native painted 60 FPS preview, 1080p60/30 exports, and a separate 60 FPS
compatible export under a simulated low-memory resource gate. The synthetic tone
fixture uses explicit cut boundaries rather than asking a speech model to align
invented words against a sine wave. Real silence processing is tested separately.

Unit/regression checks: 26 Node tests, 9 Python tests and strict TypeScript compile.
They include encoder failure/fallback, no partial publication, default migration,
schema validation, history, existing projects, proxies and frame selection.

Measured on the short fixture, CPU MCI + NVENC takes about **39–43 seconds for
3 seconds of 1080p footage**. Cache reuse takes about **0.16 seconds**. A measured
native 1080p60 export of the 3.3-second edited fixture takes **6.29 seconds**;
the 3-second 1080p30 control takes **2.94 seconds**. Startup dominates these very
short exports; these are not throughput claims for a long recording. Detailed
release measurements and evidence are recorded in `qa/interpolation-v48.json`.

## Limits

This is reliable cadence conversion, not recovery of unavailable original motion.
`freezedetect` reports ambiguous static/freeze intervals for diagnosis; it cannot
reliably distinguish an OBS stall from intentional stillness. No frames are
removed or advanced freeze reconstruction claimed. RIFE/CUDA remains future work
requiring its own screen-text quality and speed comparison.

MCI can produce warping or ghosting around scrolling small text, cursors,
occlusions and fast motion. Scene detection reduces cross-shot interpolation,
but is a heuristic. The visual comparison includes these limitations; interpolation
does not guarantee perfect reconstruction. Native 60 FPS remains preferable when
recording cost permits it. This implementation targets the requested SDR OBS
workflow; HDR/high-bit-depth color preservation is not validated.

Import can take considerably longer than the recording. The UI remains responsive,
shows a managed job, and offers cancellation/opt-out. A long 17–20 minute recording
has not been benchmarked for this interpolation feature.
