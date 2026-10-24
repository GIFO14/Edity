# Native editor surface correction — v45

## Diagnosis

The desktop could retain the editor's live DOM and accessibility controls while Windows displayed only the shell. There was no corresponding renderer crash or native detach in the retained diagnostics. Treating this as a failed navigation or replacing the Reopen button did not address native painting.

Electron 33.4.11 contains the hidden-view throttling defect corrected in [Electron PR 52844](https://github.com/electron/electron/pull/52844), related to [issue 42378](https://github.com/electron/electron/issues/42378). Edity calls `setBackgroundThrottling(false)` during layout, including before attaching a loaded BrowserView. The framework must update the platform view, compositor and render host together.

The isolated native regression reproduced the missing display surface with the delivered runtime: the window remained visible, but `capturePage()` rejected with `Current display surface not available for capture`. The same test with Electron 43.8.3 produced the expected 300 × 200 red surface and visible document. Merely changing the throttling preference did not pass the probe, so that workaround was not shipped.

## Delivery

The application uses the official Electron 43.8.3 Windows x64 runtime, verified against its published SHA-256 checksum. Desktop and development dependencies select that version. The desktop shortcut and agent CLI select v45.

The v44 frontend, Python backend, compositor, export implementation, transcript and acoustic-gap fixes are preserved. The package comparison found 661 unchanged existing files; changed archive files are package metadata and two opt-in verification entry points. A native QA harness is added. There is no periodic editor reload, replacement, GPU-disable flag or change to the recovery placeholder.

## Verification

- Actual native paint surfaces checked after hidden tab switches, three minimize/restore cycles, resizing and split view.
- Playback advances in the real editor; all checks retain the same editor webContents, without Reopen or reload.
- A copy of the current 3,737-word project preserves its words, cut ranges and composition.
- A separate 14-second, 1080p GPU export with editable text and source grading contains all 420 frames. Comparison to v44: PSNR 61.94 dB, identical chroma and identical decoded audio PCM. This checks a representative export, not every possible project.
- Eight focused layout/export regression tests pass.
- A further native inactivity check waits 615 seconds without resizing or recapturing, then requires a nonblank native surface.

Exact package checksums, probe results, native verification and export measurements are recorded in `media-implementation-evidence/workspace-paint-v45.json`.
